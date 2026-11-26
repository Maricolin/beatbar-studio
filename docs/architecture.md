# 项目结构与数据流

## 技术边界

BeatBar 是单机运行的浏览器工作台。前端是原生 ES Modules，直接由 FastAPI 静态服务返回；没有打包构建步骤。后端使用 NumPy / SciPy 处理音频、Pillow 逐帧绘制，再通过独立 FFmpeg 进程编码。Node.js 与 pnpm 只用于格式检查、索引生成和测试，不是日常运行依赖。

```text
浏览器 / index.html
  └─ app.js：编辑状态与界面事件
      ├─ timeline.js：时间轴坐标、视口与手势
      ├─ visuals.js：样式模型与 Canvas 预览
      ├─ projects.js：保存、项目库与安全切换
      └─ export.js：浏览器保存位置与流式写入
             │ 同源 HTTP / JSON / 媒体 Range
FastAPI / backend/main.py
  ├─ detection.py：PCM → 起音 → BPM / 强度 / 响度
  ├─ projects.py：项目文件 CRUD 与 revision
  ├─ 工作线程池（2 workers）→ 分析任务 / 导出任务
  └─ FFmpeg 子进程 ← Pillow RGBA 帧 / 音视频素材
             │
data/media、data/projects、data/exports
```

## 全部维护目录

| 路径                                                   | 职责                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `backend/main.py`                                      | API 入口、媒体与任务模型、上传、音频解码、Pillow 渲染、FFmpeg、文件响应、静态资源挂载 |
| `backend/detection.py`                                 | 可独立测试的自适应多频段起音与稳定节奏过滤算法                                        |
| `backend/projects.py`                                  | 独立项目路由、文档校验、修订冲突、原子写盘                                            |
| `backend/test_*.py`                                    | 媒体/导出集成、检测、Studio 细节、项目持久化、学习资源五组测试                        |
| `frontend/index.html` / `style.css`                    | 中文工作台的原生控件、对话框与响应式外观                                              |
| `frontend/app.js`                                      | 业务编排和状态真源；将几个独立前端模块连接起来                                        |
| `frontend/timeline.js` / `visuals.js`                  | 编辑视口与播放视觉绘制                                                                |
| `frontend/export.js` / `projects.js`                   | 浏览器文件保存策略、项目管理状态机                                                    |
| `frontend/help.html` / `help.js` / `help.css`          | 文档导航、全文搜索、目录、样例播放下载与响应式阅读                                    |
| `frontend/markdown.js`                                 | 受限 Markdown 到原生 DOM 的渲染，不执行文档里的 HTML 或脚本                           |
| `docs`                                                 | 网页与仓库共享的 Markdown、目录清单、源码索引及教学样例                               |
| `scripts/*test.mjs`                                    | 前端单元与 CDP 浏览器回归；后者依赖专用测试浏览器                                     |
| `scripts/generate-fixtures.py`                         | 生成原有集成测试音视频，不是用户项目                                                  |
| `scripts/generate-learning-examples.py`                | 生成可分发的合成音频、项目、拍点与 Funscript                                          |
| `scripts/build-code-map.mjs`                           | 解析 Python / JavaScript AST，生成函数/路由源码索引                                   |
| `scripts/test-docs.mjs`                                | 文档清单、链接、代码索引、示例数据与网页入口一致性检查                                |
| `scripts/help-browser-test.mjs`                        | 网页教程导航、搜索、安全渲染、下载与移动端回归                                        |
| `start.bat` / `start.ps1` / `launch_browser.py`        | Windows 启动封装、依赖检测、延迟打开浏览器                                            |
| `requirements.txt` / `package.json` / `pnpm-lock.yaml` | Python 运行依赖、前端开发命令及工具依赖锁                                             |
| `LICENSE` / `THIRD_PARTY_NOTICES.md` / `licenses`      | 自有代码协议、第三方来源与许可证原文                                                  |
| `data`                                                 | 默认用户运行数据，不纳入版本管理                                                      |
| `artifacts` / `.venv` / `node_modules`                 | 测试产物与依赖环境，不是业务源码                                                      |

逐个文件的具名符号和实际行号见 [源码符号索引](source-index.md)。静态符号索引不是完整运行时调用图；匿名回调的行为在模块流程说明中归属到对应控件或父流程。

## 六条主要执行链

### 上传与恢复素材

文件选择或拖入 → `upload` 构建 FormData → `POST /api/media` → 分块写入 UUID 文件 → FFmpeg 探测 → 计算波形 → 写元数据 → 返回 Media → `setMedia` 连接 video/audio 与时间轴。已保存项目通过素材 ID 查询元数据，后端缓存缺失时从磁盘重载。

### 自动识别

分析按钮 → 检查素材和参数 → `startJob` → `POST /api/analyze` 返回任务 ID → 两线程执行池运行 `_run_analysis` → 解码单声道 PCM → `detect_beats` → 前端每约 650 ms 查询任务 → 完成后 `replaceBeats` 写入可撤销的新拍点，并更新参考 BPM。

### 手工编辑与实时预览

界面/手势 → `checkpoint` 拍点快照 → 修改同一个 `state.beats` → `changed` 排序、更新选中信息、重画时间轴、通知自动保存。播放时 `requestAnimationFrame` 驱动视觉轨道，时间轴/时间文字约每 33 ms 更新一次。

### 项目保存与切换

编辑 → `changed` 标记 generation → 900 ms 防抖 → capture 项目 → POST / PUT → 后端校验 revision 与文档 → 同目录临时文件、flush/fsync、原子替换。打开其他项目时先读取并 prepare 新数据，再 preserve 当前项目，然后 restore / activate 新记录；保存失败中断切换。

### 导出与保存成品

导出按钮 → 先选择浏览器保存路径 → 锁定编辑 → `POST /api/export` → 资源校验 → 后台逐帧 `_render_overlay` → FFmpeg 编码 `.part` → 成功后更名 → 任务返回下载 URL → 下载列表 / 可选流式写入目标文件。任务失败保留页面，临时成品被清理。

### 帮助中心

工作台“学习教程”链接 → 独立阅读页 → `/learning/catalog.json` → 加载同目录 Markdown → 安全 DOM 渲染。全文搜索读取文档文字；样例只是静态教学下载，不会自动修改项目。`/docs` 仍用于 FastAPI 的接口调试页面。

## 存储与生命周期

| 数据                              | 存储位置                               | 刷新页面 / 重启服务后                      |
| --------------------------------- | -------------------------------------- | ------------------------------------------ |
| 素材与元数据                      | `DATA_ROOT/media/<uuid>.*`、同 ID JSON | 保留，可按 ID 重载                         |
| 项目记录                          | `DATA_ROOT/projects/<uuid>.json`       | 保留；带 name、revision、时间戳和 project  |
| 中间及完成的视频                  | `DATA_ROOT/exports`                    | 成品保留，不自动清理                       |
| MEDIA 缓存、JOBS、取消标记        | Python 内存                            | 服务重启清空；素材可重载，任务不可恢复     |
| 编辑状态、撤销/重做、图片解码对象 | 浏览器内存                             | 部分通过项目恢复，撤销历史不恢复           |
| 上次打开项目 ID                   | 浏览器 localStorage                    | 同一来源和浏览器配置中记忆，可能被用户清除 |
| 文件夹句柄、下载列表              | 当前页面会话                           | 不跨刷新恢复                               |

启动前的环境变量 `BEATBAR_DATA_DIR` 可更改 DATA_ROOT；测试应使用独立目录。默认启动只监听本机地址，未实现用户认证、云同步、多用户隔离和跨进程项目锁。项目 RLock 保护同一进程；不要把多 worker 部署视为跨进程并发写入保证。
