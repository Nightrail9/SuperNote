# SuperNote

[中文文档](./README_CH.md)

SuperNote is a local-first note generator for Bilibili videos and web pages. It extracts audio, transcribes speech using OpenAI Whisper, captures keyframes, and generates structured notes.

## Features

- **Bilibili Video Notes**: Extract audio, transcribe with Whisper, capture keyframes, AI-powered organization
- **Web Page Notes**: Use Jina Reader to extract and summarize web content
- **Local-first**: All data stored locally, privacy-focused
- **Modern Stack**: Node.js + Express backend, Vue 3 + TypeScript frontend
- **Docker Ready**: One-command deployment with Docker Compose

## Quick Start

### Option 1: Docker (Recommended)

The easiest way to run SuperNote. Includes all dependencies (Node.js, Python, Whisper, FFmpeg).

#### Windows (with Docker Desktop)

```powershell
# Clone the repository
git clone https://github.com/YOUR_USERNAME/SuperNote.git
cd SuperNote

# Start with Docker Compose
docker-compose up -d

# Access the application
# Open http://localhost:3000 in your browser
```

#### Linux (Ubuntu/Debian)

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/SuperNote.git
cd SuperNote

# Start with Docker Compose
sudo docker-compose up -d

# Or without sudo (if user is in docker group)
docker-compose up -d

# Access the application
# Open http://localhost:3000 in your browser
```

#### View Logs

```bash
docker-compose logs -f supernote
```

#### Stop the Application

```bash
docker-compose down
```

### Option 2: Manual Installation

If you prefer to run without Docker, install the following prerequisites:

#### Prerequisites

- **Node.js** 18+ and npm 9+
- **Python** 3.10+ (for Whisper)
- **FFmpeg** (for audio/video processing)
- **Whisper**: `pip install openai-whisper`

#### Windows

```powershell
# Install backend dependencies
npm install

# Install frontend dependencies
cd apps/web
npm install
cd ../..

# Start backend
npm run dev

# In another terminal, start frontend
cd apps/web
npm run dev
```

#### Linux

```bash
# Install system dependencies
sudo apt update
sudo apt install -y ffmpeg python3 python3-pip

# Install Whisper
pip3 install openai-whisper

# Install backend dependencies
npm install

# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Make start script executable
chmod +x start.sh

# Start the application
./start.sh
```

## First-Time Configuration

1. Open `http://localhost:3000` in your browser
2. Click the settings icon → **Local Engine & Integrations**
3. Configure Local Transcriber:
   - **Command**: `whisper` (Docker) or full path to your whisper executable
   - **FFmpeg Path**: `ffmpeg` (Docker) or full path
   - **Model**: `base` (recommended for Docker), `small` for better quality
   - **Device**: `cpu` (Docker), `cuda` if you have GPU
4. Click **Test Command** to verify
5. Save settings

## Usage

### Bilibili Notes

1. Go to **Create → Bilibili**
2. Paste one or more Bilibili video URLs
3. Click Submit and wait for processing
4. Save as draft or note

### Web Notes

1. Go to **Create → Web**
2. Paste one or more web page URLs
3. Click Submit

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `SESSDATA` | Bilibili session cookie (optional) | - |
| `JINA_API_KEY` | Jina Reader API key (optional) | - |
| `LOCAL_ASR_COMMAND` | Whisper command | `whisper` |
| `LOCAL_ASR_MODEL` | Whisper model | `base` |
| `LOCAL_ASR_DEVICE` | Compute device | `cpu` |

## Development

```bash
# Type check
npm run typecheck

# Build backend
npm run build

# Clean build
npm run clean
```

## Project Structure

```
.
├── apps/
│   ├── server/          # Express.js API server
│   └── web/             # Vue 3 frontend
├── packages/
│   └── parser-core/     # Bilibili parser library
├── storage/             # Data storage (created automatically)
├── Dockerfile           # Docker image definition
└── docker-compose.yml   # Docker Compose configuration
```

## Troubleshooting

### Docker: Container fails to start

```bash
# Check logs
docker-compose logs supernote

# Rebuild the image
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Whisper not found

Docker: Already included. Manual: Ensure whisper is in PATH or provide full path in settings.

### FFmpeg not found

Docker: Already included. Manual: Install FFmpeg and configure path in settings.

### Transcription timeout

- Use a smaller model (`base` or `tiny`)
- Increase timeout in settings
- Ensure sufficient system resources

## License

MIT

## Support

For issues and feature requests, please use [GitHub Issues](https://github.com/YOUR_USERNAME/SuperNote/issues).
