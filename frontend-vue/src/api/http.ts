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
  return normalized.replace(/\/$/, '')
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
        (htmlLikeResponse ? '接口返回了 HTML 页面，请检查 VITE_API_BASE_URL 或后端 /api 路由配置' : error.message ?? '请求失败'),
      details: serverError?.details,
      requestId: serverError?.requestId,
    }
    return Promise.reject(normalized)
  },
)
