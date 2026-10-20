import type { MLCEngineInterface } from '@mlc-ai/web-llm';
import { prefsStore } from '../data/store.ts';
import { findModelById } from './models.ts';
import type { ChatTurn, GenerateOptions, GenerateResult } from './types.ts';

export type LocalStatus =
  | { phase: 'idle' }
  | { phase: 'loading'; modelId: string; progress: number; text: string }
  | { phase: 'ready'; modelId: string }
  | { phase: 'generating'; modelId: string }
  | { phase: 'error'; modelId: string | null; message: string };

type Listener = () => void;

const webllm = () => import('@mlc-ai/web-llm');

/** Manages one on-device model running in a Web Worker via WebLLM. */
class LocalEngine {
  private status: LocalStatus = { phase: 'idle' };
  private listeners = new Set<Listener>();
  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;
  private loadToken = 0;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.status;

  private set(s: LocalStatus) {
    this.status = s;
    this.listeners.forEach((l) => l());
  }

  async isCached(modelId: string): Promise<boolean> {
    try {
      return await (await webllm()).hasModelInCache(modelId);
    } catch {
      return false;
    }
  }

  async deleteCache(modelId: string) {
    if (this.currentModelId() === modelId) await this.unload();
    await (await webllm()).deleteModelAllInfoInCache(modelId);
  }

  currentModelId(): string | null {
    const s = this.status;
    return s.phase === 'ready' || s.phase === 'generating' || s.phase === 'loading' ? s.modelId : null;
  }

  /** Downloads (if needed) and initializes the runtime. The caller must have obtained the user's consent to download. */
  async load(modelId: string) {
    await this.unload();
    const token = ++this.loadToken;
    this.set({ phase: 'loading', modelId, progress: 0, text: 'Подготовка…' });
    try {
      const lib = await webllm();
      this.worker = new Worker(new URL('./local-worker.ts', import.meta.url), { type: 'module' });
      const engine = await lib.CreateWebWorkerMLCEngine(this.worker, modelId, {
        initProgressCallback: (r: { progress: number; text: string }) => {
          if (token === this.loadToken) this.set({ phase: 'loading', modelId, progress: r.progress, text: r.text });
        },
      });
      if (token !== this.loadToken) {
        await engine.unload().catch(() => {});
        return;
      }
      this.engine = engine;
      this.set({ phase: 'ready', modelId });
    } catch (err) {
      if (token !== this.loadToken) return;
      this.terminate();
      this.set({ phase: 'error', modelId, message: explain(err) });
    }
  }

  /** Stops a download/initialization in progress. Already downloaded files stay in the cache. */
  cancelLoad() {
    this.loadToken++;
    this.terminate();
    this.set({ phase: 'idle' });
  }

  async unload() {
    const engine = this.engine;
    this.engine = null;
    if (engine) await engine.unload().catch(() => {});
    this.terminate();
    if (this.status.phase !== 'idle') this.set({ phase: 'idle' });
  }

  private terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.engine = null;
  }

  async generate(turns: ChatTurn[], opts: GenerateOptions & { maxTokens?: number }): Promise<GenerateResult> {
    const engine = this.engine;
    const s = this.status;
    if (!engine || s.phase !== 'ready') throw new Error('Локальная модель не загружена.');
    const modelId = s.modelId;
    const info = findModelById(modelId);
    this.set({ phase: 'generating', modelId });
    const onAbort = () => engine.interruptGenerate();
    opts.signal.addEventListener('abort', onAbort);
    let text = '';
    try {
      const stream = await engine.chat.completions.create({
        messages: turns,
        stream: true,
        temperature: 0.6,
        max_tokens: opts.maxTokens ?? 1024,
        ...(info?.qwen3 ? { extra_body: { enable_thinking: false } } : {}),
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          text += delta;
          opts.onToken(cleanThink(text));
        }
      }
      text = cleanThink(text);
      if (!opts.signal.aborted && text.trim()) {
        // Inference on this device is now demonstrated, not assumed.
        const verified = { ...prefsStore.get().verifiedModels, [modelId]: Date.now() };
        prefsStore.update({ verifiedModels: verified }).catch(() => {});
      }
      this.set({ phase: 'ready', modelId });
      return { text, engine: { kind: 'local', model: modelId, label: `${info?.label ?? modelId} · на устройстве` } };
    } catch (err) {
      const message = explain(err);
      // A lost GPU device means the engine is unusable until reloaded.
      if (/device|lost|memory|OOM/i.test(String((err as Error)?.message))) {
        this.terminate();
        this.set({ phase: 'error', modelId, message });
      } else {
        this.set({ phase: 'ready', modelId });
      }
      throw new Error(message, { cause: err });
    } finally {
      opts.signal.removeEventListener('abort', onAbort);
    }
  }
}

function cleanThink(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/^<think>[\s\S]*$/, '');
}

function explain(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  if (/webgpu|navigator\.gpu|adapter/i.test(msg)) return `WebGPU недоступен или не поддерживает модель: ${msg}`;
  if (/device.*lost|out of memory|OOM/i.test(msg)) return 'Устройству не хватило видеопамяти. Попробуйте модель меньше или закройте другие вкладки.';
  if (/quota|storage/i.test(msg)) return 'Не хватило места в хранилище браузера для модели.';
  if (/network|fetch|Failed to fetch/i.test(msg)) return 'Не удалось скачать файлы модели. Проверьте соединение.';
  return msg;
}

export const localEngine = new LocalEngine();
