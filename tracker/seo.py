"""Generate crawler-friendly static HTML, dedicated game/emulator pages, sitemap.xml, and IndexNow pings."""

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

from . import registry

BASE_URL = "https://its-zain-dev.github.io/ps5-emutrack"
REPO_URL = "https://github.com/its-zain-dev/ps5-emutrack"
SUBMIT_URL = f"{REPO_URL}/issues/new?template=submit-emulator.yml"
REPORT_URL = f"{REPO_URL}/issues/new?template=compatibility-report.yml"
INDEXNOW_KEY_NAME = "7862e477294f4e6572602570d152cbdf.txt"

MATRIX_COLUMNS = ("kytyps5", "sharpemu", "anyps5", "prosperity", "shadps4")
STATUS_RANK = {"nothing": 0, "boots": 1, "menus": 2, "ingame": 3, "playable": 4}
FOLD_LIMIT = 6


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


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
    """Avoid thin/empty pages for 0-star forks with no releases, summary, or reports."""
    if emu.get("tier") == "featured":
        return True
    if emu.get("release") is not None:
        return True
    if report_counts.get(emu["id"], 0) > 0:
        return True
    stars = int((emu.get("github") or {}).get("stars") or 0)
    return stars >= 10


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
            f'<article class="card{" is-featured" if emu.get("tier") == "featured" else ""}">'
            f'<div class="card-top">'
            f'<img class="avatar" src="{avatar}" alt="" width="38" height="38" loading="lazy">'
            f'<div class="card-title"><h3><a href="{esc(emu["url"])}" target="_blank" rel="noopener">{esc(emu["name"])}</a></h3>'
            f'<span class="repo">{esc(emu["repo"])}</span></div></div>'
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
            pills += f' <span class="pill-upcoming">Release · {esc(game["releaseDate"])}</span>'
        dev = f'<div class="game-sub">{esc(game["developer"])}</div>' if game.get("developer") else ""
        rows.append(
            f'<tr class="game-row"><td>'
            f'<div class="game-title"><a href="./games/{esc(game["id"])}/">{esc(game["title"])}</a>{pills}</div>'
            f"{dev}</td>{''.join(cells)}</tr>"
        )
    return f'<thead><tr><th>Game</th>{head_cells}</tr></thead><tbody>{"".join(rows)}</tbody>'


def _render_home_guides(games: list[dict[str, Any]], emus_with_pages: list[dict[str, Any]]) -> str:
    game_links = " · ".join(
        f'<a href="./games/{esc(g["id"])}/">{esc(g["title"])}</a>' for g in games
    )
    emu_links = " · ".join(
        f'<a href="./emulators/{esc(e["id"])}/">{esc(e["name"])}</a>' for e in emus_with_pages
    )
    return (
        f'<div class="guides-grid">'
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
) -> str:
    ld_scripts = "\n    ".join(
        f'<script type="application/ld+json">{json.dumps(b, ensure_ascii=False)}</script>' for b in ld_blocks
    )
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{esc(title)}</title>
    <meta name="description" content="{esc(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="theme-color" content="#0b0f17" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f6f8fb" media="(prefers-color-scheme: light)" />
    <meta name="color-scheme" content="dark light" />
    <link rel="canonical" href="{esc(canonical)}" />
    <link rel="icon" href="../../assets/icon.svg" type="image/svg+xml" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="PS5 EmuTrack" />
    <meta property="og:title" content="{esc(title)}" />
    <meta property="og:description" content="{esc(description)}" />
    <meta property="og:url" content="{esc(canonical)}" />
    <meta property="og:image" content="{BASE_URL}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="stylesheet" href="../../assets/styles.css" />
    {ld_scripts}
  </head>
  <body>
    <header class="site-header">
      <div class="container header-inner">
        <a href="../../" class="brand" aria-label="PS5 EmuTrack home">
          <img src="../../assets/icon.svg" alt="" width="28" height="28" />
          <span>PS5 <b>EmuTrack</b></span>
        </a>
        <nav class="nav" aria-label="Primary">
          <a href="../../#emulators">Emulators</a>
          <a href="../../#compatibility">Compatibility</a>
          <a href="../../#contribute">Contribute</a>
          <a href="../../#faq">FAQ</a>
        </nav>
        <div class="header-actions">
          <a class="btn btn-ghost btn-sm" href="../../">Interactive Hub</a>
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
          <a href="../../">Home</a>
          <a href="../../#emulators">Emulators</a>
          <a href="../../#compatibility">Compatibility</a>
          <a href="../../data.json">data.json</a>
          <span class="muted">Updated {esc(fmt_date(generated_at))}</span>
        </p>
      </div>
    </footer>
  </body>
</html>
"""


def _render_game_page(
    game: dict[str, Any],
    payload: dict[str, Any],
    emu_page_ids: set[str],
) -> str:
    gid = game["id"]
    title_text = game["title"]
    by_id = {e["id"]: e for e in payload["emulators"]}
    status_labels = {s["id"]: s["label"] for s in payload["statuses"]}
    reports = [r for r in payload["reports"] if r["game"] == gid]
    cols = [by_id[eid] for eid in MATRIX_COLUMNS if eid in by_id]
    generated_at = payload.get("generatedAt", "")

    if gid == "gta-vi":
        page_title = "Can Any PS5 Emulator Run GTA VI on PC? Live KytyPS5 & SharpEmu Status | PS5 EmuTrack"
        page_desc = (
            "Live status for Grand Theft Auto VI (GTA VI) across open-source PS5 emulators (KytyPS5, SharpEmu, AnyPS5, Prosperity): "
            "launch reality check, release tracking, and how to avoid fake GTA 6 PC emulator malware."
        )
    else:
        page_title = f"{title_text} — PS5 Emulator Compatibility (KytyPS5, SharpEmu, AnyPS5) | PS5 EmuTrack"
        page_desc = (
            f"Check {title_text} compatibility across open-source PS5 emulators including KytyPS5, SharpEmu, and AnyPS5, "
            "plus verified test reports and build notes."
        )

    canonical = f"{BASE_URL}/games/{gid}/"
    meta_badges = []
    if game.get("developer"):
        meta_badges.append(f'<span class="badge">{esc(game["developer"])}</span>')
    if game.get("platform"):
        meta_badges.append(f'<span class="badge">{esc(game["platform"])}</span>')
    if game.get("releaseDate"):
        meta_badges.append(f'<span class="pill-upcoming">Console release: {esc(game["releaseDate"])}</span>')

    gta_callout = ""
    faq_entries = [
        {
            "@type": "Question",
            "name": f"Can open-source PS5 emulators run {title_text} right now?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": (
                    f"No PS5 emulator can run {title_text} right now. Console release is scheduled for {game.get('releaseDate', 'TBA')}, "
                    "and running a new AAA PS5 title via emulation on PC requires years of reverse engineering."
                    if gid == "gta-vi"
                    else f"Check the live compatibility table on this page for the latest reported status of {title_text} across KytyPS5, SharpEmu, AnyPS5, and Prosperity."
                ),
            },
        },
        {
            "@type": "Question",
            "name": f"Where can I safely download PS5 emulators to test {title_text}?",
            "acceptedAnswer": {
                "@type": "Answer",
                "text": "Download open-source emulators strictly from their official GitHub Releases pages (such as KytyPS5/KytyPS5 or sharpemu/sharpemu). Never trust third-party file hosts or 'GTA 6 PC emulator' installers.",
            },
        },
    ]

    if gid == "gta-vi":
        gta_callout = f"""
        <div class="prose-card">
          <h2>GTA VI on PC via PS5 Emulator — Launch Reality Check</h2>
          <p>
            <strong>Short answer: No.</strong> Grand Theft Auto VI launches on PlayStation 5 and Xbox Series X|S on
            <strong>{esc(game.get("releaseDate", "2026-11-19"))}</strong> with no official PC port yet.
            While open-source projects like <a href="../../emulators/kytyps5/">KytyPS5</a> have demonstrated experimental boots of older titles
            such as the PS5 version of <em>GTA V</em> for brief scenes before crashing, emulating a brand-new, complex open-world PS5 release
            at launch is not currently possible.
          </p>
          <p>
            <strong>Watch out for scams:</strong> Dozens of fake "GTA 6 PC Emulator" downloads circulate on launch week.
            Real PS5 emulators are open-source on GitHub and never require surveys, passwords, or third-party cloud mirrors.
            This page updates automatically every hour from real GitHub releases and sourced community compatibility reports.
          </p>
        </div>"""

    rows_html = []
    for emu in cols:
        best = pick_best_report([r for r in reports if r["emulator"] == emu["id"]])
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
        <h1>{esc(title_text)} — PS5 Emulator Compatibility</h1>
        <p class="lead">Live status across tracked open-source PlayStation 5 emulators · Last refreshed {esc(fmt_date(generated_at))}.</p>
        {aliases_note}
        <div class="cta-row" style="margin-top:16px">
          <a class="btn btn-primary btn-sm" href="{esc(prefill)}" target="_blank" rel="noopener">Submit verified report</a>
          <a class="btn btn-ghost btn-sm" href="../../#compatibility">Back to full matrix</a>
        </div>
      </div>

      {gta_callout}

      <section style="margin-top:28px">
        <h2 style="margin-bottom:12px">Status by Featured Emulator</h2>
        <div class="table-wrap">
          <table class="compat">
            <thead><tr><th>Emulator</th><th>Status</th><th>Verification</th><th>Latest Build</th><th>Notes</th></tr></thead>
            <tbody>{"".join(rows_html)}</tbody>
          </table>
        </div>
      </section>

      <section style="margin-top:28px">
        <h2 style="margin-bottom:10px">Other Tracked Games</h2>
        <p class="small muted">{other_games}</p>
      </section>
    """

    ld_blocks = [
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "PS5 EmuTrack", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": "Compatibility", "item": f"{BASE_URL}/#compatibility"},
                {"@type": "ListItem", "position": 3, "name": title_text, "item": canonical},
            ],
        },
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faq_entries,
        },
    ]
    return _page_shell(
        title=page_title,
        description=page_desc,
        canonical=canonical,
        ld_blocks=ld_blocks,
        body_html=body,
        generated_at=generated_at,
    )


def _render_emulator_page(
    emu: dict[str, Any],
    payload: dict[str, Any],
    emu_page_ids: set[str],
) -> str:
    eid = emu["id"]
    name = emu["name"]
    gh = emu.get("github") or {}
    rel = emu.get("release")
    by_id = {e["id"]: e for e in payload["emulators"]}
    games_by_id = {g["id"]: g for g in payload["games"]}
    status_labels = {s["id"]: s["label"] for s in payload["statuses"]}
    cat_label = payload["categories"].get(emu["category"], emu["category"])
    generated_at = payload.get("generatedAt", "")

    desc = emu.get("summary") or gh.get("description") or f"{name} open-source PlayStation emulation project on GitHub."
    canonical = f"{BASE_URL}/emulators/{eid}/"
    page_title = f"{name} PS5 Emulator — Latest Releases, Compatibility & Info | PS5 EmuTrack"
    page_desc = (
        f"{name} ({emu['repo']}): {desc} Latest GitHub release: {rel['tag'] if rel else 'source builds'}, "
        f"{gh.get('stars', 0):,} stars, platforms: {', '.join(emu.get('platforms') or ['See repo'])}."
    )[:160]

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
          <p class="small muted" style="margin-bottom:12px">Published {esc(fmt_date(rel.get("publishedAt")))} · <a href="{esc(rel["url"])}" target="_blank" rel="noopener noreferrer">View release on GitHub ↗</a></p>
          {assets_html}
          <h3>Release Notes</h3>
          <div class="notes" style="margin-top:8px">{render_markdown_html(rel.get("notes"))}</div>
        </section>"""

    reports = [r for r in payload["reports"] if r["emulator"] == eid]
    reports_section = ""
    if reports:
        r_rows = []
        for r in reports:
            g = games_by_id.get(r["game"], {"id": r["game"], "title": r["game"]})
            cls = f'status {esc(r["status"])}{"" if r["verified"] else " unverified"}'
            r_rows.append(
                f'<tr><td><a href="../../games/{esc(g["id"])}/"><strong>{esc(g["title"])}</strong></a></td>'
                f'<td><span class="{cls}">{esc(status_labels.get(r["status"], r["status"]))}</span></td>'
                f'<td>{"Verified" if r["verified"] else "Unverified"}</td>'
                f'<td>{esc(r.get("notes") or "—")}</td></tr>'
            )
        reports_section = f"""
        <section style="margin-top:24px">
          <h2 style="margin-bottom:12px">Tracked Game Compatibility ({len(reports)})</h2>
          <div class="table-wrap"><table class="compat">
            <thead><tr><th>Game</th><th>Status</th><th>Verification</th><th>Notes</th></tr></thead>
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
      {reports_section}

      {f'<section style="margin-top:28px"><h2 style="margin-bottom:10px">Related {esc(cat_label)} Projects</h2><p class="small muted">{siblings}</p></section>' if siblings else ""}
    """

    ld_blocks = [
        {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": name,
            "applicationCategory": "GameApplication",
            "operatingSystem": ", ".join(emu.get("platforms") or ["Cross-platform"]),
            "url": canonical,
            "codeRepository": emu["url"],
            "description": desc,
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        },
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
    )


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


def generate(payload: dict[str, Any], site_dir: Path | None = None) -> dict[str, int]:
    """Prerender site/index.html sections, build game/emulator subpages, and update sitemap.xml."""
    target = site_dir or (registry.ROOT / "site")
    now = datetime.now(timezone.utc)
    today = (payload.get("generatedAt") or now.strftime("%Y-%m-%d"))[:10]

    report_counts: dict[str, int] = {}
    for r in payload["reports"]:
        report_counts[r["emulator"]] = report_counts.get(r["emulator"], 0) + 1

    emus_with_pages = [e for e in payload["emulators"] if has_substantive_page(e, report_counts)]
    emu_page_ids = {e["id"] for e in emus_with_pages}

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
        doc = _replace_marker(doc, "GUIDES", _render_home_guides(payload["games"], emus_with_pages))
        index_path.write_text(doc, encoding="utf-8")

    sitemap_urls: list[tuple[str, str, str, str]] = [
        (f"{BASE_URL}/", today, "hourly", "1.0"),
    ]

    games_dir = target / "games"
    for g in payload["games"]:
        g_dir = games_dir / g["id"]
        g_dir.mkdir(parents=True, exist_ok=True)
        (g_dir / "index.html").write_text(_render_game_page(g, payload, emu_page_ids), encoding="utf-8")
        prio = "0.9" if g["id"] == "gta-vi" else "0.8"
        sitemap_urls.append((f"{BASE_URL}/games/{g['id']}/", today, "hourly" if g["id"] == "gta-vi" else "daily", prio))

    emus_dir = target / "emulators"
    for e in emus_with_pages:
        e_dir = emus_dir / e["id"]
        e_dir.mkdir(parents=True, exist_ok=True)
        (e_dir / "index.html").write_text(_render_emulator_page(e, payload, emu_page_ids), encoding="utf-8")
        prio = "0.9" if e.get("tier") == "featured" else "0.7"
        sitemap_urls.append((f"{BASE_URL}/emulators/{e['id']}/", today, "daily", prio))

    _write_sitemap(target, sitemap_urls)
    return {"games": len(payload["games"]), "emulators": len(emus_with_pages), "urls": len(sitemap_urls)}


def submit_indexnow(site_dir: Path | None = None) -> int:
    """Notify Bing / IndexNow of all URLs in site/sitemap.xml."""
    target = site_dir or (registry.ROOT / "site")
    key_path = target / INDEXNOW_KEY_NAME
    sitemap_path = target / "sitemap.xml"
    if not key_path.exists() or not sitemap_path.exists():
        print("[warn] IndexNow key or sitemap.xml missing; skipping.")
        return 0
    key = key_path.read_text(encoding="utf-8").strip()
    root = ET.fromstring(sitemap_path.read_text(encoding="utf-8"))
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [el.text.strip() for el in root.findall("s:url/s:loc", ns) if el.text]
    if not urls:
        return 0

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
            print(f"IndexNow submitted {len(urls)} URLs (HTTP {resp.status})")
    except urllib.error.HTTPError as exc:
        print(f"[warn] IndexNow returned HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:200]}")
    except Exception as exc:
        print(f"[warn] IndexNow request failed ({exc}); continuing.")
    return 0
