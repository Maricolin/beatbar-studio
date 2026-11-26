# 后端代码逻辑

## 应用、数据模型与并发

`main.py` 创建 FastAPI app，先注册项目路由和媒体/任务 API，再挂载 `/learning` 文档静态目录，最后挂载 `/` 前端。更具体的路由必须在根静态服务之前，否则会被前端兜底。

Media 是 dataclass，记录 UUID、显示名、文件路径、时长、宽高、音/视频标记与波形。Job 记录 queued/running/done/error、进度、结果、错误、取消 Event 和锁。MEDIA / JOBS 字典由 STATE_LOCK 协调；每个任务自己的锁保护快照与更新。ThreadPoolExecutor 的 max_workers 为 2，队列与任务状态不是持久化的任务系统。

AnalyzeRequest、Beat、Style、ExportRequest 使用 Pydantic 校验。Beat 时间非负、强度 0–1、响度可空；ExportRequest 最多 100,000 拍且要求按时间升序。Style 校验枚举、颜色、图像依赖与响度上下界。项目文档由独立验证器校验，不等同于一次导出请求；导出时仍要经过更严格的素材范围和资源校验。

## 素材上传与磁盘重载

upload_media 每次读 1 MiB，累计超过 512 MiB 立即报 413，并在探测失败时清理上传文件。显示名由 `_safe_name` 去路径、限长度，磁盘用 UUID 与受限扩展名命名。probe_media 用参数数组运行 FFmpeg，从诊断信息解析输入、时长和流，限制 20 分钟、8192 px 与必须有可读流。

\_compute_waveform 解码 800 Hz 单声道浮点包络，再缩减成最多 256 个最大绝对值桶。上传保存原媒体和 JSON 元数据，响应包括预览 URL 与波形。\_load_media 优先缓存，未命中时检查 32 位十六进制 ID 并读磁盘元数据，因此服务重启后可以重新关联已有素材；文件缺失返回 404。

## 音频解码与起音算法

\_decode_audio 用 FFmpeg 输出 22,050 Hz、单声道 f32le PCM，分块读入并检查取消和解码体积；独立线程排空 stderr。analyze_audio 要求有音轨和至少 0.25 秒音频，再调用 detection.detect_beats。

算法顺序：

1. 校验一维 PCM、采样率、参数与 Nyquist 频率，截断到声明时长；非有限采样按静音处理。
2. 按约 46 ms 的 FFT 窗、1/8 窗 hop 分帧，用 512 帧批次控制频谱中间内存。
3. 在用户选频内按倍频程附近边界分带；Hann 窗、幅度归一化、log1p 压缩。
4. 用频率局部最大参考与上一帧比较，只取正向变化，抑制持续音和轻微频率扰动。
5. 约 0.55 秒局部中位数和 MAD 构建自适应基线；灵敏度控制门槛，找峰得到候选。
6. 回到原采样包络细化起音，比较起音前后能量，剔除持续音与文件左边界的伪起音。
7. 候选按显著性从强到弱执行最小间隔抑制，再按时间排序。
8. \_tempo 在 60–200 BPM 网格上比较覆盖、占用与残差，证据不足返回 BPM 0。
9. rhythm 模式仅在至少 5 个支持点、足够置信度/覆盖与跨度时过滤弱离网点，不补点。
10. 用显著性归一化 strength；每点从原始样本起音前 10 ms 至后 40 ms 计算 RMS dBFS，返回 beats、bpm 和 analysis 元数据。

低频段并不是分离出一个鼓轨；稳定节奏模式也不是节拍生成器。参数和完整输出示例见 [API 文档](api.md)。

## 后台任务和取消

start_analysis / start_export 校验入口后创建 Job 并提交线程池，立即返回 202 与 ID。工作函数更新进度；成功填 result，异常（包括用户取消）转换为 error 与文字信息。前端要查询最终状态，不能把 202 或取消请求的返回当作完成。取消 Event 在解码、检测、逐帧渲染等检查点生效，未必即时停止。

服务重启丢失 JOBS，查询旧任务会 404；这不会自动删除已写入素材/项目。当前没有任务恢复、自动重试队列或多用户配额。

## Pillow 叠加层与 FFmpeg 导出

\_parse_color 支持 #RGB、#RRGGBB 和有限常见色名。\_load_pattern_image 校验 Data URL、base64、2 MiB、格式及 4096 px 边界，应用 EXIF 方向，转换 RGBA 并缩到最多 512 px。

\_draw_beat_shape 画内置图形；\_loudness_amount / \_beat_color 与前端对应；\_render_overlay 构造 RGBA 轨道，二分选取当前命中窗口与未来 speed 窗口的拍点，计算方向位置、强度尺寸，绘制裁剪鼓点、命中动画和独立标记。图片按尺寸缓存，避免每帧反复缩放相同图案。

\_ffmpeg_export 计算 ceil(duration × fps)，检查 180,000 帧及 1e12 像素帧，再以 RGBA rawvideo 管道逐帧写给 FFmpeg。三种分支：

| 分支        | 底层与编码                                                          |
| ----------- | ------------------------------------------------------------------- |
| composite   | 视频等比缩放/补边，或纯音乐用背景色画布；叠加轨道；H.264 + 可选 AAC |
| green       | 将轨道叠到不透明绿色；H.264 + 可选 AAC                              |
| transparent | 保留 Alpha，VP9 / yuva420p / auto-alt-ref 0；可选 Opus，WebM        |

stderr 由线程排空，异常时关闭管道、终止并必要时 kill 子进程。\_run_export 先写 `.part` 临时成品，成功再 replace，结果返回逻辑文件名、UUID 存储文件名、URL 和字节数；失败清理临时文件。保存到用户指定目录由浏览器执行，后端不接受任意客户端路径。

## 预览与下载的 Range

\_range_response 支持一个 `bytes=start-end`、`bytes=start-` 或后缀范围，无 Range 返回完整文件，合法范围返回 206，不合法或越界返回 416 与 Content-Range。分块读取，响应包含 Accept-Ranges，以及 ASCII 回退名和 UTF-8 filename\*。导出下载只接受 `beatbar-<uuid>.mp4/webm`，downloadName 只能改变展示文件名，不能选择服务器路径。

## 项目持久化

projects.py 的 ProjectStore 每次按 ID 从 DATA_ROOT/projects 读取，不依赖进程内项目缓存。校验 version:1、beats、媒体引用、可选 style/editorSettings/exportSettings、有限 JSON 数值、层级与体积。列表跳过损坏的单份记录，但读写 I/O 错误仍需报告。

创建生成 ID、createdAt、updatedAt、revision=1；更新和删除必须提供匹配 revision，否则 409。写入先完整编码，再 mkstemp 同目录临时文件、flush、fsync、os.replace，失败不覆盖原记录。模块级 RLock 防止单进程线程互相踩写，不是跨多个服务进程的文件锁。删除项目只 unlink 项目文件，未做素材引用计数或自动清理。

## 启动与后续维护点

start.bat 进入 PowerShell 脚本；start.ps1 固定到仓库目录、按需创建 .venv、检测运行依赖，缺失时安装，调用 launch_browser.py 等待后打开浏览器，再启动本机 uvicorn。Python 依赖是版本范围，不等同于完整锁定依赖树。

新增视觉字段应同步 Python Style / Pillow 与 JavaScript DEFAULT_STYLE / Canvas / 项目恢复；新增文件格式应同步校验、预览与测试；拆分渲染服务前需要设计持久队列、存储清理和跨进程并发控制。详细具名函数位置见 [源码符号索引](source-index.md)。
