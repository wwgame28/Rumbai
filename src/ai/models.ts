/**
 * On-device models offered in RUMBAI.
 *
 * Verified on 2026-10-20 against @mlc-ai/web-llm 0.2.86 `prebuiltAppConfig`
 * (model ids, VRAM estimates, context size) and the Hugging Face repos
 * (file listings summed for download size; licenses from the base models).
 * Only models whose base model is multilingual enough for Russian are listed.
 * Whether a model actually runs on a given device is only known after the
 * user downloads it and a test generation succeeds.
 */
export interface LocalModel {
  key: string;
  label: string;
  params: string;
  /** Sum of weight shards + tokenizer files on Hugging Face (≈ MB). */
  downloadMB: number;
  /** WebLLM `vram_required_MB` for the f16 / f32 variants. */
  vramMB: { f16: number; f32: number | null };
  ids: { f16: string; f32: string | null };
  license: string;
  licenseUrl: string;
  repoUrl: string;
  note: string;
  qwen3?: boolean;
}

export const LOCAL_MODELS: LocalModel[] = [
  {
    key: 'qwen2.5-0.5b',
    label: 'Qwen2.5 0.5B Instruct',
    params: '0,5 млрд параметров, 4-бит',
    downloadMB: 290,
    vramMB: { f16: 945, f32: 1060 },
    ids: { f16: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC' },
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct',
    repoUrl: 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    note: 'Самая лёгкая. Подходит для коротких ответов и экспериментов на телефоне; качество на русском скромное.',
  },
  {
    key: 'qwen2.5-1.5b',
    label: 'Qwen2.5 1.5B Instruct',
    params: '1,5 млрд параметров, 4-бит',
    downloadMB: 880,
    vramMB: { f16: 1630, f32: 1889 },
    ids: { f16: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC' },
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct',
    repoUrl: 'https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    note: 'Заметно лучше по качеству, но требует больше памяти. На iPhone может не загрузиться при нехватке памяти.',
  },
  {
    key: 'qwen3-1.7b',
    label: 'Qwen3 1.7B',
    params: '1,7 млрд параметров, 4-бит',
    downloadMB: 984,
    vramMB: { f16: 2037, f32: null },
    ids: { f16: 'Qwen3-1.7B-q4f16_1-MLC', f32: null },
    license: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3-1.7B',
    repoUrl: 'https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC',
    note: 'Новее и сильнее, режим размышлений отключён для скорости. Нужна поддержка f16 в WebGPU.',
    qwen3: true,
  },
];

export function resolveModelId(model: LocalModel, f16: boolean): string | null {
  return f16 ? model.ids.f16 : model.ids.f32;
}

export function findModelById(id: string): LocalModel | undefined {
  return LOCAL_MODELS.find((m) => m.ids.f16 === id || m.ids.f32 === id);
}
