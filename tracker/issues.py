"""GitHub issue-form handling: automated triage checks and maintainer approval.

Issue bodies are untrusted input. They are only read from the event payload
file, never interpolated into a shell, and every value is length-limited and
validated before it reaches data/.
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import readme, registry
from .github import GitHub, GitHubError

TRIAGE_MARKER = "<!-- emutrack-triage -->"
SUBMISSION_LABEL = "emulator-submission"
COMPAT_LABEL = "compatibility-report"
APPROVER_PERMISSIONS = {"admin", "maintain", "write"}

CATEGORY_CHOICES = {
    "PS5 emulator / compatibility layer": "ps5",
    "Fork or custom build of another emulator": "fork",
    "Port or frontend (Android, iOS, macOS, web, PS4…)": "port",
    "PS4 emulator / related project": "ps4",
}
STATUS_CHOICES = {
    f"{registry.STATUS_LABELS[s]}": s for s in registry.STATUSES
}
REPO_URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/([A-Za-z0-9._-]{1,100}?)(?:\.git)?/?(?:[#?].*)?$",
    re.IGNORECASE,
)


# --------------------------------------------------------------------------- parsing
def parse_form(body: str) -> dict[str, str]:
    """Turn a rendered GitHub issue form into {heading: answer}."""
    fields: dict[str, str] = {}
    parts = re.split(r"^###[ \t]+(.+?)[ \t]*$", body or "", flags=re.MULTILINE)
    for heading, value in zip(parts[1::2], parts[2::2]):
        value = value.strip()
        if value == "_No response_":
            value = ""
        fields[heading.strip()] = value
    return fields


def checked_boxes(value: str) -> list[str]:
    return [m.strip() for m in re.findall(r"^- \[[xX]\] (.+)$", value, flags=re.MULTILINE)]


def clean_text(value: str, limit: int) -> str:
    value = "".join(ch for ch in value if unicodedata.category(ch)[0] != "C" or ch in "\n\t")
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit]


def parse_repo(value: str) -> str | None:
    value = value.strip().strip("<>")
    m = REPO_URL_RE.match(value)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    if registry.REPO_RE.match(value):
        return value
    return None


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "item"


# --------------------------------------------------------------------------- checks
@dataclass
class Checks:
    passed: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def ok(self, msg: str) -> None:
        self.passed.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def fail(self, msg: str) -> None:
        self.errors.append(msg)

    def markdown(self, title: str, footer: str) -> str:
        lines = [TRIAGE_MARKER, f"### {title}", ""]
        lines += [f"- ❌ {m}" for m in self.errors]
        lines += [f"- ⚠️ {m}" for m in self.warnings]
        lines += [f"- ✅ {m}" for m in self.passed]
        lines += ["", footer]
        return "\n".join(lines)


@dataclass
class Submission:
    entry: dict[str, Any]
    checks: Checks


def evaluate_submission(fields: dict[str, str], reg: registry.Registry, gh: GitHub | None) -> Submission:
    c = Checks()
    name = clean_text(fields.get("Emulator name", ""), 60)
    repo = parse_repo(fields.get("Repository", ""))
    category = CATEGORY_CHOICES.get(fields.get("Category", "").strip())
    summary = clean_text(fields.get("Short description", ""), 400)
    fork_of_raw = clean_text(fields.get("Fork of (optional)", ""), 100)
    platforms = [p for p in checked_boxes(fields.get("Platforms", "")) if p in registry.PLATFORMS]

    (c.ok if name else c.fail)("Emulator name provided" if name else "Emulator name is missing")
    if not repo:
        c.fail("Repository must be a GitHub URL like `https://github.com/owner/repo`")
    elif reg.find_repo(repo):
        c.fail(f"`{repo}` is already listed as **{reg.find_repo(repo)['name']}**")
    else:
        c.ok(f"Repository `{repo}` is not already listed")
    if not category:
        c.fail("Pick a category")
    if not 10 <= len(summary) <= 280:
        c.fail(f"Short description must be 10-280 characters (got {len(summary)})")

    fork_of = None
    if fork_of_raw:
        target = find_emulator(fork_of_raw, reg)
        if target:
            fork_of = target["id"]
            c.ok(f"Linked as a fork of **{target['name']}**")
        else:
            c.warn(f"'{fork_of_raw}' is not a tracked emulator, so the fork link will be omitted")
    elif category == "fork":
        c.warn("Category is *Fork* but no parent emulator was given")

    entry_id = slugify(name)
    if entry_id in reg.emulator_ids:
        entry_id = slugify(f"{name}-{repo.split('/')[0]}" if repo else f"{name}-2")

    if repo and gh is not None:
        canonical = check_repo_health(repo, gh, c, expect_fork=category == "fork")
        if canonical and canonical.lower() != repo.lower():
            if reg.find_repo(canonical):
                c.fail(f"`{canonical}` is already listed as **{reg.find_repo(canonical)['name']}**")
            repo = canonical

    entry: dict[str, Any] = {
        "id": entry_id,
        "name": name,
        "repo": repo or "",
        "category": category or "ps5",
        "tier": "community",
    }
    if fork_of:
        entry["forkOf"] = fork_of
    if platforms:
        entry["platforms"] = platforms
    if summary:
        entry["summary"] = summary
    entry["addedAt"] = datetime.now(timezone.utc).date().isoformat()
    return Submission(entry, c)


def check_repo_health(repo: str, gh: GitHub, c: Checks, expect_fork: bool) -> str | None:
    """Run health checks; returns the canonical owner/name (after redirects) when known."""
    try:
        meta = gh.get(f"/repos/{repo}")
    except GitHubError as exc:
        c.fail(f"Could not load `{repo}` from GitHub ({'not found or private' if exc.status == 404 else exc})")
        return None
    except Exception as exc:
        c.warn(f"GitHub API unavailable, so the repository was not checked ({exc})")
        return None
    if meta.get("private"):
        c.fail("Repository is private")
    if meta.get("archived"):
        c.fail("Repository is archived")
    else:
        c.ok("Repository is public and not archived")
    if meta.get("full_name", "").lower() != repo.lower():
        c.warn(f"Repository redirects to `{meta.get('full_name')}`, so that name will be used")
    lic = (meta.get("license") or {}).get("spdx_id")
    (c.ok if lic and lic != "NOASSERTION" else c.warn)(
        f"License: {lic}" if lic and lic != "NOASSERTION" else "No recognised open-source license"
    )
    if meta.get("fork") and not expect_fork:
        parent = (meta.get("parent") or {}).get("full_name", "another repo")
        c.warn(f"This is a GitHub fork of `{parent}`. Consider category *Fork*.")
    created = meta.get("created_at", "")
    stars = meta.get("stargazers_count", 0)
    c.ok(f"{stars} stars · created {created[:10]} · last push {str(meta.get('pushed_at', ''))[:10]}")
    if int(meta.get("size") or 0) < 50:
        c.warn("Repository is nearly empty (under 50 KB of content). Check that it contains real source code.")
    try:
        releases = gh.get(f"/repos/{repo}/releases?per_page=5") or []
        published = [r for r in releases if not r.get("draft")]
        if published:
            exts = {a["name"].rsplit(".", 1)[-1].lower() for r in published for a in r.get("assets", []) if "." in a["name"]}
            c.ok(f"Has GitHub releases (latest: `{published[0].get('tag_name')}`)")
            if exts & {"exe", "msi", "apk", "ipa", "dmg"} and not lic:
                c.warn("Ships binaries without an open-source license. Review carefully before approving.")
        else:
            c.warn("No GitHub releases yet")
    except Exception:
        pass
    return meta.get("full_name") or repo


def find_emulator(query: str, reg: registry.Registry) -> dict[str, Any] | None:
    q = query.strip().lower()
    repo = parse_repo(query)
    for e in reg.emulators:
        if q in (e["id"], e["name"].lower()) or (repo and e["repo"].lower() == repo.lower()):
            return e
    return None


def find_game(title: str, reg: registry.Registry) -> dict[str, Any] | None:
    q = title.strip().lower()
    for g in reg.games:
        if q in {g["id"], g["title"].lower(), *[a.lower() for a in g.get("aliases", [])]}:
            return g
    return None


@dataclass
class Report:
    report: dict[str, Any]
    new_game: dict[str, Any] | None
    checks: Checks


def evaluate_report(fields: dict[str, str], reg: registry.Registry, issue_url: str) -> Report:
    c = Checks()
    title = clean_text(fields.get("Game", ""), 100)
    emu_q = clean_text(fields.get("Emulator", ""), 120)
    version = clean_text(fields.get("Emulator version or build", ""), 80)
    status = STATUS_CHOICES.get(fields.get("Status", "").split(" — ")[0].strip())
    evidence = clean_text(fields.get("Evidence", ""), 300)
    notes = clean_text(fields.get("Notes", ""), 400)
    hardware = clean_text(fields.get("Hardware (optional)", ""), 120)

    game = find_game(title, reg) if title else None
    new_game = None
    if not title:
        c.fail("Game title is missing")
    elif game:
        c.ok(f"Game matched: **{game['title']}**")
    else:
        new_game = {"id": slugify(title), "title": title, "aliases": []}
        if new_game["id"] in reg.game_ids:
            new_game["id"] = f"{new_game['id']}-2"
        c.warn(f"'{title}' is new and will be added to the game list. Check the spelling.")

    emu = find_emulator(emu_q, reg) if emu_q else None
    (c.ok if emu else c.fail)(
        f"Emulator matched: **{emu['name']}**" if emu else f"Emulator '{emu_q}' is not tracked. Use its name or repo URL."
    )
    (c.ok if status else c.fail)(f"Status: {registry.STATUS_LABELS[status]}" if status else "Pick a status")
    if re.match(r"^https://\S+$", evidence):
        c.ok("Evidence link provided")
    else:
        c.fail("Evidence must be an https link (video, screenshot or log)")
    if not version:
        c.warn("No emulator version given")

    report: dict[str, Any] = {
        "game": (game or new_game or {}).get("id", ""),
        "emulator": (emu or {}).get("id", ""),
        "status": status or "",
        "verified": True,
        "date": datetime.now(timezone.utc).date().isoformat(),
        "source": issue_url,
    }
    if evidence:
        report["evidence"] = evidence
    if version:
        report["version"] = version
    if hardware:
        report["hardware"] = hardware
    if notes:
        report["notes"] = notes
    return Report(report, new_game, c)


# --------------------------------------------------------------------------- event plumbing
def load_event() -> dict[str, Any]:
    path = os.environ.get("GITHUB_EVENT_PATH")
    if not path:
        raise SystemExit("GITHUB_EVENT_PATH is not set (this command runs inside GitHub Actions)")
    return json.loads(Path(path).read_text(encoding="utf-8"))


def issue_kind(issue: dict[str, Any]) -> str | None:
    labels = {l["name"] for l in issue.get("labels", [])}
    if SUBMISSION_LABEL in labels:
        return "submission"
    if COMPAT_LABEL in labels:
        return "report"
    return None


def upsert_comment(gh: GitHub, repo: str, number: int, body: str) -> None:
    comments = gh.get(f"/repos/{repo}/issues/{number}/comments?per_page=100") or []
    mine = next((c for c in comments if TRIAGE_MARKER in (c.get("body") or "")), None)
    if mine:
        gh.request("PATCH", f"/repos/{repo}/issues/comments/{mine['id']}", {"body": body})
    else:
        gh.request("POST", f"/repos/{repo}/issues/{number}/comments", {"body": body})


def set_output(**values: str) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if not out:
        for k, v in values.items():
            print(f"{k}={v}")
        return
    with open(out, "a", encoding="utf-8") as fh:
        for k, v in values.items():
            fh.write(f"{k}<<__EOF__\n{v}\n__EOF__\n")


def triage(argv: list[str]) -> int:
    event = load_event()
    issue = event["issue"]
    repo = event["repository"]["full_name"]
    kind = issue_kind(issue)
    if not kind:
        print("Not a tracker issue; nothing to do.")
        return 0
    gh = GitHub.from_env()
    reg = registry.load()
    fields = parse_form(issue.get("body") or "")
    if kind == "submission":
        checks = evaluate_submission(fields, reg, gh).checks
        title = "Automated submission checks"
    else:
        checks = evaluate_report(fields, reg, issue["html_url"]).checks
        title = "Automated report checks"
    footer = (
        "Fix the ❌ items by editing the issue. These checks re-run on every edit."
        if checks.errors
        else "A maintainer will review this. Adding the `approved` label publishes it automatically."
    )
    upsert_comment(gh, repo, issue["number"], checks.markdown(title, footer))
    print(f"Triage posted: {len(checks.errors)} errors, {len(checks.warnings)} warnings")
    return 0


def approve(argv: list[str]) -> int:
    event = load_event()
    issue = event["issue"]
    repo = event["repository"]["full_name"]
    sender = event["sender"]["login"]
    gh = GitHub.from_env()

    perm = gh.get(f"/repos/{repo}/collaborators/{sender}/permission").get("permission")
    if perm not in APPROVER_PERMISSIONS:
        print(f"{sender} has '{perm}' permission; approval ignored.", file=sys.stderr)
        set_output(result="forbidden", message=f"@{sender} does not have permission to approve submissions.")
        return 0

    kind = issue_kind(issue)
    reg = registry.load()
    fields = parse_form(issue.get("body") or "")

    if kind == "submission":
        sub = evaluate_submission(fields, reg, gh)
        if sub.checks.errors:
            return _reject(sub.checks)
        reg.emulators.append(sub.entry)
        reg.emulators.sort(key=_emulator_sort_key)
        problems = registry.validate(reg)
        if problems:
            return _reject(Checks(errors=problems))
        registry.save("emulators.json", "emulators", reg.emulators)
        readme.update(reg)
        e = sub.entry
        set_output(
            result="approved",
            commit=f"data: add {e['name']} ({e['repo']}) — closes #{issue['number']}",
            message=f"Thanks! **{e['name']}** is now listed. The site updates within a few minutes.",
        )
        return 0

    if kind == "report":
        rep = evaluate_report(fields, reg, issue["html_url"])
        if rep.checks.errors:
            return _reject(rep.checks)
        if rep.new_game:
            reg.games.append(rep.new_game)
        reg.reports.append(rep.report)
        problems = registry.validate(reg)
        if problems:
            return _reject(Checks(errors=problems))
        if rep.new_game:
            registry.save("games.json", "games", reg.games)
        registry.save("compatibility.json", "reports", reg.reports)
        r = rep.report
        set_output(
            result="approved",
            commit=f"data: {r['game']} on {r['emulator']} → {r['status']} — closes #{issue['number']}",
            message="Thanks! The report has been added to the compatibility list.",
        )
        return 0

    set_output(result="ignored", message="")
    return 0


def _reject(checks: Checks) -> int:
    set_output(
        result="rejected",
        message=checks.markdown(
            "Could not approve automatically",
            "Fix the ❌ items by editing the issue, then add the `approved` label again.",
        ),
    )
    return 0


def _emulator_sort_key(e: dict[str, Any]) -> tuple:
    order = list(registry.CATEGORIES)
    return (e["tier"] != "featured", order.index(e["category"]), e["name"].lower())
