"""File-backed project library; project documents retain their extensible JSON shape."""
from __future__ import annotations

import json
import math
import os
import re
import tempfile
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Request

MAX_PROJECT_BYTES = 20_000_000
MAX_BEATS = 100_000
_ID = re.compile(r"[0-9a-f]{32}")
# Serialize read/check/replace within this backend process, including separate routers.
_STORE_LOCK = threading.RLock()


def _invalid(detail: str) -> None:
    raise HTTPException(status_code=422, detail=detail)


def _number(value: Any, label: str, minimum: float | None = None,
            maximum: float | None = None) -> None:
    if type(value) not in (int, float):
        _invalid(f"{label}必须为有限数字。")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        _invalid(f"{label}必须为有限数字。")
    if minimum is not None and value < minimum:
        _invalid(f"{label}不能小于 {minimum:g}。")
    if maximum is not None and value > maximum:
        _invalid(f"{label}不能大于 {maximum:g}。")


def _json_tree(value: Any) -> None:
    """Validate extensions too, without dropping unknown fields or embedded images."""
    pending = [(value, 0)]
    while pending:
        item, depth = pending.pop()
        if depth > 100:
            _invalid("项目 JSON 嵌套不能超过 100 层。")
        if item is None or type(item) is bool:
            continue
        if isinstance(item, str):
            try:
                item.encode("utf-8")
            except UnicodeError as exc:
                raise HTTPException(status_code=422, detail="项目字符串必须为有效的 UTF-8 文本。") from exc
        elif type(item) in (int, float):
            _number(item, "项目中的数字")
        elif isinstance(item, dict):
            if any(not isinstance(key, str) for key in item):
                _invalid("项目 JSON 对象的字段名必须为字符串。")
            pending.extend((child, depth + 1) for child in item.values())
            pending.extend((key, depth + 1) for key in item)
        elif isinstance(item, list):
            pending.extend((child, depth + 1) for child in item)
        else:
            _invalid("项目必须是有效的 JSON 文档。")


def validate_project(project: Any) -> dict[str, Any]:
    if not isinstance(project, dict):
        _invalid("project 必须为 JSON 对象。")
    if type(project.get("version")) is not int or project["version"] != 1:
        _invalid("不支持的项目版本，version 必须为 1。")
    beats = project.get("beats")
    if not isinstance(beats, list) or len(beats) > MAX_BEATS:
        _invalid("拍点必须为数组，最多 100000 个。")
    for beat in beats:
        # Earlier version:1 imports also accept a list of numeric beat times.
        if type(beat) in (int, float):
            _number(beat, "拍点时间", 0)
        elif isinstance(beat, dict):
            _number(beat.get("time"), "拍点时间", 0)
            if "strength" in beat:
                _number(beat["strength"], "拍点强度", 0, 1)
            if beat.get("loudnessDb") is not None:
                _number(beat["loudnessDb"], "拍点响度", -120, 6)
        else:
            _invalid("每个拍点必须为时间数字或拍点对象。")
    media = project.get("media")
    if media is not None:
        if not isinstance(media, dict):
            _invalid("media 必须为素材对象或 null。")
        if not isinstance(media.get("id"), str) or not _ID.fullmatch(media["id"]):
            _invalid("素材 ID 必须为 32 位小写十六进制字符。")
        if not isinstance(media.get("name"), str) or not media["name"].strip():
            _invalid("素材名称必须为非空字符串。")
        _number(media.get("duration"), "素材时长", 0)
        if media["duration"] == 0:
            _invalid("素材时长必须大于 0。")
    for field in ("style", "editorSettings", "exportSettings"):
        if field in project and not isinstance(project[field], dict):
            _invalid(f"{field} 必须为 JSON 对象。")
    if "bpm" in project:
        _number(project["bpm"], "BPM", 0)
    _json_tree(project)
    return project


def _name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        _invalid("项目名称必须为 1 到 200 个字符的非空字符串。")
    if any(ord(char) < 32 for char in value):
        _invalid("项目名称不能包含控制字符。")
    return value.strip()


def _revision(value: Any) -> int:
    if type(value) is not int or value < 1:
        _invalid("revision 必填，且必须为大于 0 的整数。")
    return value


def _timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("invalid timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed


def _now(previous: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    if previous is not None:
        now = max(now, _timestamp(previous) + timedelta(microseconds=1))
    return now.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _encode(record: dict[str, Any]) -> bytes:
    try:
        data = json.dumps(record, ensure_ascii=False, allow_nan=False,
                          separators=(",", ":")).encode("utf-8")
    except (ValueError, TypeError, OverflowError, RecursionError, UnicodeError) as exc:
        raise HTTPException(status_code=422, detail="项目必须是有效的 UTF-8 JSON 文档。") from exc
    if len(data) > MAX_PROJECT_BYTES:
        raise HTTPException(status_code=413, detail="项目不能超过 20 MB。")
    return data


class ProjectStore:
    """Read through to disk on every request; no in-memory record cache to recover."""

    def __init__(self, data_root: Callable[[], Path]):
        self.data_root = data_root

    def _directory(self) -> Path:
        directory = Path(self.data_root()) / "projects"
        if directory.is_symlink():
            raise HTTPException(status_code=500, detail="项目库目录不能为符号链接。")
        return directory

    def _path(self, project_id: str) -> Path:
        if not _ID.fullmatch(project_id):
            _invalid("项目 ID 必须为 32 位小写十六进制字符。")
        path = self._directory() / f"{project_id}.json"
        if path.is_symlink():
            raise HTTPException(status_code=500, detail="项目存储文件不能为符号链接。")
        return path

    def _read(self, project_id: str) -> dict[str, Any]:
        path = self._path(project_id)
        try:
            with path.open("rb") as stream:
                raw = stream.read(MAX_PROJECT_BYTES + 1)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="项目不存在。") from exc
        except OSError as exc:
            raise HTTPException(status_code=500, detail="读取项目文件失败。") from exc
        try:
            if len(raw) > MAX_PROJECT_BYTES:
                raise ValueError("stored project is too large")
            record = json.loads(raw)
            if not isinstance(record, dict) or record.get("id") != project_id:
                raise ValueError("record identity does not match filename")
            _name(record.get("name"))
            _revision(record.get("revision"))
            created = _timestamp(record.get("createdAt"))
            updated = _timestamp(record.get("updatedAt"))
            if updated < created:
                raise ValueError("updatedAt precedes createdAt")
            validate_project(record.get("project"))
            _json_tree(record)
        except (ValueError, TypeError, OverflowError, RecursionError, HTTPException) as exc:
            raise HTTPException(status_code=500, detail="项目存储文件已损坏或格式无效，无法打开。") from exc
        return record

    def _write(self, record: dict[str, Any]) -> None:
        data = _encode(record)  # Complete validation/encoding before touching existing files.
        path = self._path(record["id"])
        temp_path: Path | None = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(prefix=f".{record['id']}.", suffix=".tmp", dir=path.parent)
            temp_path = Path(temporary)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_path, path)
        except OSError as exc:
            raise HTTPException(status_code=500, detail="保存项目文件失败，原项目未被覆盖。") from exc
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass  # A failed cleanup must not hide the original write error.

    def list(self) -> list[dict[str, Any]]:
        with _STORE_LOCK:
            try:
                directory = self._directory()
                # Unlike glob(), iterdir() reports directory permission/read errors.
                paths = list(directory.iterdir())
            except FileNotFoundError:
                return []
            except OSError as exc:
                raise HTTPException(status_code=500, detail="读取项目列表失败。") from exc
            records = []
            for path in paths:
                if path.suffix != ".json" or not _ID.fullmatch(path.stem):
                    continue
                try:
                    record = self._read(path.stem)
                except HTTPException as exc:
                    if exc.status_code == 404 or "损坏" in str(exc.detail) or "符号链接" in str(exc.detail):
                        continue
                    raise
                media = record["project"].get("media")
                records.append({key: record[key] for key in (
                    "id", "name", "createdAt", "updatedAt", "revision") } | {
                    "mediaName": media["name"] if media else None,
                    "beatCount": len(record["project"]["beats"]),
                })
            records.sort(key=lambda record: (_timestamp(record["updatedAt"]), record["id"]), reverse=True)
            return records

    def get(self, project_id: str) -> dict[str, Any]:
        with _STORE_LOCK:
            return self._read(project_id)

    def create(self, body: dict[str, Any]) -> dict[str, Any]:
        name, project = _name(body.get("name")), validate_project(body.get("project"))
        with _STORE_LOCK:
            project_id = uuid.uuid4().hex
            while self._path(project_id).exists():
                project_id = uuid.uuid4().hex
            now = _now()
            record = {"id": project_id, "name": name, "createdAt": now,
                      "updatedAt": now, "revision": 1, "project": project}
            self._write(record)
            return record

    def update(self, project_id: str, body: dict[str, Any]) -> dict[str, Any]:
        revision = _revision(body.get("revision"))
        name, project = _name(body.get("name")), validate_project(body.get("project"))
        with _STORE_LOCK:
            old = self._read(project_id)
            if old["revision"] != revision:
                raise HTTPException(status_code=409, detail="项目已被其他操作修改，请重新打开后再保存。")
            record = {"id": project_id, "name": name, "createdAt": old["createdAt"],
                      "updatedAt": _now(old["updatedAt"]), "revision": revision + 1,
                      "project": project}
            self._write(record)
            return record

    def delete(self, project_id: str, revision: int) -> dict[str, bool]:
        _revision(revision)
        with _STORE_LOCK:
            old = self._read(project_id)
            if old["revision"] != revision:
                raise HTTPException(status_code=409, detail="项目已被其他操作修改，请重新打开后再删除。")
            try:
                self._path(project_id).unlink()
            except OSError as exc:
                raise HTTPException(status_code=500, detail="删除项目文件失败。") from exc
            return {"deleted": True}


async def _body(request: Request) -> dict[str, Any]:
    length = request.headers.get("content-length")
    if length is not None:
        try:
            declared = int(length)
        except ValueError:
            _invalid("Content-Length 无效。")
        if declared < 0:
            _invalid("Content-Length 无效。")
        if declared > MAX_PROJECT_BYTES:
            raise HTTPException(status_code=413, detail="项目不能超过 20 MB。")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_PROJECT_BYTES:
            raise HTTPException(status_code=413, detail="项目不能超过 20 MB。")
        data.extend(chunk)
    try:
        body = json.loads(data)
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise HTTPException(status_code=422, detail="请求必须为有效的 JSON 文档。") from exc
    if not isinstance(body, dict):
        _invalid("请求必须为 JSON 对象。")
    return body


def create_router(data_root: Callable[[], Path]) -> APIRouter:
    router = APIRouter(prefix="/api/projects", tags=["projects"])
    store = ProjectStore(data_root)

    @router.get("")
    def list_projects() -> dict[str, Any]:
        return {"projects": store.list()}

    @router.post("")
    async def create_project(request: Request) -> dict[str, Any]:
        return store.create(await _body(request))

    @router.get("/{project_id:path}")
    def get_project(project_id: str) -> dict[str, Any]:
        return store.get(project_id)

    @router.put("/{project_id:path}")
    async def update_project(project_id: str, request: Request) -> dict[str, Any]:
        return store.update(project_id, await _body(request))

    @router.delete("/{project_id:path}")
    def delete_project(project_id: str, request: Request) -> dict[str, bool]:
        raw = request.query_params.get("revision", "")
        if not re.fullmatch(r"[0-9]+", raw) or len(raw) > 20:
            _invalid("revision 必填，且必须为大于 0 的整数。")
        return store.delete(project_id, int(raw))

    return router
