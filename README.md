# BeatBar Studio

本地运行的中文 Web 节奏条编辑器。单独上传一首音乐或一个视频，即可识别拍点、手工编排节奏、设计鼓点样式，并导出合成视频、绿幕轨道或透明轨道。

**自有代码协议：[MIT](LICENSE)** · **第三方声明：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** · **问题反馈：[GitHub Issues](https://github.com/Maricolin/beatbar-studio/issues)**

## 功能概览

| 功能       | 支持内容                                                                           |
| ---------- | ---------------------------------------------------------------------------------- |
| 单文件导入 | 音乐或视频任选其一；不要求同时上传两种素材                                         |
| 自动识别   | 综合、低频鼓点、中频敲击、高频踩镲；灵敏度和最小间隔可调                           |
| 手工编辑   | 跟随播放录制、时间轴添加/拖动、精确时间与强度、撤销/重做、整体偏移、隔拍、BPM 填充 |
| 主题与颜色 | 6 套色盘；自定义主色、副色、轨道底色和纯音乐画布背景                               |
| 鼓点配色   | 统一主色、双色交替、按拍点强度渐变                                                 |
| 图案       | 圆点、菱形、三角、星芒、胶囊、六边形、心形；可上传 PNG / JPG / WebP                |
| 运动       | 从右向左、从左向右、双侧同时向中心汇合                                             |
| 命中动效   | 涟漪、闪光、粒子爆发或关闭；持续时间和强度可调                                     |
| 实时预览   | 无素材也能试样式；上传后随播放预览，支持调整鼓点大小、轨道尺寸和位置               |
| 项目与交换 | 项目 JSON 保存/恢复；拍点 JSON 与 Funscript 导入/导出                              |
| 视频输出   | MP4 合成、MP4 绿幕、WebM VP9 Alpha 透明轨道；音频可选                              |

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

## 先用两分钟验证效果

1. **试样式**：在右侧切换色盘、图案与动效，查看实时小预览；此步骤不需要上传素材。
2. **导入**：选择一段较短的音乐或视频，等待波形加载。
3. **识别**：点击“分析音乐，生成拍点”，然后播放。无音轨视频可改用手动打点或 BPM 填充。
4. **看汇合**：将运动设为“双侧汇合”，配色设为双色交替，观察两侧鼓点到达中心后的动画。
5. **试图案**：上传一张带透明背景的 PNG，查看缩略图与播放效果；非方形图片保持比例。
6. **导出**：先选择 640×360、较低帧率测试，下载后播放。通过后再提高分辨率和帧率。

没有测试素材时，可生成一段合成的 120 BPM 音乐和测试视频，输出到本地测试目录：

```powershell
.venv\Scripts\python.exe scripts\generate-fixtures.py
```

生成文件为项目根目录下的 `beatbar-sample-clicks.wav` 和测试目录下的 `artifacts/sample-120bpm.mp4`；它们不纳入版本管理。

## 编辑与保存

- **自动识别**：调节频段、灵敏度与最小拍点间隔。新识别结果覆盖当前拍点，可撤销。
- **手工录制**：切换“手动打点”，开启录制后跟随播放按 `F` 或点击打点按钮。时间补偿填负数可将拍点提前。
- **时间轴**：单击定位，双击添加拍点；拖动调整时间，选中后可精确输入秒数和强度。支持缩放、逐帧移动、整体偏移、保留隔拍和 BPM 等距填充。
- **视觉样式**：色盘同时设置主副色、轨道底色与音乐画布背景；也可逐项自定义。双侧汇合模式自动将命中线置于轨道中心。
- **保存项目**：项目 JSON 包含素材 ID、拍点、BPM、样式与内嵌自定义图片，**不包含音乐或视频本体**。原素材仍在本地时可直接恢复；素材已移除或换电脑时，需按提示重新关联原素材。
- **Funscript**：导入时将位置 `>= 50` 的 action 视为拍点，适合本工具导出的单向脉冲数据；复杂连续运动脚本可能需要手动整理。

### 快捷键

| 按键                      | 操作               |
| ------------------------- | ------------------ |
| `Space`                   | 播放 / 暂停        |
| `F`                       | 录制开启时打点     |
| `A`                       | 在当前时间添加拍点 |
| `←` / `→`                 | 按当前帧率步进一帧 |
| `Shift + ←` / `Shift + →` | 微调选中拍点 10 ms |
| `Delete`                  | 删除选中拍点       |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做        |
| `Ctrl+S`                  | 保存项目           |

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

## 数据、限制与隐私

| 项目       | 当前限制 / 行为                                                                              |
| ---------- | -------------------------------------------------------------------------------------------- |
| 上传       | 单文件不超过 512 MiB，时长大于 0 且不超过 20 分钟；源视频每边不超过 8192 像素                |
| 导出       | 每边 64–1920 像素，最高 60 FPS；还受最多 180,000 帧和总像素帧预算限制                        |
| 自定义图片 | 不超过 2 MiB；宽高各不超过 4096 像素；PNG / JPG / WebP                                       |
| 分析方法   | 本地频谱起音与峰值分析，不是乐器分离模型；复杂混音、人声与弱鼓点可能产生漏点、多点或半拍 BPM |
| 文件保存   | 默认在本地数据目录保存上传素材、元数据和导出文件，不自动清理                                 |
| 任务状态   | 保存在进程内存中；服务重启后不恢复正在进行的任务                                             |
| 访问范围   | 默认仅监听 `127.0.0.1:8000`；没有登录、用户隔离或云存储                                      |

素材、拍点和导出文件通过本机服务处理，不会由应用上传到 GitHub。首次安装依赖会连接软件包源；若分享项目 JSON，其中内嵌的自定义图案也会一起分享。

数据默认位于 `data/media` 和 `data/exports`。服务关闭后可手动清理不再使用的文件；删除原素材会影响已保存项目的直接恢复。可在启动前设置 `BEATBAR_DATA_DIR`，将数据放到其他目录，例如：

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
  main.py                    本地 API、音频分析与视频渲染
  test_backend.py            后端集成与视觉渲染测试
frontend/
  index.html                 中文工作台
  app.js                     媒体、时间轴与项目交互
  visuals.js                 色盘、图案与 Canvas 动画
  style.css                  响应式界面
scripts/
  generate-fixtures.py        生成合成测试素材
  browser-test.mjs            基础浏览器回归
  visual-browser-test.mjs     新样式与纯音乐回归
LICENSE                      自有代码 MIT 协议
THIRD_PARTY_NOTICES.md        参考来源、依赖和 FFmpeg 许可说明
licenses/                    保留的第三方协议原文
```

后端测试（Windows，在项目根目录执行；其他平台替换 Python 路径）：

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m unittest backend.test_backend -v
```

当前 16 项后端测试覆盖有声/无声视频、纯音乐、三种输出、Alpha、自定义背景色、图片比例、双侧汇合、动效、参数校验与取消。

可选前端检查：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm format
```

浏览器回归需要先启动应用。Windows 下可在另一个 PowerShell 窗口启动专用 Chrome 测试实例，再执行脚本：

```powershell
.venv\Scripts\python.exe scripts\generate-fixtures.py
Start-Process -FilePath "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" -ArgumentList @('--remote-debugging-port=62880', "--user-data-dir=`"$PWD\artifacts\qa-profile`"", '--headless=new', 'http://127.0.0.1:8000')
node scripts/browser-test.mjs 62880
node scripts/visual-browser-test.mjs 62880
```

若 Chrome 安装位置不同，请替换可执行文件路径。两套脚本验证上传、编辑、导出、项目恢复与多尺寸横向溢出；测试报告、截图与导出文件保存在测试目录，不纳入版本管理。测试使用独立浏览器配置，不要连接日常使用的浏览器配置。

Python 依赖采用版本范围，未锁定完整依赖树；开发工具版本记录在 [pnpm-lock.yaml](pnpm-lock.yaml)。升级或制作分发包后，应在目标环境重新运行测试并核对依赖许可。

## 开源协议与贡献

本项目自有代码以 **[MIT License](LICENSE)** 发布，允许在保留版权和许可声明的条件下使用、修改、分发及商业使用；软件按协议原文以现状提供。

- 参考项目为 [Rantark/beat-bar-video-creator-with-funscript](https://github.com/Rantark/beat-bar-video-creator-with-funscript)，保留其 [MIT 原文](licenses/Rantark-MIT.txt) 和[参考提交](https://github.com/Rantark/beat-bar-video-creator-with-funscript/tree/87f61b350bb6975b604d9493e6f2298fb7c4c387)。
- 第三方依赖及 FFmpeg 使用各自协议，**不由本项目的 MIT 协议重新授权**。尤其是 FFmpeg 的具体构建可能涉及 GPL / LGPL 和其他组件义务，见[第三方声明](THIRD_PARTY_NOTICES.md)。
- 本仓库不分发 Python 虚拟环境、Node 依赖目录、FFmpeg 可执行文件或用户媒体。若自行打包这些内容，请保留对应声明，并履行该发行物适用的许可证要求。
- 代码许可证不授予用户上传的音乐、视频、图片或第三方商标的使用权；生成视频的传播仍取决于素材本身的授权。

欢迎提交 Issue 或 Pull Request。反馈问题时请附操作系统、浏览器、复现步骤和必要的脱敏日志；优先提供合成测试素材。提交修改前运行与改动相关的检查，并保留已有版权、许可及来源声明。
