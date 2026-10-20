/**
 * Detects what this browser can actually do. Every field is observed, not assumed:
 * device memory is deliberately not estimated.
 */
export interface Capabilities {
  secureContext: boolean;
  webgpu: 'available' | 'no-api' | 'no-adapter' | 'error';
  shaderF16: boolean;
  adapterInfo: string | null;
  maxBufferMB: number | null;
  serviceWorker: boolean;
  storage: { usage: number; quota: number } | null;
  persisted: boolean | null;
  standalone: boolean;
  cacheApi: boolean;
  error?: string;
}

interface GPUAdapterLike {
  features: { has(f: string): boolean };
  limits: { maxBufferSize?: number; maxStorageBufferBindingSize?: number };
  info?: { vendor?: string; architecture?: string; description?: string };
}

export async function detectCapabilities(): Promise<Capabilities> {
  const caps: Capabilities = {
    secureContext: window.isSecureContext,
    webgpu: 'no-api',
    shaderF16: false,
    adapterInfo: null,
    maxBufferMB: null,
    serviceWorker: 'serviceWorker' in navigator,
    storage: null,
    persisted: null,
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    cacheApi: 'caches' in window,
  };

  const gpu = (navigator as { gpu?: { requestAdapter(o?: unknown): Promise<GPUAdapterLike | null> } }).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) caps.webgpu = 'no-adapter';
      else {
        caps.webgpu = 'available';
        caps.shaderF16 = adapter.features.has('shader-f16');
        const info = adapter.info;
        caps.adapterInfo = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(' · ') || null;
        const max = adapter.limits.maxBufferSize ?? adapter.limits.maxStorageBufferBindingSize;
        caps.maxBufferMB = max ? Math.round(max / 1024 / 1024) : null;
      }
    } catch (err) {
      caps.webgpu = 'error';
      caps.error = (err as Error).message;
    }
  }

  try {
    const est = await navigator.storage?.estimate?.();
    if (est) caps.storage = { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    caps.persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    // Storage estimates are optional.
  }
  return caps;
}

export function webgpuLabel(c: Capabilities): string {
  switch (c.webgpu) {
    case 'available':
      return c.shaderF16 ? 'WebGPU доступен (с f16)' : 'WebGPU доступен (без f16)';
    case 'no-adapter':
      return 'WebGPU есть, но видеоадаптер не выдан';
    case 'error':
      return 'Ошибка WebGPU';
    default:
      return 'WebGPU не поддерживается';
  }
}
