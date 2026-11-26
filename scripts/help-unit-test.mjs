import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = new URL("../", import.meta.url);
const [helpSource, markdownSource, html] = await Promise.all(
  ["frontend/help.js", "frontend/markdown.js", "frontend/help.html"].map(
    (file) => fs.readFile(new URL(file, root), "utf8"),
  ),
);
const flush = () => new Promise(setImmediate);
const homeText = "# 首页\n## 入门\n上传与教程。";
const guideText = "# 指南\n## 修订\nrevision 保存失败与重试。";

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

// A deliberately small DOM for state assertions; layout needs the browser suite.
class Element {
  constructor(tag = "div", ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.text = "";
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }
  set href(value) {
    this.attributes.set("href", String(value));
  }
  get href() {
    return this.attributes.get("href") || "";
  }
  set download(value) {
    this.attributes.set("download", String(value));
  }
  get download() {
    return this.attributes.get("download") || "";
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }
  removeAttribute(key) {
    this.attributes.delete(key);
  }
  hasAttribute(key) {
    return this.attributes.has(key);
  }
  append(...children) {
    for (const child of children) {
      if (child.tagName === "FRAGMENT") this.append(...child.children);
      else {
        child.parentElement = this;
        this.children.push(child);
      }
    }
  }
  replaceChildren(...children) {
    this.text = "";
    this.children = [];
    this.append(...children);
  }
  contains(element) {
    return (
      this === element || this.children.some((child) => child.contains(element))
    );
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (
        (selector === "[data-doc]" && child.dataset.doc) ||
        child.tagName.toLowerCase() === selector ||
        (selector.startsWith(".") &&
          child.className?.split(" ").includes(selector.slice(1)))
      )
        found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  closest(tag) {
    return this.tagName.toLowerCase() === tag
      ? this
      : this.parentElement?.closest(tag);
  }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  emit(type, properties = {}) {
    const event = {
      target: this,
      button: 0,
      preventDefault() {},
      ...properties,
    };
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  scrollIntoView() {}
}

async function harness({
  source = helpSource,
  routes = {},
  doc = "README",
} = {}) {
  const document = new Element("document");
  const elements = new Map(
    [...html.matchAll(/id="([^"]+)"/g)].map((match) => [
      match[1],
      new Element("div", document),
    ]),
  );
  document.getElementById = (id) => elements.get(id);
  document.createElement = (tag) => new Element(tag, document);
  document.createDocumentFragment = () => new Element("fragment", document);
  document.createTextNode = (text) => {
    const element = new Element("#text", document);
    element.textContent = text;
    return element;
  };
  const entries = ["README", "guide", "examples", "failing"].map((id) => ({
    id,
    file: id + ".md",
    title: id,
    summary: id + "说明",
    group: "学习",
  }));
  const responses = new Map(
    Object.entries({
      "/learning/catalog.json": JSON.stringify({ documents: entries }),
      "/learning/examples/catalog.json": JSON.stringify({
        audio: "beatbar-120.wav",
        examples: [],
      }),
      "/learning/README.md": homeText,
      "/learning/guide.md": guideText,
      "/learning/examples.md": "# 样例\n## 配套下载\n练习。",
      "/learning/failing.md": "# 重试章节\n## 内容\n已恢复。",
      ...routes,
    }),
  );
  const timers = new Map();
  let serial = 0;
  let clipboard = "";
  const window = new Element("window");
  window.scrollTo = () => {};
  const location = new URL("http://127.0.0.1:8000/help.html?doc=" + doc);
  const context = vm.createContext({
    document,
    window,
    location,
    URL,
    URLSearchParams,
    AbortController,
    history: {
      pushState: (_state, _title, url) => {
        location.href = url;
      },
    },
    navigator: {
      clipboard: {
        writeText: async (text) => {
          clipboard = text;
        },
      },
    },
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback, delay) => {
      const id = ++serial;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url) => {
      assert(responses.has(url), "Unexpected fetch: " + url);
      const reply = await responses.get(url);
      const status = typeof reply === "string" ? 200 : reply.status;
      const body = typeof reply === "string" ? reply : reply.body;
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
      };
    },
  });
  vm.runInContext(
    '"use strict";\n' +
      markdownSource.replace(/^export /gm, "") +
      "\n" +
      source.replace(/^import .*?;\r?\n/, ""),
    context,
  );
  await flush();
  return {
    context,
    responses,
    element: (id) => elements.get(id),
    clipboard: () => clipboard,
    settle: flush,
    async search(query) {
      elements.get("docSearch").value = query;
      elements.get("docSearch").emit("input");
      for (const [id, timer] of timers) {
        if (timer.delay === 120) {
          timers.delete(id);
          timer.callback();
        }
      }
      await flush();
    },
    async navigate(id) {
      const link = elements
        .get("docsNav")
        .querySelectorAll("[data-doc]")
        .find((entry) => entry.dataset.doc === id);
      assert(link, "Missing navigation: " + id);
      document.emit("click", { target: link });
      await flush();
    },
  };
}

export async function runHelpTests(source = helpSource) {
  const tests = [
    [
      "loading a document preserves search entered before the response",
      async () => {
        const home = deferred();
        const guide = deferred();
        const h = await harness({
          source,
          routes: {
            "/learning/README.md": home.promise,
            "/learning/guide.md": guide.promise,
          },
        });
        await h.search("revision");
        assert.equal(h.element("searchResults").hidden, false);
        home.resolve(homeText);
        await h.settle();
        assert.equal(h.element("docSearch").value, "revision");
        assert.equal(
          h.element("searchResults").hidden,
          false,
          "late document rendering must not dismiss search",
        );
        assert.equal(h.element("article").hidden, true);
        guide.resolve(guideText);
        await h.settle();
        assert.match(h.element("searchNote").textContent, /1 篇匹配/);
        assert.match(h.element("searchList").textContent, /guide/);
      },
    ],
    [
      "navigation and failed loading clear stale content, TOC and download",
      async () => {
        const pending = deferred();
        const h = await harness({
          source,
          routes: { "/learning/failing.md": pending.promise },
        });
        assert.equal(h.element("article").dataset.doc, "README");
        await h.navigate("failing");
        assert.equal(h.element("article").textContent, "");
        assert.equal(h.element("docSummary").textContent, "");
        assert.equal(h.element("tocList").children.length, 0);
        assert.equal(h.element("rawDocument").hasAttribute("href"), false);
        assert.equal(h.element("articleTools").hidden, true);
        pending.resolve({ status: 503, body: "Unavailable" });
        await h.settle();
        assert.match(h.element("docStatus").textContent, /503/);
        assert.equal(h.element("retryDoc").hidden, false);
        await h.search("");
        assert.equal(h.element("articleTools").hidden, true);
        h.responses.set("/learning/failing.md", "# 恢复\n## 内容\n加载成功。");
        await h.element("retryDoc").onclick();
        assert.equal(h.element("article").dataset.doc, "failing");
        assert.equal(h.element("articleTools").hidden, false);
        assert.equal(h.element("rawDocument").href, "/learning/failing.md");
      },
    ],
    [
      "fast navigation ignores an older response arriving afterwards",
      async () => {
        const pending = deferred();
        const h = await harness({
          source,
          routes: { "/learning/README.md": pending.promise },
        });
        await h.navigate("guide");
        assert.equal(h.element("article").dataset.doc, "guide");
        pending.resolve(homeText);
        await h.settle();
        assert.equal(h.element("article").dataset.doc, "guide");
        assert.equal(h.element("rawDocument").href, "/learning/guide.md");
      },
    ],
    [
      "empty search, clearing, examples and unknown-document fallback",
      async () => {
        const h = await harness({ source, doc: "missing" });
        assert.equal(h.element("article").dataset.doc, "README");
        assert.match(h.element("docStatus").textContent, /未找到该章节/);
        await h.search("does-not-exist-anywhere");
        assert.match(h.element("searchList").textContent, /没有匹配内容/);
        h.element("clearSearch").onclick();
        assert.equal(h.element("searchResults").hidden, true);
        assert.equal(h.element("article").hidden, false);
        await h.navigate("examples");
        assert.equal(h.element("examplePanel").hidden, false);
        await h.search("revision");
        assert.equal(h.element("examplePanel").hidden, true);
        h.element("clearSearch").onclick();
        assert.equal(h.element("examplePanel").hidden, false);
      },
    ],
    [
      "Markdown keeps unsafe content inert and copies code without execution",
      async () => {
        const h = await harness({ source });
        const fence = String.fromCharCode(96).repeat(3);
        h.context.fixture = [
          "# 同名",
          "## 同名",
          "<script>alert(1)</script>",
          "",
          "[危险](javascript:alert) [指南](guide.md) [外部](https://example.com)",
          "",
          fence + "powershell",
          'Write-Output "hello"',
          fence,
        ].join("\n");
        const rendered = vm.runInContext(
          "renderMarkdown(fixture, {resolveLink})",
          h.context,
        );
        assert.equal(rendered.headings[0].id, "同名");
        assert.equal(rendered.headings[1].id, "同名-2");
        assert.equal(rendered.fragment.querySelectorAll("script").length, 0);
        const links = rendered.fragment.querySelectorAll("a");
        assert.equal(links.length, 2);
        assert.match(links[0].href, /help.html\?doc=guide/);
        assert.equal(links[1].rel, "noopener noreferrer");
        const copy = rendered.fragment.querySelectorAll(".copy-code")[0];
        assert(copy, "code block must expose a copy button");
        await copy.onclick();
        assert.equal(h.clipboard(), 'Write-Output "hello"');
        h.context.navigator.clipboard.writeText = async () => {
          throw Error("denied");
        };
        await copy.onclick();
        assert.equal(copy.textContent, "请选中文字复制");
      },
    ],
  ];
  for (const [name, callback] of tests) {
    await callback();
    console.log("PASS help: " + name);
  }
  return {
    passed: true,
    checks: tests.map(([name]) => name),
    scope: "Node VM with controlled DOM/fetch; no layout or backend assertions",
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await runHelpTests();
