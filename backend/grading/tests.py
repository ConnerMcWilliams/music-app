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
from unittest import mock

import numpy as np
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from progress.models import Profile
from studies.models import Study, StudyContent

from .engine import expected_from_musicxml, grade_recording
from .engine.analysis import AudioFeatures, analyze
from .engine.audio import decode_audio
from .engine.rubric import _TIPS, MAX_RHYTHM, _grade_label, grade
from .models import Submission
from .serializers import SubmissionCreateSerializer

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
