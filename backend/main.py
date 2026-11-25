from __future__ import annotations

import base64
import io
import json
import math
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from bisect import bisect_left, bisect_right
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import imageio_ffmpeg
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageOps
from pydantic import BaseModel, Field, field_validator, model_validator
from scipy.signal import butter, find_peaks, sosfiltfilt, stft

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(os.environ.get("BEATBAR_DATA_DIR", ROOT / "data"))
MEDIA_DIR = "media"
EXPORT_DIR = "exports"
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
# Resource boundaries: uploads are capped at 512 MiB / 20 min; source sides at 8192 px.
# Exports are capped at 1920 px per side, 60 fps, 20 min and 180,000 frames.
MAX_MEDIA_SECONDS = 20 * 60
MAX_DIMENSION = 8192
MAX_EXPORT_DIMENSION = 1920
MAX_EXPORT_FRAMES = 180_000
MAX_EXPORT_PIXEL_FRAMES = 1_000_000_000_000
AUDIO_RATE = 22_050
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

app = FastAPI(title="BeatBar backend", version="1.0.0")

@dataclass
class Media:
    id: str
    name: str
    path: Path
    duration: float
    width: int | None
    height: int | None
    has_audio: bool
    has_video: bool
    waveform: list[float] = field(default_factory=list)


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"
    progress: int = 0
    message: str = "Queued"
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            item: dict[str, Any] = {
                "id": self.id,
                "status": self.status,
                "progress": self.progress,
                "message": self.message,
            }
            if self.status == "done" and self.result is not None:
                item["result"] = self.result
            if self.status == "error":
                item["error"] = self.error or self.message
            return item


MEDIA: dict[str, Media] = {}
JOBS: dict[str, Job] = {}
STATE_LOCK = threading.RLock()
EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="beatbar-job")


def media_dir() -> Path:
    return DATA_ROOT / MEDIA_DIR


def export_dir() -> Path:
    return DATA_ROOT / EXPORT_DIR


def _safe_name(name: str | None) -> str:
    # Keep original Unicode display names; paths on disk are UUID-based.
    raw = Path((name or "upload").replace("\\", "/")).name
    return (raw or "upload")[:180]


def _run_capture(args: list[str], timeout: float = 25) -> tuple[int, bytes, bytes]:
    """Run an argument vector, never a shell command; bound captured diagnostics."""
    try:
        p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise ValueError("媒体探测超时，请使用常见音频或视频格式。") from exc
    except OSError as exc:
        raise ValueError(f"无法运行 ffmpeg: {exc}") from exc
    return p.returncode, p.stdout, p.stderr[-256_000:]


def probe_media(path: Path) -> tuple[float, int | None, int | None, bool, bool]:
    code, _out, err = _run_capture([FFMPEG, "-hide_banner", "-i", str(path), "-t", "0", "-f", "null", "-"], timeout=35)
    text = err.decode("utf-8", "replace")
    if not re.search(r"Input #0,", text):
        raise ValueError("无法识别上传文件，请上传有效的音频或视频。")
    duration_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if not duration_match or duration_match.group(1) == "N/A":
        raise ValueError("无法读取媒体时长；请上传有明确时长的文件。")
    duration = int(duration_match.group(1)) * 3600 + int(duration_match.group(2)) * 60 + float(duration_match.group(3))
    if not math.isfinite(duration) or duration <= 0 or duration > MAX_MEDIA_SECONDS:
        raise ValueError(f"媒体时长必须在 0 到 {MAX_MEDIA_SECONDS // 60} 分钟之间。")
    dims = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})(?:\s|,|\[)", text, re.S)
    width = int(dims.group(1)) if dims else None
    height = int(dims.group(2)) if dims else None
    if width is not None and (width > MAX_DIMENSION or height is None or height > MAX_DIMENSION):
        raise ValueError(f"媒体尺寸不能超过 {MAX_DIMENSION}×{MAX_DIMENSION}。")
    has_video = bool(dims)
    has_audio = bool(re.search(r"Audio:", text))
    if not has_video and not has_audio:
        raise ValueError("文件必须包含至少一个可读取的音频或视频流。")
    # ffmpeg returns non-zero when it probes a valid input and reaches null output on some builds.
    if code not in (0, 1):
        raise ValueError("媒体探测失败，请确认文件没有损坏。")
    return duration, width, height, has_audio, has_video


def _load_media(media_id: str) -> Media:
    with STATE_LOCK:
        found = MEDIA.get(media_id)
    if found is not None and found.path.is_file():
        return found
    if not re.fullmatch(r"[0-9a-f]{32}", media_id):
        raise HTTPException(status_code=404, detail="Media not found")
    meta_path = media_dir() / f"{media_id}.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        info = json.loads(meta_path.read_text("utf-8"))
        item = Media(id=media_id, name=info["name"], path=media_dir() / info["file"],
                     duration=float(info["duration"]), width=info.get("width"), height=info.get("height"),
                     has_audio=bool(info["hasAudio"]), has_video=bool(info.get("hasVideo", info.get("width") is not None)),
                     waveform=[float(v) for v in info.get("waveform", [])])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=500, detail="Stored media metadata is invalid") from exc
    if not item.path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")
    with STATE_LOCK:
        MEDIA[media_id] = item
    return item


def _job(job_id: str) -> Job:
    with STATE_LOCK:
        job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _set_job(job: Job, *, status: str | None = None, progress: int | None = None,
             message: str | None = None, result: dict[str, Any] | None = None,
             error: str | None = None) -> None:
    with job.lock:
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = max(0, min(100, int(progress)))
        if message is not None:
            job.message = message[:500]
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error[:1000]


def _create_job(kind: str) -> Job:
    job = Job(id=uuid.uuid4().hex, kind=kind)
    with STATE_LOCK:
        JOBS[job.id] = job
    return job


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/media")
def upload_media(file: UploadFile = File(...)) -> dict[str, Any]:
    media_dir().mkdir(parents=True, exist_ok=True)
    name = _safe_name(file.filename)
    media_id = uuid.uuid4().hex
    suffix = Path(name).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,10}", suffix):
        suffix = ".media"
    path = media_dir() / f"{media_id}{suffix}"
    total = 0
    try:
        with path.open("wb") as dest:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail=f"上传文件不能超过 {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB。")
                dest.write(chunk)
        if total == 0:
            raise HTTPException(status_code=400, detail="上传文件为空。")
        duration, width, height, has_audio, has_video = probe_media(path)
    except HTTPException:
        path.unlink(missing_ok=True)
        raise
    except ValueError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"保存上传文件失败: {exc}") from exc
    finally:
        file.file.close()
    waveform = _compute_waveform(path, duration, has_audio)
    item = Media(media_id, name, path, duration, width, height, has_audio, has_video, waveform)
    (media_dir() / f"{media_id}.json").write_text(json.dumps({
        "id": media_id, "name": name, "file": path.name, "duration": duration,
        "width": width, "height": height, "hasAudio": has_audio, "hasVideo": has_video,
        "waveform": waveform,
    }, ensure_ascii=False), "utf-8")
    with STATE_LOCK:
        MEDIA[media_id] = item
    return {"id": media_id, "name": name, "duration": duration, "width": width, "height": height,
            "hasAudio": has_audio, "hasVideo": has_video, "url": f"/api/media/{media_id}/file", "waveform": waveform}


def _compute_waveform(path: Path, duration: float, has_audio: bool) -> list[float]:
    if not has_audio:
        return []
    # Decode a bounded 800 Hz mono envelope and reduce it to 256 max-absolute buckets.
    code, raw, _err = _run_capture([FFMPEG, "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "800", "-t", f"{duration:.4f}", "-f", "f32le", "pipe:1"], timeout=180)
    if code != 0 or len(raw) < 4:
        return []
    samples = np.frombuffer(raw[:len(raw) // 4 * 4], dtype="<f4").copy()
    if samples.size == 0:
        return []
    samples = np.nan_to_num(samples, copy=False)
    count = min(256, samples.size)
    edges = np.linspace(0, samples.size, count + 1, dtype=np.int64)
    return [round(float(np.max(np.abs(samples[edges[i]:edges[i+1]]))), 5) for i in range(count) if edges[i+1] > edges[i]]


def _range_response(path: Path, range_header: str | None, media_type: str, filename: str | None = None):
    size = path.stat().st_size
    raw_filename = _safe_name(filename or path.name)
    header_filename = re.sub(r"[^A-Za-z0-9._() -]+", "_", raw_filename).strip(" .") or "media"
    headers = {"Accept-Ranges": "bytes", "Content-Disposition": f'inline; filename="{header_filename}"'}
    if not range_header:
        headers["Content-Length"] = str(size)
        return FileResponse(path, media_type=media_type, headers=headers)
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not match or (not match.group(1) and not match.group(2)):
        raise HTTPException(status_code=416, detail="Invalid byte range", headers={"Content-Range": f"bytes */{size}"})
    if not match.group(1):
        suffix_len = int(match.group(2))
        if suffix_len <= 0:
            raise HTTPException(status_code=416, detail="Invalid byte range", headers={"Content-Range": f"bytes */{size}"})
        start, end = max(0, size - suffix_len), size - 1
    else:
        start = int(match.group(1))
        end = min(int(match.group(2)) if match.group(2) else size - 1, size - 1)
    if start >= size or end < start:
        raise HTTPException(status_code=416, detail="Range not satisfiable", headers={"Content-Range": f"bytes */{size}"})
    length = end - start + 1
    headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(length)})
    def stream():
        with path.open("rb") as f:
            f.seek(start)
            remaining = length
            while remaining:
                chunk = f.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
    return StreamingResponse(stream(), status_code=206, media_type=media_type, headers=headers)


@app.get("/api/media/{media_id}/file")
def media_file(media_id: str, range_header: str | None = Header(default=None, alias="Range")):
    item = _load_media(media_id)
    mime_type = mimetypes.guess_type(item.name)[0] or "application/octet-stream"
    return _range_response(item.path, range_header, mime_type, item.name)


@app.get("/api/media/{media_id}")
def get_media(media_id: str) -> dict[str, Any]:
    item = _load_media(media_id)
    return {"id": item.id, "name": item.name, "duration": item.duration, "width": item.width,
            "height": item.height, "hasAudio": item.has_audio, "hasVideo": item.has_video, "url": f"/api/media/{item.id}/file",
            "waveform": item.waveform}


class AnalyzeRequest(BaseModel):
    mediaId: str
    sensitivity: int = Field(50, ge=1, le=100)
    minInterval: float = Field(0.18, ge=0.05, le=10)
    lowHz: float = Field(40, ge=20, le=10_000)
    highHz: float = Field(3000, gt=20, le=20_000)

    @field_validator("highHz")
    @classmethod
    def validate_band(cls, value: float, info):
        low = info.data.get("lowHz", 40)
        if value <= low:
            raise ValueError("highHz 必须大于 lowHz")
        if value > AUDIO_RATE / 2:
            raise ValueError(f"highHz 不能超过 {AUDIO_RATE / 2:g} Hz")
        return value


def _decode_audio(media: Media, cancel: threading.Event) -> np.ndarray:
    args = [FFMPEG, "-v", "error", "-i", str(media.path), "-vn", "-ac", "1", "-ar", str(AUDIO_RATE), "-f", "f32le", "pipe:1"]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stderr: list[bytes] = []
    def drain():
        assert proc.stderr is not None
        stderr.append(proc.stderr.read(128_000))
    drainer = threading.Thread(target=drain, daemon=True)
    drainer.start()
    chunks: list[bytes] = []
    assert proc.stdout is not None
    max_bytes = int(MAX_MEDIA_SECONDS * AUDIO_RATE * 4)
    try:
        while True:
            if cancel.is_set():
                proc.terminate()
                raise RuntimeError("Cancelled")
            chunk = proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
            if sum(map(len, chunks)) > max_bytes:
                proc.terminate()
                raise ValueError("解码后的音频超过资源上限。")
        rc = proc.wait(timeout=8)
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        drainer.join(timeout=2)
        if proc.stdout:
            proc.stdout.close()
        if proc.stderr:
            proc.stderr.close()
    raw = b"".join(chunks)
    if rc != 0 or len(raw) < 4:
        detail = b"".join(stderr).decode("utf-8", "replace")[-800:]
        raise ValueError("此媒体没有可解码的音频流。" + (f" {detail}" if detail else ""))
    return np.frombuffer(raw[:len(raw) // 4 * 4], dtype="<f4").copy()


def analyze_audio(media: Media, req: AnalyzeRequest, cancel: threading.Event, progress=None) -> dict[str, Any]:
    if not media.has_audio:
        raise ValueError("所选媒体不包含音频，无法分析节拍。")
    if progress:
        progress(8, "解码音频")
    signal = _decode_audio(media, cancel)
    if cancel.is_set():
        raise RuntimeError("Cancelled")
    if signal.size < AUDIO_RATE // 4:
        raise ValueError("音频过短，至少需要 0.25 秒。")
    signal = np.nan_to_num(signal, copy=False)
    # Band-limited spectral flux is robust to silence/background and detects transient onsets.
    sos = butter(4, [req.lowHz, req.highHz], btype="bandpass", fs=AUDIO_RATE, output="sos")
    if signal.size > 48:
        signal = sosfiltfilt(sos, signal)
    if progress:
        progress(38, "计算频谱变化")
    nperseg, hop = 2048, 256
    _freq, times, z = stft(signal, fs=AUDIO_RATE, nperseg=nperseg, noverlap=nperseg-hop,
                           boundary="zeros", padded=True)
    magnitude = np.abs(z)
    flux = np.maximum(0, np.diff(magnitude, axis=1, prepend=magnitude[:, :1])).sum(axis=0)
    # Local baseline lets a click stand out even when overall loudness changes.
    baseline = np.convolve(flux, np.ones(31, dtype=np.float64) / 31, mode="same")
    novelty = np.maximum(0, flux - baseline * 0.8)
    peak_value = float(np.max(novelty)) if novelty.size else 0.0
    if peak_value <= 1e-10:
        return {"beats": [], "bpm": 0}
    prominence = peak_value * (0.06 + (100 - req.sensitivity) / 450)
    distance = max(1, int(math.ceil(req.minInterval * AUDIO_RATE / hop)))
    peaks, properties = find_peaks(novelty, distance=distance, prominence=prominence)
    if not len(peaks):
        peaks = np.array([int(np.argmax(novelty))])
    # The peak strength uses a percentile normalization, stable between quiet/loud files.
    scale = max(float(np.percentile(novelty[peaks], 95)), 1e-12)
    beats = [{"time": round(float(times[int(i)]), 4), "strength": round(min(1.0, float(novelty[int(i)]) / scale), 4)} for i in peaks]
    beats = [b for b in beats if 0 <= b["time"] <= media.duration]
    intervals = np.diff([b["time"] for b in beats])
    intervals = intervals[(intervals >= req.minInterval) & (intervals <= 2.5)]
    bpm = 0
    if intervals.size:
        raw_bpm = 60 / float(np.median(intervals))
        while raw_bpm < 60:
            raw_bpm *= 2
        while raw_bpm > 200:
            raw_bpm /= 2
        bpm = int(round(raw_bpm))
    if progress:
        progress(92, "整理节拍")
    return {"beats": beats, "bpm": bpm}


def _run_analysis(job: Job, req: AnalyzeRequest):
    try:
        if job.cancel_event.is_set():
            raise RuntimeError("Cancelled")
        _set_job(job, status="running", progress=2, message="正在分析音频")
        result = analyze_audio(_load_media(req.mediaId), req, job.cancel_event,
                               lambda p, m: _set_job(job, progress=p, message=m))
        if job.cancel_event.is_set():
            raise RuntimeError("Cancelled")
        _set_job(job, status="done", progress=100, message="分析完成", result=result)
    except Exception as exc:
        message = "任务已取消。" if isinstance(exc, RuntimeError) and str(exc) == "Cancelled" else str(exc)
        _set_job(job, status="error", progress=100, message=message, error=message)


@app.post("/api/analyze", status_code=202)
def start_analysis(req: AnalyzeRequest) -> dict[str, str]:
    _load_media(req.mediaId)
    job = _create_job("analyze")
    EXECUTOR.submit(_run_analysis, job, req)
    return {"id": job.id}


class Beat(BaseModel):
    time: float = Field(ge=0, le=MAX_MEDIA_SECONDS)
    strength: float = Field(ge=0, le=1)

class Style(BaseModel):
    color: str = "#ffffff"
    secondaryColor: str = "#67dce8"
    backgroundColor: str = "#111820"
    colorMode: str = "solid"
    barColor: str = "#222222"
    position: float = Field(0.5, ge=0, le=1)
    barWidth: float = Field(0.7, gt=0, le=1)
    barHeight: int = Field(28, ge=2, le=512)
    speed: float = Field(2.0, gt=0, le=60)
    marker: float = Field(0.15, ge=0, le=1)
    pattern: str = "circle"
    motion: str = "right-left"
    hitEffect: str = "ring"
    hitDuration: float = Field(0.45, ge=0.15, le=1.2)
    effectIntensity: float = Field(1.0, ge=0.25, le=2)
    beatScale: float = Field(1.0, ge=0.5, le=1.5)
    patternImage: str | None = Field(None, max_length=2_800_000)

    @field_validator("color", "secondaryColor", "backgroundColor", "barColor")
    @classmethod
    def valid_color(cls, value: str):
        _parse_color(value)
        return value

    @field_validator("colorMode")
    @classmethod
    def valid_color_mode(cls, value: str):
        if value not in {"solid", "alternate", "strength"}:
            raise ValueError("不支持的鼓点颜色模式。")
        return value

    @model_validator(mode="after")
    def custom_pattern_has_image(self):
        if self.pattern == "custom" and not self.patternImage:
            raise ValueError("请先上传自定义鼓点图案。")
        return self

    @field_validator("pattern")
    @classmethod
    def valid_pattern(cls, value: str):
        if value not in {"circle", "diamond", "triangle", "star", "pill", "hexagon", "heart", "custom"}:
            raise ValueError("不支持的鼓点图案。")
        return value

    @field_validator("motion")
    @classmethod
    def valid_motion(cls, value: str):
        if value not in {"right-left", "left-right", "meet"}:
            raise ValueError("不支持的鼓点运动方式。")
        return value

    @field_validator("hitEffect")
    @classmethod
    def valid_hit_effect(cls, value: str):
        if value not in {"ring", "flash", "burst", "none"}:
            raise ValueError("不支持的命中动效。")
        return value

class ExportRequest(BaseModel):
    mediaId: str
    beats: list[Beat] = Field(default_factory=list, max_length=100_000)
    style: Style = Field(default_factory=Style)
    mode: str = "green"
    width: int = Field(1280, ge=64, le=MAX_EXPORT_DIMENSION)
    height: int = Field(720, ge=64, le=MAX_EXPORT_DIMENSION)
    fps: int = Field(30, ge=1, le=60)
    includeAudio: bool = True

    @field_validator("mode")
    @classmethod
    def valid_mode(cls, v: str):
        if v not in {"green", "transparent", "composite"}:
            raise ValueError("mode 必须为 green、transparent 或 composite")
        return v

    @field_validator("beats")
    @classmethod
    def ordered_and_bounded_beats(cls, beats: list[Beat]):
        if any(beats[i].time < beats[i-1].time for i in range(1, len(beats))):
            raise ValueError("beats 必须按 time 升序排列。")
        return beats


def _parse_color(value: str) -> tuple[int, int, int]:
    colors = {"white": "#ffffff", "black": "#000000", "red": "#ff0000", "blue": "#0000ff", "yellow": "#ffff00", "cyan": "#00ffff"}
    value = colors.get(value.lower(), value)
    if re.fullmatch(r"#[0-9a-fA-F]{3}", value):
        value = "#" + "".join(c*2 for c in value[1:])
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("颜色仅支持 #RGB、#RRGGBB 或常见颜色名称。")
    return tuple(int(value[i:i+2], 16) for i in (1, 3, 5))


def _load_pattern_image(data: str | None) -> Image.Image | None:
    if not data:
        return None
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})", data)
    if not match:
        raise ValueError("自定义图案必须为 PNG、JPG 或 WebP 图片。")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
        if not raw or len(raw) > 2 * 1024 * 1024:
            raise ValueError("自定义图案不能超过 2 MB。")
        image = Image.open(io.BytesIO(raw))
        if image.format not in {"PNG", "JPEG", "WEBP"}:
            raise ValueError("自定义图案格式无效。")
        if image.width > 4096 or image.height > 4096:
            raise ValueError("自定义图案尺寸不能超过 4096×4096。")
        image.load()
        image = ImageOps.exif_transpose(image).convert("RGBA")
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        return image
    except (OSError, ValueError) as exc:
        raise ValueError("无法读取自定义图案图片。") from exc


def _draw_beat_shape(draw: ImageDraw.ImageDraw, pattern: str, cx: float, cy: float, radius: int, fill):
    x, y, r = int(round(cx)), int(round(cy)), max(1, int(radius))
    if pattern == "diamond":
        points = [(x, y-r), (x+r, y), (x, y+r), (x-r, y)]
        draw.polygon(points, fill=fill)
    elif pattern == "triangle":
        draw.polygon([(x, y-r), (x+r, y+r), (x-r, y+r)], fill=fill)
    elif pattern == "star":
        points = []
        for index in range(10):
            angle = -math.pi / 2 + index * math.pi / 5
            length = r if index % 2 == 0 else r * 0.46
            points.append((int(round(x + math.cos(angle) * length)), int(round(y + math.sin(angle) * length))))
        draw.polygon(points, fill=fill)
    elif pattern in {"hexagon", "heart"}:
        points = []
        for index in range(64 if pattern == "heart" else 6):
            angle = index * math.pi * 2 / (64 if pattern == "heart" else 6)
            if pattern == "heart":
                px = 16 * math.sin(angle) ** 3 / 18
                py = -(13 * math.cos(angle) - 5 * math.cos(2 * angle) - 2 * math.cos(3 * angle) - math.cos(4 * angle)) / 18
            else:
                px, py = math.cos(angle - math.pi / 2), math.sin(angle - math.pi / 2)
            points.append((x + px * r, y + py * r))
        draw.polygon(points, fill=fill)
    elif pattern == "pill":
        draw.rounded_rectangle((x-r, y-r*0.7, x+r, y+r*0.7), radius=max(1, int(r*0.7)), fill=fill)
    else:
        draw.ellipse((x-r, y-r, x+r, y+r), fill=fill)


def _mix_color(a, b, amount):
    return tuple(int(math.floor(x + (y-x) * amount + 0.5)) for x, y in zip(a, b))


def _beat_color(style: Style, index: int, strength: float, side: int = 0):
    primary, secondary = _parse_color(style.color), _parse_color(style.secondaryColor)
    if style.colorMode == "strength":
        return _mix_color(secondary, primary, strength)
    if style.colorMode == "alternate":
        return secondary if (side == 1 if style.motion == "meet" else index % 2 == 1) else primary
    return primary


def _render_overlay(width: int, height: int, beats: list[Beat], t: float, style: Style,
                    pattern_image: Image.Image | None = None, pattern_cache=None, beat_times=None):
    """Draw the same track as frontend/visuals.js; effects composite above beats."""
    frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)
    track_width = width * style.barWidth
    left = (width - track_width) / 2
    cy, bar_h = height * style.position, min(height, style.barHeight)
    marker = left + track_width * (0.5 if style.motion == "meet" else style.marker)
    x0, x1 = int(round(left)), int(round(left + track_width))
    y0, y1 = int(round(cy - bar_h/2)), int(round(cy + bar_h/2))
    draw.rounded_rectangle((x0, y0, x1, y1), radius=min(6, bar_h / 3), fill=(*_parse_color(style.barColor), 255))
    beat_layer = Image.new("RGBA", (max(1, x1-x0), max(1, y1-y0)), (0, 0, 0, 0))
    beat_draw = ImageDraw.Draw(beat_layer)
    cache = pattern_cache if pattern_cache is not None else {}
    times = beat_times if beat_times is not None else [beat.time for beat in beats]
    start, end = bisect_left(times, t-style.hitDuration), bisect_right(times, t+style.speed)
    for index in range(start, end):
        beat = beats[index]
        delta = beat.time - t
        if delta < 0:
            continue
        radius = bar_h * 0.3 * (0.55 + 0.45 * beat.strength) * style.beatScale
        if style.motion == "meet":
            progress = 1 - delta/style.speed
            positions = (left + radius + progress * max(0, marker-left-radius),
                         left + track_width - radius - progress * max(0, left+track_width-radius-marker))
        elif style.motion == "left-right":
            positions = (marker - delta/style.speed * track_width * style.marker,)
        else:
            positions = (marker + delta/style.speed * track_width * (1-style.marker),)
        for side, bx in enumerate(positions):
            if pattern_image is not None and style.pattern == "custom":
                size = max(2, int(round(radius*2)))
                stamp = cache.get(size)
                if stamp is None:
                    scale = size/max(pattern_image.size)
                    stamp = pattern_image.resize((max(1, int(round(pattern_image.width*scale))), max(1, int(round(pattern_image.height*scale)))), Image.Resampling.LANCZOS)
                    cache[size] = stamp
                beat_layer.alpha_composite(stamp, (int(round(bx-x0-stamp.width/2)), int(round(cy-y0-stamp.height/2))))
            else:
                _draw_beat_shape(beat_draw, style.pattern, bx-x0, cy-y0, max(1, int(round(radius))), (*_beat_color(style, index, beat.strength, side), 255))
    frame.alpha_composite(beat_layer, (x0, y0))
    if style.hitEffect != "none":
        for index in range(start, end):
            beat = beats[index]
            age = t - beat.time
            if age < 0 or age >= style.hitDuration:
                continue
            progress = age/style.hitDuration
            radius = bar_h*0.3*(0.55+0.45*beat.strength)*style.beatScale
            color = (_mix_color(_parse_color(style.color), _parse_color(style.secondaryColor), 0.5)
                     if style.colorMode == "alternate" and style.motion == "meet" else _beat_color(style, index, beat.strength))
            alpha = int(round(min(1, (1-progress)*style.effectIntensity*{"ring": 0.85, "flash": 0.3, "burst": 0.9}[style.hitEffect])*255))
            effect = Image.new("RGBA", frame.size, (0, 0, 0, 0))
            effect_draw = ImageDraw.Draw(effect)
            line_width = max(1, int(round(bar_h*0.04)))
            if style.hitEffect == "burst":
                inner, length = radius*(1+progress*2), radius*(0.7+progress*1.5)*style.effectIntensity
                for k in range(8):
                    angle = k*math.pi/4
                    effect_draw.line((marker+math.cos(angle)*inner, cy+math.sin(angle)*inner,
                                      marker+math.cos(angle)*(inner+length), cy+math.sin(angle)*(inner+length)), fill=(*color, alpha), width=line_width)
            else:
                er = radius*(1+progress*3*style.effectIntensity)
                box = (marker-er, cy-er, marker+er, cy+er)
                if style.hitEffect == "ring":
                    effect_draw.ellipse(box, outline=(*color, alpha), width=line_width)
                else:
                    effect_draw.ellipse(box, fill=(*color, alpha))
            frame = Image.alpha_composite(frame, effect)
    draw = ImageDraw.Draw(frame)
    draw.line((int(round(marker)), cy-bar_h*0.7, int(round(marker)), cy+bar_h*0.7), fill=(255,255,255,255), width=2)
    return frame


def _output_path(job: Job, mode: str) -> tuple[Path, str]:
    export_dir().mkdir(parents=True, exist_ok=True)
    suffix = ".webm" if mode == "transparent" else ".mp4"
    filename = f"beatbar-{job.id}{suffix}"
    return export_dir() / filename, filename


def _ffmpeg_export(media: Media, req: ExportRequest, job: Job, output: Path, duration: float):
    width, height, fps = req.width, req.height, req.fps
    frame_count = max(1, int(math.ceil(duration * fps)))
    if frame_count > MAX_EXPORT_FRAMES or frame_count * width * height > MAX_EXPORT_PIXEL_FRAMES:
        raise ValueError(f"导出资源超限：最多 {MAX_EXPORT_FRAMES} 帧且总像素帧不超过 {MAX_EXPORT_PIXEL_FRAMES:,}。请降低分辨率、帧率或媒体时长。")
    bg_color = (0, 255, 0) if req.mode == "green" else (0, 0, 0)
    canvas_color = "0x" + "".join(f"{v:02x}" for v in _parse_color(req.style.backgroundColor))
    pattern_image = _load_pattern_image(req.style.patternImage)
    if req.style.pattern == "custom" and pattern_image is None:
        raise ValueError("请先上传自定义鼓点图案。")
    raw_input = ["-f", "rawvideo", "-pix_fmt", "rgba", "-s:v", f"{width}x{height}", "-r", str(fps), "-i", "pipe:0"]
    if req.mode == "composite":
        # The source stays input 0; source audio can be muxed without exposing any shell interpolation.
        base_filter = (f"[0:v:0]scale={width}:{height}:force_original_aspect_ratio=decrease,"
                       f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,fps={fps}[base];") if media.has_video else f"color=c={canvas_color}:s={width}x{height}:r={fps}:d={duration:.6f}[base];"
        graph = base_filter + f"[1:v:0]format=rgba[ov];[base][ov]overlay=shortest=1:format=auto[v]"
        args = [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(media.path), *raw_input,
                "-filter_complex", graph, "-map", "[v]"]
        if req.includeAudio and media.has_audio:
            args += ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "160k"]
        else:
            args += ["-an"]
        args += ["-t", f"{duration:.6f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(output)]
    elif req.mode == "transparent":
        args = [FFMPEG, "-hide_banner", "-loglevel", "error", *raw_input]
        if req.includeAudio and media.has_audio:
            args += ["-i", str(media.path), "-map", "0:v:0", "-map", "1:a:0?"]
        else:
            args += ["-map", "0:v:0", "-an"]
        args += ["-t", f"{duration:.6f}", "-r", str(fps), "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "6", "-b:v", "1M",
                 "-pix_fmt", "yuva420p", "-auto-alt-ref", "0"]
        if req.includeAudio and media.has_audio:
            args += ["-c:a", "libopus", "-b:a", "128k"]
        # VP9 alpha is stored in WebM side data; keep yuva420p explicitly.
        args += ["-y", str(output)]
    else:
        args = [FFMPEG, "-hide_banner", "-loglevel", "error", *raw_input]
        if req.includeAudio and media.has_audio:
            args += ["-i", str(media.path), "-map", "0:v:0", "-map", "1:a:0?"]
        else:
            args += ["-map", "0:v:0", "-an"]
        args += ["-t", f"{duration:.6f}", "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
        if req.includeAudio and media.has_audio:
            args += ["-c:a", "aac", "-b:a", "160k"]
        args += ["-movflags", "+faststart", "-y", str(output)]
    try:
        proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except OSError as exc:
        raise ValueError(f"无法启动 ffmpeg 编码器: {exc}") from exc
    errors: list[bytes] = []
    def drain_stderr():
        assert proc.stderr is not None
        errors.append(proc.stderr.read(512_000))
    stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
    stderr_thread.start()
    assert proc.stdin is not None
    pattern_cache: dict[int, Image.Image] = {}
    beat_times = [beat.time for beat in req.beats]
    try:
        for index in range(frame_count):
            if job.cancel_event.is_set():
                raise RuntimeError("Cancelled")
            t = index / fps
            frame = _render_overlay(width, height, req.beats, t, req.style, pattern_image, pattern_cache, beat_times)
            if req.mode == "green":
                base = Image.new("RGBA", (width, height), (*bg_color, 255))
                base.alpha_composite(frame)
                frame = base
            try:
                proc.stdin.write(frame.tobytes())
            except (BrokenPipeError, OSError) as exc:
                raise RuntimeError("ffmpeg 编码中断") from exc
            if index % max(1, fps) == 0 or index == frame_count - 1:
                _set_job(job, progress=10 + int(index / frame_count * 82), message=f"渲染视频 {index + 1}/{frame_count} 帧")
        proc.stdin.close()
        rc = proc.wait(timeout=max(30, min(600, duration * 5 + 20)))
    except Exception:
        try:
            if proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except OSError:
            pass
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        stderr_thread.join(timeout=2)
        raise
    finally:
        if proc.stderr:
            proc.stderr.close()
    stderr_thread.join(timeout=2)
    if rc != 0 or not output.is_file() or output.stat().st_size == 0:
        error = b"".join(errors).decode("utf-8", "replace")[-1200:]
        raise ValueError("ffmpeg 导出失败。" + (f" {error}" if error else ""))


def _run_export(job: Job, req: ExportRequest):
    output: Path | None = None
    try:
        if job.cancel_event.is_set():
            raise RuntimeError("Cancelled")
        media = _load_media(req.mediaId)
        duration = media.duration
        if duration <= 0 or duration > MAX_MEDIA_SECONDS:
            raise ValueError("媒体时长不在支持范围内。")
        if any(beat.time > duration for beat in req.beats):
            raise ValueError("beat.time 不能超过媒体时长。")
        if req.mode == "composite" and not media.has_video and not media.has_audio:
            raise ValueError("合成模式需要至少有音频或视频的原始媒体。")
        if req.mode == "composite" and media.width and media.height and (media.width > MAX_DIMENSION or media.height > MAX_DIMENSION):
            raise ValueError("原始视频尺寸超出支持范围。")
        _set_job(job, status="running", progress=2, message="准备视频导出")
        output, filename = _output_path(job, req.mode)
        temp = output.with_name(output.stem + ".part" + output.suffix)
        temp.unlink(missing_ok=True)
        _ffmpeg_export(media, req, job, temp, duration)
        if job.cancel_event.is_set():
            raise RuntimeError("Cancelled")
        temp.replace(output)
        _set_job(job, status="done", progress=100, message="导出完成", result={"url": f"/api/exports/{filename}", "filename": filename})
    except Exception as exc:
        if output:
            output.with_name(output.stem + ".part" + output.suffix).unlink(missing_ok=True)
        message = "任务已取消。" if isinstance(exc, RuntimeError) and str(exc) == "Cancelled" else str(exc)
        _set_job(job, status="error", progress=100, message=message, error=message)


@app.post("/api/export", status_code=202)
def start_export(req: ExportRequest) -> dict[str, str]:
    _load_media(req.mediaId)
    # Reject obvious over-budget work before reserving a background worker.
    media = _load_media(req.mediaId)
    frames = math.ceil(media.duration * req.fps)
    if frames > MAX_EXPORT_FRAMES or frames * req.width * req.height > MAX_EXPORT_PIXEL_FRAMES:
        raise HTTPException(status_code=413, detail="导出分辨率、帧率或时长超过资源限制。")
    try:
        _parse_color(req.style.color)
        _parse_color(req.style.barColor)
        _load_pattern_image(req.style.patternImage)
        if req.style.pattern == "custom" and not req.style.patternImage:
            raise ValueError("请先上传自定义鼓点图案。")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    job = _create_job("export")
    EXECUTOR.submit(_run_export, job, req)
    return {"id": job.id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    return _job(job_id).snapshot()


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> dict[str, Any]:
    job = _job(job_id)
    with job.lock:
        if job.status in {"done", "error"}:
            return job.snapshot()
        job.cancel_event.set()
        job.message = "正在取消任务…"
    return job.snapshot()


@app.get("/api/exports/{filename}")
def download_export(filename: str, range_header: str | None = Header(default=None, alias="Range")):
    if filename != Path(filename).name or not re.fullmatch(r"beatbar-[0-9a-f]{32}\.(?:mp4|webm)", filename):
        raise HTTPException(status_code=404, detail="Export not found")
    path = export_dir() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Export not found")
    media_type = "video/webm" if path.suffix == ".webm" else "video/mp4"
    return _range_response(path, range_header, media_type, filename)


frontend = ROOT / "frontend"
if frontend.is_dir():
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
