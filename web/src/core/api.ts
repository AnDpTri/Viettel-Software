/* eslint-disable @typescript-eslint/no-explicit-any -- phần `data` của phản hồi API giữ nguyên dạng JSON. */
import { $ } from './dom';
import { state } from './state';

export type ApiOptions = RequestInit & { skipRefresh?: boolean };

/** Lỗi API kèm mã lỗi và chi tiết từ phong bì `error` của backend. */
export class ApiError extends Error {
  code?: string;
  details?: any;
}

/** Thông điệp dễ hiểu nhất: lỗi của trường đầu tiên, rồi lỗi chung của form, rồi thông điệp của mã lỗi. */
export function apiErrorMessage(body: any) {
  const details = body.error?.details;
  const fieldError = Object.values(details?.fieldErrors || {})
    .flat()
    .find(Boolean);
  const formError = (details?.formErrors || []).find(Boolean);
  return (fieldError as string) || formError || body.error?.message || 'Không thể kết nối hệ thống.';
}

let refreshRequest: Promise<void> | null = null;

/** Xoay vòng refresh token; nhiều request cùng hết hạn chỉ gọi làm mới một lần. */
export async function refreshSession() {
  if (!refreshRequest)
    refreshRequest = (async () => {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.refreshToken ? { refreshToken: state.refreshToken } : {})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(body));
      state.token = body.data.accessToken;
      state.refreshToken = body.data.refreshToken;
    })().finally(() => {
      refreshRequest = null;
    });
  return refreshRequest;
}

export function returnToLogin() {
  state.token = '';
  state.refreshToken = '';
  state.user = null;
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

/** Gọi `/api/v1{path}` với access token; gặp 401 thì làm mới phiên một lần rồi thử lại. Trả về phần `data`. */
export async function api(path: string, options: ApiOptions = {}): Promise<any> {
  const { skipRefresh = false, ...fetchOptions } = options;
  const requestToken = state.token;
  const response = await fetch(`/api/v1${path}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
      ...((fetchOptions.headers as Record<string, string>) || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !skipRefresh && path !== '/auth/refresh' && path !== '/auth/session') {
    try {
      if (state.token === requestToken) await refreshSession();
      return api(path, { ...fetchOptions, skipRefresh: true });
    } catch {
      returnToLogin();
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
  }
  if (!response.ok) {
    const error = new ApiError(apiErrorMessage(body));
    error.code = body.error?.code;
    error.details = body.error?.details;
    throw error;
  }
  return body.data;
}

/** Tải tệp từ API có xác thực (CSV, hóa đơn…). */
export function authorizedFetch(url: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
}
