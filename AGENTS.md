# AGENTS.md

Guidelines for AI agents working in the SuperNote repository.

## Project Overview

SuperNote is a local-first note generator for Bilibili videos and web pages. It's a TypeScript monorepo with:
- **apps/server**: Express.js API server (Node.js 18+)
- **apps/web**: Vue 3 + TypeScript frontend
- **packages/parser-core**: Core Bilibili video parser library

## Build Commands

```bash
# Root - TypeScript compilation
npm run build              # Compile parser-core to dist/
npm run typecheck          # Type check without emitting
npm run clean              # Remove dist/ directory

# Development server
npm run dev                # Start backend server (tsx apps/server/index.ts)

# Frontend (apps/web/)
cd apps/web
npm run dev                # Start Vite dev server
npm run build              # Build for production (vue-tsc + vite build)
npm run preview            # Preview production build
```

## Testing

Tests use **fast-check** for property-based testing. Run individual test files:

```bash
# Run a single test file
npx tsx apps/server/services/ai-organizer.test.ts
npx tsx apps/server/services/markdown-generator.test.ts
npx tsx apps/server/routes/summarize.test.ts
npx tsx apps/server/services/pipeline-utils.test.ts
npx tsx apps/server/routes/settings-url.test.ts
npx tsx apps/server/services/summary-pipeline.test.ts
npx tsx apps/server/services/keyframe-selector.test.ts
```

Tests output pass/fail with ✓/✗ markers and exit with code 0 on success, 1 on failure.

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022 with NodeNext module resolution
- **Strict mode**: Enabled (strict, noImplicitReturns, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noImplicitOverride)
- **Module**: ES modules (`"type": "module"` in package.json)

### Naming Conventions

- **Interfaces/Types**: PascalCase (e.g., `ServerConfig`, `ParseResult`)
- **Functions**: camelCase (e.g., `loadConfig()`, `extractContent()`)
- **Files**: kebab-case (e.g., `ai-organizer.ts`, `metadata-fetcher.ts`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `DEFAULT_CONFIG`, `QUALITY_PARAMS`)
- **Factory functions**: Prefix with `create` (e.g., `createApp()`, `createBilibiliParser()`)

### Imports and Exports

- Use ES module imports with `.js` extensions for local files (e.g., `import { foo } from './bar.js'`)
- Prefer named exports over default exports
- Group imports: 1) external libraries, 2) internal modules
- Export types explicitly using `export type { ... }`

### Code Organization

- Use JSDoc comments for all public APIs with `@example` blocks
- Include requirement tracing in comments: `// Requirement X.Y: Description`
- Section headers with `// === ... ===` for major code sections
- Keep files under 300 lines when possible

### Error Handling

- Use custom error classes extending Error
- Return typed error objects in results (e.g., `{ success: false, error: { code, message } }`)
- Use `getErrorMessage()` utility for consistent error message extraction
- Always handle promise rejections with try/catch

### Types and Interfaces

- Prefer interfaces over type aliases for object shapes
- Use explicit return types on public functions
- Use `readonly` for immutable properties
- Use `unknown` instead of `any` for uncertain types

### Comments

- Trilingual codebase: English for code, Chinese allowed in comments for domain concepts
- Document "why" not "what"
- Use comment banners for major sections:
  ```typescript
  // ============================================================================
  // Section Name
  // ============================================================================
  ```

### Vue Frontend (apps/web/)

- Composition API with `<script setup lang="ts">`
- Use Element Plus UI components
- Pinia for state management
- Vue Router for routing
- Axios for API calls

### Environment Configuration

- Load environment variables with `import 'dotenv/config'` at entry points
- Use `loadConfig()` pattern for typed config objects
- Optional vars use `|| undefined` to avoid empty strings

## Project Structure

```
/
├── apps/
│   ├── server/          # Express API server
│   │   ├── index.ts     # Entry point
│   │   ├── routes/      # API route handlers
│   │   ├── services/    # Business logic
│   │   ├── middleware/  # Express middleware
│   │   └── utils/       # Utilities
│   └── web/             # Vue 3 frontend
│       ├── src/
│       │   ├── views/   # Page components
│       │   ├── components/  # Reusable components
│       │   ├── stores/  # Pinia stores
│       │   └── api/     # API client
├── packages/
│   └── parser-core/     # Bilibili parser library
│       └── src/
├── storage/             # Runtime data directory
└── tools/               # External tools (FFmpeg)
```

## Dependencies

- **Runtime**: express, dotenv
- **Dev**: typescript, tsx, fast-check, @types/node, @types/express
- **Frontend**: vue, pinia, vue-router, element-plus, axios, vite

Always check existing imports before adding new dependencies.
