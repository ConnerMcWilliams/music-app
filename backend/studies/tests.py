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

    def test_clear_is_refused_when_graded_history_exists(self):
        from django.core.management.base import CommandError

        from grading.models import GradingResult, Submission

        call_command("import_clarke", verbosity=0)
        study = Study.objects.get(slug="clarke-2-1")
        submission = Submission.objects.create(study=study, exercise_id="clarke-2-1")
        GradingResult.objects.create(
            submission=submission, total_score=88, grade_label="B+", band="",
            pitch_score=0, rhythm_score=0, tempo_score=0, tone_score=0,
            completion_score=0, summary="", practice_tip="",
        )

        # --clear would unlink the graded take and reset its XP cap, so it refuses…
        with self.assertRaises(CommandError):
            call_command("import_clarke", "--clear", verbosity=0)
        self.assertTrue(Study.objects.filter(slug="clarke-2-1").exists())

        # …but --force overrides the guard.
        call_command("import_clarke", "--clear", "--force", verbosity=0)
        self.assertEqual(Study.objects.count(), 190)


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
        # Studies I-VI complete (131 pattern exercises minus étude slots),
        # Study VII Nos. 133-169 and Study IX Nos. 178-183.
        self.assertEqual(len(files), 169)
        for path in files[:5] + files[-5:]:
            root = ET.fromstring(path.read_text(encoding="utf-8"))
            self.assertEqual(root.tag, "score-partwise")
            self.assertTrue(root.findall(".//note"), path.name)

    def test_import_clarke_notation_fills_studycontent(self):
        call_command("import_clarke", verbosity=0)
        call_command("import_clarke_notation", verbosity=0)
        with_notation = StudyContent.objects.exclude(musicxml="")
        self.assertEqual(with_notation.count(), 169)
        # A known pattern exercise now carries notation…
        second_study_first = StudyContent.objects.get(study__slug="clarke-2-1")
        self.assertTrue(second_study_first.has_notation)
        self.assertIn("<score-partwise", second_study_first.musicxml)
        # …while the études remain pending transcription.
        etude_one = StudyContent.objects.get(study__slug="clarke-1-26")
        self.assertFalse(etude_one.has_notation)

    def test_every_exercise_is_treble_clef(self):
        """Clarke is a cornet method — treble throughout.

        music21 picks a clef from the pitch range unless told otherwise, which
        silently put the five lowest-starting exercises into bass clef. The
        mobile renderer paints a treble glyph regardless, so those files drew
        bass-clef note positions under a treble staff and No. 1 no longer read
        as the low F#.
        """
        import xml.etree.ElementTree as ET

        from studies.management.commands.import_clarke_notation import MUSICXML_DIR

        offenders = []
        for path in sorted(MUSICXML_DIR.glob("*.musicxml")):
            root = ET.fromstring(path.read_text(encoding="utf-8"))
            for clef in root.iter("clef"):
                sign, line = clef.findtext("sign"), clef.findtext("line")
                if (sign, line) != ("G", "2"):
                    offenders.append(f"{path.stem}: {sign}{line}")
        self.assertEqual(offenders, [])

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

    def test_study7_first_exercise_matches_the_scan(self):
        """clarke-7-1's neighbour figure, read note-for-note off the scan.

        Pins the enharmonic spelling, not just the pitches: Clarke writes the
        raised fourth as B#3 and the turn as Eb4/Fb4, and a speller that picked
        the obvious C4/Eb4/D#4 instead would still sound right while engraving
        something he did not write.
        """
        notes = self._pitch_names("clarke-7-1")
        self.assertEqual(notes[:12], [
            "G3", "F#3", "G3", "Ab3", "G3", "Ab3",
            "A3", "G#3", "A3", "Bb3", "A3", "Bb3",
        ])
        self.assertEqual(notes[18:27], [
            "C#4", "B#3", "C#4", "D4", "C#4", "D4", "Eb4", "Fb4", "Eb4",
        ])
        # bars 5-9 are I, IV, I, V7, I arpeggios, each played twice
        self.assertEqual(notes[48:54], ["G3", "B3", "D4", "G4", "D4", "B3"])
        self.assertEqual(notes[60:66], ["G3", "C4", "E4", "G4", "E4", "C4"])
        self.assertEqual(notes[84:90], ["A3", "C4", "D4", "F#4", "D4", "C4"])
        self.assertEqual(len(notes), 103)

    def test_study7_arpeggios_match_the_scan(self):
        """clarke-7-20 (No. 152) matched the scan on all 96 noteheads.

        Pins the two things the fit resolved: the arpeggios start on the tonic
        of the engraved key — B major, five sharps — and the dominant-seventh
        groups enter a degree higher, which is what puts the seventh in the bar.
        Notehead position cannot tell B major from F# major on its own (E# and
        E natural share a line), so the harmony is the check: I, IV, V7, exactly
        as No. 151 reads in C.
        """
        notes = self._pitch_names("clarke-7-20")
        self.assertEqual(notes[:7], ["B3", "D#4", "F#4", "B4", "D#5", "F#5", "B5"])
        # the IV stack, and the V7 stack that enters a degree higher
        self.assertEqual(notes[24:31], ["B3", "E4", "G#4", "B4", "E5", "G#5", "B5"])
        self.assertEqual(notes[72:79], ["C#4", "F#4", "A#4", "C#5", "E5", "F#5", "A#5"])
        self.assertEqual(len(notes), 97)

    def test_study7_diminished_sevenths_match_the_scan(self):
        """Nos. 158-169 arpeggiate one diminished seventh each.

        Pins the spelling, which is the only thing the pitches do not fix: a
        diminished seventh has just three transpositions, so several of these
        exercises sound identical and differ only in how Clarke wrote them —
        No. 163 is G#-B-D-F and No. 164 the same chord as Ab-Cb-D-F. A speller
        left to itself would never choose Cb.
        """
        first = self._pitch_names("clarke-7-26")  # No. 158, 2/4
        self.assertEqual(first[:9], [
            "F#3", "A3", "C4", "Eb4", "F#4", "A4", "C5", "Eb5", "F#5",
        ])
        # nine up, seven back down, twice, then the closing fermata note
        self.assertEqual(len(first), 33)
        self.assertEqual(first[9], "Eb5")
        self.assertEqual(first[16], "F#3")
        self.assertEqual(first[-1], "F#3")

        self.assertEqual(self._pitch_names("clarke-7-31")[:4],
                         ["G#3", "B3", "D4", "F4"])
        self.assertEqual(self._pitch_names("clarke-7-32")[:4],
                         ["Ab3", "Cb4", "D4", "F4"])
        # Whatever the spelling, every interval of the climb is a minor third —
        # that is what makes the chord diminished, and it holds in all twelve.
        step = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
        for n in range(26, 38):
            names = self._pitch_names(f"clarke-7-{n}")
            up = 10 if len(names) == 37 else 9
            midi = []
            for name in names[:up]:
                octave = int(name[-1])
                letter, acc = name[0], name[1:-1]
                alter = acc.count("#") - acc.count("b")
                midi.append((octave + 1) * 12 + step[letter] + alter)
            self.assertEqual([b - a for a, b in zip(midi, midi[1:])],
                             [3] * (up - 1), f"clarke-7-{n}")

    def test_dim7_run_rejects_letters_that_do_not_climb_in_thirds(self):
        """A bad letter set must fail loudly, not emit a short run.

        The spellings are hand-read data, and this machinery is what Study VIII
        and Study IX Nos. 184-186 will be encoded with. Letters that do not
        ascend by thirds leave a pitch unwritable on its letter; falling through
        would under-fill the bars instead of reporting the typo.
        """
        from studies.seed.clarke_notation import _dim7_run

        self.assertEqual(len(_dim7_run("F#3", "FACE", 9)), 9)
        with self.assertRaisesMessage(ValueError, "do not climb in minor thirds"):
            _dim7_run("F#3", "CEBA", 9)

    def test_study7_triplet_bars_are_engraved_as_tuplets(self):
        """The common-time arpeggios are 24 sixteenth-triplets to the bar.

        Without <time-modification> those bars would claim the width of 24 plain
        sixteenths; the renderer reads it to size the slots.
        """
        import xml.etree.ElementTree as ET

        from studies.management.commands.import_clarke_notation import MUSICXML_DIR

        root = ET.fromstring(
            (MUSICXML_DIR / "clarke-7-19.musicxml").read_text(encoding="utf-8"))
        measures = root.findall(".//measure")
        self.assertEqual([len(m.findall("note")) for m in measures[:4]],
                         [24, 24, 24, 24])
        mod = measures[0].find(".//time-modification")
        self.assertEqual(mod.findtext("actual-notes"), "3")
        self.assertEqual(mod.findtext("normal-notes"), "2")
        # one bracket pair per group of three
        self.assertEqual(len(root.findall(".//tuplet")), 96 // 3 * 2)

    def _pitch_names(self, slug):
        import xml.etree.ElementTree as ET

        from studies.management.commands.import_clarke_notation import MUSICXML_DIR

        root = ET.fromstring(
            (MUSICXML_DIR / f"{slug}.musicxml").read_text(encoding="utf-8"))
        names = []
        for n in root.findall(".//note"):
            pitch = n.find("pitch")
            if pitch is None:
                continue
            acc = {"1": "#", "-1": "b", "2": "##", "-2": "bb",
                   None: "", "0": ""}[pitch.findtext("alter")]
            names.append(f"{pitch.findtext('step')}{acc}"
                         f"{pitch.findtext('octave')}")
        return names
