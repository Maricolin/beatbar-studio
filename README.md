# BeatBar Studio

本地运行的中文 Web 节奏条编辑器。单独上传一首音乐或一个视频，即可识别拍点、手工编排节奏、设计鼓点样式，并导出合成视频、绿幕轨道或透明轨道。

**自有代码协议：[MIT](LICENSE)** · **第三方声明：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** · **问题反馈：[GitHub Issues](https://github.com/Maricolin/beatbar-studio/issues)**

## 功能概览

| 功能       | 支持内容                                                                           |
| ---------- | ---------------------------------------------------------------------------------- |
| 单文件导入 | 音乐或视频任选其一；不要求同时上传两种素材                                         |
| 自动识别   | 多频段自适应起音；鼓点起音 / 稳定节奏两种模式；频段、灵敏度、最小间隔可调          |
| 手工编辑   | 跟随播放录制、时间轴添加/拖动、精确时间与强度、撤销/重做、整体偏移、隔拍、BPM 填充 |
| 主题与颜色 | 6 套色盘；自定义主色、副色、轨道底色和纯音乐画布背景                               |
| 鼓点配色   | 统一主色、双色交替、强度渐变、实测 dBFS 驱动颜色深浅                               |
| 图案       | 圆点、竖线、菱形、三角、星芒、胶囊、六边形、心形；移动鼓点与命中标记可分别上传图片 |
| 运动       | 从右向左、从左向右、双侧汇合；新增双侧竖线汇合节拍条                               |
| 命中动效   | 涟漪、闪光、粒子爆发或关闭；持续时间和强度可调                                     |
| 实时预览   | 无素材也能试样式；上传后随播放预览，支持调整鼓点大小、轨道尺寸和位置               |
| 项目管理   | 本机项目库、新建/改名/搜索/复制/删除；自动保存、手动保存、切换与恢复上次项目       |
| 项目与交换 | 项目 JSON 导入/导出；拍点 JSON 与 Funscript 导入/导出                              |
| 视频输出   | MP4 合成、绿幕、WebM 透明轨道；中文命名、完整保存路径 / 文件夹；音频可选           |

## 快速开始

### 环境要求

- Python 3.11 或更高版本，已加入 `PATH`。
- 推荐使用近期版本的 Chrome 或 Edge。文件能否直接试听/播放，还取决于浏览器支持的媒体编码。
- 首次安装需要网络和足够的磁盘空间；安装完成后，素材分析、预览和导出在本机执行。
- 日常使用不需要 Node.js；可选开发工具要求 Node.js 22+ 和 pnpm。
- 默认使用 `imageio-ffmpeg` 提供的 FFmpeg，无须另行安装系统 FFmpeg；其二进制许可见[第三方声明](THIRD_PARTY_NOTICES.md#ffmpeg-与编码器)。

### 获取代码

```bash
git clone https://github.com/Maricolin/beatbar-studio.git
cd beatbar-studio
```

也可从仓库页面选择 **Code → Download ZIP**，解压后进入项目目录。

### Windows 一键启动

1. 双击项目根目录的 [start.bat](start.bat)。
2. 首次启动会创建 Python 虚拟环境并安装[运行依赖](requirements.txt)，请等待命令行窗口显示服务地址。
3. 浏览器会自动打开 **http://127.0.0.1:8000/**；也可以手动输入该地址。
4. 使用期间保持命令行窗口打开；按 `Ctrl+C` 停止服务。

启动脚本见 [start.ps1](start.ps1)。它在依赖缺失时执行安装；更新代码或依赖后，可用下方命令主动更新依赖。

### Windows 手动启动

在项目根目录打开 PowerShell：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### macOS / Linux 手动启动

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

随后在同一台电脑打开 **http://127.0.0.1:8000/**。Windows 启动脚本仅适用于 Windows；其他平台的编码器可用性取决于对应 FFmpeg 构建。

> 这是需要 Python 后端的本地应用。直接打开前端 HTML、仓库首页或 GitHub Pages，都不能代替启动后端服务。`127.0.0.1` 指访问者当前所在的电脑。

## 教程与代码学习

启动后点击网页顶部 **学习教程 ↗**，或访问 **http://127.0.0.1:8000/help.html**。学习中心在独立页面中提供全文搜索、本页目录、代码复制和原始 Markdown 下载。

- [文档总览与学习路线](docs/README.md)：11 篇教程和开发参考。
- [五分钟快速上手](docs/quickstart.md)与[完整使用手册](docs/guide.md)：从第一段作品到项目备份、三种输出和常见问题。
- [配套练习](docs/examples.md)：8 秒、120 BPM 合成音频，经典双色、双侧汇合、隔拍绿幕三份可导入项目，以及拍点 JSON / Funscript。
- [项目结构与数据流](docs/architecture.md)、[前端逻辑](docs/frontend.md)、[后端逻辑](docs/backend.md)、[API 与调用示例](docs/api.md)：理解实现和扩展位置。
- [部署设备与性能](docs/deployment.md)：CPU/内存/磁盘规划、资源限制、实测结果与接口服务部署边界。
- [源码符号索引](docs/source-index.md)与[开发维护说明](docs/development.md)：由 AST 生成的函数/路由定位、测试分层和再生成命令。
- [更新记录](CHANGELOG.md)与[本次验收报告](docs/acceptance.md)：功能变更、测试结果、本机性能与验证边界。

代码调用可直接使用后端的 14 个 HTTP 接口；`scripts/beatbar_client.py` 提供 `health`、`analyze`、`render` 命令和可导入的 Python 客户端，示例见 [API 文档](docs/api.md)。性能复现脚本为 `scripts/benchmark-api.py`。

正文源位于 `docs`，网页直接读取同一份文件；文档静态路径为 `/learning`，原有 `/docs` 继续用于 FastAPI 交互式 API 文档。下载练习后在工作台手动导入项目，再上传配套音频，不会因打开教程而改变当前编辑内容。

## 先用两分钟验证效果

1. **试样式**：在右侧切换色盘、图案与动效，查看实时小预览；此步骤不需要上传素材。
2. **导入**：选择一段较短的音乐或视频，等待波形加载。
3. **识别**：点击“分析音乐，生成拍点”，然后播放。无音轨视频可改用手动打点或 BPM 填充。
4. **看汇合**：将“节拍条类型”设为“双侧汇合 · 竖线节拍条”，观察两侧竖线同步到达中心。配色选择“随鼓点分贝深浅”可对比强弱鼓点。
5. **试图案**：上传一张带透明背景的 PNG，查看缩略图与播放效果；非方形图片保持比例。
6. **导出**：输入文件名，按需选择保存路径或文件夹；先用 640×360、较低帧率测试，再提高输出质量。

没有测试素材时，可生成一段合成的 120 BPM 音乐和测试视频，输出到本地测试目录：

```powershell
.venv\Scripts\python.exe scripts\generate-fixtures.py
```

生成文件为项目根目录下的 `beatbar-sample-clicks.wav` 和测试目录下的 `artifacts/sample-120bpm.mp4`；它们不纳入版本管理。

## 编辑与保存

- **自动识别**：调节频段、灵敏度、最小拍点间隔与识别方式。新识别结果覆盖当前拍点，可撤销。
- **手工录制**：切换“手动打点”，开启录制后跟随播放按 `F` 或点击打点按钮。时间补偿填负数可将拍点提前。
- **时间轴**：拖动上方标尺或播放头连续定位；下方单击选择、拖动拍点，双击添加。支持以鼠标所在位置缩放、平移、吸附与播放跟随，详见下方。
- **视觉样式**：色盘与各项颜色可独立调整。双侧汇合自动将命中标记置中；“命中竖线与自定义标记”可独立更换中心图案、颜色和大小。
- **保存项目**：顶部显示当前项目名称与保存状态。编辑后约 1 秒自动保存；点击“保存项目”或按 `Ctrl+S` 可立即保存到本机项目库，无素材也可保存草稿。只有状态显示“已保存到本机”才表示此次保存已完成。
- **切换项目**：点击“项目库”可搜索、打开、复制或删除已有项目；点击“新建项目”开始另一份创作。打开其他项目或新建前会先保存当前进度，保存失败则保留当前编辑内容。重新打开网页会恢复上次使用的项目。
- **恢复范围**：项目保留素材关联、拍点及响度、BPM、视觉样式、两种内嵌图片、导出名称/尺寸/帧率/模式，以及识别设置、播放位置、时间轴缩放等编辑设置。撤销历史、正在进行的分析/导出任务，以及浏览器文件夹授权不跨项目恢复。
- **项目交换与备份**：“导出 JSON”可另存项目，“导入 JSON”会在项目库中创建独立项目，兼容已有 version:1 文件。JSON **不包含音乐或视频本体**；原素材仍在本地时可直接恢复，素材已移除或换电脑时，需按提示重新上传原素材，拍点和样式会保留。
- **多窗口与异常**：同一项目被其他窗口更新后会停止覆盖并提示冲突，请先导出 JSON 备份当前内容，再刷新页面读取最新版本。网络或磁盘出错时可点击保存重试。删除项目需要确认，仅删除项目记录，原始素材仍保留。
- **Funscript**：导入时将位置 `>= 50` 的 action 视为拍点，适合本工具导出的单向脉冲数据；复杂连续运动脚本可能需要手动整理。

### 时间轴交互

- 上方标尺用于拖动播放头；拍点所在区域用于选择和移动拍点。一段拖动操作只生成一次撤销记录。
- 滚轮以光标下的时间位置为中心缩放；`Shift+滚轮`、横向滚轮或中键拖动左右平移。缩放时只绘制可见画布，长素材不会分配超大位图。
- “适应全长”“定位播放头”“上一拍 / 下一拍”用于快速导航。播放跟随可关闭；拖动到视口边缘会继续平移。
- “吸附 ¼ 拍”按当前 BPM 网格吸附，阈值为 10 个显示像素；按住 `Alt` 可临时精调。

### 识别与分贝深浅

“鼓点起音”保留检测到的敲击；“稳定节奏”保守过滤偏离主节奏的弱起音，不会自动补造缺失拍点。算法使用多频段对数频谱变化、局部自适应阈值、持续音抑制和瞬态位置校准；分批处理频谱以控制长音频的内存占用。

分贝配色使用原始音频中每个起音前 10 ms 至后 40 ms 的 RMS **dBFS**，不是声压级或硬件音量。数值越大越亮；暗色/亮色阈值可调。选中拍点可查看实测值，自定义鼓点图片同步调整亮度。手工拍点和未包含响度的旧项目使用强度估算，界面会显示“手工强度”；重新分析可得到实测值。

### 快捷键

| 按键                        | 操作                 |
| --------------------------- | -------------------- |
| `Space`                     | 播放 / 暂停          |
| `F`                         | 录制开启时打点       |
| `A`                         | 在当前时间添加拍点   |
| `←` / `→`                   | 按当前帧率步进一帧   |
| `Shift + ←` / `Shift + →`   | 微调选中拍点 10 ms   |
| `Delete`                    | 删除选中拍点         |
| `Ctrl+Z` / `Ctrl+Shift+Z`   | 撤销 / 重做          |
| `Ctrl+S`                    | 保存项目             |
| 时间轴上的滚轮              | 以鼠标位置为中心缩放 |
| `Shift+滚轮` / 中键拖动     | 左右平移时间轴       |
| 时间轴聚焦后 `Home` / `End` | 跳到素材开头 / 结尾  |
| 时间轴聚焦后 `+` / `-`      | 放大 / 缩小          |
| 拖动拍点时按住 `Alt`        | 临时绕过吸附         |

## 导出格式

| 模式         | 容器 / 编码                      | 适用场景                                                       |
| ------------ | -------------------------------- | -------------------------------------------------------------- |
| 素材合成     | MP4 / H.264；可选 AAC 音频       | 视频保留原画面并等比缩放补边；纯音乐生成自定义背景色的节奏画布 |
| 绿幕 BeatBar | MP4 / H.264；可选 AAC 音频       | 独立绿幕轨道，背景 RGB `0,255,0`，供剪辑软件抠像               |
| 透明 BeatBar | WebM / VP9 Alpha；可选 Opus 音频 | 独立透明轨道，供支持 WebM Alpha 的剪辑软件叠加                 |

- 输出覆盖素材完整时长。导出期间锁定编辑，页面显示进度并支持取消。
- 无音轨视频导出时不会生成空音轨；可连续导出多个版本，下载列表保留在当前页面。
- 绿幕使用有损编码，边缘可能需要调节抠像容差。
- 部分播放器把透明 WebM 显示成黑底，不代表 Alpha 丢失。请用支持 Alpha 的剪辑软件叠加验证。使用 FFmpeg 检查时，输入前指定 `-c:v libvpx-vp9`；原生 VP9 解码器可能不输出 Alpha。
- 轨道底色本身不透明；透明模式下，轨道以外的背景透明。

### 保存位置与文件命名

- **浏览器下载目录**：渲染完成后点击下载按钮；保存位置由浏览器设置决定。
- **每次选择完整保存路径**：点击开始导出后选择路径与名称，再开始渲染；取消选择不会启动任务。完成后流式写入该文件。
- **选择文件夹**：当前页面会话记住所选文件夹；同名文件自动附加 ` (1)`、` (2)` 等序号。刷新页面后需重新选择授权。
- 可输入中文名称，扩展名按输出模式自动使用 `.mp4` / `.webm`。不支持的路径字符会在最终文件名中规范化；完整路径请通过保存选择器设置。
- 直接选路径/文件夹依赖浏览器 File System Access API，推荐在本机地址使用 Chrome / Edge。不支持时对应按钮禁用，仍可使用普通下载或启用浏览器“下载前询问保存位置”。
- 保存失败时渲染结果仍保留在下载列表，可重新下载。后端仍在 `data/exports` 保存 UUID 命名的中间成品，所选目标位置是额外保存的最终文件。

## 数据、限制与隐私

| 项目       | 当前限制 / 行为                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| 上传       | 单文件不超过 512 MiB，时长大于 0 且不超过 20 分钟；源视频每边不超过 8192 像素                                          |
| 导出       | 每边 64–1920 像素，最高 60 FPS；还受最多 180,000 帧和总像素帧预算限制                                                  |
| 自定义图片 | 不超过 2 MiB；宽高各不超过 4096 像素；PNG / JPG / WebP                                                                 |
| 分析方法   | 本地多频段对数频谱起音、局部自适应阈值与瞬态校准；不是乐器分离模型；复杂混音、人声与弱鼓点可能产生漏点、多点或半拍 BPM |
| 文件保存   | 默认在本地数据目录保存上传素材、元数据、项目和导出文件，不自动清理                                                     |
| 项目记录   | 每份 JSON 不超过 20 MB，最多 100,000 个拍点；磁盘持久化，服务重启后可重新打开                                          |
| 任务状态   | 保存在进程内存中；服务重启后不恢复正在进行的任务                                                                       |
| 访问范围   | 默认仅监听 `127.0.0.1:8000`；没有登录、用户隔离或云存储                                                                |

素材、拍点和导出文件通过本机服务处理，不会由应用上传到 GitHub。首次安装依赖会连接软件包源；若分享项目 JSON，其中内嵌的自定义图案也会一起分享。

数据默认位于 `data/media`、`data/projects` 和 `data/exports`；项目按独立 UUID JSON 文件保存，浏览器只记住上次打开的项目 ID。备份整个数据目录可一并保留素材与项目，单独交换作品可导出项目 JSON。服务关闭后可手动清理不再使用的文件；删除原素材会影响已保存项目的直接恢复。可在启动前设置 `BEATBAR_DATA_DIR`，将数据放到其他目录，例如：

```powershell
$env:BEATBAR_DATA_DIR = 'D:\BeatBarData'
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

不要将数据目录指向前端静态资源目录。本项目按单机使用设计；若改为外网服务，应另行实现认证、访问控制、任务隔离与存储管理。

## 常见问题

**页面打不开？** 先确认命令行服务仍在运行，再访问 http://127.0.0.1:8000/ 。查看 http://127.0.0.1:8000/api/health 是否返回 `{"status":"ok"}`。若 8000 端口被占用，可在手动启动命令中改为 `--port 8001`，并访问对应端口。

**更新后仍是旧界面？** 按 `Ctrl+F5` 强制刷新。不要直接双击前端 HTML 文件。

**依赖下载失败？** 检查网络后重新执行依赖安装命令；如需使用镜像，可自行添加 `-i` 参数。无需修改系统 PowerShell 执行策略，优先使用启动批处理或手动启动命令。

**文件能分析但不能在网页播放？** 浏览器和 FFmpeg 支持的格式不完全相同。视频推荐 H.264 + AAC 的 MP4；遇到浏览器不支持的编码，可先转为兼容格式。

**无声视频不能自动识别？** 自动识别需要音轨；无声视频仍可手工打点、BPM 填充和导出。

**拍点不准？** 先调整分析频段、灵敏度与最小间隔，再用整体偏移和手工编辑校准。

**导出慢或提示资源超限？** 先降低分辨率、帧率或素材时长。20 分钟和 1920 像素是各自上限，不代表所有极限组合都能通过总像素帧预算。

**保存项目后找不到素材？** 项目不打包原始音乐/视频。保留原文件，按页面提示重新关联；换电脑时同时带上原素材和项目 JSON。

## 开发与测试

前端使用原生 HTML / CSS / JavaScript，无构建步骤；后端为 FastAPI + NumPy / SciPy + Pillow，通过独立 FFmpeg 进程编码。

```text
backend/
  main.py                    本地 API、视频渲染与命名下载
  projects.py                项目库 CRUD、修订冲突检查与原子文件保存
  test_projects.py           项目持久化、并发修订与写入失败保护测试
  detection.py               自适应多频段节拍检测与实测响度
  test_detection.py          识别准确性、静音/持续音与长音频边界测试
  test_studio.py             分贝、命中标记、命名及 Range 下载测试
  test_backend.py            后端集成与视觉渲染测试
  test_learning.py           学习文档、样例、下载和教学参数测试
frontend/
  index.html                 中文工作台
  app.js                     媒体、工作台与项目状态恢复
  projects.js                项目库界面、自动保存与安全切换
  timeline.js                视口绘制、拖动、缩放、吸附与平移
  export.js                  浏览器保存路径、文件夹与流式保存
  visuals.js                 色盘、图案与 Canvas 动画
  style.css                  响应式界面
  help.html / help.js / help.css  学习中心、全文搜索和样例下载
  markdown.js                安全 Markdown 渲染、锚点与代码复制
docs/                        11 篇教程、架构/API/部署说明和可复现样例
scripts/
  beatbar_client.py           HTTP/Python 客户端及 health/analyze/render 命令
  benchmark-api.py            顺序 API 性能采样和四种规格导出
  build-code-map.mjs          Python/JavaScript 源码索引生成与校验
  generate-learning-examples.py  生成确定性教学 WAV 和项目
  test-docs.mjs               文档链接、样例和源码索引检查
  help-unit-test.mjs          学习中心加载/搜索竞态和安全渲染断言
  help-browser-test.mjs       学习中心页面、练习导入和多尺寸回归
  generate-fixtures.py        生成合成测试素材
  browser-test.mjs            基础浏览器回归
  visual-browser-test.mjs     新样式与纯音乐回归
  studio-unit-test.mjs        时间坐标、分贝配色、保存句柄及重名处理
  studio-browser-test.mjs     剪辑交互、新样式、命名保存端到端回归
  project-manager-test.mjs    自动保存、并发编辑、失败阻断与恢复单元测试
  project-browser-test.mjs    项目创建/切换/恢复、缺失素材与异常回归
LICENSE                      自有代码 MIT 协议
THIRD_PARTY_NOTICES.md        参考来源、依赖和 FFmpeg 许可说明
licenses/                    保留的第三方协议原文
```

后端测试（Windows，在项目根目录执行；其他平台替换 Python 路径）：

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m unittest discover -s backend -p "test_*.py" -v
```

当前有 68 个后端测试定义，覆盖原有媒体/输出与 Alpha 流程，以及强弱鼓点、安静段落、持续音排除、起音时间、72–180 BPM、响度校准、自定义命中标记、中文命名、UUID 存储隔离及 Range 下载，并验证项目 CRUD、进程重启读取、修订冲突、损坏文件、20 MB / 100,000 拍点边界和写入失败保留原件；学习资源测试还检查 11 章正文、14 个业务路由、音频 Range 下载、配套项目与 120 BPM 教学素材。合成音频测试不代表所有真实音乐都能自动准确识别。

可选前端检查：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:unit
pnpm test:projects
pnpm test:docs
pnpm format
```

浏览器回归会创建和修改项目，请先以独立数据目录启动测试服务（避免操作日常项目），再在另一个 PowerShell 窗口启动专用 Chrome 实例并执行脚本：

```powershell
$env:BEATBAR_DATA_DIR = "$PWD\artifacts\browser-test-data"
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```powershell
.venv\Scripts\python.exe scripts\generate-fixtures.py
Start-Process -FilePath "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" -ArgumentList @('--remote-debugging-port=62880', "--user-data-dir=`"$PWD\artifacts\qa-profile`"", '--headless=new', 'http://127.0.0.1:8000')
node scripts/browser-test.mjs 62880
node scripts/visual-browser-test.mjs 62880
node scripts/studio-browser-test.mjs 62880
node scripts/project-browser-test.mjs 62880
node scripts/help-browser-test.mjs 62880
```

若 Chrome 安装位置不同，请替换可执行文件路径。五套脚本验证上传、编辑、滚轮/拖动、导出、项目创建/切换/恢复、自动保存、缺失素材、失败保护、学习中心搜索/下载/样例练习与多尺寸横向溢出；保存对话框在自动化测试中使用可控句柄替身；测试报告、截图与导出文件保存在测试目录，不纳入版本管理。测试使用独立浏览器配置，不要连接日常使用的浏览器配置。

Python 依赖采用版本范围，未锁定完整依赖树；开发工具版本记录在 [pnpm-lock.yaml](pnpm-lock.yaml)。升级或制作分发包后，应在目标环境重新运行测试并核对依赖许可。

## 开源协议与贡献

本项目自有代码以 **[MIT License](LICENSE)** 发布，允许在保留版权和许可声明的条件下使用、修改、分发及商业使用；软件按协议原文以现状提供。

- 参考项目为 [Rantark/beat-bar-video-creator-with-funscript](https://github.com/Rantark/beat-bar-video-creator-with-funscript)，保留其 [MIT 原文](licenses/Rantark-MIT.txt) 和[参考提交](https://github.com/Rantark/beat-bar-video-creator-with-funscript/tree/87f61b350bb6975b604d9493e6f2298fb7c4c387)。
- 第三方依赖及 FFmpeg 使用各自协议，**不由本项目的 MIT 协议重新授权**。尤其是 FFmpeg 的具体构建可能涉及 GPL / LGPL 和其他组件义务，见[第三方声明](THIRD_PARTY_NOTICES.md)。
- 本仓库不分发 Python 虚拟环境、Node 依赖目录、FFmpeg 可执行文件或用户媒体。若自行打包这些内容，请保留对应声明，并履行该发行物适用的许可证要求。
- 代码许可证不授予用户上传的音乐、视频、图片或第三方商标的使用权；生成视频的传播仍取决于素材本身的授权。

欢迎提交 Issue 或 Pull Request。反馈问题时请附操作系统、浏览器、复现步骤和必要的脱敏日志；优先提供合成测试素材。提交修改前运行与改动相关的检查，并保留已有版权、许可及来源声明。
