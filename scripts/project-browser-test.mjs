import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Run only against a disposable BeatBar data directory and dedicated CDP browser.
const base = process.env.BEATBAR_URL || "http://127.0.0.1:8000";
const targets = await (
  await fetch(`http://127.0.0.1:${process.argv[2] || 62880}/json/list`)
).json();
const target = targets.find((t) => t.type === "page" && t.url.startsWith(base));
assert(target, "Start BeatBar and its dedicated CDP browser first");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let serial = 0;
const pending = new Map(),
  errors = [],
  results = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error
      ? request.reject(Error(message.error.message))
      : request.resolve(message.result);
  } else if (message.method === "Runtime.exceptionThrown") {
    errors.push(
      message.params.exceptionDetails.exception?.description ||
        message.params.exceptionDetails.text,
    );
  } else if (message.method === "Page.javascriptDialogOpening") {
    cdp("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(Error("CDP timeout: " + method));
    }, 25000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function run(expression) {
  const value = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (value.exceptionDetails)
    throw Error(
      value.exceptionDetails.exception?.description ||
        value.exceptionDetails.text,
    );
  return value.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (
      typeof condition === "function" ? await condition() : await run(condition)
    )
      return;
    await sleep(80);
  }
  throw Error("Timeout: " + condition);
}
const click = (selector) =>
  run(`document.querySelector(${JSON.stringify(selector)}).click()`);
const change = (id, value, event = "change") =>
  run(
    `(()=>{const input=document.getElementById(${JSON.stringify(id)});${typeof value === "boolean" ? `input.checked=${value}` : `input.value=${JSON.stringify(String(value))}`};input.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`,
  );
async function api(endpoint, method = "GET", body) {
  const response = await fetch(base + endpoint, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  assert(response.ok, JSON.stringify(value));
  return value;
}
const activeId = () => run('localStorage.getItem("beatbar.activeProjectId")');
const ready = () =>
  until(
    'document.getElementById("connection")?.textContent.includes("已连接")&&!document.getElementById("newProject").disabled',
  );
async function reload() {
  const previous = await run("performance.timeOrigin");
  await cdp("Page.reload", { ignoreCache: true });
  await until(async () => {
    try {
      return await run(
        `performance.timeOrigin!==${previous}&&document.readyState==="complete"`,
      );
    } catch {
      return false; // Navigation can destroy the previous evaluation context.
    }
  });
  await ready();
}
async function saved() {
  await until(
    'document.getElementById("projectStatus").dataset.state==="saved"',
  );
  return api("/api/projects/" + (await activeId()));
}
async function manualSave() {
  await click("#saveProject");
  return saved();
}
async function upload(selector, file) {
  const doc = await cdp("DOM.getDocument");
  const node = await cdp("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector,
  });
  assert(node.nodeId, selector);
  await cdp("DOM.setFileInputFiles", {
    nodeId: node.nodeId,
    files: [path.resolve(file)],
  });
}
async function create(name) {
  await click("#newProject");
  await change("newProjectName", name, "input");
  await click('#newProjectForm button[type="submit"]');
  await until(
    `document.getElementById("projectName").value===${JSON.stringify(name)}&&!document.getElementById("newProject").disabled&&!document.getElementById("newProjectDialog").open`,
  );
  return activeId();
}
async function library() {
  await click("#manageProjects");
  await until(
    'document.getElementById("projectDialog").open&&!document.getElementById("projectListMessage").textContent.includes("正在")',
  );
}
async function open(id) {
  await library();
  await click(`button[data-action="open"][data-project-id="${id}"]`);
  await until(
    `localStorage.getItem("beatbar.activeProjectId")===${JSON.stringify(id)}&&!document.getElementById("newProject").disabled&&!document.getElementById("projectDialog").open`,
  );
}
async function snapshot() {
  await run(
    `(()=>{window.__projectCapture=null;const original=URL.createObjectURL;window.__restoreCapture=()=>URL.createObjectURL=original;URL.createObjectURL=function(blob){if(blob.type==='application/json')blob.text().then(text=>window.__projectCapture=JSON.parse(text));return original.call(this,blob)}})()`,
  );
  await click("#exportProject");
  await until("!!window.__projectCapture");
  const project = await run("window.__projectCapture");
  await run("window.__restoreCapture();delete window.__restoreCapture");
  return project;
}
function pass(message) {
  results.push(message);
  console.log("PASS " + message);
}
const prefix = "项目回归-" + Date.now();
let firstId, secondId;
try {
  await fs.mkdir("artifacts", { recursive: true });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await run('localStorage.removeItem("beatbar.activeProjectId")');
  await reload();
  firstId = await create(prefix + "-甲");
  await upload("#videoFile", "beatbar-sample-clicks.wav");
  await until(
    'document.getElementById("stage").classList.contains("audio-only")&&!document.getElementById("videoFile").disabled',
  );
  await change("bpm", 150);
  await click("#fillBeats");
  await change("barHeight", 62, "input");
  await change("analysisMode", "rhythm");
  await change("sensitivity", 42, "input");
  await change("playbackRate", "0.75");
  await click('#inputTabs [data-tab="manual"]');
  await click("#zoomIn");
  await click("#zoomIn");
  await run('document.getElementById("audio").currentTime=2.4');
  await click("#frameNext");
  await click("#addBeat");
  await click("#openExport");
  await change("resolution", "640,360");
  await change("fps", "24");
  await change("exportName", "project-output", "input");
  await click('input[name="mode"][value="green"]');
  await click('#exportDialog button[value="cancel"]');
  await manualSave();
  const original = await snapshot();
  const first = await api("/api/projects/" + firstId);
  assert(first.project.beats.length > 15);
  assert.equal(first.project.style.barHeight, 62);
  assert.equal(first.project.exportSettings.mode, "green");
  assert.equal(first.project.editorSettings.tab, "manual");
  assert(first.project.editorSettings.playhead > 2.4);
  pass(
    "manual save persists media, beats, style, output settings and editor position",
  );

  await change("projectName", prefix + "-甲改名", "input");
  await until(async () =>
    (await api("/api/projects/" + firstId)).name.endsWith("甲改名"),
  );
  assert.equal((await saved()).name, prefix + "-甲改名");
  pass(
    "project rename and edits automatically save without downloading a file",
  );

  await change("barHeight", 71, "input");
  const switchingSnapshot = await snapshot();
  secondId = await create(prefix + "-乙");
  assert.equal(
    (await api("/api/projects/" + firstId)).project.style.barHeight,
    71,
  );
  let empty = await snapshot();
  assert.equal(empty.media, null);
  assert.deepEqual(empty.beats, []);
  assert.equal(empty.editorSettings.tab, "auto");
  assert.equal(empty.editorSettings.zoom, 1);
  assert.equal(empty.exportSettings.filename, "beatbar");
  pass(
    "creating another project first saves pending changes and resets editor defaults",
  );

  await open(firstId);
  await until('document.getElementById("audio").readyState>=1');
  const restored = await snapshot();
  assert.deepEqual(restored.beats, switchingSnapshot.beats);
  assert.deepEqual(restored.style, switchingSnapshot.style);
  assert.deepEqual(restored.exportSettings, switchingSnapshot.exportSettings);
  const normalizedInputs = (inputs) =>
    Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [
        key,
        typeof value === "string" && Number.isFinite(Number(value))
          ? Number(value)
          : value,
      ]),
    );
  assert.deepEqual(
    normalizedInputs(restored.editorSettings.inputs),
    normalizedInputs(switchingSnapshot.editorSettings.inputs),
  );
  assert.equal(
    restored.editorSettings.tab,
    switchingSnapshot.editorSettings.tab,
  );
  assert.equal(
    restored.editorSettings.zoom,
    switchingSnapshot.editorSettings.zoom,
  );
  assert(
    Math.abs(
      restored.editorSettings.playhead -
        switchingSnapshot.editorSettings.playhead,
    ) < 0.04,
  );
  assert.equal(await run('document.getElementById("undo").disabled'), true);
  pass(
    "switching back restores settings, zoom and playhead without leaking undo history",
  );

  await manualSave();
  await reload();
  await until('document.getElementById("audio").readyState>=1');
  assert.equal(await activeId(), firstId);
  assert.equal(
    await run('document.getElementById("projectName").value'),
    prefix + "-甲改名",
  );
  assert.deepEqual((await snapshot()).beats, original.beats);
  pass("browser reload automatically resumes the last active project");

  await library();
  await change("projectSearch", prefix + "-乙", "input");
  assert.equal(
    await run('document.querySelectorAll(".project-row").length'),
    1,
  );
  await change("projectSearch", "", "input");
  await click(`button[data-action="duplicate"][data-project-id="${firstId}"]`);
  await until(
    `localStorage.getItem("beatbar.activeProjectId")!==${JSON.stringify(firstId)}&&!document.getElementById("newProject").disabled&&!document.getElementById("projectDialog").open`,
  );
  const copyId = await activeId();
  assert.deepEqual(
    (await api("/api/projects/" + copyId)).project.beats,
    original.beats,
  );
  await library();
  await click(`button[data-action="delete"][data-project-id="${copyId}"]`);
  await click("#cancelDeleteProject");
  assert((await api("/api/projects/" + copyId)).id === copyId);
  await click(`button[data-action="delete"][data-project-id="${copyId}"]`);
  await click("#confirmDeleteProject");
  await until(
    '!document.getElementById("deleteProjectDialog").open&&!document.getElementById("newProject").disabled',
  );
  assert.equal(await activeId(), null);
  await click("#closeProjects");
  assert.deepEqual((await snapshot()).beats, []);
  pass(
    "project library supports search, independent copies, delete cancellation and deletion",
  );

  await open(firstId);
  const beforeFailure = await snapshot();
  await run(
    `window.__originalFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/projects')&&options?.method==='PUT'?Promise.resolve(new Response(JSON.stringify({detail:'模拟磁盘写入失败'}),{status:500,headers:{'Content-Type':'application/json'}})):window.__originalFetch(url,options)`,
  );
  await change("barHeight", 83, "input");
  await createFailure();
  assert.equal(await activeId(), firstId);
  assert.equal((await snapshot()).style.barHeight, 83);
  assert.equal(
    (await api("/api/projects/" + firstId)).project.style.barHeight,
    beforeFailure.style.barHeight,
  );
  assert.equal(
    await run('document.getElementById("projectStatus").dataset.state'),
    "error",
  );
  await run(
    "window.fetch=window.__originalFetch;delete window.__originalFetch",
  );
  await click("#cancelNewProject");
  await manualSave();
  pass(
    "failed save blocks switching and retains the current unsaved editor content",
  );

  const unlinked = await api("/api/projects", "POST", {
    name: prefix + "-待关联素材",
    project: { ...beforeFailure, media: null },
  });
  await open(unlinked.id);
  assert.deepEqual((await snapshot()).beats, beforeFailure.beats);
  await upload("#videoFile", "beatbar-sample-clicks.wav");
  await until(
    'document.getElementById("stage").classList.contains("audio-only")&&!document.getElementById("videoFile").disabled',
  );
  assert.deepEqual((await snapshot()).beats, beforeFailure.beats);
  const linked = await saved();
  assert.equal(linked.id, unlinked.id);
  assert(linked.project.media?.id);
  assert.deepEqual(linked.project.beats, beforeFailure.beats);
  pass(
    "attaching the first source to a media-free project preserves beats through autosave",
  );

  const missing = await api("/api/projects", "POST", {
    name: prefix + "-缺失素材",
    project: {
      ...beforeFailure,
      media: { id: "f".repeat(32), name: "missing-original.wav", duration: 8 },
    },
  });
  await open(missing.id);
  assert.equal(
    await run('document.getElementById("missingMedia").hidden'),
    false,
  );
  assert.deepEqual((await snapshot()).beats, beforeFailure.beats);
  await manualSave();
  assert.equal(
    (await api("/api/projects/" + missing.id)).project.exportSettings
      .includeAudio,
    true,
  );
  await upload("#videoFile", "beatbar-sample-clicks.wav");
  await until(
    'document.getElementById("missingMedia").hidden&&document.getElementById("stage").classList.contains("audio-only")&&!document.getElementById("videoFile").disabled',
  );
  assert.deepEqual((await snapshot()).beats, beforeFailure.beats);
  pass(
    "missing source retains beats and settings, and re-upload reconnects the project",
  );

  const invalidFile = "artifacts/project-invalid-import.json";
  await fs.writeFile(invalidFile, JSON.stringify({ version: 2, beats: [] }));
  const priorId = await activeId();
  await upload("#projectFile", invalidFile);
  await until(
    'document.getElementById("toast").textContent.includes("不支持的项目格式")',
  );
  assert.equal(await activeId(), priorId);
  assert.deepEqual((await snapshot()).beats, beforeFailure.beats);
  pass("invalid project import leaves the active project and edits intact");

  await manualSave();
  const backup = await snapshot();
  await fs.writeFile(
    "artifacts/project-roundtrip.json",
    JSON.stringify(backup),
  );
  await upload("#projectFile", "artifacts/project-roundtrip.json");
  await until(
    `localStorage.getItem("beatbar.activeProjectId")!==${JSON.stringify(priorId)}&&!document.getElementById("projectFile").disabled`,
  );
  assert.deepEqual((await snapshot()).beats, backup.beats);
  pass(
    "JSON export and import remain compatible with the local project library",
  );

  await cdp("Page.captureScreenshot", { format: "png" }).then((r) =>
    fs.writeFile(
      "artifacts/project-desktop.png",
      Buffer.from(r.data, "base64"),
    ),
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await library();
  await until(
    'document.getElementById("projectDialog").getBoundingClientRect().width>100',
  );
  assert(
    await run("document.documentElement.scrollWidth<=innerWidth+1"),
    "mobile document must not overflow horizontally",
  );
  assert(
    await run(
      'document.getElementById("projectDialog").scrollWidth<=document.getElementById("projectDialog").clientWidth+1',
    ),
    "mobile project library must not overflow horizontally",
  );
  await cdp("Page.captureScreenshot", { format: "png" }).then((r) =>
    fs.writeFile("artifacts/project-mobile.png", Buffer.from(r.data, "base64")),
  );
  await click("#closeProjects");
  assert.deepEqual(errors, []);
  pass(
    "desktop and narrow-screen project UI renders without overflow or runtime errors",
  );
} finally {
  await run(
    'window.fetch=window.__originalFetch||window.fetch;document.querySelectorAll("dialog[open]").forEach(d=>d.close())',
  ).catch(() => {});
  ws.close();
  await fs.writeFile(
    "artifacts/project-browser-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
}
console.log(`${results.length} project browser checks passed`);

async function createFailure() {
  await click("#newProject");
  await change("newProjectName", prefix + "-失败不应创建", "input");
  await click('#newProjectForm button[type="submit"]');
  await until(
    '!document.getElementById("newProject").disabled&&document.getElementById("toast").textContent.includes("项目操作未完成")',
  );
}
