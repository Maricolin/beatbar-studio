import { DEFAULT_STYLE, PALETTES, PATTERNS, drawTrack } from "./visuals.js";
import { createTimeline } from "./timeline.js";
import { exportFilename, createExportDestination } from "./export.js";
import { createProjectManager } from "./projects.js";

const $ = (id) => document.getElementById(id);
const video = $("video"),
  audio = $("audio"),
  timeline = $("timeline"),
  overlay = $("overlay");
const defaults = DEFAULT_STYLE;
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
let projectManager;
let toastTimer,
  customPattern = null,
  customMarker = null,
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
    const error = Error(
      typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail || d),
    );
    error.status = r.status;
    throw error;
  }
  return r.json();
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (id) => Number($(id).value);
function duration() {
  return state.media?.duration || state.pendingProject?.media?.duration || 10;
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
      ...(typeof b !== "number" && Number.isFinite(b.loudnessDb)
        ? { loudnessDb: clamp(b.loudnessDb, -120, 6) }
        : {}),
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
      ...(Number.isFinite(b.loudnessDb) ? { loudnessDb: b.loudnessDb } : {}),
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
  projectManager?.changed();
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
  $("beatLoudness").textContent = b
    ? Number.isFinite(b.loudnessDb)
      ? b.loudnessDb.toFixed(1) + " dBFS"
      : "手工强度"
    : "";
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
  projectManager?.changed();
}
function updateBusy() {
  for (const id of [
    "analyze",
    "startExport",
    "openExport",
    "videoFile",
    "projectFile",
    "saveProject",
    "newProject",
    "manageProjects",
    "exportProject",
    "projectName",
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
    const pending = state.pendingProject ? project() : null;
    if (pending) {
      const prepared = await prepareProject(
        { ...pending, media: { id: m.id, name: m.name, duration: m.duration } },
        m,
      );
      restoreProject(prepared);
    } else setMedia(m);
    projectManager?.changed();
    toast(
      (m.hasVideo ? "视频" : "音乐") +
        "已就绪" +
        (m.hasAudio ? "，可以开始识别音乐" : "；没有音轨，可以手动打点"),
    );
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
  state.pendingProject = null;
  $("missingMedia").hidden = true;
  state.beats = [];
  state.past = [];
  state.future = [];
  state.selected = -1;
  state.recording = false;
  updateRecord();
  timelineEditor.reset();
  $("exportName").value = m.name.replace(/\.[^.]+$/, "") + "-beatbar";
  updateExportName();
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
  $("uploadHint").textContent = "点击可更换音频或视频";
  $("mediaInfo").hidden = false;
  $("mediaInfo").textContent =
    (m.hasVideo ? m.width + " × " + m.height : "纯音频") +
    " · " +
    formatTime(m.duration) +
    " · " +
    (m.hasAudio ? "有音轨" : "无音轨");
  $("fillEnd").value = m.duration.toFixed(2);
  resizePreview();
  syncStyle();
  $("includeAudio").disabled = !m.hasAudio;
  $("includeAudio").checked = m.hasAudio;
  $("resolution").options[0].textContent = m.hasVideo
    ? "跟随原视频（最长边 1920）"
    : "音频画布 · 1280 × 720";
  $("mediaMode").textContent = m.hasVideo
    ? m.hasAudio
      ? "视频 + 音轨"
      : "无音轨视频 · 手动打点"
    : "纯音乐 · 节奏画布";
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
      toast(
        state.media?.hasVideo
          ? "浏览器无法播放该视频编码，请转换为 H.264 MP4 后重试"
          : "浏览器无法播放该音频编码，请转换为 MP3、AAC 或 WAV 后重试",
        true,
      );
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
      mode: $("analysisMode").value,
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
    toast("请设置有效 BPM（20–400）及素材范围内的起止时间", true);
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
  toast("已应用偏移，超出素材范围的拍点已移除，可撤销");
};
$("halfBeats").onclick = () =>
  replaceBeats(state.beats.filter((_, i) => i % 2 === 0));
$("clearBeats").onclick = () => {
  replaceBeats([]);
  toast("已清空拍点，可使用撤销恢复");
};
const timelineEditor = createTimeline({
  canvas: timeline,
  scroll: $("timelineScroll"),
  getDuration: duration,
  getTime: playhead,
  seek,
  getBeats: () => state.beats,
  getSelected: () => state.selected,
  setSelected: (i) => {
    state.selected = i;
    projectManager?.changed();
  },
  checkpoint,
  changed,
  updateSelection,
  getStyle: () => state.style,
  getWaveform: () => state.media?.waveform || [],
  getBpm: () => num("bpm"),
  hasMedia: () => !!state.media,
  formatTime,
  addBeat,
  pause: pausePlayback,
  isPlaying: () => !playbackElement().paused,
  onZoom: (value) => {
    $("zoomLabel").textContent = value.toFixed(1).replace(".0", "") + "×";
    state.zoom = value;
    projectManager?.changed();
  },
});
function drawTimeline() {
  timelineEditor.draw();
}
$("zoomIn").onclick = () => timelineEditor.zoom(timelineEditor.getZoom() * 1.5);
$("zoomOut").onclick = () =>
  timelineEditor.zoom(timelineEditor.getZoom() / 1.5);
$("zoomFit").onclick = () => timelineEditor.fit();
$("centerPlayhead").onclick = () => timelineEditor.center();
$("previousBeat").onclick = () => timelineEditor.previous();
$("nextBeat").onclick = () => timelineEditor.next();
$("snapTimeline").onchange = () =>
  timelineEditor.setSnap($("snapTimeline").checked);
$("followTimeline").onchange = () =>
  timelineEditor.setFollow($("followTimeline").checked);
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
  if (!state.media.hasVideo && $("previewMode").value === "composite") {
    ctx.fillStyle = state.style.backgroundColor;
    ctx.fillRect(0, 0, w, h);
  }
  drawTrack(
    ctx,
    w,
    h,
    state.beats,
    playhead(),
    state.style,
    customPattern,
    customMarker,
  );
}
const colorKeys = [
  "color",
  "secondaryColor",
  "barColor",
  "backgroundColor",
  "markerColor",
];
const percentKeys = ["position", "barWidth", "marker"];
const numericKeys = [
  ...percentKeys,
  "barHeight",
  "speed",
  "beatScale",
  "hitDuration",
  "effectIntensity",
  "markerScale",
];
function renderStyleChoices() {
  for (const palette of PALETTES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.palette = palette.id;
    button.title = palette.name;
    button.innerHTML = `<span class="palette-colors"><i></i><i></i><i></i></span><span>${palette.name}</span>`;
    [palette.color, palette.secondaryColor, palette.backgroundColor].forEach(
      (color, index) =>
        (button.querySelectorAll("i")[index].style.background = color),
    );
    button.onclick = () => {
      for (const key of colorKeys)
        if (palette[key]) state.style[key] = palette[key];
      syncStyle();
    };
    $("palettes").append(button);
  }
  for (const pattern of PATTERNS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pattern = pattern.id;
    button.title = pattern.name;
    button.innerHTML = `<b>${pattern.icon}</b><span>${pattern.name}</span>`;
    button.onclick = () => {
      if (pattern.id === "custom" && !customPattern) {
        $("patternFile").click();
        return;
      }
      state.style.pattern = pattern.id;
      syncStyle();
    };
    $("patternChoices").append(button);
  }
}
function syncStyle() {
  for (const key of colorKeys) $(key).value = state.style[key];
  document.documentElement.style.setProperty("--accent", state.style.color);
  for (const key of [
    "pattern",
    "motion",
    "hitEffect",
    "colorMode",
    "trackType",
    "markerPattern",
  ])
    $(key).value = state.style[key];
  $("patternHint").textContent = state.style.patternImage
    ? "图案已载入，原始比例与透明度会保留，并随项目保存。"
    : "PNG / JPG / WebP，最大 2 MB、边长 4096 px。";
  $("patternUploadLabel").textContent = state.style.patternImage
    ? "更换自定义图案"
    : "上传自定义图案";
  $("patternThumbnail").hidden = !state.style.patternImage;
  if (state.style.patternImage)
    $("patternThumbnail").src = state.style.patternImage;
  else $("patternThumbnail").removeAttribute("src");
  for (const key of numericKeys)
    $(key).value = percentKeys.includes(key)
      ? Math.round(state.style[key] * 100)
      : state.style[key];
  for (const key of percentKeys) $(key + "Value").value = $(key).value + "%";
  for (const [key, suffix] of Object.entries({
    barHeight: " px",
    speed: " 秒",
    beatScale: "×",
    hitDuration: " 秒",
    effectIntensity: "×",
    markerScale: "×",
  }))
    $(key + "Value").value = state.style[key] + suffix;
  const meet =
    state.style.motion === "meet" || state.style.trackType === "converge";
  $("motion").disabled = state.style.trackType === "converge";
  $("loudnessControls").hidden = state.style.colorMode !== "loudness";
  $("dbFloor").value = state.style.dbFloor;
  $("dbCeiling").value = state.style.dbCeiling;
  $("markerThumbnail").hidden = !state.style.markerImage;
  if (state.style.markerImage)
    $("markerThumbnail").src = state.style.markerImage;
  else $("markerThumbnail").removeAttribute("src");
  $("marker").disabled = meet;
  $("markerValue").value = meet ? "居中 · 50%" : $("marker").value + "%";
  $("motionHint").textContent = meet
    ? "每一拍从两侧同时出发，在中心准时相遇。"
    : "鼓点到达命中线的瞬间，对应时间轴上的拍点。";
  $("backgroundField").hidden = !!state.media?.hasVideo;
  $("hitControls").hidden = state.style.hitEffect === "none";
  for (const b of document.querySelectorAll("[data-palette]")) {
    const palette = PALETTES.find((p) => p.id === b.dataset.palette);
    const selected = colorKeys.every(
      (key) => !palette[key] || palette[key] === state.style[key],
    );
    b.classList.toggle("selected", selected);
    b.setAttribute("aria-pressed", selected);
  }
  for (const b of document.querySelectorAll("[data-pattern]")) {
    const selected = b.dataset.pattern === state.style.pattern;
    b.classList.toggle("selected", selected);
    b.setAttribute("aria-pressed", selected);
  }
  document
    .querySelectorAll("[data-color]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.color === state.style.color),
    );
  drawTimeline();
  drawOverlay();
  projectManager?.changed();
}
for (const key of [...colorKeys, ...numericKeys])
  $(key).oninput = () => {
    state.style[key] = colorKeys.includes(key)
      ? $(key).value
      : num(key) / (percentKeys.includes(key) ? 100 : 1);
    syncStyle();
  };
for (const id of [
  "pattern",
  "motion",
  "hitEffect",
  "colorMode",
  "trackType",
  "markerPattern",
])
  $(id).onchange = () => {
    if (id === "pattern" && $(id).value === "custom" && !customPattern) {
      $(id).value = state.style.pattern;
      $("patternFile").click();
      return;
    }
    if (id === "markerPattern" && $(id).value === "custom" && !customMarker) {
      $(id).value = state.style.markerPattern;
      $("markerFile").click();
      return;
    }
    state.style[id] = $(id).value;
    if (id === "trackType" && state.style.trackType === "converge") {
      state.style.motion = "meet";
      state.style.pattern = "bar";
    }
    syncStyle();
  };
async function loadPattern(data) {
  if (
    typeof data !== "string" ||
    data.length > 2_800_000 ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(data)
  )
    throw Error("自定义图案必须为 2 MB 以内的 PNG、JPG 或 WebP");
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(Error("无法解码图案图片"));
    image.src = data;
  });
  if (
    !image.naturalWidth ||
    image.naturalWidth > 4096 ||
    image.naturalHeight > 4096
  )
    throw Error("图片边长不能超过 4096 px");
  return image;
}
for (const id of ["dbFloor", "dbCeiling"])
  $(id).onchange = () => {
    const value = num(id);
    if (!Number.isFinite(value)) {
      syncStyle();
      return;
    }
    state.style[id] =
      id === "dbFloor"
        ? clamp(value, -96, Math.min(-6, state.style.dbCeiling - 1))
        : clamp(value, Math.max(-24, state.style.dbFloor + 1), 0);
    syncStyle();
  };
async function uploadPattern(event, marker = false) {
  const file = event.target.files[0];
  if (!file || state.busy || state.uploading) return;
  state.uploading = true;
  updateBusy();
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
      throw Error("请选择 PNG、JPG 或 WebP 图片");
    if (file.size > 2 * 1024 * 1024) throw Error("自定义图案不能超过 2 MB");
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
    const image = await loadPattern(data);
    if (marker) {
      state.style.markerImage = data;
      customMarker = image;
      state.style.markerPattern = "custom";
    } else {
      state.style.patternImage = data;
      customPattern = image;
      state.style.pattern = "custom";
    }
    syncStyle();
    toast(marker ? "自定义命中标记已应用" : "自定义鼓点图案已应用");
  } catch (error) {
    toast("图案上传失败：" + error.message, true);
  } finally {
    event.target.value = "";
    state.uploading = false;
    updateBusy();
  }
}
$("patternFile").onchange = (event) => uploadPattern(event);
$("markerFile").onchange = (event) => uploadPattern(event, true);
document.querySelectorAll("[data-color]").forEach(
  (b) =>
    (b.onclick = () => {
      state.style.color = b.dataset.color;
      syncStyle();
    }),
);
$("resetStyle").onclick = () => {
  state.style = { ...defaults };
  customPattern = null;
  customMarker = null;
  syncStyle();
};
$("previewMode").onchange = () => {
  const mode = $("previewMode").value;
  $("stage").classList.toggle("green", mode === "green");
  $("stage").classList.toggle("transparent", mode === "transparent");
  video.style.opacity = mode === "composite" ? "1" : "0";
  drawOverlay();
};
$("resolution").onchange = resizePreview;
const demoBeats = Array.from({ length: 10 }, (_, i) => ({
  time: i * 0.75,
  strength: [1, 0.65, 0.85, 0.5][i % 4],
  loudnessDb: [-8, -24, -16, -40][i % 4],
}));
function drawStyleDemo(now) {
  const canvas = $("stylePreview"),
    ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = state.style.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const time = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 1.5
    : ((now / 1000) % 3) + 1.5;
  drawTrack(
    ctx,
    canvas.width,
    canvas.height,
    demoBeats,
    time,
    { ...state.style, position: 0.5, barHeight: 30, barWidth: 0.9 },
    customPattern,
    customMarker,
  );
}
renderStyleChoices();
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
  drawStyleDemo(now);
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
const exportDestination = createExportDestination({
  location: $("saveLocation"),
  choose: $("chooseExportDirectory"),
  note: $("saveLocationNote"),
  toast,
});
function updateExportName() {
  const mode = document.querySelector("input[name=mode]:checked").value;
  $("exportFilenameHint").textContent =
    "将保存为：" + exportFilename($("exportName").value, mode);
}
$("exportName").oninput = updateExportName;
for (const input of document.querySelectorAll("input[name=mode]"))
  input.onchange = updateExportName;
$("openExport").onclick = () => {
  if (requireMedia()) {
    updateExportName();
    $("exportDialog").showModal();
  }
};
$("startExport").onclick = async () => {
  if (!requireMedia() || state.busy) return;
  if (!state.beats.length) {
    toast("请先添加拍点再导出", true);
    return;
  }
  const [width, height] = outputSize(),
    mode = document.querySelector("input[name=mode]:checked").value;
  const filename = exportFilename($("exportName").value, mode);
  let plan;
  try {
    plan = await exportDestination.prepare(filename, mode);
  } catch (error) {
    if (error.name !== "AbortError")
      toast("无法选择保存位置：" + error.message, true);
    return;
  }
  $("exportDialog").close();
  pausePlayback();
  startJob(
    "/api/export",
    {
      mediaId: state.media.id,
      beats: snapshot(),
      style: { ...state.style },
      mode,
      filename: plan.filename,
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
      const panel = $("downloads"),
        row = document.createElement("div");
      panel.hidden = false;
      row.className = "download-row";
      row.append(a);
      panel.prepend(row);
      if (plan.handle || plan.directory) {
        const status = document.createElement("small");
        status.textContent = "正在保存到所选位置…";
        row.append(status);
        exportDestination
          .save(result, plan)
          .then((name) => {
            status.textContent = "已保存：" + name;
            toast("导出并保存完成：" + name);
          })
          .catch((error) => {
            status.textContent = "保存未完成，可点击下载重试";
            toast(
              "保存失败：" + error.message + "；渲染结果仍在下载列表中。",
              true,
            );
          });
      } else toast("导出完成，请点击右下角下载视频");
    },
    "正在渲染 " + (mode === "transparent" ? "透明 WebM" : "MP4"),
  );
};
updateExportName();
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
      : state.pendingProject?.media || null,
    beats: snapshot(),
    style: { ...state.style },
    bpm: num("bpm"),
    exportSettings: {
      filename: $("exportName").value,
      resolution: $("resolution").value,
      fps: num("fps"),
      mode: document.querySelector("input[name=mode]:checked").value,
      includeAudio: state.pendingProject
        ? state.pendingProject.exportSettings?.includeAudio !== false
        : $("includeAudio").checked,
    },
    editorSettings: {
      inputs: Object.fromEntries(
        projectInputIds.map((id) => [
          id,
          $(id).type === "checkbox" ? $(id).checked : $(id).value,
        ]),
      ),
      tab: document.querySelector("#inputTabs .active").dataset.tab,
      playhead: state.media
        ? playhead()
        : state.pendingProject?.editorSettings?.playhead || 0,
      zoom: timelineEditor.getZoom(),
      scrollLeft: $("timelineScroll").scrollLeft,
      selected: state.selected,
    },
  };
}
$("exportProject").onclick = () =>
  download(
    project(),
    ($("projectName").value.trim() || "beatbar-project") + ".json",
  );
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
async function prepareProject(p, knownMedia) {
  if (!p || p.version !== 1 || !Array.isArray(p.beats))
    throw Error("不支持的项目格式");
  const beats = normalize(
    p.beats,
    Number.isFinite(p.media?.duration) ? p.media.duration : 1200,
  );
  const style = { ...defaults };
  for (const key of colorKeys)
    if (/^#[0-9a-f]{6}$/i.test(p.style?.[key])) style[key] = p.style[key];
  const ranges = {
    position: [0.05, 0.95],
    barWidth: [0.2, 0.95],
    barHeight: [12, 120],
    speed: [1, 8],
    marker: [0.05, 0.5],
    hitDuration: [0.15, 1.2],
    effectIntensity: [0.25, 2],
    beatScale: [0.5, 1.5],
    markerScale: [0.5, 2],
    dbFloor: [-96, -6],
    dbCeiling: [-24, 0],
  };
  for (const [key, [a, b]] of Object.entries(ranges)) {
    const v = Number(p.style?.[key]);
    if (Number.isFinite(v)) style[key] = clamp(v, a, b);
  }
  if (PATTERNS.some((pattern) => pattern.id === p.style?.pattern))
    style.pattern = p.style.pattern;
  if (["right-left", "left-right", "meet"].includes(p.style?.motion))
    style.motion = p.style.motion;
  if (["ring", "flash", "burst", "none"].includes(p.style?.hitEffect))
    style.hitEffect = p.style.hitEffect;
  if (
    typeof p.style?.patternImage === "string" &&
    p.style.patternImage.length <= 2_800_000 &&
    /^data:image\/(png|jpeg|webp);base64,/.test(p.style.patternImage)
  )
    style.patternImage = p.style.patternImage;
  if (
    ["solid", "alternate", "strength", "loudness"].includes(p.style?.colorMode)
  )
    style.colorMode = p.style.colorMode;
  if (["classic", "converge"].includes(p.style?.trackType))
    style.trackType = p.style.trackType;
  if (
    ["line", "circle", "diamond", "star", "heart", "custom"].includes(
      p.style?.markerPattern,
    )
  )
    style.markerPattern = p.style.markerPattern;
  if (style.dbCeiling <= style.dbFloor) style.dbFloor = style.dbCeiling - 1;
  if (typeof p.style?.markerImage === "string")
    style.markerImage = p.style.markerImage;
  const markerImage = style.markerImage
    ? await loadPattern(style.markerImage)
    : null;
  if (style.markerPattern === "custom" && !markerImage)
    throw Error("项目缺少命中标记图片");
  const image = style.patternImage
    ? await loadPattern(style.patternImage)
    : null;
  if (style.pattern === "custom" && !image)
    throw Error("项目缺少自定义鼓点图案");
  let media = knownMedia || null;
  if (!media && p.media?.id) {
    try {
      media = await api("/api/media/" + encodeURIComponent(p.media.id));
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  return { p, style, image, markerImage, beats, media };
}
const projectInputIds = [
  "sensitivity",
  "band",
  "minInterval",
  "analysisMode",
  "latency",
  "fillStart",
  "fillEnd",
  "offsetMs",
  "playbackRate",
  "metronome",
  "snapTimeline",
  "followTimeline",
  "previewMode",
];
const initialProjectInputs = Object.fromEntries(
  projectInputIds.map((id) => [
    id,
    $(id).type === "checkbox" ? $(id).checked : $(id).value,
  ]),
);
function clearMedia() {
  pausePlayback();
  state.media = null;
  state.pendingProject = null;
  for (const player of [video, audio]) {
    player.removeAttribute("src");
    player.load();
  }
  $("stage").classList.remove("has-media", "audio-only");
  $("emptyPreview").hidden = false;
  $("mediaInfo").hidden = true;
  $("uploadTitle").textContent = "拖入音频或视频，开始创作";
  $("uploadHint").textContent = "单独上传音乐，或导入视频";
  $("mediaMode").textContent = "音乐 / 视频 · 单文件导入";
  $("missingMedia").hidden = true;
  $("includeAudio").disabled = true;
  $("includeAudio").checked = false;
  timelineEditor.reset();
}
function restoreProject({ p, style, image, markerImage, beats, media }) {
  pausePlayback();
  if (media) setMedia(media);
  else {
    clearMedia();
    state.pendingProject = p;
    if (p.media) {
      $("missingMedia").textContent =
        "找不到原素材「" +
        (p.media.name || "未命名素材") +
        "」。拍点和样式已保留，请在“媒体与节奏”中上传原素材以继续编辑和预览。";
      $("missingMedia").hidden = false;
      $("uploadHint").textContent = "请重新关联原音频或视频";
    }
  }
  customPattern = image;
  customMarker = markerImage;
  state.beats = beats;
  state.past = [];
  state.future = [];
  state.selected = -1;
  state.recording = false;
  updateRecord();
  state.style = style;
  $("bpm").value = Number.isFinite(p.bpm) ? clamp(p.bpm, 20, 400) : 120;
  $("resolution").value = "source";
  $("fps").value = "30";
  $("exportName").value =
    typeof p.exportSettings?.filename === "string"
      ? p.exportSettings.filename.slice(0, 100)
      : media
        ? media.name.replace(/\.[^.]+$/, "") + "-beatbar"
        : "beatbar";
  if (
    [...$("resolution").options].some(
      (o) => o.value === p.exportSettings?.resolution,
    )
  )
    $("resolution").value = p.exportSettings.resolution;
  if ([24, 30, 60].includes(p.exportSettings?.fps))
    $("fps").value = p.exportSettings.fps;
  const mode = ["composite", "green", "transparent"].includes(
    p.exportSettings?.mode,
  )
    ? p.exportSettings.mode
    : "composite";
  document.querySelector(`input[name=mode][value="${mode}"]`).checked = true;
  $("includeAudio").checked =
    !!media?.hasAudio && p.exportSettings?.includeAudio !== false;
  for (const id of projectInputIds) {
    const input = $(id),
      value =
        p.editorSettings?.inputs?.[id] ??
        (id === "fillEnd"
          ? media?.duration || p.media?.duration || 10
          : initialProjectInputs[id]);
    if (input.type === "checkbox")
      input.checked =
        typeof value === "boolean" ? value : initialProjectInputs[id];
    else if (input.tagName === "SELECT")
      input.value = [...input.options].some((o) => o.value === String(value))
        ? String(value)
        : initialProjectInputs[id];
    else if (Number.isFinite(Number(value)))
      input.value = clamp(
        Number(value),
        input.min === "" ? -Infinity : Number(input.min),
        Math.min(
          input.max === "" ? Infinity : Number(input.max),
          id === "fillEnd" && media ? media.duration : Infinity,
        ),
      );
    else input.value = initialProjectInputs[id];
  }
  $("sensitivityValue").value = $("sensitivity").value;
  const tab = p.editorSettings?.tab === "manual" ? "manual" : "auto";
  for (const button of $("inputTabs").children)
    button.classList.toggle("active", button.dataset.tab === tab);
  $("autoPanel").hidden = tab !== "auto";
  $("manualPanel").hidden = tab !== "manual";
  video.playbackRate = audio.playbackRate = num("playbackRate");
  $("previewMode").onchange();
  timelineEditor.setSnap($("snapTimeline").checked);
  timelineEditor.setFollow($("followTimeline").checked);
  timelineEditor.zoom(
    Number.isFinite(p.editorSettings?.zoom) ? p.editorSettings.zoom : 1,
  );
  $("timelineScroll").scrollLeft = Number.isFinite(p.editorSettings?.scrollLeft)
    ? Math.max(0, p.editorSettings.scrollLeft)
    : 0;
  if (Number.isInteger(p.editorSettings?.selected))
    state.selected = clamp(p.editorSettings.selected, -1, beats.length - 1);
  if (media) {
    const player = playbackElement(),
      time = clamp(Number(p.editorSettings?.playhead) || 0, 0, media.duration);
    if (player.readyState >= 1) player.currentTime = time;
    else
      player.addEventListener(
        "loadedmetadata",
        () => {
          if (state.media === media) {
            player.currentTime = time;
            drawTimeline();
          }
        },
        { once: true },
      );
  }
  changed();
  syncStyle();
  updateExportName();
  resizePreview();
}
$("projectFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || state.busy || state.uploading) return;
  try {
    await projectManager.importProject(
      parseFile(file),
      file.name.replace(/\.json$/i, ""),
    );
  } catch (error) {
    toast("项目打开失败：" + error.message, true);
  } finally {
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
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (!state.busy && !state.uploading && !projectManager?.isSwitching())
      $("saveProject").click();
    return;
  }
  if (
    input ||
    state.busy ||
    state.uploading ||
    document.querySelector("dialog[open]")
  )
    return;
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
  if (projectManager?.hasUnsavedChanges() || state.busy || state.uploading) {
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
syncStyle();

projectManager = createProjectManager({
  capture: project,
  prepare: prepareProject,
  restore: restoreProject,
  isBusy: () => state.busy || state.uploading,
  setLoading: (value) => {
    state.uploading = value;
    pausePlayback();
    updateBusy();
  },
  toast,
});
for (const event of ["input", "change"])
  document.addEventListener(event, (e) => {
    if (
      e.target.closest(".studio-grid, #exportDialog") &&
      e.target.id !== "saveLocation" &&
      e.target.type !== "file"
    )
      projectManager.changed();
  });
$("inputTabs").addEventListener("click", () => projectManager.changed());
for (const player of [video, audio])
  player.addEventListener("pause", () => projectManager.changed());
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "hidden" &&
    projectManager.hasUnsavedChanges() &&
    !state.uploading &&
    !state.busy
  )
    projectManager.save({ silent: true }).catch(() => {});
});
$("timelineScroll").addEventListener(
  "scroll",
  () => {
    if (playbackElement().paused) projectManager.changed();
  },
  { passive: true },
);
projectManager.init();
