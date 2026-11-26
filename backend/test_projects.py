"""Fast project-library persistence regressions; no media decoding/rendering fixtures.

Run: python -m unittest backend.test_projects -v
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

from fastapi.testclient import TestClient

from backend import main, projects


class ProjectLibraryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="beatbar-projects-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.root_patch = patch.object(main, "DATA_ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    @staticmethod
    def draft():
        return {"version": 1, "media": None, "beats": [], "style": {}, "bpm": 120,
                "editorSettings": {"zoom": 1, "currentTime": 0},
                "exportSettings": {"filename": "节拍", "resolution": "1280x720", "fps": 30}}

    def create(self, project=None, name="新草稿"):
        response = self.client.post("/api/projects", json={
            "name": name, "project": self.draft() if project is None else project})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def path(self, record):
        return self.root / "projects" / f"{record['id']}.json"

    def assert_chinese_error(self, response, status):
        self.assertEqual(response.status_code, status, response.text)
        detail = response.json()["detail"]
        self.assertIsInstance(detail, str)
        self.assertRegex(detail, r"[\u4e00-\u9fff]")

    def test_draft_crud_metadata_and_list_contract(self):
        self.assertEqual(self.client.get("/api/projects").json(), {"projects": []})
        record = self.create()
        self.assertEqual(set(record), {"id", "name", "createdAt", "updatedAt", "revision", "project"})
        self.assertRegex(record["id"], r"^[0-9a-f]{32}$")
        self.assertEqual(record["revision"], 1)
        self.assertEqual(record["createdAt"], record["updatedAt"])
        self.assertTrue(record["createdAt"].endswith("Z"))
        self.assertEqual(json.loads(self.path(record).read_text("utf-8")), record)
        self.assertEqual(self.client.get(f"/api/projects/{record['id']}").json(), record)
        summary = self.client.get("/api/projects").json()["projects"]
        self.assertEqual(summary, [{key: record[key] for key in (
            "id", "name", "createdAt", "updatedAt", "revision")} | {
            "mediaName": None, "beatCount": 0}])
        draft = self.draft()
        draft["beats"] = [{"time": 1.5, "strength": .8, "loudnessDb": -18}]
        response = self.client.put(f"/api/projects/{record['id']}", json={
            "name": "已修改", "project": draft, "revision": 1})
        self.assertEqual(response.status_code, 200, response.text)
        updated = response.json()
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(updated["createdAt"], record["createdAt"])
        self.assertGreater(updated["updatedAt"], record["updatedAt"])
        self.assertEqual(updated["project"], draft)
        response = self.client.delete(f"/api/projects/{record['id']}?revision=2")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"deleted": True})
        self.assertFalse(self.path(record).exists())
        self.assert_chinese_error(self.client.get(f"/api/projects/{record['id']}"), 404)
        self.assertEqual(self.client.get("/api/projects").json(), {"projects": []})

    def test_records_are_readable_by_a_new_backend_process(self):
        record = self.create()
        # Only load the project router in the child: this is a genuine fresh process,
        # with no inherited Python cache and no expensive media fixture setup.
        program = (
            "import json,sys; from pathlib import Path; from fastapi import FastAPI; "
            "from fastapi.testclient import TestClient; from backend.projects import create_router; "
            "app=FastAPI(); app.include_router(create_router(lambda:Path(sys.argv[1]))); "
            "client=TestClient(app); "
            "print(json.dumps([client.get('/api/projects').json(), "
            "client.get('/api/projects/'+sys.argv[2]).json()]))"
        )
        result = subprocess.run([sys.executable, "-c", program, str(self.root), record["id"]],
                                cwd=Path(__file__).resolve().parent.parent,
                                capture_output=True, text=True, timeout=20, check=True)
        listing, reopened = json.loads(result.stdout)
        self.assertEqual(reopened, record)
        self.assertEqual(listing["projects"][0]["id"], record["id"])

    def test_list_orders_by_update_and_reports_media_without_loading_it(self):
        first = self.create(name="先创建")
        document = self.draft()
        document["media"] = {"id": "a" * 32, "name": "失联素材.wav", "duration": 3}
        document["beats"] = [1, {"time": 2}]
        second = self.create(document, "后创建")
        self.assertEqual([row["id"] for row in self.client.get("/api/projects").json()["projects"]],
                         [second["id"], first["id"]])
        response = self.client.put(f"/api/projects/{first['id']}", json={
            "name": "刚更新", "project": first["project"], "revision": 1})
        self.assertEqual(response.status_code, 200, response.text)
        rows = self.client.get("/api/projects").json()["projects"]
        self.assertEqual([row["id"] for row in rows], [first["id"], second["id"]])
        self.assertEqual(rows[1]["mediaName"], "失联素材.wav")
        self.assertEqual(rows[1]["beatCount"], 2)

    def test_old_version_one_documents_and_extension_images_round_trip(self):
        legacy = {"version": 1, "beats": [0, .5, {"time": 1}],
                  "style": {"patternImage": "data:image/png;base64,aW1hZ2U=",
                            "markerImage": "data:image/webp;base64,aW1hZ2U=",
                            "futureStyle": {"amount": .2}},
                  "futureDocument": {"items": [True, None, "保留"]}}
        record = self.create(legacy)
        self.assertEqual(record["project"], legacy)
        reopened = self.client.get(f"/api/projects/{record['id']}").json()
        self.assertEqual(reopened["project"], legacy)
        self.assertNotIn("editorSettings", reopened["project"])
        self.assertNotIn("exportSettings", reopened["project"])
        legacy["editorSettings"] = {"futureEditor": [1, "新设置"]}
        response = self.client.put(f"/api/projects/{record['id']}", json={
            "name": record["name"], "project": legacy, "revision": 1})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["project"], legacy)

    def test_delete_project_does_not_remove_media(self):
        media = self.root / "media"
        media.mkdir()
        source = media / ("b" * 32 + ".wav")
        metadata = media / ("b" * 32 + ".json")
        source.write_bytes(b"original-media")
        metadata.write_text('{"name":"source.wav"}', "utf-8")
        document = self.draft()
        document["media"] = {"id": "b" * 32, "name": "source.wav", "duration": 1}
        record = self.create(document)
        response = self.client.delete(f"/api/projects/{record['id']}?revision=1")
        self.assertEqual(response.json(), {"deleted": True})
        self.assertEqual(source.read_bytes(), b"original-media")
        self.assertEqual(json.loads(metadata.read_text("utf-8")), {"name": "source.wav"})

    def test_revision_conflicts_and_required_revision_preserve_disk(self):
        record = self.create()
        url = f"/api/projects/{record['id']}"
        original = self.path(record).read_bytes()
        body = {"name": "冲突", "project": self.draft()}
        for revision in (None, 0, -1, True, "1", 1.5):
            with self.subTest(revision=revision):
                request = body | ({} if revision is None else {"revision": revision})
                self.assert_chinese_error(self.client.put(url, json=request), 422)
        for revision in (2, 999):
            self.assert_chinese_error(self.client.put(url, json=body | {"revision": revision}), 409)
            self.assert_chinese_error(self.client.delete(url + f"?revision={revision}"), 409)
        for suffix in ("", "?revision=", "?revision=0", "?revision=-1", "?revision=1.0", "?revision=true"):
            self.assert_chinese_error(self.client.delete(url + suffix), 422)
        self.assertEqual(self.path(record).read_bytes(), original)

    def test_simultaneous_saves_allow_only_one_revision(self):
        record = self.create()
        url = f"/api/projects/{record['id']}"
        def save(name):
            with TestClient(main.app) as client:
                return client.put(url, json={"name": name, "project": self.draft(), "revision": 1})
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(save, ["客户端甲", "客户端乙"]))
        self.assertEqual(sorted(response.status_code for response in responses), [200, 409])
        persisted = self.client.get(url).json()
        self.assertEqual(persisted["revision"], 2)
        self.assertIn(persisted["name"], ["客户端甲", "客户端乙"])

    def test_bad_documents_never_overwrite_existing_file(self):
        record = self.create()
        original = self.path(record).read_bytes()
        bad_projects = [None, [], {}, {"version": 2, "beats": []}, {"version": True, "beats": []},
                        {"version": 1, "beats": {}}, {"version": 1, "beats": [True]},
                        {"version": 1, "beats": [-.1]}, {"version": 1, "beats": ["1"]},
                        {"version": 1, "beats": [{"strength": .5}]},
                        {"version": 1, "beats": [{"time": 1, "strength": 2}]},
                        {"version": 1, "beats": [{"time": 1, "loudnessDb": -121}]}]
        for field, value in (("media", "x"), ("media", {}), ("media", {"id": "../outside", "name": "x", "duration": 1}),
                             ("media", {"id": "a" * 32, "name": "x", "duration": 0}),
                             ("media", {"id": "a" * 32, "name": 42, "duration": 1}),
                             ("editorSettings", []), ("exportSettings", None), ("style", "x"), ("bpm", "120")):
            bad_projects.append(self.draft() | {field: value})
        for document in bad_projects:
            with self.subTest(document=document):
                response = self.client.put(f"/api/projects/{record['id']}", json={
                    "name": "无效", "project": document, "revision": 1})
                self.assert_chinese_error(response, 422)
                self.assertEqual(self.path(record).read_bytes(), original)
        self.assertEqual(len(list(self.path(record).parent.iterdir())), 1)

    def test_invalid_names_and_json_are_rejected(self):
        for name in (None, 1, "", "   ", "x" * 201, "a\x00b"):
            with self.subTest(name=name):
                self.assert_chinese_error(self.client.post("/api/projects", json={
                    "name": name, "project": self.draft()}), 422)
        for raw in ("{", "[]", "null", '{"name":"x","project":'):
            self.assert_chinese_error(self.client.post("/api/projects", content=raw), 422)
        self.assertFalse((self.root / "projects").exists())

    def test_nonfinite_numbers_in_all_fields_are_rejected(self):
        documents = [self.draft() | {"beats": [float("inf")]},
                     self.draft() | {"beats": [{"time": 1, "strength": float("nan")}]},
                     self.draft() | {"beats": [{"time": 1, "loudnessDb": float("inf")}]},
                     self.draft() | {"future": {"nested": [float("-inf")]}},
                     self.draft() | {"editorSettings": {"zoom": float("nan")}},
                     self.draft() | {"media": {"id": "a" * 32, "name": "x", "duration": float("inf")}}]
        for document in documents:
            with self.subTest(document=document):
                raw = json.dumps({"name": "非有限数", "project": document})
                self.assert_chinese_error(self.client.post("/api/projects", content=raw), 422)
        self.assertFalse((self.root / "projects").exists())

    def test_beat_limit_accepts_boundary_and_rejects_excess(self):
        document = {"version": 1, "beats": [0] * 100_000}
        record = self.create(document)
        document["beats"].append(0)
        response = self.client.put(f"/api/projects/{record['id']}", json={
            "name": "过多拍点", "project": document, "revision": 1})
        self.assert_chinese_error(response, 422)
        self.assertEqual(self.client.get(f"/api/projects/{record['id']}").json(), record)

    def test_twenty_mb_limit_including_streamed_requests(self):
        raw = json.dumps({"name": "large", "project": self.draft() | {
            "extension": "x" * projects.MAX_PROJECT_BYTES}}).encode()
        self.assert_chinese_error(self.client.post("/api/projects", content=raw), 413)
        chunks = (raw[index:index + 1024 * 1024] for index in range(0, len(raw), 1024 * 1024))
        self.assert_chinese_error(self.client.post("/api/projects", content=chunks), 413)
        self.assertFalse((self.root / "projects").exists())

    def test_oversized_update_never_overwrites_existing_file(self):
        record = self.create()
        original = self.path(record).read_bytes()
        with patch.object(projects, "MAX_PROJECT_BYTES", 600):
            response = self.client.put(f"/api/projects/{record['id']}", json={
                "name": "large", "project": self.draft() | {"extension": "x" * 600}, "revision": 1})
        self.assert_chinese_error(response, 413)
        self.assertEqual(self.path(record).read_bytes(), original)

    def test_malicious_ids_cannot_read_modify_or_delete_other_paths(self):
        outside = self.root / "outside.json"
        outside.write_text("private", "utf-8")
        ids = ["../outside", "..\\outside", "/outside", "a" * 31, "A" * 32,
               "g" * 32, "a" * 32 + ".json", "C:\\outside", "a\x00b", "..%2foutside"]
        for project_id in ids:
            with self.subTest(project_id=project_id):
                url = "/api/projects/" + quote(project_id, safe="")
                self.assert_chinese_error(self.client.get(url), 422)
                self.assert_chinese_error(self.client.put(url, json={
                    "name": "不安全", "project": self.draft(), "revision": 1}), 422)
                self.assert_chinese_error(self.client.delete(url + "?revision=1"), 422)
        self.assertEqual(outside.read_text("utf-8"), "private")
        self.assertFalse((self.root / "projects").exists())

    def test_missing_record_returns_clear_error_for_all_operations(self):
        url = "/api/projects/" + "a" * 32
        self.assert_chinese_error(self.client.get(url), 404)
        self.assert_chinese_error(self.client.put(url, json={
            "name": "不存在", "project": self.draft(), "revision": 1}), 404)
        self.assert_chinese_error(self.client.delete(url + "?revision=1"), 404)

    def test_corrupt_files_are_skipped_in_list_but_fail_when_opened(self):
        good = self.create()
        directory = self.path(good).parent
        bad_ids = [format(index, "032x") for index in range(1, 6)]
        invalid_records = [b"{", b"\xff", b"[]", json.dumps(good | {"id": bad_ids[3], "revision": 0}).encode(),
                           json.dumps(good | {"id": bad_ids[4], "project": {"version": 9, "beats": []}}).encode()]
        for bad_id, raw in zip(bad_ids, invalid_records):
            (directory / f"{bad_id}.json").write_bytes(raw)
        (directory / "ignored.json").write_text("invalid filename", "utf-8")
        (directory / ("f" * 32 + ".tmp")).write_text("interrupted write", "utf-8")
        self.assertEqual([row["id"] for row in self.client.get("/api/projects").json()["projects"]], [good["id"]])
        for bad_id in bad_ids:
            response = self.client.get(f"/api/projects/{bad_id}")
            self.assert_chinese_error(response, 500)
            self.assertIn("损坏", response.json()["detail"])
        bad_path = directory / f"{bad_ids[0]}.json"
        self.assert_chinese_error(self.client.put(f"/api/projects/{bad_ids[0]}", json={
            "name": "不能覆盖损坏项目", "project": self.draft(), "revision": 1}), 500)
        self.assertEqual(bad_path.read_bytes(), b"{")

    def test_failed_atomic_replace_preserves_original_and_cleans_temporary(self):
        record = self.create()
        original = self.path(record).read_bytes()
        with patch.object(projects.os, "replace", side_effect=OSError("disk replace failed")):
            response = self.client.put(f"/api/projects/{record['id']}", json={
                "name": "写失败", "project": self.draft(), "revision": 1})
        self.assert_chinese_error(response, 500)
        self.assertIn("保存", response.json()["detail"])
        self.assertEqual(self.path(record).read_bytes(), original)
        self.assertEqual(list(self.path(record).parent.iterdir()), [self.path(record)])
        self.assertEqual(self.client.get(f"/api/projects/{record['id']}").json(), record)

    def test_failed_fsync_does_not_replace_original(self):
        record = self.create()
        original = self.path(record).read_bytes()
        with patch.object(projects.os, "fsync", side_effect=OSError("disk flush failed")), \
                patch.object(projects.os, "replace") as replace:
            response = self.client.put(f"/api/projects/{record['id']}", json={
                "name": "同步失败", "project": self.draft(), "revision": 1})
        self.assert_chinese_error(response, 500)
        replace.assert_not_called()
        self.assertEqual(self.path(record).read_bytes(), original)
        self.assertEqual(list(self.path(record).parent.iterdir()), [self.path(record)])

    def test_failed_create_has_no_partial_record(self):
        with patch.object(projects.tempfile, "mkstemp", side_effect=OSError("disk full")):
            response = self.client.post("/api/projects", json={"name": "未保存", "project": self.draft()})
        self.assert_chinese_error(response, 500)
        self.assertEqual(list((self.root / "projects").iterdir()), [])

    def test_invalid_unicode_is_rejected_and_corrupt_unicode_storage_is_skipped(self):
        record = self.create()
        original = self.path(record).read_bytes()
        invalid = self.draft() | {"future": {"\ud800": "invalid key"}}
        response = self.client.put(f"/api/projects/{record['id']}", content=json.dumps({
            "name": "无效文本", "project": invalid, "revision": 1}))
        self.assert_chinese_error(response, 422)
        self.assertEqual(self.path(record).read_bytes(), original)
        damaged = record | {"name": "\ud800"}
        self.path(record).write_text(json.dumps(damaged), "utf-8")
        self.assert_chinese_error(self.client.get(f"/api/projects/{record['id']}"), 500)
        self.assertEqual(self.client.get("/api/projects").json(), {"projects": []})

    def test_read_list_and_delete_io_failures_are_explicit(self):
        record = self.create()
        url = f"/api/projects/{record['id']}"
        with patch.object(Path, "open", side_effect=PermissionError("unreadable")):
            self.assert_chinese_error(self.client.get(url), 500)
            self.assert_chinese_error(self.client.get("/api/projects"), 500)
        with patch.object(Path, "iterdir", side_effect=PermissionError("unreadable directory")):
            self.assert_chinese_error(self.client.get("/api/projects"), 500)
        with patch.object(Path, "unlink", side_effect=PermissionError("cannot delete")):
            self.assert_chinese_error(self.client.delete(url + "?revision=1"), 500)
        self.assertEqual(self.client.get(url).json(), record)


if __name__ == "__main__":
    unittest.main()
