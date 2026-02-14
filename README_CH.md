# SuperNote (超级笔记)

[English Documentation](./README.md)

SuperNote 是一个本地优先的笔记生成工具，支持 B 站视频与网页链接。项目使用本地转写（Whisper）、关键帧提取和 AI 整理，输出结构化笔记。

## 核心特性

- 本地优先：音视频处理链路尽量在本机完成。
- 前后端分离：Vue 3 前端 + Express 后端。
- 支持 B 站链接与网页链接生成任务。
- 任务化流程：可查看进度、失败重试、结果保存。

## 目录结构（重构后）

```text
.
├── apps/
│   ├── server/                # 后端 API
│   └── web/                   # 前端应用
├── packages/
│   └── parser-core/           # 解析核心库
├── scripts/
│   ├── dev/                   # 安装/启动主脚本
│   └── test/                  # 测试脚本
├── infra/
│   └── docker/                # Docker 部署文件（主入口）
├── storage/                   # 运行时数据
├── tools/                     # 本地工具目录（如 ffmpeg）
├── AGENTS.md
├── package.json
└── tsconfig.json
```

## 环境要求

- Node.js >= 18
- npm >= 9
- Python >= 3.10（本地 ASR 相关功能）
- FFmpeg（系统 PATH 或 `tools/ffmpeg/bin`）

## 安装

在项目根目录执行：

```bash
npm install
npm --prefix apps/web install
```

Windows 可直接运行：

```bat
setup.bat
```

说明：

- 主安装脚本位于 `scripts/dev/setup.bat`。
- 根目录 `setup.bat` 是兼容包装器。

## 开发启动

### 启动后端

```bash
npm run dev
# 或
npm run dev:server
```

### 启动前端

```bash
npm run dev:web
```

### 一键启动（兼容入口）

```bat
start.bat
```

```bash
./start.sh
```

说明：

- 主启动脚本位于 `scripts/dev/`。
- 根目录 `start.bat`、`start.sh` 为兼容包装器。

## 构建与类型检查

```bash
npm run build
npm run build:web
npm run typecheck
```

## 测试

运行单个后端测试文件：

```bash
npm run test:server:file -- apps/server/routes/settings-url.test.ts
```

运行全部后端测试：

```bash
npm run test:server:all
```

## Docker 部署

Docker 主入口已统一为 `infra/docker/`。

校验配置：

```bash
npm run docker:config
```

启动服务：

```bash
npm run docker:up
```

等价命令：

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## 运行数据说明

- `storage/data`：持久化数据。
- `storage/temp`：临时处理文件。
- `storage/public`：生成的静态资源。

请勿提交 `.env` 中的密钥，或 `storage/` 中的运行时敏感数据。

## 许可证

MIT
