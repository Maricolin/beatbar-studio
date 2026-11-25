"""Deterministic numerical regression tests; no FFmpeg, media files or network."""
from __future__ import annotations

import math
import threading
import unittest
from unittest.mock import patch

import numpy as np

from backend.detection import detect_beats


RATE = 22050


def click_track(times, *, amplitudes=None, duration=None, frequency=1000.0,
                length=0.035, noise=0.0):
    if duration is None:
        duration = max(times, default=0) + 0.6
    audio = np.random.default_rng(154).normal(0, noise, int(duration * RATE)).astype(np.float32)
    amplitudes = amplitudes if amplitudes is not None else [0.65] * len(times)
    for time, amplitude in zip(times, amplitudes):
        start = int(round(time * RATE))
        elapsed = np.arange(int(length * RATE)) / RATE
        click = amplitude * (1 - elapsed / length) * np.sin(2 * np.pi * frequency * elapsed)
        stop = min(audio.size, start + click.size)
        audio[start:stop] += click[:stop - start]
    return audio


class DetectionTests(unittest.TestCase):
    def detect(self, audio, **kwargs):
        return detect_beats(audio, RATE, audio.size / RATE, **kwargs)

    def assert_times(self, result, expected, tolerance=0.008):
        times = np.array([beat["time"] for beat in result["beats"]])
        self.assertEqual(len(times), len(expected), result)
        np.testing.assert_allclose(times, expected, atol=tolerance, rtol=0)
        for beat in result["beats"]:
            self.assertTrue(0 <= beat["strength"] <= 1)
            self.assertTrue(math.isfinite(beat["loudnessDb"]))

    def test_alternating_quiet_loud_clicks(self):
        times = np.arange(0.25, 7.0, 0.5)
        amplitudes = [0.006 if index % 2 == 0 else 0.8 for index in range(len(times))]
        audio = click_track(times, amplitudes=amplitudes, noise=0.0001)
        self.assert_times(self.detect(audio), times)

    def test_quiet_passage_after_loud_section(self):
        times = np.arange(0.25, 8.0, 0.5)
        audio = click_track(times, amplitudes=[0.7] * 8 + [0.003] * 8, noise=0.00005)
        self.assert_times(self.detect(audio), times)

    def test_silence_and_constant_sines_rejected(self):
        elapsed = np.arange(4 * RATE) / RATE
        for frequency in (55, 110, 440, 1000, 2800):
            with self.subTest(frequency=frequency):
                audio = (0.4 * np.sin(2 * np.pi * frequency * elapsed)).astype(np.float32)
                self.assertEqual(self.detect(audio)["beats"], [])
        for audio in (np.zeros(4 * RATE, np.float32), np.full(4 * RATE, 0.3, np.float32)):
            result = self.detect(audio)
            self.assertEqual(result["beats"], [])
            self.assertEqual(result["bpm"], 0)

    def test_constant_noisy_tone_rejected(self):
        elapsed = np.arange(8 * RATE) / RATE
        audio = (0.25 * np.sin(2 * np.pi * 440 * elapsed) +
                 np.random.default_rng(78).normal(0, 0.004, elapsed.size)).astype(np.float32)
        self.assertEqual(self.detect(audio)["beats"], [])

    def test_timing_refinement_and_min_interval(self):
        times = [0.2531, 0.8003, 1.0427, 1.7809, 2.45]
        self.assert_times(self.detect(click_track(times), min_interval=0.20), times, 0.004)
        close_times = [0.25, 0.50, 0.58, 0.95, 1.45]
        result = self.detect(click_track(close_times, amplitudes=[0.6, 0.04, 0.8, 0.6, 0.6]), min_interval=0.20)
        self.assert_times(result, [0.25, 0.58, 0.95, 1.45], 0.006)
        self.assertTrue(all(b["time"] - a["time"] >= 0.20 for a, b in zip(result["beats"], result["beats"][1:])))

    def test_bpm_regular_trains(self):
        for bpm in (72, 90, 120, 160, 180):
            with self.subTest(bpm=bpm):
                times = np.arange(0.25, 10.0, 60 / bpm)
                result = self.detect(click_track(times))
                self.assert_times(result, times)
                self.assertLessEqual(abs(result["bpm"] - bpm), 1, result)
                self.assertGreater(result["analysis"]["tempoConfidence"], 0.85)

    def test_rhythm_removes_weaker_offgrid_without_filling_missing_beats(self):
        grid = np.arange(0.25, 9.0, 0.5)
        grid = np.delete(grid, 8)  # A missed/missing attack must stay missing.
        extras = [1.50, 3.52, 6.51]
        pairs = sorted([(time, 0.6) for time in grid] + [(time, 0.035) for time in extras])
        audio = click_track([p[0] for p in pairs], amplitudes=[p[1] for p in pairs])
        onsets = self.detect(audio, min_interval=0.18)
        rhythm = self.detect(audio, min_interval=0.18, mode="rhythm")
        self.assert_times(onsets, [p[0] for p in pairs])
        self.assert_times(rhythm, grid)
        self.assertEqual(rhythm["bpm"], 120)
        self.assertEqual(rhythm["analysis"]["rhythmFiltered"], len(extras))
        self.assertTrue(set(b["time"] for b in rhythm["beats"]).issubset(b["time"] for b in onsets["beats"]))

    def test_rhythm_leaves_irregular_observations(self):
        times = [0.25, 0.79, 1.54, 1.87, 2.63, 3.06, 3.92]
        audio = click_track(times)
        onset = self.detect(audio)
        rhythm = self.detect(audio, mode="rhythm")
        self.assertEqual(onset["beats"], rhythm["beats"])
        self.assertEqual(rhythm["analysis"]["rhythmFiltered"], 0)

    def test_original_sample_rms_dbfs_calibration(self):
        times = [0.25, 0.85, 1.45]
        audio = click_track(times, amplitudes=[0.1, 0.2, 0.4])
        result = self.detect(audio)
        self.assert_times(result, times)
        measured = [beat["loudnessDb"] for beat in result["beats"]]
        np.testing.assert_allclose(np.diff(measured), [20 * np.log10(2)] * 2, atol=0.04)
        for beat in result["beats"]:
            start = max(0, round((beat["time"] - 0.010) * RATE))
            stop = min(audio.size, round((beat["time"] + 0.040) * RATE))
            expected = 20 * np.log10(np.sqrt(np.mean(np.square(audio[start:stop].astype(np.float64)))))
            self.assertAlmostEqual(beat["loudnessDb"], expected, delta=0.001)
        # An unfiltered high-frequency component must contribute to original RMS.
        elapsed = np.arange(audio.size) / RATE
        original = audio + (0.015 * np.sin(2 * np.pi * 6000 * elapsed)).astype(np.float32)
        result_with_highs = self.detect(original)
        self.assertGreater(result_with_highs["beats"][0]["loudnessDb"], measured[0])

    def test_old_fixture_compatibility(self):
        # Reproduce backend/test_backend.py's int16 quantized 35 ms 1 kHz train.
        elapsed = np.arange(4 * RATE) / RATE
        offset = np.mod(elapsed - 0.25, 0.5)
        active = (elapsed >= 0.25) & (offset < 0.035)
        audio = np.zeros(elapsed.size, dtype=np.float32)
        audio[active] = np.trunc(22000 * (1 - offset[active] / 0.035) * np.sin(2 * np.pi * 1000 * offset[active])) / 32768
        result = self.detect(audio, sensitivity=60, min_interval=0.2)
        self.assert_times(result, np.arange(0.25, 4.0, 0.5))
        self.assertTrue(115 <= result["bpm"] <= 125)

    def test_batch_boundary_and_bounded_fft_working_set(self):
        times = np.arange(0.25, 40.0, 0.5)
        audio = click_track(times)
        import backend.detection as module
        real_rfft = module.rfft
        sizes = []
        def observed_rfft(frames, *args, **kwargs):
            sizes.append(frames.shape)
            return real_rfft(frames, *args, **kwargs)
        with patch.object(module, "rfft", side_effect=observed_rfft):
            result = self.detect(audio)
        self.assert_times(result, times)
        self.assertGreater(len(sizes), 3)
        self.assertTrue(all(shape[0] <= 512 for shape in sizes), sizes)

    def test_cancellation_initial_and_during_processing(self):
        event = threading.Event()
        event.set()
        with self.assertRaisesRegex(RuntimeError, "Cancelled"):
            self.detect(np.zeros(RATE, np.float32), cancel=event)
        event.clear()
        def progress(value, message):
            if value > 38:
                event.set()
        with self.assertRaisesRegex(RuntimeError, "Cancelled"):
            self.detect(np.zeros(10 * RATE, np.float32), cancel=event, progress=progress)
        with self.assertRaisesRegex(RuntimeError, "Cancelled"):
            self.detect(np.zeros(RATE, np.float32), cancel=lambda: True)

    def test_progress_nonfinite_input_and_duration(self):
        audio = click_track([0.25, 1.25], duration=2)
        audio[100:103] = [np.nan, np.inf, -np.inf]
        original = audio.copy()
        progress = []
        result = detect_beats(audio, RATE, 1.0, progress=lambda value, text: progress.append((value, text)))
        self.assert_times(result, [0.25])
        np.testing.assert_array_equal(audio, original)
        values = [value for value, _ in progress]
        self.assertEqual(values, sorted(values))
        self.assertEqual(values[-1], 92)
        self.assertTrue(all(isinstance(message, str) and message for _, message in progress))
        self.assertEqual(self.detect(np.zeros(0, np.float32))["beats"], [])

    def test_argument_validation(self):
        audio = np.zeros(RATE, np.float32)
        cases = [{"mode": "invalid"}, {"min_interval": 0}, {"sensitivity": 101},
                 {"low_hz": 3000, "high_hz": 40}, {"high_hz": RATE}]
        for kwargs in cases:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.detect(audio, **kwargs)


if __name__ == "__main__":
    unittest.main()
