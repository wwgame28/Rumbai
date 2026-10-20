import { CheckCircle2, CircleDashed, Cpu, Download, ExternalLink, Play, Power, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { localEngine } from '../../ai/local.ts';
import { LOCAL_MODELS, resolveModelId, type LocalModel } from '../../ai/models.ts';
import { webgpuLabel } from '../../ai/capability.ts';
import { useCapabilities } from '../../ai/useCapabilities.ts';
import { useLocalStatus } from '../../ai/useLocalStatus.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useCollection, usePrefs } from '../../data/hooks.ts';
import { docs, getStorageInfo, logAudit, prefsStore } from '../../data/store.ts';
import { formatDateTime } from '../../lib/date.ts';
import { formatBytes } from '../../lib/format.ts';
import { useSwState } from '../../pwa/register.ts';
import { Progress } from '../../ui/controls.tsx';
import { useConfirm } from '../../ui/Dialog.tsx';
import { Orb } from '../../ui/Orb.tsx';
import { useToast } from '../../ui/Toast.tsx';

export default function ModelsScreen() {
  const [caps, recheck] = useCapabilities();
  const local = useLocalStatus();
  const prefs = usePrefs();
  const sw = useSwState();
  const allDocs = useCollection(docs);
  const confirm = useConfirm();
  const toast = useToast();
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [test, setTest] = useState<{ modelId: string; text: string; ms: number } | { modelId: string; error: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const f16 = caps?.shaderF16 ?? false;
  const gpuOk = caps?.webgpu === 'available';

  const refreshCache = useCallback(() => readCacheState().then(setCached), []);
  useEffect(() => {
    let alive = true;
    readCacheState().then((c) => alive && setCached(c));
    return () => {
      alive = false;
    };
  }, [local.phase]);

  const selectedId = prefs.localModelId;
  const loadedId = local.phase === 'ready' || local.phase === 'generating' ? local.modelId : null;

  const start = async (m: LocalModel) => {
    const id = resolveModelId(m, f16);
    if (!id) return;
    if (!cached[id]) {
      const ok = await confirm({
        title: `Скачать ${m.label}?`,
        body: (
          <>
            <p>
              Будет загружено около <strong>{m.downloadMB} МБ</strong> с Hugging Face (веса) и GitHub (вычислительные ядра WebGPU). Лучше использовать Wi‑Fi.
            </p>
            <p>Модель сохранится в кэше браузера, чтобы потом работать офлайн. Ваши данные при этом никуда не отправляются.</p>
            <p className="subtle">Лицензия: {m.license}. Нужно примерно {f16 ? m.vramMB.f16 : (m.vramMB.f32 ?? m.vramMB.f16)} МБ видеопамяти.</p>
          </>
        ),
        confirmLabel: 'Скачать',
      });
      if (!ok) return;
      await logAudit({ actor: 'user', action: 'model.download', detail: id, outcome: 'ok' });
    }
    await prefsStore.update({ localModelId: id });
    await localEngine.load(id);
    refreshCache();
  };

  const runTest = async () => {
    if (!loadedId) return;
    setTesting(true);
    const t0 = performance.now();
    try {
      const res = await localEngine.generate([{ role: 'user', content: 'Ответь одним коротким предложением на русском: ты работаешь?' }], {
        signal: new AbortController().signal,
        onToken: () => {},
        maxTokens: 40,
      });
      setTest({ modelId: loadedId, text: res.text, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      setTest({ modelId: loadedId, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const removeCache = async (m: LocalModel) => {
    const ok = await confirm({ title: 'Удалить модель с устройства?', body: `Файлы ${m.label} будут удалены из кэша. Чтобы снова пользоваться ею, придётся скачать заново.`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      for (const id of [m.ids.f16, m.ids.f32]) if (id && cached[id]) await localEngine.deleteCache(id);
      await logAudit({ actor: 'user', action: 'model.delete', detail: m.key, outcome: 'ok' });
      toast.success('Кэш модели удалён');
      refreshCache();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const verified = selectedId ? prefs.verifiedModels[selectedId] : undefined;
  const states: Array<{ label: string; ok: boolean | null; detail: string }> = [
    { label: 'Интерфейс работает офлайн', ok: sw.controlled, detail: sw.controlled ? 'Оболочка приложения закэширована' : 'Закэшируется после первой загрузки по HTTPS' },
    { label: 'Документы доступны офлайн', ok: getStorageInfo().kind === 'indexeddb', detail: `${allDocs.length} в IndexedDB` },
    { label: 'Модель скачана', ok: selectedId ? Boolean(cached[selectedId]) : false, detail: selectedId ?? 'Модель не выбрана' },
    { label: 'Среда выполнения запущена', ok: Boolean(loadedId), detail: loadedId ? 'WebLLM инициализирован в фоновом потоке' : 'Не запущена' },
    { label: 'Инференс подтверждён', ok: Boolean(verified), detail: verified ? `Успешный ответ ${formatDateTime(verified)}` : 'Ещё не было успешного ответа на этом устройстве' },
  ];

  return (
    <>
      <ScreenHeader
        title="Локальный ИИ"
        subtitle="Модели, которые работают прямо на устройстве"
        actions={
          <button type="button" className="icon-btn" onClick={recheck} aria-label="Проверить возможности снова">
            <RefreshCw size={19} />
          </button>
        }
      />

      <section className="card" aria-labelledby="caps-title">
        <h2 id="caps-title" className="card-title widget-head">
          Возможности браузера
        </h2>
        {!caps ? (
          <p className="muted">Проверяем…</p>
        ) : (
          <ul className="status-list">
            <CapRow ok={caps.secureContext} label="Безопасный контекст (HTTPS)" value={caps.secureContext ? 'Да' : 'Нет — WebGPU и офлайн недоступны'} />
            <CapRow ok={gpuOk} label="WebGPU" value={webgpuLabel(caps)} />
            {gpuOk && <CapRow ok={caps.shaderF16} label="Шейдеры f16" value={caps.shaderF16 ? 'Есть' : 'Нет — будут использоваться f32-варианты'} />}
            {caps.adapterInfo && <CapRow ok={null} label="Адаптер" value={caps.adapterInfo} />}
            {caps.maxBufferMB !== null && <CapRow ok={null} label="Макс. буфер GPU" value={`${caps.maxBufferMB} МБ`} />}
            <CapRow ok={caps.cacheApi} label="Cache API для моделей" value={caps.cacheApi ? 'Есть' : 'Нет'} />
            <CapRow ok={null} label="Хранилище" value={caps.storage ? `${formatBytes(caps.storage.usage)} из ${formatBytes(caps.storage.quota)}` : 'нет данных'} />
          </ul>
        )}
        {caps && !gpuOk && (
          <div className="callout callout-warning" style={{ marginTop: 'var(--sp-3)' }}>
            <XCircle size={16} aria-hidden />
            <span>
              Локальная модель здесь не запустится. На iPhone WebGPU есть в Safari начиная с iOS 26 — откройте RUMBAI по HTTPS в актуальном Safari. Облачный режим можно включить вручную на экране ассистента.
            </span>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="states-title">
        <h2 id="states-title" className="card-title widget-head">
          Готовность офлайн-ИИ
        </h2>
        <ol className="readiness">
          {states.map((s) => (
            <li key={s.label} className={s.ok ? 'is-ok' : ''}>
              {s.ok ? <CheckCircle2 size={18} aria-hidden /> : <CircleDashed size={18} aria-hidden />}
              <span className="grow">
                <span style={{ display: 'block' }}>{s.label}</span>
                <span className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                  {s.detail}
                </span>
              </span>
              <span className="sr-only">{s.ok ? 'выполнено' : 'не выполнено'}</span>
            </li>
          ))}
        </ol>
      </section>

      {local.phase === 'loading' && (
        <section className="card card-glass loading-card" aria-live="polite">
          <div className="row">
            <Orb active size={36} />
            <div className="grow" style={{ minWidth: 0 }}>
              <strong>Загрузка модели · {Math.round(local.progress * 100)}%</strong>
              <p className="subtle truncate" style={{ fontSize: 'var(--fs-xs)' }}>
                {local.text}
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => localEngine.cancelLoad()}>
              Отменить
            </button>
          </div>
          <Progress value={local.progress} label="Загрузка модели" />
        </section>
      )}
      {local.phase === 'error' && (
        <div className="callout callout-danger" role="alert">
          <XCircle size={16} aria-hidden />
          <span>{local.message}</span>
        </div>
      )}

      <section className="stack" aria-label="Модели">
        {LOCAL_MODELS.map((m) => {
          const id = resolveModelId(m, f16);
          const isCached = id ? Boolean(cached[id]) : false;
          const isLoaded = id !== null && loadedId === id;
          const anyCached = [m.ids.f16, m.ids.f32].some((x) => x && cached[x]);
          return (
            <article key={m.key} className={`card model-card${isLoaded ? ' is-loaded' : ''}`}>
              <div className="row-between">
                <div className="row">
                  <span className="list-row-icon">
                    <Cpu size={16} aria-hidden />
                  </span>
                  <div>
                    <strong>{m.label}</strong>
                    <p className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
                      {m.params}
                    </p>
                  </div>
                </div>
                {isLoaded ? <span className="badge badge-success">Запущена</span> : isCached ? <span className="badge badge-accent">Скачана</span> : null}
              </div>
              <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                {m.note}
              </p>
              <dl className="model-facts">
                <div>
                  <dt>Загрузка</dt>
                  <dd>≈ {m.downloadMB} МБ</dd>
                </div>
                <div>
                  <dt>Видеопамять</dt>
                  <dd>≈ {f16 ? m.vramMB.f16 : (m.vramMB.f32 ?? '—')} МБ</dd>
                </div>
                <div>
                  <dt>Лицензия</dt>
                  <dd>
                    <a href={m.licenseUrl} target="_blank" rel="noopener noreferrer">
                      {m.license} <ExternalLink size={11} aria-hidden />
                    </a>
                  </dd>
                </div>
              </dl>
              {id && <p className="subtle model-id">{id}</p>}
              <div className="row wrap">
                {!id ? (
                  <span className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>
                    Нужны шейдеры f16 — на этом устройстве недоступно.
                  </span>
                ) : isLoaded ? (
                  <>
                    <button type="button" className="btn btn-sm btn-primary" onClick={runTest} disabled={testing || local.phase === 'generating'}>
                      <Play size={14} aria-hidden /> {testing ? 'Проверка…' : 'Проверить инференс'}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => localEngine.unload()}>
                      <Power size={14} aria-hidden /> Выгрузить
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => start(m)} disabled={!gpuOk || local.phase === 'loading'}>
                    {isCached ? <Play size={14} aria-hidden /> : <Download size={14} aria-hidden />} {isCached ? 'Запустить' : 'Скачать и запустить'}
                  </button>
                )}
                {anyCached && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeCache(m)} disabled={local.phase === 'loading'}>
                    <Trash2 size={14} aria-hidden /> Удалить из кэша
                  </button>
                )}
              </div>
              {test && test.modelId === id && (
                <div className={`callout ${'error' in test ? 'callout-danger' : 'callout-success'}`} role="status">
                  {'error' in test ? <XCircle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
                  <span>{'error' in test ? test.error : `Ответ за ${(test.ms / 1000).toFixed(1)} с: «${test.text.trim()}»`}</span>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <p className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>
        Список проверен по каталогу WebLLM 0.2.86 и репозиториям mlc-ai на Hugging Face. Работает ли модель на конкретном устройстве, становится известно только после загрузки и пробного ответа.
      </p>
    </>
  );
}

async function readCacheState(): Promise<Record<string, boolean>> {
  const ids = LOCAL_MODELS.flatMap((m) => [m.ids.f16, m.ids.f32]).filter((id): id is string => Boolean(id));
  return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await localEngine.isCached(id)] as const)));
}

function CapRow({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  return (
    <li>
      <span className="grow">{label}</span>
      <span className={`status status-${ok === null ? 'off' : ok ? 'ok' : 'warn'}`}>{value}</span>
    </li>
  );
}
