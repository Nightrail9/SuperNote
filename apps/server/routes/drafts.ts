import { Router, Request, Response } from 'express';
import {
  createId,
  getAppData,
  mutateAppData,
  timestamp,
  type DraftRecord,
  type NoteRecord,
} from '../services/app-data-store.js';
import { sendApiError, toErrorMessage } from '../utils/http-error.js';

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function createDraftsRouter(): Router {
  const router = Router();

  router.get('/drafts', async (req: Request, res: Response) => {
    try {
      const page = parsePositiveInt(req.query.page, 1);
      const pageSize = parsePositiveInt(req.query.pageSize, 10);
      const drafts = getAppData().drafts;
      const start = (page - 1) * pageSize;
      const items = drafts.slice(start, start + pageSize);
      res.json({ items, total: drafts.length });
    } catch (error) {
      sendApiError(res, 500, 'LIST_DRAFTS_FAILED', toErrorMessage(error, '查询草稿失败'));
    }
  });

  router.post('/drafts', async (req: Request, res: Response) => {
    try {
      const contentMd = typeof req.body?.contentMd === 'string' ? req.body.contentMd : '';
      if (!contentMd.trim()) {
        sendApiError(res, 400, 'INVALID_DRAFT_PAYLOAD', 'contentMd 不能为空');
        return;
      }

      const now = timestamp();
      const draft: DraftRecord = {
        id: createId('draft'),
        sourceUrl: typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : undefined,
        title: typeof req.body?.title === 'string' ? req.body.title.trim() : undefined,
        contentMd,
        lastAutoSavedAt: now,
        updatedAt: now,
      };

      mutateAppData((data) => {
        data.drafts.unshift(draft);
      });

      res.status(201).json({ draftId: draft.id, updatedAt: draft.updatedAt });
    } catch (error) {
      sendApiError(res, 500, 'CREATE_DRAFT_FAILED', toErrorMessage(error, '创建草稿失败'));
    }
  });

  router.get('/drafts/:id', async (req: Request, res: Response) => {
    try {
      const draft = getAppData().drafts.find((item) => item.id === req.params.id);
      if (!draft) {
        sendApiError(res, 404, 'DRAFT_NOT_FOUND', '草稿不存在');
        return;
      }
      res.json(draft);
    } catch (error) {
      sendApiError(res, 500, 'GET_DRAFT_FAILED', toErrorMessage(error, '获取草稿失败'));
    }
  });

  router.put('/drafts/:id', async (req: Request, res: Response) => {
    try {
      const contentMd = typeof req.body?.contentMd === 'string' ? req.body.contentMd : '';
      if (!contentMd.trim()) {
        sendApiError(res, 400, 'INVALID_DRAFT_PAYLOAD', 'contentMd 不能为空');
        return;
      }

      let found = false;
      let updatedAt = '';
      mutateAppData((data) => {
        const draft = data.drafts.find((item) => item.id === req.params.id);
        if (!draft) {
          return;
        }
        found = true;
        draft.contentMd = contentMd;
        if (typeof req.body?.title === 'string') {
          draft.title = req.body.title.trim();
        }
        draft.updatedAt = timestamp();
        draft.lastAutoSavedAt = draft.updatedAt;
        updatedAt = draft.updatedAt;
      });

      if (!found) {
        sendApiError(res, 404, 'DRAFT_NOT_FOUND', '草稿不存在');
        return;
      }

      res.json({ updatedAt });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_DRAFT_FAILED', toErrorMessage(error, '更新草稿失败'));
    }
  });

  router.delete('/drafts/:id', async (req: Request, res: Response) => {
    try {
      let found = false;
      mutateAppData((data) => {
        const before = data.drafts.length;
        data.drafts = data.drafts.filter((item) => item.id !== req.params.id);
        found = data.drafts.length !== before;
      });

      if (!found) {
        sendApiError(res, 404, 'DRAFT_NOT_FOUND', '草稿不存在');
        return;
      }

      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'DELETE_DRAFT_FAILED', toErrorMessage(error, '删除草稿失败'));
    }
  });

  router.post('/drafts/:id/publish', async (req: Request, res: Response) => {
    try {
      let noteId = '';
      let found = false;

      mutateAppData((data) => {
        const draftIndex = data.drafts.findIndex((item) => item.id === req.params.id);
        if (draftIndex < 0) {
          return;
        }

        const draft = data.drafts[draftIndex];
        if (!draft) {
          return;
        }
        const now = timestamp();
        const note: NoteRecord = {
          id: createId('note'),
          title: typeof req.body?.title === 'string' && req.body.title.trim()
            ? req.body.title.trim()
            : draft.title?.trim() || `未命名笔记-${now.slice(0, 10)}`,
          sourceUrl: draft.sourceUrl?.trim() || 'https://www.bilibili.com',
          contentMd: draft.contentMd,
          tags: Array.isArray(req.body?.tags) ? req.body.tags.filter((item: unknown) => typeof item === 'string') : undefined,
          createdAt: now,
          updatedAt: now,
        };

        data.notes.unshift(note);
        data.drafts.splice(draftIndex, 1);
        noteId = note.id;
        found = true;
      });

      if (!found) {
        sendApiError(res, 404, 'DRAFT_NOT_FOUND', '草稿不存在');
        return;
      }

      res.json({ noteId });
    } catch (error) {
      sendApiError(res, 500, 'PUBLISH_DRAFT_FAILED', toErrorMessage(error, '草稿发布失败'));
    }
  });

  return router;
}
