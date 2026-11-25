from __future__ import annotations

import array
import base64
import io
import json
import os
import subprocess
import sys
import threading
import tempfile
import time
import unittest
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
os.environ["BEATBAR_DATA_DIR"] = tempfile.mkdtemp(prefix="beatbar-test-")
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from unittest.mock import patch
import backend.main as backend_main
from backend.main import FFMPEG, app


class BeatBarIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.temp = Path(tempfile.mkdtemp(prefix="beatbar-fixture-"))
        cls.audio_path = cls.temp / "节拍测试.wav"
        rate = 22050
        samples = array.array("h")
        # 120 BPM synthetic click track; beat transients begin at 0.25 s.
        for n in range(4 * rate):
            t = n / rate
            phase = t - 0.25
            offset = phase % 0.5
            if phase >= 0 and offset < 0.035:
                envelope = max(0.0, 1 - offset / 0.035)
                value = int(22000 * envelope * __import__("math").sin(2 * __import__("math").pi * 1000 * offset))
            else:
                value = 0
            samples.append(value)
        with wave.open(str(cls.audio_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(samples.tobytes())
        with cls.audio_path.open("rb") as f:
            response = cls.client.post("/api/media", files={"file": ("鼓点.wav", f, "audio/wav")})
        if response.status_code != 200:
            raise AssertionError(f"upload failed: {response.status_code} {response.text}")
        cls.media = response.json()

        # Full video fixture combines moving testsrc2 frames with the synthetic click WAV.
        cls.video_path = cls.temp / "video-with-clicks.mp4"
        command = [FFMPEG, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                   "testsrc2=size=160x90:rate=10:duration=4", "-i", str(cls.audio_path),
                   "-map", "0:v:0", "-map", "1:a:0", "-t", "4", "-r", "10",
                   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", str(cls.video_path)]
        subprocess.run(command, check=True, capture_output=True, timeout=30)
        with cls.video_path.open("rb") as f:
            response = cls.client.post("/api/media", files={"file": ("moving-clicks.mp4", f, "video/mp4")})
        if response.status_code != 200:
            raise AssertionError(f"video upload failed: {response.status_code} {response.text}")
        cls.video_media = response.json()

        cls.no_audio_path = cls.temp / "silent-video.mp4"
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                        "testsrc2=size=160x90:rate=10:duration=4", "-an", "-c:v", "libx264",
                        "-pix_fmt", "yuv420p", "-y", str(cls.no_audio_path)], check=True, capture_output=True, timeout=30)
        with cls.no_audio_path.open("rb") as f:
            response = cls.client.post("/api/media", files={"file": ("silent.mp4", f, "video/mp4")})
        if response.status_code != 200:
            raise AssertionError(f"silent video upload failed: {response.status_code} {response.text}")
        cls.silent_media = response.json()

    def _wait_job(self, job_id: str, timeout: int = 60):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            response = self.client.get(f"/api/jobs/{job_id}")
            self.assertEqual(response.status_code, 200, response.text)
            job = response.json()
            if job["status"] in {"done", "error"}:
                return job
            time.sleep(0.1)
        self.fail(f"job {job_id} did not finish")

    def test_health_metadata_and_range(self):
        self.assertEqual(self.client.get("/api/health").json(), {"status": "ok"})
        self.assertEqual(self.media["name"], "鼓点.wav")
        self.assertEqual(self.media["hasAudio"], True)
        self.assertEqual(len(self.media["waveform"]), 256)
        # Clear memory so this checks durable metadata reload, not just the cache.
        backend_main.MEDIA.pop(self.media["id"], None)
        metadata = self.client.get(f"/api/media/{self.media['id']}").json()
        self.assertEqual(metadata["waveform"], self.media["waveform"])
        ranged = self.client.get(self.media["url"], headers={"Range": "bytes=0-11"})
        self.assertEqual(ranged.status_code, 206)
        self.assertEqual(len(ranged.content), 12)
        self.assertEqual(ranged.headers["content-range"].split("/")[0], "bytes 0-11")
        self.assertEqual(ranged.headers["content-type"], "audio/wav")

    def test_analyze_synthetic_click_track(self):
        response = self.client.post("/api/analyze", json={"mediaId": self.media["id"], "sensitivity": 60, "minInterval": 0.2, "lowHz": 40, "highHz": 3000})
        self.assertEqual(response.status_code, 202, response.text)
        job = self._wait_job(response.json()["id"])
        self.assertEqual(job["status"], "done", job)
        result = job["result"]
        self.assertTrue(len(result["beats"]) >= 5, result)
        self.assertGreaterEqual(result["bpm"], 115, result)
        self.assertLessEqual(result["bpm"], 125, result)
        intervals = [result["beats"][i+1]["time"] - result["beats"][i]["time"] for i in range(len(result["beats"])-1)]
        self.assertTrue(any(0.45 <= d <= 0.55 for d in intervals), result)

    def test_all_export_modes_and_alpha_audio(self):
        for mode in ("green", "transparent", "composite"): 
            with self.subTest(mode=mode):
                body = {
                    "mediaId": self.video_media["id"],
                    "beats": [{"time": 0.25, "strength": 1}, {"time": 0.75, "strength": .6}, {"time": 1.25, "strength": .8}],
                    "style": {"color": "#ff3300", "barColor": "#222222", "position": .5, "barWidth": .7, "barHeight": 14, "speed": 2, "marker": .15},
                    "mode": mode,
                    "width": 160,
                    "height": 90,
                    "fps": 10,
                    "includeAudio": True,
                }
                response = self.client.post("/api/export", json=body)
                self.assertEqual(response.status_code, 202, response.text)
                job = self._wait_job(response.json()["id"])
                self.assertEqual(job["status"], "done", job)
                result = job["result"]
                filename = result["filename"]
                exported = self.client.get(result["url"])
                self.assertEqual(exported.status_code, 200, exported.text)
                self.assertGreater(len(exported.content), 100)
                path = Path(os.environ["BEATBAR_DATA_DIR"]) / "exports" / filename
                probe = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path), "-t", "0", "-f", "null", "-"], capture_output=True, timeout=15)
                probe_text = (probe.stderr or b"").decode("utf-8", "replace")
                self.assertIn("Input #0", probe_text)
                self.assertIn("Video:", probe_text)
                self.assertIn("Audio:", probe_text, f"includeAudio failed for {mode}: {probe_text}")
                self.assertIn("00:00:04", probe_text, probe_text)
                self.assertIn("10 fps", probe_text, probe_text)
                if mode == "composite":
                    def decode_frame(video_path):
                        return subprocess.run([FFMPEG, "-v", "error", "-i", str(video_path), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], capture_output=True, check=True, timeout=15).stdout
                    original_frame = decode_frame(self.video_path)
                    composite_frame = decode_frame(path)
                    # Compare several pixels outside the beat track to prove original footage is retained.
                    points = [(10, 10), (150, 10), (10, 80), (150, 80)]
                    differences = []
                    for px, py in points:
                        offset = (py * 160 + px) * 3
                        differences.append(sum(abs(original_frame[offset+c] - composite_frame[offset+c]) for c in range(3)))
                    self.assertLess(min(differences), 150, f"composite should preserve source pixels, diffs={differences}")
                if mode == "transparent":
                    alpha = subprocess.run([FFMPEG, "-v", "error", "-c:v", "libvpx-vp9", "-i", str(path), "-frames:v", "1", "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], capture_output=True, timeout=15, check=True)
                    self.assertEqual(len(alpha.stdout), 160 * 90)
                    self.assertLess(min(alpha.stdout), 16, "WebM alpha channel should retain transparent pixels")
                    self.assertGreater(max(alpha.stdout), 240, "track/marker pixels should remain opaque")

    def test_analyze_video_without_audio_returns_clear_error(self):
        response = self.client.post("/api/analyze", json={"mediaId": self.silent_media["id"], "sensitivity": 50, "minInterval": 0.18})
        self.assertEqual(response.status_code, 202, response.text)
        job = self._wait_job(response.json()["id"])
        self.assertEqual(job["status"], "error", job)
        self.assertIn("不包含音频", job["message"])

    def test_export_cancellation(self):
        started = threading.Event()
        def block_until_cancel(media, request, job, output, duration):
            started.set()
            while not job.cancel_event.wait(0.02):
                pass
            raise RuntimeError("Cancelled")
        request_body = {"mediaId": self.video_media["id"], "mode": "composite",
                        "width": 160, "height": 90, "fps": 10, "beats": []}
        with patch.object(backend_main, "_ffmpeg_export", side_effect=block_until_cancel):
            response = self.client.post("/api/export", json=request_body)
            self.assertEqual(response.status_code, 202, response.text)
            job_id = response.json()["id"]
            self.assertTrue(started.wait(5), "export worker did not start")
            cancelled = self.client.post(f"/api/jobs/{job_id}/cancel")
            self.assertEqual(cancelled.status_code, 200, cancelled.text)
            job = self._wait_job(job_id)
            self.assertEqual(job["status"], "error", job)
            self.assertIn("取消", job["message"])

    def test_validation_rejects_out_of_range_and_nonmonotonic_beats(self):
        bad = self.client.post("/api/export", json={"mediaId": self.media["id"], "mode": "surprise", "width": 160, "height": 90, "fps": 10})
        self.assertEqual(bad.status_code, 422)
        bad = self.client.post("/api/export", json={"mediaId": self.media["id"], "mode": "green", "width": 160, "height": 90, "fps": 10, "beats": [{"time": 1, "strength": 1}, {"time": .5, "strength": 1}]})
        self.assertEqual(bad.status_code, 422)


    def test_audio_only_export_with_custom_pattern_and_meet_motion(self):
        image_bytes = io.BytesIO()
        Image.new("RGBA", (16, 16), (40, 200, 255, 220)).save(image_bytes, format="PNG")
        pattern_data = "data:image/png;base64," + base64.b64encode(image_bytes.getvalue()).decode("ascii")
        body = {
            "mediaId": self.media["id"],
            "beats": [{"time": 0.25, "strength": 1}, {"time": 0.75, "strength": 0.8}],
            "style": {"pattern": "custom", "patternImage": pattern_data, "motion": "meet", "hitEffect": "ring", "color": "#40c8ff", "barColor": "#222222", "position": 0.5, "barWidth": 0.8, "barHeight": 18, "speed": 2, "marker": 0.15},
            "mode": "composite", "width": 160, "height": 90, "fps": 10, "includeAudio": True,
        }
        response = self.client.post("/api/export", json=body)
        self.assertEqual(response.status_code, 202, response.text)
        job = self._wait_job(response.json()["id"])
        self.assertEqual(job["status"], "done", job)
        output = self.client.get(job["result"]["url"])
        self.assertEqual(output.status_code, 200)
        path = Path(os.environ["BEATBAR_DATA_DIR"]) / "exports" / job["result"]["filename"]
        probe = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path), "-t", "0", "-f", "null", "-"], capture_output=True, timeout=15)
        probe_text = (probe.stderr or b"").decode("utf-8", "replace")
        self.assertIn("Video:", probe_text)
        self.assertIn("Audio:", probe_text)

    def test_audio_palette_background_and_silent_video_exports(self):
        cases = [(self.media, "composite", "heart", "flash"),
                 (self.media, "green", "hexagon", "burst"),
                 (self.media, "transparent", "star", "ring"),
                 (self.silent_media, "composite", "diamond", "burst")]
        for source, mode, pattern, effect in cases:
            with self.subTest(source=source["hasVideo"], mode=mode):
                body = {"mediaId": source["id"], "mode": mode, "width": 160, "height": 90,
                        "fps": 10, "includeAudio": True, "beats": [{"time": 0.5, "strength": 1}],
                        "style": {"pattern": pattern, "hitEffect": effect, "motion": "meet",
                                  "colorMode": "alternate", "backgroundColor": "#101a25",
                                  "color": "#67dce8", "secondaryColor": "#c4a0ff",
                                  "hitDuration": 0.7, "effectIntensity": 1.5, "beatScale": 1.2}}
                response = self.client.post("/api/export", json=body)
                self.assertEqual(response.status_code, 202, response.text)
                job = self._wait_job(response.json()["id"])
                self.assertEqual(job["status"], "done", job)
                path = Path(os.environ["BEATBAR_DATA_DIR"]) / "exports" / job["result"]["filename"]
                probe = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path), "-t", "0", "-f", "null", "-"], capture_output=True, timeout=15)
                text = probe.stderr.decode("utf-8", "replace")
                self.assertEqual("Audio:" in text, source["hasAudio"], text)
                if source is self.media and mode == "composite":
                    decoded = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], capture_output=True, check=True, timeout=15).stdout
                    self.assertLess(max(abs(actual-target) for actual, target in zip(decoded[:3], (16, 26, 37))), 12)

    def test_invalid_custom_image_is_rejected_before_job(self):
        response = self.client.post("/api/export", json={"mediaId": self.media["id"], "style": {"pattern": "custom", "patternImage": "data:image/png;base64,bm90LWFuLWltYWdl"}, "width": 160, "height": 90, "fps": 10})
        self.assertEqual(response.status_code, 422, response.text)

    def test_export_rejects_unknown_visual_style(self):
        response = self.client.post("/api/export", json={"mediaId": self.media["id"], "style": {"pattern": "made-up"}, "mode": "green", "width": 160, "height": 90, "fps": 10})
        self.assertEqual(response.status_code, 422, response.text)


class VisualRendererTests(unittest.TestCase):
    def render(self, time=0, **style):
        values = {"position": 0.5, "barWidth": 0.8, "barHeight": 30, "speed": 2,
                  "marker": 0.25, "color": "#ff0000", "secondaryColor": "#0000ff",
                  "barColor": "#222222", "hitEffect": "none", **style}
        return backend_main._render_overlay(400, 200, [backend_main.Beat(time=1, strength=1)], time, backend_main.Style(**values))

    def test_meet_has_symmetric_different_colors(self):
        frame = self.render(motion="meet", colorMode="alternate")
        self.assertEqual(frame.getpixel((125, 100)), (255, 0, 0, 255))
        self.assertEqual(frame.getpixel((275, 100)), (0, 0, 255, 255))
        self.assertEqual(frame.getpixel((200, 100)), (255, 255, 255, 255))
        arrived = self.render(time=1, motion="meet", colorMode="alternate")
        self.assertEqual(arrived.getpixel((125, 100)), (34, 34, 34, 255))
        self.assertEqual(arrived.getpixel((205, 100)), (0, 0, 255, 255))

    def test_left_motion_uses_marker_distance(self):
        frame = self.render(motion="left-right")
        self.assertEqual(frame.getpixel((80, 100)), (255, 0, 0, 255))
        self.assertEqual(frame.getpixel((120, 100)), (255, 255, 255, 255))

    def test_effect_extends_above_track_and_expires(self):
        for effect in ("ring", "flash", "burst"):
            with self.subTest(effect=effect):
                active = self.render(time=1.2, hitEffect=effect, hitDuration=0.8, effectIntensity=2)
                expired = self.render(time=1.9, hitEffect=effect, hitDuration=0.8, effectIntensity=2)
                self.assertIsNotNone(active.crop((124, 50, 160, 84)).getbbox())
                self.assertIsNone(expired.crop((124, 50, 160, 84)).getbbox())
                self.assertEqual(active.getpixel((45, 100))[3], 255, "effects must not erase the opaque track")

    def test_new_shapes_are_distinct_and_scale_changes_size(self):
        heart = self.render(pattern="heart")
        hexagon = self.render(pattern="hexagon")
        self.assertNotEqual(heart.tobytes(), hexagon.tobytes())
        small = self.render(beatScale=0.5)
        large = self.render(beatScale=1.5)
        red_pixels = lambda im: sum(pixel[:3] == (255, 0, 0) for pixel in im.getdata())
        self.assertGreater(red_pixels(large), red_pixels(small)*2)

    def test_style_validation(self):
        for value in ({"color": "oops"}, {"secondaryColor": "no"}, {"backgroundColor": "bad"},
                      {"colorMode": "rainbow"}, {"hitDuration": 0}, {"beatScale": 4},
                      {"effectIntensity": 3}, {"pattern": "custom"}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                backend_main.Style(**value)
        self.assertEqual(backend_main._beat_color(backend_main.Style(color="#ff0000", secondaryColor="#0000ff", colorMode="strength"), 0, 0.5), (128, 0, 128))

    def test_custom_stamp_keeps_aspect_and_alpha(self):
        style = backend_main.Style(pattern="custom", patternImage="unused", barHeight=40, position=0.5, marker=0.25, speed=2, barWidth=0.8, hitEffect="none")
        image = Image.new("RGBA", (40, 10), (20, 210, 80, 255))
        frame = backend_main._render_overlay(400, 200, [backend_main.Beat(time=1, strength=1)], 0, style, image)
        self.assertEqual(frame.getpixel((240, 100))[:3], (20, 210, 80))
        self.assertNotEqual(frame.getpixel((240, 108))[:3], (20, 210, 80))


if __name__ == "__main__":
    unittest.main(verbosity=2)
