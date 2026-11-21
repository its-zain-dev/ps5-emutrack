"""Generate crawler-friendly static HTML, verified report pages, guide pages, 404.html, sitemap.xml, and changed-only IndexNow pings."""

from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import guides, registry

BASE_URL = "https://its-zain-dev.github.io/ps5-emutrack"
BASE_PATH = "/ps5-emutrack"
REPO_URL = "https://github.com/its-zain-dev/ps5-emutrack"
SUBMIT_URL = f"{REPO_URL}/issues/new?template=submit-emulator.yml"
REPORT_URL = f"{REPO_URL}/issues/new?template=compatibility-report.yml"
INDEXNOW_KEY_NAME = "7862e477294f4e6572602570d152cbdf.txt"
LIVE_SITEMAP_URL = f"{BASE_URL}/sitemap.xml"

MATRIX_COLUMNS = ("kytyps5", "sharpemu", "anyps5", "prosperity", "shadps4")
STATUS_RANK = {"nothing": 0, "boots": 1, "menus": 2, "ingame": 3, "playable": 4}
FOLD_LIMIT = 6
EMU_TITLE_CATEGORY = {
    "ps5": "PS5 Emulator",
    "ps4": "PS4 Emulator",
    "fork": "PS5 Emulator Fork",
    "port": "PS5 Emulator Port",
}

# Verified upstream screenshots hosted in public repositories (zero unverified mirrors).
UPSTREAM_SCREENSHOTS: dict[str, list[tuple[str, str]]] = {
    "kytyps5": [
        (
            "https://raw.githubusercontent.com/KytyPS5/KytyPS5/main/docs/screenshots/ps5-01.png",
            "Astro Bot running in KytyPS5 emulator (upstream showcase screenshot)",
        ),
        (
            "https://raw.githubusercontent.com/KytyPS5/KytyPS5/main/docs/screenshots/ps5-02.png",
            "Demon's Souls running in KytyPS5 emulator (upstream showcase screenshot)",
        ),
        (
            "https://raw.githubusercontent.com/KytyPS5/KytyPS5/main/docs/screenshots/ps5-07.png",
            "Cyberpunk 2077 running in KytyPS5 emulator (upstream showcase screenshot)",
        ),
    ],
    "prosperity": [
        (
            "https://raw.githubusercontent.com/Force67/prosperity/master/docs/screenshots/main-menu.png",
            "Prosperity emulator main user interface",
        ),
    ],
    "shadps4": [
        (
            "https://raw.githubusercontent.com/shadps4-emu/shadPS4/main/documents/Screenshots/1.png",
            "Bloodborne running in shadPS4 emulator (upstream showcase screenshot)",
        ),
    ],
}


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def truncate_words(text: str, limit: int = 155) -> str:
    """Collapse whitespace and truncate strictly on word boundaries without mid-word cuts."""
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    window = cleaned[: limit - 1]
    if not cleaned[limit - 1].isspace() and " " in window:
        window = window.rsplit(" ", 1)[0]
    window = window.rstrip(" .,;:!?-–—")
    return f"{window}…"


def _prune_stale_dirs(parent: Path, keep_ids: set[str]) -> None:
    if not parent.exists():
        return
    import shutil

    for child in parent.iterdir():
        if child.is_dir() and child.name not in keep_ids:
            shutil.rmtree(child)


def parse_iso_dt(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def fmt_date(iso: str | None) -> str:
    dt = parse_iso_dt(iso)
    return dt.strftime("%b %d, %Y") if dt else "—"


def fmt_bytes(size: int) -> str:
    if size <= 0:
        return "0 B"
    val = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if val < 1024 or unit == "GB":
            return f"{round(val)} {unit}" if (val >= 10 or unit == "B") else f"{val:.1f} {unit}"
        val /= 1024
    return f"{size} B"


def report_slug(report: dict[str, Any], index: int = 0) -> str:
    if report.get("id"):
        return str(report["id"])
    raw = f"{report['game']}-{report['emulator']}-{report['date']}-{index}"
    return re.sub(r"[^a-z0-9-]+", "-", raw.lower()).strip("-")


def youtube_id(url: str | None) -> str | None:
    if not url:
        return None
    m = re.search(r"(?:youtu\.be/|youtube\.com/watch\?v=)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def _inline_md(escaped_line: str) -> str:
    code_slots: list[str] = []

    def stash_code(m: re.Match[str]) -> str:
        code_slots.append(f"<code>{m.group(1)}</code>")
        return f"\x00C{len(code_slots) - 1}\x00"

    text = re.sub(r"`([^`\n]+)`", stash_code, escaped_line)
    link_slots: list[str] = []

    def stash_link(m: re.Match[str]) -> str:
        label, url = m.group(1), m.group(2)
        link_slots.append(f'<a href="{url}" target="_blank" rel="noopener noreferrer">{label}</a>')
        return f"\x00L{len(link_slots) - 1}\x00"

    text = re.sub(r"\[([^\]]+)\]\((https://[^\s)]+)\)", stash_link, text)

    def stash_bare(m: re.Match[str]) -> str:
        prefix, url = m.group(1), m.group(2)
        trail = ""
        while url and url[-1] in ".,;:!?":
            trail = url[-1] + trail
            url = url[:-1]
        link_slots.append(f'<a href="{url}" target="_blank" rel="noopener noreferrer">{url}</a>')
        return f"{prefix}\x00L{len(link_slots) - 1}\x00{trail}"

    text = re.sub(r"(^|[\s(])(https://[^\s<)\]]+)", stash_bare, text)
    text = re.sub(r"\*\*([^*\n]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(^|[^*])\*([^*\n]+)\*(?!\*)", r"\1<em>\2</em>", text)
    text = re.sub(r"\x00L(\d+)\x00", lambda m: link_slots[int(m.group(1))], text)
    text = re.sub(r"\x00C(\d+)\x00", lambda m: code_slots[int(m.group(1))], text)
    return text


def render_markdown_html(md: str | None) -> str:
    raw = (md or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        return '<p class="muted">No release notes provided.</p>'
    escaped = esc(raw)
    blocks: list[str] = []

    def stash_block(m: re.Match[str]) -> str:
        blocks.append(f"<pre><code>{m.group(1).rstrip()}</code></pre>")
        return f"\n\x00B{len(blocks) - 1}\x00\n"

    escaped = re.sub(r"```[^\n]*\n([\s\S]*?)```", stash_block, escaped)
    lines = escaped.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        bm = re.match(r"^\x00B(\d+)\x00$", stripped)
        if bm:
            out.append(blocks[int(bm.group(1))])
            i += 1
            continue
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            out.append("<hr>")
            i += 1
            continue
        hm = re.match(r"^\s*(#{1,5})\s+(.+)$", line)
        if hm:
            tag = "h3" if len(hm.group(1)) <= 2 else "h4"
            out.append(f"<{tag}>{_inline_md(hm.group(2).strip())}</{tag}>")
            i += 1
            continue
        if re.match(r"^\s*[-*+]\s+", line):
            items: list[str] = []
            while i < len(lines) and re.match(r"^\s*[-*+]\s+", lines[i]):
                items.append(f"<li>{_inline_md(re.sub(r'^\s*[-*+]\s+', '', lines[i]))}</li>")
                i += 1
            out.append(f"<ul>{''.join(items)}</ul>")
            continue
        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append(f"<li>{_inline_md(re.sub(r'^\s*\d+\.\s+', '', lines[i]))}</li>")
                i += 1
            out.append(f"<ol>{''.join(items)}</ol>")
            continue
        para: list[str] = []
        while (
            i < len(lines)
            and lines[i].strip()
            and not re.match(r"^\s*(#{1,5}\s+|[-*+]\s+|\d+\.\s+)", lines[i])
            and not re.match(r"^(-{3,}|\*{3,}|_{3,})$", lines[i].strip())
            and not re.match(r"^\x00B\d+\x00$", lines[i].strip())
        ):
            para.append(_inline_md(lines[i].strip()))
            i += 1
        out.append(f"<p>{'<br>'.join(para)}</p>")
    return "".join(out)


def pick_best_report(reports: list[dict[str, Any]]) -> dict[str, Any] | None:
    best = None
    for cur in reports:
        if best is None:
            best = cur
            continue
        if cur["verified"] != best["verified"]:
            if cur["verified"]:
                best = cur
            continue
        rank_diff = STATUS_RANK.get(cur["status"], -1) - STATUS_RANK.get(best["status"], -1)
        if rank_diff > 0 or (rank_diff == 0 and str(cur["date"]) > str(best["date"])):
            best = cur
    return best


def sort_emulators_default(emulators: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(e: dict[str, Any]) -> tuple:
        rel_dt = parse_iso_dt((e.get("release") or {}).get("publishedAt"))
        push_dt = parse_iso_dt((e.get("github") or {}).get("pushedAt"))
        rel_ts = rel_dt.timestamp() if rel_dt else 0.0
        touch_ts = max(rel_ts, push_dt.timestamp() if push_dt else 0.0)
        stars = (e.get("github") or {}).get("stars", 0)
        return (e.get("tier") == "featured", rel_ts, touch_ts, stars)

    return sorted(emulators, key=key, reverse=True)


def has_substantive_page(emu: dict[str, Any], report_counts: dict[str, int]) -> bool:
    if emu.get("tier") == "featured":
        return True
    if emu.get("release") is not None:
        return True
    if report_counts.get(emu["id"], 0) > 0:
        return True
    stars = int((emu.get("github") or {}).get("stars") or 0)
    return stars >= 10


def _emu_lastmod(emu: dict[str, Any], emu_reports: list[dict[str, Any]]) -> str:
    candidates = [emu.get("addedAt") or ""]
    rel_pub = (emu.get("release") or {}).get("publishedAt")
    if rel_pub:
        candidates.append(rel_pub[:10])
    pushed = (emu.get("github") or {}).get("pushedAt")
    if pushed:
        candidates.append(pushed[:10])
    for r in emu_reports:
        if r.get("date"):
            candidates.append(str(r["date"])[:10])
    valid = [c for c in candidates if re.match(r"^\d{4}-\d{2}-\d{2}$", c)]
    return max(valid) if valid else "2026-11-16"


def _game_lastmod(game: dict[str, Any], game_reports: list[dict[str, Any]], featured_lastmod: str) -> str:
    dates = [str(r["date"])[:10] for r in game_reports if r.get("date")]
    if game["id"] == "gta-vi" and featured_lastmod:
        dates.append(featured_lastmod)
    valid = [d for d in dates if re.match(r"^\d{4}-\d{2}-\d{2}$", d)]
    return max(valid) if valid else "2026-11-16"


def _replace_marker(doc: str, name: str, content: str) -> str:
    start = f"<!-- SSR:{name} -->"
    end = f"<!-- /SSR:{name} -->"
    if start not in doc or end not in doc:
        return doc
    head, rest = doc.split(start, 1)
    _, tail = rest.split(end, 1)
    return f"{head}{start}\n{content}\n{end}{tail}"


def _render_home_stats(payload: dict[str, Any], now: datetime) -> str:
    emulators = payload["emulators"]
    reports = payload["reports"]
    weekly = sum(
        1
        for e in emulators
        if (dt := parse_iso_dt((e.get("release") or {}).get("publishedAt"))) and (now - dt).total_seconds() <= 7 * 86400
    )
    return (
        f'<div><dt>Projects tracked</dt><dd data-stat="projects">{len(emulators)}</dd></div>'
        f'<div><dt>Releases this week</dt><dd data-stat="weekly">{weekly}</dd></div>'
        f'<div><dt>Compatibility reports</dt><dd data-stat="reports">{len(reports)}</dd></div>'
        f'<div><dt>Data refreshed</dt><dd data-stat="updated">{esc(fmt_date(payload.get("generatedAt")))}</dd></div>'
    )


def _render_home_emulators(
    emulators: list[dict[str, Any]],
    page_ids: set[str],
    categories: dict[str, str],
) -> str:
    by_id = {e["id"]: e for e in emulators}
    ordered = sort_emulators_default(emulators)[:FOLD_LIMIT]
    cards: list[str] = []
    for emu in ordered:
        gh = emu.get("github") or {}
        rel = emu.get("release")
        owner = emu["repo"].split("/")[0]
        avatar = f"https://github.com/{esc(owner)}.png?size=80"
        desc = emu.get("summary") or gh.get("description") or "Open-source PlayStation emulation project."
        cat_label = categories.get(emu["category"], emu["category"])
        badges = []
        if emu.get("tier") == "featured":
            badges.append('<span class="badge badge-featured">★ Featured</span>')
        badges.append(f'<span class="badge">{esc(cat_label)}</span>')
        if emu.get("forkOf") and emu["forkOf"] in by_id:
            badges.append(f'<span class="badge">Based on {esc(by_id[emu["forkOf"]]["name"])}</span>')
        for p in emu.get("platforms", []):
            badges.append(f'<span class="badge">{esc(p)}</span>')

        meta = []
        if gh:
            meta.append(f'<span>★ {gh.get("stars", 0):,}</span>')
            if gh.get("language"):
                meta.append(f'<span>{esc(gh["language"])}</span>')
            if gh.get("license"):
                meta.append(f'<span>{esc(gh["license"])}</span>')

        if rel:
            rel_html = (
                f'<div class="release"><div class="release-info">'
                f'<span class="release-tag">{esc(rel["tag"])}</span>'
                f'<span class="release-date">{esc(fmt_date(rel.get("publishedAt")))}</span>'
                f"</div></div>"
            )
        else:
            rel_html = '<div class="release none">No tagged releases — source only</div>'

        details_btn = (
            f'<a class="btn btn-primary btn-sm" href="./emulators/{esc(emu["id"])}/">Details &amp; notes</a>'
            if emu["id"] in page_ids
            else f'<a class="btn btn-ghost btn-sm" href="{esc(emu["url"])}/commits" target="_blank" rel="noopener">Commits</a>'
        )
        cards.append(
            f'<article id="emu-card-{esc(emu["id"])}" class="card{" is-featured" if emu.get("tier") == "featured" else ""}">'
            f'<div class="card-top">'
            f'<img class="avatar" src="{avatar}" alt="{esc(emu["name"])} GitHub avatar" width="38" height="38" loading="lazy" decoding="async">'
            f'<div class="card-title"><h3><a href="{esc(emu["url"])}" target="_blank" rel="noopener">{esc(emu["name"])}</a></h3>'
            f'<span class="repo">{esc(emu["repo"])}</span></div>'
            f'<div class="card-pins">'
            f'<button type="button" class="pin-btn star" data-save-emu="{esc(emu["id"])}" aria-pressed="false" title="Save to watchlist">☆</button>'
            f'<button type="button" class="pin-btn" data-compare-emu="{esc(emu["id"])}" aria-pressed="false" title="Add to side-by-side comparison">+ Compare</button>'
            f'</div></div>'
            f'<div class="badges">{"".join(badges)}</div>'
            f'<p class="desc">{esc(desc)}</p>'
            f'<div class="meta">{"".join(meta)}</div>'
            f"{rel_html}"
            f'<div class="card-actions">'
            f'<a class="btn btn-ghost btn-sm" href="{esc(emu["url"])}" target="_blank" rel="noopener">Repository</a>'
            f"{details_btn}</div></article>"
        )
    return "".join(cards)


def _render_home_compat(payload: dict[str, Any], emu_page_ids: set[str]) -> str:
    by_id = {e["id"]: e for e in payload["emulators"]}
    status_labels = {s["id"]: s["label"] for s in payload["statuses"]}
    cols = [by_id[eid] for eid in MATRIX_COLUMNS if eid in by_id]
    head_cells = "".join(
        f'<th><a href="./emulators/{esc(c["id"])}/">{esc(c["name"])}</a></th>'
        if c["id"] in emu_page_ids
        else f'<th><a href="{esc(c["url"])}" target="_blank" rel="noopener">{esc(c["name"])}</a></th>'
        for c in cols
    )
    rows: list[str] = []
    for game in payload["games"]:
        g_reports = [r for r in payload["reports"] if r["game"] == game["id"]]
        cells = []
        for col in cols:
            best = pick_best_report([r for r in g_reports if r["emulator"] == col["id"]])
            if not best:
                cells.append('<td><span class="untested">—</span></td>')
            else:
                cls = f'status {esc(best["status"])}{"" if best["verified"] else " unverified"}'
                cells.append(f'<td><span class="{cls}">{esc(status_labels.get(best["status"], best["status"]))}</span></td>')
        pills = ""
        if game.get("platform"):
            pills += f' <span class="badge">{esc(game["platform"])}</span>'
        if game.get("releaseDate"):
            today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if str(game["releaseDate"]) <= today_iso:
                pills += f' <span class="badge">Released · {esc(game["releaseDate"])}</span>'
            else:
                pills += f' <span class="pill-upcoming">Release · {esc(game["releaseDate"])}</span>'
        dev = f'<div class="game-sub">{esc(game["developer"])}</div>' if game.get("developer") else ""
        rows.append(
            f'<tr class="game-row"><td>'
            f'<div class="game-title"><a href="./games/{esc(game["id"])}/">{esc(game["title"])}</a>{pills}</div>'
            f"{dev}</td>{''.join(cells)}</tr>"
        )
    return f'<thead><tr><th>Game</th>{head_cells}</tr></thead><tbody>{"".join(rows)}</tbody>'


def _render_home_guides(
    games: list[dict[str, Any]],
    emus_with_pages: list[dict[str, Any]],
    verified_reports: list[tuple[str, dict[str, Any]]],
    emulators_by_id: dict[str, dict[str, Any]],
    games_by_id: dict[str, dict[str, Any]],
) -> str:
    guide_links = " · ".join(
        f'<a href="./guides/{esc(g["id"])}/">{esc(g["navTitle"])}</a>' for g in guides.GUIDES
    )
    report_links = " · ".join(
        f'<a href="./reports/{esc(slug)}/">{esc(games_by_id.get(r["game"], {}).get("title", r["game"]))} ({esc(emulators_by_id.get(r["emulator"], {}).get("name", r["emulator"]))})</a>'
        for slug, r in verified_reports
    )
    game_links = " · ".join(
        f'<a href="./games/{esc(g["id"])}/">{esc(g["title"])}</a>' for g in games
    )
    emu_links = " · ".join(
        f'<a href="./emulators/{esc(e["id"])}/">{esc(e["name"])}</a>' for e in emus_with_pages
    )
    return (
        f'<div class="guides-grid">'
        f'<div><h3><a href="./guides/">PS5 Emulation &amp; GTA VI Guides ({len(guides.GUIDES)})</a></h3><p class="small muted">{guide_links}</p></div>'
        f'<div><h3>Verified Compatibility Evidence Reports ({len(verified_reports)})</h3><p class="small muted">{report_links or "None yet."}</p></div>'
        f'<div><h3>Game Compatibility Pages ({len(games)})</h3><p class="small muted">{game_links}</p></div>'
        f'<div><h3>Emulator Release &amp; Status Pages ({len(emus_with_pages)})</h3><p class="small muted">{emu_links}</p></div>'
        f"</div>"
    )


def _page_shell(
    *,
    title: str,
    description: str,
    canonical: str,
    ld_blocks: list[dict[str, Any]],
    body_html: str,
    generated_at: str,
    depth: int = 2,
    robots: str = "index, follow, max-image-preview:large, max-snippet:-1",
    include_canonical: bool = True,
    include_og_url: bool = True,
    og_type: str = "article",
    root_prefix: str | None = None,
) -> str:
    rel = root_prefix if root_prefix is not None else ("../" * depth)
    ld_scripts = "\n    ".join(
        f'<script type="application/ld+json">{json.dumps(b, ensure_ascii=False)}</script>' for b in ld_blocks
    )
    canonical_tag = f'\n    <link rel="canonical" href="{esc(canonical)}" />' if include_canonical else ""
    og_url_tag = f'\n    <meta property="og:url" content="{esc(canonical)}" />' if include_og_url else ""
    og_alt = "PS5 EmuTrack open-source PS5 emulator tracker and compatibility matrix"
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{esc(title)}</title>
    <meta name="description" content="{esc(description)}" />
    <meta name="robots" content="{esc(robots)}" />
    <meta name="theme-color" content="#0b0f17" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f6f8fb" media="(prefers-color-scheme: light)" />
    <meta name="color-scheme" content="dark light" />{canonical_tag}
    <link rel="icon" href="{rel}assets/icon.svg" type="image/svg+xml" />
    <link rel="icon" href="{rel}assets/icon-192.png" sizes="192x192" type="image/png" />
    <link rel="apple-touch-icon" href="{rel}apple-touch-icon.png" sizes="180x180" />
    <link rel="manifest" href="{rel}manifest.webmanifest" />
    <meta property="og:type" content="{esc(og_type)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="PS5 EmuTrack" />
    <meta property="og:title" content="{esc(title)}" />
    <meta property="og:description" content="{esc(description)}" />{og_url_tag}
    <meta property="og:image" content="{BASE_URL}/og-image.png" />
    <meta property="og:image:width" content="1440" />
    <meta property="og:image:height" content="900" />
    <meta property="og:image:alt" content="{og_alt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{esc(title)}" />
    <meta name="twitter:description" content="{esc(description)}" />
    <meta name="twitter:image" content="{BASE_URL}/og-image.png" />
    <meta name="twitter:image:alt" content="{og_alt}" />
    <link rel="stylesheet" href="{rel}assets/styles.css" />
    {ld_scripts}
  </head>
  <body>
    <header class="site-header">
      <div class="container header-inner">
        <a href="{rel}" class="brand" aria-label="PS5 EmuTrack home">
          <img src="{rel}assets/icon.svg" alt="PS5 EmuTrack logo" width="28" height="28" />
          <span>PS5 <b>EmuTrack</b></span>
        </a>
        <nav class="nav" aria-label="Primary">
          <a href="{rel}#emulators">Emulators</a>
          <a href="{rel}#compatibility">Compatibility</a>
          <a href="{rel}guides/">Guides</a>
          <a href="{rel}guides/real-vs-fake-ps5-emulators/">Safety Guide</a>
          <a href="{rel}#contribute">Contribute</a>
        </nav>
        <div class="header-actions">
          <a class="btn btn-ghost btn-sm" href="{rel}">Interactive Hub</a>
          <a class="btn btn-primary btn-sm" href="{REPO_URL}" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
    </header>
    <main class="section">
      <div class="container">
        {body_html}
      </div>
    </main>
    <footer class="site-footer">
      <div class="container footer-inner">
        <p><strong>PS5 EmuTrack</strong> · Independent open-source tracker. No games, firmware, or keys hosted.</p>
        <p class="footer-links">
          <a href="{rel}">Home</a>
          <a href="{rel}guides/">Guides</a>
          <a href="{rel}games/gta-vi/">GTA VI Watch</a>
          <a href="{rel}guides/real-vs-fake-ps5-emulators/">Verification Guide</a>
          <a href="{rel}data.json">data.json</a>
          <span class="muted">Updated {esc(fmt_date(generated_at))}</span>
        </p>
      </div>
    </footer>
  </body>
</html>
"""


def _static_release_sparkline(history: list[dict[str, Any]]) -> str:
    """Static (non-animated) SVG bar chart showing recent release sizes/cadence across months."""
    if len(history) < 2:
        return ""
    buckets: dict[str, int] = {}
    for item in history:
        dt = parse_iso_dt(item.get("publishedAt"))
        if dt:
            key = dt.strftime("%Y-%m")
            buckets[key] = buckets.get(key, 0) + 1
    if not buckets:
        return ""
    items = sorted(buckets.items())[-8:]
    max_val = max(v for _, v in items) or 1
    bar_w = 34
    gap = 10
    width = len(items) * (bar_w + gap)
    height = 72
    rects = []
    for i, (month, count) in enumerate(items):
        h = max(8, round((count / max_val) * 38))
        x = i * (bar_w + gap)
        y = 44 - h
        rects.append(
            f'<rect x="{x}" y="{y}" width="{bar_w}" height="{h}" rx="4" fill="#3d8bff" fill-opacity="0.78"/>'
            f'<text x="{x + bar_w // 2}" y="{y - 4}" text-anchor="middle" font-size="10" fill="currentColor">{count}</text>'
            f'<text x="{x + bar_w // 2}" y="60" text-anchor="middle" font-size="9.5" fill="#8592a6">{esc(month[2:])}</text>'
        )
    return (
        f'<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'role="img" aria-label="Monthly release count across recent tags" style="max-width:100%;height:auto">'
        f'{"".join(rects)}</svg>'
    )


def _video_ld_block(report: dict[str, Any], game_title: str, emu_name: str, canonical: str) -> dict[str, Any] | None:
    video_url = report.get("video")
    if not video_url:
        return None
    vid = youtube_id(video_url)
    block: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": f"{game_title} on {emu_name} ({report.get('version') or 'test build'})",
        "description": report.get("notes") or f"Compatibility test footage of {game_title} on {emu_name}.",
        "uploadDate": f"{report['date']}T00:00:00Z",
        "url": canonical,
    }
    if vid:
        block["thumbnailUrl"] = f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
        block["embedUrl"] = f"https://www.youtube.com/embed/{vid}"
    else:
        block["contentUrl"] = video_url
        block["thumbnailUrl"] = report["screenshot"] if report.get("screenshot") else f"{BASE_URL}/og-image.png"
    return block


def _fit_title(primary: str, fallback: str, limit: int = 65) -> str:
    return primary if len(primary) <= limit else fallback


def _render_report_page(
    slug: str,
    report: dict[str, Any],
    payload: dict[str, Any],
    emu_page_ids: set[str],
) -> str:
    by_id = {e["id"]: e for e in payload["emulators"]}
    games_by_id = {g["id"]: g for g in payload["games"]}
    status_labels = {s["id"]: s["label"] for s in payload["statuses"]}

    game = games_by_id.get(report["game"], {"id": report["game"], "title": report["game"]})
    emu = by_id.get(report["emulator"], {"id": report["emulator"], "name": report["emulator"], "url": REPO_URL})
    st_label = status_labels.get(report["status"], report["status"])
    canonical = f"{BASE_URL}/reports/{slug}/"
    page_title = _fit_title(
        f"{game['title']} on {emu['name']} ({st_label}) | PS5 EmuTrack",
        f"{game['title']} ({emu['name']}) | PS5 EmuTrack",
    )
    page_desc = truncate_words(
        f"Verified compatibility report for {game['title']} on {emu['name']}: status {st_label}, "
        f"build {report.get('version') or 'see source'}, tested {report['date']}"
        f"{' on ' + report['hardware'] if report.get('hardware') else ''}.",
        limit=155,
    )

    emu_link = (
        f'<a href="../../emulators/{esc(emu["id"])}/">{esc(emu["name"])}</a>'
        if emu["id"] in emu_page_ids
        else f'<a href="{esc(emu.get("url", REPO_URL))}" target="_blank" rel="noopener">{esc(emu["name"])}</a>'
    )

    specs = [
        ("Game", f'<a href="../../games/{esc(game["id"])}/">{esc(game["title"])}</a>'),
        ("Title ID / Serial", f'<code>{esc(report["titleId"])}</code>' if report.get("titleId") else "—"),
        ("Game Version", f'<code>{esc(report["gameVersion"])}</code>' if report.get("gameVersion") else "—"),
        ("Emulator", emu_link),
        ("Emulator Build", f'<code>{esc(report["version"])}</code>' if report.get("version") else "—"),
        ("Status", f'<span class="status {esc(report["status"])}">{esc(st_label)}</span>'),
        ("Operating System", esc(report.get("os") or "—")),
        ("Hardware (CPU / GPU / RAM)", esc(report.get("hardware") or "—")),
        ("Test Date", esc(report["date"])),
        ("Reporter", f'@{esc(report["reporter"])}' if report.get("reporter") else "Community tester"),
    ]
    spec_rows = "".join(f"<tr><th>{esc(k)}</th><td>{v}</td></tr>" for k, v in specs)

    media_html = ""
    if report.get("screenshot"):
        alt = f"{game['title']} compatibility screenshot on {emu['name']} ({st_label})"
        media_html += (
            f'<figure class="prose-card" style="margin-top:20px">'
            f'<img class="shot-img" src="{esc(report["screenshot"])}" alt="{esc(alt)}" loading="lazy" decoding="async" />'
            f'<figcaption class="small muted">{esc(alt)}</figcaption></figure>'
        )

    links = [f'<a class="btn btn-primary btn-sm" href="{esc(report["source"])}" target="_blank" rel="noopener">Source Issue / PR ↗</a>']
    if report.get("evidence") and report["evidence"] != report["source"]:
        links.append(f'<a class="btn btn-ghost btn-sm" href="{esc(report["evidence"])}" target="_blank" rel="noopener">Attached Log / Evidence ↗</a>')
    if report.get("video"):
        links.append(f'<a class="btn btn-ghost btn-sm" href="{esc(report["video"])}" target="_blank" rel="noopener">Watch Test Video ↗</a>')

    body = f"""
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="../../">Home</a> / <a href="../../games/{esc(game["id"])}/">{esc(game["title"])}</a> / <span>Verified Report</span>
      </nav>
      <div class="subpage-hero">
        <div class="badges">
          <span class="status {esc(report["status"])}">{esc(st_label)}</span>
          <span class="badge">Verified Evidence</span>
          {f'<span class="badge"><code>{esc(report["titleId"])}</code></span>' if report.get("titleId") else ""}
        </div>
        <h1>{esc(game["title"])} on {esc(emu["name"])}</h1>
        <p class="lead">{esc(report.get("notes") or "Verified compatibility test report.")}</p>
        <div class="cta-row" style="margin-top:16px">{"".join(links)}</div>
      </div>

      <section class="prose-card">
        <h2>Test Environment &amp; Evidence Metadata</h2>
        <div class="table-wrap"><table class="compare-table"><tbody>{spec_rows}</tbody></table></div>
      </section>
      {media_html}
    """

    ld_blocks: list[dict[str, Any]] = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "PS5 EmuTrack", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": game["title"], "item": f"{BASE_URL}/games/{game['id']}/"},
                {"@type": "ListItem", "position": 3, "name": f"{emu['name']} Report ({report['date']})", "item": canonical},
            ],
        }
    ]
    vid_ld = _video_ld_block(report, game["title"], emu["name"], canonical)
    if vid_ld:
        ld_blocks.append(vid_ld)

    return _page_shell(
        title=page_title,
        description=page_desc,
        canonical=canonical,
        ld_blocks=ld_blocks,
        body_html=body,
        generated_at=payload.get("generatedAt", ""),
    )


def _render_game_page(
    game: dict[str, Any],
    payload: dict[str, Any],
    emu_page_ids: set[str],
    report_slug_map: dict[int, str],
) -> str:
    gid = game["id"]
    title_text = game["title"]
    by_id = {e["id"]: e for e in payload["emulators"]}
    status_labels = {s["id"]: s["label"] for s in payload["statuses"]}
    reports = [(i, r) for i, r in enumerate(payload["reports"]) if r["game"] == gid]
    cols = [by_id[eid] for eid in MATRIX_COLUMNS if eid in by_id]
    generated_at = payload.get("generatedAt", "")

    if gid == "gta-vi":
        page_title = "GTA 6 PC & GTAVI Emulator Status (PS5) | PS5 EmuTrack"
        page_desc = truncate_words(
            "Live GTA6 / GTA 6 PC & GTAVI emulator tracker across KytyPS5, SharpEmu & AnyPS5. "
            "PS5 release reality check, GTA IV disambiguation & anti-scam guide.",
            limit=155,
        )
        h1_title = "Grand Theft Auto VI (GTA6) — PS5 Emulator & GTA 6 PC Watch"
    elif game.get("platform") == "PS4":
        page_title = _fit_title(
            f"{title_text} PS4/PS5 Emulator Status | PS5 EmuTrack",
            f"{title_text} Compatibility | PS5 EmuTrack",
        )
        page_desc = truncate_words(
            f"Verified compatibility reports for {title_text} on shadPS4 (PS4 emulator) and PS5 projects, "
            "with test hardware specs, builds, and status history.",
            limit=155,
        )
        h1_title = f"{title_text} — PS4 & PS5 Emulator Compatibility"
    else:
        page_title = _fit_title(
            f"{title_text} — PS5 Emulator Status | PS5 EmuTrack",
            f"{title_text} Compatibility | PS5 EmuTrack",
        )
        page_desc = truncate_words(
            f"Verified compatibility reports for {title_text} on KytyPS5, SharpEmu, AnyPS5 & Prosperity, "
            "with hardware specs, emulator builds, and test history.",
            limit=155,
        )
        h1_title = f"{title_text} — PS5 Emulator Compatibility"

    canonical = f"{BASE_URL}/games/{gid}/"
    meta_badges = []
    if game.get("developer"):
        meta_badges.append(f'<span class="badge">{esc(game["developer"])}</span>')
    if game.get("platform"):
        meta_badges.append(f'<span class="badge">{esc(game["platform"])}</span>')
    if game.get("releaseDate"):
        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if str(game["releaseDate"]) <= today_iso:
            meta_badges.append(f'<span class="badge">Released on PS5: {esc(game["releaseDate"])}</span>')
        else:
            meta_badges.append(f'<span class="pill-upcoming">Console release: {esc(game["releaseDate"])}</span>')

    gta_callout = ""
    gta_faq_section = ""
    gta_faq_items: list[tuple[str, str]] = []
    if gid == "gta-vi":
        gta5_fork_link = (
            '<a href="../../emulators/kytyps5-gta5-fixes/">KytyPS5 GTA5 Fixes</a>'
            if "kytyps5-gta5-fixes" in emu_page_ids
            else '<a href="https://github.com/CheesyPoofs346/KytyPS5-gta5-fixes" target="_blank" rel="noopener">KytyPS5 GTA5 Fixes</a>'
        )
        gta_callout = f"""
        <div class="prose-card">
          <h2>GTA 6 PC &amp; GTAVI / GTA6 Emulator — Post-Launch Reality Check</h2>
          <p>
            <strong>Short answer: No working PS5 emulator can run GTA VI today.</strong> Grand Theft Auto VI (GTA6) officially released on PlayStation 5 and Xbox Series X|S on
            <strong>{esc(game.get("releaseDate", "2026-11-19"))}</strong>, and Rockstar Games has <strong>not yet announced an official GTA 6 PC or GTA6 PC release date</strong>.
            While <a href="../../emulators/kytyps5/">KytyPS5</a> has reached verified <a href="../../games/gta-v/">In-Game gameplay on PS5 <em>GTA V</em></a> (with cutscene crashes),
            running a brand-new open-world PS5 release like GTA VI via a <em>GTAVI emulator</em> or <em>GTA6 emulator</em> on PC is not currently possible.
          </p>
          <h3>GTA VI vs. GTA IV vs. GTA V (Disambiguation)</h3>
          <p>
            Looking for <strong>GTA VI</strong> (often mistyped as <strong>GTA IV</strong>)? <em>Grand Theft Auto IV</em> (2008) is a PC/PS3/Xbox 360 title with an official PC release—it is <strong>not</strong> a PS5 game and is not tracked by PS5 emulators. <em>GTA V</em> has a native PS5 edition reaching verified In-Game status on KytyPS5 alongside forks like {gta5_fork_link}. Follow real GTA6 compatibility milestones here as verified dumps and test logs arrive.
          </p>
          <p>
            <strong>Active malware alert:</strong> Fake GitHub repos (such as zero-code <code>GTA6-KytyPS5-*</code> clones) and fake GTA 6 PC installers are actively spreading infostealers and Microsoft Defender tampering malware. Read our <a href="../../guides/ps5-emulator-malware-warnings/">PS5 Emulator Malware Warnings</a>, <a href="../../guides/gta-vi-pc-ps5-emulator-reality-check/">GTA VI PC Reality Check</a>, and <a href="../../guides/real-vs-fake-ps5-emulators/">Real vs. Fake PS5 Emulators guide</a> before downloading anything.
          </p>
        </div>"""
        gta_faq_items = [
            (
                "Can any GTAVI emulator or GTA6 emulator run GTA 6 on PC?",
                "No. Grand Theft Auto VI officially released on PlayStation 5 and Xbox Series X|S on 2026-11-19 with no official GTA 6 PC port announced yet, and no open-source PS5 emulator (KytyPS5, SharpEmu, AnyPS5, or Prosperity) can run GTA VI today.",
            ),
            (
                "What is the difference between GTA IV, GTA V, and GTA VI for PS5 emulators?",
                "GTA IV (Grand Theft Auto IV, 2008) is a PS3/Xbox 360/PC game and is not a PS5 title. GTA V has a native PS5 release reaching verified In-Game status on KytyPS5, while GTA VI (GTA6) is Rockstar's console-first PS5/Xbox Series title (released 2026-11-19) tracked on PS5 EmuTrack.",
            ),
            (
                "How do I avoid fake GTA6 PC emulator malware downloads?",
                "Legitimate PS5 emulators are open source on GitHub and never bundle commercial game dumps, BIOS files, PowerShell scripts, or password-protected installers. Beware fake look-alike GitHub repos impersonating KytyPS5 or AnyPS5, and verify every repository URL through PS5 EmuTrack.",
            ),
        ]
        faq_details = "".join(
            f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in gta_faq_items
        )
        gta_faq_section = f"""
      <section style="margin-top:28px" aria-labelledby="gta-faq-heading">
        <h2 id="gta-faq-heading" style="margin-bottom:12px">GTA VI (GTA6 PC) &amp; PS5 Emulator FAQ</h2>
        {faq_details}
      </section>"""

    rows_html = []
    for emu in cols:
        best = pick_best_report([r for _, r in reports if r["emulator"] == emu["id"]])
        emu_link = (
            f'<a href="../../emulators/{esc(emu["id"])}/">{esc(emu["name"])}</a>'
            if emu["id"] in emu_page_ids
            else f'<a href="{esc(emu["url"])}" target="_blank" rel="noopener">{esc(emu["name"])}</a>'
        )
        rel = emu.get("release")
        rel_str = f'<code>{esc(rel["tag"])}</code> ({esc(fmt_date(rel.get("publishedAt")))})' if rel else "Source only"
        if best:
            cls = f'status {esc(best["status"])}{"" if best["verified"] else " unverified"}'
            st_html = f'<span class="{cls}">{esc(status_labels.get(best["status"], best["status"]))}</span>'
            ver_html = "Verified" if best["verified"] else '<span class="unverified-tag">Unverified legacy</span>'
            note = esc(best.get("notes") or "—")
        else:
            st_html = '<span class="untested">No report yet</span>'
            ver_html = "—"
            note = "Awaiting tested dump &amp; verified report."
        rows_html.append(
            f"<tr><td><strong>{emu_link}</strong></td><td>{st_html}</td><td>{ver_html}</td><td>{rel_str}</td><td>{note}</td></tr>"
        )

    verified_list = [(i, r) for i, r in reports if r["verified"]]
    verified_list.sort(key=lambda pair: str(pair[1]["date"]), reverse=True)
    timeline_html = ""
    if verified_list:
        cards = []
        for idx, r in verified_list:
            emu_name = by_id.get(r["emulator"], {}).get("name", r["emulator"])
            slug = report_slug_map[idx]
            st = status_labels.get(r["status"], r["status"])
            hw = f' · {esc(r["hardware"])}' if r.get("hardware") else ""
            os_str = f' · {esc(r["os"])}' if r.get("os") else ""
            ver_tag = f'<code>{esc(r["version"])}</code>' if r.get("version") else ""
            cards.append(
                f'<li class="report">'
                f'<span class="status {esc(r["status"])}">{esc(st)}</span>'
                f'<div class="report-main"><strong>{esc(emu_name)}</strong> '
                f'{ver_tag} '
                f'<span class="muted">{esc(r["date"])}{os_str}{hw}</span></div>'
                f'<div class="report-notes">{esc(r.get("notes") or "")}</div>'
                f'<div class="report-links">'
                f'<a href="../../reports/{esc(slug)}/">Full Report Page ↗</a>'
                f'<a href="{esc(r["source"])}" target="_blank" rel="noopener">Source Issue ↗</a>'
                f'</div></li>'
            )
        timeline_html = f"""
        <section style="margin-top:28px">
          <h2 style="margin-bottom:12px">Verified Evidence Reports &amp; History ({len(verified_list)})</h2>
          <ul class="reports" style="padding:0">{"".join(cards)}</ul>
        </section>"""

    other_games = " · ".join(
        f'<a href="../../games/{esc(g["id"])}/">{esc(g["title"])}</a>'
        for g in payload["games"]
        if g["id"] != gid
    )
    prefill = f"{REPORT_URL}&title={esc(f'[Compatibility] {title_text}')}"
    aliases_note = (
        f'<p class="small muted">Also searched as: {esc(", ".join(game.get("aliases", [])))}</p>'
        if game.get("aliases")
        else ""
    )

    body = f"""
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="../../">Home</a> / <a href="../../#compatibility">Compatibility</a> / <span>{esc(title_text)}</span>
      </nav>
      <div class="subpage-hero">
        <div class="badges">{"".join(meta_badges)}</div>
        <h1>{esc(h1_title)}</h1>
        <p class="lead">Sourced compatibility across tracked open-source PS5 &amp; PS4 emulators · Updated {esc(fmt_date(generated_at))}.</p>
        {aliases_note}
        <div class="cta-row" style="margin-top:16px">
          <a class="btn btn-primary btn-sm" href="{esc(prefill)}" target="_blank" rel="noopener">Submit verified report</a>
          <a class="btn btn-ghost btn-sm" href="../../#compatibility">Back to full matrix</a>
        </div>
      </div>

      {gta_callout}

      <section style="margin-top:28px">
        <h2 style="margin-bottom:12px">Best Reported Status by Featured Emulator</h2>
        <div class="table-wrap">
          <table class="compat">
            <thead><tr><th>Emulator</th><th>Status</th><th>Verification</th><th>Latest Build</th><th>Notes</th></tr></thead>
            <tbody>{"".join(rows_html)}</tbody>
          </table>
        </div>
      </section>

      {timeline_html}
      {gta_faq_section}

      <section style="margin-top:28px">
        <h2 style="margin-bottom:10px">Other Tracked Games</h2>
        <p class="small muted">{other_games}</p>
      </section>
    """

    ld_blocks: list[dict[str, Any]] = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "PS5 EmuTrack", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": "Compatibility", "item": f"{BASE_URL}/#compatibility"},
                {"@type": "ListItem", "position": 3, "name": title_text, "item": canonical},
            ],
        }
    ]
    if gta_faq_items:
        ld_blocks.append(
            {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": a},
                    }
                    for q, a in gta_faq_items
                ],
            }
        )
    for _, r in verified_list:
        v_block = _video_ld_block(r, title_text, by_id.get(r["emulator"], {}).get("name", r["emulator"]), canonical)
        if v_block:
            ld_blocks.append(v_block)
            break

    return _page_shell(
        title=page_title,
        description=page_desc,
        canonical=canonical,
        ld_blocks=ld_blocks,
        body_html=body,
        generated_at=generated_at,
        og_type="website",
    )


def _render_emulator_page(
    emu: dict[str, Any],
    payload: dict[str, Any],
    emu_page_ids: set[str],
    report_slug_map: dict[int, str],
) -> str:
    eid = emu["id"]
    name = emu["name"]
    gh = emu.get("github") or {}
    rel = emu.get("release")
    history = emu.get("releaseHistory") or ([rel] if rel else [])
    by_id = {e["id"]: e for e in payload["emulators"]}
    games_by_id = {g["id"]: g for g in payload["games"]}
    status_labels = {s["id"]: s["label"] for s in payload["statuses"]}
    cat_label = payload["categories"].get(emu["category"], emu["category"])
    generated_at = payload.get("generatedAt", "")

    desc = emu.get("summary") or gh.get("description") or f"{name} open-source PlayStation emulation project on GitHub."
    canonical = f"{BASE_URL}/emulators/{eid}/"
    kind_label = EMU_TITLE_CATEGORY.get(emu.get("category", "ps5"), "PS5 Emulator")
    page_title = _fit_title(
        f"{name} {kind_label} — Releases & Status | PS5 EmuTrack",
        _fit_title(
            f"{name} — {kind_label} | PS5 EmuTrack",
            f"{name} | PS5 EmuTrack",
        ),
    )
    desc_punct = desc if desc.endswith((".", "!", "?", "…")) else f"{desc}."
    page_desc = truncate_words(
        f"{name} ({gh.get('stars', 0):,}★, {', '.join(emu.get('platforms') or ['GitHub'])}): {desc_punct}"
        f"{' Latest build ' + fmt_date(rel.get('publishedAt')) + '.' if rel else ''}",
        limit=158,
    )

    badges = []
    if emu.get("tier") == "featured":
        badges.append('<span class="badge badge-featured">★ Featured</span>')
    badges.append(f'<span class="badge">{esc(cat_label)}</span>')
    if emu.get("forkOf") and emu["forkOf"] in by_id:
        pid = emu["forkOf"]
        pname = by_id[pid]["name"]
        if pid in emu_page_ids:
            badges.append(f'<a class="badge" href="../../emulators/{esc(pid)}/">Fork of {esc(pname)}</a>')
        else:
            badges.append(f'<span class="badge">Fork of {esc(pname)}</span>')
    for p in emu.get("platforms", []):
        badges.append(f'<span class="badge">{esc(p)}</span>')

    rel_section = ""
    if rel:
        assets_html = ""
        if rel.get("assets"):
            items = "".join(
                f'<li><a href="{esc(a["url"])}" target="_blank" rel="noopener noreferrer">{esc(a["name"])}</a>'
                f'<span class="size">{esc(fmt_bytes(a["size"]))} · {a.get("downloads", 0):,} downloads</span></li>'
                for a in rel["assets"]
            )
            assets_html = f'<h3>Download Files ({rel.get("assetCount", len(rel["assets"]))})</h3><ul class="assets" style="margin:10px 0 18px">{items}</ul>'
        rel_section = f"""
        <section class="prose-card" style="margin-top:24px">
          <h2>Latest Release: <code>{esc(rel["tag"])}</code></h2>
          <p class="small muted">Published {esc(fmt_date(rel.get("publishedAt")))} · <a href="{esc(rel["url"])}" target="_blank" rel="noopener noreferrer">View release on GitHub ↗</a></p>
          {assets_html}
          <h3>Release Notes</h3>
          <div class="notes">{render_markdown_html(rel.get("notes"))}</div>
        </section>"""

    history_section = ""
    if history:
        spark = _static_release_sparkline(history)
        h_rows = "".join(
            f'<tr><td><a href="{esc(h.get("url") or emu["url"])}" target="_blank" rel="noopener"><code>{esc(h.get("tag"))}</code></a></td>'
            f'<td>{"Pre-release" if h.get("prerelease") else "Release"}</td>'
            f'<td>{esc(fmt_date(h.get("publishedAt")))}</td></tr>'
            for h in history
        )
        history_section = f"""
        <section class="prose-card" style="margin-top:24px">
          <h2>Project Timeline &amp; Release History</h2>
          <p class="small muted">Repository created {esc(fmt_date(gh.get("createdAt")))} · Added to tracker {esc(emu.get("addedAt"))} · Last pushed {esc(fmt_date(gh.get("pushedAt")))}</p>
          {f'<div style="margin:8px 0">{spark}</div>' if spark else ""}
          <div class="table-wrap"><table class="compat">
            <thead><tr><th>Tag</th><th>Type</th><th>Published</th></tr></thead>
            <tbody>{h_rows}</tbody>
          </table></div>
        </section>"""

    shots = UPSTREAM_SCREENSHOTS.get(eid, [])
    shots_html = ""
    if shots:
        figs = "".join(
            f'<figure style="margin:0"><img class="shot-img" src="{esc(src)}" alt="{esc(alt)}" loading="lazy" decoding="async" />'
            f'<figcaption class="small muted" style="margin-top:6px">{esc(alt)}</figcaption></figure>'
            for src, alt in shots
        )
        shots_html = f'<section class="prose-card" style="margin-top:24px"><h2>Upstream Screenshots</h2><div class="emu-grid">{figs}</div></section>'

    reports = [(i, r) for i, r in enumerate(payload["reports"]) if r["emulator"] == eid]
    reports.sort(key=lambda pair: (not pair[1]["verified"], str(pair[1]["date"])), reverse=False)
    reports_section = ""
    if reports:
        r_rows = []
        for idx, r in reports:
            g = games_by_id.get(r["game"], {"id": r["game"], "title": r["game"]})
            cls = f'status {esc(r["status"])}{"" if r["verified"] else " unverified"}'
            ver_cell = (
                f'<a href="../../reports/{esc(report_slug_map[idx])}/">Verified Report ↗</a>'
                if r["verified"]
                else '<span class="unverified-tag">Unverified legacy</span>'
            )
            r_rows.append(
                f'<tr><td><a href="../../games/{esc(g["id"])}/"><strong>{esc(g["title"])}</strong></a></td>'
                f'<td><span class="{cls}">{esc(status_labels.get(r["status"], r["status"]))}</span></td>'
                f"<td>{ver_cell}</td>"
                f'<td>{esc(r.get("notes") or "—")}</td></tr>'
            )
        reports_section = f"""
        <section style="margin-top:24px">
          <h2 style="margin-bottom:12px">Tracked Game Compatibility ({len(reports)})</h2>
          <div class="table-wrap"><table class="compat">
            <thead><tr><th>Game</th><th>Status</th><th>Evidence</th><th>Notes</th></tr></thead>
            <tbody>{"".join(r_rows)}</tbody>
          </table></div>
        </section>"""

    siblings = " · ".join(
        f'<a href="../../emulators/{esc(o["id"])}/">{esc(o["name"])}</a>'
        for o in payload["emulators"]
        if o["id"] != eid and o["id"] in emu_page_ids and o["category"] == emu["category"]
    )

    body = f"""
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="../../">Home</a> / <a href="../../#emulators">Emulators</a> / <span>{esc(name)}</span>
      </nav>
      <div class="subpage-hero">
        <div class="badges">{"".join(badges)}</div>
        <h1>{esc(name)}</h1>
        <p class="lead">{esc(desc)}</p>
        <div class="cta-row" style="margin-top:16px">
          <a class="btn btn-primary btn-sm" href="{esc(emu["url"])}" target="_blank" rel="noopener">GitHub Repository ↗</a>
          {f'<a class="btn btn-ghost btn-sm" href="{esc(rel["url"])}" target="_blank" rel="noopener">Latest Release ({esc(rel["tag"])})</a>' if rel else ""}
          <a class="btn btn-ghost btn-sm" href="../../?q={esc(name)}#emulators">Filter in Live Hub</a>
        </div>
      </div>

      <dl class="stats" style="margin-top:20px">
        <div><dt>GitHub Stars</dt><dd>{gh.get("stars", 0):,}</dd></div>
        <div><dt>Language</dt><dd>{esc(gh.get("language") or "—")}</dd></div>
        <div><dt>License</dt><dd>{esc(gh.get("license") or "None listed")}</dd></div>
        <div><dt>Last Push</dt><dd>{esc(fmt_date(gh.get("pushedAt")))}</dd></div>
      </dl>

      {rel_section}
      {history_section}
      {shots_html}
      {reports_section}

      {f'<section style="margin-top:28px"><h2 style="margin-bottom:10px">Related {esc(cat_label)} Projects</h2><p class="small muted">{siblings}</p></section>' if siblings else ""}
    """

    software_ld: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": name,
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": ", ".join(emu.get("platforms") or ["Cross-platform"]),
        "url": canonical,
        "codeRepository": emu["url"],
        "description": desc,
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    }
    if rel and rel.get("tag"):
        software_ld["softwareVersion"] = rel["tag"]
        if rel.get("url"):
            software_ld["downloadUrl"] = rel["url"]
    mod_iso = (rel or {}).get("publishedAt") or gh.get("pushedAt")
    if mod_iso:
        software_ld["dateModified"] = str(mod_iso)[:10]
    if gh.get("license"):
        software_ld["license"] = f"https://spdx.org/licenses/{gh['license']}.html"
    if shots:
        software_ld["screenshot"] = [src for src, _ in shots]

    ld_blocks = [
        software_ld,
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "PS5 EmuTrack", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": "Emulators", "item": f"{BASE_URL}/#emulators"},
                {"@type": "ListItem", "position": 3, "name": name, "item": canonical},
            ],
        },
    ]
    return _page_shell(
        title=page_title,
        description=page_desc,
        canonical=canonical,
        ld_blocks=ld_blocks,
        body_html=body,
        generated_at=generated_at,
        og_type="website",
    )


def _render_guide_page(guide: dict[str, Any], generated_at: str) -> str:
    gid = guide["id"]
    canonical = f"{BASE_URL}/guides/{gid}/"
    page_title = _fit_title(
        f"{guide.get('metaTitle', guide['title'])} | PS5 EmuTrack",
        f"{guide['navTitle']} | PS5 EmuTrack",
    )
    page_desc = truncate_words(guide["description"], limit=155)
    sections_html = "".join(
        f'<section class="prose-card"><h2>{esc(heading)}</h2>{body}</section>'
        for heading, body in guide["sections"]
    )
    other_guides = " · ".join(
        f'<a href="../../guides/{esc(g["id"])}/">{esc(g["navTitle"])}</a>'
        for g in guides.GUIDES
        if g["id"] != gid
    )
    body = f"""
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="../../">Home</a> / <a href="../../guides/">Guides</a> / <span>{esc(guide["navTitle"])}</span>
      </nav>
      <div class="subpage-hero">
        <div class="badges"><span class="badge">Research Guide</span><span class="badge">Updated {esc(guide["updated"])}</span></div>
        <h1>{esc(guide["title"])}</h1>
        <p class="lead">{esc(guide["description"])}</p>
        <div class="cta-row" style="margin-top:16px">
          <a class="btn btn-primary btn-sm" href="../../#emulators">Browse Emulator Directory</a>
          <a class="btn btn-ghost btn-sm" href="../../games/gta-vi/">GTA VI Watch</a>
          <a class="btn btn-ghost btn-sm" href="../../guides/">All Guides</a>
        </div>
      </div>
      {sections_html}
      <section style="margin-top:28px">
        <h2 style="margin-bottom:10px">More PS5 Emulation Guides</h2>
        <p class="small muted">{other_guides}</p>
      </section>
    """
    ld_blocks = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "PS5 EmuTrack", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": "Guides", "item": f"{BASE_URL}/guides/"},
                {"@type": "ListItem", "position": 3, "name": guide["navTitle"], "item": canonical},
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            "headline": guide["title"],
            "description": page_desc,
            "datePublished": "2026-11-15",
            "dateModified": guide["updated"],
            "image": f"{BASE_URL}/og-image.png",
            "author": {"@type": "Organization", "name": "PS5 EmuTrack", "url": f"{BASE_URL}/"},
            "publisher": {
                "@type": "Organization",
                "name": "PS5 EmuTrack",
                "url": f"{BASE_URL}/",
                "logo": {"@type": "ImageObject", "url": f"{BASE_URL}/assets/icon-512.png"},
            },
            "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
            "url": canonical,
        },
    ]
    return _page_shell(
        title=page_title,
        description=page_desc,
        canonical=canonical,
        ld_blocks=ld_blocks,
        body_html=body,
        generated_at=generated_at,
        og_type="article",
    )


def _render_guides_index_page(generated_at: str) -> str:
    canonical = f"{BASE_URL}/guides/"
    page_title = "PS5 Emulation & GTA VI Guides | PS5 EmuTrack"
    page_desc = truncate_words(
        "Research guides on open-source PS5 emulators (KytyPS5, SharpEmu, AnyPS5, Prosperity), "
        "system requirements, Android ports, and GTA 6 PC reality checks.",
        limit=155,
    )
    cards = "".join(
        f'<article class="card">'
        f'<div class="badges"><span class="badge">Research Guide</span><span class="badge">Updated {esc(g["updated"])}</span></div>'
        f'<h3><a href="../guides/{esc(g["id"])}/">{esc(g["title"])}</a></h3>'
        f'<p class="muted small">{esc(g["description"])}</p>'
        f'<div class="card-actions" style="margin-top:auto"><a class="btn btn-primary btn-sm" href="../guides/{esc(g["id"])}/">Read guide →</a></div>'
        f"</article>"
        for g in guides.GUIDES
    )
    body = f"""
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="../">Home</a> / <span>Guides</span>
      </nav>
      <div class="subpage-hero">
        <div class="badges"><span class="badge">Research Hub</span><span class="badge">{len(guides.GUIDES)} Guides</span></div>
        <h1>PS5 Emulation &amp; GTA VI Reality-Check Guides</h1>
        <p class="lead">Original technical documentation covering open-source PS5 emulators, safety verification, Vulkan hardware specs, Android ports, and GTA 6 PC compatibility.</p>
        <div class="cta-row" style="margin-top:16px">
          <a class="btn btn-primary btn-sm" href="../games/gta-vi/">GTA VI Compatibility Watch</a>
          <a class="btn btn-ghost btn-sm" href="../emulators/kytyps5/">KytyPS5 Tracker</a>
          <a class="btn btn-ghost btn-sm" href="../emulators/shadps4/">shadPS4 Tracker</a>
        </div>
      </div>
      <section style="margin-top:24px" aria-labelledby="guides-list-heading">
        <h2 id="guides-list-heading" style="margin-bottom:14px">All PS5 Emulation &amp; GTA VI Reality-Check Guides</h2>
        <div class="emu-grid">{cards}</div>
      </section>
    """
    ld_blocks = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "PS5 EmuTrack", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": "Guides", "item": canonical},
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "PS5 Emulation & GTA VI Guides",
            "description": page_desc,
            "url": canonical,
        },
    ]
    return _page_shell(
        title=page_title,
        description=page_desc,
        canonical=canonical,
        ld_blocks=ld_blocks,
        body_html=body,
        generated_at=generated_at,
        depth=1,
        og_type="website",
    )


def _render_404_page(generated_at: str) -> str:
    prefix = f"{BASE_PATH}/"
    body = f"""
      <div class="subpage-hero">
        <div class="badges"><span class="badge badge-warn">404 · Not Found</span></div>
        <h1>Page not found</h1>
        <p class="lead">The emulator, game, or report URL you requested has moved or does not exist.</p>
        <div class="cta-row" style="margin-top:18px">
          <a class="btn btn-primary" href="{prefix}">Go to PS5 EmuTrack Home</a>
          <a class="btn btn-ghost" href="{prefix}#compatibility">Compatibility Matrix</a>
          <a class="btn btn-ghost" href="{prefix}games/gta-vi/">GTA VI Status</a>
          <a class="btn btn-ghost" href="{prefix}guides/">Guides</a>
        </div>
      </div>
    """
    return _page_shell(
        title="Page Not Found | PS5 EmuTrack",
        description="Requested page not found on PS5 EmuTrack.",
        canonical=f"{BASE_URL}/404.html",
        ld_blocks=[],
        body_html=body,
        generated_at=generated_at,
        depth=0,
        robots="noindex, follow",
        include_canonical=False,
        include_og_url=False,
        og_type="website",
        root_prefix=prefix,
    )


def _read_previous_sitemap(site_dir: Path, previous_url: str | None) -> dict[str, str]:
    """Map loc -> lastmod from the currently live sitemap (or local fallback) to detect real URL diffs."""
    raw = ""
    if previous_url:
        try:
            req = urllib.request.Request(previous_url, headers={"User-Agent": "ps5-emutrack"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = resp.read().decode("utf-8", "replace")
        except Exception:
            raw = ""
    if not raw and (site_dir / "sitemap.xml").exists():
        raw = (site_dir / "sitemap.xml").read_text(encoding="utf-8")
    if not raw:
        return {}
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return {}
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    out: dict[str, str] = {}
    for url_el in root.findall("s:url", ns):
        loc = url_el.findtext("s:loc", default="", namespaces=ns).strip()
        lastmod = url_el.findtext("s:lastmod", default="", namespaces=ns).strip()
        if loc:
            out[loc] = lastmod
    return out


def _write_sitemap(site_dir: Path, urls: list[tuple[str, str, str, str]]) -> None:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, freq, prio in urls:
        lines += [
            "  <url>",
            f"    <loc>{esc(loc)}</loc>",
            f"    <lastmod>{esc(lastmod)}</lastmod>",
            f"    <changefreq>{esc(freq)}</changefreq>",
            f"    <priority>{esc(prio)}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    (site_dir / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate(
    payload: dict[str, Any],
    site_dir: Path | None = None,
    previous_sitemap_url: str | None = LIVE_SITEMAP_URL,
) -> dict[str, int]:
    """Prerender site/index.html, build game/emulator/report/guide pages, 404.html, and diff-aware sitemap.xml."""
    target = site_dir or (registry.ROOT / "site")
    now = datetime.now(timezone.utc)
    generated_at = payload.get("generatedAt") or now.strftime("%Y-%m-%dT%H:%M:%SZ")

    report_counts: dict[str, int] = {}
    for r in payload["reports"]:
        report_counts[r["emulator"]] = report_counts.get(r["emulator"], 0) + 1

    emus_with_pages = [e for e in payload["emulators"] if has_substantive_page(e, report_counts)]
    emu_page_ids = {e["id"] for e in emus_with_pages}
    emulators_by_id = {e["id"]: e for e in payload["emulators"]}
    games_by_id = {g["id"]: g for g in payload["games"]}

    report_slug_map: dict[int, str] = {}
    verified_reports: list[tuple[str, dict[str, Any]]] = []
    for idx, r in enumerate(payload["reports"]):
        slug = report_slug(r, idx)
        report_slug_map[idx] = slug
        if r.get("verified"):
            verified_reports.append((slug, r))

    index_path = target / "index.html"
    if index_path.exists():
        doc = index_path.read_text(encoding="utf-8")
        doc = _replace_marker(doc, "STATS", _render_home_stats(payload, now))
        doc = _replace_marker(
            doc,
            "EMULATORS",
            _render_home_emulators(payload["emulators"], emu_page_ids, payload["categories"]),
        )
        doc = _replace_marker(doc, "COMPAT", _render_home_compat(payload, emu_page_ids))
        doc = _replace_marker(
            doc,
            "GUIDES",
            _render_home_guides(payload["games"], emus_with_pages, verified_reports, emulators_by_id, games_by_id),
        )
        doc = _replace_marker(doc, "UPDATED", f"Updated {esc(fmt_date(generated_at))}")
        index_path.write_text(doc, encoding="utf-8")

    (target / "404.html").write_text(_render_404_page(generated_at), encoding="utf-8")

    featured_dates = [
        _emu_lastmod(e, [r for r in payload["reports"] if r["emulator"] == e["id"]])
        for e in payload["emulators"]
        if e.get("tier") == "featured"
    ]
    featured_lastmod = max(featured_dates) if featured_dates else "2026-11-16"

    url_entries: list[tuple[str, str, str, str]] = []

    games_dir = target / "games"
    _prune_stale_dirs(games_dir, {g["id"] for g in payload["games"]})
    for g in payload["games"]:
        g_dir = games_dir / g["id"]
        g_dir.mkdir(parents=True, exist_ok=True)
        (g_dir / "index.html").write_text(
            _render_game_page(g, payload, emu_page_ids, report_slug_map),
            encoding="utf-8",
        )
        g_reports = [r for r in payload["reports"] if r["game"] == g["id"]]
        lastmod = _game_lastmod(g, g_reports, featured_lastmod)
        prio = "0.9" if g["id"] == "gta-vi" else "0.8"
        url_entries.append((f"{BASE_URL}/games/{g['id']}/", lastmod, "daily", prio))

    emus_dir = target / "emulators"
    _prune_stale_dirs(emus_dir, emu_page_ids)
    for e in emus_with_pages:
        e_dir = emus_dir / e["id"]
        e_dir.mkdir(parents=True, exist_ok=True)
        (e_dir / "index.html").write_text(
            _render_emulator_page(e, payload, emu_page_ids, report_slug_map),
            encoding="utf-8",
        )
        e_reports = [r for r in payload["reports"] if r["emulator"] == e["id"]]
        lastmod = _emu_lastmod(e, e_reports)
        prio = "0.9" if e.get("tier") == "featured" else "0.7"
        url_entries.append((f"{BASE_URL}/emulators/{e['id']}/", lastmod, "daily", prio))

    reports_dir = target / "reports"
    _prune_stale_dirs(reports_dir, {slug for slug, _ in verified_reports})
    for slug, r in verified_reports:
        r_dir = reports_dir / slug
        r_dir.mkdir(parents=True, exist_ok=True)
        (r_dir / "index.html").write_text(
            _render_report_page(slug, r, payload, emu_page_ids),
            encoding="utf-8",
        )
        url_entries.append((f"{BASE_URL}/reports/{slug}/", str(r["date"])[:10], "monthly", "0.7"))

    guides_dir = target / "guides"
    guides_dir.mkdir(parents=True, exist_ok=True)
    _prune_stale_dirs(guides_dir, {g["id"] for g in guides.GUIDES})
    (guides_dir / "index.html").write_text(_render_guides_index_page(generated_at), encoding="utf-8")
    url_entries.append((f"{BASE_URL}/guides/", guides.GUIDE_DATE, "weekly", "0.9"))
    for guide in guides.GUIDES:
        gd_dir = guides_dir / guide["id"]
        gd_dir.mkdir(parents=True, exist_ok=True)
        (gd_dir / "index.html").write_text(_render_guide_page(guide, generated_at), encoding="utf-8")
        url_entries.append((f"{BASE_URL}/guides/{guide['id']}/", guide["updated"], "weekly", guide["priority"]))

    home_lastmod = max([lm for _, lm, _, _ in url_entries] or ["2026-11-16"])
    sitemap_urls = [(f"{BASE_URL}/", home_lastmod, "hourly", "1.0")] + url_entries

    prev_map = _read_previous_sitemap(target, previous_sitemap_url)
    changed_urls = [loc for loc, lm, _, _ in sitemap_urls if prev_map.get(loc) != lm]
    removed_urls = [loc for loc in prev_map if loc not in {u[0] for u in sitemap_urls}]
    diff_urls = sorted(set(changed_urls + removed_urls))

    _write_sitemap(target, sitemap_urls)
    build_meta_dir = target.parent / ".build"
    build_meta_dir.mkdir(parents=True, exist_ok=True)
    (build_meta_dir / "changed_urls.json").write_text(json.dumps(diff_urls, indent=2) + "\n", encoding="utf-8")

    return {
        "games": len(payload["games"]),
        "emulators": len(emus_with_pages),
        "reports": len(verified_reports),
        "guides": len(guides.GUIDES),
        "urls": len(sitemap_urls),
        "changed": len(diff_urls),
    }


def submit_indexnow(site_dir: Path | None = None) -> int:
    """Notify Bing / IndexNow strictly for URLs that were added, updated, or removed."""
    target = site_dir or (registry.ROOT / "site")
    key_path = target / INDEXNOW_KEY_NAME
    if not key_path.exists():
        print("[warn] IndexNow key missing; skipping.")
        return 0
    changed_file = target.parent / ".build" / "changed_urls.json"
    if changed_file.exists():
        urls = json.loads(changed_file.read_text(encoding="utf-8"))
    else:
        print("IndexNow: no .build/changed_urls.json diff file; skipping.")
        return 0

    if not urls:
        print("IndexNow: 0 URLs changed since live sitemap; skipping ping.")
        return 0

    key = key_path.read_text(encoding="utf-8").strip()
    body = json.dumps(
        {
            "host": "its-zain-dev.github.io",
            "key": key,
            "keyLocation": f"{BASE_URL}/{INDEXNOW_KEY_NAME}",
            "urlList": urls,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "ps5-emutrack"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"IndexNow submitted {len(urls)} changed URLs (HTTP {resp.status})")
    except urllib.error.HTTPError as exc:
        print(f"[warn] IndexNow returned HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:200]}")
    except Exception as exc:
        print(f"[warn] IndexNow request failed ({exc}); continuing.")
    return 0
