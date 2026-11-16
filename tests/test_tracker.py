import re
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from tracker import build, issues, readme, registry, seo


class RegistryTests(unittest.TestCase):
    def test_live_data_is_valid(self) -> None:
        reg = registry.load()
        self.assertEqual(reg.errors, [])
        self.assertGreater(len(reg.emulators), 0)
        self.assertGreater(len(reg.games), 0)

    def test_validate_catches_bad_entries(self) -> None:
        reg = registry.Registry(
            emulators=[
                {
                    "id": "dup",
                    "name": "One",
                    "repo": "bad-repo",
                    "category": "ps5",
                    "tier": "featured",
                    "addedAt": "2026-11-15",
                },
                {
                    "id": "dup",
                    "name": "Two",
                    "repo": "owner/two",
                    "category": "ps5",
                    "tier": "community",
                    "addedAt": "2026-11-15",
                },
            ],
            games=[{"id": "game-one", "title": "Game One"}],
            reports=[
                {
                    "game": "game-one",
                    "emulator": "dup",
                    "status": "ingame",
                    "verified": True,
                    "date": "2026-11-15",
                }
            ],
        )
        errors = registry.validate(reg)
        joined = "\n".join(errors)
        self.assertIn("duplicate id", joined)
        self.assertIn("repo must look like 'owner/name'", joined)
        self.assertIn("verified reports need an https 'source' link", joined)


class IssueParsingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reg = registry.load()

    def test_parse_form_extracts_sections_and_clears_no_response(self) -> None:
        body = (
            "### Emulator name\n\nNovaPS5\n\n"
            "### Fork of (optional)\n\n_No response_\n\n"
            "### Platforms\n\n- [X] Linux\n- [ ] Windows\n"
        )
        fields = issues.parse_form(body)
        self.assertEqual(fields["Emulator name"], "NovaPS5")
        self.assertEqual(fields["Fork of (optional)"], "")
        self.assertEqual(issues.checked_boxes(fields["Platforms"]), ["Linux"])

    def test_evaluate_submission_rejects_duplicate_repo(self) -> None:
        fields = {
            "Emulator name": "Kyty Clone",
            "Repository": "https://github.com/KytyPS5/KytyPS5",
            "Category": "PS5 emulator / compatibility layer",
            "Short description": "A duplicate test submission for unit testing.",
            "Platforms": "- [x] Windows",
        }
        sub = issues.evaluate_submission(fields, self.reg, gh=None)
        self.assertTrue(any("already listed" in e for e in sub.checks.errors))

    def test_evaluate_submission_accepts_new_entry(self) -> None:
        fields = {
            "Emulator name": "TestPS5",
            "Repository": "https://github.com/example-org/TestPS5",
            "Category": "PS5 emulator / compatibility layer",
            "Short description": "Experimental PS5 HLE test runtime for unit testing.",
            "Fork of (optional)": "KytyPS5",
            "Platforms": "- [x] Linux\n- [x] Windows",
        }
        sub = issues.evaluate_submission(fields, self.reg, gh=None)
        self.assertEqual(sub.checks.errors, [])
        self.assertEqual(sub.entry["id"], "testps5")
        self.assertEqual(sub.entry["repo"], "example-org/TestPS5")
        self.assertEqual(sub.entry["forkOf"], "kytyps5")
        self.assertEqual(sub.entry["platforms"], ["Linux", "Windows"])

    def test_evaluate_report_requires_https_evidence(self) -> None:
        fields = {
            "Game": "Astro Bot",
            "Emulator": "KytyPS5",
            "Emulator version or build": "v0.4.2",
            "Status": "In-Game — reaches gameplay with major issues",
            "Evidence": "not-a-url",
        }
        rep = issues.evaluate_report(fields, self.reg, "https://github.com/its-zain-dev/ps5-emutrack/issues/99")
        self.assertTrue(any("Evidence" in e for e in rep.checks.errors))

    def test_evaluate_report_creates_new_game_when_unlisted(self) -> None:
        fields = {
            "Game": "Brand New Title",
            "Emulator": "KytyPS5",
            "Emulator version or build": "2026-11-16",
            "Status": "Boots — shows intro or loading screen only",
            "Evidence": "https://example.com/clip.mp4",
            "Notes": "Shows Sony logo then exits.",
        }
        rep = issues.evaluate_report(fields, self.reg, "https://github.com/its-zain-dev/ps5-emutrack/issues/100")
        self.assertEqual(rep.checks.errors, [])
        self.assertIsNotNone(rep.new_game)
        self.assertEqual(rep.new_game["id"], "brand-new-title")
        self.assertTrue(rep.report["verified"])
        self.assertEqual(rep.report["status"], "boots")


class BuildAndReadmeTests(unittest.TestCase):
    def test_pick_release_skips_drafts_and_picks_newest(self) -> None:
        releases = [
            {"tag_name": "v1.0", "draft": True, "published_at": "2026-11-16T00:00:00Z"},
            {"tag_name": "v0.8", "draft": False, "published_at": "2026-11-10T00:00:00Z"},
            {"tag_name": "v0.9-pre", "draft": False, "prerelease": True, "published_at": "2026-11-14T00:00:00Z"},
        ]
        picked = build.pick_release(releases)
        self.assertIsNotNone(picked)
        self.assertEqual(picked["tag_name"], "v0.9-pre")

    def test_shape_release_filters_non_github_assets(self) -> None:
        shaped = build.shape_release(
            {
                "tag_name": "v1.2",
                "name": "Release 1.2",
                "published_at": "2026-11-15T12:00:00Z",
                "html_url": "https://github.com/owner/repo/releases/tag/v1.2",
                "body": "Fixes",
                "assets": [
                    {"name": "ok.zip", "size": 1024, "download_count": 5, "browser_download_url": "https://github.com/owner/repo/releases/download/v1.2/ok.zip"},
                    {"name": "bad.exe", "size": 999, "download_count": 1, "browser_download_url": "https://evil.example/bad.exe"},
                ],
            }
        )
        self.assertEqual(len(shaped["assets"]), 1)
        self.assertEqual(shaped["assets"][0]["name"], "ok.zip")

    def test_readme_is_in_sync_with_registry(self) -> None:
        reg = registry.load()
        rendered = readme.render(reg)
        text = Path(readme.README).read_text(encoding="utf-8")
        self.assertIn(rendered, text)
        self.assertIn("<details>", rendered)

    def test_readme_svg_assets_exist_and_are_valid_xml(self) -> None:
        text = Path(readme.README).read_text(encoding="utf-8")
        srcs = re.findall(r'src="(assets/readme/[^"]+\.svg)"', text)
        self.assertGreaterEqual(len(srcs), 4)
        for rel in set(srcs):
            path = registry.ROOT / rel
            self.assertTrue(path.exists(), f"Missing README asset: {rel}")
            ET.parse(path)


class SeoTests(unittest.TestCase):
    def test_seo_generate_builds_subpages_and_sitemap(self) -> None:
        reg = registry.load()
        payload = {
            "schemaVersion": 2,
            "generatedAt": "2026-11-16T23:00:00Z",
            "categories": registry.CATEGORIES,
            "statuses": [{"id": s, "label": registry.STATUS_LABELS[s]} for s in registry.STATUSES],
            "emulators": [
                {
                    **e,
                    "url": f"https://github.com/{e['repo']}",
                    "github": {"stars": 100 if e["tier"] == "featured" else 0, "language": "C++", "pushedAt": "2026-11-15T00:00:00Z"},
                    "release": {"tag": "v1.0", "name": "v1.0", "publishedAt": "2026-11-15T00:00:00Z", "url": f"https://github.com/{e['repo']}/releases/tag/v1.0", "notes": "Test <script>alert(1)</script>", "assets": []}
                    if e["id"] == "kytyps5"
                    else None,
                }
                for e in reg.emulators
            ],
            "games": reg.games,
            "reports": reg.reports,
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            (tmp_site / "index.html").write_text(
                "<!-- SSR:STATS --><!-- /SSR:STATS -->"
                "<!-- SSR:EMULATORS --><!-- /SSR:EMULATORS -->"
                "<!-- SSR:COMPAT --><!-- /SSR:COMPAT -->"
                "<!-- SSR:GUIDES --><!-- /SSR:GUIDES -->",
                encoding="utf-8",
            )
            counts = seo.generate(payload, tmp_site)
            self.assertEqual(counts["games"], len(reg.games))
            self.assertTrue((tmp_site / "games" / "gta-vi" / "index.html").exists())
            self.assertTrue((tmp_site / "emulators" / "kytyps5" / "index.html").exists())
            kyty_html = (tmp_site / "emulators" / "kytyps5" / "index.html").read_text(encoding="utf-8")
            self.assertNotIn("<script>alert(1)</script>", kyty_html)
            self.assertIn("&lt;script&gt;", kyty_html)
            sitemap = ET.fromstring((tmp_site / "sitemap.xml").read_text(encoding="utf-8"))
            locs = sitemap.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc")
            self.assertEqual(len(locs), counts["urls"])


if __name__ == "__main__":
    unittest.main()
