# Bilibili Notes Frontend (Vue 3)

Vue 3 + TypeScript frontend for the Bilibili Video Parser backend.

## Features

- Start note generation tasks from Bilibili or web URLs
- Track task progress and inspect generation results
- Save, edit, and publish drafts
- Manage notes and prompt/model settings
- Configure integrations (Jina Reader)

## Requirements

- Node.js >= 18
- npm >= 9
- Running backend API from the project root (`apps/server`)

## Development

Install dependencies:

```bash
npm install
```

Start dev server:

```bash
npm run dev
```

By default, Vite runs on port `3000` and proxies `/api` requests to the backend.

## Build

```bash
npm run build
```

Preview built files:

```bash
npm run preview
```

## API Base URL

You can override the default API base path with:

```bash
VITE_API_BASE_URL=https://your-api-domain/api
```

If not set, the frontend uses `/api`.

## Related Docs

- Root project guide: `README.md`
- Chinese guide: `README_CH.md`
