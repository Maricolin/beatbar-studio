"""Run a small, sequential API benchmark against a disposable BeatBar server.

Uploads the bundled 8-second WAV and creates four rendered outputs on the server.
This is an end-to-end latency sample, not a concurrency or peak-memory benchmark.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

from beatbar_client import BeatBarClient

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/api-benchmark.json")
    parser.add_argument("--machine-label", default="Unspecified host; record hardware separately")
    args = parser.parse_args()
    rows = []
    with BeatBarClient(args.url) as client:
        start = time.perf_counter()
        media = client.upload(ROOT / "docs/examples/beatbar-120.wav")
        upload_seconds = time.perf_counter() - start
        start = time.perf_counter()
        job = client.request("POST", "/api/analyze", json={"mediaId": media["id"], "sensitivity": 55, "minInterval": 0.20})
        analysis = client.wait(job["id"], interval=0.1)
        analyze_seconds = time.perf_counter() - start
        project = json.loads((ROOT / "docs/examples/classic-120.json").read_text("utf-8"))
        for mode, width, height, fps in [("composite", 640, 360, 24), ("green", 640, 360, 24), ("transparent", 640, 360, 24), ("composite", 1280, 720, 30)]:
            start = time.perf_counter()
            extension = ".webm" if mode == "transparent" else ".mp4"
            job = client.request("POST", "/api/export", json={"mediaId": media["id"], "beats": project["beats"], "style": project["style"], "mode": mode, "width": width, "height": height, "fps": fps, "includeAudio": True, "filename": "benchmark" + extension})
            result = client.wait(job["id"], timeout=600, interval=0.1)
            elapsed = time.perf_counter() - start
            output = args.output.parent / f"benchmark-{mode}-{width}x{height}-{fps}{extension}"
            client.download(result["url"], output, overwrite=True)
            rows.append({"mode": mode, "width": width, "height": height, "fps": fps, "frames": round(media["duration"] * fps), "elapsedSeconds": round(elapsed, 3), "mediaSecondsPerWallSecond": round(media["duration"] / elapsed, 3), "bytes": result["size"], "output": str(output)})
    report = {"recordedAt": datetime.now(timezone.utc).isoformat(), "machine": args.machine_label, "platform": platform.platform(), "python": platform.python_version(), "versions": {name: importlib.metadata.version(name) for name in ["fastapi", "numpy", "Pillow", "imageio-ffmpeg", "httpx2"]}, "scope": "Single run, sequential jobs, warm service, localhost; no peak-RAM or concurrent-load measurement. Polling interval 0.1s; render timing excludes download.", "media": {"duration": media["duration"], "kind": "synthetic mono WAV; no source video decoding"}, "uploadSeconds": round(upload_seconds, 3), "analyzeSeconds": round(analyze_seconds, 3), "beatCount": len(analysis["beats"]), "bpm": analysis["bpm"], "renders": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
