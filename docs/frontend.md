# 前端代码逻辑

## 模块入口与状态真源

`index.html` 提供原生 input、select、canvas、video/audio 和 dialog。`app.js` 作为模块脚本加载，导入 `visuals.js`、`timeline.js`、`export.js`、`projects.js`。没有全局框架 store；主要状态集中在 `state`，少量控件值直接从 DOM 读取。

| 状态 / 对象                          | 含义                                          |
| ------------------------------------ | --------------------------------------------- |
| media / pendingProject               | 当前可用素材；等待重新关联的已恢复项目        |
| beats / selected                     | 按 time 排序的拍点数组与选中索引              |
| style / customPattern / customMarker | 可序列化样式与已解码图片对象                  |
| past / future                        | 拍点快照历史，past 最多 100 条                |
| recording / busy / uploading / job   | 打点录制、后台操作、异步文件操作与当前任务 ID |
| zoom / timelineEditor                | 缩放显示值与时间轴实例                        |

`api` 统一处理 JSON / FormData 和错误信息；`toast` 负责反馈；`updateBusy` 禁用有关控件并设置编辑区域 inert。媒体上传、图片加载、项目切换期间同样需要锁定，以免异步结果进入另一个项目。

## 素材、播放与拍点编辑

`upload` 接收单文件并调用 API。普通新素材交给 `setMedia` 重置拍点和视口；存在 pendingProject 时先将新素材关联到草稿，再 prepare/restore 保留内容。`playbackElement` 在 video 和 audio 之间选取唯一播放源；`togglePlay` 处理解码错误和节拍提示音所需的 AudioContext。

拍点由 `normalize` 统一处理：接受数字或对象，过滤非法/越界时间，精确到毫秒，限制强度，保留有效响度并排序。`checkpoint` 清空重做栈；`replaceBeats` 先校验再记录历史；`undo` / `redo` 交换快照。`addBeat` 拒绝 25 ms 内重复添加，`removeBeat` 删除选择。`changed` 是拍点修改后更新 UI 与触发保存的汇合点。

事件处理器覆盖录制、精确输入、整体偏移、隔拍保留、清空、BPM 填充、拍点/Funscript 导入和快捷键。偏移后越界点被 normalize 过滤；填充只替换指定区间。任务成功后的识别结果也通过 replaceBeats，因此可撤销。

## 异步任务与动画

`startJob` 设置 busy，提交分析/导出请求，再轮询 `/api/jobs/{id}`。正常轮询间隔约 650 ms，连接失败后逐次退避到最多 10 秒；done 调用结果回调，error 调用 finishJob 解锁。取消按钮发送取消请求，仍等任务最终状态，不把请求已发送当作渲染已结束。

`animate` 每帧调用 `drawOverlay` 和 `drawStyleDemo`，约每 33 ms 更新一次时间文字和时间轴。播放跨过拍点且启用节拍提示时调用 `clickSound`。无素材的小样式预览是合成演示，不代表真实歌曲的识别结果。

## 时间轴：坐标、视口和手势

`timeToX` / `xToTime` 在两侧各保留 18 px，时间与逻辑宽度映射。`createTimeline(o)` 接收读取状态和修改状态的回调，不拥有另一份拍点副本。

- 逻辑总宽度为视口宽度乘以 scale；scrollLeft 表示逻辑偏移。
- Canvas 只分配可见视口大小，DPR 上限 2；长素材不会创建时长等比例的巨型位图。
- draw 先二分定位可见起点，再绘制可见拍点；波形使用服务返回的压缩包络。
- zoom 记住光标下的时间，改变 scale 后校正 scrollLeft；缩放范围随素材时长和视口约束。
- pointerdown 区分标尺 scrub、拍点 drag、中键 pan；拖动超过 3 px 才创建一次 checkpoint。
- snapped 使用 `60 / BPM / 4` 秒网格，距离小于 10 显示像素时吸附，Alt 绕过。
- 视口边缘 24 px 内以每动画帧 12 px 继续滚动；pointerup/cancel/lostcapture 统一 stop。
- 播放跟随在播放头超过视口约 90% 或移到左侧外时，将播放头重新放到约 20% 的位置。

公开返回 draw、zoom、center、previous/next、getZoom、reset、fit、setSnap、setFollow，供 app.js 的按钮和恢复流程调用。

## 视觉模型与双端绘制

`visuals.js` 定义冻结的 DEFAULT_STYLE、六套 PALETTES 和九类 PATTERNS（含自定义）。前端初始值包括 position 0.82、barWidth 0.8、barHeight 44、speed 3、marker 0.15。API 直接请求的部分默认值不同，不能用前端默认推断 API 默认。

`mixColor` 插值颜色；`loudnessAmount` 把实测 dBFS 或强度估计映射到 0–1；`beatColor` 实现统一、交替、强度、响度四色模式。`drawShape` 画内置几何图案；`drawTrack` 根据距命中的秒数、速度窗口和方向确定鼓点位置，裁剪轨道内移动鼓点，再画命中效果和标记。自定义图片保持比例；响度模式调整亮度。

`renderStyleChoices` 生成选项，`syncStyle` 将 state.style 回写控件，样式监听器将输入写回 state。双侧汇合会联动 trackType、motion、marker 和 pattern。`loadPattern` / `uploadPattern` 校验 MIME、体积、尺寸并缩略。导出在 Python 中用 Pillow 重新绘制，前后端需要成对更新模型、枚举、颜色与几何公式；并非录屏 Canvas，因此存在栅格化差异。

## 导出目的地与文件名

`exportFilename` 规范化路径字符、保留中文、避免系统保留名，并按模式使用 mp4/webm。`createExportDestination` 检测浏览器能力：prepare 必须先于异步任务、由用户点击触发保存选择器；save 在完成后通过 response.body.pipeTo 流式写盘。文件夹模式先检查重名并加序号；写入失败 abort writable，下载列表仍可重试。

app.js 的导出处理器先拿到保存计划，后提交 beats/style 快照。输出尺寸向下取偶数。服务完成后创建下载链接，必要时调用目的地 save。完整项目 JSON、拍点 JSON 和 Funscript 则由浏览器 Blob 下载，不经过视频编码器。

## 项目状态机与恢复顺序

`createProjectManager(o)` 以 capture / prepare / restore / isBusy / setLoading / toast 解耦编辑器。active 持有服务记录；dirty 标记未保存；generation 判断保存等待期间是否又有编辑；saving 串行化写请求；switching 阻止跨项目并发；conflicted 在 HTTP 409 后停止覆盖。

编辑 changed → 900 ms 防抖 → save。首次 POST，之后携 revision PUT。请求超时 20 秒只意味着保存未确认，不能声称服务一定没写入。save 仅在 generation 未变化时清除 dirty，否则安排下一次保存。preserve 会等待当前保存并强制捕获最新视图。

open 先 fetch / prepare 新项目，再 preserve 旧项目，最后 restore / activate。importProject 支持尚未完成的文件读取 Promise，从读取开始锁住切换；校验失败不修改旧编辑器。复制新建独立记录；删除保留素材。localStorage 仅记录 ID，内容在服务端。

`project()` 捕获 version:1 文档；`prepareProject` 验证格式、合并/校验样式、加载图片、查询素材，完成后才允许修改编辑器；`restoreProject` 安装已准备对象、恢复控件/视口/播放头、清空跨项目历史。没有素材时也设置 pendingProject，因此教学草稿首次上传能保留拍点。metadata 就绪后的 seek 带素材对象一致性检查，避免旧素材回调污染新项目。

## 阅读器模块

help.js 读取固定目录清单，维护当前文章、搜索索引与导航状态，并处理浏览器前进后退。markdown.js 只构造原生 DOM，支持本项目使用的标题、段落、列表、表格、链接、代码块与引用；不运行原始 HTML。文章标题生成去重锚点，代码块可复制。教学音频与项目下载是静态资源，不会自动导入或覆盖用户作品。

所有具名函数及赋值处理器的位置见 [源码符号索引](source-index.md)，测试与修改检查见 [开发说明](development.md)。
