"""PS5 EmuTrack data pipeline.

    python -m tracker validate        check data/*.json
    python -m tracker build           fetch GitHub metadata -> site/data.json
    python -m tracker readme [--check] regenerate the README emulator list
    python -m tracker triage          (Actions) comment automated checks on an issue
    python -m tracker approve         (Actions) apply an approved issue to data/
"""

from __future__ import annotations

import sys

from . import build, issues, readme, registry


def validate(argv: list[str]) -> int:
    reg = registry.load()
    if reg.errors:
        print("Invalid data:\n  " + "\n  ".join(reg.errors), file=sys.stderr)
        return 1
    print(f"OK: {len(reg.emulators)} emulators, {len(reg.games)} games, {len(reg.reports)} reports")
    return 0


def readme_cmd(argv: list[str]) -> int:
    reg = registry.load()
    if "--check" in argv:
        expected = readme.render(reg)
        if expected not in readme.README.read_text(encoding="utf-8"):
            print("README.md is out of date. Run: python -m tracker readme", file=sys.stderr)
            return 1
        print("README.md is up to date")
        return 0
    print("README.md updated" if readme.update(reg) else "README.md already up to date")
    return 0


COMMANDS = {
    "validate": validate,
    "build": build.main,
    "readme": readme_cmd,
    "triage": issues.triage,
    "approve": issues.approve,
}


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        return 2
    return COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())
