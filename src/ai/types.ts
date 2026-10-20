import type { EngineRef } from '../data/types.ts';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  onToken: (text: string) => void;
  signal: AbortSignal;
}

export interface GenerateResult {
  text: string;
  engine: EngineRef;
}
