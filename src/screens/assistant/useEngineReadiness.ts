import { useEffect, useState } from 'react';
import { prettyClaude } from '../../ai/cloud.ts';
import { useCloudHealth } from '../../ai/health.ts';
import { localEngine } from '../../ai/local.ts';
import { findModelById } from '../../ai/models.ts';
import { useCapabilities } from '../../ai/useCapabilities.ts';
import { useLocalStatus } from '../../ai/useLocalStatus.ts';
import { usePrefs } from '../../data/hooks.ts';
import type { Engine } from '../../assistant/controller.ts';

export interface Readiness {
  ready: boolean;
  label: string;
  detail?: string;
  action?: { label: string; kind: 'load' | 'models' | 'retry-health' };
  tone: 'ok' | 'warn' | 'off';
}

export function useEngineReadiness(engine: Engine): Readiness {
  const local = useLocalStatus();
  const prefs = usePrefs();
  const cloud = useCloudHealth();
  const [caps] = useCapabilities();
  const [cached, setCached] = useState<boolean | null>(null);
  const modelId = prefs.localModelId;

  useEffect(() => {
    let alive = true;
    if (engine === 'local' && modelId) localEngine.isCached(modelId).then((c) => alive && setCached(c));
    return () => {
      alive = false;
    };
  }, [engine, modelId, local.phase]);

  if (engine === 'cloud') {
    if (cloud.state === 'static')
      return { ready: false, label: 'Облако недоступно в этой версии', detail: 'Версия на GitHub Pages работает без сервера, поэтому Claude здесь не подключить. Локальный режим работает.', tone: 'off' };
    if (cloud.state === 'unknown') return { ready: false, label: 'Проверяем сервер…', tone: 'off' };
    if (cloud.state === 'unreachable') return { ready: false, label: 'Сервер RUMBAI недоступен', detail: cloud.message, action: { label: 'Проверить снова', kind: 'retry-health' }, tone: 'warn' };
    if (!cloud.configured)
      return { ready: false, label: 'Claude не настроен', detail: 'На сервере не задан ANTHROPIC_API_KEY. Локальный режим работает без него.', action: { label: 'Проверить снова', kind: 'retry-health' }, tone: 'off' };
    return { ready: true, label: `${prettyClaude(cloud.model ?? '')} · облако`, detail: 'Сообщения и выбранные документы отправляются в Anthropic.', tone: 'ok' };
  }

  if (caps && caps.webgpu !== 'available')
    return { ready: false, label: 'Локальный ИИ недоступен', detail: 'В этом браузере нет WebGPU. Можно включить облачный режим вручную.', tone: 'off' };
  if (local.phase === 'ready' || local.phase === 'generating') {
    const m = findModelById(local.modelId);
    const verified = prefs.verifiedModels[local.modelId];
    return { ready: true, label: `${m?.label ?? local.modelId} · на устройстве`, detail: verified ? 'Инференс на этом устройстве проверен.' : 'Модель загружена; первый ответ подтвердит работу.', tone: verified ? 'ok' : 'warn' };
  }
  if (local.phase === 'loading') return { ready: false, label: `Загрузка модели · ${Math.round(local.progress * 100)}%`, detail: local.text, tone: 'warn' };
  if (local.phase === 'error') return { ready: false, label: 'Модель не запустилась', detail: local.message, action: { label: 'Открыть модели', kind: 'models' }, tone: 'warn' };
  if (modelId && cached) return { ready: false, label: `${findModelById(modelId)?.label ?? modelId} скачана`, detail: 'Модель в кэше устройства. Запустите её, чтобы общаться офлайн.', action: { label: 'Запустить', kind: 'load' }, tone: 'off' };
  return { ready: false, label: 'Локальная модель не выбрана', detail: 'Скачайте компактную модель, чтобы ассистент работал на устройстве.', action: { label: 'Выбрать модель', kind: 'models' }, tone: 'off' };
}
