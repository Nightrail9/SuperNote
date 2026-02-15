/**
 * Error Messages Mapping for Backend
 *
 * This module defines standardized error codes and messages for the backend.
 * It ensures consistency with the frontend error-messages.js module.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

/**
 * Error message interface
 */
export interface ErrorMessage {
  /** User-friendly error description */
  message: string;
  /** Actionable suggestion (optional) */
  suggestion?: string;
}

/**
 * Error messages mapping table
 *
 * Each error code maps to a user-friendly message and optional suggestion.
 * These codes are used by both frontend and backend for consistent error handling.
 */
export const ERROR_MESSAGES: Record<string, ErrorMessage> = {
  // ========== Validation Errors ==========
  'MISSING_FIELD': {
    message: '缺少必需字段',
    suggestion: '请确保填写所有必需的配置项'
  },

  'INVALID_URL': {
    message: 'API URL格式不正确',
    suggestion: '请输入有效的HTTPS地址，例如：https://api.example.com/v1/organize'
  },

  'INVALID_MARKDOWN': {
    message: 'Markdown内容无效',
    suggestion: '请确保已成功生成Markdown文档后再尝试整理笔记'
  },

  'INVALID_REQUEST': {
    message: '请求参数无效',
    suggestion: '请检查请求参数是否正确'
  },

  // ========== API Call Errors ==========
  'INVALID_API_KEY': {
    message: 'API密钥无效',
    suggestion: '请在设置中检查并更新您的API密钥'
  },

  'RATE_LIMIT_EXCEEDED': {
    message: 'API调用频率超限',
    suggestion: '请稍后重试，或联系API提供商升级配额'
  },

  'API_SERVER_ERROR': {
    message: 'AI服务暂时不可用',
    suggestion: '请稍后重试，如果问题持续存在，请联系API提供商'
  },

  'CONNECTION_TIMEOUT': {
    message: '连接超时',
    suggestion: '请检查网络连接或API地址是否正确'
  },

  'CONNECTION_ERROR': {
    message: '连接失败',
    suggestion: '无法连接到AI API，请检查API地址和网络连接'
  },

  'API_ERROR': {
    message: 'API调用失败',
    suggestion: '请检查API配置或稍后重试'
  },

  // ========== Server Errors ==========
  'INTERNAL_ERROR': {
    message: '服务器内部错误',
    suggestion: '请稍后重试，如果问题持续存在，请联系管理员'
  },

  // ========== Network Errors ==========
  'NETWORK_ERROR': {
    message: '网络连接失败',
    suggestion: '请检查您的网络连接是否正常'
  },

  'REQUEST_TIMEOUT': {
    message: '请求超时',
    suggestion: '请检查网络连接或稍后重试'
  },

  // ========== Configuration Errors ==========
  'CONFIG_NOT_FOUND': {
    message: '未找到配置',
    suggestion: '请先在设置中配置AI API参数'
  },

  'CONFIG_INVALID': {
    message: '配置无效',
    suggestion: '请检查配置参数是否正确填写'
  },

  'NO_CONFIG': {
    message: '请先配置AI API设置',
    suggestion: '点击右上角的"设置"按钮进行配置'
  },

  'INVALID_CONFIG': {
    message: '配置信息不完整或无效',
    suggestion: '请检查AI API URL、API Key和提示词是否正确配置'
  },

  'NO_MARKDOWN': {
    message: '没有可整理的Markdown内容',
    suggestion: '请先转换视频生成Markdown文档'
  },

  'STORAGE_ERROR': {
    message: '存储操作失败',
    suggestion: '请检查浏览器设置或稍后重试'
  },

  // ========== Generic Errors ==========
  'UNKNOWN_ERROR': {
    message: '发生未知错误',
    suggestion: '请稍后重试，如果问题持续存在，请联系技术支持'
  }
};

/**
 * Get error message by error code
 *
 * @param errorCode - Error code
 * @returns Error message object with message and optional suggestion
 */
export function getErrorMessage(errorCode: string): ErrorMessage {
  const error = ERROR_MESSAGES[errorCode];

  if (!error) {
    return ERROR_MESSAGES['UNKNOWN_ERROR'];
  }

  return error;
}

/**
 * Format error message as a user-friendly string
 *
 * @param errorCode - Error code
 * @param includeSuggestion - Whether to include suggestion (default: true)
 * @returns Formatted error message string
 */
export function formatErrorMessage(errorCode: string, includeSuggestion: boolean = true): string {
  const error = getErrorMessage(errorCode);

  if (includeSuggestion && error.suggestion) {
    return `${error.message}。${error.suggestion}`;
  }

  return error.message;
}

/**
 * Check if error code exists
 *
 * @param errorCode - Error code to check
 * @returns True if error code exists
 */
export function hasErrorCode(errorCode: string): boolean {
  return errorCode in ERROR_MESSAGES;
}

/**
 * Get all error codes
 *
 * @returns Array of all error codes
 */
export function getAllErrorCodes(): string[] {
  return Object.keys(ERROR_MESSAGES);
}
