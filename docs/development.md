# 开发、测试与文档维护

## 开发环境与启动

Python 3.11+ 为运行要求；Node.js 22+ 和 pnpm 为可选开发工具。Python 库见 requirements.txt，前端开发工具见 package.json / pnpm-lock.yaml。前端无构建，不要额外启动另一套静态开发服务器代替 FastAPI。

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
pnpm install --frozen-lockfile
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

开发热重载可加 `--reload --reload-dir backend`，只用于开发。前端文件修改后刷新即可。测试前设置独立数据目录，避免操作日常项目：

```powershell
$env:BEATBAR_DATA_DIR = "$PWD\artifacts\learning-qa-data"
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## 测试分层

| 命令 / 文件                                                | 验证目的                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm check`                                               | 原生 JS 语法与 Prettier 格式                                         |
| `pnpm test:unit`                                           | 时间坐标、响度颜色、保存句柄/重名，以及学习中心异步与安全渲染        |
| `pnpm test:projects`                                       | 防抖、并发保存、失败阻断、修订冲突、异步导入与恢复                   |
| `pnpm test:docs`                                           | 文档链接/目录、AST 索引新鲜度、样例格式/音频与教学数字一致性         |
| `python -m unittest discover -s backend -p "test_*.py" -v` | 媒体探测、检测算法、Pillow/编码、Range、文件名、项目 CRUD 与写盘失败 |
| `scripts/browser-test.mjs`                                 | 基础素材、分析、编辑与三种输出                                       |
| `scripts/visual-browser-test.mjs`                          | 新视觉、纯音乐、自定义图案和输出                                     |
| `scripts/studio-browser-test.mjs`                          | 时间轴缩放/拖动、样式与命名保存                                      |
| `scripts/project-browser-test.mjs`                         | 项目新建/切换/刷新/缺失素材/失败保护                                 |
| `scripts/help-browser-test.mjs`                            | 学习入口、导航/历史、搜索、样例下载、安全渲染与窄屏阅读              |

学习中心状态断言也可单独执行 `pnpm test:help-unit`；它在受控 DOM / fetch 中覆盖加载期间搜索、旧响应、失败重试和 Markdown 复制，不代替真实浏览器的布局或 HTTP 集成回归。

Python 命令在激活虚拟环境后执行；也可显式使用 `.venv\Scripts\python.exe`。合成检测测试只覆盖所构造的信号，不代表所有真实混音的准确率。

## 浏览器回归方法

浏览器脚本使用 CDP，与专用 Chrome 配置配合；不要连接日常个人浏览器。先启动独立数据目录服务，再在另一终端执行：

```powershell
.venv\Scripts\python.exe scripts\generate-fixtures.py
Start-Process -FilePath "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" -ArgumentList @('--headless=new', '--remote-debugging-port=62880', "--user-data-dir=`"$PWD\artifacts\docs-qa-profile`"", 'http://127.0.0.1:8000')
node scripts/help-browser-test.mjs 62880
node scripts/project-browser-test.mjs 62880
node scripts/studio-browser-test.mjs 62880
node scripts/visual-browser-test.mjs 62880
node scripts/browser-test.mjs 62880
```

Chrome 安装在其他目录时替换路径。脚本写测试报告到 artifacts；完成后关闭专用浏览器和服务。文件选择器的自动化使用受控替身，不能替代在目标浏览器中的手工权限体验验证。

## 如何维护这套文档

正文源在 docs 下，网页直接读取同一 Markdown，没有另一套复制粘贴的 HTML 正文。新增文章时更新 `docs/catalog.json`；使用相对 Markdown 链接可同时在仓库与网页阅读。阅读器支持标题、列表、表格、代码块、引用和普通链接，不执行原始 HTML；不要依赖复杂 Markdown 扩展或远程脚本。

```powershell
.venv\Scripts\python.exe scripts\generate-learning-examples.py
node scripts/build-code-map.mjs
pnpm test:docs
pnpm check
```

源码索引通过 Python ast 和本地 Prettier 的 Babel parser 收集类/具名函数/赋值函数/路由及行号。它不是动态调用图；修改代码逻辑后，先人工同步对应说明，再重新生成索引。生成器不执行被分析的业务代码。`--check` 模式只比较输出，不写入。

教学样例生成器只写 docs/examples；音频和 JSON 都确定性生成，可作为可分发内容提交。常规测试音视频与用户数据继续排除在版本管理之外。

## 修改功能时的核对路径

- 改检测：detection.py、AnalyzeRequest、网页控件，补合成信号和边界测试。
- 改视觉：DEFAULT_STYLE / Canvas、Python Style / Pillow、项目 prepare/restore、预设样例与视觉回归一起核对。
- 改时间轴：检查 timeToX/xToTime 互逆、缩放锚点、单次手势撤销、可见窗口与高密度点。
- 改保存：检查 generation、revision、失败时旧内容、缺失素材首次关联、重启重读和文件写入失败。
- 改导出：先验证取消保存选择不启动任务，再检查命名、Range、音轨、Alpha、资源预算和出错清理。
- 改教程：运行链接/示例检查，在桌面与窄屏实际打开；不要把代码索引通过当作正文已正确更新。

## 已知边界与许可

默认单机、无认证；任务只在内存，不做断点续渲染；数据不自动清理；Python 依赖是范围而非完整锁。发布前应在目标 Python/浏览器/FFmpeg 组合重跑测试。保留根目录 LICENSE、THIRD_PARTY_NOTICES.md 与 licenses 原文；合成教学 WAV 由本项目脚本生成，用户自行上传素材的传播授权由用户确认。
