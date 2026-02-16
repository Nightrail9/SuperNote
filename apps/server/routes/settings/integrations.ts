import { Router } from 'express';

import { maskSecret, type IntegrationConfigRecord } from '../../services/app-data-store.js';
import { normalizeJinaReaderEndpoint, readWebPageWithJina } from '../../services/jina-reader-client.js';
import { getIntegrations, saveIntegrations, setJinaApiKey } from '../../services/settings-store/index.js';
import { normalizeIntegrationsPayload } from '../../services/settings-store/shared.js';
import { sendApiError, toErrorMessage } from '../../utils/http-error.js';
import type { Request, Response } from 'express';

function getMaskedIntegrations(): IntegrationConfigRecord & {
  jinaReader: IntegrationConfigRecord['jinaReader'] & { apiKeyMasked?: string };
} {
  const integrations = getIntegrations();
  const timeoutSec = Number.isFinite(integrations.jinaReader.timeoutSec)
    ? Math.max(3, Math.min(180, Math.floor(integrations.jinaReader.timeoutSec ?? 30)))
    : 30;
  return {
    jinaReader: {
      ...integrations.jinaReader,
      apiKey: undefined,
      timeoutSec,
      apiKeyMasked: maskSecret(integrations.jinaReader.apiKey),
    },
  };
}

export function createSettingsIntegrationsRouter(): Router {
  const router = Router();

  router.get('/integrations', async (_req: Request, res: Response) => {
    try {
      res.json(getMaskedIntegrations());
    } catch (error) {
      sendApiError(res, 500, 'GET_INTEGRATIONS_FAILED', toErrorMessage(error, '获取集成配置失败'));
    }
  });

  router.put('/integrations', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<IntegrationConfigRecord>;
      const prev = getIntegrations();
      const jinaReader: Partial<IntegrationConfigRecord['jinaReader']> =
        (incoming?.jinaReader ?? {}) as Partial<IntegrationConfigRecord['jinaReader']>;

      const timeoutCandidate =
        typeof jinaReader.timeoutSec === 'number'
          ? jinaReader.timeoutSec
          : Number.isFinite(Number(jinaReader.timeoutSec))
            ? Number(jinaReader.timeoutSec)
            : prev.jinaReader.timeoutSec;
      const nextTimeoutSec = Number.isFinite(timeoutCandidate)
        ? Math.max(3, Math.min(180, Math.floor(Number(timeoutCandidate))))
        : 30;

      const next = normalizeIntegrationsPayload({
        jinaReader: {
          endpoint: typeof jinaReader.endpoint === 'string' ? jinaReader.endpoint : prev.jinaReader.endpoint,
          timeoutSec: nextTimeoutSec,
          noCache: typeof jinaReader.noCache === 'boolean' ? jinaReader.noCache : Boolean(prev.jinaReader.noCache),
        },
      });

      if (Object.prototype.hasOwnProperty.call(jinaReader, 'apiKey')) {
        if (typeof jinaReader.apiKey !== 'string') {
          sendApiError(res, 400, 'INVALID_JINA_API_KEY', 'Jina API Key 格式不正确');
          return;
        }
        const trimmed = jinaReader.apiKey.trim();
        setJinaApiKey(trimmed || undefined);
      }

      saveIntegrations(next);
      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_INTEGRATIONS_FAILED', toErrorMessage(error, '保存集成配置失败'));
    }
  });

  router.post('/integrations/jina-reader/test', async (req: Request, res: Response) => {
    try {
      const incoming = req.body?.jinaReader as Partial<IntegrationConfigRecord['jinaReader']> | undefined;
      const current = getIntegrations();
      const endpoint = normalizeJinaReaderEndpoint(
        typeof incoming?.endpoint === 'string' ? incoming.endpoint : current.jinaReader.endpoint,
      );
      const apiKey =
        typeof incoming?.apiKey === 'string' && incoming.apiKey.trim()
          ? incoming.apiKey.trim()
          : current.jinaReader.apiKey;
      const timeoutSec = Number.isFinite(Number(incoming?.timeoutSec))
        ? Math.max(3, Math.min(180, Math.floor(Number(incoming?.timeoutSec))))
        : 15;
      const noCache = typeof incoming?.noCache === 'boolean' ? incoming.noCache : false;

      const testUrl = 'https://example.com';
      const result = await readWebPageWithJina(testUrl, {
        endpoint,
        apiKey,
        timeoutSec,
        noCache,
      });

      if (!result.content.trim()) {
        res.json({ ok: false, message: 'Jina Reader 连通成功，但未获取到可用内容' });
        return;
      }

      res.json({ ok: true, message: 'Jina Reader 连接成功' });
    } catch (error) {
      res.json({ ok: false, message: toErrorMessage(error, 'Jina Reader 测试失败') });
    }
  });

  return router;
}
