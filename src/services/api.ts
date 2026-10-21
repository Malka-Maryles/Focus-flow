export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  // If running in HTTPS or on a cloud environment (like AI Studio preview .run.app),
  // NEVER use http://localhost:8000 because the browser blocks mixed content and
  // the client device does not have port 8000 open. Always use relative URL.
  if (
    window.location.protocol === 'https:' ||
    !window.location.hostname.includes('localhost') ||
    window.location.hostname.includes('.run.app')
  ) {
    return '';
  }

  // If in local development and port is 3000, our full-stack server.ts handles /api directly.
  if (window.location.hostname === 'localhost' && window.location.port === '3000') {
    return '';
  }

  return import.meta.env.VITE_API_URL || '';
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('focusflow_token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (
      response.status === 401 &&
      !endpoint.includes('/api/auth/login') &&
      !endpoint.includes('/api/auth/register')
    ) {
      localStorage.removeItem('focusflow_token');
      localStorage.removeItem('focusflow_user');
      window.dispatchEvent(new Event('focusflow_auth_logout'));
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.detail || data?.message || `שגיאה בתקשורת עם השרת (${response.status})`;
      throw new Error(errorMsg);
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof Error) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('לא ניתן להתחבר לשרת. נא לוודא שהשרת פועל.');
      }
      throw err;
    }
    throw new Error('שגיאה בלתי צפויה בהתקשרות לשרת.');
  }
}
