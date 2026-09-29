/** Gọi REST API `/api/v1`: gắn access token, gặp 401 thì làm mới phiên một lần rồi thử lại; hết phiên thì báo cho lớp
 * giao diện để quay về màn đăng nhập. */

export interface Session {
  token: string;
  refreshToken: string;
}

/** Token của phiên hiện tại. Kiểm thử giao diện gán `token` hết hạn qua `window.state` để kiểm tra tự làm mới phiên. */
export const session: Session = { token: '', refreshToken: '' };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/** Thông điệp dễ hiểu nhất: lỗi của trường đầu tiên, rồi lỗi chung của form, rồi thông điệp của mã lỗi. */
export function apiErrorMessage(body: ErrorBody) {
  const details = body.error?.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
  const fieldError = Object.values(details?.fieldErrors ?? {})
    .flat()
    .find(Boolean);
  const formError = (details?.formErrors ?? []).find(Boolean);
  return fieldError || formError || body.error?.message || 'Không thể kết nối hệ thống.';
}

let sessionExpiredHandler: () => void = () => undefined;

/** Lớp giao diện đăng ký cách xử lý khi không làm mới được phiên (quay về màn đăng nhập). */
export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
}

let refreshing: Promise<void> | null = null;

/** Xoay vòng refresh token; nhiều request cùng hết hạn chỉ gọi làm mới một lần. */
function refreshSession() {
  refreshing ??= (async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session.refreshToken ? { refreshToken: session.refreshToken } : {})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(apiErrorMessage(body));
    session.token = body.data.accessToken;
    session.refreshToken = body.data.refreshToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export type ApiOptions = { method?: string; body?: unknown; skipRefresh?: boolean };

const NO_REFRESH_PATHS = new Set(['/auth/refresh', '/auth/session']);

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, skipRefresh = false } = options;
  const requestToken = session.token;
  const response = await fetch(`/api/v1${path}`, {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && !skipRefresh && !NO_REFRESH_PATHS.has(path)) {
    try {
      if (session.token === requestToken) await refreshSession();
    } catch {
      sessionExpiredHandler();
      throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'SESSION_EXPIRED');
    }
    return api<T>(path, { ...options, skipRefresh: true });
  }
  if (!response.ok) throw new ApiError(apiErrorMessage(payload), payload.error?.code, payload.error?.details);
  return payload.data as T;
}

/** Tải tệp hoặc gửi form multipart tới API có xác thực. */
export async function authorizedFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${session.token}` }
  });
}

/** Gửi form multipart (tệp đính kèm), trả phần `data` hoặc ném lỗi có thông điệp của API. */
export async function upload<T = unknown>(url: string, form: FormData): Promise<T> {
  const response = await authorizedFetch(url, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(apiErrorMessage(payload), payload.error?.code);
  return payload.data as T;
}

/** Tải một tệp từ API về máy. Tên tệp lấy từ header Content-Disposition nếu có. */
export async function downloadFile(url: string, fallbackName: string) {
  const response = await authorizedFetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(apiErrorMessage(body) || 'Không thể tải tệp.');
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  saveBlob(await response.blob(), name);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
