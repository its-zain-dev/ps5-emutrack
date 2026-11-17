"""Build site/data.json from the curated registry plus live GitHub metadata.

Each repository costs two API calls (repo + releases). If a call fails, the
entry falls back to the previous published snapshot so one flaky request never
blanks out the site.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import registry, seo
from .github import GitHub, GitHubError

SITE = registry.ROOT / "site"
OUTPUT = SITE / "data.json"
PREVIOUS_URL = "https://its-zain-dev.github.io/ps5-emutrack/data.json"
NOTES_LIMIT = 6000
ASSET_LIMIT = 12
SCHEMA_VERSION = 2


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def shape_repo(raw: dict[str, Any]) -> dict[str, Any]:
    lic = raw.get("license") or {}
    return {
        "fullName": raw.get("full_name"),
        "description": (raw.get("description") or "").strip() or None,
        "homepage": raw.get("homepage") or None,
        "stars": int(raw.get("stargazers_count") or 0),
        "forks": int(raw.get("forks_count") or 0),
        "openIssues": int(raw.get("open_issues_count") or 0),
        "language": raw.get("language"),
        "license": lic.get("spdx_id") if lic.get("spdx_id") not in (None, "NOASSERTION") else None,
        "topics": raw.get("topics") or [],
        "createdAt": raw.get("created_at"),
        "pushedAt": raw.get("pushed_at"),
        "archived": bool(raw.get("archived")),
        "isFork": bool(raw.get("fork")),
        "parent": (raw.get("parent") or {}).get("full_name"),
    }


def pick_release(releases: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Newest published, non-draft release. Pre-releases count: most emulators only ship nightlies."""
    published = [r for r in releases if not r.get("draft") and r.get("published_at")]
    if not published:
        return None
    published.sort(key=lambda r: r["published_at"], reverse=True)
    return published[0]


def shape_release(raw: dict[str, Any]) -> dict[str, Any]:
    notes = (raw.get("body") or "").replace("\r\n", "\n").strip()
    truncated = len(notes) > NOTES_LIMIT
    assets = [
        {
            "name": a.get("name"),
            "size": int(a.get("size") or 0),
            "downloads": int(a.get("download_count") or 0),
            "url": a.get("browser_download_url"),
        }
        for a in raw.get("assets") or []
        if str(a.get("browser_download_url", "")).startswith("https://github.com/")
    ]
    return {
        "tag": raw.get("tag_name"),
        "name": (raw.get("name") or "").strip() or raw.get("tag_name"),
        "publishedAt": raw.get("published_at"),
        "prerelease": bool(raw.get("prerelease")),
        "url": raw.get("html_url"),
        "notes": notes[:NOTES_LIMIT] + ("\n\n…" if truncated else ""),
        "notesTruncated": truncated,
        "assets": assets[:ASSET_LIMIT],
        "assetCount": len(assets),
    }


def shape_history(releases: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    published = [r for r in releases if not r.get("draft") and r.get("published_at")]
    published.sort(key=lambda r: r["published_at"], reverse=True)
    return [
        {
            "tag": r.get("tag_name"),
            "name": (r.get("name") or "").strip() or r.get("tag_name"),
            "publishedAt": r.get("published_at"),
            "prerelease": bool(r.get("prerelease")),
            "url": r.get("html_url"),
        }
        for r in published[:limit]
    ]


def fetch_one(gh: GitHub, emu: dict[str, Any]) -> dict[str, Any]:
    repo = emu["repo"]
    result: dict[str, Any] = {"status": "ok"}
    try:
        result["github"] = shape_repo(gh.get(f"/repos/{repo}"))
    except GitHubError as exc:
        result["status"] = "missing" if exc.status == 404 else "error"
        result["error"] = str(exc)
        return result
    except Exception as exc:  # network failure etc.
        result["status"] = "error"
        result["error"] = str(exc)
        return result
    try:
        releases = gh.get(f"/repos/{repo}/releases?per_page=10") or []
        rel = pick_release(releases)
        result["release"] = shape_release(rel) if rel else None
        result["releaseHistory"] = shape_history(releases)
    except Exception as exc:
        result["status"] = "partial"
        result["error"] = str(exc)
    return result


def load_previous(source: str | None) -> dict[str, dict[str, Any]]:
    """Previous snapshot keyed by emulator id, from a local path or URL."""
    if not source:
        return {}
    try:
        if source.startswith("https://"):
            req = urllib.request.Request(source, headers={"User-Agent": "ps5-emutrack"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read())
        else:
            payload = json.loads(Path(source).read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[warn] previous snapshot unavailable ({exc})", file=sys.stderr)
        return {}
    if payload.get("schemaVersion") != SCHEMA_VERSION:
        return {}
    return {e["id"]: e for e in payload.get("emulators", []) if "id" in e}


def build(
    reg: registry.Registry,
    gh: GitHub,
    previous: dict[str, dict[str, Any]],
    workers: int = 8,
) -> dict[str, Any]:
    with ThreadPoolExecutor(max_workers=workers) as pool:
        fetched = list(pool.map(lambda e: fetch_one(gh, e), reg.emulators))

    emulators = []
    counts = {"ok": 0, "stale": 0, "missing": 0}
    for emu, live in zip(reg.emulators, fetched):
        entry = {k: v for k, v in emu.items()}
        entry["url"] = f"https://github.com/{emu['repo']}"
        prev = previous.get(emu["id"], {})
        if live["status"] in ("ok", "partial"):
            entry["github"] = live["github"]
            entry["release"] = live["release"] if "release" in live else prev.get("release")
            entry["releaseHistory"] = live["releaseHistory"] if "releaseHistory" in live else prev.get("releaseHistory", [])
            entry["stale"] = live["status"] == "partial"
            counts["ok" if live["status"] == "ok" else "stale"] += 1
        elif live["status"] == "missing":
            entry["github"] = None
            entry["release"] = None
            entry["releaseHistory"] = []
            entry["unavailable"] = True
            counts["missing"] += 1
            print(f"[warn] {emu['repo']}: repository not found", file=sys.stderr)
        else:
            entry["github"] = prev.get("github")
            entry["release"] = prev.get("release")
            entry["releaseHistory"] = prev.get("releaseHistory", [])
            entry["stale"] = True
            counts["stale"] += 1
            print(f"[warn] {emu['repo']}: {live.get('error')} (using previous snapshot)", file=sys.stderr)
        emulators.append(entry)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": now_iso(),
        "categories": registry.CATEGORIES,
        "statuses": [{"id": s, "label": registry.STATUS_LABELS[s]} for s in registry.STATUSES],
        "emulators": emulators,
        "games": reg.games,
        "reports": reg.reports,
        "fetch": counts,
    }


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="tracker build")
    parser.add_argument("--output", default=str(OUTPUT))
    parser.add_argument(
        "--previous",
        default=PREVIOUS_URL,
        help="previous data.json (path or https URL) used as a fallback; '' to disable",
    )
    parser.add_argument("--offline", action="store_true", help="skip GitHub; registry data only")
    parser.add_argument(
        "--from-data",
        "--html-only",
        dest="from_data",
        action="store_true",
        help="regenerate static HTML/sitemap from existing data.json + data/*.json without fetching GitHub",
    )
    parser.add_argument("--no-html", action="store_true", help="skip static SEO page/sitemap generation")
    args = parser.parse_args(argv)

    reg = registry.load()
    if reg.errors:
        print("Registry is invalid:\n  " + "\n  ".join(reg.errors), file=sys.stderr)
        return 1

    out = Path(args.output)
    if args.from_data:
        if not out.exists():
            print(f"Existing data snapshot not found: {out}", file=sys.stderr)
            return 1
        existing_payload = json.loads(out.read_text(encoding="utf-8"))
        prev_by_id = {e["id"]: e for e in existing_payload.get("emulators", []) if "id" in e}
        merged_emus: list[dict[str, Any]] = []
        for emu in reg.emulators:
            prev = prev_by_id.get(emu["id"], {})
            entry = {k: v for k, v in emu.items()}
            entry["url"] = f"https://github.com/{emu['repo']}"
            entry["github"] = prev.get("github")
            entry["release"] = prev.get("release")
            entry["releaseHistory"] = prev.get("releaseHistory", [])
            if "stale" in prev:
                entry["stale"] = prev["stale"]
            if prev.get("unavailable"):
                entry["unavailable"] = True
            merged_emus.append(entry)
        fetched_payload = {
            "schemaVersion": existing_payload.get("schemaVersion", SCHEMA_VERSION),
            "generatedAt": existing_payload.get("generatedAt") or now_iso(),
            "categories": registry.CATEGORIES,
            "statuses": [{"id": s, "label": registry.STATUS_LABELS[s]} for s in registry.STATUSES],
            "emulators": merged_emus,
            "games": reg.games,
            "reports": reg.reports,
            "fetch": existing_payload.get("fetch", {"ok": 0, "stale": len(merged_emus), "missing": 0}),
        }
        seo_counts = seo.generate(fetched_payload, out.parent, previous_sitemap_url=None)
        print(
            f"Regenerated SEO pages from {out}: {seo_counts['games']} games, {seo_counts['emulators']} emulators, "
            f"{seo_counts['reports']} reports, {seo_counts['guides']} guides "
            f"({seo_counts['urls']} sitemap URLs, {seo_counts['changed']} changed)"
        )
        return 0

    previous = load_previous(args.previous or None)
    if args.offline:
        fetched_payload = build(reg, _OfflineGitHub(), previous)
    else:
        gh = GitHub.from_env()
        if not gh.token:
            print("[warn] no GITHUB_TOKEN set; unauthenticated limit is 60 requests/hour", file=sys.stderr)
        fetched_payload = build(reg, gh, previous)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fetched_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    c = fetched_payload["fetch"]
    print(f"Wrote {out} · {len(fetched_payload['emulators'])} emulators · ok={c['ok']} stale={c['stale']} missing={c['missing']}")
    # Fail the deploy only if GitHub was unreachable for (almost) everything AND there is no snapshot.
    if not args.offline and c["ok"] == 0 and not previous:
        print("GitHub API unreachable and no previous snapshot; refusing to publish empty data.", file=sys.stderr)
        return 1
    if not args.no_html:
        seo_counts = seo.generate(
            fetched_payload,
            out.parent,
            previous_sitemap_url=None if args.offline else seo.LIVE_SITEMAP_URL,
        )
        print(
            f"Generated SEO pages: {seo_counts['games']} games, {seo_counts['emulators']} emulators, "
            f"{seo_counts['reports']} reports, {seo_counts['guides']} guides "
            f"({seo_counts['urls']} sitemap URLs, {seo_counts['changed']} changed)"
        )
    return 0


class _OfflineGitHub(GitHub):
    def get(self, path: str) -> Any:  # noqa: D401
        raise ConnectionError("offline mode")
