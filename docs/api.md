# API 与数据格式

默认基址是本机 `http://127.0.0.1:8000`。以下 14 个接口是业务 API；FastAPI 自动生成的 `/openapi.json` 和 `/docs` 可辅助调试 Pydantic 模型。项目 CRUD 使用手工 Request 解析，Swagger 不会自动列出它的完整请求体，请以本文为准。文档静态资源为 `/learning/*`，帮助页面为 `/help.html`。

## 路由总表

| 方法   | 路径                            | 输入与结果                                            |
| ------ | ------------------------------- | ----------------------------------------------------- |
| GET    | `/api/health`                   | `{ "status": "ok" }`                                  |
| POST   | `/api/media`                    | multipart 的 file；返回 Media 描述                    |
| GET    | `/api/media/{media_id}`         | 返回已存素材描述；不存在 404                          |
| GET    | `/api/media/{media_id}/file`    | 媒体字节，支持单个 Range                              |
| POST   | `/api/analyze`                  | AnalyzeRequest；202 `{ "id": "任务ID" }`              |
| POST   | `/api/export`                   | ExportRequest；202 `{ "id": "任务ID" }`               |
| GET    | `/api/jobs/{job_id}`            | 状态、进度、文字；完成时有 result，失败时有 error     |
| POST   | `/api/jobs/{job_id}/cancel`     | 对正在运行的任务请求取消；之后继续查最终状态          |
| GET    | `/api/exports/{filename}`       | UUID 成品文件，可选 downloadName，支持 Range          |
| GET    | `/api/projects`                 | `{ "projects": [项目摘要] }`，按更新时间倒序          |
| POST   | `/api/projects`                 | `{ name, project }`，返回完整记录，revision 为 1      |
| GET    | `/api/projects/{id}`            | 返回完整记录                                          |
| PUT    | `/api/projects/{id}`            | `{ name, project, revision }`，返回 revision+1 的记录 |
| DELETE | `/api/projects/{id}?revision=N` | 匹配修订后返回 `{ "deleted": true }`                  |

## Media 与任务

```json
{
  "id": "32位小写十六进制素材ID",
  "name": "练习.wav",
  "duration": 8.0,
  "width": null,
  "height": null,
  "hasAudio": true,
  "hasVideo": false,
  "url": "/api/media/素材ID/file",
  "waveform": [0.0, 0.4, 0.1]
}
```

上例 ID 和 waveform 是结构说明，不是可直接请求的真实素材。任务快照始终有 id、status、progress、message；done 时带 result；error 时带 error。status 为 queued/running/done/error，用户取消最终也进入 error，并附“任务已取消”文字。

## 自动分析请求

```json
{
  "mediaId": "替换为上传返回的ID",
  "sensitivity": 55,
  "mode": "onsets",
  "minInterval": 0.2,
  "lowHz": 40,
  "highHz": 3000
}
```

| 字段        | API 默认值 / 约束                                  |
| ----------- | -------------------------------------------------- |
| sensitivity | 50；1–100；网页初始值是 55                         |
| mode        | onsets 或 rhythm，默认 onsets                      |
| minInterval | 默认 0.18；0.05–10 秒；网页控件限制更窄，为 0.08–2 |
| lowHz       | 默认 40；20–10000 Hz                               |
| highHz      | 默认 3000；大于 lowHz，且不高于采样率一半 11025 Hz |

done.result 包括 beats、bpm、analysis。每拍 `{ time, strength, loudnessDb }`，时间单位秒。BPM 不确定时为 0；analysis 记录算法、FFT/hop、频段、候选数、保留数、节奏置信度、dBFS 窗口等，不参与项目库的服务级任务恢复。

## 导出请求

```json
{
  "mediaId": "替换为上传返回的ID",
  "beats": [{ "time": 0.25, "strength": 1 }],
  "style": { "color": "#b7f56c", "pattern": "circle" },
  "mode": "composite",
  "width": 640,
  "height": 360,
  "fps": 24,
  "includeAudio": true,
  "filename": "节奏练习.mp4"
}
```

API 默认 mode=green、1280×720、30 FPS、includeAudio=true。beats 默认空数组，但网页要求至少一拍才允许导出。时间范围 0–1200 秒且不能超过实际素材，强度 0–1，loudnessDb 可空或 -120–6；最多 100,000 拍，按 time 升序。

Style 字段分组：颜色 color/secondaryColor/backgroundColor/barColor/markerColor；几何 position/barWidth/barHeight/marker/beatScale/markerScale；运动 speed/motion/trackType；图案 pattern/patternImage、markerPattern/markerImage；动效 hitEffect/hitDuration/effectIntensity；配色 colorMode/dbFloor/dbCeiling。枚举和数值边界可在 `/docs` 的 Style 模型查看。自定义图片使用 PNG/JPEG/WebP 的 base64 Data URL，不能传本机路径或任意 URL。

done.result 包括 url、filename、storageFilename、size。filename 是用户下载名；storageFilename 是 UUID 成品名。要下载成品，应直接使用 result.url，不能用用户文件名猜服务器路径。

## 项目记录与 version:1 内容

记录外壳为 `{ id, name, createdAt, updatedAt, revision, project }`。列表摘要不含完整 project，而含 mediaName、beatCount。时间戳为 UTC ISO 字符串，界面按本机时区显示。名称后端 1–200 字符，网页最多 100 字符。ID 由服务生成，revision 为正整数。

```json
{
  "name": "API 创建的练习草稿",
  "project": {
    "version": 1,
    "media": null,
    "beats": [{ "time": 0.25, "strength": 0.9 }],
    "bpm": 120,
    "style": { "pattern": "circle", "color": "#b7f56c" },
    "exportSettings": {
      "filename": "练习",
      "resolution": "640x360",
      "fps": 24,
      "mode": "composite",
      "includeAudio": true
    },
    "editorSettings": {
      "tab": "auto",
      "playhead": 0,
      "zoom": 1,
      "scrollLeft": 0,
      "selected": -1,
      "inputs": { "sensitivity": "55" }
    }
  }
}
```

media 是 null 或 `{ id, name, duration }`，不包含音视频字节。顶层 version 必须整数 1；beats 必须数组，可包含非负数字或对象；strength 为 0–1，loudnessDb 为 -120–6。可选样式/编辑/导出设置为对象；未知 JSON 字段保留，但不表示编辑器会应用未知字段。最大 20,000,000 字节、100,000 拍、100 层 JSON 嵌套，所有数值须有限。

更新示例：先 GET 原记录，再 PUT 同一 URL，传完整 name/project 与旧 revision。不要在 409 后悄悄忽略 revision 重试，否则会掩盖并发冲突。完整项目 JSON 导出只含 project 内部内容，不是记录外壳。

## 可运行的 Python 调用样例

在项目根目录、已安装 requirements.txt 依赖并启动服务的环境执行；当前依赖提供的是 httpx2，因此代码使用别名 httpx。此样例会创建一个名为“接口练习”的独立项目。它上传配套 WAV、请求分析，等待完成，再保存项目，不操作已有项目。

```python
import time
from pathlib import Path
import httpx2 as httpx

with httpx.Client(base_url="http://127.0.0.1:8000", timeout=120) as client:
    with Path("docs/examples/beatbar-120.wav").open("rb") as audio:
        response = client.post("/api/media", files={"file": ("beatbar-120.wav", audio, "audio/wav")})
    response.raise_for_status()
    media = response.json()
    response = client.post("/api/analyze", json={"mediaId": media["id"], "sensitivity": 55})
    response.raise_for_status()
    job_id = response.json()["id"]
    deadline = time.monotonic() + 120
    while True:
        response = client.get(f"/api/jobs/{job_id}")
        response.raise_for_status()
        job = response.json()
        if job["status"] in ("done", "error"):
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("分析等待超时；任务可能仍在后台运行")
        time.sleep(0.65)
    if job["status"] != "done":
        raise RuntimeError(job.get("error", job["message"]))
    project = {
        "version": 1,
        "media": {key: media[key] for key in ("id", "name", "duration")},
        "beats": job["result"]["beats"],
        "bpm": job["result"]["bpm"],
    }
    response = client.post("/api/projects", json={"name": "接口练习", "project": project})
    response.raise_for_status()
    print(response.json()["id"])
```

## 无需打开网页的命令行调用

现有后端本身就是 HTTP 服务，不需要把浏览器界面自动化才能调用。`scripts/beatbar_client.py` 是可导入的轻量客户端与命令行入口，覆盖健康检查、上传、分析、任务轮询、渲染、成品下载和创建项目。它使用 requirements.txt 中已有的 httpx2，不引入新的运行依赖。

服务启动后，在仓库根目录执行：

```powershell
# 健康检查
.venv\Scripts\python.exe scripts\beatbar_client.py health

# 上传并分析，输出可导入工作台的 version:1 项目 JSON
.venv\Scripts\python.exe scripts\beatbar_client.py analyze docs/examples/beatbar-120.wav --output artifacts/api-beats.json

# 使用配套项目的拍点和样式，导出并下载 MP4
.venv\Scripts\python.exe scripts\beatbar_client.py render docs/examples/beatbar-120.wav --project docs/examples/classic-120.json --output artifacts/api-classic.mp4

# 不提供项目时先自动识别，再输出透明轨道
.venv\Scripts\python.exe scripts\beatbar_client.py render docs/examples/beatbar-120.wav --mode transparent --width 640 --height 360 --fps 24 --output artifacts/api-transparent.webm
```

全局参数放在子命令前，例如 `python scripts/beatbar_client.py --url http://127.0.0.1:8000 --timeout 900 render ...`。已有输出默认拒绝覆盖；确认需要替换时显式加 `--overwrite`。透明模式必须使用 .webm，其余模式用 .mp4。`--no-audio` 关闭成品音轨；`--project-name 名称` 会额外创建一个新的服务端项目，不覆盖已有项目。

传入 --project 时使用其中的 beats/style/输出设置，素材关联改为此次上传的文件；因此项目拍点必须落在所传素材时长内。不传项目时采用客户端的明确默认值：640×360、24 FPS、素材合成；这与原始 /api/export 的默认 green/1280×720/30 FPS 不同。`--width`、`--height`、`--fps`、`--mode` 可覆盖项目中的输出配置。

## 在自己的 Python 代码中复用

从仓库根目录运行以下代码。它上传 WAV，完成分析并使用分析结果渲染；无需浏览器。若要用自己的拍点，可把分析结果替换为按时间升序排列的 time/strength 数组。

```python
import sys
sys.path.insert(0, "scripts")
from beatbar_client import BeatBarClient

with BeatBarClient("http://127.0.0.1:8000") as api:
    media = api.upload("docs/examples/beatbar-120.wav")
    analysis = api.analyze(media["id"], sensitivity=55, minInterval=0.20)
    result = api.render({
        "mediaId": media["id"],
        "beats": analysis["beats"],
        "style": {"color": "#b7f56c", "pattern": "circle"},
        "mode": "composite", "width": 640, "height": 360, "fps": 24,
        "includeAudio": True, "filename": "python-demo.mp4",
    })
    api.download(result["url"], "artifacts/python-demo.mp4")
```

客户端同步等待单个任务，不等于媒体处理在调用方运行；计算和存储发生在配置的服务器上。默认每个后台任务等待最多 600 秒，可通过 timeout 调整。等待超时不代表服务器停止；异常信息会保留 job ID，调用方可继续 GET 任务状态，或在确认仍在运行时显式 POST cancel。

其他接口可直接使用 `api.request(method, endpoint, ...)`。例如列表为 `api.request("GET", "/api/projects")`；更新需带上读取到的 revision，删除也需查询参数 revision，不能绕过冲突控制。

当前未提供浏览器手势、撤销栈、系统文件选择器的远程接口。程序化处理以 JSON 数据为入口；队列持久化、鉴权和多进程扩展尚需另行设计，部署边界见 [设备、性能与容量规划](deployment.md)。

## 错误、资源与兼容性

| 情况                              | 常见响应与处理                          |
| --------------------------------- | --------------------------------------- |
| 空/不可探测媒体                   | 400，换有效文件                         |
| ID 或文件不存在                   | 404，不假定上次内存任务仍存在           |
| revision 过期                     | 409，保留当前编辑并重新读取，不直接覆盖 |
| 上传/项目体积、导出预算超限       | 413，缩小请求/素材/输出规格             |
| 输入字段、枚举、JSON 或文件名无效 | 422，读取 detail 后修正                 |
| Range 不合法或越界                | 416，读取 Content-Range                 |
| 磁盘或服务内部异常                | 500，保留用户内容后检查服务日志/空间    |

请求被接收与后台运行失败分开处理：202 之后仍可能因编码器或素材问题变为任务 error。项目名与下载名都是显示层信息，磁盘主键仍是 UUID。该服务没有登录和用户隔离，默认绑定本机，不应直接作为多用户公网 API 使用。
