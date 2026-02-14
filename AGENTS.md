# AGENTS.md
Operational guidance for coding agents working in this repository.

## Scope and priorities
- Do only what the user requested.
- Keep changes focused, minimal, and reviewable.
- Avoid opportunistic refactors in unrelated modules.
- If touching shared contracts, update both server and web call sites.
- Preserve existing behavior unless a change is explicitly requested.

## Repository map
- `apps/server`: Express + TypeScript API (runtime app code).
- `apps/web`: Vue 3 + Vite + TypeScript frontend.
- `packages/parser-core/src`: shared parser core built by root `tsc`.
- `scripts/test`: wrappers for server test execution.
- `scripts/dev`: local setup/start scripts (`.bat`, `.sh`).
- `infra/docker/docker-compose.yml`: canonical Docker compose file.
- `storage/`: runtime/generated artifacts; avoid incidental edits.

## Environment and toolchain
- Package manager: `npm`.
- Node.js: `>=18` (from `package.json` engines).
- Root TS module mode: `NodeNext` + ESM.
- Server runtime for TS execution: `tsx`.
- Frontend build/typecheck: `vue-tsc` + `vite`.

## Install
Run from repo root:
```bash
npm install
npm --prefix apps/web install
```

## Build, dev, typecheck, lint
Run from repo root unless noted.

Root/server-facing scripts:
```bash
npm run dev
npm run dev:server
npm run dev:web
npm run build
npm run build:web
npm run typecheck
npm run clean
npm run docker:config
npm run docker:up
```

Frontend-only scripts:
```bash
npm --prefix apps/web run dev
npm --prefix apps/web run build
npm --prefix apps/web run preview
```

Notes:
- `npm run dev` delegates to `dev:server`.
- `npm run build` runs root `tsc` for `packages/parser-core/src` only.
- Frontend `build` runs `vue-tsc -b && vite build`.
- No root lint script is configured.
- No frontend lint script is configured.

## Test commands (important)
Server tests are executable `*.test.ts` files run with `tsx`.

Preferred single-test command:
```bash
npm run test:server:file -- apps/server/routes/settings-url.test.ts
```

Direct equivalent:
```bash
npx tsx apps/server/routes/settings-url.test.ts
```

More single-file examples:
```bash
npx tsx apps/server/routes/summarize.test.ts
npx tsx apps/server/services/summary-pipeline.test.ts
npx tsx apps/server/services/ai-organizer.test.ts
```

Run all server tests:
```bash
npm run test:server:all
```

PowerShell alternative:
```powershell
Get-ChildItem apps/server -Recurse -Filter *.test.ts | ForEach-Object { npx tsx $_.FullName }
```

Execution behavior:
- Some tests print custom summaries and may call `process.exit(0|1)`.
- Property-based tests (`fast-check`) can run longer than route/unit tests.
- Recommended loop: run one affected file first, then full suite.

## Coding style and conventions

## Formatting
- Follow existing style in touched files; avoid formatting-only diffs.
- Use 2-space indentation.
- Server/parser-core generally use semicolons.
- Frontend files generally use semicolonless style.
- Keep lines readable; split long expressions intentionally.

## Imports and modules
- Use ESM `import`/`export` syntax.
- Server local TS imports must include `.js` extension.
- Use `import type` for type-only imports.
- Remove unused imports.
- Keep import order stable: external first, internal second.

## TypeScript rules
- Respect strict compiler settings in each package.
- Root/server TS highlights: `strict`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- Frontend TS highlights: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- Prefer explicit domain/request/response types over `any`.
- Narrow `unknown` before property access.

## Naming conventions
- Types/interfaces/classes/Vue component filenames: `PascalCase`.
- Variables/functions/composables: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` when semantically constant.
- Server filenames are commonly `kebab-case`.
- Use descriptive names for refs/computed/watchers and DTOs.

## Error handling conventions
- Treat caught errors as `unknown` and narrow safely.
- Reuse helpers like `sendApiError` and `toErrorMessage` from `apps/server/utils/http-error.ts`.
- Keep API error shape stable: `code`, `message`, optional `details`.
- Use explicit HTTP status codes for validation vs server failures.
- Avoid empty/silent `catch` unless intentional and documented.
- Never leak secrets/tokens/keys in logs or API responses.

## Server-specific guidance (`apps/server`)
- Keep route flow predictable: parse -> validate -> execute -> respond.
- Validate request payloads early and fail fast.
- Preserve endpoint contracts unless a breaking change is requested.
- Reuse existing helpers in `utils/` (validation, retry, path/url, http-error).

## Frontend-specific guidance (`apps/web`)
- Use Vue Composition API with `<script setup lang="ts">`.
- Keep shared domain contracts in `apps/web/src/types/domain.ts`.
- Reuse API normalization patterns in `apps/web/src/api/http.ts`.
- Follow existing Element Plus usage and style token patterns.
- Preserve existing mobile behavior and interaction patterns.

## Cursor/Copilot rule files
Checked locations:
- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status:
- No Cursor rules or Copilot instruction files are present.

If these files are added later:
- Treat them as high-priority instructions.
- Follow the most specific scope first (file/dir-level over repo-level).
- Reconcile conflicts by preferring the stricter actionable rule.

## Agent guardrails
- Do not modify unrelated files.
- Do not commit secrets (`.env`, credentials, API keys, tokens).
- Avoid destructive operations on data or git history.
- Prefer small diffs that are easy to review.
- When commands or workflows change, update this file in the same task.
