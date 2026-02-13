# SuperNote

[中文说明](./README_CH.md)

SuperNote is a local-first note generator for:
- Bilibili videos (local transcription + keyframe pipeline)
- Web pages (Jina Reader)

It includes:
- Node.js backend API
- Vue 3 frontend

## Requirements

- Node.js 18+
- npm 9+
- Python 3.10+ (for Whisper)
- FFmpeg

Notes:
- This repository can use bundled FFmpeg at `tools/ffmpeg/bin/ffmpeg.exe` (Windows).

## Install

For detailed step-by-step instructions (including **FFmpeg** and **CUDA/GPU** setup), please see [INSTALL.md](./INSTALL.md).

**Windows Quick Start**: Run `setup.bat` to automatically install dependencies.

Quick start (manual):

```bash
# Install backend
npm install

# Install frontend
cd apps/web
npm install

# Install Whisper
pip install -U openai-whisper
```

## Run (Development)

Start backend (project root):

```bash
npm run dev
```

Start frontend (new terminal):

```bash
cd apps/web
npm run dev
```

Default URLs:
- Backend: `http://localhost:3000`
- Frontend: Vite dev server (check terminal output)

## First-Time Setup

Open frontend -> `System Settings` -> `Local Engine & Integrations`.

1. **Local Transcriber**
   - `command`: your whisper executable, e.g. `D:\ProgramSoftware\Conda\Scripts\whisper.exe`
   - `ffmpeg path`: `tools/ffmpeg/bin/ffmpeg.exe` (or your global ffmpeg)
   - model recommendation:
     - fast: `base`
     - balanced: `small`
2. Click **Test Command** and ensure both whisper and ffmpeg are available.
3. Save settings.

## Usage

### Bilibili Notes

1. Go to `Create -> Bilibili`.
2. Paste one or multiple Bilibili links.
3. Submit task and wait for completion.
4. Save result as draft or note.

### Web Notes

1. Go to `Create -> Web`.
2. Paste one or multiple HTTP/HTTPS links.
3. Submit task.

## Optional Environment File

Create `.env` from `.env.example` if needed:

```bash
cp .env.example .env
```

Common keys:
- `PORT`
- `SESSDATA` (optional, may improve Bilibili access)
- `JINA_READER_ENDPOINT`, `JINA_API_KEY`
- `LOCAL_ASR_*`

## Build

Backend build:

```bash
npm run build
```

Frontend build:

```bash
cd apps/web
npm run build
```

## Quick Troubleshooting

- `spawn ffmpeg ENOENT`
  - Set `ffmpeg path` in settings to a valid executable.
- `spawn whisper ENOENT`
  - Install whisper and set `command` to full executable path.
- `local transcribe timeout`
  - Increase transcribe timeout or use a smaller model.
- API returns HTML in frontend
  - Check `VITE_API_BASE_URL`; use `/api`.
