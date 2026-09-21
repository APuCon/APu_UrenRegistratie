export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wordt aangeroepen als de database wakker wordt (503) zodat de UI dat kan tonen. */
let onWaking: ((waking: boolean) => void) | null = null;
export function setWakingListener(fn: ((waking: boolean) => void) | null) {
  onWaking = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // Meestal: sessie verlopen (redirect naar Microsoft-login wordt door de browser geblokkeerd) of geen verbinding.
      if (navigator.onLine && sessionStorage.getItem('herlaad') !== '1') {
        sessionStorage.setItem('herlaad', '1');
        window.location.reload();
        return new Promise<T>(() => undefined);
      }
      throw new ApiError(0, 'Geen verbinding met de server.');
    }
    sessionStorage.removeItem('herlaad');

    if (res.status === 401) {
      window.location.href = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return new Promise<T>(() => undefined);
    }
    if (res.status === 503 && attempt < maxAttempts) {
      onWaking?.(true);
      await sleep(8000);
      continue;
    }
    onWaking?.(false);

    if (res.status === 204) return undefined as T;
    let data: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const msg = (data as { error?: string } | null)?.error ?? `Fout ${res.status}`;
      throw new ApiError(res.status, msg);
    }
    return data as T;
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};

/** Bouw een query-string; lege waarden worden weggelaten. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
