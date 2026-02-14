import { Router, Request, Response } from 'express';
import {
  createId,
  getAppData,
  mutateAppData,
  timestamp,
  type NoteRecord,
} from '../services/app-data-store.js';
import { startGenerateTask } from '../services/note-generation.js';
import { normalizeNoteFormats } from '../services/note-options.js';
import { sendApiError, toErrorMessage } from '../utils/http-error.js';
import { parsePositiveInt } from '../utils/validation.js';

export function createNotesRouter(): Router {
  const router = Router();

  router.post('/notes/generate', async (req: Request, res: Response) => {
    try {
      const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : '';
      if (!sourceUrl) {
        sendApiError(res, 400, 'MISSING_SOURCE_URL', 'sourceUrl 不能为空');
        return;
      }

      const promptId = typeof req.body?.promptId === 'string' ? req.body.promptId : undefined;
      const modelId = typeof req.body?.modelId === 'string' ? req.body.modelId : undefined;
      const sourceType = req.body?.sourceType === 'web' ? 'web' : 'bilibili';
      const formats = normalizeNoteFormats(req.body?.formats);

      const task = startGenerateTask({ sourceUrl, promptId, modelId, sourceType, formats });
      res.json({ taskId: task.id });
    } catch (error) {
      sendApiError(res, 500, 'GENERATE_TASK_FAILED', toErrorMessage(error, '创建生成任务失败'));
    }
  });

  router.get('/notes', async (req: Request, res: Response) => {
    try {
      const page = parsePositiveInt(req.query.page, 1);
      const pageSize = parsePositiveInt(req.query.pageSize, 10);
      const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim().toLowerCase() : '';

      const notes = getAppData().notes;
      const filtered = keyword
        ? notes.filter((item) =>
            [item.title, item.contentMd, item.sourceUrl].some((field) => field.toLowerCase().includes(keyword))
          )
        : notes;

      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      res.json({ items, total: filtered.length });
    } catch (error) {
      sendApiError(res, 500, 'LIST_NOTES_FAILED', toErrorMessage(error, '查询笔记失败'));
    }
  });

  router.post('/notes', async (req: Request, res: Response) => {
    try {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const sourceUrl = typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl.trim() : '';
      const contentMd = typeof req.body?.contentMd === 'string' ? req.body.contentMd : '';
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((item: unknown) => typeof item === 'string') : undefined;

      if (!title || !sourceUrl || !contentMd.trim()) {
        sendApiError(res, 400, 'INVALID_NOTE_PAYLOAD', 'title、sourceUrl、contentMd 为必填');
        return;
      }

      const now = timestamp();
      const note: NoteRecord = {
        id: createId('note'),
        title,
        sourceUrl,
        contentMd,
        tags,
        createdAt: now,
        updatedAt: now,
      };

      mutateAppData((data) => {
        data.notes.unshift(note);
      });

      res.status(201).json({ noteId: note.id, updatedAt: note.updatedAt });
    } catch (error) {
      sendApiError(res, 500, 'CREATE_NOTE_FAILED', toErrorMessage(error, '创建笔记失败'));
    }
  });

  router.get('/notes/:id', async (req: Request, res: Response) => {
    try {
      const note = getAppData().notes.find((item) => item.id === req.params.id);
      if (!note) {
        sendApiError(res, 404, 'NOTE_NOT_FOUND', '笔记不存在');
        return;
      }
      res.json(note);
    } catch (error) {
      sendApiError(res, 500, 'GET_NOTE_FAILED', toErrorMessage(error, '获取笔记失败'));
    }
  });

  router.put('/notes/:id', async (req: Request, res: Response) => {
    try {
      const contentMd = typeof req.body?.contentMd === 'string' ? req.body.contentMd : '';
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((item: unknown) => typeof item === 'string') : undefined;

      if (!contentMd.trim()) {
        sendApiError(res, 400, 'INVALID_NOTE_PAYLOAD', 'contentMd 不能为空');
        return;
      }

      let found = false;
      let updatedAt = '';
      mutateAppData((data) => {
        const note = data.notes.find((item) => item.id === req.params.id);
        if (!note) {
          return;
        }
        found = true;
        note.contentMd = contentMd;
        if (title !== undefined) {
          note.title = title || note.title;
        }
        if (tags !== undefined) {
          note.tags = tags;
        }
        note.updatedAt = timestamp();
        updatedAt = note.updatedAt;
      });

      if (!found) {
        sendApiError(res, 404, 'NOTE_NOT_FOUND', '笔记不存在');
        return;
      }

      res.json({ updatedAt });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_NOTE_FAILED', toErrorMessage(error, '更新笔记失败'));
    }
  });

  router.delete('/notes/:id', async (req: Request, res: Response) => {
    try {
      let found = false;
      mutateAppData((data) => {
        const before = data.notes.length;
        data.notes = data.notes.filter((item) => item.id !== req.params.id);
        found = data.notes.length !== before;
      });

      if (!found) {
        sendApiError(res, 404, 'NOTE_NOT_FOUND', '笔记不存在');
        return;
      }

      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'DELETE_NOTE_FAILED', toErrorMessage(error, '删除笔记失败'));
    }
  });

  return router;
}
