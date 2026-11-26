import { renderMarkdown } from "./markdown.js";

const $ = (id) => document.getElementById(id);
const cache = new Map();
let documents = [];
let current = null;
let renderVersion = 0;
let searchTimer;
let searchReady = false;
let indexed = [];

async function getText(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) throw Error("读取失败（" + response.status + "）");
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
function load(entry) {
  if (!cache.has(entry.id)) {
    const promise = getText("/learning/" + entry.file).catch((error) => {
      cache.delete(entry.id);
      throw error;
    });
    cache.set(entry.id, promise);
  }
  return cache.get(entry.id);
}
function docUrl(id, hash = "") {
  const url = new URL("/help.html", location.origin);
  url.searchParams.set("doc", id);
  url.hash = hash;
  return url;
}
function resolveLink(href) {
  const url = new URL(
    href,
    new URL("/learning/" + current.file, location.origin),
  );
  if (url.origin === location.origin && url.pathname.endsWith(".md")) {
    const entry = documents.find(
      (item) => "/learning/" + item.file === url.pathname,
    );
    if (entry) return docUrl(entry.id, url.hash).href;
  }
  return url.href;
}
function closeMenu() {
  $("helpLayout").dataset.menu = "closed";
  $("toggleDocsNav").setAttribute("aria-expanded", "false");
}
function searchMode(active) {
  $("searchResults").hidden = !active;
  $("article").hidden = active;
  $("articleTools").hidden = active || !$("article").dataset.doc;
  $("articleToc").hidden = active || !$("tocList").children.length;
  $("examplePanel").hidden =
    active || current?.id !== "examples" || !$("article").dataset.doc;
}
function renderNavigation() {
  const fragment = document.createDocumentFragment();
  for (const group of new Set(documents.map((entry) => entry.group))) {
    const title = document.createElement("h2");
    title.textContent = group;
    fragment.append(title);
    for (const entry of documents.filter((item) => item.group === group)) {
      const link = document.createElement("a");
      link.href = docUrl(entry.id);
      link.dataset.doc = entry.id;
      link.textContent = entry.title;
      link.title = entry.summary;
      fragment.append(link);
    }
  }
  $("docsNav").replaceChildren(fragment);
}
function scrollToAnchor() {
  let id;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  if (id) {
    const element = document.getElementById(id);
    if (element && $("article").contains(element))
      element.scrollIntoView({ block: "start" });
  }
}
async function showDocument({ scroll = true } = {}) {
  const requested = new URLSearchParams(location.search).get("doc") || "README";
  const entry = documents.find((item) => item.id === requested) || documents[0];
  const version = ++renderVersion;
  current = entry;
  clearTimeout(searchTimer);
  $("docSearch").value = "";
  $("docStatus").textContent = "正在读取：" + entry.title;
  $("retryDoc").hidden = true;
  $("article").replaceChildren();
  delete $("article").dataset.doc;
  $("tocList").replaceChildren();
  $("docSummary").textContent = "";
  $("rawDocument").removeAttribute("href");
  searchMode(false);
  closeMenu();
  try {
    const text = await load(entry);
    if (version !== renderVersion) return;
    const rendered = renderMarkdown(text, { resolveLink });
    $("article").replaceChildren(rendered.fragment);
    $("article").dataset.doc = entry.id;
    $("docSummary").textContent = entry.summary;
    document.title = entry.title + " · BeatBar 学习中心";
    $("rawDocument").href = "/learning/" + entry.file;
    $("rawDocument").download = entry.file;
    const toc = document.createDocumentFragment();
    for (const heading of rendered.headings.filter(
      (item) => item.level > 1 && item.level <= 3,
    )) {
      const link = document.createElement("a");
      link.href = docUrl(entry.id, heading.id);
      link.textContent = heading.text;
      link.className = "toc-level-" + heading.level;
      toc.append(link);
    }
    $("tocList").replaceChildren(toc);
    for (const link of $("docsNav").querySelectorAll("[data-doc]")) {
      if (link.dataset.doc === entry.id)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    $("docStatus").textContent =
      requested === entry.id ? "" : "未找到该章节，已打开学习中心首页。";
    if ($("docSearch").value.trim()) updateSearch();
    else {
      searchMode(false);
      if (location.hash) requestAnimationFrame(scrollToAnchor);
      else if (scroll) window.scrollTo(0, 0);
    }
  } catch (error) {
    if (version !== renderVersion) return;
    $("article").replaceChildren();
    $("tocList").replaceChildren();
    $("articleTools").hidden = true;
    $("articleToc").hidden = true;
    $("examplePanel").hidden = true;
    $("docStatus").textContent =
      "文档加载失败：" +
      error.message +
      "。请确认本地服务运行且包含 docs 目录。";
    $("retryDoc").hidden = false;
  }
}
function navigate(url) {
  history.pushState(null, "", url);
  showDocument();
}
function updateSearch() {
  const query = $("docSearch").value.trim();
  if (!query) {
    searchMode(false);
    $("searchNote").textContent = "";
    return;
  }
  searchMode(true);
  const terms = query.toLocaleLowerCase().split(/\s+/);
  const found = indexed.filter(({ entry, text }) =>
    terms.every((term) =>
      (entry.title + " " + text).toLocaleLowerCase().includes(term),
    ),
  );
  $("searchNote").textContent = searchReady
    ? found.length +
      " 篇匹配文章" +
      (indexed.length < documents.length
        ? "（部分文章未能读取，可稍后刷新）"
        : "")
    : "正在建立全文索引…";
  const fragment = document.createDocumentFragment();
  for (const { entry, text } of found) {
    const link = document.createElement("a");
    link.className = "search-result";
    link.href = docUrl(entry.id);
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const snippet = document.createElement("span");
    const offset = Math.max(0, text.toLocaleLowerCase().indexOf(terms[0]) - 35);
    snippet.textContent = text
      .slice(offset, offset + 160)
      .replace(/[#`|*]/g, " ");
    link.append(title, snippet);
    fragment.append(link);
  }
  if (!found.length && searchReady) {
    const empty = document.createElement("p");
    empty.textContent =
      "没有匹配内容。试试“绿幕”“保存失败”“revision”或具体函数名。";
    fragment.append(empty);
  }
  $("searchList").replaceChildren(fragment);
}
async function loadExamples() {
  try {
    const data = JSON.parse(await getText("/learning/examples/catalog.json"));
    if (!/^[a-z0-9-]+\.wav$/.test(data.audio) || !Array.isArray(data.examples))
      throw Error("样例清单格式无效");
    $("sampleAudio").src = "/learning/examples/" + data.audio;
    $("downloadAudio").href = $("sampleAudio").src;
    const fragment = document.createDocumentFragment();
    for (const example of data.examples) {
      if (!/^[a-z0-9-]+\.json$/.test(example.file)) throw Error("样例路径无效");
      const card = document.createElement("div");
      card.className = "learning-example";
      const title = document.createElement("h3");
      title.textContent = example.title;
      const summary = document.createElement("p");
      summary.textContent = example.summary;
      const download = document.createElement("a");
      download.className = "button";
      download.href = "/learning/examples/" + example.file;
      download.download = example.file;
      download.textContent = "下载项目 JSON";
      card.append(title, summary, download);
      fragment.append(card);
    }
    $("exampleCards").replaceChildren(fragment);
  } catch (error) {
    $("exampleNote").textContent =
      "样例卡片暂不可用：" + error.message + "。可使用正文中的下载链接。";
  }
}
async function initialize() {
  try {
    const data = JSON.parse(await getText("/learning/catalog.json"));
    if (
      !Array.isArray(data.documents) ||
      !data.documents.length ||
      data.documents.some(
        (entry) =>
          !/^[A-Za-z0-9-]+$/.test(entry.id) ||
          !/^[A-Za-z0-9-]+\.md$/.test(entry.file),
      )
    )
      throw Error("文档目录格式无效");
    documents = data.documents;
    renderNavigation();
    await showDocument({ scroll: false });
    loadExamples();
    const results = await Promise.allSettled(
      documents.map(async (entry) => ({ entry, text: await load(entry) })),
    );
    indexed = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    searchReady = true;
    if ($("docSearch").value.trim()) updateSearch();
  } catch (error) {
    $("docStatus").textContent =
      "学习中心加载失败：" + error.message + "。请检查本地服务后重试。";
    $("retryDoc").hidden = false;
  }
}
$("docSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(updateSearch, 120);
});
$("clearSearch").onclick = () => {
  $("docSearch").value = "";
  updateSearch();
  $("docSearch").focus();
};
$("toggleDocsNav").onclick = () => {
  const open = $("helpLayout").dataset.menu !== "open";
  $("helpLayout").dataset.menu = open ? "open" : "closed";
  $("toggleDocsNav").setAttribute("aria-expanded", String(open));
};
$("retryDoc").onclick = () =>
  documents.length ? showDocument() : initialize();
document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (
    !link ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    link.hasAttribute("download")
  )
    return;
  const url = new URL(link.href);
  if (url.origin === location.origin && url.pathname === "/help.html") {
    event.preventDefault();
    navigate(url);
  }
});
window.addEventListener("popstate", () => showDocument());
window.addEventListener("hashchange", scrollToAnchor);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) &&
    !event.target.isContentEditable
  ) {
    event.preventDefault();
    $("docSearch").focus();
  }
  if (event.key === "Escape" && document.activeElement === $("docSearch")) {
    $("docSearch").value = "";
    updateSearch();
  }
});
initialize();
