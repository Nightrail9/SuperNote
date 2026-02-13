import type { Response } from 'express';

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const body: ApiErrorBody = {
    code,
    message,
    details,
  };
  res.status(status).json(body);
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
