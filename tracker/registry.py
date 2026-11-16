"""Load and validate the hand-curated data files in data/."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

CATEGORIES = {
    "ps5": "PS5 emulator",
    "fork": "Fork / custom build",
    "port": "Port / frontend",
    "ps4": "PS4 & related",
}
TIERS = ("featured", "community")
PLATFORMS = ("Windows", "Linux", "macOS", "Android", "iOS", "PS4", "Web")
# Ordered worst -> best. Mirrors the scale used by shadPS4 / RPCS3 compatibility lists.
STATUSES = ("nothing", "boots", "menus", "ingame", "playable")
STATUS_LABELS = {
    "nothing": "Nothing",
    "boots": "Boots",
    "menus": "Menus",
    "ingame": "In-Game",
    "playable": "Playable",
}

ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REPO_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$")
URL_RE = re.compile(r"^https://[^\s<>\"']+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass
class Registry:
    emulators: list[dict[str, Any]]
    games: list[dict[str, Any]]
    reports: list[dict[str, Any]]
    errors: list[str] = field(default_factory=list)

    @property
    def emulator_ids(self) -> set[str]:
        return {e["id"] for e in self.emulators}

    @property
    def game_ids(self) -> set[str]:
        return {g["id"] for g in self.games}

    def find_repo(self, repo: str) -> dict[str, Any] | None:
        return next((e for e in self.emulators if e["repo"].lower() == repo.lower()), None)


def _read(name: str, key: str, data_dir: Path) -> list[dict[str, Any]]:
    return json.loads((data_dir / name).read_text(encoding="utf-8"))[key]


def load(data_dir: Path = DATA) -> Registry:
    reg = Registry(
        emulators=_read("emulators.json", "emulators", data_dir),
        games=_read("games.json", "games", data_dir),
        reports=_read("compatibility.json", "reports", data_dir),
    )
    reg.errors = validate(reg)
    return reg


def _valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def validate(reg: Registry) -> list[str]:
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_repos: set[str] = set()

    for i, e in enumerate(reg.emulators):
        where = f"emulators[{i}] ({e.get('id', '?')})"
        for key in ("id", "name", "repo", "category", "tier", "addedAt"):
            if not e.get(key):
                errors.append(f"{where}: missing '{key}'")
        if e.get("id") and not ID_RE.match(e["id"]):
            errors.append(f"{where}: id must be kebab-case")
        if e.get("id") in seen_ids:
            errors.append(f"{where}: duplicate id")
        seen_ids.add(e.get("id"))
        repo = str(e.get("repo", ""))
        if not REPO_RE.match(repo):
            errors.append(f"{where}: repo must look like 'owner/name'")
        if repo.lower() in seen_repos:
            errors.append(f"{where}: duplicate repo {repo}")
        seen_repos.add(repo.lower())
        if e.get("category") not in CATEGORIES:
            errors.append(f"{where}: unknown category {e.get('category')!r}")
        if e.get("tier") not in TIERS:
            errors.append(f"{where}: unknown tier {e.get('tier')!r}")
        for p in e.get("platforms", []):
            if p not in PLATFORMS:
                errors.append(f"{where}: unknown platform {p!r}")
        if e.get("addedAt") and not _valid_date(e["addedAt"]):
            errors.append(f"{where}: addedAt must be YYYY-MM-DD")
        if "summary" in e and not (10 <= len(e["summary"]) <= 280):
            errors.append(f"{where}: summary must be 10-280 characters")

    ids = reg.emulator_ids
    for i, e in enumerate(reg.emulators):
        if e.get("forkOf") and e["forkOf"] not in ids:
            errors.append(f"emulators[{i}] ({e['id']}): forkOf references unknown emulator {e['forkOf']!r}")

    seen_games: set[str] = set()
    for i, g in enumerate(reg.games):
        where = f"games[{i}] ({g.get('id', '?')})"
        if not g.get("id") or not ID_RE.match(g["id"]):
            errors.append(f"{where}: missing or invalid id")
        if g.get("id") in seen_games:
            errors.append(f"{where}: duplicate id")
        seen_games.add(g.get("id"))
        if not g.get("title"):
            errors.append(f"{where}: missing title")
        if "releaseDate" in g and not _valid_date(g["releaseDate"]):
            errors.append(f"{where}: releaseDate must be YYYY-MM-DD")

    games = reg.game_ids
    for i, r in enumerate(reg.reports):
        where = f"reports[{i}]"
        if r.get("game") not in games:
            errors.append(f"{where}: unknown game {r.get('game')!r}")
        if r.get("emulator") not in ids:
            errors.append(f"{where}: unknown emulator {r.get('emulator')!r}")
        if r.get("status") not in STATUSES:
            errors.append(f"{where}: unknown status {r.get('status')!r}")
        if not isinstance(r.get("verified"), bool):
            errors.append(f"{where}: 'verified' must be true or false")
        if r.get("verified") and not (isinstance(r.get("source"), str) and URL_RE.match(r["source"])):
            errors.append(f"{where}: verified reports need an https 'source' link")
        if r.get("source") is not None and not URL_RE.match(str(r["source"])):
            errors.append(f"{where}: source must be an https URL")
        if not _valid_date(r.get("date")):
            errors.append(f"{where}: date must be YYYY-MM-DD")
    return errors


def save(name: str, key: str, items: list[dict[str, Any]], data_dir: Path = DATA) -> None:
    path = data_dir / name
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload[key] = items
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
