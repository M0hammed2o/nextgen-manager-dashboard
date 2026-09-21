import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiClient, API_BASE_URL } from './api-client';

describe('apiClient.getBlob — invoice PDF download', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the access token as an Authorization header, never in the URL', async () => {
    localStorage.setItem('access_token', 'test-access-token-123');
    const fakeBlob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(fakeBlob),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.getBlob('/v1/business/billing/commercial-invoices/abc-123/pdf');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/v1/business/billing/commercial-invoices/abc-123/pdf`);
    expect(url).not.toContain('test-access-token-123'); // never in the URL/query string
    expect(options.headers.Authorization).toBe('Bearer test-access-token-123');
    expect(result).toBe(fakeBlob);
  });

  it('propagates a non-2xx response as an ApiError instead of returning a broken blob', async () => {
    localStorage.setItem('access_token', 'test-access-token-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.getBlob('/v1/business/billing/commercial-invoices/missing/pdf')).rejects.toThrow(
      'Invoice not found'
    );
  });

  it('sends no Authorization header at all when there is no stored token', async () => {
    const fakeBlob = new Blob(['x']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(fakeBlob) });
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.getBlob('/v1/business/billing/commercial-invoices/abc/pdf');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });
});
