# SuperNote

[中文文档](./README_CH.md)

SuperNote is a local-first note generation tool for Bilibili videos and web pages. It uses local transcription (Whisper), optional keyframe extraction, and AI organization to generate structured notes.

## Highlights

- Local-first processing for video/audio workflows.
- Vue 3 frontend + Express backend.
- Supports Bilibili links and web-page ingestion.
- Task-based generation pipeline with progress and retry support.

## Project Structure

```text
.
├── apps/
│   ├── server/                # Express API
│   └── web/                   # Vue 3 frontend
├── packages/
│   └── parser-core/           # Shared parser core
├── scripts/
│   ├── dev/                   # Canonical setup/start scripts
│   └── test/                  # Test runner scripts
├── infra/
│   └── docker/                # Dockerfile + compose (canonical)
├── storage/                   # Runtime data/temp/public assets
├── tools/                     # Local tool binaries (e.g. ffmpeg)
├── AGENTS.md
├── package.json
└── tsconfig.json
```

## Requirements

- Node.js >= 18
- npm >= 9
- Python >= 3.10 (for local ASR workflows)
- FFmpeg available in PATH or under `tools/ffmpeg/bin`

## Installation

Run from project root:

```bash
npm install
npm --prefix apps/web install
```

Windows helper:

```bat
setup.bat
```

Notes:

- Canonical setup script is `scripts/dev/setup.bat`.
- Root `setup.bat` is a compatibility wrapper.

## Development

### Start backend

```bash
npm run dev
# or
npm run dev:server
```

### Start frontend

```bash
npm run dev:web
```

### One-click start (Windows/macOS/Linux wrapper)

```bat
start.bat
```

```bash
./start.sh
```

Notes:

- Canonical start scripts are in `scripts/dev/`.
- Root `start.bat` and `start.sh` are compatibility wrappers.

## Build / Typecheck

```bash
npm run build
npm run build:web
npm run typecheck
```

## Test

Run a single server test file:

```bash
npm run test:server:file -- apps/server/routes/settings-url.test.ts
```

Run all server tests:

```bash
npm run test:server:all
```

## Docker Deployment

Canonical Docker files are under `infra/docker/`.

Validate compose:

```bash
npm run docker:config
```

Start services:

```bash
npm run docker:up
```

Equivalent direct command:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## Runtime Data

- `storage/data`: persisted application data.
- `storage/temp`: temporary processing files.
- `storage/public`: generated static assets.

Do not commit secrets from `.env` or runtime data in `storage/`.

## License

MIT
