/**
 * Web Server Entry Point
 *
 * Simplified Express.js API server for bilibili-video-parser.
 * Provides:
 * - POST /api/parse — Independent video link parsing
 * - POST /api/summarize — Unified summary pipeline
 * - GET /health — Health check
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

// Load environment variables from .env file
import 'dotenv/config';

import * as fs from 'fs';
import express, { Express, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { createCorsMiddleware } from './middleware/cors.js';
import { loadConfig } from './config.js';
import type { ServerConfig } from './config.js';
import { createParseRouter } from './routes/parse.js';
import { createSummarizeRouter } from './routes/summarize.js';
import { createNotesRouter } from './routes/notes.js';
import { createDraftsRouter } from './routes/drafts.js';
import { createTasksRouter } from './routes/tasks.js';
import { createSettingsRouter } from './routes/settings.js';

/**
 * Create and configure the Express application
 */
function createApp(config?: ServerConfig): Express {
  const app = express();
  const serverConfig = config || loadConfig();

  // Parse JSON request bodies
  app.use(express.json({ limit: '10mb' }));

  // CORS middleware
  // Requirement 5.6: Preserve CORS middleware for cross-origin requests
  app.use(createCorsMiddleware({
    origin: serverConfig.corsOrigin,
  }));

  // Health check endpoint
  // Requirement 5.5: Preserve /health endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Parse routes
  // Requirement 5.4: Preserve /api/parse endpoint for independent video link parsing
  app.use('/api', createParseRouter());

  // Summarize routes
  // Requirement 1.1: Unified /api/summarize endpoint
  app.use('/api', createSummarizeRouter());

  // Note generation, notes, drafts, tasks, and settings routes
  app.use('/api', createNotesRouter());
  app.use('/api', createDraftsRouter());
  app.use('/api', createTasksRouter());
  app.use('/api', createSettingsRouter());

  // Serve generated screenshots and static artifacts under /static
  const storagePublicDir = path.resolve(process.cwd(), 'storage', 'public');
  app.use('/static', express.static(storagePublicDir));

  // Serve frontend build when apps/web/dist exists
  const frontendDistDir = path.resolve(process.cwd(), 'apps', 'web', 'dist');
  const frontendIndexHtml = path.join(frontendDistDir, 'index.html');
  if (fs.existsSync(frontendIndexHtml)) {
    app.use(express.static(frontendDistDir));
    app.use((req: Request, res: Response, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      if (req.path.startsWith('/api') || req.path === '/health') {
        next();
        return;
      }
      res.sendFile(frontendIndexHtml, (error) => {
        if (error) {
          next(error);
        }
      });
    });
  }

  return app;
}

/**
 * Start the server
 */
function startServer(): void {
  const config = loadConfig();
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    console.log(`API endpoint: http://localhost:${config.port}/api/parse`);
    console.log(`Summarize endpoint: http://localhost:${config.port}/api/summarize`);
  });
}

// Export for testing
export { createApp, loadConfig, ServerConfig };

// Start server if this is the main module
const isMainModule =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer();
}
