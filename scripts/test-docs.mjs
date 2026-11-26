import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { headingId } from "../frontend/markdown.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const catalog = JSON.parse(
  await fs.readFile(path.join(docs, "catalog.json"), "utf8"),
);
assert.equal(catalog.documents.length, 11);
assert.equal(new Set(catalog.documents.map((entry) => entry.id)).size, 11);
let links = 0;
const articles = new Map();
for (const entry of catalog.documents) {
  assert.match(entry.id, /^[A-Za-z0-9-]+$/);
  assert.equal(entry.file, entry.id + ".md");
  assert.ok(entry.title && entry.summary && entry.group);
  const text = await fs.readFile(path.join(docs, entry.file), "utf8");
  assert.match(text, /^# .+/);
  assert.equal(
    (text.match(/^```/gm) || []).length % 2,
    0,
    entry.file + " has an unclosed code fence",
  );
  assert.ok(
    !/\b(?:TODO|TBD|FIXME)\b/.test(text),
    entry.file + " contains a placeholder",
  );
  articles.set(entry.file, text);
}
for (const [file, text] of articles) {
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
  for (const match of prose.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)) {
    const href = match[1];
    if (/^https?:\/\//.test(href)) continue;
    const [relative, hash] = href.split("#");
    const target = path.resolve(
      docs,
      path.dirname(file),
      decodeURIComponent(relative || file),
    );
    assert.ok(
      target.startsWith(docs + path.sep),
      "Escaping documentation link: " + href,
    );
    const stat = await fs.stat(target);
    assert.ok(stat.isFile(), "Broken document link: " + file + " → " + href);
    if (hash && target.endsWith(".md")) {
      const content = await fs.readFile(target, "utf8");
      const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
        (heading) => headingId(heading[1]),
      );
      assert.ok(
        headings.includes(decodeURIComponent(hash)),
        "Broken anchor: " + href,
      );
    }
    links++;
  }
}
assert.ok(links >= 20);
const source = articles.get("source-index.md");
for (const symbol of [
  "detect_beats",
  "ProjectStore",
  "createProjectManager",
  "createTimeline",
  "renderMarkdown",
  "restoreProject",
])
  assert.ok(source.includes(symbol), "Symbol absent from index: " + symbol);
const assets = JSON.parse(
  await fs.readFile(path.join(docs, "examples/catalog.json"), "utf8"),
);
assert.equal(assets.duration, 8);
assert.equal(assets.bpm, 120);
assert.equal(assets.beatCount, 16);
assert.equal(assets.examples.length, 3);
const exchange = JSON.parse(
  await fs.readFile(path.join(docs, "examples/beatbar-120.funscript"), "utf8"),
);
assert.equal(
  exchange.actions.filter((action) => action.pos === 100).length,
  16,
);
assert.ok(
  exchange.actions.every(
    (action, i, all) => i === 0 || action.at >= all[i - 1].at,
  ),
);
const candidate = path.join(
  root,
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
const python =
  process.env.BEATBAR_PYTHON ||
  (await fs.access(candidate).then(
    () => candidate,
    () => (process.platform === "win32" ? "python" : "python3"),
  ));
function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.error || result.status !== 0)
    throw result.error || Error(args.join(" ") + " failed");
}
run(process.execPath, ["scripts/build-code-map.mjs", "--check"]);
run(python, ["scripts/generate-learning-examples.py", "--check"]);
run(python, ["-m", "unittest", "backend.test_learning", "-v"]);
console.log(
  `Documentation checks passed: ${articles.size} chapters, ${links} local links, 3 projects and exchange assets`,
);
