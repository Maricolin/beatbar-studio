# 参考项目与第三方组件

本项目参考 [Rantark/beat-bar-video-creator-with-funscript](https://github.com/Rantark/beat-bar-video-creator-with-funscript)（参考提交 87f61b350bb6975b604d9493e6f2298fb7c4c387）的频谱起音检测、时间轴编辑和从右向左滚动节奏条设计，独立实现中文 Web 工作台。原库使用 MIT License，保留其声明如下。

MIT License

Copyright (c) 2026 Rantark

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 运行组件

- FastAPI / Uvicorn：本地 Web 服务。
- NumPy / SciPy：音频频谱和起音检测。
- Pillow：逐帧轨道绘制。
- imageio-ffmpeg：提供 FFmpeg 可执行文件；所带 FFmpeg 和相关编码器遵循各自许可证，分发二进制时请保留其声明。
- agent-browser / Prettier：仅用于开发验证和代码格式化，日常启动不依赖 Node.js。
