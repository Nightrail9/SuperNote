# SuperNote

[English Documentation](./README.md)

SuperNote 是一个本地优先的笔记生成工具，支持 B 站视频和网页链接。它可以提取音频、使用 OpenAI Whisper 进行语音转文字、捕获关键帧，并生成结构化的笔记。

## 功能特性

- **B 站视频笔记**：提取音频、Whisper 语音转写、捕获关键帧、AI 智能组织
- **网页链接笔记**：使用 Jina Reader 提取和总结网页内容
- **本地优先**：所有数据本地存储，注重隐私
- **现代技术栈**：Node.js + Express 后端，Vue 3 + TypeScript 前端
- **Docker 支持**：一条命令即可部署

## 快速开始

### 方式一：Docker（推荐）

最简单的运行方式，已包含所有依赖（Node.js、Python、Whisper、FFmpeg）。

#### Windows（使用 Docker Desktop）

```powershell
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/SuperNote.git
cd SuperNote

# 使用 Docker Compose 启动
docker-compose up -d

# 访问应用
# 在浏览器中打开 http://localhost:3000
```

#### Linux（Ubuntu/Debian）

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/SuperNote.git
cd SuperNote

# 使用 Docker Compose 启动
sudo docker-compose up -d

# 或者不使用 sudo（如果用户在 docker 组中）
docker-compose up -d

# 访问应用
# 在浏览器中打开 http://localhost:3000
```

#### 查看日志

```bash
docker-compose logs -f supernote
```

#### 停止应用

```bash
docker-compose down
```

### 方式二：手动安装

如果你不想使用 Docker，需要安装以下依赖：

#### 环境要求

- **Node.js** 18+ 和 npm 9+
- **Python** 3.10+（用于 Whisper）
- **FFmpeg**（用于音视频处理）
- **Whisper**：`pip install openai-whisper`

#### Windows

```powershell
# 安装后端依赖
npm install

# 安装前端依赖
cd apps/web
npm install
cd ../..

# 启动后端
npm run dev

# 在另一个终端启动前端
cd apps/web
npm run dev
```

#### Linux

```bash
# 安装系统依赖
sudo apt update
sudo apt install -y ffmpeg python3 python3-pip

# 安装 Whisper
pip3 install openai-whisper

# 安装后端依赖
npm install

# 安装前端依赖
cd apps/web && npm install && cd ../..

# 赋予启动脚本执行权限
chmod +x start.sh

# 启动应用
./start.sh
```

## 首次配置

1. 在浏览器中打开 `http://localhost:3000`
2. 点击右上角设置图标 → **本地引擎与集成**
3. 配置本地转写引擎：
   - **命令**：`whisper`（Docker）或 whisper 可执行文件的完整路径
   - **FFmpeg 路径**：`ffmpeg`（Docker）或完整路径
   - **模型**：`base`（Docker 推荐），`small` 效果更好
   - **计算设备**：`cpu`（Docker），如有 GPU 可选 `cuda`
4. 点击 **测试命令** 验证配置
5. 保存设置

## 使用方法

### B 站视频生成笔记

1. 进入 **创作 → B 站链接生成笔记**
2. 粘贴一个或多个 B 站视频链接
3. 点击提交，等待处理完成
4. 保存为草稿或笔记

### 网页链接生成笔记

1. 进入 **创作 → 网页链接生成笔记**
2. 粘贴一个或多个网页链接
3. 点击提交

## 环境变量

从 `.env.example` 创建 `.env` 文件：

```bash
cp .env.example .env
```

关键变量：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `SESSDATA` | B 站登录 Cookie（可选） | - |
| `JINA_API_KEY` | Jina Reader API 密钥（可选） | - |
| `LOCAL_ASR_COMMAND` | Whisper 命令 | `whisper` |
| `LOCAL_ASR_MODEL` | Whisper 模型 | `base` |
| `LOCAL_ASR_DEVICE` | 计算设备 | `cpu` |

## 开发

```bash
# 类型检查
npm run typecheck

# 构建后端
npm run build

# 清理构建
npm run clean
```

## 项目结构

```
.
├── apps/
│   ├── server/          # Express.js API 服务器
│   └── web/             # Vue 3 前端
├── packages/
│   └── parser-core/     # B 站解析器库
├── storage/             # 数据存储（自动创建）
├── Dockerfile           # Docker 镜像定义
└── docker-compose.yml   # Docker Compose 配置
```

## 常见问题

### Docker：容器无法启动

```bash
# 查看日志
docker-compose logs supernote

# 重新构建镜像
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 找不到 Whisper

Docker：已内置。手动安装：确保 whisper 在 PATH 中，或在设置中提供完整路径。

### 找不到 FFmpeg

Docker：已内置。手动安装：安装 FFmpeg 并在设置中配置路径。

### 转写超时

- 使用更小的模型（`base` 或 `tiny`）
- 在设置中增加超时时间
- 确保系统资源充足

## 开源协议

MIT

## 支持

如有问题或功能建议，请使用 [GitHub Issues](https://github.com/YOUR_USERNAME/SuperNote/issues)。
