# 参考来源与第三方许可声明

本文件说明 BeatBar Studio 的参考来源、主要依赖及媒体编码程序的许可边界。自有代码使用根目录的 [MIT License](LICENSE)；第三方代码、工具和二进制文件仍适用各自的许可证。

本仓库分发应用源码与许可文本，不包含 Python 虚拟环境、Node 依赖目录、FFmpeg 可执行文件或用户上传素材。安装时下载的依赖由各自的软件包提供。以下为主要组件清单，不是所有平台、所有可选功能和全部传递依赖的完整软件物料清单。

## 参考项目

- 项目：[Rantark/beat-bar-video-creator-with-funscript](https://github.com/Rantark/beat-bar-video-creator-with-funscript)。
- 参考提交：[87f61b350bb6975b604d9493e6f2298fb7c4c387](https://github.com/Rantark/beat-bar-video-creator-with-funscript/tree/87f61b350bb6975b604d9493e6f2298fb7c4c387)。
- 参考内容：频谱起音检测、时间轴编辑与从右向左滚动的节奏条设计；本项目实现中文 Web 工作台及相应媒体处理流程。
- 上游协议：MIT；[固定提交的许可证](https://github.com/Rantark/beat-bar-video-creator-with-funscript/blob/87f61b350bb6975b604d9493e6f2298fb7c4c387/LICENSE)。
- 原版权声明：`Copyright (c) 2026 Rantark`。
- 完整原文单独保存在 [licenses/Rantark-MIT.txt](licenses/Rantark-MIT.txt)，随本仓库保留。该文件不改写为 BeatBar Studio 的版权声明，也不表示上游作者为本项目背书。

## 主要 Python 组件

以下标识根据 2026-11-25 的本地安装包元数据与许可证文件核对。安装版本由[运行依赖范围](requirements.txt)决定；更新或换平台后，应以实际安装包中的许可、版权及额外声明为准。

| 组件             | 用途                                   | 主要许可证 / 额外说明                                         | 上游许可来源                                                                      |
| ---------------- | -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FastAPI          | 本地 API 服务                          | MIT                                                           | [LICENSE](https://github.com/fastapi/fastapi/blob/master/LICENSE)                 |
| Uvicorn          | ASGI 服务进程                          | BSD-3-Clause                                                  | [LICENSE.md](https://github.com/Kludex/uvicorn/blob/main/LICENSE.md)              |
| python-multipart | 处理媒体上传表单                       | Apache-2.0                                                    | [LICENSE.txt](https://github.com/Kludex/python-multipart/blob/master/LICENSE.txt) |
| NumPy            | 音频数值计算                           | 主要为 BSD-3-Clause；安装包另含其他组件的许可与版权声明       | [LICENSE.txt](https://github.com/numpy/numpy/blob/main/LICENSE.txt)               |
| SciPy            | 滤波、频谱与峰值检测                   | 主要为 BSD-3-Clause；二进制发行物可能带有额外组件及运行库声明 | [LICENSE.txt](https://github.com/scipy/scipy/blob/main/LICENSE.txt)               |
| Pillow           | 逐帧绘图与图片处理                     | 当前核验包标识为 MIT-CMU；图像库等内嵌组件另有声明            | [LICENSE](https://github.com/python-pillow/Pillow/blob/main/LICENSE)              |
| imageio-ffmpeg   | 查找并提供 FFmpeg 程序                 | Python 包装层为 BSD-2-Clause；不代表所带 FFmpeg 也适用 BSD    | [LICENSE](https://github.com/imageio/imageio-ffmpeg/blob/main/LICENSE)            |
| httpx2           | 测试所用 HTTP 客户端，列于当前依赖文件 | BSD-3-Clause                                                  | [LICENSE.md](https://github.com/pydantic/httpx2/blob/main/LICENSE.md)             |
| Pydantic         | 请求模型和参数校验                     | MIT；依赖的其他包另行适用各自许可                             | [LICENSE](https://github.com/pydantic/pydantic/blob/main/LICENSE)                 |
| Starlette        | FastAPI 的 Web 基础组件和测试支持      | BSD-3-Clause                                                  | [LICENSE.md](https://github.com/Kludex/starlette/blob/main/LICENSE.md)            |

NumPy、SciPy、Pillow 等二进制包可包含其他项目的代码或库；只保留上表中的主协议名称不能代替其完整发行声明。分发这些包时，需保留其自带的完整许可、版权和适用的 NOTICE 文件。

## 开发工具

| 组件          | 本仓库记录的版本 | 用途                   | 许可证与来源                                                                          |
| ------------- | ---------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Prettier      | 3.6.2            | 代码格式化             | MIT；[LICENSE](https://github.com/prettier/prettier/blob/main/LICENSE)                |
| agent-browser | 0.21.0           | 可选浏览器开发验证工具 | Apache-2.0；[LICENSE](https://github.com/vercel-labs/agent-browser/blob/main/LICENSE) |

版本见 [package.json](package.json) 和 [pnpm-lock.yaml](pnpm-lock.yaml)。日常启动无需 Node.js；仓库中的浏览器回归脚本直接使用 Chrome DevTools Protocol。Chrome 等浏览器本身不随本项目分发，适用其供应商条款。

## FFmpeg 与编码器

### 包装层与二进制不是同一许可范围

应用通过 `imageio_ffmpeg.get_ffmpeg_exe()` 选择 FFmpeg，再以独立子进程执行媒体探测、分析和编码。`imageio-ffmpeg` 的 BSD-2-Clause 许可证不替代 FFmpeg 及其静态/动态链接组件的许可证。

FFmpeg 官方说明：其许可会随编译选项及启用的第三方库发生变化；基础部分涉及 LGPL，启用 GPL 组件或 `--enable-version3` 等配置后，发行物的适用许可也会变化。参考 [FFmpeg Legal](https://ffmpeg.org/legal.html) 和 [FFmpeg License](https://ffmpeg.org/doxygen/trunk/md_LICENSE.html)。不能把所有 FFmpeg 构建统一标为“MIT”或“LGPL”。

### 当前环境核验记录

2026-11-25 在本项目 Windows 开发环境，对实际选中的程序执行 `-version` 和 `-L`，观察到以下信息摘录：

```text
ffmpeg version 9.0.2-essentials_build-www.gyan.dev
configuration contains:
  --enable-gpl --enable-version3 --enable-static
  --enable-libx264 --enable-libx265 --enable-libvpx --enable-libopus
-L reports: GNU General Public License, version 3 or (at your option) any later version
```

因此，该**核验样本**的程序自报许可为 **GPL-3.0-or-later**。这不是对所有操作系统、未来下载版本或自定义 FFmpeg 的统一结论。GPLv3 原文保存在 [licenses/GPL-3.0.txt](licenses/GPL-3.0.txt)；保留该文本不改变 BeatBar Studio 自有源码的 MIT 授权范围。

可在自己的安装环境重新检查：

```powershell
.venv\Scripts\python.exe -c "import imageio_ffmpeg,subprocess; p=imageio_ffmpeg.get_ffmpeg_exe(); print(p); subprocess.run([p,'-version'],check=True); subprocess.run([p,'-L'],check=True)"
```

macOS / Linux 将 Python 路径替换为 `.venv/bin/python`。当前应用使用 `libx264`、VP9、AAC、Opus 等编码选项；更换 FFmpeg 构建后，需要重新验证编码器可用性及导出测试，不能假定任意构建都可直接替换。

### 制作安装包或便携包时

若自行分发 FFmpeg、依赖 wheel、运行库或完整虚拟环境，需要针对**实际分发的版本和构建**完成许可核对，而不能只附本项目的 MIT 文件：

1. 保存完整版本、构建选项、来源、组件许可、版权和适用的 NOTICE 文件。
2. 随发行物提供适用的协议文本；若许可证要求，提供相应源代码、构建/修改资料或符合其规定的源代码获取安排。GPLv3 对目标代码分发的具体要求见[官方第 6 节](https://www.gnu.org/licenses/gpl-3.0.html#section6)。
3. 不要用“源码在上游网站”这一句替代对实际发行物应履行的义务；也不要将所有依赖标注为 MIT。
4. FFmpeg 官方的编解码器与专利说明同样需要结合使用地区、发行方式和所用编码器评估；开源代码许可本身不等同于取得所有专利或商标授权。

## 素材与输出文件

本项目的代码许可证不改变上传音乐、视频、自定义图片、字体、商标等内容的权利归属，也不授予未取得的素材使用权。生成、分享或商业使用输出文件时，仍需具备相应素材及其他适用授权。

测试素材由[生成脚本](scripts/generate-fixtures.py)合成，不随仓库提交用户媒体。

## 声明维护

修改或新增依赖时，请同步核对其实际版本、完整许可证与额外声明，并更新本文件。这里保留的参考项目许可和 GNU 协议文本用于明确来源与分发参考，不构成对任意打包方式的合规保证。
