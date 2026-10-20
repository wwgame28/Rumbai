import Anthropic from '@anthropic-ai/sdk';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS, chatRequestSchema, type HealthResponse, type StreamEvent } from '../shared/protocol.ts';
import { mapError, streamChat, type ClaudeConfig } from './chat.ts';
import { HttpError, RateLimiter, SECURITY_HEADERS, isAllowedOrigin, readJsonBody, sendJson } from './http.ts';

const VERSION = '1.0.0';
const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(here, '..', 'dist');
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const efforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const effortEnv = process.env.CLAUDE_EFFORT as ClaudeConfig['effort'] | undefined;

const cfg: ClaudeConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY || undefined,
  model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  effort: effortEnv && efforts.includes(effortEnv) ? effortEnv : 'medium',
};
const client = cfg.apiKey ? new Anthropic({ apiKey: cfg.apiKey, maxRetries: 2 }) : null;
const limiter = new RateLimiter(30, 60_000);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function clientKey(req: IncomingMessage) {
  return req.socket.remoteAddress ?? 'unknown';
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  if (!isAllowedOrigin(req, extraOrigins)) throw new HttpError(403, 'forbidden_origin', 'Источник запроса не разрешён.');
  if (!client) throw new HttpError(503, 'not_configured', 'Claude не настроен на сервере: не задан ANTHROPIC_API_KEY.');
  if (!limiter.take(clientKey(req))) throw new HttpError(429, 'rate_limited', 'Слишком много запросов. Подождите минуту.');
  if (!String(req.headers['content-type']).startsWith('application/json'))
    throw new HttpError(415, 'bad_request', 'Ожидается application/json.');

  const parsed = chatRequestSchema.safeParse(await readJsonBody(req, LIMITS.maxBodyBytes));
  if (!parsed.success) throw new HttpError(400, 'bad_request', 'Некорректный запрос к /api/chat.');

  const abort = new AbortController();
  res.on('close', () => abort.abort());
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
  });
  const emit = (e: StreamEvent) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  try {
    await streamChat(client, parsed.data, cfg, emit, abort.signal);
  } catch (err) {
    if (!abort.signal.aborted) {
      const mapped = mapError(err);
      // Log the class and status only — never request bodies or headers.
      console.error('[chat] upstream error', err instanceof Anthropic.APIError ? err.status : (err as Error).name);
      emit({ type: 'error', code: mapped.code, message: mapped.message });
    }
  } finally {
    res.end();
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://local');
  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, 'bad_request', 'Некорректный путь.');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(distDir, rel));
  if (!file.startsWith(distDir + sep)) throw new HttpError(400, 'bad_request', 'Некорректный путь.');
  let target = file;
  try {
    const s = await stat(target);
    if (!s.isFile()) throw new Error('not a file');
  } catch {
    // Single-page app: unknown paths without an extension get the shell.
    if (extname(rel)) throw new HttpError(404, 'not_found', 'Не найдено.');
    target = join(distDir, 'index.html');
  }
  const ext = extname(target);
  const immutable = target.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
}

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const path = (req.url ?? '/').split('?')[0];
  try {
    if (path === '/api/health' && req.method === 'GET') {
      const body: HealthResponse = { ok: true, claude: { configured: Boolean(client), model: client ? cfg.model : null }, version: VERSION };
      return sendJson(res, 200, body);
    }
    if (path === '/api/chat') {
      if (req.method !== 'POST') throw new HttpError(405, 'bad_request', 'Метод не поддерживается.');
      return await handleChat(req, res);
    }
    if (path?.startsWith('/api/')) throw new HttpError(404, 'not_found', 'Не найдено.');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'bad_request', 'Метод не поддерживается.');
    return await serveStatic(req, res);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return sendJson(res, err.status, { error: { code: err.code, message: err.message } });
    console.error('[server] unexpected', (err as Error).name);
    return sendJson(res, 500, { error: { code: 'internal', message: 'Внутренняя ошибка сервера.' } });
  }
});

server.listen(port, () => {
  console.log(`RUMBAI server on http://localhost:${port} — Claude ${client ? `configured (${cfg.model})` : 'not configured'}`);
});
