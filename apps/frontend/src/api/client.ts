import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';
import { useActiveTeam } from '../team/TeamContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

export interface ApiClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T>(path: string, init?: RequestInit): Promise<T>;
  /**
   * POST que devuelve un archivo binario (CSV, XLSX, PDF…). Lee el filename
   * del header `Content-Disposition` si está presente, si no usa el fallback.
   */
  download(path: string, body?: unknown, fallbackFilename?: string): Promise<DownloadedFile>;
  baseUrl: string;
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

/**
 * Hook que devuelve un cliente HTTP configurado con el JWT de Clerk.
 * El token se renueva en cada request via getToken() — Clerk maneja refresh.
 * Lanza ApiError(status) en respuestas 4xx/5xx.
 */
export function useApi(): ApiClient {
  const { getToken } = useAuth();
  const { activeTeamId } = useActiveTeam();

  const request = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (activeTeamId) headers.set('x-team-id', activeTeamId);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
      const res = await fetch(url, { ...init, headers });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
      if (!res.ok) {
        const msg =
          (body && typeof body === 'object' && 'message' in body && String((body as { message: unknown }).message)) ||
          res.statusText ||
          `HTTP ${res.status}`;
        throw new ApiError(res.status, msg, body);
      }
      return body as T;
    },
    [getToken, activeTeamId],
  );

  const download = useCallback(
    async (path: string, body?: unknown, fallbackFilename = 'download'): Promise<DownloadedFile> => {
      const token = await getToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (activeTeamId) headers.set('x-team-id', activeTeamId);
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        const msg =
          (parsed && typeof parsed === 'object' && 'message' in parsed
            ? String((parsed as { message: unknown }).message)
            : null) ?? res.statusText ?? `HTTP ${res.status}`;
        throw new ApiError(res.status, msg, parsed);
      }
      const blob = await res.blob();
      const filename = parseFilename(res.headers.get('content-disposition'), fallbackFilename);
      return { blob, filename };
    },
    [getToken, activeTeamId],
  );

  return {
    baseUrl: API_BASE_URL,
    get: (path, init) => request(path, { ...init, method: 'GET' }),
    post: (path, body, init) =>
      request(path, { ...init, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
    patch: (path, body, init) =>
      request(path, { ...init, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
    delete: (path, init) => request(path, { ...init, method: 'DELETE' }),
    download,
  };
}

/**
 * Dispara el save dialog del browser para un Blob recibido (típicamente
 * desde `api.download(...)`). Crea un `<a>` temporal con un Object URL.
 */
export function triggerBlobDownload(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
