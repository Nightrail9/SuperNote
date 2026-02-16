# AGENTS.md
Operational guide for coding agents working in this repository.
Scope: entire repo (`D:\ProgramData\VScode\SuperNote`).

## 1) Repository Snapshot
- Monorepo with TypeScript backend, Vue frontend, shared parser package, and one Python helper.
- Backend entry: `apps/server/index.ts` (Express 5, Node ESM).
- Frontend app: `apps/web` (Vue 3, Vite, Pinia, Element Plus, TypeScript).
- Shared parser package: `packages/parser-core` (built by root `tsc`).
- Python helper: `apps/server/scripts/transcribe_faster_whisper.py`.
- Runtime data lives in `data/` (`notes.json`, `drafts.json`, `tasks.json`, `public/`, `temp/`).
- App settings live in `setting/` (`models.json`, `prompts.json`, `integrations.json`, `local-transcriber.json`, `video-understanding.json`).

## 2) Environment and Bootstrap
- Node.js `>=18`, npm `>=9`.
- Python `>=3.10` for local whisper transcription flow.
- FFmpeg from system PATH or `tools/ffmpeg/bin`.

Install dependencies from repo root:
```bash
npm install
npm --prefix apps/web install
```

Optional Python dependency:
```bash
python -m pip install -r requirements.txt
```

Create env file before first run (if missing):
```bash
cp .env.example .env
```

## 3) Build / Dev / Typecheck Commands
### Root scripts (`package.json`)
- `npm run dev`: start backend dev server (`tsx apps/server/index.ts`).
- `npm run dev:server`: same as above.
- `npm run dev:web`: run frontend dev server via `apps/web`.
- `npm run build`: run `tsc` for `packages/parser-core` output (`dist/`).
- `npm run build:web`: frontend build (`vue-tsc -b && vite build`).
- `npm run typecheck`: root TypeScript typecheck (`tsc --noEmit`).
- `npm run docker:config`: validate docker compose config.
- `npm run docker:up`: start docker services.

### Frontend scripts (`apps/web/package.json`)
- `npm --prefix apps/web run dev`: start Vite dev server.
- `npm --prefix apps/web run build`: run `vue-tsc -b` then `vite build`.
- `npm --prefix apps/web run preview`: preview built frontend.

### Local run recipes
- Windows helper: `start.bat`.
- Linux/macOS helper: `./start.sh`.
- Manual split run: backend `npm run dev`, frontend `npm run dev:web`.
- Health check: `http://localhost:3001/health`.

## 4) Lint and Test Reality (Current State)
- No lint script exists in root or `apps/web` scripts.
- No ESLint/Prettier config files are present.
- No official test script exists in root or frontend scripts.
- No Jest/Vitest/Playwright/Pytest config or canonical test directories were found.
- Current quality gates are strict TypeScript checks and build success.

## 5) Single-Test Commands (When Test Tooling Is Added)
Use these conventions when introducing tests so agents can run targeted cases:
- All tests: `npm test`
- Single file: `npm test -- path/to/file.test.ts`
- Single case: `npm test -- path/to/file.test.ts -t "case name"`

Preferred stacks for this repo:
- Frontend/unit: Vitest
  - all: `npm --prefix apps/web run test`
  - single file: `npm --prefix apps/web run test -- src/foo/bar.test.ts`
  - single case: `npm --prefix apps/web run test -- src/foo/bar.test.ts -t "case name"`
- Backend/unit: Vitest or Node test runner (pick one and stay consistent)
  - Vitest: `npm run test -- apps/server/path/to/file.test.ts -t "case name"`
  - Node test runner: `node --test apps/server/path/to/file.test.ts`

If you add testing scripts, update this section with exact verified commands.

## 6) Code Style - Global Rules
- Keep edits minimal and consistent with nearby files.
- Prefer explicit types on API boundaries, persisted data, and public helpers.
- Avoid `any`; if used temporarily, narrow immediately.
- Use guard clauses and early returns for validation and failure paths.
- Keep functions small and focused on one responsibility.
- Do not introduce new formatting systems unless repo owners request it.

## 7) Imports and Modules
- Import order: external packages, internal modules, then type-only imports.
- Use `import type { ... }` for type-only dependencies.
- Backend/parser uses Node ESM; keep explicit `.js` in relative imports.
- Preserve existing alias/relative import patterns in frontend.
- Remove unused imports; frontend TS config enforces unused checks.

## 8) Formatting by Area
### Backend (`apps/server`) and parser (`packages/parser-core`)
- Semicolons are standard; keep them.
- Two-space indentation.
- Single-quoted strings.
- Prefer explicit request/response/config/data interfaces.

### Frontend (`apps/web`)
- Most files use no semicolons; preserve local file style.
- Two-space indentation.
- Single-quoted strings.
- Vue SFCs use `<script setup lang="ts">` and Composition API.
- Keep refs/computeds/API responses typed.

### Python helper
- Four-space indentation and snake_case naming.
- Keep script output machine-readable where expected.

## 9) Naming and File Conventions
- Backend/parser filenames are mostly kebab-case (example `url-helpers.ts`).
- Vue component filenames are PascalCase (example `CreatePage.vue`).
- Frontend composables/utils follow existing camelCase or descriptive lower-case.
- Function names are verb-driven (`load*`, `create*`, `normalize*`, `validate*`).
- Data contract names are explicit (`*Request`, `*Response`, `*Config`, `*Record`).

## 10) Types and Data Contracts
- Keep frontend/backend contracts aligned, especially:
  - `apps/server/services/app-data-store.ts`
  - `apps/web/src/types/domain.ts`
- Preserve literal unions for source types, note formats, and task states.
- Validate untrusted input (env vars, request payloads, URLs) before use.
- Preserve migrations/normalizers for persisted settings and data files.

## 11) Error Handling Conventions
- Backend routes should use `try/catch` and return structured JSON errors.
- Preferred error body: `{ code, message, details? }`.
- Reuse helpers like `sendApiError(...)` and `toErrorMessage(...)` when available.
- Use meaningful HTTP status codes (`400`, `404`, `409`, `500`, etc.).
- Frontend HTTP layer (`apps/web/src/api/http.ts`) normalizes proxy/API/HTML failures.
- UI actions should show human-friendly fallback messages via Element Plus.

## 12) Frontend/UI Patterns
- Reuse shared tokens from `apps/web/src/styles/global.css`.
- Keep responsive behavior aligned with existing breakpoints (commonly `900px`).
- Keep lazy-loaded route components in router definitions.
- Use Element Plus feedback components consistently (`ElMessage`, alerts, tags).

## 13) Secrets, Safety, and Repo Hygiene
- Store secrets only in `.env` (for example `JINA_API_KEY`, `MODEL_API_KEY_<MODEL_ID>`).
- Do not write API keys into `setting/*.json`.
- Avoid destructive git/file operations unless explicitly requested.
- Do not modify unrelated files in scoped tasks.

## 14) Cursor and Copilot Instructions
Checked paths:
- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status: none of these files exist in this repository.
This `AGENTS.md` is the effective agent guidance source.
If these files are added later, re-check and merge their rules into agent behavior.

## 15) Pre-PR Verification Checklist
- `npm run typecheck`
- `npm run build` (parser-core changes)
- `npm run build:web` or `npm --prefix apps/web run build` (frontend changes)
- Manual smoke test for impacted API endpoints and UI flows
- If tests are introduced, run both full suite and single-test commands
