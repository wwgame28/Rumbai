import type { ChatRequest, ErrorCode, HealthResponse, StreamEvent } from '../../shared/protocol.ts';

export class CloudError extends Error {
  readonly code: ErrorCode | 'http';
  constructor(code: ErrorCode | 'http', message: string) {
    super(message);
    this.code = code;
  }
}

/** Set at build time for static hosting (GitHub Pages), where there is no RUMBAI server. */
// `import.meta.env` exists only in Vite builds; unit tests run this module in plain Node.
const env = (import.meta as ImportMeta & { env?: { VITE_CLOUD?: string; BASE_URL?: string } }).env;
export const CLOUD_AVAILABLE = env?.VITE_CLOUD !== 'off';
const API = `${env?.BASE_URL ?? '/'}api`;

export type CloudHealth =
  | { state: 'unknown' }
  | { state: 'static' }
  | { state: 'unreachable'; message: string }
  | { state: 'ok'; configured: boolean; model: string | null; checkedAt: number };

export async function fetchHealth(signal?: AbortSignal): Promise<CloudHealth> {
  if (!CLOUD_AVAILABLE) return { state: 'static' };
  try {
    const res = await fetch(`${API}/health`, { signal: signal ?? AbortSignal.timeout(6000), cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
      return { state: 'unreachable', message: `Сервер ответил ${res.status}` };
    const body = (await res.json()) as HealthResponse;
    return { state: 'ok', configured: body.claude.configured, model: body.claude.model, checkedAt: Date.now() };
  } catch (err) {
    return { state: 'unreachable', message: navigator.onLine ? `Сервер RUMBAI недоступен (${(err as Error).name})` : 'Нет подключения к интернету' };
  }
}

/** POSTs to the server-side Claude adapter and yields its server-sent events. */
export async function* streamCloud(req: ChatRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new CloudError('network', navigator.onLine ? 'Не удалось связаться с сервером RUMBAI.' : 'Нет подключения к интернету.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: ErrorCode; message?: string } } | null;
    throw new CloudError(body?.error?.code ?? 'http', body?.error?.message ?? `Сервер ответил ${res.status}`);
  }
  if (!res.body) throw new CloudError('http', 'Пустой ответ сервера.');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        yield JSON.parse(data) as StreamEvent;
      } catch {
        throw new CloudError('upstream', 'Сервер прислал повреждённые данные.');
      }
    }
  }
}

export function prettyClaude(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
  if (!m) return model;
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  return `Claude ${name} ${m[2]}${m[3] && m[3].length < 3 ? `.${m[3]}` : ''}`;
}
