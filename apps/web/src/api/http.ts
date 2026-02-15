import axios from 'axios'

export type ApiError = {
  code: string
  message: string
  details?: Record<string, unknown>
  requestId?: string
}

function resolveApiBaseUrl(): string {
  const raw = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (!raw) {
    return '/api'
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/$/, '')
  }
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  const cleaned = normalized.replace(/\/$/, '')
  return cleaned || '/api'
}

export const http = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 20000,
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const responseData = error?.response?.data
    const htmlLikeResponse =
      typeof responseData === 'string' && /^\s*<!doctype\s+html/i.test(responseData)
    const serverError = (!htmlLikeResponse ? responseData : undefined) as Partial<ApiError> | undefined
    const normalized: ApiError = {
      code: serverError?.code ?? (htmlLikeResponse ? 'INVALID_API_BASE_URL' : 'UNKNOWN_ERROR'),
      message:
        serverError?.message ??
        (htmlLikeResponse
        ? '接口返回了 HTML 页面。这通常意味着后端未启动或反向代理配置错误。\n1. 请确认后端服务正在运行 (默认端口 3001)。\n2. 当前 API 基础路径默认为 "/api"。\n3. 如需指定后端地址，请在 apps/web/.env 中配置 VITE_API_BASE_URL。'
        : error.message ?? '请求失败'),
      details: serverError?.details,
      requestId: serverError?.requestId,
    }
    return Promise.reject(normalized)
  },
)
