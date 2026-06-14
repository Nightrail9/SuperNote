# AGENTS.md

## Project Overview

SuperNote is a local-first AI note-generation app for Bilibili videos and web pages. The repository contains:

- Express + TypeScript backend in `apps/server`
- Vue 3 + Vite frontend in `apps/web`
- Bilibili parser core in `packages/parser-core`
- Docker deployment files in `infra/docker`
- Runtime and application configuration files in `setting`

## Environment

- Node.js >= 18
- npm >= 9
- Python >= 3.10
- FFmpeg must be available from the system `PATH` or `tools/ffmpeg/bin`

## Install

From the repository root, install dependencies with:

```bash
npm install
npm --prefix apps/web install
```

## Development

Start the backend from the repository root with:

```bash
npm run dev
```

Start the frontend from the repository root with:

```bash
npm run dev:web
```

The frontend development server runs on port 3000 and proxies `/api` and `/static` requests to the backend on port 3001.

## Build and Checks

Before submitting code changes, run the relevant checks from the repository root:

```bash
npm run typecheck
npm run build
npm run build:web
```

There is currently no formal test script. If tests are added, document them here and in the relevant `package.json` file.

## Code Organization

- Backend API routes live in `apps/server/routes`.
- Backend business logic lives in `apps/server/services`.
- Backend shared utilities live in `apps/server/utils`.
- Frontend routes and menu configuration live in `apps/web/src/router/index.ts`.
- Frontend pages live in `apps/web/src/views`.
- Frontend reusable components live in `apps/web/src/components`.
- Bilibili parser logic lives in `packages/parser-core/src`.

## Configuration and Secrets

- Non-secret application configuration belongs in `setting/*.json`.
- Secrets must be stored only in `.env`.
- Do not commit `.env`, generated runtime data, or local machine-specific files.
- Historical and runtime data belongs under `data/`.

## Style Guidelines

- Keep TypeScript strict and type-safe.
- Prefer small, focused modules.
- Do not wrap imports in try/catch blocks.
- Keep backend API changes aligned with frontend API client changes.
- If changing visible frontend behavior, update screenshots or documentation when appropriate.

## Pull Request Expectations

- Summarize user-facing changes.
- List validation commands that were run.
- Mention any skipped checks and why.
- For frontend visual changes, include screenshots when possible.
