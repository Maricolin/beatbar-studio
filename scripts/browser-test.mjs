import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const port = process.argv[2] || "62880";
const targets = await (
  await fetch("http://127.0.0.1:" + port + "/json/list")
).json();
const target = targets.find(
  (x) =>
    x.type === "page" &&
    x.url.startsWith("http://127.0.0.1:8000") &&
    (!process.argv[3] || x.id === process.argv[3]),
);
assert(target, "BeatBar browser target is required");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let id = 0;
const calls = new Map(),
  errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = calls.get(m.id);
    calls.delete(m.id);
    if (m.error) p.reject(Error(m.error.message));
    else p.resolve(m.result);
  } else if (m.method === "Runtime.exceptionThrown")
    errors.push(
      m.params.exceptionDetails.exception?.description ||
        m.params.exceptionDetails.text,
    );
  else if (m.method === "Page.javascriptDialogOpening")
    cdp("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => {
      calls.delete(n);
      reject(Error("CDP timed out: " + method));
      ws.close();
    }, 15000);
    calls.set(n, {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression) {
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
async function until(expression, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw Error("Timed out: " + expression);
}
async function click(selector) {
  await evaluate(
    "document.querySelector(" + JSON.stringify(selector) + ").click()",
  );
}
await cdp("Page.enable");
await cdp("Page.reload", { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 300));
await cdp("Runtime.enable");
await until(
  'document.getElementById("connection").textContent.includes("已连接")',
);
const root = await cdp("DOM.getDocument");
const input = await cdp("DOM.querySelector", {
  nodeId: root.root.nodeId,
  selector: "#videoFile",
});
await cdp("DOM.setFileInputFiles", {
  nodeId: input.nodeId,
  files: [path.resolve("artifacts/sample-120bpm.mp4")],
});
await until(
  'document.getElementById("mediaInfo").textContent.includes("1280")&&!document.getElementById("videoFile").disabled',
);
console.log("PASS video upload + waveform ready");
await click("#analyze");
await until(
  'parseInt(document.getElementById("beatCount").textContent)>5&&!document.getElementById("analyze").disabled',
);
const count = await evaluate(
  'parseInt(document.getElementById("beatCount").textContent)',
);
console.log("PASS audio analysis: " + count + " beats");
await click("#addBeat");
await until(
  'parseInt(document.getElementById("beatCount").textContent)===' + (count + 1),
);
await evaluate(
  'document.getElementById("beatTime").value="0.1";document.getElementById("beatTime").dispatchEvent(new Event("change"))',
);
assert.equal(
  await evaluate('document.getElementById("beatTime").value'),
  "0.100",
);
await click("#deleteBeat");
await click("#undo");
assert.equal(
  await evaluate('parseInt(document.getElementById("beatCount").textContent)'),
  count + 1,
);
console.log("PASS manual add, precise edit, delete + undo");
await click('[data-tab="manual"]');
await click("#recordBtn");
await until('!document.getElementById("video").paused');
await evaluate('document.getElementById("video").currentTime=1.05');
await click("#tapBtn");
await click("#recordBtn");
await evaluate('document.getElementById("video").pause()');
console.log("PASS manual recording + video playback");
await click('[data-color="#67dce8"]');
await evaluate(
  'document.getElementById("previewMode").value="transparent";document.getElementById("previewMode").dispatchEvent(new Event("change"))',
);
assert(
  await evaluate(
    'document.getElementById("stage").classList.contains("transparent")',
  ),
);
for (const mode of ["green", "transparent", "composite"]) {
  const previousDownloads = await evaluate(
    'document.querySelectorAll(".download-row").length',
  );
  await click("#openExport");
  await evaluate(
    'document.querySelector("input[name=mode][value=' +
      mode +
      ']").checked=true;document.getElementById("resolution").value="640,360";document.getElementById("resolution").dispatchEvent(new Event("change"))',
  );
  await click("#startExport");
  await until(
    '!document.getElementById("openExport").disabled&&document.querySelectorAll(".download-row").length===' +
      (previousDownloads + 1),
    60000,
  );
  console.log("PASS " + mode + " export + repeated export UI");
}
const downloads = await evaluate(
  'Array.from(document.querySelectorAll(".download-row a")).map(a=>({href:a.href,name:a.download}))',
);
for (const d of downloads) {
  const r = await fetch(d.href);
  assert(r.ok);
  const b = Buffer.from(await r.arrayBuffer());
  assert(b.length > 1000);
  await fs.writeFile(path.join("artifacts", d.name), b);
}
console.log("PASS all downloads are readable media files");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false,
});
const shot = await cdp("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
});
await fs.writeFile(
  "artifacts/editor-tested.png",
  Buffer.from(shot.data, "base64"),
);
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await new Promise((r) => setTimeout(r, 200));
const overflow = await evaluate(
  "document.documentElement.scrollWidth>window.innerWidth",
);
assert(!overflow, "Mobile page must not horizontally overflow");
const mobile = await cdp("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
});
await fs.writeFile(
  "artifacts/editor-mobile.png",
  Buffer.from(mobile.data, "base64"),
);
await cdp("Emulation.clearDeviceMetricsOverride");
assert.deepEqual(errors, []);
await fs.writeFile(
  "artifacts/browser-results.json",
  JSON.stringify(
    {
      passed: true,
      detectedBeats: count,
      downloads,
      errors,
      mobileOverflow: overflow,
    },
    null,
    2,
  ),
);
console.log("PASS responsive 390px layout and zero JavaScript exceptions");
ws.close();
