# AGENTS.md

Guidance for coding agents working in this repository.
This file is intentionally practical: run commands exactly, follow existing patterns, and avoid broad refactors.

## 1) Project Snapshot

- Monorepo-like layout with a TypeScript backend, a Vue 3 frontend, and a parser core package.
- Runtime stack: Node.js 18+, npm 9+, Python 3.10+ (for transcription tooling), optional FFmpeg.
- Backend entry: `apps/server/index.ts`.
- Frontend entry: `apps/web/src/main.ts`.
- Parser core source compiled to `dist/`: `packages/parser-core/src`.

## 2) Directory Map

- `apps/server/`: Express API server and business logic.
- `apps/web/`: Vue 3 + Vite + TypeScript frontend.
- `packages/parser-core/`: parser library source (NodeNext/ESM style imports).
- `dist/`: compiled parser-core output.
- `setting/`: app configuration JSON files.
- `data/`: runtime-generated persistent data.
- `scripts/dev/`: startup/setup scripts for Windows and Unix.

## 3) Install and Environment

- Install root dependencies: `npm install`
- Install frontend dependencies: `npm --prefix apps/web install`
- Python dependency for local transcription: `pip install -r requirements.txt`
- Initialize env file (if missing): copy `.env.example` to `.env`

Notes:
- Keep secrets in `.env` only; do not place API keys into tracked JSON files.
- FFmpeg can come from system PATH or `tools/ffmpeg/bin`.

## 4) Build / Typecheck / Lint / Test Commands

### Root (backend + parser-core context)

- Dev server (backend): `npm run dev`
- Build TypeScript output: `npm run build`
- Typecheck only: `npm run typecheck`
- Clean build output: `npm run clean`

### Frontend (`apps/web`)

- Dev server: `npm run dev:web` (from root) or `npm --prefix apps/web run dev`
- Production build: `npm run build:web` (from root) or `npm --prefix apps/web run build`
- Preview build: `npm --prefix apps/web run preview`

### Docker

- Validate compose config: `npm run docker:config`
- Start compose stack: `npm run docker:up`

### Lint status

- No dedicated ESLint/Prettier script is configured in `package.json` files.
- Treat `npm run typecheck` and `npm --prefix apps/web run build` as the minimum quality gates.

### Test status (important)

- There is currently no test runner script configured at root or in `apps/web`.
- There are no committed `*.test.*`/`*.spec.*` files in this repository snapshot.

### Running a single test (when tests are added)

- If Node test runner is adopted for TS files, preferred pattern:
  - `node --import tsx --test path/to/file.test.ts`
- If frontend adopts Vitest, preferred pattern:
  - `npm --prefix apps/web run test -- src/path/to/file.test.ts`
- If a new test script is introduced, update this AGENTS.md immediately.

## 5) Fast Start Commands

- Windows all-in-one startup: `start.bat`
- Unix all-in-one startup: `./start.sh`
- Windows setup helper: `scripts/dev/setup.bat`

## 6) Code Style Rules (Observed + Required)

### 6.1 Imports

- Use ESM imports everywhere.
- Keep external imports first, then a blank line, then internal relative imports.
- Prefer `import type` for type-only imports.
- In NodeNext backend/parser-core files, keep local import specifiers with `.js` suffix (e.g. `./config.js`).
- In frontend Vite/Vue files, follow existing extensionless TS imports.

### 6.2 Formatting

- Use single quotes for strings unless template literals are needed.
- Keep trailing commas in multiline literals/params where already used.
- Do not mass-reformat unrelated files.
- Respect local file punctuation style:
  - `apps/server` and `packages/parser-core` commonly use semicolons.
  - `apps/web` commonly omits semicolons.
- Preserve existing line ending and spacing style per file.

### 6.3 Types and Type Safety

- Keep `strict` TypeScript compatibility (repo has strict compiler settings).
- Avoid `any`; use `unknown` then narrow.
- Define explicit payload/result types at API boundaries.
- Prefer narrow unions and literal types for finite states (status/stage/provider/etc.).
- Keep null/undefined handling explicit and defensive.
- For reusable structures, add or extend named exported types.

### 6.4 Naming Conventions

- `PascalCase`: components, classes, and exported type aliases/interfaces.
- `camelCase`: functions, variables, parameters, local helpers.
- `UPPER_SNAKE_CASE`: true constants (config defaults, fixed patterns).
- Vue composables should use `useXxx` naming.
- File naming follows existing conventions:
  - Vue components and pages often `PascalCase.vue`.
  - Utility/service modules often kebab-case (`http-error.ts`, `app-data-store.ts`).

### 6.5 Error Handling

- Backend routes should wrap handlers in `try/catch` and return structured API errors.
- Use shared helpers (`sendApiError`, `toErrorMessage`) instead of ad-hoc error responses.
- Prefer early returns for validation failures (400/404/etc.).
- Frontend HTTP errors should be normalized through `apps/web/src/api/http.ts` interceptor shape.
- Parser pipeline should return explicit failure objects with stage/code/message fields.

### 6.6 Async and Side Effects

- Use `async/await` over raw promise chains for readability.
- Avoid fire-and-forget unless explicitly intended (`void` usage should be deliberate).
- Keep disk/network side effects inside service/utility layers, not scattered in route logic.

### 6.7 Vue-Specific Patterns

- Prefer `<script setup lang="ts">` for Vue SFCs.
- Keep page-level state near the page; extract reusable logic to composables/util modules.
- Keep API access in `apps/web/src/api/*` modules rather than inside templates.
- Use typed refs/computed where the inferred type is ambiguous.

## 7) Config and Data Safety

- Do not commit secrets from `.env`.
- Treat `setting/*.json` as user/runtime configuration; preserve backward compatibility.
- Treat `data/*.json` as persisted runtime data; avoid breaking schema changes without migration code.
- When changing storage shape, update read/migrate/write paths together.

## 8) Cursor / Copilot Rule Files

Checked locations requested by user:

- `.cursor/rules/`: not present.
- `.cursorrules`: not present.
- `.github/copilot-instructions.md`: not present.

If any of these files are added later, their instructions become mandatory and should be merged into this document.

## 9) Agent Execution Checklist

- Before coding: locate target module and mirror nearby style.
- During coding: keep changes minimal and scoped to the request.
- After coding: run the most relevant verification commands.
- Minimum verification for most TS changes:
  - `npm run typecheck`
  - `npm --prefix apps/web run build` (if frontend touched)
- Do not edit generated `dist/*` unless the task explicitly requires build artifacts.

## 10) When Unsure

- Prefer consistency with adjacent code over personal/global style preferences.
- Prefer explicitness over cleverness.
- Prefer small, reviewable diffs over broad rewrites.
