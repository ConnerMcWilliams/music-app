from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from .models import Study, StudyContent


class StudyModelTests(TestCase):
    def test_create_study_with_content(self):
        study = Study.objects.create(
            slug="clarke-2-1",
            section=2,
            section_label="Second Study",
            number=1,
            title="Second Study — No. 1",
            key_signature="C major",
            tempo="♩ = 80",
            range_label="G3–C5",
            category=Study.Category.FOUNDATIONAL,
            est_minutes=8,
        )
        content = StudyContent.objects.create(study=study)

        self.assertEqual(study.content, content)
        # B♭ trumpet transposition default is baked in.
        self.assertEqual(content.transposition_semitones, -2)
        # No notation yet — this study has only been catalogued, not transcribed.
        self.assertFalse(content.has_notation)

    def test_has_notation_true_when_musicxml_present(self):
        study = Study.objects.create(
            slug="clarke-1-1", section=1, number=1, title="First Study — No. 1"
        )
        content = StudyContent.objects.create(study=study, musicxml="<score-partwise/>")
        self.assertTrue(content.has_notation)

    def test_default_ordering_is_by_section_then_order_then_number(self):
        Study.objects.create(slug="s2-1", section=2, number=1, title="Second, No. 1")
        Study.objects.create(slug="s1-2", section=1, number=2, title="First, No. 2")
        Study.objects.create(slug="s1-1", section=1, number=1, title="First, No. 1")
        slugs = list(Study.objects.values_list("slug", flat=True))
        self.assertEqual(slugs, ["s1-1", "s1-2", "s2-1"])


class StudyApiTests(TestCase):
    def setUp(self):
        self.study = Study.objects.create(
            slug="clarke-2-1",
            section=2,
            section_label="Second Study",
            number=1,
            title="Second Study — No. 1",
            key_signature="C major",
            tempo="♩ = 80",
            range_label="G3–C5",
            category=Study.Category.FOUNDATIONAL,
            est_minutes=8,
        )

    def test_list_studies(self):
        resp = self.client.get(reverse("studies:study-list"))
        self.assertEqual(resp.status_code, 200)
        results = resp.json()["results"]
        self.assertEqual(len(results), 1)
        item = results[0]
        # slug is surfaced as `id`; key_signature as `key`.
        self.assertEqual(item["id"], "clarke-2-1")
        self.assertEqual(item["section"], 2)
        self.assertEqual(item["section_label"], "Second Study")
        self.assertEqual(item["key"], "C major")
        self.assertFalse(item["has_content"])

    def test_filter_by_section(self):
        # Add exercises in other sections.
        Study.objects.create(slug="clarke-2-2", section=2, number=2, title="Second — No. 2")
        Study.objects.create(slug="clarke-4-1", section=4, number=1, title="Fourth — No. 1")

        resp = self.client.get(reverse("studies:study-list"), {"section": 2})
        self.assertEqual(resp.status_code, 200)
        slugs = {r["id"] for r in resp.json()["results"]}
        self.assertEqual(slugs, {"clarke-2-1", "clarke-2-2"})

    def test_filter_by_section_label(self):
        resp = self.client.get(
            reverse("studies:study-list"), {"section_label": "second study"}
        )
        self.assertEqual(resp.status_code, 200)
        slugs = {r["id"] for r in resp.json()["results"]}
        self.assertEqual(slugs, {"clarke-2-1"})

    def test_retrieve_study_includes_content(self):
        StudyContent.objects.create(study=self.study, musicxml="<score-partwise/>")
        url = reverse("studies:study-detail", kwargs={"slug": "clarke-2-1"})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["id"], "clarke-2-1")
        self.assertTrue(body["has_content"])
        self.assertEqual(body["content"]["transposition_semitones"], -2)
        self.assertTrue(body["content"]["has_notation"])

    def test_retrieve_unknown_study_returns_404(self):
        url = reverse("studies:study-detail", kwargs={"slug": "does-not-exist"})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 404)


class ImportClarkeCommandTests(TestCase):
    def test_import_creates_all_studies_and_is_idempotent(self):
        call_command("import_clarke", verbosity=0)
        self.assertEqual(Study.objects.count(), 190)
        self.assertEqual(Study.objects.values("section").distinct().count(), 10)
        # Second Study spans exercises 27–45 → 19 exercises.
        self.assertEqual(Study.objects.filter(section=2).count(), 19)

        # Re-running updates in place, never duplicates.
        call_command("import_clarke", verbosity=0)
        self.assertEqual(Study.objects.count(), 190)

    def test_import_enriches_etudes_and_records_provenance(self):
        call_command("import_clarke", verbosity=0)
        # The Second Study's capstone étude (global No. 45) is exercise 19.
        etude = Study.objects.get(slug="clarke-2-19")
        self.assertEqual(etude.section_label, "Second Study")
        self.assertEqual(etude.key_signature, "G major")
        self.assertEqual(etude.tempo, "♩ = 144")
        # Every study gets a content stub with IMSLP provenance, no notation yet.
        self.assertIn("imslp.org", etude.content.source_url)
        self.assertFalse(etude.content.has_notation)

    def test_dry_run_writes_nothing(self):
        call_command("import_clarke", "--dry-run", verbosity=0)
        self.assertEqual(Study.objects.count(), 0)
