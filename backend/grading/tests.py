"""
Tests for the grading engine and the submissions endpoint.

The engine is exercised with *synthesized* WAV audio (pure tones with known
pitch, timing, and loudness) so the assertions are deterministic and need no
fixture files or system FFmpeg: a clean, steady, in-tune take must score well;
detuned/jittery/silent takes must score worse in the expected categories.
"""
from __future__ import annotations

import io
import tempfile
import uuid
import wave
from pathlib import Path
from unittest import mock

import numpy as np
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from progress.models import Profile
from studies.models import Study, StudyContent

from .engine import (
    ExpectedTimeline,
    align,
    expected_from_musicxml,
    grade_recording,
    segment_notes,
    timeline_from_musicxml,
    validate_notation,
)
from .engine.align import Alignment, NoteVerdict
from .engine.analysis import AudioFeatures, analyze
from .engine.audio import decode_audio
from .engine.rubric import _TIPS, MAX_RHYTHM, _grade_label, grade
from .engine.timeline import ExpectedNote
from .models import Submission
from .serializers import SubmissionCreateSerializer
from .views import _resolve_study
from .wire import note_results_from_engine, note_summary

SR = 22_050


def _to_wav_bytes(samples: np.ndarray, sample_rate: int = SR) -> bytes:
    """Encode a float signal in [-1, 1] as a 16-bit mono WAV."""
    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32_767).astype("<i2")
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return buffer.getvalue()


def _note(freq: float, seconds: float, amp: float = 0.3) -> np.ndarray:
    """One enveloped sine burst (crisp attack + short decay → clear onset)."""
    t = np.arange(int(seconds * SR)) / SR
    env = np.ones_like(t)
    attack = int(0.006 * SR)
    decay = int(0.05 * SR)
    env[:attack] = np.linspace(0.0, 1.0, attack)
    env[-decay:] = np.linspace(1.0, 0.0, decay)
    return amp * np.sin(2.0 * np.pi * freq * t) * env


def _midi_to_hz(midi: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def _tone_sequence(
    midis: list[int],
    *,
    cents_offset: float = 0.0,
    note: float = 0.35,
    gap: float = 0.12,
    amps: list[float] | None = None,
) -> np.ndarray:
    """A steady stream of notes with silence between attacks."""
    parts: list[np.ndarray] = []
    for i, m in enumerate(midis):
        freq = _midi_to_hz(m + cents_offset / 100.0)
        amp = amps[i] if amps else 0.3
        parts.append(_note(freq, note, amp))
        parts.append(np.zeros(int(gap * SR), dtype=np.float32))
    return np.concatenate(parts).astype(np.float32)


def _steady_sine(freq: float, seconds: float, amp: float = 0.3) -> np.ndarray:
    """A bare sine with no envelope — ends at full energy (reads as truncated)."""
    t = np.arange(int(seconds * SR)) / SR
    return (amp * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


def _encode_wav(frames: bytes, sample_width: int, channels: int, sr: int = SR) -> bytes:
    """Encode raw interleaved PCM bytes as a WAV of the given width/channels."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(sample_width)
        wav.setframerate(sr)
        wav.writeframes(frames)
    return buffer.getvalue()


def _features(**kwargs) -> AudioFeatures:
    """Build AudioFeatures directly, to unit-test one scorer in isolation."""
    kwargs.setdefault("duration_seconds", 6.0)
    kwargs.setdefault("sample_rate", SR)
    return AudioFeatures(**kwargs)


def _category(features: AudioFeatures, key: str):
    return {c.key: c for c in grade(features).categories}[key]


CLEAN_MIDIS = [60, 62, 64, 65, 67, 69, 71, 72]  # a C-major run, ~8 notes


class AnalysisTests(TestCase):
    def test_clean_tone_pitch_and_onsets_detected(self):
        features = analyze(_tone_sequence(CLEAN_MIDIS), SR)
        # Pitch is found and sits essentially on equal temperament.
        self.assertGreater(features.f0_hz.size, 0)
        self.assertGreater(features.pitched_ratio, 0.7)
        self.assertLess(float(np.mean(np.abs(features.cents_deviation))), 15.0)
        # Roughly one onset per note (allowing for edge frames).
        self.assertGreaterEqual(features.note_count, 5)
        self.assertLessEqual(features.note_count, 12)

    def test_silence_is_not_voiced(self):
        features = analyze(np.zeros(SR * 2, dtype=np.float32), SR)
        self.assertEqual(features.f0_hz.size, 0)
        self.assertLess(features.voiced_ratio, 0.05)

    def test_detected_pitch_matches_input_frequency(self):
        features = analyze(_steady_sine(330.0, 1.0), SR)  # E4
        self.assertGreater(features.f0_hz.size, 0)
        self.assertAlmostEqual(float(np.median(features.f0_hz)), 330.0, delta=8.0)

    def test_signal_shorter_than_a_frame_reports_duration_only(self):
        features = analyze(np.zeros(100, dtype=np.float32), SR)
        self.assertEqual(features.rms.size, 0)
        self.assertGreater(features.duration_seconds, 0.0)

    def test_take_ending_at_full_energy_is_flagged_truncated(self):
        # A bare sine with no decay ends loud → looks cut off.
        features = analyze(_steady_sine(220.0, 2.0), SR)
        self.assertTrue(features.truncated)

    def test_take_ending_in_silence_is_not_truncated(self):
        signal = np.concatenate(
            [_steady_sine(220.0, 1.0), np.zeros(int(0.5 * SR), dtype=np.float32)]
        )
        self.assertFalse(analyze(signal, SR).truncated)


class RubricScoringTests(TestCase):
    def test_clean_steady_take_scores_well(self):
        result = grade_recording(_to_wav_bytes(_tone_sequence(CLEAN_MIDIS)))
        self.assertTrue(result.analyzed)
        self.assertGreaterEqual(result.total_score, 70)
        pitch = next(c for c in result.categories if c.key == "pitch")
        self.assertGreaterEqual(pitch.percent, 75)

    def test_in_tune_beats_detuned_on_pitch(self):
        clean = grade(analyze(_tone_sequence(CLEAN_MIDIS), SR))
        detuned = grade(analyze(_tone_sequence(CLEAN_MIDIS, cents_offset=45), SR))
        clean_pitch = next(c for c in clean.categories if c.key == "pitch").points
        detuned_pitch = next(c for c in detuned.categories if c.key == "pitch").points
        self.assertGreater(clean_pitch, detuned_pitch)

    def test_even_loudness_beats_jittery_on_tone(self):
        steady = grade(analyze(_tone_sequence(CLEAN_MIDIS), SR))
        jittery_amps = [0.4, 0.08, 0.45, 0.06, 0.5, 0.05, 0.4, 0.07]
        jittery = grade(analyze(_tone_sequence(CLEAN_MIDIS, amps=jittery_amps), SR))
        steady_tone = next(c for c in steady.categories if c.key == "tone").points
        jittery_tone = next(c for c in jittery.categories if c.key == "tone").points
        self.assertGreater(steady_tone, jittery_tone)

    def test_categories_sum_to_total_and_stay_in_bounds(self):
        result = grade_recording(_to_wav_bytes(_tone_sequence(CLEAN_MIDIS)))
        self.assertEqual({c.key for c in result.categories},
                         {"pitch", "rhythm", "tempo", "tone", "completion"})
        self.assertEqual(result.total_score, round(sum(c.points for c in result.categories)))
        for c in result.categories:
            self.assertGreaterEqual(c.percent, 0)
            self.assertLessEqual(c.percent, 100)
        self.assertGreaterEqual(result.total_score, 0)
        self.assertLessEqual(result.total_score, 100)

    def test_silence_scores_low(self):
        result = grade_recording(_to_wav_bytes(np.zeros(SR * 2, dtype=np.float32)))
        self.assertTrue(result.analyzed)
        self.assertLess(result.total_score, 30)

    def test_undecodable_audio_gives_length_only_grade(self):
        result = grade_recording(b"this is definitely not audio", client_duration=18.0)
        self.assertFalse(result.analyzed)
        pitch = next(c for c in result.categories if c.key == "pitch")
        self.assertEqual(pitch.percent, 0)
        completion = next(c for c in result.categories if c.key == "completion")
        self.assertGreater(completion.percent, 0)


class ReferenceTests(TestCase):
    XML = """<?xml version="1.0"?>
    <score-partwise version="3.1">
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><rest/><duration>1</duration></note>
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
      </part>
    </score-partwise>"""

    def test_expected_from_musicxml_counts_notes_and_duration(self):
        expected = expected_from_musicxml(self.XML, tempo_label="♩ = 60")
        # 3 sounded notes (the rest doesn't count) …
        self.assertEqual(expected.note_count, 3)
        # … 4 quarter-note durations at 60 bpm = 4 seconds.
        self.assertAlmostEqual(expected.expected_seconds, 4.0, places=1)
        self.assertEqual(expected.source, "notation")

    def test_blank_notation_falls_back_to_default(self):
        expected = expected_from_musicxml("", tempo_label="")
        self.assertEqual(expected.source, "default")
        self.assertGreater(expected.expected_seconds, 0)

    def test_sound_tempo_element_overrides_label(self):
        xml = (
            '<score-partwise><part id="P1"><measure number="1">'
            "<attributes><divisions>1</divisions></attributes>"
            '<sound tempo="120"/>'
            "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>"
            "<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>"
            "</measure></part></score-partwise>"
        )
        # 2 quarters at the embedded 120 bpm = 1.0 s, ignoring the slower label.
        expected = expected_from_musicxml(xml, tempo_label="♩ = 60")
        self.assertAlmostEqual(expected.expected_seconds, 1.0, places=1)

    def test_grace_and_chord_notes_are_excluded(self):
        xml = (
            '<score-partwise><part id="P1"><measure number="1">'
            "<attributes><divisions>1</divisions></attributes>"
            "<note><grace/><pitch><step>C</step><octave>5</octave></pitch></note>"
            "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>"
            "<note><chord/><pitch><step>E</step><octave>4</octave></pitch>"
            "<duration>1</duration></note>"
            "</measure></part></score-partwise>"
        )
        expected = expected_from_musicxml(xml, tempo_label="♩ = 60")
        self.assertEqual(expected.note_count, 1)  # grace + chord don't add notes
        self.assertAlmostEqual(expected.expected_seconds, 1.0, places=1)  # nor duration

    def test_divisions_scale_note_durations(self):
        xml = (
            '<score-partwise><part id="P1"><measure number="1">'
            "<attributes><divisions>4</divisions></attributes>"
            # 4 duration units at 4 divisions/quarter = one quarter note.
            "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>"
            "</measure></part></score-partwise>"
        )
        expected = expected_from_musicxml(xml, tempo_label="♩ = 60")
        self.assertAlmostEqual(expected.expected_seconds, 1.0, places=1)

    def test_malformed_xml_falls_back_to_default(self):
        expected = expected_from_musicxml("<score-partwise><oops", tempo_label="")
        self.assertEqual(expected.source, "default")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class SubmissionApiTests(TestCase):
    """POST /api/submissions/ — authenticated create + grade."""

    def setUp(self):
        cache.clear()  # fresh throttle budget per test (ScopedRateThrottle)
        self.user = get_user_model().objects.create_user(
            email="grader@example.com", password="x"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _wav_upload(self, name: str = "take.wav") -> SimpleUploadedFile:
        return SimpleUploadedFile(
            name, _to_wav_bytes(_tone_sequence(CLEAN_MIDIS)), content_type="audio/wav"
        )

    def test_unauthenticated_submission_is_rejected(self):
        resp = APIClient().post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        )
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(Submission.objects.count(), 0)

    def test_submission_is_attributed_to_the_token_user_only(self):
        # A client-supplied user id must never override the token's identity.
        other = get_user_model().objects.create_user(
            email="other@example.com", password="x"
        )
        body = self.client.post(
            reverse("grading:submission-create"),
            {"audio": self._wav_upload(), "user": str(other.id), "user_id": str(other.id)},
        ).json()
        submission = Submission.objects.get(id=body["submission_id"])
        self.assertEqual(submission.user_id, self.user.id)

    def test_disallowed_file_extension_is_rejected(self):
        bogus = SimpleUploadedFile("take.exe", b"MZ...", content_type="audio/wav")
        resp = self.client.post(reverse("grading:submission-create"), {"audio": bogus})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("audio", resp.json())
        self.assertEqual(Submission.objects.count(), 0)

    def test_extensionless_upload_is_rejected(self):
        bogus = SimpleUploadedFile("take", b"...", content_type="audio/wav")
        resp = self.client.post(reverse("grading:submission-create"), {"audio": bogus})
        self.assertEqual(resp.status_code, 400)

    def test_audio_path_suffix_is_sanitized(self):
        # Direct model-level guard: a hostile suffix never reaches storage.
        from .models import submission_audio_path

        submission = Submission(id=uuid.uuid4())
        path = submission_audio_path(submission, "evil.a/../../x")
        self.assertEqual(path, f"submissions/{submission.id}/take.audio")

    def test_submit_take_returns_graded_result_and_persists(self):
        resp = self.client.post(
            reverse("grading:submission-create"),
            {
                "audio": self._wav_upload(),
                "exercise_id": "clarke-2",
                "exercise_title": "Clarke Study No. 2",
                "duration_seconds": "12.4",
            },
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["exercise_id"], "clarke-2")
        self.assertEqual(body["exercise_title"], "Clarke Study No. 2")
        self.assertEqual(len(body["categories"]), 5)
        self.assertIn("feedback_text", body)
        self.assertGreaterEqual(body["total_score"], 0)
        self.assertLessEqual(body["total_score"], 100)

        # Both rows were written, and the grade matches the response.
        submission = Submission.objects.get(id=body["submission_id"])
        self.assertEqual(submission.exercise_id, "clarke-2")
        self.assertTrue(submission.grade.analyzed)
        self.assertEqual(submission.grade.total_score, body["total_score"])

    def test_resolves_section_id_to_a_study_with_notation(self):
        study = Study.objects.create(
            slug="clarke-2-1", section=2, number=1, title="Second — No. 1",
            tempo="♩ = 80",
        )
        StudyContent.objects.create(study=study, musicxml=ReferenceTests.XML)
        resp = self.client.post(
            reverse("grading:submission-create"),
            {"audio": self._wav_upload(), "exercise_id": "clarke-2"},
        )
        self.assertEqual(resp.status_code, 201)
        submission = Submission.objects.get(id=resp.json()["submission_id"])
        self.assertEqual(submission.study_id, study.id)

    def test_submit_without_audio_is_rejected(self):
        resp = self.client.post(
            reverse("grading:submission-create"), {"exercise_id": "clarke-2"}
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("audio", resp.json())

    def test_empty_audio_is_rejected(self):
        empty = SimpleUploadedFile("take.wav", b"", content_type="audio/wav")
        resp = self.client.post(
            reverse("grading:submission-create"), {"audio": empty}
        )
        self.assertEqual(resp.status_code, 400)

    def test_exercise_title_falls_back_when_omitted(self):
        resp = self.client.post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["exercise_title"], "Clarke Study")

    def test_undecodable_upload_still_grades_as_length_only(self):
        bogus = SimpleUploadedFile("take.m4a", b"not-real-audio", content_type="audio/m4a")
        resp = self.client.post(
            reverse("grading:submission-create"),
            {"audio": bogus, "duration_seconds": "15"},
        )
        self.assertEqual(resp.status_code, 201)
        submission = Submission.objects.get(id=resp.json()["submission_id"])
        self.assertFalse(submission.grade.analyzed)

    def test_exact_study_slug_resolves_directly(self):
        study = Study.objects.create(
            slug="clarke-2-5", section=2, number=5, title="Second — No. 5", tempo="♩ = 80"
        )
        StudyContent.objects.create(study=study, musicxml=ReferenceTests.XML)
        resp = self.client.post(
            reverse("grading:submission-create"),
            {"audio": self._wav_upload(), "exercise_id": "clarke-2-5"},
        )
        submission = Submission.objects.get(id=resp.json()["submission_id"])
        self.assertEqual(submission.study_id, study.id)

    def test_unresolvable_exercise_id_leaves_study_null(self):
        resp = self.client.post(
            reverse("grading:submission-create"),
            {"audio": self._wav_upload(), "exercise_id": "clarke-2"},
        )
        submission = Submission.objects.get(id=resp.json()["submission_id"])
        self.assertIsNone(submission.study_id)  # no studies seeded → no reference

    def test_response_carries_feedback_persona(self):
        body = self.client.post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        ).json()
        self.assertEqual(body["feedback_author"], "Prof. Halvorsen")
        self.assertEqual(body["feedback_initials"], "PH")
        self.assertTrue(body["feedback_text"])

    def test_uploaded_audio_is_written_to_storage(self):
        body = self.client.post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        ).json()
        submission = Submission.objects.get(id=body["submission_id"])
        self.assertTrue(submission.audio.name.startswith("submissions/"))
        self.assertTrue(submission.audio.storage.exists(submission.audio.name))

    def test_get_lists_only_the_callers_submissions_with_grades(self):
        # The caller's own take is graded and listed…
        created = self.client.post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        ).json()
        # …while another user's take must not appear.
        other = get_user_model().objects.create_user(
            email="stranger@example.com", password="x"
        )
        Submission.objects.create(user=other, exercise_id="clarke-1")

        resp = self.client.get(reverse("grading:submission-create"))
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["count"], 1)
        row = body["results"][0]
        self.assertEqual(row["submission_id"], created["submission_id"])
        self.assertIsNotNone(row["audio_url"])
        self.assertEqual(row["grade"]["total_score"], created["total_score"])
        self.assertEqual(len(row["grade"]["categories"]), 5)

    def test_get_requires_authentication(self):
        resp = APIClient().get(reverse("grading:submission-create"))
        self.assertEqual(resp.status_code, 401)


class SubmissionStreakTests(TestCase):
    """A graded take advances the submitter's practice streak — when signed in."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            email="player@example.com", password="x"
        )
        self.client = APIClient()

    def _wav_upload(self) -> SimpleUploadedFile:
        return SimpleUploadedFile(
            "take.wav", _to_wav_bytes(_tone_sequence(CLEAN_MIDIS)), content_type="audio/wav"
        )

    def test_authenticated_submission_records_practice(self):
        self.client.force_authenticate(self.user)
        # No profile yet — the first graded take creates it and starts the streak.
        self.assertEqual(Profile.objects.filter(user=self.user).count(), 0)

        body = self.client.post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        ).json()

        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.studies_completed, 1)
        self.assertGreaterEqual(profile.day_streak, 1)
        self.assertIsNotNone(profile.last_active_date)
        # The take's real rubric score is folded into the running average.
        self.assertEqual(profile.avg_score, body["total_score"])
        # The submission is attributed to the user, too.
        submission = Submission.objects.get(id=body["submission_id"])
        self.assertEqual(submission.user_id, self.user.id)

    def test_anonymous_submission_is_rejected_and_touches_no_streak(self):
        resp = self.client.post(
            reverse("grading:submission-create"), {"audio": self._wav_upload()}
        )
        self.assertEqual(resp.status_code, 401)
        # Nothing was stored or graded, and no profile/streak was created.
        self.assertEqual(Submission.objects.count(), 0)
        self.assertEqual(Profile.objects.count(), 0)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class SubmissionRewardTests(TestCase):
    """A graded take awards XP for beating the study's prior best."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            email="xp@example.com", password="x"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        # A resolvable study with notation and a known difficulty → XP value 500.
        self.study = Study.objects.create(
            slug="clarke-5-1", section=5, number=1, title="Fifth — No. 1",
            tempo="♩ = 120", difficulty=5,
        )
        StudyContent.objects.create(study=self.study, musicxml=ReferenceTests.XML)

    def _wav_upload(self) -> SimpleUploadedFile:
        return SimpleUploadedFile(
            "take.wav", _to_wav_bytes(_tone_sequence(CLEAN_MIDIS)), content_type="audio/wav"
        )

    def _submit(self) -> dict:
        return self.client.post(
            reverse("grading:submission-create"),
            {"audio": self._wav_upload(), "exercise_id": "clarke-5-1"},
        ).json()

    def test_first_take_awards_full_xp_and_persists_it(self):
        body = self._submit()

        expected = round(body["total_score"] / 100.0 * 500)
        self.assertEqual(body["xp_awarded"], expected)
        self.assertIn("level", body)
        self.assertIn("rank_title", body)

        from progress.models import Profile

        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.xp_total, expected)

        # The award is stored on the grade and echoed in history.
        submission = Submission.objects.get(id=body["submission_id"])
        self.assertEqual(submission.grade.xp_awarded, expected)
        history = self.client.get(reverse("grading:submission-create")).json()
        self.assertEqual(history["results"][0]["grade"]["xp_awarded"], expected)

    def test_undecodable_upload_earns_no_xp_but_still_counts_as_practice(self):
        bogus = SimpleUploadedFile(
            "take.m4a", b"not-real-audio", content_type="audio/m4a"
        )
        body = self.client.post(
            reverse("grading:submission-create"),
            {"audio": bogus, "duration_seconds": "15", "exercise_id": "clarke-5-1"},
        ).json()

        # The length-only grade scores > 0 but pays no XP, in the response
        # and on the stored grade.
        self.assertEqual(body["xp_awarded"], 0)
        submission = Submission.objects.get(id=body["submission_id"])
        self.assertFalse(submission.grade.analyzed)
        self.assertEqual(submission.grade.xp_awarded, 0)

        # It still counts as practice: streak and stats advance.
        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.xp_total, 0)
        self.assertEqual(profile.studies_completed, 1)
        self.assertGreaterEqual(profile.day_streak, 1)

        # And it doesn't set a "best" — a later real take still pays its full
        # percentage of the study's value, not just the improvement over the
        # length-only score.
        analyzed = self._submit()
        self.assertEqual(
            analyzed["xp_awarded"], round(analyzed["total_score"] / 100.0 * 500)
        )

    def test_repeat_take_that_does_not_beat_best_awards_no_xp(self):
        first = self._submit()
        # Identical audio → identical score, so it can't beat the prior best.
        second = self._submit()

        self.assertGreater(first["xp_awarded"], 0)
        self.assertEqual(second["xp_awarded"], 0)

        from progress.models import Profile

        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.xp_total, first["xp_awarded"])  # unchanged by #2
        self.assertEqual(profile.studies_completed, 2)           # both count as practice


class StudyResolutionTests(TestCase):
    """``_resolve_study`` must say *how* confident a match is, not just what it is.

    Note-level grading is only safe on an exact match: aligning a take against
    the wrong exercise's notation would mark every note wrong and tell the
    player, with total confidence, that they misplayed music they never played.
    """

    def setUp(self):
        self.first = Study.objects.create(
            slug="clarke-2-1", section=2, number=1, title="Second — No. 1", order=1
        )
        StudyContent.objects.create(study=self.first, musicxml=ReferenceTests.XML)
        self.fifth = Study.objects.create(
            slug="clarke-2-5", section=2, number=5, title="Second — No. 5", order=5
        )
        StudyContent.objects.create(study=self.fifth, musicxml=ReferenceTests.XML)

    def test_exact_slug_is_exact(self):
        study, exact = _resolve_study("clarke-2-5")
        self.assertEqual(study, self.fifth)
        self.assertTrue(exact)

    def test_section_id_resolves_but_is_not_exact(self):
        study, exact = _resolve_study("clarke-2")
        # Still linked, so history/XP/Completion keep working for legacy rows …
        self.assertEqual(study, self.first)
        # … but it is a guess: the take may have been any of the Second Study.
        self.assertFalse(exact)

    def test_section_fallback_prefers_a_transcribed_exercise(self):
        bare = Study.objects.create(
            slug="clarke-3-1", section=3, number=1, title="Third — No. 1", order=1
        )
        StudyContent.objects.create(study=bare, musicxml="")
        scored = Study.objects.create(
            slug="clarke-3-2", section=3, number=2, title="Third — No. 2", order=2
        )
        StudyContent.objects.create(study=scored, musicxml=ReferenceTests.XML)
        study, exact = _resolve_study("clarke-3")
        self.assertEqual(study, scored)
        self.assertFalse(exact)

    def test_unknown_and_empty_ids_resolve_to_nothing(self):
        self.assertEqual(_resolve_study("nope-9"), (None, False))
        self.assertEqual(_resolve_study("not an id"), (None, False))
        self.assertEqual(_resolve_study(""), (None, False))


class AudioDecodeTests(TestCase):
    def test_mono_wav_round_trips(self):
        decoded = decode_audio(
            _to_wav_bytes(_steady_sine(220.0, 1.0)), filename="take.wav", mime="audio/wav"
        )
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded.sample_rate, SR)
        self.assertEqual(decoded.samples.ndim, 1)
        self.assertAlmostEqual(decoded.duration_seconds, 1.0, places=1)

    def test_stereo_wav_is_mixed_to_mono(self):
        n = SR // 2
        interleaved = np.empty(n * 2, dtype=np.float32)
        interleaved[0::2] = 0.5   # left
        interleaved[1::2] = -0.5  # right
        pcm = (interleaved * 32_767).astype("<i2").tobytes()
        decoded = decode_audio(_encode_wav(pcm, sample_width=2, channels=2))
        self.assertEqual(decoded.samples.shape[0], n)  # halved to mono
        self.assertLess(abs(float(np.mean(decoded.samples))), 0.05)  # L+R cancel

    def test_8bit_wav_decodes_into_range(self):
        n = SR // 2
        u8 = (128 + 40 * np.sin(2 * np.pi * 220 * np.arange(n) / SR)).astype(np.uint8)
        decoded = decode_audio(_encode_wav(u8.tobytes(), sample_width=1, channels=1))
        self.assertIsNotNone(decoded)
        peak = float(np.max(np.abs(decoded.samples)))
        self.assertGreater(peak, 0.1)
        self.assertLessEqual(peak, 1.0)

    def test_non_audio_bytes_return_none(self):
        self.assertIsNone(decode_audio(b"\x00\x01 definitely not audio", filename="x.m4a"))

    def test_empty_bytes_return_none(self):
        self.assertIsNone(decode_audio(b""))


class ScorerUnitTests(TestCase):
    """Each rubric category, isolated, via hand-built AudioFeatures."""

    def test_even_onsets_beat_irregular_on_rhythm(self):
        even = _category(_features(onset_times=np.arange(0.0, 6.0, 0.5), voiced_ratio=0.9),
                         "rhythm").points
        irregular = _category(
            _features(
                onset_times=np.array([0.0, 0.5, 0.7, 1.4, 1.5, 2.6, 2.7, 3.9, 4.6, 5.0]),
                voiced_ratio=0.9,
            ),
            "rhythm",
        ).points
        self.assertGreater(even, irregular)

    def test_too_few_onsets_cannot_earn_full_rhythm(self):
        cat = _category(_features(onset_times=np.array([0.0, 0.5]), voiced_ratio=0.8), "rhythm")
        self.assertLess(cat.points, MAX_RHYTHM)

    def test_steady_tempo_beats_accelerating(self):
        steady = _category(_features(onset_times=np.arange(0.0, 6.0, 0.5), voiced_ratio=0.9),
                           "tempo").points
        accel_iois = np.linspace(0.8, 0.2, 12)
        accel = np.concatenate([[0.0], np.cumsum(accel_iois)])
        rushing = _category(_features(onset_times=accel, voiced_ratio=0.9), "tempo").points
        self.assertGreater(steady, rushing)

    def test_slow_and_fast_steady_tempos_both_score_well(self):
        # The rubric rewards steadiness over speed: a slow even pulse and a fast
        # even pulse should both score near full.
        fast = _category(_features(onset_times=np.arange(0.0, 6.0, 0.3), voiced_ratio=0.9),
                         "tempo").points
        slow = _category(_features(onset_times=np.arange(0.0, 12.0, 0.6), voiced_ratio=0.9),
                         "tempo").points
        self.assertGreaterEqual(fast, 18)
        self.assertGreaterEqual(slow, 18)

    def test_in_tune_beats_flat_on_pitch(self):
        intune = _category(_features(cents_deviation=np.zeros(50), pitched_ratio=0.9),
                           "pitch").points
        flat = _category(_features(cents_deviation=np.full(50, 40.0), pitched_ratio=0.9),
                         "pitch").points
        self.assertGreater(intune, flat)

    def test_no_pitch_detected_scores_zero_pitch(self):
        self.assertEqual(_category(_features(), "pitch").points, 0.0)

    def test_even_loudness_beats_variable_on_tone(self):
        steady = _category(
            _features(rms=np.full(200, 0.3), cents_deviation=np.zeros(50)), "tone"
        ).points
        variable = _category(
            _features(rms=np.abs(np.sin(np.arange(200))) * 0.3 + 0.02,
                      cents_deviation=np.zeros(50)),
            "tone",
        ).points
        self.assertGreater(steady, variable)

    def test_completion_credits_full_length_and_penalises_truncation(self):
        full = _category(_features(sound_seconds=20.0, voiced_ratio=0.9, truncated=False),
                         "completion").points
        cut = _category(_features(sound_seconds=20.0, voiced_ratio=0.9, truncated=True),
                        "completion").points
        short = _category(_features(sound_seconds=4.0, voiced_ratio=0.5, truncated=False),
                          "completion").points
        self.assertGreater(full, cut)
        self.assertGreater(full, short)


class GradeLabelTests(TestCase):
    def test_label_boundaries_map_to_the_rubric_bands(self):
        cases = [
            (100, "A"), (93, "A"), (92, "A−"), (90, "A−"), (89, "B+"), (87, "B+"),
            (83, "B"), (80, "B−"), (77, "C+"), (73, "C"), (72, "C−"), (70, "C−"),
            (67, "D+"), (63, "D"), (60, "D−"), (59, "F"), (0, "F"),
        ]
        for total, expected in cases:
            self.assertEqual(_grade_label(total)[0], expected, msg=f"total={total}")

    def test_feedback_tip_targets_the_weakest_category(self):
        # Strong everywhere but pitch (badly flat) → the tip should be the pitch one.
        result = grade(
            _features(
                onset_times=np.arange(0.0, 6.0, 0.5),
                rms=np.full(200, 0.3),
                sound_seconds=20.0,
                voiced_ratio=0.9,
                cents_deviation=np.full(50, 45.0),
                pitched_ratio=0.9,
            )
        )
        weakest = min(result.categories, key=lambda c: c.points / c.max_points)
        self.assertEqual(weakest.key, "pitch")
        self.assertEqual(result.practice_tip, _TIPS["pitch"])


class SerializerValidationTests(TestCase):
    def _wav(self):
        return SimpleUploadedFile(
            "take.wav", _to_wav_bytes(_steady_sine(220.0, 0.5)), content_type="audio/wav"
        )

    def test_valid_payload_passes(self):
        serializer = SubmissionCreateSerializer(
            data={"audio": self._wav(), "exercise_id": "clarke-2", "duration_seconds": "3.2"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["exercise_id"], "clarke-2")

    def test_oversized_audio_is_rejected(self):
        upload = SimpleUploadedFile("take.wav", b"0123456789", content_type="audio/wav")
        with mock.patch("grading.serializers.MAX_AUDIO_BYTES", 5):
            serializer = SubmissionCreateSerializer(data={"audio": upload})
            self.assertFalse(serializer.is_valid())
            self.assertIn("audio", serializer.errors)

    def test_optional_fields_default(self):
        serializer = SubmissionCreateSerializer(data={"audio": self._wav()})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["exercise_id"], "")
        self.assertEqual(serializer.validated_data["exercise_title"], "")
        self.assertEqual(serializer.validated_data["duration_seconds"], 0)


# ---------------------------------------------------------------------------
# Note-level grading
# ---------------------------------------------------------------------------
#
# The shared fixture below is the anchor for cross-language parity: the mobile
# test `apps/mobile/tests/results.noteOverlay.test.tsx` walks the *same* string
# through the TypeScript `buildTimeline` and asserts the same triples. If the
# two walks ever drift, verdicts land on the wrong glyphs — silently, and
# looking entirely plausible — so both sides pin the fixture explicitly.

PARITY_XML = """<?xml version="1.0"?>
<score-partwise version="3.1">
 <part id="P1">
  <measure number="1">
   <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef></attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
   <note><rest/><duration>4</duration><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
   <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration>
     <type>quarter</type><tie type="start"/></note>
  </measure>
  <measure number="2">
   <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration>
     <type>quarter</type><tie type="stop"/></note>
   <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>
   <note><rest/><duration>8</duration><type>half</type></note>
  </measure>
 </part>
</score-partwise>"""

# (index, note_index, sounding midi, onset_beats, duration_beats)
# Written C4/E4/G4/F#4 sound a major second lower on a B♭ trumpet.
# Note the divergence this whole design exists for: expected index 1 is the
# fourth <note> element, because the rest occupies a glyph slot but not a
# sounding ordinal. The tied G4 pair is ONE note of two beats.
PARITY_EXPECTED = [
    (0, 0, 58.0, 0.0, 1.0),
    (1, 2, 62.0, 2.0, 1.0),
    (2, 3, 65.0, 3.0, 2.0),
    (3, 5, 64.0, 5.0, 1.0),
]


class TimelineTests(TestCase):
    def test_matches_the_shared_parity_fixture(self):
        timeline = timeline_from_musicxml(PARITY_XML)
        actual = [
            (n.index, n.note_index, n.midi, n.onset_beats, n.duration_beats)
            for n in timeline.notes
        ]
        self.assertEqual(actual, PARITY_EXPECTED)

    def test_index_and_note_index_diverge_at_a_rest(self):
        timeline = timeline_from_musicxml(PARITY_XML)
        # The sounding ordinal and the glyph handle are NOT the same number.
        self.assertEqual([n.index for n in timeline.notes], [0, 1, 2, 3])
        self.assertEqual([n.note_index for n in timeline.notes], [0, 2, 3, 5])

    def test_rests_advance_time_but_emit_no_note(self):
        timeline = timeline_from_musicxml(PARITY_XML)
        # The rest at beat 1 pushes E4 to beat 2 rather than beat 1.
        self.assertEqual(timeline.notes[1].onset_beats, 2.0)
        # Trailing rest counts toward the notated length.
        self.assertEqual(timeline.total_beats, 8.0)

    def test_adjacent_tie_merges_into_one_held_note(self):
        timeline = timeline_from_musicxml(PARITY_XML)
        held = timeline.notes[2]
        self.assertEqual(held.duration_beats, 2.0)
        self.assertEqual(len(timeline.notes), 4)

    def test_tie_across_a_rest_is_not_merged(self):
        """Every <tie> in the bundled corpus spans a rest — an OMR artifact.

        Merging across it would fuse two genuinely separate notes into one and
        corrupt all 14 Study 6 files.
        """
        xml = """<score-partwise><part><measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration>
            <tie type="start"/></note>
          <note><rest/><duration>4</duration></note>
          <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration>
            <tie type="stop"/></note>
        </measure></part></score-partwise>"""
        timeline = timeline_from_musicxml(xml)
        self.assertEqual(len(timeline.notes), 2)
        self.assertEqual(timeline.notes[0].onset_beats, 0.0)
        self.assertEqual(timeline.notes[1].onset_beats, 5.0)

    def test_transposition_is_applied_exactly_once(self):
        written = timeline_from_musicxml(PARITY_XML, transposition_semitones=0)
        sounding = timeline_from_musicxml(PARITY_XML, transposition_semitones=-2)
        self.assertEqual([n.midi for n in written.notes], [60.0, 64.0, 67.0, 66.0])
        for w, s in zip(written.notes, sounding.notes, strict=True):
            self.assertEqual(s.midi, w.midi - 2)

    def test_grace_and_chord_notes_take_no_time(self):
        xml = """<score-partwise><part><measure number="1">
          <attributes><divisions>1</divisions></attributes>
          <note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure></part></score-partwise>"""
        timeline = timeline_from_musicxml(xml, transposition_semitones=0)
        self.assertEqual([n.midi for n in timeline.notes], [60.0, 62.0])
        self.assertEqual([n.onset_beats for n in timeline.notes], [0.0, 1.0])

    def test_unparseable_or_empty_notation_returns_none(self):
        self.assertIsNone(timeline_from_musicxml(""))
        self.assertIsNone(timeline_from_musicxml("<not xml"))
        self.assertIsNone(
            timeline_from_musicxml("<score-partwise><part></part></score-partwise>")
        )

    def test_bpm_precedence_matches_the_completion_reference(self):
        self.assertEqual(
            timeline_from_musicxml(
                PARITY_XML.replace("<part ", '<sound tempo="144"/><part '),
                tempo_label="♩ = 60",
            ).bpm,
            144.0,
        )
        self.assertEqual(timeline_from_musicxml(PARITY_XML, tempo_label="♩ = 60").bpm, 60.0)
        self.assertEqual(timeline_from_musicxml(PARITY_XML).bpm, 96.0)


class NotationValidationTests(TestCase):
    def test_clean_notation_has_no_issues(self):
        self.assertEqual(validate_notation(PARITY_XML), [])

    # First and last measures are exempt (pickups and repeat endings), so a
    # fixture needs an interior measure to exercise the duration rule.
    THREE_BAR = """<score-partwise><part id="P1">
      <measure number="1"><attributes><divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>
      <measure number="2">
        <note><pitch><step>D</step><octave>4</octave></pitch><duration>{middle}</duration></note></measure>
      <measure number="3">
        <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note></measure>
    </part></score-partwise>"""

    def test_a_correct_interior_measure_passes(self):
        self.assertEqual(validate_notation(self.THREE_BAR.format(middle=4)), [])

    def test_interior_measure_of_the_wrong_length_is_flagged(self):
        kinds = [i.kind for i in validate_notation(self.THREE_BAR.format(middle=7))]
        self.assertIn("measure_duration", kinds)

    def test_a_short_final_measure_is_not_flagged(self):
        """Every bundled study is written with repeats; the last bar is routinely
        a partial ending, and the aligner's free end gaps absorb it."""
        xml = self.THREE_BAR.format(middle=4).replace(
            "<step>E</step><octave>4</octave></pitch><duration>4</duration>",
            "<step>E</step><octave>4</octave></pitch><duration>9</duration>",
        )
        self.assertEqual(validate_notation(xml), [])

    def test_out_of_range_pitch_is_flagged(self):
        xml = PARITY_XML.replace(
            "<step>C</step><octave>4</octave>", "<step>C</step><octave>8</octave>"
        )
        kinds = [i.kind for i in validate_notation(xml)]
        self.assertIn("pitch_range", kinds)

    def test_empty_and_unparseable_notation_are_flagged(self):
        self.assertEqual([i.kind for i in validate_notation("")], ["empty"])
        self.assertEqual([i.kind for i in validate_notation("<nope")], ["unparseable"])

    def test_the_whole_bundled_corpus_passes(self):
        """The gate that keeps note-level grading off notation we don't trust.

        All 132 bundled studies currently pass. Two near-misses were measured
        and deliberately excluded from the rules, because neither corrupts an
        alignment:

        * the 14 Study 6 files whose *final* measure holds 5 quarters in 4/4 —
          a whole rest plus a tie-stop note, the OMR's rendering of a repeat
          ending. Only interior measures are checked, and the aligner's free end
          gaps drop the trailing note from the graded span anyway.
        * the 8 files reaching written E6–F♯6 (clarke-5-10/11/12/25,
          clarke-9-3/4/5/6). Those are legitimately high studies, well inside
          the catalogue's documented E3–G6 span.

        A failure here means the corpus regressed, not that the bounds are wrong.
        """
        seed = Path(settings.BASE_DIR) / "studies" / "seed" / "musicxml"
        files = sorted(seed.glob("*.musicxml"))
        self.assertEqual(len(files), 132)
        flagged = {
            path.stem: validate_notation(path.read_text())
            for path in files
            if validate_notation(path.read_text())
        }
        self.assertEqual(flagged, {})

    def test_every_bundled_study_yields_an_ordered_timeline(self):
        seed = Path(settings.BASE_DIR) / "studies" / "seed" / "musicxml"
        for path in sorted(seed.glob("*.musicxml")):
            timeline = timeline_from_musicxml(path.read_text())
            self.assertIsNotNone(timeline, path.stem)
            previous = -1.0
            for i, note in enumerate(timeline.notes):
                self.assertEqual(note.index, i, path.stem)
                self.assertGreaterEqual(note.onset_beats, previous, path.stem)
                self.assertGreater(note.duration_beats, 0, path.stem)
                previous = note.onset_beats


class AnalysisFrameAlignmentTests(TestCase):
    """The pitch track must be locatable in time, without changing old scores."""

    def test_pitch_track_is_one_entry_per_frame(self):
        features = analyze(_tone_sequence(CLEAN_MIDIS), SR)
        self.assertEqual(features.f0_frames.size, features.frame_times.size)
        self.assertEqual(features.cents_frames.size, features.frame_times.size)
        self.assertEqual(features.periodicity_frames.size, features.frame_times.size)

    def test_compact_arrays_are_the_frame_track_with_gaps_removed(self):
        """Guards the refactor: the arrays the old rubric reads are unchanged."""
        features = analyze(_tone_sequence(CLEAN_MIDIS), SR)
        pitched = ~np.isnan(features.f0_frames)
        np.testing.assert_array_equal(features.f0_hz, features.f0_frames[pitched])
        np.testing.assert_array_equal(
            features.cents_deviation, features.cents_frames[pitched]
        )
        voiced = np.count_nonzero(_voiced_frames(features))
        self.assertAlmostEqual(
            features.pitched_ratio, features.f0_hz.size / voiced, places=6
        )

    def test_a_pitch_change_lands_in_the_right_frame(self):
        """The property the compacted arrays could not provide at all."""
        first, second = _steady_sine(220.0, 1.0), _steady_sine(440.0, 1.0)
        features = analyze(np.concatenate([first, second]), SR)
        midi = 69.0 + 12.0 * np.log2(features.f0_frames / 440.0)

        at_quarter = midi[int(0.5 / features.hop_seconds)]
        at_three_quarters = midi[int(1.5 / features.hop_seconds)]
        self.assertAlmostEqual(at_quarter, 57.0, delta=0.6)   # A3
        self.assertAlmostEqual(at_three_quarters, 69.0, delta=0.6)  # A4

    def test_silence_yields_an_all_nan_track(self):
        features = analyze(np.zeros(SR * 2, dtype=np.float32), SR)
        self.assertTrue(np.all(np.isnan(features.f0_frames)))
        self.assertEqual(features.f0_hz.size, 0)


def _voiced_frames(features: AudioFeatures) -> np.ndarray:
    loud = float(np.percentile(features.rms, 95))
    return features.rms >= max(loud * 0.12, 1e-4)


class SegmentationTests(TestCase):
    def test_separated_tones_become_separate_notes(self):
        features = analyze(_tone_sequence([60, 62, 64]), SR)
        notes = segment_notes(features)
        self.assertEqual(len(notes), 3)
        self.assertAlmostEqual(notes[0].midi, 60.0, delta=0.5)
        self.assertAlmostEqual(notes[1].midi, 62.0, delta=0.5)
        self.assertAlmostEqual(notes[2].midi, 64.0, delta=0.5)

    def test_a_slurred_pitch_change_still_splits(self):
        """The case attack detection cannot see — and most of Clarke is slurred."""
        joined = np.concatenate(
            [_steady_sine(_midi_to_hz(60), 0.5), _steady_sine(_midi_to_hz(64), 0.5)]
        )
        notes = segment_notes(analyze(joined, SR))
        self.assertEqual(len(notes), 2)
        self.assertAlmostEqual(notes[0].midi, 60.0, delta=0.5)
        self.assertAlmostEqual(notes[1].midi, 64.0, delta=0.5)

    def test_onsets_land_near_the_true_note_starts(self):
        notes = segment_notes(analyze(_tone_sequence([60, 62, 64]), SR))
        # note 0.35 s + gap 0.12 s → attacks at 0.00, 0.47, 0.94.
        for note, expected in zip(notes, [0.0, 0.47, 0.94], strict=True):
            self.assertAlmostEqual(note.onset, expected, delta=0.06)

    def test_a_held_tone_is_one_note(self):
        notes = segment_notes(analyze(_steady_sine(330.0, 1.2), SR))
        self.assertEqual(len(notes), 1)
        self.assertAlmostEqual(notes[0].midi, 64.0, delta=0.5)

    def test_silence_and_noise_yield_no_notes(self):
        self.assertEqual(segment_notes(analyze(np.zeros(SR, dtype=np.float32), SR)), [])
        rng = np.random.default_rng(7)
        noise = rng.normal(0, 0.25, SR).astype(np.float32)
        self.assertLessEqual(len(segment_notes(analyze(noise, SR))), 2)

    def test_empty_features_are_safe(self):
        self.assertEqual(segment_notes(AudioFeatures(duration_seconds=0, sample_rate=SR)), [])


def _timeline(midis: list[float], *, bpm: float = 120.0, beat: float = 1.0):
    """A synthetic expected timeline of evenly spaced notes."""
    notes = [
        ExpectedNote(
            index=i, note_index=i, midi=m,
            onset_beats=i * beat, duration_beats=beat, measure_index=i // 4,
        )
        for i, m in enumerate(midis)
    ]
    return ExpectedTimeline(
        notes=notes, bpm=bpm, total_beats=len(midis) * beat
    )


def _performed(midis: list[float], *, spb: float = 0.5, start: float = 0.0, jitter=None):
    from .engine.segment import PerformedNote

    out = []
    for i, m in enumerate(midis):
        onset = start + i * spb + (jitter[i] if jitter else 0.0)
        out.append(
            PerformedNote(
                onset=onset, offset=onset + spb * 0.9, midi=m,
                cents=0.0, confidence=1.0, rms=0.2,
            )
        )
    return out


TWENTY = [60 + i for i in range(20)]


class AlignmentTests(TestCase):
    def test_a_perfect_performance_is_all_correct(self):
        result = align(_timeline(TWENTY), _performed(TWENTY))
        self.assertEqual(result.count("correct"), 20)
        self.assertEqual(result.count("wrong"), 0)
        self.assertEqual(result.count("missed"), 0)
        self.assertFalse(result.degenerate)

    def test_one_wrong_note_does_not_cascade(self):
        played = list(TWENTY)
        played[7] = played[7] + 5
        result = align(_timeline(TWENTY), _performed(played))
        self.assertEqual(result.count("wrong"), 1)
        self.assertEqual(result.count("correct"), 19)

    def test_a_substitution_an_insertion_and_a_deletion_stay_local(self):
        """The failure a greedy matcher has: one slip must not redden the rest."""
        played = list(TWENTY)
        played[4] = played[4] + 3          # substitution
        played.pop(12)                      # deletion
        played.insert(16, 99)               # insertion
        result = align(_timeline(TWENTY), _performed(played))
        self.assertEqual(result.count("wrong"), 1)
        self.assertEqual(result.count("missed"), 1)
        self.assertEqual(result.extra_notes, 1)
        # 20 expected − 1 wrong − 1 missed = 18 still correct, no cascade.
        self.assertEqual(result.count("correct"), 18)

    def test_a_slower_but_even_performance_is_still_correct(self):
        """The tempo fit: Rhythm judges timing within the player's own tempo."""
        result = align(_timeline(TWENTY, bpm=120.0), _performed(TWENTY, spb=0.8))
        self.assertEqual(result.count("correct"), 20)
        self.assertAlmostEqual(result.seconds_per_beat, 0.8, delta=0.02)

    def test_taking_the_repeat_is_not_penalised(self):
        """Every bundled study is written with repeats."""
        twice = _performed(TWENTY + TWENTY)
        result = align(_timeline(TWENTY), twice)
        self.assertEqual(result.count("correct"), 20)
        self.assertEqual(result.count("missed"), 0)
        self.assertEqual(result.extra_notes, 0)

    def test_a_late_start_is_not_penalised(self):
        result = align(_timeline(TWENTY), _performed(TWENTY, start=3.0))
        self.assertEqual(result.count("correct"), 20)

    def test_timing_error_is_reported_in_beats(self):
        jitter = [0.0] * 20
        jitter[10] = 0.2  # 0.2 s late at 0.5 s/beat = 0.4 beats
        result = align(_timeline(TWENTY), _performed(TWENTY, jitter=jitter))
        late = result.verdicts[10]
        self.assertGreater(late.timing_error_beats, 0.2)

    def test_playing_something_else_entirely_is_degenerate(self):
        junk = _performed([40 + (i * 7) % 5 for i in range(20)])
        result = align(_timeline(TWENTY), junk)
        self.assertTrue(result.degenerate)

    def test_a_fragment_is_degenerate_rather_than_perfect(self):
        """Playing four notes of twenty must not score full marks on Pitch."""
        result = align(_timeline(TWENTY), _performed(TWENTY[:4]))
        self.assertTrue(result.degenerate)

    def test_nothing_to_align_returns_none(self):
        self.assertIsNone(align(_timeline([]), _performed(TWENTY)))
        self.assertIsNone(align(_timeline(TWENTY), []))


class NoteRubricTests(TestCase):
    def _alignment(self, statuses: list[str], *, extra: int = 0, cents=0.0, timing=0.0):
        verdicts = [
            NoteVerdict(
                expected_index=i,
                status=s,
                cents_error=None if s == "missed" else cents,
                timing_error_beats=None if s == "missed" else timing,
                heard_midi=None if s == "missed" else 60.0,
            )
            for i, s in enumerate(statuses)
        ]
        return Alignment(
            verdicts=verdicts, extra_notes=extra, seconds_per_beat=0.5,
            origin_seconds=0.0, degenerate=False,
        )

    def _points(self, alignment, key):
        features = analyze(_tone_sequence(CLEAN_MIDIS), SR)
        result = grade(features, alignment=alignment)
        return next(c for c in result.categories if c.key == key).points

    def test_all_correct_earns_near_full_pitch_and_rhythm(self):
        alignment = self._alignment(["correct"] * 20)
        self.assertGreater(self._points(alignment, "pitch"), 24.0)
        self.assertGreater(self._points(alignment, "rhythm"), 24.0)

    def test_half_wrong_roughly_halves_pitch(self):
        alignment = self._alignment(["correct"] * 10 + ["wrong"] * 10)
        points = self._points(alignment, "pitch")
        self.assertGreater(points, 10.0)
        self.assertLess(points, 19.0)

    def test_missed_notes_cost_pitch(self):
        good = self._points(self._alignment(["correct"] * 20), "pitch")
        poor = self._points(self._alignment(["correct"] * 15 + ["missed"] * 5), "pitch")
        self.assertGreater(good, poor)

    def test_extra_notes_cost_rhythm(self):
        clean = self._points(self._alignment(["correct"] * 20), "rhythm")
        littered = self._points(self._alignment(["correct"] * 20, extra=5), "rhythm")
        self.assertGreater(clean, littered)

    def test_intonation_still_refines_a_fully_correct_take(self):
        centred = self._points(self._alignment(["correct"] * 20, cents=0.0), "pitch")
        edgy = self._points(self._alignment(["correct"] * 20, cents=45.0), "pitch")
        self.assertGreater(centred, edgy)

    def test_no_alignment_reproduces_the_reference_free_scores_exactly(self):
        """The fallback contract: an unaligned take is graded exactly as before."""
        features = analyze(_tone_sequence(CLEAN_MIDIS), SR)
        before = grade(features)
        after = grade(features, alignment=None)
        self.assertEqual(
            [(c.key, c.points, c.detail) for c in before.categories],
            [(c.key, c.points, c.detail) for c in after.categories],
        )
        self.assertEqual(before.total_score, after.total_score)

    def test_a_degenerate_alignment_falls_back_rather_than_reddening_everything(self):
        features = analyze(_tone_sequence(CLEAN_MIDIS), SR)
        degenerate = Alignment(
            verdicts=[NoteVerdict(expected_index=i, status="missed") for i in range(20)],
            extra_notes=0, seconds_per_beat=0.5, origin_seconds=0.0, degenerate=True,
        )
        self.assertEqual(
            grade(features, alignment=degenerate).total_score,
            grade(features).total_score,
        )


def _render_timeline(timeline, *, wrong: set[int] = frozenset()) -> np.ndarray:
    """Synthesise a performance of an expected timeline at its own tempo."""
    spb = 60.0 / timeline.bpm
    total = timeline.total_beats * spb + 0.5
    out = np.zeros(int(total * SR), dtype=np.float32)
    for expected in timeline.notes:
        midi = expected.midi + (2.0 if expected.index in wrong else 0.0)
        seconds = max(expected.duration_beats * spb, 0.12)
        start = int(expected.onset_beats * spb * SR)
        burst = _note(_midi_to_hz(midi), seconds * 0.85)
        out[start : start + burst.size] += burst[: max(0, out.size - start)].astype(
            np.float32
        )
    return out


class NoteLevelSubmissionTests(TestCase):
    """The end-to-end contract: exact id → note grading, and POST/GET agree."""

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            email="notes@example.com", password="x"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.study = Study.objects.create(
            slug="clarke-2-1", section=2, number=1, title="Second — No. 1", order=1
        )
        StudyContent.objects.create(
            study=self.study, musicxml=PARITY_XML, transposition_semitones=-2
        )
        timeline = timeline_from_musicxml(PARITY_XML)
        self.audio = _render_timeline(timeline)

    def _upload(self, name="take.wav"):
        return SimpleUploadedFile(
            name, _to_wav_bytes(self.audio), content_type="audio/wav"
        )

    def _post(self, exercise_id):
        return self.client.post(
            reverse("grading:submission-create"),
            {"audio": self._upload(), "exercise_id": exercise_id},
        )

    def test_an_exact_slug_grades_note_by_note(self):
        body = self._post("clarke-2-1").json()
        self.assertTrue(body["note_grading"])
        self.assertEqual(body["study_slug"], "clarke-2-1")
        self.assertTrue(body["note_results"])
        for row in body["note_results"]:
            self.assertIn(row["v"], {"correct", "wrong", "missed"})
            self.assertIsInstance(row["i"], int)
        self.assertEqual(
            body["note_summary"]["gradeable"], len(body["note_results"])
        )

    def test_a_section_level_id_does_not_grade_note_by_note(self):
        """It resolves to *a* study, but not to the one that was played."""
        body = self._post("clarke-2").json()
        self.assertFalse(body["note_grading"])
        self.assertEqual(body["note_results"], [])
        # Still linked, so history/XP/Completion keep working.
        self.assertEqual(body["study_slug"], "clarke-2-1")

    def test_notes_are_matched_against_sounding_pitch(self):
        """The B♭ transposition, end to end.

        Written pitches would read a whole tone sharp; if the shift were dropped
        or applied twice, the same audio would come back mostly wrong.
        """
        body = self._post("clarke-2-1").json()
        self.assertTrue(body["note_grading"])
        summary = body["note_summary"]
        self.assertEqual(summary["correct"], summary["gradeable"])

    def test_a_wrong_note_is_reported_as_wrong(self):
        timeline = timeline_from_musicxml(PARITY_XML)
        self.audio = _render_timeline(timeline, wrong={1})
        body = self._post("clarke-2-1").json()
        wrong = [r for r in body["note_results"] if r["v"] == "wrong"]
        self.assertEqual(len(wrong), 1)
        self.assertEqual(wrong[0]["i"], 1)
        self.assertIn("m", wrong[0])  # what was heard, for "expected X, heard Y"

    def test_post_and_history_report_the_same_grade(self):
        """The drift `wire.py` exists to prevent: a tapped history row must show
        exactly what the fresh grade showed."""
        posted = self._post("clarke-2-1").json()

        listed = self.client.get(reverse("grading:submission-create")).json()
        row = listed["results"][0]
        self.assertEqual(row["study_slug"], posted["study_slug"])
        for field in ("note_grading", "note_results", "note_summary"):
            self.assertEqual(row["grade"][field], posted[field], field)
        self.assertEqual(row["grade"]["total_score"], posted["total_score"])
        self.assertEqual(row["grade"]["categories"], posted["categories"])

    def test_verdicts_survive_the_database_round_trip(self):
        body = self._post("clarke-2-1").json()
        stored = Submission.objects.get(id=body["submission_id"]).grade
        self.assertTrue(stored.note_grading)
        self.assertEqual(stored.note_results, body["note_results"])
        self.assertEqual(stored.note_extra, body["note_summary"]["extra"])

    def test_a_grade_without_note_data_still_serialises(self):
        """Rows stored before note-level grading existed must still render."""
        body = self._post("clarke-2").json()
        stored = Submission.objects.get(id=body["submission_id"]).grade
        self.assertFalse(stored.note_grading)
        self.assertEqual(stored.note_results, [])

        row = self.client.get(reverse("grading:submission-create")).json()["results"][0]
        self.assertFalse(row["grade"]["note_grading"])
        self.assertEqual(row["grade"]["note_results"], [])
        self.assertEqual(row["grade"]["note_summary"]["gradeable"], 0)

    def test_unanalysable_audio_reports_no_note_grading(self):
        resp = self.client.post(
            reverse("grading:submission-create"),
            {
                "audio": SimpleUploadedFile(
                    "take.m4a", b"not audio at all", content_type="audio/m4a"
                ),
                "exercise_id": "clarke-2-1",
            },
        )
        body = resp.json()
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(body["note_grading"])
        self.assertEqual(body["note_results"], [])


class NoteWireTests(TestCase):
    def test_engine_verdicts_map_to_compact_rows(self):
        alignment = Alignment(
            verdicts=[
                NoteVerdict(0, "correct", cents_error=4.2, timing_error_beats=-0.01,
                            heard_midi=58.0),
                NoteVerdict(1, "missed"),
            ],
            extra_notes=2, seconds_per_beat=0.5, origin_seconds=0.0, degenerate=False,
        )
        rows = note_results_from_engine(alignment)
        self.assertEqual(rows[0], {"i": 0, "v": "correct", "t": -0.01, "c": 4.2, "m": 58.0})
        # A missed note carries no measurements — there was nothing to measure.
        self.assertEqual(rows[1], {"i": 1, "v": "missed"})

    def test_no_alignment_maps_to_no_rows(self):
        self.assertEqual(note_results_from_engine(None), [])

    def test_summary_counts_every_verdict_plus_extras(self):
        rows = [
            {"i": 0, "v": "correct"}, {"i": 1, "v": "correct"},
            {"i": 2, "v": "wrong"}, {"i": 3, "v": "missed"},
        ]
        self.assertEqual(
            note_summary(rows, extra=3),
            {"correct": 2, "wrong": 1, "missed": 1, "extra": 3, "gradeable": 4},
        )
