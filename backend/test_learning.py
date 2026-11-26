from __future__ import annotations

import ast
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from backend.detection import detect_beats
from backend.main import AnalyzeRequest, ExportRequest, app
from backend.projects import ProjectStore, validate_project

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


class LearningDocumentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.catalog = json.loads((DOCS / "catalog.json").read_text("utf-8"))
        cls.examples = json.loads((DOCS / "examples/catalog.json").read_text("utf-8"))

    def test_all_chapters_are_served_from_the_canonical_markdown(self):
        self.assertEqual(len(self.catalog["documents"]), 11)
        for entry in self.catalog["documents"]:
            with self.subTest(document=entry["id"]):
                response = self.client.get("/learning/" + entry["file"])
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, (DOCS / entry["file"]).read_bytes())
                self.assertTrue(response.text.startswith("# "))
        self.assertEqual(self.client.get("/help.html").status_code, 200)
        self.assertIn('id="learningLink"', self.client.get("/").text)
        self.assertEqual(self.client.get("/learning/missing.md").status_code, 404)
        self.assertEqual(self.client.get("/learning/%2E%2E/backend/main.py").status_code, 404)

    def test_swagger_and_fourteen_business_routes_remain_available(self):
        self.assertEqual(self.client.get("/docs").status_code, 200)
        schema = self.client.get("/openapi.json").json()
        operations = [(method, route) for route, methods in schema["paths"].items() if route.startswith("/api/") for method in methods if method in {"get", "post", "put", "patch", "delete"}]
        self.assertEqual(len(operations), 14)
        self.assertEqual(AnalyzeRequest(mediaId="example").sensitivity, 50)
        self.assertEqual(ExportRequest(mediaId="example").mode, "green")
        self.assertEqual(ExportRequest(mediaId="example").width, 1280)

    def test_downloads_and_audio_range_match_the_files(self):
        names = [self.examples["audio"], "beatbar-120.beats.json", "beatbar-120.funscript"] + [entry["file"] for entry in self.examples["examples"]]
        for name in names:
            with self.subTest(asset=name):
                response = self.client.get("/learning/examples/" + name)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, (DOCS / "examples" / name).read_bytes())
        partial = self.client.get("/learning/examples/beatbar-120.wav", headers={"Range": "bytes=0-43"})
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(len(partial.content), 44)
        self.assertTrue(partial.content.startswith(b"RIFF"))

    def test_projects_are_valid_roundtrip_without_media_and_keep_their_visuals(self):
        with tempfile.TemporaryDirectory(prefix="beatbar-learning-") as folder:
            store = ProjectStore(lambda: Path(folder))
            for entry in self.examples["examples"]:
                with self.subTest(example=entry["id"]):
                    project = json.loads((DOCS / "examples" / entry["file"]).read_text("utf-8"))
                    validate_project(project)
                    self.assertIsNone(project["media"])
                    self.assertEqual(len(project["beats"]), entry["beatCount"])
                    self.assertEqual(project["bpm"], entry["bpm"])
                    self.assertEqual(project["beats"][0]["time"], 0.25)
                    self.assertLessEqual(project["beats"][-1]["time"], 7.75)
                    request = ExportRequest(mediaId="example", beats=project["beats"], style=project["style"], mode=project["exportSettings"]["mode"], width=640, height=360, fps=24)
                    self.assertEqual(request.style.trackType, project["style"]["trackType"])
                    saved = store.create({"name": entry["title"], "project": project})
                    self.assertEqual(store.get(saved["id"])["project"], project)

    def test_synthetic_audio_matches_the_taught_120_bpm_grid(self):
        content = (DOCS / "examples/beatbar-120.wav").read_bytes()
        with wave.open(io.BytesIO(content), "rb") as audio:
            self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), (1, 2, 22050))
            self.assertEqual(audio.getnframes(), 8 * 22050)
            signal = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
        result = detect_beats(signal, 22050, 8, sensitivity=55, min_interval=0.20)
        standard = json.loads((DOCS / "examples/beatbar-120.beats.json").read_text("utf-8"))["beats"]
        self.assertEqual(len(standard), 16)
        self.assertEqual(len(result["beats"]), 16)
        self.assertEqual(result["bpm"], 120)
        for actual, expected in zip(result["beats"], standard):
            self.assertAlmostEqual(actual["time"], expected["time"], delta=0.025)
        self.assertGreater(np.max(np.abs(signal)), 0.5)

    def test_python_api_tutorial_compiles_and_uses_the_installed_client(self):
        import httpx2
        self.assertTrue(callable(httpx2.Client))
        article = (DOCS / "api.md").read_text("utf-8")
        snippet = article.split("```python\n", 1)[1].split("```", 1)[0]
        tree = ast.parse(snippet, filename="docs/api.md example")
        compile(tree, "docs/api.md example", "exec")
        self.assertIn("import httpx2 as httpx", snippet)


if __name__ == "__main__":
    unittest.main()
