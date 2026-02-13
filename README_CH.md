# SuperNote

中文说明 | [English](./README.md)

SuperNote 是一个本地优先的笔记生成工具，支持：
- B 站视频（本地转写 + 关键帧）
- 网页链接（Jina Reader）

项目包含：
- Node.js 后端 API
- Vue 3 前端

## 环境要求

- Node.js 18+
- npm 9+
- Python 3.10+（用于 Whisper）
- FFmpeg

说明：
- 仓库可直接使用内置 FFmpeg：`tools/ffmpeg/bin/ffmpeg.exe`（Windows）。

## 安装

详细的安装步骤（包括 **FFmpeg** 安装与 **CUDA/GPU 加速** 配置），请参考：[安装指南 (INSTALL_CH.md)](./INSTALL_CH.md)。

**Windows 用户快速安装**：双击运行 `setup.bat` 即可自动安装依赖。

**Linux 用户快速启动**：运行 `chmod +x start.sh && ./start.sh`。

快速开始（手动）：

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd apps/web
npm install

# 安装 Whisper
pip install -U openai-whisper
```

## 开发运行

启动后端（项目根目录）：

```bash
npm run dev
```

启动前端（新开终端）：

```bash
cd apps/web
npm run dev
```

默认地址：
- 后端：`http://localhost:3000`
- 前端：以终端输出为准（Vite）

## 首次配置

进入前端：`系统配置 -> 本地引擎与集成`

1. **本地转写引擎**
   - `命令`：whisper 可执行路径，例如 `D:\ProgramSoftware\Conda\Scripts\whisper.exe`
   - `ffmpeg 路径`：`tools/ffmpeg/bin/ffmpeg.exe`（或系统已安装 ffmpeg）
   - 模型建议：
     - 速度优先：`base`
     - 效果均衡：`small`
2. 点击 **测试命令**，确保 whisper 与 ffmpeg 均可用。
3. 保存配置。

## 使用方法

### B站链接生成笔记

1. 进入 `创作 -> B站链接生成笔记`
2. 粘贴一个或多个 B 站链接
3. 提交任务并等待完成
4. 生成后可保存为草稿或笔记

### 网页链接生成笔记

1. 进入 `创作 -> 网页链接生成笔记`
2. 粘贴一个或多个 http/https 链接
3. 提交任务

## 可选环境变量

按需创建 `.env`：

```bash
cp .env.example .env
```

常用配置：
- `PORT`
- `SESSDATA`（可选，可提升部分 B 站视频可访问性）
- `JINA_READER_ENDPOINT`、`JINA_API_KEY`
- `LOCAL_ASR_*`

## 构建

后端构建：

```bash
npm run build
```

前端构建：

```bash
cd apps/web
npm run build
```

## 常见问题

- `spawn ffmpeg ENOENT`
  - 在配置页填写正确的 ffmpeg 可执行路径。
- `spawn whisper ENOENT`
  - 安装 whisper，并将命令配置为绝对路径。
- `local transcribe timeout`
  - 调大本地转写超时，或改用更小模型。
- 前端提示接口返回 HTML
  - 检查 `VITE_API_BASE_URL`，建议使用 `/api`。
