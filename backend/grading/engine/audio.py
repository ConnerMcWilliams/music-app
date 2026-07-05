"""
Audio decoding for the grading engine.

Turns an uploaded take (arbitrary container/codec) into a mono float32 signal in
``[-1, 1]`` plus its sample rate — the single representation every DSP step
downstream understands.

Decoding is best-effort and layered so the common cases work with zero system
setup, and richer formats work when a decoder is available:

1. **WAV** (``.wav`` / RIFF) is decoded with the standard-library ``wave``
   module — no third-party dependency, always available. This is the format the
   engine's own tests synthesize.
2. **Compressed audio** (m4a/aac/mp3/ogg — what phones actually record) is
   decoded with **PyAV** if it happens to be importable (its wheels bundle
   FFmpeg, so ``pip install av`` makes device recordings work with no system
   install), otherwise by shelling out to a system ``ffmpeg`` if one is on PATH.
3. If none of those can read the bytes, decoding returns ``None`` and the caller
   falls back to a degraded, honestly-labelled grade rather than inventing one.

Everything is resampled/mixed to mono; compressed decodes are normalized to
``TARGET_SAMPLE_RATE`` so frame sizes downstream are predictable.
"""
from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
import wave
from dataclasses import dataclass

import numpy as np

# Compressed audio is decoded to this rate. 22.05 kHz is plenty for trumpet
# pitch analysis (highest fundamental ~1 kHz) and keeps the frame math light.
TARGET_SAMPLE_RATE = 22_050


@dataclass(frozen=True)
class DecodedAudio:
    """Mono PCM ready for analysis."""

    samples: np.ndarray  # float32, shape (n,), roughly in [-1, 1]
    sample_rate: int

    @property
    def duration_seconds(self) -> float:
        if self.sample_rate <= 0:
            return 0.0
        return len(self.samples) / self.sample_rate


def decode_audio(
    data: bytes,
    *,
    filename: str | None = None,
    mime: str | None = None,
) -> DecodedAudio | None:
    """Decode ``data`` to mono PCM, or return ``None`` if no decoder can read it.

    ``filename``/``mime`` are hints only; the actual container is detected from
    the byte signature so a mislabelled upload still decodes.
    """
    if not data:
        return None

    if _looks_like_wav(data):
        decoded = _decode_wav(data)
        if decoded is not None:
            return decoded
        # A truncated/odd WAV falls through to the transcoders, which are more
        # forgiving.

    decoded = _decode_with_pyav(data)
    if decoded is not None:
        return decoded

    return _decode_with_ffmpeg(data)


def _looks_like_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def _decode_wav(data: bytes) -> DecodedAudio | None:
    """Decode a PCM WAV with the standard library only."""
    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            n_channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            frame_rate = wav.getframerate()
            frames = wav.readframes(wav.getnframes())
    except (wave.Error, EOFError):
        return None

    if frame_rate <= 0 or n_channels <= 0 or not frames:
        return None

    mono = _pcm_bytes_to_mono_float(frames, sample_width, n_channels)
    if mono is None:
        return None
    return DecodedAudio(samples=mono, sample_rate=frame_rate)


def _pcm_bytes_to_mono_float(
    frames: bytes, sample_width: int, n_channels: int
) -> np.ndarray | None:
    """Interleaved integer PCM bytes → mono float32 in [-1, 1]."""
    if sample_width == 1:
        # 8-bit WAV is unsigned, centred on 128.
        raw = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        samples = (raw - 128.0) / 128.0
    elif sample_width == 2:
        raw = np.frombuffer(frames, dtype="<i2").astype(np.float32)
        samples = raw / 32_768.0
    elif sample_width == 3:
        # 24-bit little-endian: widen each 3-byte sample to int32.
        as_bytes = np.frombuffer(frames, dtype=np.uint8)
        if as_bytes.size % 3 != 0:
            return None
        triples = as_bytes.reshape(-1, 3).astype(np.int32)
        raw = triples[:, 0] | (triples[:, 1] << 8) | (triples[:, 2] << 16)
        raw = np.where(raw & 0x80_0000, raw - 0x100_0000, raw)  # sign-extend
        samples = raw.astype(np.float32) / 8_388_608.0
    elif sample_width == 4:
        raw = np.frombuffer(frames, dtype="<i4").astype(np.float32)
        samples = raw / 2_147_483_648.0
    else:
        return None

    if n_channels > 1:
        usable = (samples.size // n_channels) * n_channels
        samples = samples[:usable].reshape(-1, n_channels).mean(axis=1)
    return np.ascontiguousarray(samples, dtype=np.float32)


def _decode_with_pyav(data: bytes) -> DecodedAudio | None:
    """Decode compressed audio with PyAV, if it is installed.

    PyAV ships FFmpeg inside its wheel, so this path needs no system packages.
    It is an optional import: absence just means we try the next decoder.
    """
    try:
        import av  # type: ignore
    except Exception:
        return None

    try:
        container = av.open(io.BytesIO(data))
        resampler = av.audio.resampler.AudioResampler(
            format="flt", layout="mono", rate=TARGET_SAMPLE_RATE
        )
        chunks: list[np.ndarray] = []
        for frame in container.decode(audio=0):
            for resampled in resampler.resample(frame):
                chunks.append(resampled.to_ndarray().reshape(-1))
        container.close()
    except Exception:
        return None

    if not chunks:
        return None
    samples = np.concatenate(chunks).astype(np.float32)
    return DecodedAudio(samples=samples, sample_rate=TARGET_SAMPLE_RATE)


def _decode_with_ffmpeg(data: bytes) -> DecodedAudio | None:
    """Transcode to mono 16-bit WAV via a system ``ffmpeg`` binary, if present."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None

    # ffmpeg can read most containers from a real file more reliably than from a
    # pipe (seeking), so stage the upload in a temp file.
    with tempfile.NamedTemporaryFile(suffix=".input") as src:
        src.write(data)
        src.flush()
        try:
            proc = subprocess.run(
                [
                    ffmpeg, "-v", "error", "-i", src.name,
                    "-ac", "1", "-ar", str(TARGET_SAMPLE_RATE),
                    "-f", "wav", "pipe:1",
                ],
                capture_output=True,
                timeout=60,
            )
        except (subprocess.SubprocessError, OSError):
            return None

    if proc.returncode != 0 or not proc.stdout:
        return None
    return _decode_wav(proc.stdout)
