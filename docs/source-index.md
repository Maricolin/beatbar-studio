# 源码符号索引

> 此页由 scripts/build-code-map.mjs 生成，请勿手工改行号。Python 使用 ast，JavaScript 使用本地 Prettier 的 Babel parser；不执行被分析代码。索引覆盖应用、启动、测试与维护代码的文件清单、导入、具名定义、赋值函数、显式事件监听和路由。匿名 Promise/数组回调不单列；静态索引不是动态调用图。

先读 [项目结构与数据流](architecture.md)、[前端代码逻辑](frontend.md) 和 [后端代码逻辑](backend.md) 理解职责，再用此页定位函数。行号相对于仓库源码，修改后执行 `node scripts/build-code-map.mjs` 更新。

## 代码文件总览

| 文件 | 职责 | 行数 | 内容 SHA-256（前 12 位） |
| --- | --- | --- | --- |
| `backend/__init__.py` | 项目入口或配置 | 1 | `e3b0c44298fc` |
| `backend/detection.py` | 离线多频带 onset 检测、节奏估计和 dBFS 测量 | 304 | `c70dd47c1af5` |
| `backend/main.py` | FastAPI 组合、上传、任务、媒体处理、视频渲染和静态站点 | 923 | `6ad3d8880c15` |
| `backend/projects.py` | 项目验证、修订、原子持久化和 CRUD 路由 | 344 | `488b17bf8499` |
| `backend/test_backend.py` | 自动化回归与边界验证 | 314 | `c7a009e19a45` |
| `backend/test_detection.py` | 自动化回归与边界验证 | 193 | `61fa74e4752a` |
| `backend/test_learning.py` | 自动化回归与边界验证 | 106 | `d4260a0e79ef` |
| `backend/test_projects.py` | 自动化回归与边界验证 | 351 | `19a9e64df11c` |
| `backend/test_studio.py` | 自动化回归与边界验证 | 247 | `fb170802f46a` |
| `frontend/app.js` | 工作台编排：编辑状态、素材、打点、项目快照、任务与输出 | 1533 | `f09a96e58b6d` |
| `frontend/export.js` | 浏览器保存位置、输出命名与下载流 | 118 | `d2dbda51a141` |
| `frontend/help.css` | 学习页面的阅读排版、表格滚动与窄屏导航 | 468 | `0e59a0898023` |
| `frontend/help.html` | 独立学习页面、导航、搜索与音频练习区域 | 128 | `0ddc2865341d` |
| `frontend/help.js` | 学习文档加载、目录、全文索引、历史和样例 | 317 | `5477d18fff7b` |
| `frontend/index.html` | 工作台语义结构、控件、对话框和学习入口 | 796 | `f151d19c25e1` |
| `frontend/markdown.js` | 安全 DOM Markdown 子集和代码复制 | 188 | `0216acece427` |
| `frontend/projects.js` | 项目库、自动保存、修订控制、切换和错误保护 | 389 | `ed71015eb7d8` |
| `frontend/style.css` | 工作台布局、视觉控件和响应式样式 | 1506 | `d866f8208f52` |
| `frontend/timeline.js` | 时间坐标、Canvas 波形、拍点手势、缩放和跟随 | 359 | `1e60971e124c` |
| `frontend/visuals.js` | Canvas 节拍预览、样式、颜色和命中效果 | 358 | `3cbb34c9915b` |
| `launch_browser.py` | 等待服务健康后打开本机工作台 | 13 | `2de7f7563bae` |
| `package.json` | 前端开发命令及开发依赖 | 29 | `05e80b6baa24` |
| `requirements.txt` | Python 运行依赖范围 | 8 | `34d798398576` |
| `scripts/beatbar_client.py` | HTTP/Python 客户端与 health/analyze/render 命令行入口 | 170 | `5b365f1b43df` |
| `scripts/benchmark-api.py` | 顺序 HTTP 性能采样、环境记录与四种规格下载 | 53 | `c9c7d3eb5a61` |
| `scripts/browser-test.mjs` | 自动化回归与边界验证 | 227 | `612c53e643c3` |
| `scripts/build-code-map.mjs` | 静态源码索引生成与 --check 校验 | 275 | `a29ab5f8a7eb` |
| `scripts/code-map-python.py` | Python ast 符号提取，不导入业务代码 | 52 | `57db28ecebea` |
| `scripts/generate-fixtures.py` | 开发、测试或分发维护脚本 | 39 | `740033aa4837` |
| `scripts/generate-learning-examples.py` | 确定性生成可分发的学习音频和项目 | 84 | `6cf198b07d26` |
| `scripts/help-browser-test.mjs` | 学习中心浏览器回归与实际练习验证 | 389 | `0a857bfe7651` |
| `scripts/help-unit-test.mjs` | 受控 DOM 下的学习状态、加载竞态和安全 Markdown 回归 | 392 | `f489a58486b6` |
| `scripts/project-browser-test.mjs` | 自动化回归与边界验证 | 490 | `680bd382265a` |
| `scripts/project-manager-test.mjs` | 自动化回归与边界验证 | 561 | `b67cb589a46f` |
| `scripts/studio-browser-test.mjs` | 自动化回归与边界验证 | 363 | `f40c5b8b7d85` |
| `scripts/studio-unit-test.mjs` | 自动化回归与边界验证 | 111 | `3a70d4bb0bc8` |
| `scripts/test-docs.mjs` | 文档链接、样例、关键教学数字和索引校验 | 120 | `8ae6328980a5` |
| `scripts/visual-browser-test.mjs` | 自动化回归与边界验证 | 307 | `ffe9cedf3acd` |
| `start.bat` | Windows 双击启动入口 | 4 | `7a26488568d3` |
| `start.ps1` | Windows 虚拟环境、缺失依赖安装与服务启动 | 22 | `1a5db7cdec32` |

## 业务路由定位

projects.py 的 router 另有 `/api/projects` 前缀；FastAPI 自带 `/docs`、`/redoc` 和 `/openapi.json` 不计入业务接口。

| 方法 | 完整路径 | 处理函数 | 源码行 |
| --- | --- | --- | --- |
| GET | `/api/health` | `health` | `backend/main.py:205` |
| POST | `/api/media` | `upload_media` | `backend/main.py:210` |
| GET | `/api/media/{media_id}/file` | `media_file` | `backend/main.py:310` |
| GET | `/api/media/{media_id}` | `get_media` | `backend/main.py:317` |
| POST | `/api/analyze` | `start_analysis` | `backend/main.py:416` |
| POST | `/api/export` | `start_export` | `backend/main.py:859` |
| GET | `/api/jobs/{job_id}` | `get_job` | `backend/main.py:881` |
| POST | `/api/jobs/{job_id}/cancel` | `cancel_job` | `backend/main.py:886` |
| GET | `/api/exports/{filename}` | `download_export` | `backend/main.py:897` |
| GET | `/api/projects` | `create_router.list_projects` | `backend/projects.py:322` |
| POST | `/api/projects` | `create_router.create_project` | `backend/projects.py:326` |
| GET | `/api/projects/{project_id:path}` | `create_router.get_project` | `backend/projects.py:330` |
| PUT | `/api/projects/{project_id:path}` | `create_router.update_project` | `backend/projects.py:334` |
| DELETE | `/api/projects/{project_id:path}` | `create_router.delete_project` | `backend/projects.py:338` |

## backend/__init__.py

项目入口或配置。

静态导入：无显式导入。

此文件没有单列的具名类或函数定义。

## backend/detection.py

离线多频带 onset 检测、节奏估计和 dBFS 测量。

静态导入：`__future__`、`bisect`、`math`、`numpy`、`scipy.fft`、`scipy.ndimage`、`scipy.signal`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `23 · _check_cancel` | 函数 | `_check_cancel(cancel) -> None` |
| `30 · _report` | 函数 | `_report(progress, value: int, message: str) -> None` |
| `35 · _samples` | 函数 | `_samples(audio: np.ndarray, start: int, stop: int) -> np.ndarray` |
| `41 · _features` | 函数 | `_features(audio, sample_rate, n_fft, hop, low_hz, high_hz, cancel, progress)` |
| `92 · _refine_onset` | 函数 | `_refine_onset(audio, sample_rate, frame_time, n_fft)` |
| `131 · _loudness_db` | 函数 | `_loudness_db(audio, sample_rate, time)` |
| `140 · _tempo` | 函数 | `_tempo(times, cancel)` |
| `196 · detect_beats` | 函数 | `detect_beats(signal: np.ndarray, sample_rate: int, duration: float, *, sensitivity: int=50, min_interval: float=0.18, low_hz: float=40, high_hz: float=3000, mode: str='onsets', cancel=None, progress=None) -> dict` |

## backend/main.py

FastAPI 组合、上传、任务、媒体处理、视频渲染和静态站点。

静态导入：`PIL`、`__future__`、`backend.detection`、`backend.projects`、`base64`、`bisect`、`concurrent.futures`、`dataclasses`、`fastapi`、`fastapi.responses`、`fastapi.staticfiles`、`imageio_ffmpeg`、`io`、`json`、`math`、`mimetypes`、`numpy`、`os`、`pathlib`、`pydantic`、`re`、`scipy.signal`、`shutil`、`subprocess`、`threading`、`time`、`typing`、`urllib.parse`、`uuid`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `52 · Media` | 类 | `Media()` |
| `65 · Job` | 类 | `Job()` |
| `76 · Job.snapshot` | 函数 | `snapshot(self) -> dict[str, Any]` |
| `97 · media_dir` | 函数 | `media_dir() -> Path` |
| `101 · export_dir` | 函数 | `export_dir() -> Path` |
| `105 · _safe_name` | 函数 | `_safe_name(name: str \| None) -> str` |
| `111 · _run_capture` | 函数 | `_run_capture(args: list[str], timeout: float=25) -> tuple[int, bytes, bytes]` |
| `122 · probe_media` | 函数 | `probe_media(path: Path) -> tuple[float, int \| None, int \| None, bool, bool]` |
| `148 · _load_media` | 函数 | `_load_media(media_id: str) -> Media` |
| `173 · _job` | 函数 | `_job(job_id: str) -> Job` |
| `181 · _set_job` | 函数 | `_set_job(job: Job, *, status: str \| None=None, progress: int \| None=None, message: str \| None=None, result: dict[str, Any] \| None=None, error: str \| None=None) -> None` |
| `197 · _create_job` | 函数 | `_create_job(kind: str) -> Job` |
| `205 · health` | 函数 | `health() -> dict[str, str]` |
| `210 · upload_media` | 函数 | `upload_media(file: UploadFile=File(...)) -> dict[str, Any]` |
| `256 · _compute_waveform` | 函数 | `_compute_waveform(path: Path, duration: float, has_audio: bool) -> list[float]` |
| `272 · _range_response` | 函数 | `_range_response(path: Path, range_header: str \| None, media_type: str, filename: str \| None=None)` |
| `296 · _range_response.stream` | 函数 | `stream()` |
| `310 · media_file` | 函数 | `media_file(media_id: str, range_header: str \| None=Header(default=None, alias='Range'))` |
| `317 · get_media` | 函数 | `get_media(media_id: str) -> dict[str, Any]` |
| `324 · AnalyzeRequest` | 类 | `AnalyzeRequest(BaseModel)` |
| `334 · AnalyzeRequest.validate_band` | 函数 | `validate_band(cls, value: float, info)` |
| `343 · _decode_audio` | 函数 | `_decode_audio(media: Media, cancel: threading.Event) -> np.ndarray` |
| `347 · _decode_audio.drain` | 函数 | `drain()` |
| `384 · analyze_audio` | 函数 | `analyze_audio(media: Media, req: AnalyzeRequest, cancel: threading.Event, progress=None) -> dict[str, Any]` |
| `400 · _run_analysis` | 函数 | `_run_analysis(job: Job, req: AnalyzeRequest)` |
| `416 · start_analysis` | 函数 | `start_analysis(req: AnalyzeRequest) -> dict[str, str]` |
| `423 · Beat` | 类 | `Beat(BaseModel)` |
| `428 · Style` | 类 | `Style(BaseModel)` |
| `456 · Style.valid_color` | 函数 | `valid_color(cls, value: str)` |
| `462 · Style.valid_color_mode` | 函数 | `valid_color_mode(cls, value: str)` |
| `468 · Style.custom_pattern_has_image` | 函数 | `custom_pattern_has_image(self)` |
| `479 · Style.valid_pattern` | 函数 | `valid_pattern(cls, value: str)` |
| `486 · Style.valid_motion` | 函数 | `valid_motion(cls, value: str)` |
| `493 · Style.valid_hit_effect` | 函数 | `valid_hit_effect(cls, value: str)` |
| `498 · ExportRequest` | 类 | `ExportRequest(BaseModel)` |
| `511 · ExportRequest.valid_filename` | 函数 | `valid_filename(cls, value)` |
| `523 · ExportRequest.valid_mode` | 函数 | `valid_mode(cls, v: str)` |
| `530 · ExportRequest.ordered_and_bounded_beats` | 函数 | `ordered_and_bounded_beats(cls, beats: list[Beat])` |
| `536 · _parse_color` | 函数 | `_parse_color(value: str) -> tuple[int, int, int]` |
| `546 · _load_pattern_image` | 函数 | `_load_pattern_image(data: str \| None) -> Image.Image \| None` |
| `569 · _draw_beat_shape` | 函数 | `_draw_beat_shape(draw: ImageDraw.ImageDraw, pattern: str, cx: float, cy: float, radius: int, fill)` |
| `602 · _mix_color` | 函数 | `_mix_color(a, b, amount)` |
| `606 · _loudness_amount` | 函数 | `_loudness_amount(style, strength, db=None)` |
| `611 · _beat_color` | 函数 | `_beat_color(style: Style, index: int, strength: float, side: int=0, db=None)` |
| `622 · _render_overlay` | 函数 | `_render_overlay(width: int, height: int, beats: list[Beat], t: float, style: Style, pattern_image: Image.Image \| None=None, pattern_cache=None, beat_times=None, marker_image=None)` |
| `716 · _output_path` | 函数 | `_output_path(job: Job, mode: str) -> tuple[Path, str]` |
| `723 · _ffmpeg_export` | 函数 | `_ffmpeg_export(media: Media, req: ExportRequest, job: Job, output: Path, duration: float)` |
| `774 · _ffmpeg_export.drain_stderr` | 函数 | `drain_stderr()` |
| `824 · _run_export` | 函数 | `_run_export(job: Job, req: ExportRequest)` |
| `859 · start_export` | 函数 | `start_export(req: ExportRequest) -> dict[str, str]` |
| `881 · get_job` | 函数 | `get_job(job_id: str) -> dict[str, Any]` |
| `886 · cancel_job` | 函数 | `cancel_job(job_id: str) -> dict[str, Any]` |
| `897 · download_export` | 函数 | `download_export(filename: str, downloadName: str \| None=None, range_header: str \| None=Header(default=None, alias='Range'))` |

## backend/projects.py

项目验证、修订、原子持久化和 CRUD 路由。

静态导入：`__future__`、`datetime`、`fastapi`、`json`、`math`、`os`、`pathlib`、`re`、`tempfile`、`threading`、`typing`、`uuid`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `24 · _invalid` | 函数 | `_invalid(detail: str) -> None` |
| `28 · _number` | 函数 | `_number(value: Any, label: str, minimum: float \| None=None, maximum: float \| None=None) -> None` |
| `44 · _json_tree` | 函数 | `_json_tree(value: Any) -> None` |
| `71 · validate_project` | 函数 | `validate_project(project: Any) -> dict[str, Any]` |
| `111 · _name` | 函数 | `_name(value: Any) -> str` |
| `119 · _revision` | 函数 | `_revision(value: Any) -> int` |
| `125 · _timestamp` | 函数 | `_timestamp(value: Any) -> datetime` |
| `134 · _now` | 函数 | `_now(previous: str \| None=None) -> str` |
| `141 · _encode` | 函数 | `_encode(record: dict[str, Any]) -> bytes` |
| `152 · ProjectStore` | 类 | `ProjectStore()` |
| `155 · ProjectStore.__init__` | 函数 | `__init__(self, data_root: Callable[[], Path])` |
| `158 · ProjectStore._directory` | 函数 | `_directory(self) -> Path` |
| `164 · ProjectStore._path` | 函数 | `_path(self, project_id: str) -> Path` |
| `172 · ProjectStore._read` | 函数 | `_read(self, project_id: str) -> dict[str, Any]` |
| `199 · ProjectStore._write` | 函数 | `_write(self, record: dict[str, Any]) -> None` |
| `221 · ProjectStore.list` | 函数 | `list(self) -> list[dict[str, Any]]` |
| `250 · ProjectStore.get` | 函数 | `get(self, project_id: str) -> dict[str, Any]` |
| `254 · ProjectStore.create` | 函数 | `create(self, body: dict[str, Any]) -> dict[str, Any]` |
| `266 · ProjectStore.update` | 函数 | `update(self, project_id: str, body: dict[str, Any]) -> dict[str, Any]` |
| `279 · ProjectStore.delete` | 函数 | `delete(self, project_id: str, revision: int) -> dict[str, bool]` |
| `292 · _body` | 异步函数 | `async _body(request: Request) -> dict[str, Any]` |
| `317 · create_router` | 函数 | `create_router(data_root: Callable[[], Path]) -> APIRouter` |
| `322 · create_router.list_projects` | 函数 | `list_projects() -> dict[str, Any]` |
| `326 · create_router.create_project` | 异步函数 | `async create_project(request: Request) -> dict[str, Any]` |
| `330 · create_router.get_project` | 函数 | `get_project(project_id: str) -> dict[str, Any]` |
| `334 · create_router.update_project` | 异步函数 | `async update_project(project_id: str, request: Request) -> dict[str, Any]` |
| `338 · create_router.delete_project` | 函数 | `delete_project(project_id: str, request: Request) -> dict[str, bool]` |

## backend/test_backend.py

自动化回归与边界验证。

静态导入：`PIL`、`__future__`、`array`、`backend.main`、`base64`、`fastapi.testclient`、`io`、`json`、`os`、`pathlib`、`subprocess`、`sys`、`tempfile`、`threading`、`time`、`unittest`、`unittest.mock`、`wave`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `29 · BeatBarIntegrationTests` | 类 | `BeatBarIntegrationTests(unittest.TestCase)` |
| `31 · BeatBarIntegrationTests.setUpClass` | 函数 | `setUpClass(cls)` |
| `82 · BeatBarIntegrationTests._wait_job` | 函数 | `_wait_job(self, job_id: str, timeout: int=60)` |
| `93 · BeatBarIntegrationTests.test_health_metadata_and_range` | 函数 | `test_health_metadata_and_range(self)` |
| `108 · BeatBarIntegrationTests.test_analyze_synthetic_click_track` | 函数 | `test_analyze_synthetic_click_track(self)` |
| `120 · BeatBarIntegrationTests.test_all_export_modes_and_alpha_audio` | 函数 | `test_all_export_modes_and_alpha_audio(self)` |
| `151 · BeatBarIntegrationTests.test_all_export_modes_and_alpha_audio.decode_frame` | 函数 | `decode_frame(video_path)` |
| `168 · BeatBarIntegrationTests.test_analyze_video_without_audio_returns_clear_error` | 函数 | `test_analyze_video_without_audio_returns_clear_error(self)` |
| `175 · BeatBarIntegrationTests.test_export_cancellation` | 函数 | `test_export_cancellation(self)` |
| `177 · BeatBarIntegrationTests.test_export_cancellation.block_until_cancel` | 函数 | `block_until_cancel(media, request, job, output, duration)` |
| `195 · BeatBarIntegrationTests.test_validation_rejects_out_of_range_and_nonmonotonic_beats` | 函数 | `test_validation_rejects_out_of_range_and_nonmonotonic_beats(self)` |
| `202 · BeatBarIntegrationTests.test_audio_only_export_with_custom_pattern_and_meet_motion` | 函数 | `test_audio_only_export_with_custom_pattern_and_meet_motion(self)` |
| `224 · BeatBarIntegrationTests.test_audio_palette_background_and_silent_video_exports` | 函数 | `test_audio_palette_background_and_silent_video_exports(self)` |
| `249 · BeatBarIntegrationTests.test_invalid_custom_image_is_rejected_before_job` | 函数 | `test_invalid_custom_image_is_rejected_before_job(self)` |
| `253 · BeatBarIntegrationTests.test_export_rejects_unknown_visual_style` | 函数 | `test_export_rejects_unknown_visual_style(self)` |
| `258 · VisualRendererTests` | 类 | `VisualRendererTests(unittest.TestCase)` |
| `259 · VisualRendererTests.render` | 函数 | `render(self, time=0, **style)` |
| `265 · VisualRendererTests.test_meet_has_symmetric_different_colors` | 函数 | `test_meet_has_symmetric_different_colors(self)` |
| `274 · VisualRendererTests.test_left_motion_uses_marker_distance` | 函数 | `test_left_motion_uses_marker_distance(self)` |
| `279 · VisualRendererTests.test_effect_extends_above_track_and_expires` | 函数 | `test_effect_extends_above_track_and_expires(self)` |
| `288 · VisualRendererTests.test_new_shapes_are_distinct_and_scale_changes_size` | 函数 | `test_new_shapes_are_distinct_and_scale_changes_size(self)` |
| `297 · VisualRendererTests.test_style_validation` | 函数 | `test_style_validation(self)` |
| `305 · VisualRendererTests.test_custom_stamp_keeps_aspect_and_alpha` | 函数 | `test_custom_stamp_keeps_aspect_and_alpha(self)` |

## backend/test_detection.py

自动化回归与边界验证。

静态导入：`__future__`、`backend.detection`、`math`、`numpy`、`threading`、`unittest`、`unittest.mock`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `17 · click_track` | 函数 | `click_track(times, *, amplitudes=None, duration=None, frequency=1000.0, length=0.035, noise=0.0)` |
| `32 · DetectionTests` | 类 | `DetectionTests(unittest.TestCase)` |
| `33 · DetectionTests.detect` | 函数 | `detect(self, audio, **kwargs)` |
| `36 · DetectionTests.assert_times` | 函数 | `assert_times(self, result, expected, tolerance=0.008)` |
| `44 · DetectionTests.test_alternating_quiet_loud_clicks` | 函数 | `test_alternating_quiet_loud_clicks(self)` |
| `50 · DetectionTests.test_quiet_passage_after_loud_section` | 函数 | `test_quiet_passage_after_loud_section(self)` |
| `55 · DetectionTests.test_silence_and_constant_sines_rejected` | 函数 | `test_silence_and_constant_sines_rejected(self)` |
| `66 · DetectionTests.test_constant_noisy_tone_rejected` | 函数 | `test_constant_noisy_tone_rejected(self)` |
| `72 · DetectionTests.test_timing_refinement_and_min_interval` | 函数 | `test_timing_refinement_and_min_interval(self)` |
| `80 · DetectionTests.test_bpm_regular_trains` | 函数 | `test_bpm_regular_trains(self)` |
| `89 · DetectionTests.test_rhythm_removes_weaker_offgrid_without_filling_missing_beats` | 函数 | `test_rhythm_removes_weaker_offgrid_without_filling_missing_beats(self)` |
| `103 · DetectionTests.test_rhythm_leaves_irregular_observations` | 函数 | `test_rhythm_leaves_irregular_observations(self)` |
| `111 · DetectionTests.test_original_sample_rms_dbfs_calibration` | 函数 | `test_original_sample_rms_dbfs_calibration(self)` |
| `129 · DetectionTests.test_old_fixture_compatibility` | 函数 | `test_old_fixture_compatibility(self)` |
| `140 · DetectionTests.test_batch_boundary_and_bounded_fft_working_set` | 函数 | `test_batch_boundary_and_bounded_fft_working_set(self)` |
| `146 · DetectionTests.test_batch_boundary_and_bounded_fft_working_set.observed_rfft` | 函数 | `observed_rfft(frames, *args, **kwargs)` |
| `155 · DetectionTests.test_cancellation_initial_and_during_processing` | 函数 | `test_cancellation_initial_and_during_processing(self)` |
| `161 · DetectionTests.test_cancellation_initial_and_during_processing.progress` | 函数 | `progress(value, message)` |
| `169 · DetectionTests.test_progress_nonfinite_input_and_duration` | 函数 | `test_progress_nonfinite_input_and_duration(self)` |
| `183 · DetectionTests.test_argument_validation` | 函数 | `test_argument_validation(self)` |

## backend/test_learning.py

自动化回归与边界验证。

静态导入：`__future__`、`ast`、`backend.detection`、`backend.main`、`backend.projects`、`fastapi.testclient`、`io`、`json`、`numpy`、`pathlib`、`tempfile`、`unittest`、`wave`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `22 · LearningDocumentationTests` | 类 | `LearningDocumentationTests(unittest.TestCase)` |
| `24 · LearningDocumentationTests.setUpClass` | 函数 | `setUpClass(cls)` |
| `29 · LearningDocumentationTests.test_all_chapters_are_served_from_the_canonical_markdown` | 函数 | `test_all_chapters_are_served_from_the_canonical_markdown(self)` |
| `42 · LearningDocumentationTests.test_swagger_and_fourteen_business_routes_remain_available` | 函数 | `test_swagger_and_fourteen_business_routes_remain_available(self)` |
| `51 · LearningDocumentationTests.test_downloads_and_audio_range_match_the_files` | 函数 | `test_downloads_and_audio_range_match_the_files(self)` |
| `63 · LearningDocumentationTests.test_projects_are_valid_roundtrip_without_media_and_keep_their_visuals` | 函数 | `test_projects_are_valid_roundtrip_without_media_and_keep_their_visuals(self)` |
| `80 · LearningDocumentationTests.test_synthetic_audio_matches_the_taught_120_bpm_grid` | 函数 | `test_synthetic_audio_matches_the_taught_120_bpm_grid(self)` |
| `95 · LearningDocumentationTests.test_python_api_tutorial_compiles_and_uses_the_installed_client` | 函数 | `test_python_api_tutorial_compiles_and_uses_the_installed_client(self)` |

## backend/test_projects.py

自动化回归与边界验证。

静态导入：`__future__`、`backend`、`concurrent.futures`、`fastapi.testclient`、`json`、`pathlib`、`subprocess`、`sys`、`tempfile`、`unittest`、`unittest.mock`、`urllib.parse`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `22 · ProjectLibraryTests` | 类 | `ProjectLibraryTests(unittest.TestCase)` |
| `23 · ProjectLibraryTests.setUp` | 函数 | `setUp(self)` |
| `34 · ProjectLibraryTests.draft` | 函数 | `draft()` |
| `39 · ProjectLibraryTests.create` | 函数 | `create(self, project=None, name='新草稿')` |
| `45 · ProjectLibraryTests.path` | 函数 | `path(self, record)` |
| `48 · ProjectLibraryTests.assert_chinese_error` | 函数 | `assert_chinese_error(self, response, status)` |
| `54 · ProjectLibraryTests.test_draft_crud_metadata_and_list_contract` | 函数 | `test_draft_crud_metadata_and_list_contract(self)` |
| `85 · ProjectLibraryTests.test_records_are_readable_by_a_new_backend_process` | 函数 | `test_records_are_readable_by_a_new_backend_process(self)` |
| `104 · ProjectLibraryTests.test_list_orders_by_update_and_reports_media_without_loading_it` | 函数 | `test_list_orders_by_update_and_reports_media_without_loading_it(self)` |
| `120 · ProjectLibraryTests.test_old_version_one_documents_and_extension_images_round_trip` | 函数 | `test_old_version_one_documents_and_extension_images_round_trip(self)` |
| `138 · ProjectLibraryTests.test_delete_project_does_not_remove_media` | 函数 | `test_delete_project_does_not_remove_media(self)` |
| `153 · ProjectLibraryTests.test_revision_conflicts_and_required_revision_preserve_disk` | 函数 | `test_revision_conflicts_and_required_revision_preserve_disk(self)` |
| `169 · ProjectLibraryTests.test_simultaneous_saves_allow_only_one_revision` | 函数 | `test_simultaneous_saves_allow_only_one_revision(self)` |
| `172 · ProjectLibraryTests.test_simultaneous_saves_allow_only_one_revision.save` | 函数 | `save(name)` |
| `182 · ProjectLibraryTests.test_bad_documents_never_overwrite_existing_file` | 函数 | `test_bad_documents_never_overwrite_existing_file(self)` |
| `204 · ProjectLibraryTests.test_invalid_names_and_json_are_rejected` | 函数 | `test_invalid_names_and_json_are_rejected(self)` |
| `213 · ProjectLibraryTests.test_nonfinite_numbers_in_all_fields_are_rejected` | 函数 | `test_nonfinite_numbers_in_all_fields_are_rejected(self)` |
| `226 · ProjectLibraryTests.test_beat_limit_accepts_boundary_and_rejects_excess` | 函数 | `test_beat_limit_accepts_boundary_and_rejects_excess(self)` |
| `235 · ProjectLibraryTests.test_twenty_mb_limit_including_streamed_requests` | 函数 | `test_twenty_mb_limit_including_streamed_requests(self)` |
| `243 · ProjectLibraryTests.test_oversized_update_never_overwrites_existing_file` | 函数 | `test_oversized_update_never_overwrites_existing_file(self)` |
| `252 · ProjectLibraryTests.test_malicious_ids_cannot_read_modify_or_delete_other_paths` | 函数 | `test_malicious_ids_cannot_read_modify_or_delete_other_paths(self)` |
| `267 · ProjectLibraryTests.test_missing_record_returns_clear_error_for_all_operations` | 函数 | `test_missing_record_returns_clear_error_for_all_operations(self)` |
| `274 · ProjectLibraryTests.test_corrupt_files_are_skipped_in_list_but_fail_when_opened` | 函数 | `test_corrupt_files_are_skipped_in_list_but_fail_when_opened(self)` |
| `294 · ProjectLibraryTests.test_failed_atomic_replace_preserves_original_and_cleans_temporary` | 函数 | `test_failed_atomic_replace_preserves_original_and_cleans_temporary(self)` |
| `306 · ProjectLibraryTests.test_failed_fsync_does_not_replace_original` | 函数 | `test_failed_fsync_does_not_replace_original(self)` |
| `318 · ProjectLibraryTests.test_failed_create_has_no_partial_record` | 函数 | `test_failed_create_has_no_partial_record(self)` |
| `324 · ProjectLibraryTests.test_invalid_unicode_is_rejected_and_corrupt_unicode_storage_is_skipped` | 函数 | `test_invalid_unicode_is_rejected_and_corrupt_unicode_storage_is_skipped(self)` |
| `337 · ProjectLibraryTests.test_read_list_and_delete_io_failures_are_explicit` | 函数 | `test_read_list_and_delete_io_failures_are_explicit(self)` |

## backend/test_studio.py

自动化回归与边界验证。

静态导入：`PIL`、`__future__`、`base64`、`io`、`math`、`numpy`、`pydantic`、`sys`、`unittest`、`urllib.parse`、`uuid`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `31 · marker_data` | 函数 | `marker_data()` |
| `40 · StudioModelAndRenderTests` | 类 | `StudioModelAndRenderTests(unittest.TestCase)` |
| `41 · StudioModelAndRenderTests.test_beat_loudness_is_optional_bounded_and_finite` | 函数 | `test_beat_loudness_is_optional_bounded_and_finite(self)` |
| `51 · StudioModelAndRenderTests.test_studio_style_validation` | 函数 | `test_studio_style_validation(self)` |
| `65 · StudioModelAndRenderTests.test_loudness_colour_increases_with_db_and_clamps` | 函数 | `test_loudness_colour_increases_with_db_and_clamps(self)` |
| `81 · StudioModelAndRenderTests.test_converging_bar_beats_move_symmetrically_to_centre` | 函数 | `test_converging_bar_beats_move_symmetrically_to_centre(self)` |
| `87 · StudioModelAndRenderTests.test_converging_bar_beats_move_symmetrically_to_centre.red_columns` | 函数 | `red_columns(t)` |
| `108 · StudioModelAndRenderTests.test_custom_marker_keeps_aspect_transparency_and_scale` | 函数 | `test_custom_marker_keeps_aspect_transparency_and_scale(self)` |
| `132 · StudioModelAndRenderTests.test_builtin_marker_is_independent_of_beat_pattern` | 函数 | `test_builtin_marker_is_independent_of_beat_pattern(self)` |
| `142 · StudioApiTests` | 类 | `StudioApiTests(unittest.TestCase)` |
| `144 · StudioApiTests.setUpClass` | 函数 | `setUpClass(cls)` |
| `153 · StudioApiTests.tearDownClass` | 函数 | `tearDownClass(cls)` |
| `157 · StudioApiTests.wait_job` | 函数 | `wait_job(self, job_id)` |
| `160 · StudioApiTests.test_analysis_returns_measured_loudness_and_metadata` | 函数 | `test_analysis_returns_measured_loudness_and_metadata(self)` |
| `181 · StudioApiTests.test_chinese_download_name_survives_full_and_range_responses` | 函数 | `test_chinese_download_name_survives_full_and_range_responses(self)` |
| `197 · StudioApiTests.test_export_named_outputs_keep_uuid_storage_and_matching_extension` | 函数 | `test_export_named_outputs_keep_uuid_storage_and_matching_extension(self)` |
| `224 · StudioApiTests.test_export_rejects_paths_reserved_names_and_invalid_marker_before_job` | 函数 | `test_export_rejects_paths_reserved_names_and_invalid_marker_before_job(self)` |
| `236 · StudioApiTests.test_download_rejects_paths_or_incorrect_format_names` | 函数 | `test_download_rejects_paths_or_incorrect_format_names(self)` |

## frontend/app.js

工作台编排：编辑状态、素材、打点、项目快照、任务与输出。

静态导入：`./export.js`、`./projects.js`、`./timeline.js`、`./visuals.js`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `6 · $` | 函数变量 | `$(id)` |
| `33 · toast` | 函数 | `toast(text, error = false)` |
| `39 · api` | 函数 | `async api(path, body)` |
| `67 · clamp` | 函数变量 | `clamp(v, a, b)` |
| `68 · num` | 函数变量 | `num(id)` |
| `69 · duration` | 函数 | `duration()` |
| `72 · playhead` | 函数 | `playhead()` |
| `75 · playbackElement` | 函数 | `playbackElement()` |
| `78 · pausePlayback` | 函数 | `pausePlayback()` |
| `82 · requireMedia` | 函数 | `requireMedia()` |
| `89 · formatTime` | 函数 | `formatTime(t)` |
| `102 · snapshot` | 函数 | `snapshot()` |
| `105 · checkpoint` | 函数 | `checkpoint()` |
| `110 · normalize` | 函数 | `normalize(beats, maxDuration = duration())` |
| `135 · changed` | 函数 | `changed()` |
| `145 · replaceBeats` | 函数 | `replaceBeats(beats)` |
| `152 · undo` | 函数 | `undo()` |
| `159 · redo` | 函数 | `redo()` |
| `166 · updateSelection` | 函数 | `updateSelection()` |
| `181 · addBeat` | 函数 | `addBeat(t = playhead())` |
| `198 · removeBeat` | 函数 | `removeBeat()` |
| `205 · seek` | 函数 | `seek(t)` |
| `212 · updateBusy` | 函数 | `updateBusy()` |
| `233 · upload` | 函数 | `async upload(file)` |
| `268 · setMedia` | 函数 | `setMedia(m)` |
| `318 · $("videoFile").onchange` | 赋值函数 | `$("videoFile").onchange(e)` |
| `320 · $("dropzone").on(event)` | 事件回调 | `$("dropzone").on(event)(e)` |
| `325 · $("dropzone").on(event)` | 事件回调 | `$("dropzone").on(event)(e)` |
| `330 · togglePlay` | 函数 | `async togglePlay()` |
| `352 · player.onplay` | 赋值函数 | `player.onplay()` |
| `356 · player.onpause` | 赋值函数 | `player.onpause()` |
| `357 · player.onended` | 赋值函数 | `player.onended()` |
| `362 · player.onerror` | 赋值函数 | `player.onerror()` |
| `372 · $("playbackRate").onchange` | 赋值函数 | `$("playbackRate").onchange()` |
| `376 · $("frameBack").onclick` | 赋值函数 | `$("frameBack").onclick()` |
| `380 · $("frameNext").onclick` | 赋值函数 | `$("frameNext").onclick()` |
| `384 · updateRecord` | 函数 | `updateRecord()` |
| `390 · $("recordBtn").onclick` | 赋值函数 | `$("recordBtn").onclick()` |
| `397 · tap` | 函数 | `tap()` |
| `408 · $("inputTabs").onclick` | 赋值函数 | `$("inputTabs").onclick(e)` |
| `416 · $("sensitivity").oninput` | 赋值函数 | `$("sensitivity").oninput()` |
| `418 · startJob` | 函数 | `async startJob(path, payload, onDone, title)` |
| `432 · startJob → poll` | 函数变量 | `async poll()` |
| `460 · finishJob` | 函数 | `finishJob()` |
| `467 · $("cancelJob").onclick` | 赋值函数 | `async $("cancelJob").onclick()` |
| `478 · $("analyze").onclick` | 赋值函数 | `$("analyze").onclick()` |
| `517 · $("fillBeats").onclick` | 赋值函数 | `$("fillBeats").onclick()` |
| `543 · $("addBeat").onclick` | 赋值函数 | `$("addBeat").onclick()` |
| `546 · $(id).onchange` | 赋值函数 | `$(id).onchange()` |
| `561 · $("applyOffset").onclick` | 赋值函数 | `$("applyOffset").onclick()` |
| `567 · $("halfBeats").onclick` | 赋值函数 | `$("halfBeats").onclick()` |
| `569 · $("clearBeats").onclick` | 赋值函数 | `$("clearBeats").onclick()` |
| `579 · getBeats` | 属性函数 | `getBeats()` |
| `580 · getSelected` | 属性函数 | `getSelected()` |
| `581 · setSelected` | 属性函数 | `setSelected(i)` |
| `588 · getStyle` | 属性函数 | `getStyle()` |
| `589 · getWaveform` | 属性函数 | `getWaveform()` |
| `590 · getBpm` | 属性函数 | `getBpm()` |
| `591 · hasMedia` | 属性函数 | `hasMedia()` |
| `595 · isPlaying` | 属性函数 | `isPlaying()` |
| `596 · onZoom` | 属性函数 | `onZoom(value)` |
| `602 · drawTimeline` | 函数 | `drawTimeline()` |
| `605 · $("zoomIn").onclick` | 赋值函数 | `$("zoomIn").onclick()` |
| `606 · $("zoomOut").onclick` | 赋值函数 | `$("zoomOut").onclick()` |
| `608 · $("zoomFit").onclick` | 赋值函数 | `$("zoomFit").onclick()` |
| `609 · $("centerPlayhead").onclick` | 赋值函数 | `$("centerPlayhead").onclick()` |
| `610 · $("previousBeat").onclick` | 赋值函数 | `$("previousBeat").onclick()` |
| `611 · $("nextBeat").onclick` | 赋值函数 | `$("nextBeat").onclick()` |
| `612 · $("snapTimeline").onchange` | 赋值函数 | `$("snapTimeline").onchange()` |
| `614 · $("followTimeline").onchange` | 赋值函数 | `$("followTimeline").onchange()` |
| `616 · outputSize` | 函数 | `outputSize()` |
| `628 · resizePreview` | 函数 | `resizePreview()` |
| `636 · drawOverlay` | 函数 | `drawOverlay()` |
| `674 · renderStyleChoices` | 函数 | `renderStyleChoices()` |
| `685 · renderStyleChoices → button.onclick` | 赋值函数 | `button.onclick()` |
| `698 · renderStyleChoices → button.onclick` | 赋值函数 | `button.onclick()` |
| `709 · syncStyle` | 函数 | `syncStyle()` |
| `785 · $(key).oninput` | 赋值函数 | `$(key).oninput()` |
| `799 · $(id).onchange` | 赋值函数 | `$(id).onchange()` |
| `817 · loadPattern` | 函数 | `async loadPattern(data)` |
| `827 · loadPattern → image.onerror` | 赋值函数 | `image.onerror()` |
| `839 · $(id).onchange` | 赋值函数 | `$(id).onchange()` |
| `851 · uploadPattern` | 函数 | `async uploadPattern(event, marker = false)` |
| `862 · uploadPattern → reader.onload` | 赋值函数 | `reader.onload()` |
| `863 · uploadPattern → reader.onerror` | 赋值函数 | `reader.onerror()` |
| `886 · $("patternFile").onchange` | 赋值函数 | `$("patternFile").onchange(event)` |
| `887 · $("markerFile").onchange` | 赋值函数 | `$("markerFile").onchange(event)` |
| `890 · b.onclick` | 赋值函数 | `b.onclick()` |
| `895 · $("resetStyle").onclick` | 赋值函数 | `$("resetStyle").onclick()` |
| `901 · $("previewMode").onchange` | 赋值函数 | `$("previewMode").onchange()` |
| `914 · drawStyleDemo` | 函数 | `drawStyleDemo(now)` |
| `935 · clickSound` | 函数 | `clickSound(strength)` |
| `947 · $("metronome").onchange` | 赋值函数 | `async $("metronome").onchange()` |
| `954 · animate` | 函数 | `animate(now)` |
| `986 · updateExportName` | 函数 | `updateExportName()` |
| `994 · $("openExport").onclick` | 赋值函数 | `$("openExport").onclick()` |
| `1000 · $("startExport").onclick` | 赋值函数 | `async $("startExport").onclick()` |
| `1067 · download` | 函数 | `download(data, name)` |
| `1078 · project` | 函数 | `project()` |
| `1117 · $("exportProject").onclick` | 赋值函数 | `$("exportProject").onclick()` |
| `1122 · $("exportBeats").onclick` | 赋值函数 | `$("exportBeats").onclick()` |
| `1124 · $("exportFunscript").onclick` | 赋值函数 | `$("exportFunscript").onclick()` |
| `1145 · parseFile` | 函数 | `async parseFile(file)` |
| `1149 · $("beatFile").onchange` | 赋值函数 | `async $("beatFile").onchange(e)` |
| `1171 · prepareProject` | 函数 | `async prepareProject(p, knownMedia)` |
| `1266 · clearMedia` | 函数 | `clearMedia()` |
| `1285 · restoreProject` | 函数 | `restoreProject({ p, style, image, markerImage, beats, media })` |
| `1384 · restoreProject → player.on("loadedmetadata")` | 事件回调 | `player.on("loadedmetadata")()` |
| `1398 · $("projectFile").onchange` | 赋值函数 | `async $("projectFile").onchange(e)` |
| `1412 · $("closeDownloads").onclick` | 赋值函数 | `$("closeDownloads").onclick()` |
| `1413 · $("helpBtn").onclick` | 赋值函数 | `$("helpBtn").onclick()` |
| `1414 · $("closeHelp").onclick` | 赋值函数 | `$("closeHelp").onclick()` |
| `1415 · document.on("keydown")` | 事件回调 | `document.on("keydown")(e)` |
| `1471 · window.on("beforeunload")` | 事件回调 | `window.on("beforeunload")(e)` |
| `1497 · isBusy` | 属性函数 | `isBusy()` |
| `1498 · setLoading` | 属性函数 | `setLoading(value)` |
| `1506 · document.on(event)` | 事件回调 | `document.on(event)(e)` |
| `1514 · $("inputTabs").on("click")` | 事件回调 | `$("inputTabs").on("click")()` |
| `1516 · player.on("pause")` | 事件回调 | `player.on("pause")()` |
| `1517 · document.on("visibilitychange")` | 事件回调 | `document.on("visibilitychange")()` |
| `1528 · $("timelineScroll").on("scroll")` | 事件回调 | `$("timelineScroll").on("scroll")()` |

## frontend/export.js

浏览器保存位置、输出命名与下载流。

静态导入：无显式导入。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `1 · exportFilename` | 函数 | `exportFilename(value, mode)` |
| `14 · createExportDestination` | 函数 | `createExportDestination({ location, choose, note, toast })` |
| `20 · createExportDestination → updateNote` | 函数 | `updateNote()` |
| `30 · createExportDestination → choose.onclick` | 赋值函数 | `async choose.onclick()` |
| `46 · createExportDestination → prepare` | 函数 | `async prepare(filename, mode)` |
| `79 · createExportDestination → save` | 函数 | `async save(result, plan)` |

## frontend/help.js

学习文档加载、目录、全文索引、历史和样例。

静态导入：`./markdown.js`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `3 · $` | 函数变量 | `$(id)` |
| `12 · getText` | 函数 | `async getText(path)` |
| `23 · load` | 函数 | `load(entry)` |
| `33 · docUrl` | 函数 | `docUrl(id, hash = "")` |
| `39 · resolveLink` | 函数 | `resolveLink(href)` |
| `52 · closeMenu` | 函数 | `closeMenu()` |
| `56 · searchMode` | 函数 | `searchMode(active)` |
| `64 · renderNavigation` | 函数 | `renderNavigation()` |
| `81 · scrollToAnchor` | 函数 | `scrollToAnchor()` |
| `94 · showDocument` | 函数 | `async showDocument({ scroll = true } = {})` |
| `158 · navigate` | 函数 | `navigate(url)` |
| `162 · updateSearch` | 函数 | `updateSearch()` |
| `206 · loadExamples` | 函数 | `async loadExamples()` |
| `236 · initialize` | 函数 | `async initialize()` |
| `267 · $("docSearch").on("input")` | 事件回调 | `$("docSearch").on("input")()` |
| `271 · $("clearSearch").onclick` | 赋值函数 | `$("clearSearch").onclick()` |
| `276 · $("toggleDocsNav").onclick` | 赋值函数 | `$("toggleDocsNav").onclick()` |
| `281 · $("retryDoc").onclick` | 赋值函数 | `$("retryDoc").onclick()` |
| `283 · document.on("click")` | 事件回调 | `document.on("click")(event)` |
| `301 · window.on("popstate")` | 事件回调 | `window.on("popstate")()` |
| `303 · document.on("keydown")` | 事件回调 | `document.on("keydown")(event)` |

## frontend/markdown.js

安全 DOM Markdown 子集和代码复制。

静态导入：无显式导入。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `2 · headingId` | 函数 | `headingId(text)` |
| `12 · renderMarkdown` | 函数 | `renderMarkdown(source, { resolveLink = (href) => href } = {})` |
| `17 · renderMarkdown → inline` | 函数 | `inline(parent, text)` |
| `52 · renderMarkdown → tableCells` | 函数变量 | `tableCells(line)` |
| `58 · renderMarkdown → isSeparator` | 函数变量 | `isSeparator(line = "")` |
| `82 · renderMarkdown → copy.onclick` | 赋值函数 | `async copy.onclick()` |

## frontend/projects.js

项目库、自动保存、修订控制、切换和错误保护。

静态导入：无显式导入。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `2 · $` | 函数变量 | `$(id)` |
| `5 · createProjectManager` | 函数 | `createProjectManager(o)` |
| `17 · createProjectManager → status` | 函数 | `status(text, state)` |
| `21 · createProjectManager → remember` | 函数 | `remember(id)` |
| `29 · createProjectManager → lastId` | 函数 | `lastId()` |
| `36 · createProjectManager → request` | 函数 | `async request(path, method = "GET", body)` |
| `67 · createProjectManager → name` | 函数变量 | `name()` |
| `69 · createProjectManager → activate` | 函数 | `activate(record)` |
| `82 · createProjectManager → changed` | 函数 | `changed()` |
| `100 · createProjectManager → save` | 函数 | `async save({ silent = false, force = false } = {})` |
| `159 · createProjectManager → preserve` | 函数 | `async preserve()` |
| `163 · createProjectManager → transition` | 函数 | `async transition(action)` |
| `177 · createProjectManager → open` | 函数 | `async open(id)` |
| `192 · createProjectManager → importProject` | 函数 | `async importProject(doc, projectName = "导入的项目")` |
| `209 · createProjectManager → render` | 函数 | `render()` |
| `249 · createProjectManager → render → button.onclick` | 赋值函数 | `button.onclick()` |
| `266 · createProjectManager → refresh` | 函数 | `async refresh()` |
| `280 · createProjectManager → duplicate` | 函数 | `async duplicate(id)` |
| `295 · createProjectManager → init` | 函数 | `async init()` |
| `315 · createProjectManager → $("saveProject").onclick` | 赋值函数 | `$("saveProject").onclick()` |
| `319 · createProjectManager → $("projectName").on("blur")` | 事件回调 | `$("projectName").on("blur")()` |
| `322 · createProjectManager → $("manageProjects").onclick` | 赋值函数 | `$("manageProjects").onclick()` |
| `327 · createProjectManager → $("closeProjects").onclick` | 赋值函数 | `$("closeProjects").onclick()` |
| `330 · createProjectManager → $("newProject").onclick` | 赋值函数 | `$("newProject").onclick()` |
| `336 · createProjectManager → $("cancelNewProject").onclick` | 赋值函数 | `$("cancelNewProject").onclick()` |
| `337 · createProjectManager → $("newProjectForm").onsubmit` | 赋值函数 | `$("newProjectForm").onsubmit(event)` |
| `344 · createProjectManager → $("cancelDeleteProject").onclick` | 赋值函数 | `$("cancelDeleteProject").onclick()` |
| `345 · createProjectManager → $("confirmDeleteProject").onclick` | 赋值函数 | `$("confirmDeleteProject").onclick()` |
| `383 · createProjectManager → hasUnsavedChanges` | 属性函数 | `hasUnsavedChanges()` |
| `384 · createProjectManager → isSwitching` | 属性函数 | `isSwitching()` |
| `385 · createProjectManager → activeId` | 方法 | `activeId()` |

## frontend/timeline.js

时间坐标、Canvas 波形、拍点手势、缩放和跟随。

静态导入：`./visuals.js`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `3 · clamp` | 函数变量 | `clamp(v, lo, hi)` |
| `4 · timeToX` | 函数变量 | `timeToX(time, duration, width)` |
| `6 · xToTime` | 函数变量 | `xToTime(x, duration, width)` |
| `8 · createTimeline` | 函数 | `createTimeline(o)` |
| `23 · createTimeline → viewport` | 函数变量 | `viewport()` |
| `24 · createTimeline → total` | 函数变量 | `total()` |
| `25 · createTimeline → tx` | 函数变量 | `tx(t)` |
| `26 · createTimeline → timeAt` | 函数变量 | `timeAt(x)` |
| `28 · createTimeline → localX` | 函数变量 | `localX(e)` |
| `29 · createTimeline → sorted` | 函数变量 | `sorted()` |
| `36 · createTimeline → snapped` | 函数 | `snapped(t, e)` |
| `45 · createTimeline → draw` | 函数 | `draw()` |
| `148 · createTimeline → zoom` | 函数 | `zoom(value, clientX)` |
| `164 · createTimeline → updateGesture` | 函数 | `updateGesture(e)` |
| `188 · createTimeline → edgeScroll` | 函数 | `edgeScroll()` |
| `202 · createTimeline → canvas.on("pointerdown")` | 事件回调 | `canvas.on("pointerdown")(e)` |
| `247 · createTimeline → canvas.on("pointermove")` | 事件回调 | `canvas.on("pointermove")(e)` |
| `255 · createTimeline → stop` | 函数 | `stop(e)` |
| `268 · createTimeline → canvas.on("dblclick")` | 事件回调 | `canvas.on("dblclick")(e)` |
| `273 · createTimeline → scroll.on("wheel")` | 事件回调 | `scroll.on("wheel")(e)` |
| `293 · createTimeline → canvas.on("keydown")` | 事件回调 | `canvas.on("keydown")(e)` |
| `310 · createTimeline → center` | 函数 | `center()` |
| `314 · createTimeline → neighbor` | 函数 | `neighbor(sign)` |
| `334 · createTimeline → previous` | 属性函数 | `previous()` |
| `335 · createTimeline → next` | 属性函数 | `next()` |
| `336 · createTimeline → getZoom` | 属性函数 | `getZoom()` |
| `337 · createTimeline → reset` | 方法 | `reset()` |
| `345 · createTimeline → fit` | 方法 | `fit()` |
| `350 · createTimeline → setSnap` | 方法 | `setSnap(value)` |
| `354 · createTimeline → setFollow` | 方法 | `setFollow(value)` |

## frontend/visuals.js

Canvas 节拍预览、样式、颜色和命中效果。

静态导入：无显式导入。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `91 · mixColor` | 函数 | `mixColor(from, to, amount)` |
| `112 · loudnessAmount` | 函数 | `loudnessAmount(style, strength, loudnessDb)` |
| `124 · beatColor` | 函数 | `beatColor(style, index, strength, side = 0, loudnessDb)` |
| `140 · drawShape` | 函数 | `drawShape(ctx, pattern, x, y, r)` |
| `200 · beatPositions` | 函数 | `beatPositions(style, left, width, marker, radius, delta)` |
| `219 · firstVisible` | 函数 | `firstVisible(beats, time)` |
| `230 · drawTrack` | 函数 | `drawTrack(ctx, width, height, beats, time, style, image = null, markerImage = null)` |

## launch_browser.py

等待服务健康后打开本机工作台。

静态导入：`time`、`urllib.request`、`webbrowser`。

此文件没有单列的具名类或函数定义。

## scripts/beatbar_client.py

HTTP/Python 客户端与 health/analyze/render 命令行入口。

静态导入：`__future__`、`argparse`、`httpx2`、`json`、`math`、`os`、`pathlib`、`tempfile`、`time`、`urllib.parse`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `22 · BeatBarClient` | 类 | `BeatBarClient()` |
| `25 · BeatBarClient.__init__` | 函数 | `__init__(self, base_url: str='http://127.0.0.1:8000', *, timeout: float=120)` |
| `31 · BeatBarClient.__enter__` | 函数 | `__enter__(self)` |
| `34 · BeatBarClient.__exit__` | 函数 | `__exit__(self, *_args)` |
| `37 · BeatBarClient.request` | 函数 | `request(self, method: str, endpoint: str, **kwargs)` |
| `42 · BeatBarClient.health` | 函数 | `health(self) -> dict` |
| `45 · BeatBarClient.upload` | 函数 | `upload(self, source: str \| Path) -> dict` |
| `50 · BeatBarClient.wait` | 函数 | `wait(self, job_id: str, *, timeout: float=600, interval: float=0.65) -> dict` |
| `63 · BeatBarClient.analyze` | 函数 | `analyze(self, media_id: str, *, timeout: float=600, **settings) -> dict` |
| `67 · BeatBarClient.render` | 函数 | `render(self, request: dict, *, timeout: float=600) -> dict` |
| `71 · BeatBarClient.create_project` | 函数 | `create_project(self, name: str, project: dict) -> dict` |
| `74 · BeatBarClient.download` | 函数 | `download(self, url: str, output: str \| Path, *, overwrite: bool=False) -> Path` |
| `99 · main` | 函数 | `main() -> None` |

## scripts/benchmark-api.py

顺序 HTTP 性能采样、环境记录与四种规格下载。

静态导入：`__future__`、`argparse`、`beatbar_client`、`datetime`、`importlib.metadata`、`json`、`pathlib`、`platform`、`time`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `21 · main` | 函数 | `main() -> None` |

## scripts/browser-test.mjs

自动化回归与边界验证。

静态导入：`node:assert/strict`、`node:fs/promises`、`node:path`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `23 · ws.onmessage` | 赋值函数 | `ws.onmessage(e)` |
| `38 · cdp` | 函数 | `cdp(method, params = {})` |
| `47 · cdp → resolve` | 属性函数 | `resolve(r)` |
| `51 · cdp → reject` | 属性函数 | `reject(e)` |
| `59 · evaluate` | 函数 | `async evaluate(expression)` |
| `72 · until` | 函数 | `async until(expression, timeout = 30000)` |
| `80 · click` | 函数 | `async click(selector)` |

## scripts/build-code-map.mjs

静态源码索引生成与 --check 校验。

静态导入：`node:child_process`、`node:crypto`、`node:fs/promises`、`node:path`、`node:url`、`prettier/plugins/babel`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `62 · purpose` | 函数 | `purpose(file)` |
| `72 · compact` | 函数 | `compact(text)` |
| `75 · cell` | 函数 | `cell(text)` |
| `81 · code` | 函数变量 | `code(text)` |
| `82 · javascript` | 函数 | `async javascript(file)` |
| `87 · javascript → slice` | 函数变量 | `slice(node)` |
| `88 · javascript → walk` | 函数 | `walk(node, parent = null, scope = [])` |

## scripts/code-map-python.py

Python ast 符号提取，不导入业务代码。

静态导入：`__future__`、`ast`、`json`、`pathlib`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `11 · inspect` | 函数 | `inspect(path: Path) -> dict` |
| `22 · inspect.visit` | 函数 | `visit(node: ast.AST, scope: tuple[str, ...]=()) -> None` |
| `45 · main` | 函数 | `main() -> None` |

## scripts/generate-fixtures.py

开发、测试或分发维护脚本。

静态导入：`__future__`、`array`、`imageio_ffmpeg`、`math`、`pathlib`、`subprocess`、`wave`。

此文件没有单列的具名类或函数定义。

## scripts/generate-learning-examples.py

确定性生成可分发的学习音频和项目。

静态导入：`__future__`、`argparse`、`io`、`json`、`math`、`pathlib`、`struct`、`wave`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `17 · encode_json` | 函数 | `encode_json(value: object) -> bytes` |
| `21 · build_assets` | 函数 | `build_assets() -> dict[str, bytes]` |
| `63 · main` | 函数 | `main() -> None` |

## scripts/help-browser-test.mjs

学习中心浏览器回归与实际练习验证。

静态导入：`node:assert/strict`、`node:fs/promises`、`node:path`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `24 · ws.onmessage` | 赋值函数 | `ws.onmessage({ data })` |
| `52 · cdp` | 函数 | `cdp(method, params = {})` |
| `60 · cdp → resolve` | 属性函数 | `resolve(value)` |
| `64 · cdp → reject` | 属性函数 | `reject(error)` |
| `72 · run` | 函数 | `async run(expression)` |
| `86 · sleep` | 函数变量 | `sleep(ms)` |
| `87 · until` | 函数 | `async until(condition, timeout = 20000)` |
| `104 · click` | 函数变量 | `click(selector)` |
| `106 · navigate` | 函数 | `async navigate(url)` |
| `113 · article` | 函数 | `async article(id)` |
| `118 · upload` | 函数 | `async upload(selector, file)` |
| `130 · pass` | 函数 | `pass(name, details = {})` |

## scripts/help-unit-test.mjs

受控 DOM 下的学习状态、加载竞态和安全 Markdown 回归。

静态导入：`node:assert/strict`、`node:fs/promises`、`node:path`、`node:url`、`node:vm`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `13 · flush` | 函数变量 | `flush()` |
| `17 · deferred` | 函数 | `deferred()` |
| `24 · Element` | 类 | `Element` |
| `25 · Element → constructor` | 方法 | `constructor(tag = "div", ownerDocument)` |
| `36 · Element → textContent` | 方法 | `textContent()` |
| `39 · Element → textContent` | 方法 | `textContent(value)` |
| `43 · Element → href` | 方法 | `href(value)` |
| `46 · Element → href` | 方法 | `href()` |
| `49 · Element → download` | 方法 | `download(value)` |
| `52 · Element → download` | 方法 | `download()` |
| `55 · Element → setAttribute` | 方法 | `setAttribute(key, value)` |
| `58 · Element → removeAttribute` | 方法 | `removeAttribute(key)` |
| `61 · Element → hasAttribute` | 方法 | `hasAttribute(key)` |
| `64 · Element → append` | 方法 | `append(...children)` |
| `73 · Element → replaceChildren` | 方法 | `replaceChildren(...children)` |
| `78 · Element → contains` | 方法 | `contains(element)` |
| `83 · Element → querySelectorAll` | 方法 | `querySelectorAll(selector)` |
| `97 · Element → closest` | 方法 | `closest(tag)` |
| `102 · Element → addEventListener` | 方法 | `addEventListener(type, callback)` |
| `107 · Element → emit` | 方法 | `emit(type, properties = {})` |
| `111 · Element → emit → preventDefault` | 方法 | `preventDefault()` |
| `116 · Element → focus` | 方法 | `focus()` |
| `119 · Element → scrollIntoView` | 方法 | `scrollIntoView()` |
| `122 · harness` | 函数 | `async harness({ source = helpSource, routes = {}, doc = "README", } = {})` |
| `134 · harness → document.getElementById` | 赋值函数 | `document.getElementById(id)` |
| `135 · harness → document.createElement` | 赋值函数 | `document.createElement(tag)` |
| `136 · harness → document.createDocumentFragment` | 赋值函数 | `document.createDocumentFragment()` |
| `137 · harness → document.createTextNode` | 赋值函数 | `document.createTextNode(text)` |
| `167 · harness → window.scrollTo` | 赋值函数 | `window.scrollTo()` |
| `177 · harness → pushState` | 属性函数 | `pushState(_state, _title, url)` |
| `183 · harness → writeText` | 属性函数 | `async writeText(text)` |
| `188 · harness → requestAnimationFrame` | 属性函数 | `requestAnimationFrame(callback)` |
| `189 · harness → setTimeout` | 属性函数 | `setTimeout(callback, delay)` |
| `194 · harness → clearTimeout` | 属性函数 | `clearTimeout(id)` |
| `195 · harness → fetch` | 属性函数 | `async fetch(url)` |
| `203 · harness → fetch → text` | 属性函数 | `async text()` |
| `218 · harness → element` | 属性函数 | `element(id)` |
| `219 · harness → clipboard` | 属性函数 | `clipboard()` |
| `221 · harness → search` | 方法 | `async search(query)` |
| `232 · harness → navigate` | 方法 | `async navigate(id)` |
| `244 · runHelpTests` | 函数 | `async runHelpTests(source = helpSource)` |
| `369 · runHelpTests → h.context.navigator.clipboard.writeText` | 赋值函数 | `async h.context.navigator.clipboard.writeText()` |

## scripts/project-browser-test.mjs

自动化回归与边界验证。

静态导入：`node:assert/strict`、`node:fs/promises`、`node:path`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `21 · ws.onmessage` | 赋值函数 | `ws.onmessage({ data })` |
| `39 · cdp` | 函数 | `cdp(method, params = {})` |
| `47 · cdp → resolve` | 属性函数 | `resolve(value)` |
| `51 · cdp → reject` | 属性函数 | `reject(error)` |
| `59 · run` | 函数 | `async run(expression)` |
| `73 · sleep` | 函数变量 | `sleep(ms)` |
| `74 · until` | 函数 | `async until(condition, ms = 15000)` |
| `85 · click` | 函数变量 | `click(selector)` |
| `87 · change` | 函数变量 | `change(id, value, event = "change")` |
| `91 · api` | 函数 | `async api(endpoint, method = "GET", body)` |
| `105 · activeId` | 函数变量 | `activeId()` |
| `106 · ready` | 函数变量 | `ready()` |
| `110 · reload` | 函数 | `async reload()` |
| `124 · saved` | 函数 | `async saved()` |
| `130 · manualSave` | 函数 | `async manualSave()` |
| `134 · upload` | 函数 | `async upload(selector, file)` |
| `146 · create` | 函数 | `async create(name)` |
| `155 · library` | 函数 | `async library()` |
| `161 · open` | 函数 | `async open(id)` |
| `168 · snapshot` | 函数 | `async snapshot()` |
| `178 · pass` | 函数 | `pass(message)` |
| `263 · normalizedInputs` | 函数变量 | `normalizedInputs(inputs)` |
| `483 · createFailure` | 函数 | `async createFailure()` |

## scripts/project-manager-test.mjs

自动化回归与边界验证。

静态导入：`../frontend/projects.js`、`node:assert/strict`、`node:test`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `8 · flush` | 函数变量 | `flush()` |
| `9 · copy` | 函数变量 | `copy(value)` |
| `11 · deferred` | 函数 | `deferred()` |
| `18 · Element` | 类 | `Element` |
| `26 · Element → addEventListener` | 方法 | `addEventListener(type, listener)` |
| `31 · Element → emit` | 方法 | `emit(type)` |
| `32 · Element → emit → preventDefault` | 方法 | `preventDefault()` |
| `36 · Element → click` | 方法 | `click()` |
| `39 · Element → append` | 方法 | `append(...children)` |
| `42 · Element → replaceChildren` | 方法 | `replaceChildren(...children)` |
| `45 · Element → showModal` | 方法 | `showModal()` |
| `48 · Element → close` | 方法 | `close()` |
| `51 · Element → select` | 方法 | `select()` |
| `54 · fakeDocument` | 函数 | `fakeDocument()` |
| `81 · fakeDocument → getElementById` | 方法 | `getElementById(id)` |
| `85 · fakeDocument → createElement` | 属性函数 | `createElement()` |
| `89 · fakeStorage` | 函数 | `fakeStorage()` |
| `92 · fakeStorage → getItem` | 属性函数 | `getItem(key)` |
| `93 · fakeStorage → setItem` | 属性函数 | `setItem(key, value)` |
| `94 · fakeStorage → removeItem` | 属性函数 | `removeItem(key)` |
| `98 · fakeClock` | 函数 | `fakeClock()` |
| `103 · fakeClock → setTimeout` | 方法 | `setTimeout(callback, delay = 0, ...args)` |
| `108 · fakeClock → clearTimeout` | 属性函数 | `clearTimeout(id)` |
| `109 · fakeClock → advance` | 方法 | `async advance(milliseconds)` |
| `128 · project` | 函数 | `project(beats = [0.5])` |
| `141 · record` | 函数 | `record(doc = project(), revision = 1, id = FIRST_ID, name = "原项目")` |
| `152 · harness` | 函数 | `harness(t)` |
| `168 · harness → fetch` | 函数变量 | `async fetch(url, options = {})` |
| `193 · harness → fetch → json` | 属性函数 | `async json()` |
| `222 · harness → capture` | 属性函数 | `capture()` |
| `223 · harness → prepare` | 属性函数 | `async prepare(doc)` |
| `227 · harness → restore` | 属性函数 | `async restore(value)` |
| `232 · harness → isBusy` | 属性函数 | `isBusy()` |
| `233 · harness → setLoading` | 属性函数 | `setLoading(value)` |
| `234 · harness → toast` | 属性函数 | `toast(...args)` |
| `247 · harness → element` | 属性函数 | `element(id)` |
| `248 · harness → reply` | 方法 | `reply(method, url, body, status = 200)` |
| `251 · harness → edit` | 方法 | `edit(doc, name)` |
| `259 · harness → setBusy` | 属性函数 | `setBusy(value)` |
| `260 · harness → state` | 方法 | `state()` |
| `263 · harness → maxWriters` | 方法 | `maxWriters()` |
| `266 · harness → status` | 方法 | `status()` |
| `272 · resume` | 函数 | `async resume(t, saved = record())` |
| `281 · findButton` | 函数 | `findButton(element, action, id)` |
| `290 · assertPreserved` | 函数 | `assertPreserved(h, saved, unsaved, name)` |

## scripts/studio-browser-test.mjs

自动化回归与边界验证。

静态导入：`node:assert/strict`、`node:fs/promises`、`node:path`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `21 · ws.onmessage` | 赋值函数 | `ws.onmessage({ data })` |
| `38 · cdp` | 函数 | `cdp(method, params = {})` |
| `46 · cdp → r` | 属性函数 | `r(v)` |
| `50 · cdp → j` | 属性函数 | `j(e)` |
| `58 · run` | 函数 | `async run(expression)` |
| `71 · sleep` | 函数变量 | `sleep(ms)` |
| `72 · until` | 函数 | `async until(expression, ms = 30000)` |
| `81 · click` | 函数变量 | `click(s)` |
| `83 · change` | 函数变量 | `change(s, v, event = "change")` |
| `87 · upload` | 函数 | `async upload(s, file)` |
| `95 · rect` | 函数变量 | `rect(s)` |
| `99 · mouse` | 函数 | `async mouse(type, x, y, extra = {})` |
| `102 · drag` | 函数 | `async drag(x, y, toX, toY, button = "left")` |
| `117 · savedProject` | 函数 | `async savedProject()` |
| `127 · pass` | 函数 | `pass(s)` |

## scripts/studio-unit-test.mjs

自动化回归与边界验证。

静态导入：`../frontend/export.js`、`../frontend/timeline.js`、`../frontend/visuals.js`、`node:assert/strict`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `40 · toast` | 属性函数 | `toast(...args)` |
| `44 · querySelector` | 属性函数 | `querySelector(s)` |
| `58 · createWritable` | 属性函数 | `async createWritable()` |
| `60 · createWritable → write` | 方法 | `write(bytes)` |
| `67 · queryPermission` | 属性函数 | `async queryPermission()` |
| `68 · getFileHandle` | 属性函数 | `async getFileHandle(name, options)` |
| `77 · window.showSaveFilePicker` | 赋值函数 | `async window.showSaveFilePicker()` |
| `78 · window.showDirectoryPicker` | 赋值函数 | `async window.showDirectoryPicker()` |
| `84 · globalThis.fetch` | 赋值函数 | `async globalThis.fetch()` |
| `94 · window.showSaveFilePicker` | 赋值函数 | `async window.showSaveFilePicker()` |
| `97 · window.showSaveFilePicker` | 赋值函数 | `async window.showSaveFilePicker()` |
| `104 · directory.queryPermission` | 赋值函数 | `async directory.queryPermission()` |
| `105 · directory.requestPermission` | 赋值函数 | `async directory.requestPermission()` |

## scripts/test-docs.mjs

文档链接、样例、关键教学数字和索引校验。

静态导入：`../frontend/markdown.js`、`node:assert/strict`、`node:child_process`、`node:fs/promises`、`node:path`、`node:url`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `106 · run` | 函数 | `run(executable, args)` |

## scripts/visual-browser-test.mjs

自动化回归与边界验证。

静态导入：`node:assert/strict`、`node:fs/promises`、`node:path`。

| 位置 / 名称 | 类型 | 定义签名 |
| --- | --- | --- |
| `22 · ws.onmessage` | 赋值函数 | `ws.onmessage({ data })` |
| `40 · cdp` | 函数 | `cdp(method, params = {})` |
| `48 · cdp → resolve` | 属性函数 | `resolve(r)` |
| `52 · cdp → reject` | 属性函数 | `reject(e)` |
| `60 · evaluate` | 函数 | `async evaluate(expression)` |
| `74 · until` | 函数 | `async until(expression, timeout = 30000)` |
| `82 · click` | 函数 | `async click(selector)` |
| `85 · change` | 函数 | `async change(id, value, event = "change")` |
| `90 · upload` | 函数 | `async upload(selector, file)` |
| `101 · pass` | 函数 | `pass(text)` |
| `105 · screenshot` | 函数 | `async screenshot(filename)` |
