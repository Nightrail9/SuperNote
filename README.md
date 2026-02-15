# SuperNote

[中文文档](./README_CH.md)

SuperNote is a local-first note generator for Bilibili links and web pages. It combines local transcription, URL parsing, and AI structuring to produce editable notes and drafts.

## Quick Install (Recommended)

### 1) Prepare runtime

- Node.js `>= 18`
- npm `>= 9`
- Python `>= 3.10`
- FFmpeg available in PATH (or `tools/ffmpeg/bin`)

### 2) Install dependencies

Run in project root:

```bash
npm install
npm --prefix apps/web install
```

### 3) Create env file

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4) Start services (local dev)

Backend:

```bash
npm run dev
```

Frontend:

```bash
npm run dev:web
```

Or use wrapper scripts:

```bat
start.bat
```

```bash
./start.sh
```

## Docker Install and Deployment

Docker files live in `infra/docker/`.

### 1) Prepare env file

```bash
cp .env.example .env
```

### 2) Validate compose

```bash
npm run docker:config
```

### 3) Build and run

```bash
npm run docker:up
```

Equivalent command:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 4) Verify installation

- App: `http://localhost:3000`
- Health: `http://localhost:3000/health`

## Common Install Issues (Windows/Linux)

- `npm install` fails with SSL/network errors: switch to a stable npm registry, then retry.
- Python/Whisper command not found: confirm Python `>=3.10` is installed and available in PATH.
- FFmpeg not found: install FFmpeg and verify `ffmpeg -version` works in your terminal.
- Port already in use (`3000`/`3001`): stop the conflicting process, or start with a different `PORT`.
- Docker starts but app is unhealthy: run `docker compose -f infra/docker/docker-compose.yml logs -f` and confirm `.env` exists.
- Linux permission issue on `storage/`: run `mkdir -p storage/data storage/temp storage/public` and ensure current user can write.

## Screenshots

### Note view

![Note](images/笔记.png)

### Drafts

![Drafts](images/草稿箱.png)

### Web link -> note

![Web note](images/网页链接生成笔记.png)

### Web task list

![Web task](images/网页生成任务.png)

### Web generation in progress

![Web generating](images/网页生成中.png)

### Bilibili link -> note

![Bilibili note](images/B站链接生成笔记.png)

### Bilibili task list

![Bilibili task](images/B站生成任务.png)

### Bilibili generation in progress

![Bilibili generating](images/B站生成中.png)

## Common Commands

```bash
npm run build
npm run build:web
npm run typecheck
npm run test:server:all
```

## Runtime Data

- `storage/data`: persisted data
- `storage/temp`: temporary processing files
- `storage/public`: generated static assets

Do not commit `.env` secrets or sensitive runtime files.

## License

MIT
