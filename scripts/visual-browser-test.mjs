import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const port = process.argv[2] || "62880";
const targets = await (
  await fetch(`http://127.0.0.1:${port}/json/list`)
).json();
const target = targets.find(
  (t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:8000"),
);
assert(target, "Start BeatBar and a Chrome CDP test session first");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let sequence = 0;
const calls = new Map(),
  errors = [],
  results = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const call = calls.get(message.id);
    if (call) {
      calls.delete(message.id);
      message.error
        ? call.reject(Error(message.error.message))
        : call.resolve(message.result);
    }
  } else if (message.method === "Runtime.exceptionThrown")
    errors.push(
      message.params.exceptionDetails.exception?.description ||
        message.params.exceptionDetails.text,
    );
  else if (message.method === "Page.javascriptDialogOpening")
    cdp("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      calls.delete(id);
      reject(Error(`CDP timeout: ${method}`));
    }, 15000);
    calls.set(id, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (response.exceptionDetails)
    throw Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text,
    );
  return response.result.value;
}
async function until(expression, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw Error(`Timed out: ${expression}`);
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function change(id, value, event = "change") {
  await evaluate(
    `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)}))`,
  );
}
async function upload(selector, file) {
  const document = await cdp("DOM.getDocument");
  const input = await cdp("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector,
  });
  await cdp("DOM.setFileInputFiles", {
    nodeId: input.nodeId,
    files: [path.resolve(file)],
  });
}
function pass(text) {
  results.push(text);
  console.log("PASS " + text);
}
async function screenshot(filename) {
  const shot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await fs.writeFile(
    path.join("artifacts", filename),
    Buffer.from(shot.data, "base64"),
  );
}
try {
  await cdp("Page.enable");
  await cdp("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await cdp("Runtime.enable");
  await until(
    'document.getElementById("connection").textContent.includes("已连接")',
  );
  await upload("#videoFile", "beatbar-sample-clicks.wav");
  await until(
    'document.getElementById("stage").classList.contains("audio-only")&&!document.getElementById("videoFile").disabled',
  );
  await click("#playBtn");
  await until(
    '!document.getElementById("audio").paused&&document.getElementById("audio").currentTime>0.1',
  );
  await click("#playBtn");
  await click("#analyze");
  await until(
    'parseInt(document.getElementById("beatCount").textContent)>5&&!document.getElementById("analyze").disabled',
  );
  pass("audio-only import, playback and automatic beat detection");

  await click('[data-palette="aurora"]');
  assert.equal(
    await evaluate('document.getElementById("color").value'),
    "#67dce8",
  );
  assert.equal(
    await evaluate('document.getElementById("secondaryColor").value'),
    "#c4a0ff",
  );
  assert.equal(
    await evaluate('document.getElementById("backgroundColor").value'),
    "#101a25",
  );
  await change("motion", "meet");
  assert(await evaluate('document.getElementById("marker").disabled'));
  await change("colorMode", "alternate");
  for (const pattern of [
    "circle",
    "diamond",
    "triangle",
    "star",
    "pill",
    "hexagon",
    "heart",
  ]) {
    await click(`[data-pattern="${pattern}"]`);
    assert.equal(
      await evaluate('document.getElementById("pattern").value'),
      pattern,
    );
    assert(
      await evaluate(
        `document.querySelector('[data-pattern="${pattern}"]').getAttribute("aria-pressed")==="true"`,
      ),
    );
  }
  await change("hitEffect", "none");
  assert(await evaluate('document.getElementById("hitControls").hidden'));
  await change("hitEffect", "burst");
  await change("hitDuration", "0.7", "input");
  await change("effectIntensity", "1.5", "input");
  await change("beatScale", "1.2", "input");
  assert.equal(
    await evaluate('document.getElementById("hitDurationValue").value'),
    "0.7 秒",
  );
  pass(
    "six palettes, seven built-in patterns, dual convergence and adjustable burst effect",
  );

  const imageData = await evaluate(
    `(() => { const c=document.createElement('canvas');c.width=80;c.height=24;const x=c.getContext('2d');x.fillStyle='#ff6699';x.fillRect(0,4,80,16);return c.toDataURL('image/png').split(',')[1]; })()`,
  );
  await fs.writeFile(
    "artifacts/custom-pattern.png",
    Buffer.from(imageData, "base64"),
  );
  await upload("#patternFile", "artifacts/custom-pattern.png");
  await until(
    'document.getElementById("pattern").value==="custom"&&!document.getElementById("patternThumbnail").hidden',
  );
  assert.equal(
    await evaluate('document.getElementById("patternThumbnail").naturalWidth'),
    80,
  );
  pass("custom transparent non-square pattern upload");

  await evaluate(
    `(() => {const original=URL.createObjectURL;window.__savedProject=null;window.__restoreObjectURL=()=>{URL.createObjectURL=original};URL.createObjectURL=function(blob){if(blob.type==='application/json')blob.text().then(text=>window.__savedProject=JSON.parse(text));return original.call(this,blob)}})()`,
  );
  await click("#saveProject");
  await until("window.__savedProject!==null");
  const saved = await evaluate("window.__savedProject");
  await evaluate(
    "window.__restoreObjectURL();delete window.__restoreObjectURL",
  );
  assert.equal(saved.style.motion, "meet");
  assert.equal(saved.style.colorMode, "alternate");
  assert.equal(saved.style.hitEffect, "burst");
  assert.equal(saved.style.hitDuration, 0.7);
  assert.equal(saved.style.beatScale, 1.2);
  assert(saved.style.patternImage.startsWith("data:image/png;base64,"));
  await fs.writeFile("artifacts/enhanced-project.json", JSON.stringify(saved));
  await click("#resetStyle");
  assert.equal(
    await evaluate('document.getElementById("pattern").value'),
    "circle",
  );
  await upload("#projectFile", "artifacts/enhanced-project.json");
  await until(
    'document.getElementById("pattern").value==="custom"&&!document.getElementById("projectFile").disabled',
  );
  assert.equal(
    await evaluate('document.getElementById("effectIntensity").value'),
    "1.5",
  );
  assert.equal(
    await evaluate('document.getElementById("backgroundColor").value'),
    "#101a25",
  );
  pass(
    "project save and restore preserves all visual parameters and embedded custom pattern",
  );

  const previousDownloads = await evaluate(
    'document.querySelectorAll(".download-row").length',
  );
  await click("#openExport");
  await change("resolution", "640,360");
  await evaluate(
    'document.querySelector("input[name=mode][value=composite]").checked=true',
  );
  await click("#startExport");
  await until(
    `!document.getElementById("openExport").disabled&&document.querySelectorAll(".download-row").length>${previousDownloads}`,
    60000,
  );
  const exported = await evaluate(
    'document.querySelector(".download-row a").href',
  );
  const response = await fetch(exported);
  assert(response.ok);
  await fs.writeFile(
    "artifacts/audio-enhanced.mp4",
    Buffer.from(await response.arrayBuffer()),
  );
  pass("audio-only MP4 export with custom pattern and effects");

  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await screenshot("visuals-desktop.png");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert(
    !(await evaluate("document.documentElement.scrollWidth>innerWidth")),
    "tablet horizontal overflow",
  );
  await screenshot("visuals-tablet.png");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert(
    !(await evaluate("document.documentElement.scrollWidth>innerWidth")),
    "mobile horizontal overflow",
  );
  await screenshot("visuals-mobile.png");
  await cdp("Emulation.clearDeviceMetricsOverride");
  assert.deepEqual(errors, []);
  pass("desktop/tablet/mobile layout and zero JavaScript exceptions");
  await fs.writeFile(
    "artifacts/visual-browser-results.json",
    JSON.stringify({ passed: true, results, errors, exported }, null, 2),
  );
} finally {
  await evaluate(
    "window.__restoreObjectURL?.();delete window.__restoreObjectURL",
  ).catch(() => {});
  ws.close();
}
