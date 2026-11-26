import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import babel from "prettier/plugins/babel";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const pythonPath = path.join(
  root,
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
const python =
  process.env.BEATBAR_PYTHON ||
  (await fs.access(pythonPath).then(
    () => pythonPath,
    () => (process.platform === "win32" ? "python" : "python3"),
  ));
const result = spawnSync(python, ["scripts/code-map-python.py"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  maxBuffer: 8 * 1024 * 1024,
});
if (result.error || result.status !== 0)
  throw result.error || Error(result.stderr || "Python inventory failed");
const pythonModules = JSON.parse(result.stdout);
const role = {
  "frontend/app.js": "工作台编排：编辑状态、素材、打点、项目快照、任务与输出",
  "frontend/projects.js": "项目库、自动保存、修订控制、切换和错误保护",
  "frontend/timeline.js": "时间坐标、Canvas 波形、拍点手势、缩放和跟随",
  "frontend/visuals.js": "Canvas 节拍预览、样式、颜色和命中效果",
  "frontend/export.js": "浏览器保存位置、输出命名与下载流",
  "frontend/help.js": "学习文档加载、目录、全文索引、历史和样例",
  "frontend/markdown.js": "安全 DOM Markdown 子集和代码复制",
  "frontend/index.html": "工作台语义结构、控件、对话框和学习入口",
  "frontend/help.html": "独立学习页面、导航、搜索与音频练习区域",
  "frontend/style.css": "工作台布局、视觉控件和响应式样式",
  "frontend/help.css": "学习页面的阅读排版、表格滚动与窄屏导航",
  "backend/main.py": "FastAPI 组合、上传、任务、媒体处理、视频渲染和静态站点",
  "backend/detection.py": "离线多频带 onset 检测、节奏估计和 dBFS 测量",
  "backend/projects.py": "项目验证、修订、原子持久化和 CRUD 路由",
  "launch_browser.py": "等待服务健康后打开本机工作台",
  "start.ps1": "Windows 虚拟环境、缺失依赖安装与服务启动",
  "start.bat": "Windows 双击启动入口",
  "scripts/build-code-map.mjs": "静态源码索引生成与 --check 校验",
  "scripts/code-map-python.py": "Python ast 符号提取，不导入业务代码",
  "scripts/generate-learning-examples.py": "确定性生成可分发的学习音频和项目",
  "scripts/test-docs.mjs": "文档链接、样例、关键教学数字和索引校验",
  "scripts/help-browser-test.mjs": "学习中心浏览器回归与实际练习验证",
  "scripts/help-unit-test.mjs":
    "受控 DOM 下的学习状态、加载竞态和安全 Markdown 回归",
  "scripts/beatbar_client.py":
    "HTTP/Python 客户端与 health/analyze/render 命令行入口",
  "scripts/benchmark-api.py": "顺序 HTTP 性能采样、环境记录与四种规格下载",
  "package.json": "前端开发命令及开发依赖",
  "requirements.txt": "Python 运行依赖范围",
};
function purpose(file) {
  return (
    role[file] ||
    (/(?:test_|-test\.)/.test(file)
      ? "自动化回归与边界验证"
      : file.startsWith("scripts/")
        ? "开发、测试或分发维护脚本"
        : "项目入口或配置")
  );
}
function compact(text) {
  return text.replace(/\s+/g, " ").trim();
}
function cell(text) {
  return String(text)
    .replace(/\|/g, "\\|")
    .replace(/`/g, "'")
    .replace(/\r?\n/g, " ");
}
const code = (text) => "`" + cell(text) + "`";
async function javascript(file) {
  const source = await fs.readFile(path.join(root, file), "utf8");
  const ast = await babel.parsers.babel.parse(source, {});
  const symbols = [];
  const imports = [];
  const slice = (node) => compact(source.slice(node.start, node.end));
  function walk(node, parent = null, scope = []) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportDeclaration") imports.push(node.source.value);
    let name;
    let kind;
    let signature;
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "ClassDeclaration"
    ) {
      name = node.id?.name;
      kind = node.type === "ClassDeclaration" ? "类" : "函数";
    } else if (
      ["ClassMethod", "ObjectMethod", "ClassPrivateMethod"].includes(node.type)
    ) {
      name = slice(node.key);
      kind = "方法";
    } else if (
      ["ArrowFunctionExpression", "FunctionExpression"].includes(node.type)
    ) {
      if (parent?.type === "VariableDeclarator") {
        name = slice(parent.id);
        kind = "函数变量";
      } else if (parent?.type === "AssignmentExpression") {
        name = slice(parent.left);
        kind = "赋值函数";
      } else if (["ObjectProperty", "ClassProperty"].includes(parent?.type)) {
        name = slice(parent.key);
        kind = "属性函数";
      } else if (
        parent?.type === "CallExpression" &&
        parent.callee?.property?.name === "addEventListener"
      ) {
        name =
          slice(parent.callee.object) +
          ".on(" +
          slice(parent.arguments[0]) +
          ")";
        kind = "事件回调";
      } else if (node.id?.name) {
        name = node.id.name;
        kind = "具名函数表达式";
      }
    }
    if (name) {
      if (node.params)
        signature =
          (node.async ? "async " : "") +
          name +
          "(" +
          node.params.map(slice).join(", ") +
          ")";
      else
        signature =
          name + (node.superClass ? " extends " + slice(node.superClass) : "");
      symbols.push({
        name: [...scope, name].join(" → "),
        signature,
        kind,
        line: node.loc.start.line,
      });
      scope = [...scope, name];
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          "loc",
          "tokens",
          "comments",
          "leadingComments",
          "trailingComments",
          "innerComments",
          "errors",
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) walk(child, node, scope);
      } else if (value?.type) walk(value, node, scope);
    }
  }
  walk(ast);
  return { file, imports: [...new Set(imports)].sort(), symbols, routes: [] };
}
const frontend = (await fs.readdir(path.join(root, "frontend")))
  .filter((name) => /\.(?:js|html|css)$/.test(name))
  .map((name) => "frontend/" + name);
const scripts = (await fs.readdir(path.join(root, "scripts")))
  .filter((name) => /\.(?:mjs|py)$/.test(name))
  .map((name) => "scripts/" + name);
const entryFiles = (await fs.readdir(root)).filter((name) =>
  /\.(?:py|ps1|bat)$/.test(name),
);
const files = [
  ...new Set([
    ...frontend,
    ...scripts,
    ...entryFiles,
    ...pythonModules.map((module) => module.file),
    "package.json",
    "requirements.txt",
  ]),
].sort();
const modules = new Map(pythonModules.map((module) => [module.file, module]));
for (const file of files.filter((name) => /\.(?:js|mjs)$/.test(name)))
  modules.set(file, await javascript(file));
const lines = [
  "# 源码符号索引",
  "",
  "> 此页由 scripts/build-code-map.mjs 生成，请勿手工改行号。Python 使用 ast，JavaScript 使用本地 Prettier 的 Babel parser；不执行被分析代码。索引覆盖应用、启动、测试与维护代码的文件清单、导入、具名定义、赋值函数、显式事件监听和路由。匿名 Promise/数组回调不单列；静态索引不是动态调用图。",
  "",
  "先读 [项目结构与数据流](architecture.md)、[前端代码逻辑](frontend.md) 和 [后端代码逻辑](backend.md) 理解职责，再用此页定位函数。行号相对于仓库源码，修改后执行 `node scripts/build-code-map.mjs` 更新。",
  "",
  "## 代码文件总览",
  "",
  "| 文件 | 职责 | 行数 | 内容 SHA-256（前 12 位） |",
  "| --- | --- | --- | --- |",
];
for (const file of files) {
  const content = await fs.readFile(path.join(root, file));
  const length =
    content.toString("utf8").split(/\r?\n/).length -
    (content.at(-1) === 10 ? 1 : 0);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  lines.push(
    `| ${code(file)} | ${purpose(file)} | ${length} | ${code(hash)} |`,
  );
}
const allRoutes = pythonModules.flatMap((module) =>
  module.routes.map((route) => ({ ...route, file: module.file })),
);
lines.push(
  "",
  "## 业务路由定位",
  "",
  "projects.py 的 router 另有 `/api/projects` 前缀；FastAPI 自带 `/docs`、`/redoc` 和 `/openapi.json` 不计入业务接口。",
  "",
  "| 方法 | 完整路径 | 处理函数 | 源码行 |",
  "| --- | --- | --- | --- |",
);
for (const route of allRoutes) {
  const prefix = route.file.endsWith("projects.py") ? "/api/projects" : "";
  lines.push(
    `| ${route.method} | ${code(prefix + route.path)} | ${code(route.handler)} | ${code(route.file + ":" + route.line)} |`,
  );
}
for (const file of files) {
  const module = modules.get(file);
  if (!module) continue;
  lines.push(
    "",
    "## " + file,
    "",
    purpose(file) + "。",
    "",
    "静态导入：" +
      (module.imports.length
        ? module.imports.map(code).join("、")
        : "无显式导入") +
      "。",
    "",
  );
  if (!module.symbols.length) {
    lines.push("此文件没有单列的具名类或函数定义。");
    continue;
  }
  lines.push("| 位置 / 名称 | 类型 | 定义签名 |", "| --- | --- | --- |");
  for (const item of module.symbols)
    lines.push(
      `| ${code(item.line + " · " + item.name)} | ${item.kind} | ${code(item.signature)} |`,
    );
}
const output = lines.join("\n") + "\n";
const target = path.join(root, "docs/source-index.md");
if (check) {
  const existing = await fs.readFile(target, "utf8");
  if (existing !== output)
    throw Error("源码索引已过期，请执行 node scripts/build-code-map.mjs");
  console.log(
    `Verified source index: ${files.length} files, ${allRoutes.length} routes`,
  );
} else {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, output);
  console.log(
    `Generated source index: ${files.length} files, ${allRoutes.length} routes`,
  );
}
