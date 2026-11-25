import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const targets = await (
  await fetch(`http://127.0.0.1:${process.argv[2] || 62880}/json/list`)
).json();
const target = targets.find(
  (t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:8000"),
);
assert(target, "Start BeatBar and its dedicated CDP browser first");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
let id = 0,
  pageLoaded = false;
const pending = new Map(),
  errors = [],
  results = [];
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id) {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.j(Error(m.error.message)) : p.r(m.result);
    }
  } else if (m.method === "Runtime.exceptionThrown")
    errors.push(
      m.params.exceptionDetails.exception?.description ||
        m.params.exceptionDetails.text,
    );
  else if (m.method === "Page.javascriptDialogOpening")
    cdp("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  else if (m.method === "Page.loadEventFired") pageLoaded = true;
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id,
      t = setTimeout(() => {
        pending.delete(n);
        reject(Error("CDP timeout: " + method));
      }, 20000);
    pending.set(n, {
      r: (v) => {
        clearTimeout(t);
        resolve(v);
      },
      j: (e) => {
        clearTimeout(t);
        reject(e);
      },
    });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function run(expression) {
  const r = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(expression, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (typeof expression === "function" ? expression() : await run(expression))
      return;
    await sleep(100);
  }
  throw Error("Timeout: " + expression);
}
const click = (s) =>
  run(`document.querySelector(${JSON.stringify(s)}).click()`);
const change = (s, v, event = "change") =>
  run(
    `document.getElementById(${JSON.stringify(s)}).value=${JSON.stringify(String(v))};document.getElementById(${JSON.stringify(s)}).dispatchEvent(new Event(${JSON.stringify(event)}));`,
  );
async function upload(s, file) {
  const d = await cdp("DOM.getDocument"),
    n = await cdp("DOM.querySelector", { nodeId: d.root.nodeId, selector: s });
  await cdp("DOM.setFileInputFiles", {
    nodeId: n.nodeId,
    files: [path.resolve(file)],
  });
}
const rect = (s) =>
  run(
    `(()=>{const r=document.querySelector(${JSON.stringify(s)}).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()`,
  );
async function mouse(type, x, y, extra = {}) {
  await cdp("Input.dispatchMouseEvent", { type, x, y, ...extra });
}
async function drag(x, y, toX, toY, button = "left") {
  await mouse("mousePressed", x, y, {
    button,
    buttons: button === "left" ? 1 : 4,
    clickCount: 1,
  });
  for (let i = 1; i <= 6; i++)
    await mouse(
      "mouseMoved",
      x + ((toX - x) * i) / 6,
      y + ((toY - y) * i) / 6,
      { button, buttons: button === "left" ? 1 : 4 },
    );
  await mouse("mouseReleased", toX, toY, { button, buttons: 0, clickCount: 1 });
}
async function savedProject() {
  await run(
    `(()=>{const original=URL.createObjectURL;window.__projectCapture=null;window.__restoreStudioURL=()=>{URL.createObjectURL=original;};URL.createObjectURL=function(blob){if(blob.type==='application/json')blob.text().then(t=>window.__projectCapture=JSON.parse(t));return original.call(this,blob);};})()`,
  );
  await click("#saveProject");
  await until("!!window.__projectCapture");
  const p = await run("window.__projectCapture");
  await run("window.__restoreStudioURL();delete window.__restoreStudioURL");
  return p;
}
function pass(s) {
  console.log("PASS " + s);
  results.push(s);
}
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  pageLoaded = false;
  await cdp("Page.reload", { ignoreCache: true });
  await until(() => pageLoaded);
  await until(
    'document.getElementById("connection")?.textContent.includes("已连接")',
  );
  await upload("#videoFile", "beatbar-sample-clicks.wav");
  await until(
    'document.getElementById("stage").classList.contains("audio-only")&&!document.getElementById("videoFile").disabled',
  );
  await change("analysisMode", "rhythm");
  await click("#analyze");
  await until(
    'parseInt(document.getElementById("beatCount").textContent)>5&&!document.getElementById("analyze").disabled',
  );
  const initial = await savedProject();
  assert(initial.beats.every((b) => Number.isFinite(b.loudnessDb)));
  assert(initial.beats.length >= 14);
  pass("rhythm analysis returns measured dBFS for every beat");
  await run(
    'document.getElementById("timeline").scrollIntoView({block:"center"})',
  );
  const box = await rect("#timelineScroll"),
    x = box.x + box.width * 0.34,
    y = box.y + 16;
  const before = await run(
    `(()=>{const s=document.getElementById('timelineScroll'),z=parseFloat(document.getElementById('zoomLabel').textContent);return (s.scrollLeft+${x - box.x}-18)/(s.clientWidth*z-36)*8;})()`,
  );
  await mouse("mouseWheel", x, y, { deltaX: 0, deltaY: -260 });
  await sleep(180);
  const anchor = await run(
    `(()=>{const s=document.getElementById('timelineScroll'),z=parseFloat(document.getElementById('zoomLabel').textContent);return {t:(s.scrollLeft+${x - box.x}-18)/(s.clientWidth*z-36)*8,z,canvas:document.getElementById('timeline').width,w:s.clientWidth,scroll:s.scrollLeft};})()`,
  );
  assert(anchor.z > 2);
  assert(Math.abs(before - anchor.t) < 0.09, "zoom must preserve cursor time");
  assert(
    anchor.canvas <= anchor.w * 2 + 2,
    "canvas allocation must stay viewport-sized",
  );
  const from = box.x + box.width * 0.3,
    to = box.x + box.width * 0.7;
  await drag(from, y, to, y);
  const scrubbed = await run('document.getElementById("audio").currentTime');
  assert(scrubbed > anchor.t + 0.3);
  pass(
    "wheel zoom anchors under cursor; ruler/playhead drags continuously; canvas stays viewport-sized",
  );
  await mouse("mouseWheel", x, y, { deltaX: 0, deltaY: 180, modifiers: 8 });
  await sleep(100);
  const pan1 = await run(
    'document.getElementById("timelineScroll").scrollLeft',
  );
  assert(pan1 > anchor.scroll);
  await drag(
    box.x + box.width * 0.6,
    box.y + 85,
    box.x + box.width * 0.45,
    box.y + 85,
    "middle",
  );
  assert(
    (await run('document.getElementById("timelineScroll").scrollLeft')) > pan1,
  );
  pass("Shift wheel and middle-button dragging pan the timeline");
  await click("#zoomFit");
  assert.equal(
    await run('document.getElementById("zoomLabel").textContent'),
    "1×",
  );
  const b = await rect("#timelineScroll"),
    beat = initial.beats[3];
  const sx = b.x + 18 + (beat.time / 8) * (b.width - 36);
  await drag(sx, b.y + 95, sx + 28, b.y + 95);
  const moved = await savedProject();
  assert(
    moved.beats.some(
      (v) =>
        Math.abs(v.time - beat.time) > 0.001 &&
        Math.abs(v.time - (beat.time + (28 / (b.width - 36)) * 8)) < 0.03,
    ),
  );
  await click("#undo");
  const undone = await savedProject();
  assert.deepEqual(undone.beats, initial.beats);
  pass("beat dragging changes time and one undo restores its exact metadata");
  await click("#snapTimeline");
  await run('document.getElementById("timeline").focus()');
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Home",
    code: "Home",
  });
  assert.equal(await run('document.getElementById("audio").currentTime'), 0);
  await click("#nextBeat");
  assert(
    Math.abs(
      (await run('document.getElementById("audio").currentTime')) -
        initial.beats[0].time,
    ) < 0.03,
  );
  pass("timeline keyboard and previous/next beat navigation");
  await change("trackType", "converge");
  assert.equal(await run('document.getElementById("pattern").value'), "bar");
  assert(
    await run(
      'document.getElementById("motion").disabled&&document.getElementById("marker").disabled',
    ),
  );
  await change("colorMode", "loudness");
  assert(!(await run('document.getElementById("loudnessControls").hidden')));
  await change("dbFloor", "-52");
  await change("dbCeiling", "-9");
  const sample = await run(
    `(()=>{const c=document.createElement('canvas');c.width=18;c.height=64;const x=c.getContext('2d');x.fillStyle='#fc55b5';x.fillRect(4,0,10,64);return c.toDataURL().split(',')[1];})()`,
  );
  await fs.writeFile(
    "artifacts/custom-marker.png",
    Buffer.from(sample, "base64"),
  );
  await upload("#markerFile", "artifacts/custom-marker.png");
  await until('document.getElementById("markerPattern").value==="custom"');
  await change("markerScale", "1.35", "input");
  await change("exportName", "我的节奏-成片");
  const enhanced = await savedProject();
  assert.equal(enhanced.style.trackType, "converge");
  assert.equal(enhanced.style.colorMode, "loudness");
  assert.equal(enhanced.style.dbFloor, -52);
  assert.equal(enhanced.style.markerScale, 1.35);
  assert(enhanced.style.markerImage.startsWith("data:image/png;base64,"));
  assert.equal(enhanced.exportSettings.filename, "我的节奏-成片");
  await fs.writeFile("artifacts/studio-project.json", JSON.stringify(enhanced));
  await click("#resetStyle");
  await upload("#projectFile", "artifacts/studio-project.json");
  await until(
    'document.getElementById("trackType").value==="converge"&&!document.getElementById("projectFile").disabled',
  );
  assert.equal(
    await run('document.getElementById("markerScale").value'),
    "1.35",
  );
  assert.equal(await run('document.getElementById("dbCeiling").value'), "-9");
  pass(
    "new converging bars, dB color controls and independent custom marker survive project round-trip",
  );
  // A controlled browser handle exercises app save behavior without an interactive OS dialog.
  await run(
    `window.__saveCalls=[];window.__saveData=[];window.__exportPosts=0;window.__nativeFetch=fetch;window.fetch=function(input,...rest){if(String(input).endsWith('/api/export'))window.__exportPosts++;return window.__nativeFetch.call(this,input,...rest);};window.__picker=window.showSaveFilePicker;window.showSaveFilePicker=async opts=>{window.__saveCalls.push(opts);return{name:'用户自定-片段.mp4',createWritable:async()=>new WritableStream({write(chunk){window.__saveData.push(chunk.byteLength);}})};};`,
  );
  await click("#openExport");
  await change("saveLocation", "choose");
  await change("resolution", "640,360");
  await click("#startExport");
  await until(
    'document.querySelector(".download-row small")?.textContent.startsWith("已保存")',
    60000,
  );
  assert.equal(
    await run("window.__saveCalls[0].suggestedName"),
    "我的节奏-成片.mp4",
  );
  assert(await run("window.__saveData.reduce((a,b)=>a+b,0)>1000"));
  assert(
    (await run('document.querySelector(".download-row a").download')).includes(
      "用户自定-片段.mp4",
    ),
  );
  const url = await run('document.querySelector(".download-row a").href');
  const res = await fetch(url);
  assert(res.ok);
  assert(res.headers.get("content-disposition").includes("filename*="));
  await fs.writeFile(
    "artifacts/studio-converge.mp4",
    Buffer.from(await res.arrayBuffer()),
  );
  pass(
    "custom Unicode filename, streamed save handle and downloadable MP4 with custom marker",
  );
  const posts = await run("window.__exportPosts");
  await run(
    `window.showSaveFilePicker=async()=>{throw new DOMException('cancelled','AbortError');}`,
  );
  await click("#openExport");
  await click("#startExport");
  await sleep(150);
  assert.equal(await run("window.__exportPosts"), posts);
  assert(await run('document.getElementById("exportDialog").open'));
  pass("cancelling the save picker starts no export job");
  await click("#exportDialog [value=cancel]");
  for (const width of [1600, 1000, 390]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width === 390,
    });
    await sleep(100);
    assert(
      !(await run("document.documentElement.scrollWidth>innerWidth")),
      `horizontal overflow at ${width}`,
    );
    const shot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await fs.writeFile(
      `artifacts/studio-${width}.png`,
      Buffer.from(shot.data, "base64"),
    );
  }
  assert.deepEqual(errors, []);
  pass(
    "desktop/tablet/mobile layouts and zero unhandled JavaScript exceptions",
  );
  await fs.writeFile(
    "artifacts/studio-browser-results.json",
    JSON.stringify({ passed: true, results, errors }, null, 2),
  );
} finally {
  await run(
    "window.__restoreStudioURL?.();if(window.__nativeFetch)window.fetch=window.__nativeFetch;if(window.__picker)window.showSaveFilePicker=window.__picker;",
  ).catch(() => {});
  await cdp("Emulation.clearDeviceMetricsOverride").catch(() => {});
  ws.close();
}
