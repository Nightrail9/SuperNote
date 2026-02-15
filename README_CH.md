# SuperNote (超级笔记)

[English Documentation](./README.md)

SuperNote 是一个本地优先的笔记生成工具，支持 B 站链接和网页链接，自动生成可编辑的结构化笔记与草稿。

## 快速安装（推荐）

### 1）准备环境

- Node.js `>= 18`
- npm `>= 9`
- Python `>= 3.10`
- FFmpeg（系统 PATH 或 `tools/ffmpeg/bin`）

### 2）安装依赖

在项目根目录执行：

```bash
npm install
npm --prefix apps/web install
```

### 3）创建环境变量文件

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

### 4）本地启动

启动后端：

```bash
npm run dev
```

启动前端：

```bash
npm run dev:web
```

或使用一键脚本：

```bat
start.bat
```

```bash
./start.sh
```

## Docker 安装与部署

Docker 主入口位于 `infra/docker/`。

### 1）创建环境变量文件

```bash
cp .env.example .env
```

### 2）校验 compose

```bash
npm run docker:config
```

### 3）构建并启动

```bash
npm run docker:up
```

等价命令：

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 4）安装成功验证

- 应用地址：`http://localhost:3000`
- 健康检查：`http://localhost:3000/health`

## 常见安装问题（Windows/Linux）

- `npm install` 出现网络或 SSL 错误：切换可用 npm 源后重试。
- 找不到 Python 或 Whisper：确认 Python `>=3.10` 已安装并加入 PATH。
- 找不到 FFmpeg：安装 FFmpeg，并在终端执行 `ffmpeg -version` 验证。
- `3000`/`3001` 端口被占用：先结束占用进程，或改用其他 `PORT`。
- Docker 启动后健康检查失败：执行 `docker compose -f infra/docker/docker-compose.yml logs -f`，并确认 `.env` 已创建。
- Linux 下 `storage/` 权限不足：执行 `mkdir -p storage/data storage/temp storage/public` 并确保当前用户可写。

## 项目演示截图

### 笔记

![笔记](images/笔记.png)

### 草稿箱

![草稿箱](images/草稿箱.png)

### 网页链接生成笔记

![网页链接生成笔记](images/网页链接生成笔记.png)

### 网页生成任务

![网页生成任务](images/网页生成任务.png)

### 网页生成中

![网页生成中](images/网页生成中.png)

### B站链接生成笔记

![B站链接生成笔记](images/B站链接生成笔记.png)

### B站生成任务

![B站生成任务](images/B站生成任务.png)

### B站生成中

![B站生成中](images/B站生成中.png)

## 常用命令

```bash
npm run build
npm run build:web
npm run typecheck
npm run test:server:all
```

## 运行数据说明

- `storage/data`：持久化数据
- `storage/temp`：临时处理文件
- `storage/public`：生成的静态资源

请勿提交 `.env` 中的密钥，或 `storage/` 中的运行时敏感数据。

## 许可证

MIT
