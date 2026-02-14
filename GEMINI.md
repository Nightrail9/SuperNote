# GEMINI.md - SuperNote Project Context

This file provides essential context for AI assistants working on the SuperNote project.

## Project Overview

**SuperNote** is a local-first note generation application designed to create structured notes and summaries from:
- **Bilibili Videos:** Processes links via a pipeline involving transcription (OpenAI Whisper), keyframe extraction (FFmpeg), and AI-driven summarization.
- **Web Pages:** Extracts content using Jina Reader and organizes it into notes.

The project is structured as a monorepo-style application with a Node.js backend and a Vue.js frontend.

## Architecture

- **Root Directory:** Contains project-wide configuration and handles backend development orchestration.
- **`apps/server`:** Express.js API server (TypeScript).
  - **Core Logic:** `apps/server/services/summary-pipeline.ts` orchestrates the entire "Video to Note" process.
  - **Persistence:** Uses `apps/server/services/app-data-store.ts` for managing application state, settings, and tasks (stored in `storage/data/app-data.json`).
  - **Static Assets:** Serves generated screenshots and artifacts from `storage/public`.
- **`apps/web`:** Vue 3 frontend (TypeScript + Vite + Element Plus).
  - **Main Entrance:** `apps/web/src/main.ts`.
  - **Key Components:** Markdown editor, task creation forms, and history management.
- **`packages/parser-core`:** A specialized library for parsing Bilibili URLs and fetching stream metadata.
- **`storage/`:** 
  - `data/`: JSON databases for app state.
  - `temp/`: Temporary files during processing (e.g., downloaded video chunks).
  - `public/`: Permanent artifacts like extracted keyframes.
- **`tools/ffmpeg/`:** Contains bundled FFmpeg binaries for Windows.

## Key Technologies

- **Backend:** Node.js, Express, TypeScript, tsx.
- **Frontend:** Vue 3, Pinia, Vue Router, Element Plus, md-editor-v3.
- **External Tools:**
  - **Whisper:** Required for local audio transcription (Python-based).
  - **FFmpeg:** Used for video processing and keyframe extraction.
  - **AI Models:** Integrated via OpenAI-compatible APIs for content summarization.

## Building and Running

### Development

1.  **Backend:** Run `npm run dev` in the project root. This starts the server on `http://localhost:3000`.
2.  **Frontend:** Navigate to `apps/web` and run `npm run dev`.
3.  **Requirements:** Ensure Python (with Whisper) and FFmpeg are installed and configured in the app settings.

### Installation

- **Windows:** Run `setup.bat` for automatic dependency installation.
- **Manual:**
  - Root: `npm install`
  - Frontend: `cd apps/web && npm install`
  - Whisper: `pip install -U openai-whisper`

### Building

- **Backend:** `npm run build` (Transpiles TypeScript to `dist/`).
- **Frontend:** `cd apps/web && npm run build` (Generates production build in `apps/web/dist/`).

## Development Conventions

- **Language:** TypeScript is mandatory for all new code.
- **Modules:** Uses ECMAScript Modules (`type: module`).
- **API Communication:** Frontend uses Axios to communicate with the `/api` prefix on the backend.
- **Error Handling:** Use custom `HttpError` and `sendApiError` utilities in the backend.
- **Configuration:** Managed via `.env` files and the internal `app-data-store.ts`.
- **Local Settings:** Users configure tool paths (Whisper, FFmpeg) directly in the frontend, which are persisted to `storage/data/app-data.json`.

## Key Files for Investigation

- `apps/server/services/summary-pipeline.ts`: The main "brain" of the application logic.
- `apps/server/routes/`: Contains all API endpoint definitions.
- `apps/web/src/views/create/`: Implementation of Bilibili and Web note creation logic.
- `storage/data/app-data.json`: The primary local "database".
