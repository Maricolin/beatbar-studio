"""Call the running BeatBar HTTP API from Python or the command line.

Examples (run from the repository root):
  python scripts/beatbar_client.py health
  python scripts/beatbar_client.py analyze docs/examples/beatbar-120.wav --output artifacts/beats.json
  python scripts/beatbar_client.py render docs/examples/beatbar-120.wav --project docs/examples/classic-120.json --output artifacts/lesson.mp4
"""
from __future__ import annotations

import argparse
import json
import math
import os
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx2 as httpx


class BeatBarClient:
    """A synchronous HTTP client; all media processing remains on the server."""

    def __init__(self, base_url: str = "http://127.0.0.1:8000", *, timeout: float = 120):
        if urlsplit(base_url).scheme not in {"http", "https"}:
            raise ValueError("base_url must use HTTP or HTTPS")
        self.base_url = base_url.rstrip("/")
        self.http = httpx.Client(base_url=self.base_url, timeout=timeout)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.http.close()

    def request(self, method: str, endpoint: str, **kwargs):
        response = self.http.request(method, endpoint, **kwargs)
        response.raise_for_status()
        return response.json()

    def health(self) -> dict:
        return self.request("GET", "/api/health")

    def upload(self, source: str | Path) -> dict:
        source = Path(source)
        with source.open("rb") as file:
            return self.request("POST", "/api/media", files={"file": (source.name, file, "application/octet-stream")})

    def wait(self, job_id: str, *, timeout: float = 600, interval: float = 0.65) -> dict:
        deadline = time.monotonic() + timeout
        while True:
            job = self.request("GET", "/api/jobs/" + job_id)
            if job["status"] == "done":
                return job["result"]
            if job["status"] == "error":
                raise RuntimeError(f"Job {job_id}: {job.get('error', job.get('message', 'failed'))}")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Job {job_id} is still pending; timeout does not cancel the server job")
            time.sleep(min(interval, remaining))

    def analyze(self, media_id: str, *, timeout: float = 600, **settings) -> dict:
        job = self.request("POST", "/api/analyze", json={"mediaId": media_id, **settings})
        return self.wait(job["id"], timeout=timeout)

    def render(self, request: dict, *, timeout: float = 600) -> dict:
        job = self.request("POST", "/api/export", json=request)
        return self.wait(job["id"], timeout=timeout)

    def create_project(self, name: str, project: dict) -> dict:
        return self.request("POST", "/api/projects", json={"name": name, "project": project})

    def download(self, url: str, output: str | Path, *, overwrite: bool = False) -> Path:
        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists() and not overwrite:
            raise FileExistsError(f"Output exists: {output}; pass --overwrite to replace it")
        full_url = urljoin(self.base_url + "/", url)
        if urlsplit(full_url).netloc != urlsplit(self.base_url).netloc:
            raise ValueError("Download URL must refer to the configured BeatBar server")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(prefix=".beatbar-", suffix=".part", dir=output.parent, delete=False) as file:
                temporary = Path(file.name)
                with self.http.stream("GET", full_url) as response:
                    response.raise_for_status()
                    for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                        file.write(chunk)
            if output.exists() and not overwrite:
                raise FileExistsError(f"Output appeared during download: {output}")
            os.replace(temporary, output)
            return output
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="BeatBar server base URL")
    parser.add_argument("--timeout", type=float, default=600, help="Maximum wait for each background job, in seconds")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("health", help="Check server health")
    analyze = commands.add_parser("analyze", help="Upload media and save detected beat JSON")
    render = commands.add_parser("render", help="Upload media, use a project or detect beats, render and download")
    for command in (analyze, render):
        command.add_argument("input", type=Path)
        command.add_argument("--output", type=Path, required=True)
        command.add_argument("--overwrite", action="store_true")
        command.add_argument("--sensitivity", type=int, default=55)
        command.add_argument("--analysis-mode", choices=["onsets", "rhythm"], default="onsets")
        command.add_argument("--min-interval", type=float, default=0.20)
        command.add_argument("--project-name", help="Also create a new server-side project with this name")
    render.add_argument("--project", type=Path, help="Use a version:1 project instead of detecting beats")
    render.add_argument("--mode", choices=["composite", "green", "transparent"])
    render.add_argument("--width", type=int)
    render.add_argument("--height", type=int)
    render.add_argument("--fps", type=int)
    render.add_argument("--no-audio", action="store_true")
    args = parser.parse_args()
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("--timeout must be finite and positive")
    if args.command != "health" and args.output.exists() and not args.overwrite:
        parser.error("output already exists; choose another path or pass --overwrite")
    with BeatBarClient(args.url) as client:
        if args.command == "health":
            print(json.dumps(client.health(), ensure_ascii=False))
            return
        project = json.loads(args.project.read_text("utf-8")) if args.command == "render" and args.project else None
        if project is not None and (project.get("version") != 1 or not isinstance(project.get("beats"), list)):
            parser.error("--project must contain version:1 and a beats array")
        if args.command == "render":
            settings = project.get("exportSettings", {}) if project else {}
            mode = args.mode or settings.get("mode", "composite")
            extension = ".webm" if mode == "transparent" else ".mp4"
            if args.output.suffix.lower() != extension:
                parser.error(f"{mode} output must use {extension}")
        media = client.upload(args.input)
        if project is None:
            detection = client.analyze(media["id"], timeout=args.timeout, sensitivity=args.sensitivity, mode=args.analysis_mode, minInterval=args.min_interval)
            project = {"version": 1, "beats": detection["beats"], "bpm": detection["bpm"]}
        project["media"] = {key: media[key] for key in ("id", "name", "duration")}
        if args.command == "analyze":
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("w" if args.overwrite else "x", encoding="utf-8") as output:
                json.dump(project, output, ensure_ascii=False, indent=2)
                output.write("\n")
            result = {"output": str(args.output), "beatCount": len(project["beats"]), "bpm": project["bpm"]}
        else:
            settings = project.get("exportSettings", {})
            resolution = settings.get("resolution", "640x360")
            if resolution == "source":
                width, height = media.get("width") or 1280, media.get("height") or 720
            else:
                width, height = (int(value) for value in resolution.split("x"))
            beats = [{"time": beat, "strength": 1} if isinstance(beat, (int, float)) else beat for beat in project["beats"]]
            result = client.render({"mediaId": media["id"], "beats": beats, "style": project.get("style", {}), "mode": mode, "width": args.width if args.width is not None else width, "height": args.height if args.height is not None else height, "fps": args.fps if args.fps is not None else settings.get("fps", 24), "includeAudio": not args.no_audio and settings.get("includeAudio", True), "filename": args.output.name}, timeout=args.timeout)
            client.download(result["url"], args.output, overwrite=args.overwrite)
            result = {**result, "output": str(args.output)}
        if args.project_name:
            result["projectId"] = client.create_project(args.project_name, project)["id"]
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (httpx.HTTPError, OSError, ValueError, RuntimeError, TimeoutError) as error:
        raise SystemExit(str(error)) from error
