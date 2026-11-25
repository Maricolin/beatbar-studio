"""Bounded-memory transient detection for normalized, mono PCM audio.

The detector deliberately returns observed attacks, not a generated metronome.
All times are seconds and loudness is unweighted original-sample RMS dBFS, not SPL.
Only NumPy and SciPy are required.  No caller-owned audio is modified.
"""
from __future__ import annotations

from bisect import bisect_left
import math

import numpy as np
from scipy.fft import rfft
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import find_peaks


_BATCH_FRAMES = 512
_LOG_FLOOR = 1e-5
_SILENCE_RMS = 1e-6


def _check_cancel(cancel) -> None:
    if cancel is not None:
        cancelled = cancel.is_set() if hasattr(cancel, "is_set") else cancel()
        if cancelled:
            raise RuntimeError("Cancelled")


def _report(progress, value: int, message: str) -> None:
    if progress is not None:
        progress(value, message)


def _samples(audio: np.ndarray, start: int, stop: int) -> np.ndarray:
    # Sanitizing each bounded slice avoids copying a twenty-minute recording.
    return np.nan_to_num(np.asarray(audio[start:stop], dtype=np.float32),
                         copy=True, nan=0.0, posinf=0.0, neginf=0.0)


def _features(audio, sample_rate, n_fft, hop, low_hz, high_hz, cancel, progress):
    count = 1 + (audio.size - 1) // hop
    frequencies = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    selected = np.flatnonzero((frequencies >= low_hz) & (frequencies <= high_hz))
    if selected.size == 0:
        raise ValueError("The selected frequency band contains no FFT bins.")
    # Octave-ish bands make a bass attack comparable to a high-frequency attack.
    boundaries = sorted(set([low_hz, high_hz] +
                            [f for f in (125, 250, 500, 1000, 2000, 4000, 8000)
                             if low_hz < f < high_hz]))
    bands = []
    for left, right in zip(boundaries, boundaries[1:]):
        indices = np.flatnonzero((frequencies[selected] >= left) &
                                 (frequencies[selected] < right))
        if right == high_hz:
            indices = np.flatnonzero((frequencies[selected] >= left) &
                                     (frequencies[selected] <= right))
        if indices.size:
            bands.append(indices)
    flux = np.zeros((count, len(bands)), dtype=np.float32)
    band_power = np.zeros_like(flux)
    window = np.hanning(n_fft).astype(np.float32)
    normalization = 2.0 / float(window.sum())
    previous = None
    for first in range(0, count, _BATCH_FRAMES):
        _check_cancel(cancel)
        last = min(count, first + _BATCH_FRAMES)
        start = first * hop - n_fft // 2
        stop = (last - 1) * hop + n_fft // 2
        block = np.zeros(stop - start, dtype=np.float32)
        source_start, source_stop = max(0, start), min(audio.size, stop)
        block[source_start - start:source_stop - start] = _samples(audio, source_start, source_stop)
        frames = np.lib.stride_tricks.sliding_window_view(block, n_fft)[::hop]
        magnitude = np.abs(rfft(frames * window, axis=1, workers=1)) * normalization
        magnitude = magnitude[:, selected]
        compressed = np.log1p(magnitude / _LOG_FLOOR)
        # Frequency-local maximum reference suppresses stationary tones and small
        # frequency/phase fluctuations without an expensive full spectrogram.
        reference = maximum_filter1d(compressed, size=3, axis=1, mode="nearest")
        history = np.vstack((reference[:1] if previous is None else previous, reference[:-1]))
        difference = np.maximum(compressed - history, 0.0)
        previous = reference[-1:].copy()
        for column, indices in enumerate(bands):
            flux[first:last, column] = difference[:, indices].mean(axis=1)
            band_power[first:last, column] = np.square(magnitude[:, indices]).sum(axis=1)
        if previous is not None and first == 0:
            flux[0] = 0.0
        _report(progress, 38 + int(36 * last / count), "计算局部频谱变化")
    return flux, band_power, boundaries


def _refine_onset(audio, sample_rate, frame_time, n_fft):
    radius = n_fft / sample_rate * 0.7
    start = max(0, int((frame_time - radius) * sample_rate))
    stop = min(audio.size, int((frame_time + radius) * sample_rate) + 1)
    segment = _samples(audio, start, stop).astype(np.float64)
    if segment.size < 5:
        return None
    smooth = max(3, int(round(sample_rate * 0.002)))
    envelope = np.sqrt(np.maximum(uniform_filter1d(segment * segment, smooth, mode="nearest"), 0))
    lag = max(1, int(round(sample_rate * 0.001)))
    rise = envelope[2 * lag:] - envelope[:-2 * lag]
    if not rise.size:
        return None
    attack = int(np.argmax(rise)) + lag
    peak = float(np.max(envelope[attack:min(envelope.size, attack + int(sample_rate * 0.012) + 1)]))
    before = envelope[:max(1, min(attack - lag, int(sample_rate * 0.008)))]
    floor = float(np.median(before))
    # Reject stationary noise/tones even if their spectral statistics fluctuate.
    if peak <= max(_SILENCE_RMS, floor * 1.28) or peak - floor <= _SILENCE_RMS:
        return None
    threshold = floor + 0.12 * (peak - floor)
    left = max(0, attack - int(sample_rate * 0.018))
    below = np.flatnonzero(envelope[left:attack + 1] <= threshold)
    onset = left + int(below[-1]) + 1 if below.size else left
    sample = start + onset
    # A carrier's individual crests are not attacks. Compare enough original
    # samples to average several tone cycles and reject constant noisy energy.
    pre = _samples(audio, max(0, sample - int(0.028 * sample_rate)),
                   max(0, sample - int(0.003 * sample_rate))).astype(np.float64)
    post = _samples(audio, sample, min(audio.size, sample + int(0.025 * sample_rate))).astype(np.float64)
    if not pre.size or not post.size:
        return None
    pre_power = float(np.mean(pre * pre))
    post_power = float(np.mean(post * post))
    if post_power <= max(_SILENCE_RMS ** 2, pre_power * 1.8):
        return None
    return sample / sample_rate


def _loudness_db(audio, sample_rate, time):
    # Fixed 50 ms window: 10 ms before and 40 ms after the refined attack.
    start = max(0, int(round((time - 0.010) * sample_rate)))
    stop = min(audio.size, int(round((time + 0.040) * sample_rate)))
    segment = _samples(audio, start, max(start + 1, stop)).astype(np.float64)
    rms = math.sqrt(float(np.mean(segment * segment))) if segment.size else 0.0
    return max(-120.0, 20.0 * math.log10(max(rms, _SILENCE_RMS)))


def _tempo(times, cancel):
    """Fit a supported grid; occupancy penalizes double-tempo empty slots."""
    empty = {"bpm": 0, "period": 0.0, "phase": 0.0, "confidence": 0.0,
             "coverage": 0.0, "mask": np.zeros(len(times), dtype=bool)}
    if len(times) < 3 or times[-1] - times[0] < 0.5:
        return empty
    times = np.asarray(times, dtype=np.float64)
    best = None
    bins = 96
    for bpm in range(60, 201):
        if bpm % 20 == 0:
            _check_cancel(cancel)
        period = 60.0 / bpm
        tolerance = min(0.045, period * 0.075)
        phases = np.mod(times, period)
        histogram = np.bincount(np.minimum((phases / period * bins).astype(int), bins - 1), minlength=bins)
        radius = max(1, int(round(tolerance / period * bins)))
        circular = np.concatenate((histogram[-radius:], histogram, histogram[:radius]))
        counts = np.convolve(circular, np.ones(2 * radius + 1), mode="valid")
        # Break a flat maximum toward actual phase mass, not its left edge.
        phase = (int(np.argmax(counts + histogram * 0.001)) + 0.5) * period / bins
        residual = np.mod(times - phase + period / 2, period) - period / 2
        rough = np.abs(residual) <= tolerance
        if rough.sum() < 3:
            continue
        phase += float(np.median(residual[rough]))
        residual = np.mod(times - phase + period / 2, period) - period / 2
        mask = np.abs(residual) <= tolerance
        slots = np.rint((times[mask] - phase) / period).astype(np.int64)
        occupancy = len(np.unique(slots)) / max(1, int(slots[-1] - slots[0] + 1))
        coverage = float(mask.mean())
        error = float(np.median(np.abs(residual[mask]))) / tolerance
        score = coverage * (0.6 + 0.4 * occupancy) * (1.0 - 0.25 * error)
        if best is None or score > best[0]:
            best = (score, period, phase, mask, occupancy, coverage, error)
    if best is None:
        return empty
    score, period, phase, mask, occupancy, coverage, error = best
    inliers = times[mask]
    slot_steps = np.rint(np.diff(inliers) / period)
    valid = (slot_steps > 0) & (slot_steps <= 8)
    if valid.any():
        refined = float(np.median(np.diff(inliers)[valid] / slot_steps[valid]))
        if 0.98 * period <= refined <= 1.02 * period:
            period = refined
    confidence = coverage * occupancy * max(0.0, 1.0 - error)
    if coverage < 0.55 or confidence < 0.4:
        return empty
    # Preserve the fitted grid's phase after the small timing refinement.
    phase = float(np.median(inliers - np.rint((inliers - phase) / period) * period))
    residual = np.mod(times - phase + period / 2, period) - period / 2
    mask = np.abs(residual) <= min(0.045, period * 0.075)
    return {"bpm": int(round(60.0 / period)), "period": period, "phase": phase,
            "confidence": float(confidence), "coverage": float(mask.mean()), "mask": mask}


def detect_beats(signal: np.ndarray, sample_rate: int, duration: float, *,
                 sensitivity: int = 50, min_interval: float = 0.18,
                 low_hz: float = 40, high_hz: float = 3000,
                 mode: str = "onsets", cancel=None, progress=None) -> dict:
    """Detect attacks in normalized mono PCM, with optional rhythm filtering.

    ``cancel`` accepts a threading.Event-like object (``is_set``) or a predicate;
    cancellation raises ``RuntimeError('Cancelled')``. ``progress(percent, text)``
    uses the backend's existing 38..92 analysis range. ``rhythm`` only removes
    weaker off-grid observations when at least five attacks support a stable
    60..200 BPM grid; it never inserts a beat. Audio outside ``duration`` is not
    analyzed. Nonfinite samples are treated as silence without changing input.
    """
    _check_cancel(cancel)
    audio = np.asarray(signal)
    if audio.ndim != 1:
        raise ValueError("signal must be a one-dimensional mono PCM array")
    if isinstance(sample_rate, bool) or not isinstance(sample_rate, (int, np.integer)) or sample_rate <= 0:
        raise ValueError("sample_rate must be a positive integer")
    if not math.isfinite(duration) or duration < 0:
        raise ValueError("duration must be finite and nonnegative")
    if not math.isfinite(min_interval) or min_interval <= 0:
        raise ValueError("min_interval must be finite and positive")
    if not 1 <= sensitivity <= 100:
        raise ValueError("sensitivity must be between 1 and 100")
    if not (math.isfinite(low_hz) and math.isfinite(high_hz) and 0 <= low_hz < high_hz <= sample_rate / 2):
        raise ValueError("frequency band must satisfy 0 <= low_hz < high_hz <= Nyquist")
    if mode not in ("onsets", "rhythm"):
        raise ValueError("mode must be 'onsets' or 'rhythm'")
    audio = audio[:min(audio.size, int(math.ceil(duration * sample_rate)))]
    n_fft = max(128, 2 ** int(round(math.log2(sample_rate * 0.046))))
    hop = max(1, n_fft // 8)
    metadata = {"algorithm": "adaptive-multiband-log-flux-v1", "mode": mode,
                "sampleRate": int(sample_rate), "fftSize": n_fft, "hopSize": hop,
                "frameSeconds": hop / sample_rate, "batchFrames": _BATCH_FRAMES,
                "sensitivity": sensitivity, "minInterval": min_interval,
                "lowHz": low_hz, "highHz": high_hz,
                "loudnessUnit": "dBFS", "loudnessMeasure": "original-sample RMS",
                "loudnessWindowMs": 50, "loudnessPreOnsetMs": 10,
                "tempoConfidence": 0.0, "rhythmFiltered": 0,
                "candidateCount": 0, "detectedCount": 0,
                "analyzedSeconds": audio.size / sample_rate}
    if audio.size < max(8, hop) or duration == 0:
        _report(progress, 92, "整理节拍")
        return {"beats": [], "bpm": 0, "analysis": metadata}
    _report(progress, 38, "计算局部频谱变化")
    flux, power, boundaries = _features(audio, sample_rate, n_fft, hop, low_hz, high_hz, cancel, progress)
    _check_cancel(cancel)
    local_window = max(5, int(round(0.55 * sample_rate / hop)) | 1)
    baseline = median_filter(flux, size=(local_window, 1), mode="nearest")
    _check_cancel(cancel)
    deviation = median_filter(np.abs(flux - baseline), size=(local_window, 1), mode="nearest")
    _check_cancel(cancel)
    # The absolute floor is in log-spectrum units, never a fraction of the
    # recording's largest peak. This is essential for quiet/loud alternation.
    noise = np.maximum(1.4826 * deviation, 0.008)
    significance = np.maximum((flux - baseline) / noise, 0.0)
    # Inactive bands cannot amplify numeric residue in very quiet recordings.
    significance[power < 2e-12] = 0.0
    threshold = 5.2 - 0.033 * sensitivity
    score = np.maximum(significance - threshold, 0.0).mean(axis=1)
    score = uniform_filter1d(score, size=3, mode="nearest")
    peaks, _ = find_peaks(score, height=0.35, prominence=0.20)
    metadata.update({"bandEdgesHz": boundaries, "localWindowSeconds": local_window * hop / sample_rate,
                     "candidateCount": int(peaks.size)})
    _report(progress, 79, "校准瞬态时间与分贝")
    candidates = []
    for index, peak in enumerate(peaks):
        if index % 128 == 0:
            _check_cancel(cancel)
        frame_time = float(peak * hop / sample_rate)
        # Ignore the artificial attack caused by an already-running signal at
        # the left file boundary; no preceding samples establish a real onset.
        if frame_time < n_fft / (2 * sample_rate):
            continue
        refined = _refine_onset(audio, sample_rate, frame_time, n_fft)
        if refined is not None and 0 <= refined <= min(duration, audio.size / sample_rate):
            candidates.append((round(refined, 6), float(score[peak])))
    candidates.sort()
    # Strongest-first nonmaximum suppression, followed by chronological output.
    # Refractory spacing is checked on refined sample times, not frame indices.
    selected_times, selected = [], []
    for time, salience in sorted(candidates, key=lambda item: (-item[1], item[0])):
        position = bisect_left(selected_times, time)
        if ((position and time - selected_times[position - 1] < min_interval - 1e-9) or
                (position < len(selected_times) and selected_times[position] - time < min_interval - 1e-9)):
            continue
        selected_times.insert(position, time)
        selected.insert(position, (time, salience))
    tempo = _tempo(selected_times, cancel)
    if mode == "rhythm" and len(selected) >= 5 and tempo["confidence"] >= 0.60 and tempo["coverage"] >= 0.70:
        mask = tempo["mask"]
        if mask.sum() >= 5 and selected_times[-1] - selected_times[0] >= 4 * tempo["period"]:
            typical = float(np.median([salience for (_, salience), on_grid in zip(selected, mask) if on_grid]))
            retained = [item for item, on_grid in zip(selected, mask) if on_grid or item[1] > typical * 1.15]
            metadata["rhythmFiltered"] = len(selected) - len(retained)
            selected = retained
    _check_cancel(cancel)
    scale = max(float(np.percentile([math.log1p(s) for _, s in selected], 95)), 1e-12) if selected else 1.0
    beats = []
    for index, (time, salience) in enumerate(selected):
        if index % 128 == 0:
            _check_cancel(cancel)
        beats.append({"time": time, "strength": round(min(1.0, math.log1p(salience) / scale), 4),
                      "loudnessDb": round(_loudness_db(audio, sample_rate, time), 3)})
    metadata["tempoConfidence"] = round(tempo["confidence"], 4)
    metadata["detectedCount"] = len(beats)
    _report(progress, 92, "整理节拍")
    return {"beats": beats, "bpm": tempo["bpm"], "analysis": metadata}
