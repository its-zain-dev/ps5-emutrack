import json
import re
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

from tracker import build, guides, issues, readme, registry, seo


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
    def _sample_payload(self) -> dict:
        reg = registry.load()
        return {
            "schemaVersion": 2,
            "generatedAt": "2026-11-16T23:00:00Z",
            "categories": registry.CATEGORIES,
            "statuses": [{"id": s, "label": registry.STATUS_LABELS[s]} for s in registry.STATUSES],
            "emulators": [
                {
                    **e,
                    "url": f"https://github.com/{e['repo']}",
                    "github": {
                        "stars": 100 if e["tier"] == "featured" else 0,
                        "language": "C++",
                        "license": "GPL-2.0",
                        "pushedAt": "2026-11-15T00:00:00Z",
                    },
                    "release": {
                        "tag": "KytyPS5-2026-11-16-d45b086",
                        "name": "v1.0",
                        "publishedAt": "2026-11-15T00:00:00Z",
                        "url": f"https://github.com/{e['repo']}/releases/tag/v1.0",
                        "notes": "Test <script>alert(1)</script>",
                        "assets": [],
                    }
                    if e["id"] in ("kytyps5", "shadps4")
                    else None,
                }
                for e in reg.emulators
            ],
            "games": reg.games,
            "reports": reg.reports,
        }

    def test_seo_generate_builds_subpages_and_sitemap(self) -> None:
        reg = registry.load()
        payload = self._sample_payload()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            (tmp_site / "index.html").write_text(
                "<!-- SSR:STATS --><!-- /SSR:STATS -->"
                "<!-- SSR:EMULATORS --><!-- /SSR:EMULATORS -->"
                "<!-- SSR:COMPAT --><!-- /SSR:COMPAT -->"
                "<!-- SSR:GUIDES --><!-- /SSR:GUIDES -->"
                "<!-- SSR:UPDATED --><!-- /SSR:UPDATED -->",
                encoding="utf-8",
            )
            counts = seo.generate(payload, tmp_site, previous_sitemap_url=None)
            self.assertEqual(counts["games"], len(reg.games))
            self.assertGreaterEqual(counts["reports"], 1)
            self.assertEqual(counts["guides"], len(guides.GUIDES))
            self.assertTrue((tmp_site / "404.html").exists())
            self.assertTrue((tmp_site / "guides" / "index.html").exists())
            self.assertTrue((tmp_site / "games" / "gta-vi" / "index.html").exists())
            self.assertTrue((tmp_site / "emulators" / "kytyps5" / "index.html").exists())
            self.assertTrue((tmp_site / "guides" / "real-vs-fake-ps5-emulators" / "index.html").exists())
            self.assertTrue((tmp_site / "guides" / "gta-vi-pc-ps5-emulator-reality-check" / "index.html").exists())
            kyty_html = (tmp_site / "emulators" / "kytyps5" / "index.html").read_text(encoding="utf-8")
            self.assertNotIn("<script>alert(1)</script>", kyty_html)
            self.assertIn("&lt;script&gt;", kyty_html)
            sitemap = ET.fromstring((tmp_site / "sitemap.xml").read_text(encoding="utf-8"))
            ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            urls = sitemap.findall("s:url", ns)
            self.assertEqual(len(urls), counts["urls"])
            # Second identical offline run should detect 0 changed URLs
            counts2 = seo.generate(payload, tmp_site, previous_sitemap_url=None)
            self.assertEqual(counts2["changed"], 0)

    def test_404_noindex_no_canonical_and_root_relative_links(self) -> None:
        html_404 = seo._render_404_page("2026-11-17T00:00:00Z")
        self.assertIn('content="noindex, follow"', html_404)
        self.assertNotIn('rel="canonical"', html_404)
        self.assertNotIn('property="og:url"', html_404)
        self.assertIn('property="og:type" content="website"', html_404)
        rel_hrefs = re.findall(r'href="(?!https?://|/ps5-emutrack/)([^"]*)"', html_404)
        self.assertEqual(rel_hrefs, [])
        rel_srcs = re.findall(r'src="(?!https?://|/ps5-emutrack/)([^"]*)"', html_404)
        self.assertEqual(rel_srcs, [])

    def test_ps4_emulators_and_bloodborne_metadata_accurate(self) -> None:
        payload = self._sample_payload()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            seo.generate(payload, tmp_site, previous_sitemap_url=None)
            shad_html = (tmp_site / "emulators" / "shadps4" / "index.html").read_text(encoding="utf-8")
            self.assertIn("<title>shadPS4 PS4 Emulator", shad_html)
            self.assertNotIn("shadPS4 PS5 Emulator", shad_html)
            bb_html = (tmp_site / "games" / "bloodborne" / "index.html").read_text(encoding="utf-8")
            self.assertIn("shadPS4", bb_html)
            self.assertIn("PS4/PS5 Emulator Status", bb_html)

    def test_word_safe_meta_descriptions_and_concise_titles(self) -> None:
        self.assertEqual(seo.truncate_words("hello world", 20), "hello world")
        cut = seo.truncate_words("KytyPS5 release KytyPS5-2026-11-16-d45b086 for Windows Linux macOS", 42)
        self.assertLessEqual(len(cut), 42)
        self.assertTrue(cut.endswith("…"))
        self.assertNotIn("d45b", cut)

        payload = self._sample_payload()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            seo.generate(payload, tmp_site, previous_sitemap_url=None)
            for html_file in tmp_site.rglob("*.html"):
                txt = html_file.read_text(encoding="utf-8")
                m_t = re.search(r"<title>(.*?)</title>", txt, re.S)
                m_d = re.search(r'<meta[^>]+name="description"[^>]+content="(.*?)"', txt, re.S)
                self.assertIsNotNone(m_t, str(html_file))
                self.assertIsNotNone(m_d, str(html_file))
                title = m_t.group(1).replace("&amp;", "&").replace("&#x27;", "'")
                desc = m_d.group(1).replace("&amp;", "&").replace("&#x27;", "'")
                self.assertLessEqual(len(title), 65, f"Title too long in {html_file}: {title!r}")
                self.assertLessEqual(len(desc), 158, f"Description too long in {html_file}: {desc!r}")
                self.assertRegex(desc, r"[.!?…]$", f"Mid-word cut in {html_file}: {desc!r}")

    def test_jsonld_schema_enrichment_and_gta_vi_faq(self) -> None:
        payload = self._sample_payload()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            seo.generate(payload, tmp_site, previous_sitemap_url=None)

            gta_html = (tmp_site / "games" / "gta-vi" / "index.html").read_text(encoding="utf-8")
            gta_lds = [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', gta_html, re.S)]
            self.assertIn("FAQPage", [b.get("@type") for b in gta_lds])
            self.assertIn("GTA IV", gta_html)
            self.assertIn("GTAVI emulator", gta_html)

            kyty_html = (tmp_site / "emulators" / "kytyps5" / "index.html").read_text(encoding="utf-8")
            kyty_lds = [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', kyty_html, re.S)]
            soft = next(b for b in kyty_lds if b.get("@type") == "SoftwareApplication")
            self.assertEqual(soft["applicationCategory"], "UtilitiesApplication")
            self.assertIn("softwareVersion", soft)
            self.assertTrue(soft["isAccessibleForFree"])

            guide_html = (tmp_site / "guides" / "gta-vi-pc-ps5-emulator-reality-check" / "index.html").read_text(encoding="utf-8")
            guide_lds = [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', guide_html, re.S)]
            article = next(b for b in guide_lds if b.get("@type") == "TechArticle")
            self.assertIn("author", article)
            self.assertIn("publisher", article)
            self.assertIn("image", article)
            crumbs = next(b for b in guide_lds if b.get("@type") == "BreadcrumbList")
            self.assertEqual(len(crumbs["itemListElement"]), 3)

    def test_prune_stale_subpage_directories(self) -> None:
        payload = self._sample_payload()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            stale_dir = tmp_site / "emulators" / "obsolete-emu"
            stale_dir.mkdir(parents=True)
            (stale_dir / "index.html").write_text("stale", encoding="utf-8")
            seo.generate(payload, tmp_site, previous_sitemap_url=None)
            self.assertFalse(stale_dir.exists())

    def test_live_site_home_og_dimensions_and_focus_keywords(self) -> None:
        site_dir = registry.ROOT / "site"
        index_html = (site_dir / "index.html").read_text(encoding="utf-8")
        og_bytes = (site_dir / "og-image.png").read_bytes()
        w, h = struct.unpack(">II", og_bytes[16:24])
        self.assertIn(f'<meta property="og:image:width" content="{w}" />', index_html)
        self.assertIn(f'<meta property="og:image:height" content="{h}" />', index_html)
        self.assertIn('"SearchAction"', index_html)
        self.assertIn('name="twitter:title"', index_html)
        self.assertIn('rel="manifest"', index_html)
        self.assertNotIn('href="#"', index_html)

        combined = "\n".join(p.read_text(encoding="utf-8").lower() for p in site_dir.rglob("*.html"))
        for kw in (
            "ps5 emulator",
            "gtavi emulator",
            "gta6 emulator",
            "emutrack",
            "emulator track",
            "emulator tracker",
            "gta6",
            "gta 6 pc",
            "gta6 pc",
            "gta iv",
        ):
            self.assertIn(kw, combined, f"Missing focus keyword in site HTML: {kw}")

    def test_heading_hierarchy_has_no_skips(self) -> None:
        class HeadingParser(HTMLParser):
            def __init__(self) -> None:
                super().__init__()
                self.levels: list[int] = []

            def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
                if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                    self.levels.append(int(tag[1]))

        payload = self._sample_payload()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_site = Path(tmp)
            (tmp_site / "index.html").write_text(
                (registry.ROOT / "site" / "index.html").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            seo.generate(payload, tmp_site, previous_sitemap_url=None)
            html_files = sorted(tmp_site.rglob("*.html"))
            self.assertGreaterEqual(len(html_files), 35)
            live_files = sorted(
                p for p in (registry.ROOT / "site").rglob("*.html") if not p.name.startswith("google")
            )
            self.assertGreaterEqual(len(live_files), 60)
            for html_file in [*html_files, *live_files]:
                parser = HeadingParser()
                parser.feed(html_file.read_text(encoding="utf-8"))
                self.assertEqual(
                    parser.levels.count(1),
                    1,
                    f"Expected exactly 1 <h1> in {html_file}: {parser.levels}",
                )
                for prev, nxt in zip(parser.levels, parser.levels[1:]):
                    self.assertLessEqual(
                        nxt,
                        prev + 1,
                        f"Heading level skip h{prev} -> h{nxt} in {html_file}: {parser.levels}",
                    )


if __name__ == "__main__":
    unittest.main()
