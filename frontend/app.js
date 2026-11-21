const $ = (id) => document.getElementById(id);
const video = $("video"),
  audio = $("audio"),
  timeline = $("timeline"),
  overlay = $("overlay");
const defaults = {
  color: "#b7f56c",
  barColor: "#30363e",
  position: 0.82,
  barWidth: 0.8,
  barHeight: 44,
  speed: 3,
  marker: 0.15,
  pattern: "circle",
  motion: "right-left",
  hitEffect: "ring",
  patternImage: null,
};
const state = {
  media: null,
  beats: [],
  selected: -1,
  style: { ...defaults },
  past: [],
  future: [],
  zoom: 1,
  recording: false,
  busy: false,
  job: null,
  uploading: false,
  pendingProject: null,
};
let toastTimer,
  drag = null,
  customPattern = null,
  audioContext,
  lastTime = 0,
  pollTimer;
function toast(text, error = false) {
  $("toast").textContent = text;
  $("toast").className = "visible" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").className = ""), 5000);
}
async function api(path, body) {
  const r = await fetch(
    path,
    body instanceof FormData
      ? { method: "POST", body }
      : body !== undefined
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
  );
  if (!r.ok) {
    let d;
    try {
      d = await r.json();
    } catch {
      d = { detail: r.statusText };
    }
    throw Error(
      typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail || d),
    );
  }
  return r.json();
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (id) => Number($(id).value);
function duration() {
  return state.media?.duration || 10;
}
function playhead() {
  return (state.media?.hasVideo ? video : audio).currentTime || 0;
}
function playbackElement() {
  return state.media?.hasVideo ? video : audio;
}
function pausePlayback() {
  video.pause();
  audio.pause();
}
function requireMedia() {
  if (!state.media) {
    toast("请先上传音频或视频", true);
    return false;
  }
  return true;
}
function formatTime(t) {
  t = Math.max(0, Number(t) || 0);
  const ms = Math.floor((t % 1) * 1000);
  const s = Math.floor(t) % 60,
    m = Math.floor(t / 60);
  return (
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "." +
    String(ms).padStart(3, "0")
  );
}
function snapshot() {
  return state.beats.map((b) => ({ ...b }));
}
function checkpoint() {
  state.past.push(snapshot());
  if (state.past.length > 100) state.past.shift();
  state.future = [];
}
function normalize(beats, maxDuration = duration()) {
  if (!Array.isArray(beats) || beats.length > 100000)
    throw Error("拍点数据必须为数组，最多 100000 个");
  return beats
    .map((b) => ({
      time: Number(typeof b === "number" ? b : b.time),
      strength: Number(typeof b === "number" ? 1 : (b.strength ?? 1)),
    }))
    .filter(
      (b) =>
        Number.isFinite(b.time) &&
        Number.isFinite(b.strength) &&
        b.time >= 0 &&
        b.time <= maxDuration,
    )
    .map((b) => ({
      time: Math.min(maxDuration, Math.round(b.time * 1000) / 1000),
      strength: clamp(b.strength, 0.1, 1),
    }))
    .sort((a, b) => a.time - b.time);
}
function changed() {
  state.beats.sort((a, b) => a.time - b.time);
  state.selected = clamp(state.selected, -1, state.beats.length - 1);
  $("beatCount").textContent = state.beats.length + " 拍";
  $("undo").disabled = !state.past.length;
  $("redo").disabled = !state.future.length;
  updateSelection();
  drawTimeline();
}
function replaceBeats(beats) {
  const validated = normalize(beats);
  checkpoint();
  state.beats = validated;
  state.selected = -1;
  changed();
}
function undo() {
  if (!state.past.length) return;
  state.future.push(snapshot());
  state.beats = state.past.pop();
  state.selected = -1;
  changed();
}
function redo() {
  if (!state.future.length) return;
  state.past.push(snapshot());
  state.beats = state.future.pop();
  state.selected = -1;
  changed();
}
function updateSelection() {
  const b = state.beats[state.selected];
  $("selectedLabel").textContent = b
    ? "拍点 #" + (state.selected + 1)
    : "未选择拍点";
  for (const id of ["beatTime", "beatStrength"]) $(id).disabled = !b;
  $("beatTime").value = b ? b.time.toFixed(3) : "";
  $("beatStrength").value = b ? b.strength.toFixed(2) : "";
  $("deleteBeat").disabled = !b;
}
function addBeat(t = playhead()) {
  if (!requireMedia()) return;
  t = clamp(t, 0, duration());
  if (state.beats.some((b) => Math.abs(b.time - t) < 0.025)) {
    toast("当前位置已有拍点");
    return;
  }
  checkpoint();
  const b = {
    time: Math.min(duration(), Math.round(t * 1000) / 1000),
    strength: 1,
  };
  state.beats.push(b);
  state.beats.sort((a, b) => a.time - b.time);
  state.selected = state.beats.indexOf(b);
  changed();
}
function removeBeat() {
  if (state.selected < 0) return;
  checkpoint();
  state.beats.splice(state.selected, 1);
  state.selected = -1;
  changed();
}
function seek(t) {
  if (!state.media) return;
  playbackElement().currentTime = clamp(t, 0, duration());
  lastTime = playhead();
  drawTimeline();
}
function updateBusy() {
  for (const id of [
    "analyze",
    "startExport",
    "openExport",
    "videoFile",
    "projectFile",
  ])
    $(id).disabled = state.busy || state.uploading;
  for (const cls of ["source-panel", "style-panel", "timeline-panel"])
    document.querySelector("." + cls).inert = state.busy || state.uploading;
  if (state.busy || state.uploading) {
    state.recording = false;
    updateRecord();
  }
}
async function upload(file) {
  if (!file || state.busy || state.uploading) return;
  state.uploading = true;
  updateBusy();
  pausePlayback();
  $("uploadTitle").textContent = "正在导入 " + file.name;
  $("uploadHint").textContent = "上传至本地服务并提取音频波形…";
  try {
    const body = new FormData();
    body.append("file", file);
    const m = await api("/api/media", body);
    setMedia(m);
    toast(
      (m.hasVideo ? "视频" : "音乐") + "已就绪" +
        (m.hasAudio ? "，可以开始识别音乐" : "；没有音轨，可以手动打点"),
    );
    if (state.pendingProject) {
      const p = state.pendingProject;
      state.pendingProject = null;
      applyProject(p);
    }
  } catch (e) {
    toast("导入失败：" + e.message, true);
    $("uploadTitle").textContent = "拖入音频或视频，开始创作";
  } finally {
    state.uploading = false;
    updateBusy();
    $("uploadHint").textContent = "点击可更换音频或视频";
    $("videoFile").value = "";
  }
}
function setMedia(m) {
  state.media = m;
  state.beats = [];
  state.past = [];
  state.future = [];
  state.selected = -1;
  state.recording = false;
  updateRecord();
  state.zoom = 1;
  $("zoomLabel").textContent = "1×";
  pausePlayback();
  if (m.hasVideo) {
    audio.removeAttribute("src");
    video.src = m.url;
    video.playbackRate = num("playbackRate");
  } else {
    video.removeAttribute("src");
    audio.src = m.url;
    audio.playbackRate = num("playbackRate");
  }
  $("stage").classList.toggle("audio-only", !m.hasVideo);
  $("stage").classList.add("has-media");
  $("emptyPreview").hidden = true;
  $("uploadTitle").textContent = m.name;
  $("mediaInfo").hidden = false;
  $("mediaInfo").textContent =
    (m.hasVideo ? m.width + " × " + m.height : "纯音频") +
    " · " + formatTime(m.duration) + " · " +
    (m.hasAudio ? "有音轨" : "无音轨");
  $("fillEnd").value = m.duration.toFixed(2);
  resizePreview();
  changed();
}
$("videoFile").onchange = (e) => upload(e.target.files[0]);
for (const event of ["dragover", "dragenter"])
  $("dropzone").addEventListener(event, (e) => {
    e.preventDefault();
    $("dropzone").classList.add("drag");
  });
for (const event of ["dragleave", "drop"])
  $("dropzone").addEventListener(event, (e) => {
    e.preventDefault();
    $("dropzone").classList.remove("drag");
    if (event === "drop") upload(e.dataTransfer.files[0]);
  });
async function togglePlay() {
  if (!requireMedia()) return;
  const player = playbackElement();
  if (player.paused) {
    try {
      if ($("metronome").checked) {
        audioContext ??= new AudioContext();
        await audioContext.resume();
      }
      await player.play();
    } catch {
      toast(state.media?.hasVideo ? "浏览器无法播放该视频编码，请转换为 H.264 MP4 后重试" : "浏览器无法播放该音频编码，请转换为 MP3、AAC 或 WAV 后重试", true);
    }
  } else player.pause();
}
$("playBtn").onclick = togglePlay;
for (const player of [video, audio]) {
  player.onplay = () => {
    $("playBtn").textContent = "Ⅱ";
    lastTime = player.currentTime;
  };
  player.onpause = () => ($("playBtn").textContent = "▶");
  player.onended = () => {
    $("playBtn").textContent = "▶";
    state.recording = false;
    updateRecord();
  };
  player.onerror = () => {
    if (state.media && (state.media.hasVideo ? video : audio) === player)
      toast(
        state.media.hasVideo
          ? "该视频可在后端处理，但浏览器无法预览其编码。建议使用 H.264 MP4。"
          : "浏览器无法预览该音频编码，请转换为 MP3、AAC 或 WAV。",
        true,
      );
  };
}
$("playbackRate").onchange = () => {
  video.playbackRate = num("playbackRate");
  audio.playbackRate = num("playbackRate");
};
$("frameBack").onclick = () => {
  pausePlayback();
  seek(playhead() - 1 / num("fps"));
};
$("frameNext").onclick = () => {
  pausePlayback();
  seek(playhead() + 1 / num("fps"));
};
function updateRecord() {
  $("recordBtn").textContent = state.recording
    ? "● 录制中 · 点击结束"
    : "● 开启打点录制";
  $("recordBtn").classList.toggle("recording", state.recording);
}
$("recordBtn").onclick = () => {
  if (requireMedia()) {
    state.recording = !state.recording;
    updateRecord();
    if (state.recording && playbackElement().paused) togglePlay();
  }
};
function tap() {
  if (!state.recording) {
    toast("请先开启打点录制");
    return;
  }
  addBeat(playhead() + num("latency") / 1000);
  $("tapBtn").animate([{ background: "#73974f" }, { background: "#263720" }], {
    duration: 150,
  });
}
$("tapBtn").onclick = tap;
$("inputTabs").onclick = (e) => {
  const tab = e.target.dataset.tab;
  if (!tab) return;
  for (const b of $("inputTabs").children)
    b.classList.toggle("active", b.dataset.tab === tab);
  $("autoPanel").hidden = tab !== "auto";
  $("manualPanel").hidden = tab !== "manual";
};
$("sensitivity").oninput = () =>
  ($("sensitivityValue").value = $("sensitivity").value);
async function startJob(path, payload, onDone, title) {
  if (state.busy || state.uploading) return;
  state.busy = true;
  updateBusy();
  $("jobPanel").hidden = false;
  $("jobTitle").textContent = title;
  $("jobProgress").value = 0;
  $("jobPercent").textContent = "0%";
  $("jobMessage").textContent = "准备任务…";
  $("cancelJob").disabled = false;
  try {
    const job = await api(path, payload);
    state.job = job.id;
    let pollFailures = 0;
    const poll = async () => {
      try {
        const j = await api("/api/jobs/" + state.job);
        pollFailures = 0;
        $("jobProgress").value = j.progress || 0;
        $("jobPercent").textContent = Math.round(j.progress || 0) + "%";
        $("jobMessage").textContent = j.message || "";
        if (j.status === "done") {
          finishJob();
          onDone(j.result);
        } else if (["error", "cancelled", "canceled"].includes(j.status)) {
          finishJob();
          toast(j.message || "任务已取消", j.status === "error");
        } else pollTimer = setTimeout(poll, 650);
      } catch (e) {
        pollFailures++;
        $("jobMessage").textContent =
          "连接中断，正在重试查询（" + pollFailures + "）…";
        if (state.job)
          pollTimer = setTimeout(poll, Math.min(10000, 1000 * pollFailures));
      }
    };
    poll();
  } catch (e) {
    finishJob();
    toast(e.message, true);
  }
}
function finishJob() {
  clearTimeout(pollTimer);
  state.job = null;
  state.busy = false;
  updateBusy();
  $("jobPanel").hidden = true;
}
$("cancelJob").onclick = async () => {
  if (!state.job) return;
  try {
    $("cancelJob").disabled = true;
    await api("/api/jobs/" + state.job + "/cancel", {});
    $("jobMessage").textContent = "正在取消…";
  } catch (e) {
    $("cancelJob").disabled = false;
    toast(e.message, true);
  }
};
$("analyze").onclick = () => {
  if (!requireMedia()) return;
  if (!state.media.hasAudio) {
    toast("视频没有音轨，请使用手动打点或等距填充", true);
    return;
  }
  if (
    !Number.isFinite(num("minInterval")) ||
    num("minInterval") < 0.08 ||
    num("minInterval") > 2
  ) {
    toast("最小间隔须为 0.08–2 秒", true);
    return;
  }
  const [lowHz, highHz] = $("band").value.split(",").map(Number);
  startJob(
    "/api/analyze",
    {
      mediaId: state.media.id,
      sensitivity: num("sensitivity"),
      minInterval: num("minInterval"),
      lowHz,
      highHz,
    },
    (result) => {
      replaceBeats(result.beats);
      if (result.bpm) $("bpm").value = Math.round(result.bpm);
      toast(
        "识别完成：" +
          state.beats.length +
          " 个拍点" +
          (result.bpm ? "，参考 BPM " + Math.round(result.bpm) : "") +
          "。可撤销恢复原拍点。",
      );
    },
    "正在分析音乐鼓点",
  );
};
$("fillBeats").onclick = () => {
  if (!requireMedia()) return;
  const bpm = num("bpm"),
    a = num("fillStart"),
    b = num("fillEnd");
  if (
    !Number.isFinite(bpm) ||
    bpm < 20 ||
    bpm > 400 ||
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a < 0 ||
    b <= a ||
    b > duration() + 0.01
  ) {
    toast("请设置有效 BPM（20–400）及视频范围内的起止时间", true);
    return;
  }
  const beats = state.beats.filter((p) => p.time < a || p.time > b);
  for (let t = a; t <= Math.min(b, duration()); t += 60 / bpm)
    beats.push({ time: t, strength: 1 });
  replaceBeats(beats);
  toast("已填充指定时段，可撤销");
};
$("undo").onclick = undo;
$("redo").onclick = redo;
$("addBeat").onclick = () => addBeat();
$("deleteBeat").onclick = removeBeat;
for (const id of ["beatTime", "beatStrength"])
  $(id).onchange = () => {
    const b = state.beats[state.selected];
    if (!b) return;
    const value = num(id);
    if (!Number.isFinite(value)) {
      updateSelection();
      return;
    }
    checkpoint();
    if (id === "beatTime") b.time = clamp(value, 0, duration());
    else b.strength = clamp(value, 0.1, 1);
    state.beats.sort((a, b) => a.time - b.time);
    state.selected = state.beats.indexOf(b);
    changed();
  };
$("applyOffset").onclick = () => {
  const offset = num("offsetMs") / 1000;
  if (!Number.isFinite(offset)) return;
  replaceBeats(state.beats.map((b) => ({ ...b, time: b.time + offset })));
  toast("已应用偏移，超出视频范围的拍点已移除，可撤销");
};
$("halfBeats").onclick = () =>
  replaceBeats(state.beats.filter((_, i) => i % 2 === 0));
$("clearBeats").onclick = () => {
  replaceBeats([]);
  toast("已清空拍点，可使用撤销恢复");
};
function timelineWidth() {
  return Math.max(1, $("timelineScroll").clientWidth) * state.zoom;
}
function timelineX(t) {
  return 18 + ((timelineWidth() - 36) * t) / duration();
}
function timelineTime(x) {
  return clamp(((x - 18) / (timelineWidth() - 36)) * duration(), 0, duration());
}
function sizeCanvas(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(w * dpr),
    ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function drawTimeline() {
  const w = timelineWidth(),
    h = 170,
    ctx = sizeCanvas(timeline, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#15191d";
  ctx.fillRect(0, 0, w, h);
  const desired = duration() / Math.max(2, w / 95);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => s >= desired) || 1200;
  ctx.font = "10px monospace";
  for (let t = 0; t <= duration(); t += step) {
    const x = timelineX(t);
    ctx.strokeStyle = "#2a3138";
    ctx.beginPath();
    ctx.moveTo(x, 29);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = "#707d86";
    ctx.fillText(formatTime(t).slice(0, -4), x + 3, 18);
  }
  const wave = state.media?.waveform || [];
  ctx.fillStyle = "#44594c";
  const mid = 97;
  const columns = Math.floor(w - 36);
  for (let x = 0; x < columns; x += 2) {
    const i = Math.floor((x / columns) * wave.length);
    const v = Number(wave[i]) || 0;
    const amp = Math.max(1, v * 43);
    ctx.fillRect(x + 18, mid - amp, 1.5, amp * 2);
  }
  for (let i = 0; i < state.beats.length; i++) {
    const b = state.beats[i],
      x = timelineX(b.time);
    ctx.strokeStyle = i === state.selected ? "#ffffff" : state.style.color;
    ctx.lineWidth = i === state.selected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 42);
    ctx.lineTo(x, 151);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, 34);
    ctx.lineTo(x + 5, 40);
    ctx.lineTo(x, 46);
    ctx.lineTo(x - 5, 40);
    ctx.closePath();
    ctx.fill();
  }
  const x = timelineX(playhead());
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e1e9ee";
  ctx.beginPath();
  ctx.moveTo(x, 24);
  ctx.lineTo(x, h);
  ctx.stroke();
  ctx.fillStyle = "#e1e9ee";
  ctx.beginPath();
  ctx.moveTo(x - 5, 24);
  ctx.lineTo(x + 5, 24);
  ctx.lineTo(x, 30);
  ctx.fill();
}
function zoom(value) {
  state.zoom = clamp(
    value,
    1,
    Math.min(16, 14000 / Math.max(1, $("timelineScroll").clientWidth)),
  );
  $("zoomLabel").textContent = state.zoom.toFixed(1).replace(".0", "") + "×";
  drawTimeline();
  const x = timelineX(playhead());
  $("timelineScroll").scrollLeft = Math.max(
    0,
    x - $("timelineScroll").clientWidth / 2,
  );
}
$("zoomIn").onclick = () => zoom(state.zoom * 2);
$("zoomOut").onclick = () => zoom(state.zoom / 2);
function pointerX(e) {
  return e.clientX - timeline.getBoundingClientRect().left;
}
timeline.onpointerdown = (e) => {
  if (!state.media) return;
  const x = pointerX(e);
  let nearest = -1,
    dist = 9;
  state.beats.forEach((b, i) => {
    const d = Math.abs(timelineX(b.time) - x);
    if (d < dist) {
      dist = d;
      nearest = i;
    }
  });
  state.selected = nearest;
  updateSelection();
  if (nearest >= 0) {
    drag = { beat: state.beats[nearest], startX: x, changed: false };
    timeline.setPointerCapture(e.pointerId);
  } else seek(timelineTime(x));
  drawTimeline();
};
timeline.onpointermove = (e) => {
  if (!drag) return;
  const x = pointerX(e);
  if (!drag.changed && Math.abs(x - drag.startX) < 3) return;
  if (!drag.changed) {
    checkpoint();
    drag.changed = true;
  }
  drag.beat.time = Math.min(
    duration(),
    Math.round(timelineTime(x) * 1000) / 1000,
  );
  state.beats.sort((a, b) => a.time - b.time);
  state.selected = state.beats.indexOf(drag.beat);
  updateSelection();
  drawTimeline();
};
function stopDrag() {
  if (drag) {
    drag = null;
    changed();
  }
}
timeline.onpointerup = stopDrag;
timeline.onpointercancel = stopDrag;
timeline.ondblclick = (e) => addBeat(timelineTime(pointerX(e)));
function outputSize() {
  if ($("resolution").value === "source") {
    const w = state.media?.width || 1280,
      h = state.media?.height || 720;
    const scale = Math.min(1, 1920 / Math.max(w, h));
    return [
      Math.max(2, Math.floor((w * scale) / 2) * 2),
      Math.max(2, Math.floor((h * scale) / 2) * 2),
    ];
  }
  return $("resolution").value.split(",").map(Number);
}
function resizePreview() {
  const [w, h] = outputSize();
  $("stage").style.aspectRatio = w + "/" + h;
  overlay.width = w;
  overlay.height = h;
  overlay.style.width = "100%";
  overlay.style.height = "100%";
}
function drawOverlay() {
  const ctx = overlay.getContext("2d"),
    w = overlay.width,
    h = overlay.height;
  ctx.clearRect(0, 0, w, h);
  if (!state.media) return;
  const s = state.style,
    bw = w * s.barWidth,
    left = (w - bw) / 2,
    y = h * s.position,
    bh = s.barHeight,
    mx = s.motion === "meet" ? left + bw / 2 : left + bw * s.marker;
  ctx.fillStyle = s.barColor;
  ctx.beginPath();
  ctx.roundRect(left, y - bh / 2, bw, bh, Math.min(6, bh / 3));
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y - bh / 2, bw, bh);
  ctx.clip();
  ctx.fillStyle = s.color;
  const time = playhead();
  for (const b of state.beats) {
    const delta = b.time - time;
    if (delta < -0.45 || delta > s.speed) continue;
    const r = bh * 0.3 * (0.55 + 0.45 * b.strength);
    let positions;
    if (s.motion === "meet") {
      if (delta >= 0) {
        const progress = 1 - delta / s.speed;
        positions = [left + r + progress * Math.max(0, mx - left - r), left + bw - r - progress * Math.max(0, left + bw - r - mx)];
      } else positions = [mx];
    } else if (s.motion === "left-right") {
      positions = [mx - (delta / s.speed) * bw * s.marker];
    } else {
      positions = [mx + (delta / s.speed) * bw * (1 - s.marker)];
    }
    for (const x of positions) {
      if (x < left - bh || x > left + bw + bh || delta < 0) continue;
      if (s.pattern === "custom" && customPattern) {
        const size = r * 2; ctx.drawImage(customPattern, x - size / 2, y - size / 2, size, size);
      } else {
        ctx.beginPath();
        if (s.pattern === "diamond") { ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath(); }
        else if (s.pattern === "triangle") { ctx.moveTo(x,y-r);ctx.lineTo(x+r,y+r);ctx.lineTo(x-r,y+r);ctx.closePath(); }
        else if (s.pattern === "star") { for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?r*0.46:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;if(k===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath(); }
        else if (s.pattern === "pill") ctx.roundRect(x-r,y-r*0.7,r*2,r*1.4,Math.max(1,r*0.7));
        else ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fill();
      }
    }
    const age = -delta;
    if (age >= 0 && age < 0.42 && s.hitEffect !== "none") {
      const progress=age/0.42,radius=r*(1+progress*3);ctx.globalAlpha=(1-progress)*(s.hitEffect==="ring"?0.85:0.3);ctx.beginPath();ctx.arc(mx,y,radius,0,Math.PI*2);
      if(s.hitEffect==="ring"){ctx.strokeStyle=s.color;ctx.lineWidth=Math.max(1,bh*0.045);ctx.stroke();}else{ctx.fillStyle=s.color;ctx.fill();}ctx.globalAlpha=1;
    }
  }
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(mx - 1, y - bh * 0.7, 2, bh * 1.4);
}
function syncStyle() {
  for (const key of ["color", "barColor"]) $(key).value = state.style[key];
  document.documentElement.style.setProperty("--accent", state.style.color);
  $("pattern").value = state.style.pattern;
  $("motion").value = state.style.motion;
  $("hitEffect").value = state.style.hitEffect;
  $("patternHint").textContent = state.style.patternImage ? "已载入自定义图案；会随项目保存。" : "PNG / JPG / WebP，最大 2 MB；随项目文件保存。";
  $("patternUploadLabel").textContent = state.style.patternImage ? "更换自定义图案" : "上传自定义图案";
  for (const key of ["position", "barWidth", "marker"])
    $(key).value = Math.round(state.style[key] * 100);
  for (const key of ["barHeight", "speed"]) $(key).value = state.style[key];
  for (const key of ["position", "barWidth", "marker"])
    $(key + "Value").value = $(key).value + "%";
  $("barHeightValue").value = state.style.barHeight + " px";
  $("speedValue").value = state.style.speed + " 秒";
  document
    .querySelectorAll("[data-color]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.color === state.style.color),
    );
  drawTimeline();
}
for (const key of ["color", "barColor", "position", "barWidth", "barHeight", "speed", "marker"])
  $(key).oninput = () => {
    state.style[key] = ["color", "barColor"].includes(key)
      ? $(key).value
      : num(key) / (["position", "barWidth", "marker"].includes(key) ? 100 : 1);
    syncStyle();
  };
for (const id of ["pattern", "motion", "hitEffect"])
  $(id).onchange = () => {
    if (id === "pattern" && $(id).value === "custom" && !state.style.patternImage) {
      $(id).value = state.style.pattern; toast("请先上传一张自定义图案", true); return;
    }
    state.style[id] = $(id).value; syncStyle();
  };
$("patternFile").onchange = async (event) => {
  const file = event.target.files[0];
  try {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error("请选择 PNG、JPG 或 WebP 图片");
    if (file.size > 2 * 1024 * 1024) throw Error("自定义图案不能超过 2 MB");
    const data = await new Promise((resolve, reject) => { const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file); });
    const image = new Image(); await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=data;});
    if(image.width>4096||image.height>4096)throw Error("图片边长不能超过 4096 px");
    state.style.patternImage=data;customPattern=image;state.style.pattern="custom";syncStyle();toast("自定义鼓点图案已应用");
  } catch(error){toast("图案上传失败："+error.message,true);} finally{event.target.value="";}
};
document.querySelectorAll("[data-color]").forEach(
  (b)
    (b.onclick = () => {
      state.style.color = b.dataset.color;
      syncStyle();
    }),
);
$("resetStyle").onclick = () => {
  state.style = { ...defaults };
  customPattern = null;
  syncStyle();
};
$("previewMode").onchange = () => {
  const mode = $("previewMode").value;
  $("stage").classList.toggle("green", mode === "green");
  $("stage").classList.toggle("transparent", mode === "transparent");
  video.style.opacity = mode === "composite" ? "1" : "0";
};
$("resolution").onchange = resizePreview;
function clickSound(strength) {
  if (!audioContext) return;
  const o = audioContext.createOscillator(),
    g = audioContext.createGain();
  o.frequency.value = 1000;
  o.connect(g);
  g.connect(audioContext.destination);
  g.gain.setValueAtTime(0.09 * strength, audioContext.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.045);
  o.start();
  o.stop(audioContext.currentTime + 0.05);
}
$("metronome").onchange = async () => {
  if ($("metronome").checked) {
    audioContext ??= new AudioContext();
    await audioContext.resume();
  }
};
let previousPaint = 0;
function animate(now) {
  drawOverlay();
  if (now - previousPaint > 33) {
    $("timeDisplay").innerHTML =
      formatTime(playhead()) +
      " <span>/ " +
      formatTime(state.media?.duration || 0) +
      "</span>";
    drawTimeline();
    previousPaint = now;
  }
  const t = playhead();
  if (
    !playbackElement().paused &&
    $("metronome").checked &&
    t >= lastTime &&
    t - lastTime < 0.2
  ) {
    const beat = state.beats.find((b) => b.time > lastTime && b.time <= t);
    if (beat) clickSound(beat.strength);
  }
  lastTime = t;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
$("openExport").onclick = () => {
  if (requireMedia()) $("exportDialog").showModal();
};
$("startExport").onclick = () => {
  if (!requireMedia()) return;
  if (!state.beats.length) {
    toast("请先添加拍点再导出", true);
    return;
  }
  const [width, height] = outputSize();
  const mode = document.querySelector("input[name=mode]:checked").value;
  $("exportDialog").close();
  pausePlayback();
  startJob(
    "/api/export",
    {
      mediaId: state.media.id,
      beats: snapshot(),
      style: { ...state.style },
      mode,
      width: Math.floor(width / 2) * 2,
      height: Math.floor(height / 2) * 2,
      fps: num("fps"),
      includeAudio: $("includeAudio").checked,
    },
    (result) => {
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.filename;
      a.textContent = "下载 " + result.filename;
      a.className = "button primary";
      const panel = $("downloads");
      panel.hidden = false;
      const row = document.createElement("div");
      row.className = "download-row";
      row.append(a);
      panel.prepend(row);
      toast("导出完成，请点击右下角下载视频");
    },
    "正在渲染 " + (mode === "transparent" ? "透明 WebM" : "MP4"),
  );
};
function download(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function project() {
  return {
    version: 1,
    media: state.media
      ? {
          id: state.media.id,
          name: state.media.name,
          duration: state.media.duration,
        }
      : null,
    beats: snapshot(),
    style: { ...state.style },
    bpm: num("bpm"),
  };
}
$("saveProject").onclick = () => {
  if (requireMedia()) download(project(), "beatbar-project.json");
};
$("exportBeats").onclick = () =>
  download({ version: 1, beats: snapshot() }, "beatbar-beats.json");
$("exportFunscript").onclick = () => {
  const actions = [];
  for (let i = 0; i < state.beats.length; i++) {
    const b = state.beats[i];
    const prev = i ? state.beats[i - 1].time : 0;
    actions.push(
      {
        at: Math.max(
          0,
          Math.round((b.time - Math.min(0.1, (b.time - prev) / 2)) * 1000),
        ),
        pos: 0,
      },
      { at: Math.round(b.time * 1000), pos: 100 },
    );
  }
  download(
    { version: "1.0", inverted: false, range: 100, actions },
    "beatbar.funscript",
  );
};
async function parseFile(file) {
  if (file.size > 20000000) throw Error("项目或拍点文件不可超过 20 MB");
  return JSON.parse(await file.text());
}
$("beatFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || state.busy || state.uploading || !requireMedia()) return;
  state.uploading = true;
  updateBusy();
  try {
    const data = await parseFile(file);
    let beats = data.beats ?? data;
    if (data.actions)
      beats = data.actions
        .filter((a) => a.pos >= 50)
        .map((a) => ({ time: a.at / 1000, strength: 1 }));
    replaceBeats(beats);
    toast("已导入 " + state.beats.length + " 个拍点，可撤销");
  } catch (err) {
    toast("导入失败：" + err.message, true);
  } finally {
    state.uploading = false;
    updateBusy();
    e.target.value = "";
  }
};
function applyProject(p) {
  if (!p || p.version !== 1 || !Array.isArray(p.beats))
    throw Error("不支持的项目格式");
  const style = { ...defaults };
  for (const key of ["color", "barColor"])
    if (/^#[0-9a-f]{6}$/i.test(p.style?.[key])) style[key] = p.style[key];
  const ranges = {
    position: [0.05, 0.95],
    barWidth: [0.2, 0.95],
    barHeight: [12, 120],
    speed: [1, 8],
    marker: [0.05, 0.5],
  };
  for (const [key, [a, b]] of Object.entries(ranges)) {
    const v = Number(p.style?.[key]);
    if (Number.isFinite(v)) style[key] = clamp(v, a, b);
  }
  if (["circle", "diamond", "triangle", "star", "pill", "custom"].includes(p.style?.pattern)) style.pattern = p.style.pattern;
  if (["right-left", "left-right", "meet"].includes(p.style?.motion)) style.motion = p.style.motion;
  if (["ring", "flash", "none"].includes(p.style?.hitEffect)) style.hitEffect = p.style.hitEffect;
  if (typeof p.style?.patternImage === "string" && p.style.patternImage.length <= 2_800_000 && /^data:image\/(png|jpeg|webp);base64,/.test(p.style.patternImage)) style.patternImage = p.style.patternImage;
  customPattern = null;
  if (style.patternImage) { customPattern = new Image(); customPattern.onload = drawOverlay; customPattern.src = style.patternImage; }
  replaceBeats(p.beats);
  state.style = style;
  syncStyle();
  if (Number.isFinite(p.bpm)) $("bpm").value = clamp(p.bpm, 20, 400);
  toast("项目已恢复");
}
$("projectFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || state.busy || state.uploading) return;
  state.uploading = true;
  state.pendingProject = null;
  pausePlayback();
  updateBusy();
  try {
    const p = await parseFile(file);
    if (p.version !== 1 || !Array.isArray(p.beats))
      throw Error("不支持的项目格式");
    normalize(
      p.beats,
      Number.isFinite(p.media?.duration) ? p.media.duration : Infinity,
    );
    if (p.media?.id) {
      try {
        const m = await api("/api/media/" + encodeURIComponent(p.media.id));
        setMedia(m);
        applyProject(p);
        return;
      } catch {
        /* source may have been removed */
      }
    }
    state.pendingProject = p;
    toast("项目已读取，请重新上传项目使用的原视频，上传后将恢复拍点和样式。");
  } catch (err) {
    toast("项目打开失败：" + err.message, true);
  } finally {
    state.uploading = false;
    updateBusy();
    e.target.value = "";
  }
};
$("closeDownloads").onclick = () => ($("downloads").hidden = true);
$("helpBtn").onclick = () => $("helpDialog").showModal();
$("closeHelp").onclick = () => $("helpDialog").close();
document.addEventListener("keydown", (e) => {
  const input =
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.target.isContentEditable;
  if (
    input ||
    state.busy ||
    state.uploading ||
    document.querySelector("dialog[open]")
  )
    return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "s") {
    e.preventDefault();
    $("saveProject").click();
    return;
  }
  if (ctrl && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if (e.repeat) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  }
  if (e.code === "KeyF") {
    e.preventDefault();
    tap();
  }
  if (e.code === "KeyA") {
    e.preventDefault();
    addBeat();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    removeBeat();
  }
  if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    const sign = e.key === "ArrowLeft" ? -1 : 1;
    const b = state.beats[state.selected];
    if (e.shiftKey && b) {
      checkpoint();
      b.time = clamp(b.time + sign * 0.01, 0, duration());
      state.beats.sort((a, b) => a.time - b.time);
      state.selected = state.beats.indexOf(b);
      changed();
    } else {
      pausePlayback();
      seek(playhead() + sign / num("fps"));
    }
  }
});
window.addEventListener("beforeunload", (e) => {
  if (state.beats.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
new ResizeObserver(() => {
  drawTimeline();
}).observe($("timelineScroll"));
api("/api/health")
  .then(() => {
    $("connection").textContent = "本地引擎已连接";
  })
  .catch(() => {
    $("connection").textContent = "本地引擎未连接";
    $("connection").classList.add("off");
    toast("本地服务未连接，请通过启动脚本打开页面", true);
  });
changed();
resizePreview();
