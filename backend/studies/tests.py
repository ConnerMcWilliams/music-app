from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from progress.models import Profile

from .models import Study, StudyContent

User = get_user_model()


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

    def test_list_is_ordered_by_section_then_number(self):
        Study.objects.create(slug="clarke-1-1", section=1, number=1, title="a")
        Study.objects.create(slug="clarke-1-2", section=1, number=2, title="b")
        resp = self.client.get(reverse("studies:study-list"))
        ids = [r["id"] for r in resp.json()["results"]]
        # setUp study is section 2; both section-1 exercises sort ahead of it.
        self.assertEqual(ids, ["clarke-1-1", "clarke-1-2", "clarke-2-1"])

    def test_has_content_reflects_notation_not_mere_existence(self):
        # A content row with no MusicXML is still "no content" to the client.
        content = StudyContent.objects.create(
            study=self.study, source_url="https://imslp.org/x"
        )
        resp = self.client.get(reverse("studies:study-list"))
        self.assertFalse(resp.json()["results"][0]["has_content"])
        # Adding notation flips the flag.
        content.musicxml = "<score-partwise/>"
        content.save()
        resp = self.client.get(reverse("studies:study-list"))
        self.assertTrue(resp.json()["results"][0]["has_content"])

    def test_non_numeric_section_filter_is_ignored(self):
        Study.objects.create(slug="clarke-4-1", section=4, number=1, title="x")
        resp = self.client.get(reverse("studies:study-list"), {"section": "abc"})
        self.assertEqual(resp.status_code, 200)
        # Junk filter is ignored rather than erroring → all rows returned.
        self.assertEqual(resp.json()["count"], 2)

    def test_list_item_exposes_frontend_field_shape(self):
        item = self.client.get(reverse("studies:study-list")).json()["results"][0]
        for field in (
            "id", "section", "section_label", "number", "title", "subtitle",
            "key", "tempo", "range_label", "category", "est_minutes",
            "instrument", "source", "order", "has_content",
        ):
            self.assertIn(field, item)

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


class SubmissionApiTests(TestCase):
    def setUp(self):
        # Submitting a take requires an authenticated user — the take (and the
        # streak it advances) belongs to whoever recorded it.
        self.user = User.objects.create_user(email="player@example.com", password="x")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _audio(self):
        return SimpleUploadedFile("take.m4a", b"fake-audio-bytes", content_type="audio/m4a")

    def test_submit_requires_authentication(self):
        anon = APIClient()
        resp = anon.post(
            reverse("studies:submission-create"), {"audio": self._audio()}
        )
        self.assertEqual(resp.status_code, 401)

    def test_submit_take_returns_placeholder_grade(self):
        resp = self.client.post(
            reverse("studies:submission-create"),
            {
                "audio": self._audio(),
                "exercise_id": "clarke-2",
                "exercise_title": "Clarke Study No. 2",
                "duration_seconds": "12.4",
            },
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertTrue(body["submission_id"].startswith("sub-"))
        self.assertEqual(body["exercise_id"], "clarke-2")
        self.assertEqual(body["exercise_title"], "Clarke Study No. 2")
        self.assertEqual(body["total_score"], 88)
        self.assertEqual(body["grade_label"], "A−")
        self.assertEqual(len(body["categories"]), 4)
        self.assertIn("feedback_text", body)

    def test_submit_without_audio_is_rejected(self):
        resp = self.client.post(
            reverse("studies:submission-create"), {"exercise_id": "clarke-2"}
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("audio", resp.json())

    def test_exercise_title_falls_back_when_omitted(self):
        resp = self.client.post(
            reverse("studies:submission-create"), {"audio": self._audio()}
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["exercise_title"], "Clarke Study")

    def test_submit_advances_the_users_streak_and_stats(self):
        # No profile yet — the first graded take creates it and starts the streak.
        self.assertEqual(Profile.objects.filter(user=self.user).count(), 0)

        resp = self.client.post(
            reverse("studies:submission-create"), {"audio": self._audio()}
        )
        self.assertEqual(resp.status_code, 201)

        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.studies_completed, 1)
        self.assertGreaterEqual(profile.day_streak, 1)
        self.assertIsNotNone(profile.last_active_date)
        # The placeholder grade (88) is folded into the running average.
        self.assertEqual(profile.avg_score, 88)


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

    def test_import_creates_content_stub_for_every_study(self):
        call_command("import_clarke", verbosity=0)
        self.assertEqual(StudyContent.objects.count(), 190)
        # Every stub carries the B-flat trumpet transposition and no notation yet.
        self.assertTrue(
            all(c.transposition_semitones == -2 for c in StudyContent.objects.all())
        )
        self.assertFalse(any(c.has_notation for c in StudyContent.objects.all()))

    def test_ninth_study_has_no_etude(self):
        call_command("import_clarke", verbosity=0)
        ninth = Study.objects.filter(section=9)
        # Verified against the scan: Tenth Study begins at No. 187,
        # so Study IX is exercises 178-186.
        self.assertEqual(ninth.count(), 9)
        # Study IX has no closing étude, so none carry a tempo mark.
        self.assertTrue(all(s.tempo == "" for s in ninth))

    def test_tenth_study_named_melodies(self):
        call_command("import_clarke", verbosity=0)
        # Study X = Nos. 187-190; the named melodies are its 3rd and 4th.
        self.assertEqual(Study.objects.filter(section=10).count(), 4)
        ballad = Study.objects.get(slug="clarke-10-3")
        self.assertIn("Irish Ballad", ballad.title)
        self.assertEqual(ballad.key_signature, "F major")
        folksong = Study.objects.get(slug="clarke-10-4")
        self.assertEqual(folksong.key_signature, "B♭ major")
        self.assertEqual(folksong.order, 190)  # last exercise in the book

    def test_import_then_filter_by_section_over_api(self):
        call_command("import_clarke", verbosity=0)
        resp = self.client.get(reverse("studies:study-list"), {"section": 7})
        # Seventh Study is the largest (38 exercises); PAGE_SIZE=50 fits them all.
        self.assertEqual(resp.json()["count"], 38)

    def test_clear_flag_removes_existing_before_reimport(self):
        call_command("import_clarke", verbosity=0)
        # An orphan Clarke row that is not in the seed should be swept by --clear.
        Study.objects.create(
            slug="clarke-stale", section=1, number=99, title="stale",
            source="Clarke — Technical Studies for the Cornet",
        )
        self.assertEqual(Study.objects.count(), 191)
        call_command("import_clarke", "--clear", verbosity=0)
        self.assertEqual(Study.objects.count(), 190)
        self.assertFalse(Study.objects.filter(slug="clarke-stale").exists())


class SeedDataTests(TestCase):
    """Structural checks on the static Clarke seed data."""

    def test_seed_has_190_exercises_in_10_sections(self):
        from studies.seed.clarke import SECTIONS, STUDIES

        self.assertEqual(len(STUDIES), 190)
        self.assertEqual(len(SECTIONS), 10)
        self.assertEqual(len({s["section"] for s in STUDIES}), 10)

    def test_seed_slugs_are_unique(self):
        from studies.seed.clarke import STUDIES

        slugs = [s["slug"] for s in STUDIES]
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_seed_global_order_covers_1_to_190(self):
        from studies.seed.clarke import STUDIES

        self.assertEqual(sorted(s["order"] for s in STUDIES), list(range(1, 191)))

    def test_seed_marks_exactly_10_etudes_with_tempo(self):
        from studies.seed.clarke import STUDIES

        # 8 capstone études (Studies I–VIII) + 2 named melodies in Study X = 10.
        # Study IX has no étude.
        with_tempo = [s for s in STUDIES if s.get("tempo")]
        self.assertEqual(len(with_tempo), 10)


class NotationImportTests(TestCase):
    """Generated MusicXML files load into StudyContent by slug."""

    def test_notation_files_exist_and_are_wellformed(self):
        import xml.etree.ElementTree as ET

        from studies.management.commands.import_clarke_notation import MUSICXML_DIR

        files = sorted(MUSICXML_DIR.glob("*.musicxml"))
        # Studies I-VI complete (131 pattern exercises minus étude slots)
        # plus Study IX Nos. 178-183.
        self.assertEqual(len(files), 132)
        for path in files[:5] + files[-5:]:
            root = ET.fromstring(path.read_text(encoding="utf-8"))
            self.assertEqual(root.tag, "score-partwise")
            self.assertTrue(root.findall(".//note"), path.name)

    def test_import_clarke_notation_fills_studycontent(self):
        call_command("import_clarke", verbosity=0)
        call_command("import_clarke_notation", verbosity=0)
        with_notation = StudyContent.objects.exclude(musicxml="")
        self.assertEqual(with_notation.count(), 132)
        # A known pattern exercise now carries notation…
        second_study_first = StudyContent.objects.get(study__slug="clarke-2-1")
        self.assertTrue(second_study_first.has_notation)
        self.assertIn("<score-partwise", second_study_first.musicxml)
        # …while the études remain pending transcription.
        etude_one = StudyContent.objects.get(study__slug="clarke-1-26")
        self.assertFalse(etude_one.has_notation)

    def test_generated_first_exercise_notes_match_the_scan(self):
        """clarke-1-1 must open with the chromatic run read off the 1912 scan."""
        import xml.etree.ElementTree as ET

        from studies.management.commands.import_clarke_notation import MUSICXML_DIR

        root = ET.fromstring(
            (MUSICXML_DIR / "clarke-1-1.musicxml").read_text(encoding="utf-8"))
        notes = []
        for n in root.findall(".//note"):
            pitch = n.find("pitch")
            if pitch is None:
                continue
            step = pitch.findtext("step")
            alter = pitch.findtext("alter")
            octave = pitch.findtext("octave")
            acc = {"1": "#", "-1": "b", None: "", "0": ""}[alter]
            notes.append(f"{step}{acc}{octave}")
        self.assertEqual(
            notes[:12],
            ["F#3", "G3", "G#3", "A3", "A#3", "B3",
             "C4", "B3", "Bb3", "A3", "Ab3", "G3"],
        )
