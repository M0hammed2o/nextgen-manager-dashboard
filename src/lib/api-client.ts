export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.nextgenintelligence.co.za';

/**
 * Thrown by ApiClient.request() on a non-2xx response. Preserves the
 * backend's error `code` (e.g. "PASSWORD_CHANGE_REQUIRED") so callers can
 * branch on it instead of matching on message text.
 */
export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  private setTokens(access: string, refresh: string) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }

  clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
  }

  private async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      // Backend /v1/auth/refresh returns flat TokenPair: { access_token, refresh_token, ... }
      this.setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    if (res.status === 401 && token) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.getAccessToken()}`;
        res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
      } else {
        this.clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Backend returns { error: { code, message, details } } — parse nested format
      const msg = body?.error?.message || body?.detail || body?.message || `Request failed (${res.status})`;
      console.error(`API ${res.status}:`, body?.error || body);
      throw new ApiError(msg, res.status, body?.error?.code);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * POST multipart/form-data to our own API (spreadsheet imports).
   *
   * Deliberately does NOT go through request(): that always sets
   * Content-Type: application/json, and a multipart body must be left alone
   * so the browser can add its own boundary. Setting it by hand produces a
   * request the server cannot parse.
   */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const send = async () => {
      const token = this.getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: form });
    };

    let res = await send();
    if (res.status === 401 && (await this.refreshAccessToken())) {
      res = await send();
    }

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* a non-JSON error body is handled below */
    }

    if (!res.ok) {
      const payload = (data ?? {}) as {
        message?: string;
        error?: { message?: string; details?: unknown };
        detail?: string;
      };
      const message =
        payload.error?.message ??
        payload.message ??
        payload.detail ??
        `Upload failed (${res.status})`;
      const error = new ApiError(message, res.status);
      // Row-level import errors travel in details; the import screen needs
      // them to show the user which spreadsheet rows to fix.
      (error as ApiError & { details?: unknown }).details =
        payload.error?.details ?? (data as { details?: unknown })?.details;
      throw error;
    }
    return data as T;
  }

  /**
   * GET a binary response (e.g. the commercial invoice PDF) with the auth
   * header attached, returning a Blob the caller can save via a temporary
   * object URL. Deliberately never puts the access token in the URL/query
   * string — some backends log full request URLs, which would leak the
   * token into logs; the Authorization header does not have this problem.
   */
  async getBlob(path: string): Promise<Blob> {
    const token = this.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(`${this.baseUrl}${path}`, { headers });

    if (res.status === 401 && token) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.getAccessToken()}`;
        res = await fetch(`${this.baseUrl}${path}`, { headers });
      } else {
        this.clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error?.message || body?.detail || body?.message || `Request failed (${res.status})`;
      throw new ApiError(msg, res.status, body?.error?.code);
    }

    return res.blob();
  }

  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Upload PUT ${res.status}:`, body);
      throw new ApiError(`Upload failed (${res.status})`, res.status);
    }
  }
}

export const apiClient = new ApiClient();
