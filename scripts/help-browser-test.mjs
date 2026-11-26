import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Use a disposable BEATBAR_DATA_DIR service and a dedicated CDP browser.
const base = process.env.BEATBAR_URL || "http://127.0.0.1:8000";
const targets = await (
  await fetch(`http://127.0.0.1:${process.argv[2] || 62880}/json/list`)
).json();
const target = targets.find(
  (item) => item.type === "page" && item.url.startsWith(base),
);
assert(target, "Start the dedicated BeatBar test browser first");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let serial = 0;
let failCatalog = false;
const pending = new Map();
const errors = [];
const results = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error
      ? request.reject(Error(message.error.message))
      : request.resolve(message.result);
  } else if (message.method === "Runtime.exceptionThrown")
    errors.push(
      message.params.exceptionDetails.exception?.description ||
        message.params.exceptionDetails.text,
    );
  else if (message.method === "Page.javascriptDialogOpening")
    cdp("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  else if (message.method === "Fetch.requestPaused") {
    const { requestId } = message.params;
    if (failCatalog) {
      failCatalog = false;
      cdp("Fetch.fulfillRequest", {
        requestId,
        responseCode: 503,
        body: Buffer.from("Test unavailable").toString("base64"),
      }).catch(() => {});
    } else cdp("Fetch.continueRequest", { requestId }).catch(() => {});
  }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error("CDP timeout: " + method));
    }, 25000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function run(expression) {
  const value = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
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
async function until(condition, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (
        typeof condition === "function"
          ? await condition()
          : await run(condition)
      )
        return;
    } catch (error) {
      if (!/context|Cannot find/i.test(error.message)) throw error;
    }
    await sleep(80);
  }
  throw Error("Timeout: " + condition);
}
const click = (selector) =>
  run(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function navigate(url) {
  const old = await run("performance.timeOrigin");
  await cdp("Page.navigate", { url });
  await until(
    `performance.timeOrigin!==${old}&&document.readyState==='complete'`,
  );
}
async function article(id) {
  await until(
    `document.getElementById('article')?.dataset.doc===${JSON.stringify(id)}&&document.getElementById('article').querySelector('h1')`,
  );
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
function pass(name, details = {}) {
  results.push({ name, passed: true, ...details });
  console.log("PASS " + name);
}
try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await navigate(base + "/");
  await until(
    "document.getElementById('connection')?.textContent.includes('已连接')&&!document.getElementById('newProject').disabled",
  );
  const previousProject = await run(
    "localStorage.getItem('beatbar.activeProjectId')",
  );
  const link = await run(
    "(()=>{const a=document.getElementById('learningLink');return {url:a.href,target:a.target,rel:a.rel}})()",
  );
  assert.equal(link.url, base + "/help.html");
  assert.equal(link.target, "_blank");
  assert(link.rel.includes("noopener"));
  await navigate(link.url);
  await article("README");
  assert.equal(await run("document.querySelectorAll('#docsNav a').length"), 11);
  assert.equal(
    await run("localStorage.getItem('beatbar.activeProjectId')"),
    previousProject,
  );
  pass(
    "Separate learning entry loads eleven local chapters and preserves active project",
  );

  const catalog = await (await fetch(base + "/learning/catalog.json")).json();
  for (const entry of catalog.documents) {
    await click(`#docsNav a[data-doc="${entry.id}"]`);
    await article(entry.id);
    assert.equal(
      await run("document.querySelectorAll('#article h1').length"),
      1,
    );
    const text = await run("document.getElementById('article').textContent");
    assert(text.length > 300, entry.id);
  }
  pass("All eleven chapters render including large AST tables");
  await click('#docsNav a[data-doc="quickstart"]');
  await article("quickstart");
  await click("#tocList a");
  await until("Boolean(location.hash)");
  assert.equal(
    new URL(await run("location.href")).searchParams.get("doc"),
    "quickstart",
  );
  await run("history.back()");
  await until(
    "!location.hash&&document.getElementById('article').dataset.doc==='quickstart'",
  );
  await run("history.back()");
  await article("development");
  pass("Chapter navigation, anchor links and browser history work");

  await run(
    "(()=>{const s=document.getElementById('docSearch');s.value='revision';s.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await until(
    "!document.getElementById('searchResults').hidden&&document.querySelectorAll('#searchList a').length>=2",
  );
  assert(
    await run(
      "document.getElementById('searchList').textContent.includes('项目')||document.getElementById('searchList').textContent.includes('API')",
    ),
  );
  await click("#searchList a");
  await until(
    "!document.getElementById('article').hidden&&document.getElementById('docSearch').value===''",
  );
  await run(
    "(()=>{const s=document.getElementById('docSearch');s.value='zzzz-no-such-beatbar-term-948';s.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await until(
    "document.getElementById('searchList').textContent.includes('没有匹配内容')",
  );
  await click("#clearSearch");
  pass(
    "Full-text search finds body symbols, empty state and result navigation",
  );

  await click('#docsNav a[data-doc="quickstart"]');
  await article("quickstart");
  await run(
    "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}})",
  );
  await click("#article .copy-code");
  await until("Boolean(window.__copied)");
  assert((await run("window.__copied")).includes("uvicorn"));
  const raw = await run("document.getElementById('rawDocument').href");
  assert((await (await fetch(raw)).text()).startsWith("# 五分钟快速上手"));
  const safe = await run(
    `(async()=>{const {renderMarkdown}=await import('/markdown.js');const rendered=renderMarkdown('# 同名\\n# 同名\\n<script>window.__unsafe=1</script>\\n[坏链接](javascript:alert(1))\\n[安全链接](https://example.com)\\n\\n\`\`\`html\\n<img src=x onerror=alert(1)>\\n\`\`\`');const box=document.createElement('div');box.append(rendered.fragment);return {scripts:box.querySelectorAll('script,img,[onclick],[onerror]').length,bad:box.querySelectorAll('a[href^="javascript:"]').length,ids:[...box.querySelectorAll('h1')].map(h=>h.id),external:box.querySelector('a')?.rel,unsafe:window.__unsafe||0}})()`,
  );
  assert.equal(safe.scripts, 0);
  assert.equal(safe.bad, 0);
  assert.equal(safe.unsafe, 0);
  assert.equal(new Set(safe.ids).size, 2);
  assert(safe.external.includes("noopener"));
  pass("Copy, canonical Markdown download and safe rendering verified");

  await click('#docsNav a[data-doc="examples"]');
  await article("examples");
  await until("document.querySelectorAll('#exampleCards a').length===3");
  const downloads = await run(
    "[...document.querySelectorAll('#examplePanel a')].map(a=>({href:a.href,download:a.download}))",
  );
  for (const item of downloads) {
    assert(item.download);
    const response = await fetch(item.href);
    assert.equal(response.status, 200);
    if (item.href.endsWith(".json"))
      assert.equal((await response.json()).version, 1);
    else
      assert.equal(
        Buffer.from(await response.arrayBuffer())
          .subarray(0, 4)
          .toString(),
        "RIFF",
      );
  }
  const examples = await (
    await fetch(base + "/learning/examples/catalog.json")
  ).json();
  pass(
    "Audio audition source and all three downloadable projects are available",
  );

  for (const width of [1440, 390]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    for (const id of ["examples", "source-index", "api"]) {
      await run(
        `document.querySelector('#docsNav a[data-doc="${id}"]').click()`,
      );
      await article(id);
      const geometry = await run(
        "({width:innerWidth,scroll:document.documentElement.scrollWidth,article:document.getElementById('article').getBoundingClientRect().width})",
      );
      assert(
        geometry.scroll <= geometry.width + 1,
        JSON.stringify({ width, id, ...geometry }),
      );
      assert(geometry.article > 200);
    }
    if (width === 390) {
      await click("#toggleDocsNav");
      assert.equal(
        await run(
          "getComputedStyle(document.getElementById('docsNav')).display",
        ),
        "block",
      );
      await click('#docsNav a[data-doc="examples"]');
      await article("examples");
      assert.equal(
        await run(
          "document.getElementById('toggleDocsNav').getAttribute('aria-expanded')",
        ),
        "false",
      );
    }
    const screenshot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await fs.mkdir("artifacts", { recursive: true });
    await fs.writeFile(
      `artifacts/help-${width}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
  }
  pass("Desktop and 390px layouts fit; mobile chapter menu opens and closes");

  await cdp("Fetch.enable", {
    patterns: [
      { urlPattern: "*/learning/catalog.json", requestStage: "Request" },
    ],
  });
  failCatalog = true;
  await navigate(base + "/help.html?doc=guide");
  await until(
    "!document.getElementById('retryDoc').hidden&&document.getElementById('docStatus').textContent.includes('503')",
  );
  await click("#retryDoc");
  await article("guide");
  await cdp("Fetch.disable");
  await navigate(base + "/help.html?doc=missing-chapter");
  await article("README");
  assert(
    await run(
      "document.getElementById('docStatus').textContent.includes('未找到')",
    ),
  );
  pass("Unavailable catalog can retry; unknown deep link falls back clearly");

  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(base + "/");
  await until(
    "document.getElementById('connection')?.textContent.includes('已连接')&&!document.getElementById('newProject').disabled",
  );
  for (const entry of examples.examples) {
    const oldId = await run("localStorage.getItem('beatbar.activeProjectId')");
    await upload("#projectFile", "docs/examples/" + entry.file);
    await until(
      `localStorage.getItem('beatbar.activeProjectId')!==${JSON.stringify(oldId)}&&!document.getElementById('newProject').disabled`,
    );
    await upload("#videoFile", "docs/examples/beatbar-120.wav");
    await until(
      "document.getElementById('uploadTitle').textContent==='beatbar-120.wav'&&!document.getElementById('mediaInfo').hidden&&!document.getElementById('newProject').disabled",
    );
    await click("#saveProject");
    await until(
      "document.getElementById('projectStatus').dataset.state==='saved'",
    );
    const id = await run("localStorage.getItem('beatbar.activeProjectId')");
    const record = await (await fetch(base + "/api/projects/" + id)).json();
    assert.equal(record.project.beats.length, entry.beatCount);
    assert.equal(record.project.bpm, entry.bpm);
    assert(record.project.media.id);
    const original = await (
      await fetch(base + "/learning/examples/" + entry.file)
    ).json();
    assert.equal(record.project.style.trackType, original.style.trackType);
    assert.equal(record.project.style.pattern, original.style.pattern);
    assert.equal(
      record.project.exportSettings.mode,
      original.exportSettings.mode,
    );
  }
  pass(
    "Each tutorial project imports, attaches audio and preserves beats, style and output mode",
  );
  assert.deepEqual(errors, []);
  pass("No uncaught browser exceptions");
} catch (error) {
  console.error(error);
  results.push({ name: "Failure", passed: false, error: error.stack });
  process.exitCode = 1;
} finally {
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(
    "artifacts/help-browser-results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  ws.close();
}
