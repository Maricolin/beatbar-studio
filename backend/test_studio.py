"""Independent regressions for the studio timeline/detection/export upgrade.

Reuses the existing synthetic media fixture without inheriting its test methods.
Run: python -m unittest backend.test_studio -v
"""
from __future__ import annotations

import base64
import io
import math
import sys
import unittest
import uuid
from urllib.parse import quote, unquote

import numpy as np
from PIL import Image, ImageDraw
from pydantic import ValidationError

# unittest discovery imports this fixture as `test_backend`, while explicit
# module runs use `backend.test_backend`. Reuse either to avoid resetting its
# temporary BEATBAR_DATA_DIR after backend.main has already captured DATA_ROOT.
if "test_backend" in sys.modules:
    fixtures = sys.modules["test_backend"]
else:
    from backend import test_backend as fixtures

main = fixtures.backend_main


def marker_data():
    """A translucent 4:1 marker with a completely transparent centre."""
    image = Image.new("RGBA", (40, 10), (255, 0, 0, 128))
    ImageDraw.Draw(image).rectangle((10, 0, 29, 9), fill=(0, 0, 0, 0))
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode("ascii")


class StudioModelAndRenderTests(unittest.TestCase):
    def test_beat_loudness_is_optional_bounded_and_finite(self):
        self.assertIsNone(main.Beat(time=1, strength=.5).loudnessDb)
        for value in (-120, -48.5, 0, 6):
            with self.subTest(value=value):
                beat = main.Beat(time=1, strength=.5, loudnessDb=value)
                self.assertEqual(beat.model_dump()["loudnessDb"], value)
        for value in (-121, 6.1, float("nan"), float("inf")):
            with self.subTest(invalid=value), self.assertRaises(ValidationError):
                main.Beat(time=1, strength=.5, loudnessDb=value)

    def test_studio_style_validation(self):
        style = main.Style(trackType="converge", pattern="bar", colorMode="loudness",
                           dbFloor=-48, dbCeiling=-6, markerPattern="custom",
                           markerImage=marker_data(), markerScale=1.5)
        self.assertEqual(style.trackType, "converge")
        self.assertEqual(style.markerScale, 1.5)
        for invalid in ({"trackType": "unknown"}, {"pattern": "unknown"},
                        {"markerPattern": "unknown"}, {"markerPattern": "custom"},
                        {"dbFloor": -6, "dbCeiling": -12},
                        {"dbFloor": -6, "dbCeiling": -6},
                        {"markerScale": .49}, {"markerScale": 2.01}):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                main.Style(**invalid)

    def test_loudness_colour_increases_with_db_and_clamps(self):
        style = main.Style(colorMode="loudness", color="#f0a050", dbFloor=-48, dbCeiling=-6)
        levels = (-90, -48, -36, -24, -12, -6, 6)
        colours = [main._beat_color(style, 0, .5, db=db) for db in levels]
        self.assertEqual(colours[0], colours[1])
        self.assertEqual(colours[-2], colours[-1])
        self.assertEqual(colours[-1], (240, 160, 80))
        for before, after in zip(colours, colours[1:]):
            self.assertTrue(all(a <= b for a, b in zip(before, after)), colours)
        self.assertGreater(sum(colours[-1]), sum(colours[0]) * 2)
        # Explicit measured dB is independent of normalized display strength.
        self.assertEqual(main._beat_color(style, 0, .1, db=-24),
                         main._beat_color(style, 0, .9, db=-24))
        fallback = [sum(main._beat_color(style, 0, strength)) for strength in (.01, .1, 1)]
        self.assertEqual(sorted(fallback), fallback)

    def test_converging_bar_beats_move_symmetrically_to_centre(self):
        style = main.Style(trackType="converge", motion="right-left", pattern="bar",
                           barWidth=.8, barHeight=40, barColor="#000000", color="#ff0000",
                           hitEffect="none", position=.5, speed=2, marker=.05)
        beats = [main.Beat(time=1, strength=1, loudnessDb=-6)]

        def red_columns(t):
            pixels = np.asarray(main._render_overlay(400, 240, beats, t, style))
            mask = (pixels[:, :, 0] > 230) & (pixels[:, :, 1] < 30) & (pixels[:, :, 2] < 30)
            return np.flatnonzero(mask.sum(axis=0) >= 10)

        before = red_columns(0)
        closer = red_columns(.5)
        arrival = red_columns(1)
        self.assertGreater(len(before), 2)
        left, right = before[before < 200], before[before > 200]
        self.assertAlmostEqual(float(left.mean() + right.mean()), 400, delta=2)
        self.assertGreater(float(closer[closer < 200].mean()), float(left.mean()))
        self.assertLess(float(closer[closer > 200].mean()), float(right.mean()))
        self.assertTrue(len(arrival), "bar beats must visibly arrive at the centre")
        self.assertLessEqual(int(np.abs(arrival - 200).max()), 4)
        # Converge overrides a custom marker position, without mutating its source style.
        image = main._render_overlay(400, 240, [], 0, style)
        self.assertEqual(image.getpixel((200, 95))[:3], (255, 255, 255))
        self.assertEqual(style.motion, "right-left")
        self.assertEqual(style.marker, .05)

    def test_custom_marker_keeps_aspect_transparency_and_scale(self):
        data = marker_data()
        loaded = main._load_pattern_image(data)
        self.assertEqual(loaded.size, (40, 10))
        self.assertEqual(loaded.getpixel((20, 5))[3], 0)
        self.assertEqual(loaded.getpixel((2, 5))[3], 128)
        boxes = []
        for scale in (.5, 1, 2):
            style = main.Style(markerPattern="custom", markerImage=data, markerScale=scale,
                               marker=.5, barHeight=40, barColor="#102030", hitEffect="none")
            rendered = main._render_overlay(400, 240, [], 0, style, marker_image=loaded)
            pixels = np.asarray(rendered)
            red = (pixels[:, :, 0] > 80) & (pixels[:, :, 0] > pixels[:, :, 1] * 3)
            ys, xs = np.where(red)
            self.assertTrue(xs.size)
            width, height = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
            self.assertAlmostEqual(width / height, 4, delta=.5)
            self.assertEqual(rendered.getpixel((200, 120)), (16, 32, 48, 255),
                             "transparent marker centre must reveal the existing track")
            self.assertLess(int(pixels[ys[len(ys)//2], xs[len(xs)//2], 0]), 230,
                            "semi-transparent image must not become opaque red")
            boxes.append((width, height))
        self.assertAlmostEqual(boxes[2][0] / boxes[0][0], 4, delta=.2)

    def test_builtin_marker_is_independent_of_beat_pattern(self):
        for marker in ("circle", "diamond", "star", "heart"):
            with self.subTest(marker=marker):
                style = main.Style(pattern="bar", markerPattern=marker, marker=.5,
                                   markerColor="#00ff00", barHeight=30, hitEffect="none")
                pixels = np.asarray(main._render_overlay(240, 160, [], 0, style))
                green = (pixels[:, :, 1] > 230) & (pixels[:, :, 0] < 20)
                self.assertGreater(int(green.sum()), 30)


class StudioApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.BeatBarIntegrationTests.setUpClass.__func__(cls)
        cls.route_storage_name = f"beatbar-{uuid.uuid4().hex}.mp4"
        cls.route_path = main.export_dir() / cls.route_storage_name
        cls.route_path.parent.mkdir(parents=True, exist_ok=True)
        cls.route_bytes = bytes(range(96))
        cls.route_path.write_bytes(cls.route_bytes)

    @classmethod
    def tearDownClass(cls):
        cls.route_path.unlink(missing_ok=True)
        cls.client.close()

    def wait_job(self, job_id):
        return fixtures.BeatBarIntegrationTests._wait_job(self, job_id)

    def test_analysis_returns_measured_loudness_and_metadata(self):
        response = self.client.post("/api/analyze", json={"mediaId": self.media["id"],
            "sensitivity": 60, "minInterval": .2, "lowHz": 40, "highHz": 3000, "mode": "onsets"})
        self.assertEqual(response.status_code, 202, response.text)
        job = self.wait_job(response.json()["id"])
        self.assertEqual(job["status"], "done", job)
        result = job["result"]
        self.assertGreaterEqual(len(result["beats"]), 5, result)
        for beat in result["beats"]:
            self.assertIn("loudnessDb", beat)
            self.assertTrue(math.isfinite(beat["loudnessDb"]))
            self.assertGreaterEqual(beat["loudnessDb"], -120)
            self.assertLessEqual(beat["loudnessDb"], 6)
        analysis = result["analysis"]
        self.assertEqual(analysis["loudnessUnit"], "dBFS")
        self.assertEqual(analysis["mode"], "onsets")
        self.assertIn("original", analysis["loudnessMeasure"])
        self.assertGreater(analysis["sampleRate"], 0)
        self.assertGreater(analysis["frameSeconds"], 0)
        self.assertEqual(analysis["detectedCount"], len(result["beats"]))

    def test_chinese_download_name_survives_full_and_range_responses(self):
        name = "节拍 合集 01.mp4"
        url = f"/api/exports/{self.route_storage_name}?downloadName={quote(name)}"
        for headers, status, expected in (({}, 200, self.route_bytes),
                                          ({"Range": "bytes=8-15"}, 206, self.route_bytes[8:16])):
            with self.subTest(range=headers):
                response = self.client.get(url, headers=headers)
                self.assertEqual(response.status_code, status, response.text)
                self.assertEqual(response.content, expected)
                disposition = response.headers["content-disposition"]
                self.assertIn("filename*=", disposition)
                encoded = disposition.split("filename*=", 1)[1].split(";", 1)[0]
                self.assertTrue(encoded.lower().startswith("utf-8''"), disposition)
                self.assertEqual(unquote(encoded[7:]), name)
                self.assertEqual(response.headers["content-type"], "video/mp4")

    def test_export_named_outputs_keep_uuid_storage_and_matching_extension(self):
        for mode, suffix, requested_name in (("green", ".mp4", "鼓点 合集.mp4"), ("transparent", ".webm", "鼓点 合集.mp4"), ("green", ".mp4", "x" * 120)):
            with self.subTest(mode=mode, requested_name=requested_name):
                body = {"mediaId": self.media["id"], "mode": mode, "filename": requested_name,
                        "width": 160, "height": 90, "fps": 4, "includeAudio": False,
                        "beats": [{"time": .25, "strength": .8, "loudnessDb": -18}],
                        "style": {"trackType": "converge", "pattern": "bar", "colorMode": "loudness",
                                  "markerPattern": "custom", "markerImage": marker_data(), "hitEffect": "none"}}
                response = self.client.post("/api/export", json=body)
                self.assertEqual(response.status_code, 202, response.text)
                job = self.wait_job(response.json()["id"])
                self.assertEqual(job["status"], "done", job)
                result = job["result"]
                self.assertEqual(result["filename"], requested_name.removesuffix(".mp4")[:120-len(suffix)] + suffix)
                self.assertRegex(result["storageFilename"], r"^beatbar-[0-9a-f]{32}" + suffix.replace(".", r"\.") + r"$")
                self.assertTrue((main.export_dir() / result["storageFilename"]).is_file())
                self.assertFalse((main.export_dir() / result["filename"]).exists())
                download = self.client.get(result["url"])
                self.assertEqual(download.status_code, 200, download.text)
                self.assertGreater(len(download.content), 100)
                if suffix == ".webm":
                    self.assertEqual(download.content[:4], b"\x1aE\xdf\xa3")
                else:
                    self.assertEqual(download.content[4:8], b"ftyp")
                disposition = download.headers["content-disposition"]
                self.assertIn(quote(result["filename"]), disposition)

    def test_export_rejects_paths_reserved_names_and_invalid_marker_before_job(self):
        for name in ("../escape.mp4", "a/b.mp4", r"C:\temp\x.mp4", "NUL.mp4",
                     "bad\r\nname.mp4", "name.", "   ", "x" * 121):
            with self.subTest(filename=name):
                response = self.client.post("/api/export", json={"mediaId": self.media["id"],
                    "filename": name, "width": 160, "height": 90, "fps": 4})
                self.assertEqual(response.status_code, 422, response.text)
        response = self.client.post("/api/export", json={"mediaId": self.media["id"],
            "width": 160, "height": 90, "fps": 4,
            "style": {"markerPattern": "custom", "markerImage": "data:image/png;base64,bm90LWFuLWltYWdl"}})
        self.assertEqual(response.status_code, 422, response.text)

    def test_download_rejects_paths_or_incorrect_format_names(self):
        for name in ("../escape.mp4", r"C:\escape.mp4", "bad\nname.mp4", "NUL.mp4", "clip.webm", "clip.exe", "x" * 121 + ".mp4"):
            with self.subTest(downloadName=name):
                response = self.client.get(f"/api/exports/{self.route_storage_name}", params={"downloadName": name})
                self.assertEqual(response.status_code, 422, response.text)
        for filename in ("not-a-uuid.mp4", "beatbar-" + "a" * 31 + ".mp4", "beatbar-" + "a" * 32 + ".exe"):
            response = self.client.get("/api/exports/" + filename)
            self.assertEqual(response.status_code, 404, response.text)


if __name__ == "__main__":
    unittest.main()
