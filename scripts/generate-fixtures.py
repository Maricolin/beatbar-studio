"""Generate synthetic browser-test media without using private or licensed content."""
from __future__ import annotations

import array
import math
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
RATE = 22050
DURATION = 8
samples = array.array("h")
for n in range(RATE * DURATION):
    phase = n / RATE - 0.25
    offset = phase % 0.5
    amplitude = 22000 * (1 - offset / 0.035) if phase >= 0 and offset < 0.035 else 0
    samples.append(int(amplitude * math.sin(2 * math.pi * 1000 * offset)))
if __import__("sys").byteorder != "little":
    samples.byteswap()
audio = ROOT / "beatbar-sample-clicks.wav"
with wave.open(str(audio), "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(samples.tobytes())
video = ARTIFACTS / "sample-120bpm.mp4"
subprocess.run([
    imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", f"testsrc2=size=1280x720:rate=30:duration={DURATION}",
    "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-t", str(DURATION),
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", "-y", str(video)
], check=True, timeout=90)
print("Generated 8-second 120 BPM audio/video fixtures in the project directory.")
