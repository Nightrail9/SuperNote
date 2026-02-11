# Bilibili 视频解析器

中文文档 | [English](./README.md)

一个基于 TypeScript 的综合解决方案，用于解析 Bilibili 视频 URL，并将视频内容转换为结构化的 Markdown 文档，支持 AI 驱动的笔记整理功能。

## 概述

本项目提供了处理 Bilibili 视频的完整工作流程：
1. **解析**各种 Bilibili URL 格式（包括短链接）
2. **转换**视频内容为 Markdown，使用阿里云听悟转录服务
3. **整理**转录内容为结构化笔记，使用 AI 服务
4. **下载**整理后的笔记，支持单个或批量下载
5. **管理**通过 Vue 前端进行笔记、草稿、任务进度与配置管理

项目同时包含 REST API 后端与 Vue 3 前端。后端仍可被任意 API 工具或自定义客户端调用。

## 核心功能

### 视频解析
- 支持多种 Bilibili URL 格式：
  - 标准视频 URL：`https://www.bilibili.com/video/BV...`
  - 短链接：`https://b23.tv/...`
  - 移动端 URL 和其他变体
- 自动 URL 规范化和验证
- RESTful API 端点，支持程序化访问

### 视频转 Markdown
- 使用阿里云听悟自动转录
- 自动上传视频到阿里云 OSS
- 异步任务处理，支持状态跟踪
- 批量下载支持（ZIP 格式）
- 自动清理临时文件

### AI 驱动的笔记整理
- 集成外部 AI 服务（OpenAI、Claude 等）
- 可自定义提示词，适应不同笔记风格
- 结构化输出，层次清晰
- 详细的错误处理和反馈
- 安全的 API 密钥管理

### API 功能
- RESTful 端点，支持视频解析和总结
- 结构化 JSON 错误响应，带有阶段感知错误码
- CORS 支持，允许跨域 API 访问
- 健康检查端点，用于监控

## 目录

- [系统要求](#系统要求)
- [安装](#安装)
- [配置](#配置)
- [使用方法](#使用方法)
  - [API 端点](#api-端点)
- [开发](#开发)
- [项目结构](#项目结构)
- [故障排除](#故障排除)
- [安全性](#安全性)
- [许可证](#许可证)

## 系统要求

### 系统需求
- **Node.js**：>= 18.0.0
- **npm**：>= 9.0.0
- **操作系统**：Windows、macOS 或 Linux

### 外部服务（可选）
如需视频转 Markdown 功能，您需要：
- **阿里云听悟**账号及 API 访问权限
- **阿里云 OSS** 存储桶用于视频存储
- **AI 服务**（OpenAI、Claude 等）用于笔记整理

## 安装

### 1. 克隆仓库

```bash
git clone <repository-url>
cd bilibili-video-parser
```

### 2. 安装依赖

```bash
npm install
```

这将安装所有必需的依赖，包括：
- Express.js Web 服务器
- TypeScript 类型安全
- 阿里云 SDK（听悟和 OSS）
- Archiver ZIP 文件创建

### 3. 环境配置

在项目根目录创建 `.env` 文件，复制示例文件：

```bash
cp .env.example .env
```

在 Windows PowerShell 中可使用：

```powershell
Copy-Item .env.example .env
```

编辑 `.env` 文件，填入您的配置：

```env
# 服务器配置
PORT=3000
CORS_ORIGIN=http://localhost:3000

# Bilibili API（可选 - 改善解析效果）
SESSDATA=your_bilibili_sessdata_cookie

# 阿里云听悟（视频转换必需）
TINGWU_APP_KEY=your_tingwu_app_key

# 阿里云 OSS（视频转换必需）
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your_bucket_name
OSS_REGION=oss-cn-hangzhou
```

### 4. 启动应用

**开发模式**（支持热重载）：
```bash
npm run dev
```

这会启动 Express API 服务器：`http://localhost:3000`

如需运行 Vue 前端开发环境：

```bash
cd frontend-vue
npm install
npm run dev
```

前端默认运行在 `http://localhost:3000`，并将 `/api` 代理到后端（见 `frontend-vue/vite.config.ts`）。
若前后端分开运行，请先调整其中一个端口。

**生产模式**：
```bash
npm run build
node dist/web/server/index.js
```

API 地址：`http://localhost:3000`

构建前端静态资源：

```bash
cd frontend-vue
npm run build
```

当存在 `frontend-vue/dist/index.html` 时，后端会自动托管前端构建产物。

## 配置

### 基础模式（仅解析）

对于基本的 URL 解析功能，您只需要：
- `PORT`：服务器端口（默认：3000）
- `CORS_ORIGIN`：CORS 允许的源（默认：http://localhost:3000）
- `SESSDATA`：（可选）Bilibili 会话 cookie，改善解析效果

### 完整模式（解析 + 转换 + AI）

要使用包括视频转换和 AI 笔记在内的完整功能：

#### Bilibili 配置
- `SESSDATA`：您的 Bilibili 会话 cookie
  - 登录 bilibili.com
  - 打开浏览器开发者工具 → Application → Cookies
  - 复制 `SESSDATA` 值

#### 听悟配置
- `TINGWU_APP_KEY`：您的听悟应用密钥
  - 在[阿里云听悟](https://tingwu.aliyun.com/)注册
  - 创建应用
  - 复制 App Key

#### 阿里云 OSS 配置
- `ALIYUN_ACCESS_KEY_ID`：您的阿里云 Access Key ID
- `ALIYUN_ACCESS_KEY_SECRET`：您的阿里云 Access Key Secret
- `OSS_BUCKET`：您的 OSS 存储桶名称
- `OSS_REGION`：OSS 区域（例如：oss-cn-hangzhou）

获取阿里云凭证：
1. 登录[阿里云控制台](https://ram.console.aliyun.com/)
2. 导航到 AccessKey 管理
3. 创建新的 AccessKey 对
4. 在所需区域创建 OSS 存储桶

#### AI 服务配置
AI 配置（apiUrl、apiKey、prompt）在 `/api/summarize` 端点的请求体中按请求提供。

## 使用方法

### API 端点

除了解析与总结接口外，当前还提供笔记生命周期和配置管理接口。

#### 解析视频 URL

```http
POST /api/parse
Content-Type: application/json

{
  "url": "https://www.bilibili.com/video/BV1xx411c7XD"
}
```

**成功响应（200）：**
```json
{
  "success": true,
  "data": {
    "bvid": "BV1xx411c7XD",
    "title": "视频标题",
    "duration": 1234,
    "streams": [...]
  }
}
```

**错误响应（400）：**
```json
{
  "success": false,
  "error": {
    "stage": "server",
    "code": "MISSING_URL",
    "message": "Request body must contain a non-empty \"url\" field"
  }
}
```

#### 总结视频

```http
POST /api/summarize
Content-Type: application/json

{
  "url": "https://www.bilibili.com/video/BV1xx411c7XD",
  "apiUrl": "https://api.openai.com/v1/chat/completions",
  "apiKey": "sk-...",
  "prompt": "整理这些内容..."
}
```

**成功响应（200）：**
```json
{
  "success": true,
  "data": {
    "title": "视频标题",
    "summary": "# 整理后的笔记\n\n...",
    "markdown": "# 原始 Markdown\n\n..."
  }
}
```

**错误响应（400/500）：**
```json
{
  "success": false,
  "error": {
    "stage": "validate",
    "code": "MISSING_URL",
    "message": "Request body must contain a non-empty \"url\" field"
  }
}
```

#### 健康检查

```http
GET /health
```

**响应（200）：**
```json
{
  "status": "ok"
}
```

#### 其他接口分组

- `POST /api/notes/generate`：发起异步笔记生成任务
- `GET /api/tasks/:taskId`：查询任务状态与进度
- `GET/POST/PUT/DELETE /api/notes`：管理已发布笔记
- `GET/POST/PUT/DELETE /api/drafts`：管理草稿并发布为笔记
- `GET/PUT /api/settings/models`：管理模型供应商配置
- `GET/PUT /api/settings/prompts`：管理提示词模板
- `GET/PUT /api/settings/integrations`：管理 OSS、听悟、Jina Reader 集成配置

## 开发

### 可用脚本

```bash
# 仅构建 TypeScript 项目
npm run build
# 将 src/ 中的 TypeScript 源文件编译到 dist/
# 生成类型定义文件（.d.ts）
# 输出：dist/ 目录，包含编译后的 JavaScript

# 仅类型检查（不编译）
npm run typecheck
# 在检查模式下运行 TypeScript 编译器
# 报告类型错误但不生成文件
# 适用于 CI/CD 流水线

# 清理构建产物
npm run clean
# 删除 dist/ 目录
# 在全新构建前使用

# 启动 API 服务器（Express + tsx，支持热重载）
npm run dev
# Express: http://localhost:3000
```

### 开发工作流

1. **在 `src/` 或 `web/server/` 中修改代码**
2. **使用 `npm run dev` 启动开发模式**
3. **后端通过 tsx 自动重启**
4. **提交前运行 `npm run typecheck` 进行类型检查**

### 添加新功能

#### 添加新的 API 端点

1. 在 `web/server/routes/` 中创建路由处理器
2. 在 `web/server/index.ts` 中注册路由
3. 在 `src/types.ts` 中添加 TypeScript 类型
4. 在 README 中更新 API 文档

#### 添加新服务

1. 在 `web/server/services/` 中创建服务文件
2. 实现带有适当错误处理的服务逻辑
3. 添加单元测试（如适用）
4. 在路由处理器中导入和使用

### 代码风格指南

- 使用 **TypeScript** 确保类型安全
- 对异步代码遵循 **async/await** 模式
- 使用 try-catch 实现适当的**错误处理**
- 为公共 API 添加 **JSDoc 注释**
- 使用**有意义的变量名**
- 保持函数**小而专注**
- 在服务器上**验证用户输入**

### 测试

测试是通过 `tsx` 执行的自定义 TypeScript 测试程序：

```bash
# 运行单个测试文件
npx tsx web/server/routes/summarize.test.ts
npx tsx web/server/services/summary-pipeline.test.ts
npx tsx web/server/services/pipeline-utils.test.ts
npx tsx web/server/services/ai-organizer.test.ts
```

项目使用 `fast-check` 进行属性测试，配合手动断言风格的单元测试。

## 项目结构

```text
bilibili-video-parser/
│
├── src/                          # 核心解析库
│   ├── config.ts                 # 配置管理
│   ├── extractor.ts              # 视频信息提取
│   ├── http-client.ts            # HTTP 请求处理
│   ├── index.ts                  # 主入口点
│   ├── metadata-fetcher.ts       # 视频元数据获取
│   ├── normalizer.ts             # URL 规范化
│   ├── parser.ts                 # 主解析逻辑
│   ├── playurl-fetcher.ts        # 播放 URL 获取
│   ├── serializer.ts             # 数据序列化
│   ├── synthesizer.ts            # 数据合成
│   └── types.ts                  # TypeScript 类型定义
│
├── web/                          # Web 应用
│   └── server/                   # 后端 API 服务器
│       ├── routes/               # API 路由处理器
│       ├── services/             # 业务逻辑服务
│       │   ├── ai-organizer.ts         # AI 笔记整理
│       │   ├── config-loader.ts        # 配置文件加载
│       │   ├── file-cleaner.ts         # 临时文件清理
│       │   ├── markdown-generator.ts   # Markdown 生成
│       │   ├── oss-uploader.ts         # OSS 上传处理
│       │   ├── pipeline-utils.ts       # 流水线工具函数
│       │   ├── summary-pipeline.ts     # 统一总结流水线
│       │   └── tingwu-client.ts        # 听悟 API 客户端
│       ├── middleware/           # Express 中间件
│       │   └── cors.ts                 # CORS 配置
│       ├── utils/                # 工具函数
│       │   └── error-messages.ts       # 错误处理
│       ├── config.ts             # 服务器配置
│       └── index.ts              # 服务器入口点
│
├── frontend-vue/                 # Vue 3 前端（Vite + TypeScript）
│   ├── src/                      # 前端源码
│   ├── dist/                     # 前端构建产物（生成）
│   ├── package.json              # 前端依赖与脚本
│   └── vite.config.ts            # 开发服务器与代理配置
│
├── dist/                         # 编译输出（生成）
├── node_modules/                 # 依赖（生成）
├── temp/                         # 临时文件（运行时）
│
├── .dockerignore                 # Docker 忽略规则
├── .env                          # 环境变量（从 .env.example 创建）
├── .env.example                  # 环境模板
├── .gitignore                    # Git 忽略规则
├── Dockerfile                    # Docker 配置
├── package.json                  # 项目依赖
├── package-lock.json             # 依赖锁定文件
├── tsconfig.json                 # TypeScript 配置
└── README.md                     # 英文文档
```

### 关键目录

- **src/**：核心解析库，可独立使用
- **web/server/**：后端 API，在 Node.js 上运行
- **web/server/services/**：业务逻辑，与路由分离
- **web/server/routes/**：API 端点，精简控制器
- **frontend-vue/**：Vue 前端，用于创建、编辑和管理笔记
- **dist/**：编译后的 JavaScript（git 忽略）
- **temp/**：临时视频文件（git 忽略）

## 故障排除

### 视频转换问题

#### 问题：转换立即失败
**症状：**
- 任务状态显示"failed"
- 出现错误消息

**解决方案：**
1. 检查 `.env` 文件是否包含所有必需变量：
   - TINGWU_APP_KEY
   - ALIYUN_ACCESS_KEY_ID
   - ALIYUN_ACCESS_KEY_SECRET
   - OSS_BUCKET
   - OSS_REGION
2. 验证阿里云凭证是否有效
3. 检查 OSS 存储桶是否存在且可访问
4. 确保听悟服务已启用
5. 检查服务器日志以获取详细错误消息

#### 问题：转换卡在"uploading"
**症状：**
- 进度条停在上传阶段
- 无错误消息

**解决方案：**
1. 检查互联网连接速度
2. 验证 OSS 存储桶权限（写入访问）
3. 检查视频文件是否过大（>2GB 可能失败）
4. 重启服务器并重试
5. 检查 OSS 控制台是否有失败的上传

#### 问题：转换卡在"transcribing"
**症状：**
- 上传完成但转录未开始
- 状态保持"transcribing"数小时

**解决方案：**
1. 听悟可能正在处理（可能需要 10-30 分钟）
2. 检查听悟控制台的任务状态
3. 验证听悟服务配额未超出
4. 检查视频格式是否受支持
5. 先尝试较短的视频

### URL 解析问题

#### 问题："Invalid URL"错误
**症状：**
- 解析按钮不起作用
- 关于 URL 格式的错误消息

**解决方案：**
1. 确保 URL 来自 bilibili.com 或 b23.tv
2. 从浏览器地址栏复制完整 URL
3. 删除任何额外的字符或空格
4. 尝试移动端 URL 格式
5. 检查视频是否可用（未删除/私密）

#### 问题：解析的视频没有播放 URL
**症状：**
- 视频信息出现但没有可播放的 URL
- 无法开始转换

**解决方案：**
1. 在 `.env` 文件中添加 SESSDATA
2. 视频可能需要登录才能访问
3. 视频可能受地区限制
4. 尝试不同的视频进行测试
5. 检查视频在 Bilibili 上是否仍然可用

### 服务器问题

#### 问题：服务器无法启动
**症状：**
- `npm run dev` 失败
- 端口已被使用错误

**解决方案：**
1. 检查端口 3000 是否已被使用
   ```bash
   # Windows
   netstat -ano | findstr :3000
   # 终止使用该端口的进程
   taskkill /PID <process_id> /F
   ```
2. 在 `.env` 文件中更改 PORT
3. 检查代码中的语法错误
4. 删除 `node_modules` 并重新运行 `npm install`
5. 检查 Node.js 版本（必须 >= 18）

#### 问题：CORS 错误
**症状：**
- API 请求因 CORS 错误而失败
- "Access-Control-Allow-Origin"错误

**解决方案：**
1. 检查 `.env` 中的 CORS_ORIGIN 是否与客户端 URL 匹配
2. 更改 `.env` 后重启服务器
3. 尝试从正确的源访问

### 常规调试

#### 启用详细日志
在 `.env` 中添加：
```env
NODE_ENV=development
DEBUG=*
```

#### 检查服务器日志
服务器日志显示详细的错误信息：
- API 请求/响应详情
- 听悟 API 响应
- OSS 上传进度
- 错误堆栈跟踪

#### 常见错误代码
- `400`：错误请求（检查输入数据）
- `401`：未授权（检查 API 密钥）
- `403`：禁止访问（检查权限）
- `404`：未找到（检查 URL/端点）
- `429`：超出速率限制（等待并重试）
- `500`：服务器错误（检查服务器日志）
- `503`：服务不可用（检查外部服务）

## 安全性

### 环境变量

- **切勿提交** `.env` 文件到版本控制
- `.env` 默认列在 `.gitignore` 中
- 使用 `.env.example` 作为模板，不包含真实凭证
- 定期轮换凭证
- 开发和生产使用不同的凭证

### API 密钥

#### Bilibili SESSDATA
- 从登录后的浏览器 cookie 获取
- 提供对用户特定内容的访问
- 定期过期（需要重新登录）
- **风险**：低（对您的账户只读访问）

#### 阿里云凭证
- Access Key ID 和 Secret 提供完整的账户访问权限
- **风险**：高（可能产生费用，访问所有服务）
- **最佳实践**：
  - 创建具有最小权限的 RAM 用户
  - 仅授予 OSS 和听悟访问权限
  - 设置支出限制
  - 在阿里云账户上启用 MFA
  - 每 90 天轮换密钥

#### AI 服务 API 密钥
- 在 `/api/summarize` 端点的请求体中按请求提供
- **风险**：中等（可能产生 API 费用）
- **最佳实践**：
  - 使用具有支出限制的 API 密钥
  - 通过提供商仪表板监控使用情况
  - 定期轮换密钥
  - 开发/生产使用单独的密钥

### 数据隐私

#### 用户数据
- 服务器上不存储用户数据
- Markdown 内容仅在内存中处理
- 临时文件自动清理

#### 视频内容
- 视频上传到您的 OSS 存储桶
- 您控制保留和访问策略
- 考虑启用 OSS 加密
- 设置生命周期规则以自动删除旧文件

#### AI 处理
- Markdown 内容发送到 AI 服务
- 查看 AI 服务隐私政策
- 考虑数据驻留要求
- 对敏感内容使用自托管 AI

### 网络安全

#### HTTPS
- 所有外部 API 调用使用 HTTPS
- AI API URL 必须是 HTTPS（强制执行）
- OSS 上传使用 HTTPS
- 听悟 API 使用 HTTPS

#### CORS
- 配置 CORS_ORIGIN 以限制访问
- 默认：`http://localhost:3000`
- 生产：设置为您的域
- 生产中切勿使用 `*`

### 部署安全

#### 生产检查清单
- [ ] 使用环境变量（不硬编码）
- [ ] 在服务器上启用 HTTPS
- [ ] 设置安全的 CORS_ORIGIN
- [ ] 使用进程管理器（PM2、systemd）
- [ ] 启用防火墙规则
- [ ] 设置日志轮换
- [ ] 监控错误日志
- [ ] 实施速率限制
- [ ] 如需要添加身份验证
- [ ] 定期安全更新

#### Docker 安全
如果使用 Docker：
- 不要在镜像中包含 `.env`
- 使用密钥管理
- 以非 root 用户运行
- 扫描镜像漏洞
- 保持基础镜像更新

### 审计和监控

#### 监控内容
- API 使用和费用（阿里云、AI 服务）
- 失败的身份验证尝试
- 异常流量模式
- 错误率和类型
- 存储使用（OSS 存储桶）

#### 日志记录
- 服务器日志包含时间戳
- API 错误记录详细信息
- 日志中无敏感数据（API 密钥已过滤）
- 考虑集中式日志记录（ELK、Splunk）

### 事件响应

#### 如果凭证被泄露

1. **立即行动**：
   - 撤销被泄露的 API 密钥
   - 生成新凭证
   - 更新 `.env` 文件
   - 重启服务器

2. **调查**：
   - 检查访问日志
   - 查看最近的 API 使用情况
   - 识别未授权访问
   - 评估损害

3. **预防**：
   - 轮换所有相关凭证
   - 审查安全实践
   - 更新文档
   - 培训团队成员

### 合规性

#### GDPR 考虑
- 默认不收集个人数据
- 用户配置本地存储
- 视频内容可能包含个人数据
- 实施数据保留政策

#### 数据驻留
- 根据要求选择 OSS 区域
- 选择具有适当数据中心的 AI 服务
- 对敏感数据考虑自托管替代方案

### 安全最佳实践

1. **最小权限原则**
   - 授予最小必要权限
   - 使用 RAM 用户而不是 root 账户
   - 分离开发和生产凭证

2. **纵深防御**
   - 多层安全
   - 不依赖单一控制
   - 在客户端和服务器上验证输入

3. **定期更新**
   - 保持依赖更新
   - 监控安全公告
   - 及时应用补丁

4. **安全开发**
   - 代码审查安全问题
   - 使用 TypeScript 确保类型安全
   - 验证所有用户输入
   - 清理输出

5. **监控和警报**
   - 为异常活动设置警报
   - 监控 API 使用和费用
   - 定期查看日志
   - 跟踪错误率

## 贡献

欢迎贡献！请遵循以下指南：

### 如何贡献

1. **Fork 仓库**
2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **进行更改**
   - 遵循现有代码风格
   - 为复杂逻辑添加注释
   - 如需要更新文档
4. **测试您的更改**
   - 确保现有功能正常工作
   - 彻底测试新功能
5. **提交您的更改**
   ```bash
   git commit -m "Add: 您的更改描述"
   ```
6. **推送到您的 fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **创建 Pull Request**
   - 描述您的更改
   - 引用任何相关问题
   - 等待审查

### 代码风格

- 使用 TypeScript 确保类型安全
- 遵循现有命名约定
- 为公共 API 添加 JSDoc 注释
- 保持函数小而专注
- 对异步代码使用 async/await

### 报告问题

报告错误时，请包括：
- 问题描述
- 重现步骤
- 预期行为
- 实际行为
- 环境详情（操作系统、Node 版本、浏览器）
- 错误消息或日志

### 功能请求

请求功能时，请包括：
- 功能的清晰描述
- 用例和好处
- 可能的实现方法
- 任何相关示例或参考

## 路线图

计划的功能和改进：

- [ ] 自动化测试（单元和集成）
- [ ] 支持更多视频平台
- [ ] 批量视频处理
- [ ] 用户身份验证和多用户支持
- [ ] 数据库持久化存储
- [ ] WebSocket 实时更新
- [ ] Docker compose 简化部署
- [ ] CLI 工具用于命令行使用
- [ ] 插件系统实现可扩展性
- [ ] 高级 AI 提示词模板

## 常见问题

### 一般问题

**问：这个项目可以免费使用吗？**
答：是的，该项目在 MIT 许可证下开源。但是，您需要为外部服务（阿里云、AI API）付费。

**问：我可以商业使用吗？**
答：是的，MIT 许可证允许商业使用。

**问：这适用于其他视频平台吗？**
答：目前仅支持 Bilibili。未来可能会添加其他平台。

### 技术问题

**问：为什么我需要阿里云服务？**
答：听悟提供视频转录，OSS 临时存储视频文件。您可以修改代码以使用替代方案。

**问：我可以自托管 AI 服务吗？**
答：是的，任何具有兼容 API 的 AI 服务都可以使用。考虑 Ollama、LocalAI 或其他自托管解决方案。

**问：支持哪些视频格式？**
答：Bilibili 视频通常为 FLV 或 MP4 格式。听悟支持大多数常见视频格式。

**问：有文件大小限制吗？**
答：OSS 和听悟有各自的限制。通常，最大 2GB 的视频效果良好。

**问：我可以同时处理多个视频吗？**
答：目前，视频按顺序处理。未来可能会添加并行处理。

### 故障排除问题

**问：为什么我的转换需要这么长时间？**
答：听悟转录时间取决于视频长度。典型视频预计 10-30 分钟。

**问：为什么我会收到 CORS 错误？**
答：确保 `.env` 中的 CORS_ORIGIN 与您的前端 URL 完全匹配。

**问：我可以在没有 Docker 的情况下使用吗？**
答：是的，Docker 是可选的。您可以直接使用 Node.js 运行。

## 致谢

本项目使用以下服务和库：

- **Bilibili**：视频平台
- **阿里云听悟**：视频转录服务
- **阿里云 OSS**：对象存储服务
- **Express.js**：Web 框架
- **TypeScript**：类型安全的 JavaScript
- **OpenAI/Claude**：用于笔记整理的 AI 服务

## 支持

### 获取帮助

- **文档**：彻底阅读本 README
- **问题**：检查现有的 GitHub 问题
- **讨论**：使用 GitHub Discussions 提问
- **电子邮件**：联系维护者（如提供）

### 商业支持

对于商业支持、定制开发或咨询：
- 联系维护者
- 考虑聘请熟悉该技术栈的开发人员
- 首先查看代码和文档

## 许可证

MIT License

Copyright (c) 2024

特此免费授予任何获得本软件及相关文档文件（"软件"）副本的人不受限制地处理软件的权利，包括但不限于使用、复制、修改、合并、发布、分发、再许可和/或销售软件副本的权利，并允许向其提供软件的人这样做，但须符合以下条件：

上述版权声明和本许可声明应包含在软件的所有副本或重要部分中。

本软件按"原样"提供，不提供任何形式的明示或暗示保证，包括但不限于对适销性、特定用途适用性和非侵权性的保证。在任何情况下，作者或版权持有人均不对任何索赔、损害或其他责任负责，无论是在合同诉讼、侵权行为还是其他方面，由软件或软件的使用或其他交易引起、产生或与之相关。

---

**用 ❤️ 为开发者社区制作**
