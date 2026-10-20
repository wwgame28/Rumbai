import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Message } from '../data/types.ts';
import { cloudHistory, localHistory } from './controller.ts';

const base = { conversationId: 'c', createdAt: 0, status: 'done' as const };

describe('cloudHistory', () => {
  test('replays Claude content blocks unchanged and skips failed turns', () => {
    const api = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Привет' }];
    const thread: Message[] = [
      { ...base, id: '1', role: 'user', text: 'Привет' },
      { ...base, id: '2', role: 'assistant', text: 'Привет', api },
      { ...base, id: '3', role: 'user', text: 'Ещё' },
      { ...base, id: '4', role: 'assistant', text: '', status: 'error', error: 'x' },
    ];
    const out = cloudHistory(thread);
    assert.equal(out.length, 3);
    assert.deepEqual(out[1]!.content, api);
  });

  test('adds an error result for a tool call that never got one', () => {
    const thread: Message[] = [
      { ...base, id: '1', role: 'user', text: 'Создай задачу' },
      { ...base, id: '2', role: 'assistant', text: '', api: [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: { title: 'x' } }] },
    ];
    const out = cloudHistory(thread);
    assert.equal(out.length, 3);
    assert.equal(out[2]!.role, 'user');
    assert.deepEqual((out[2]!.content as Array<{ type: string; tool_use_id: string; is_error: boolean }>)[0], {
      type: 'tool_result',
      tool_use_id: 'tu1',
      content: 'Interrupted before the tool ran.',
      is_error: true,
    });
  });

  test('includes local-model answers as plain text', () => {
    const out = cloudHistory([
      { ...base, id: '1', role: 'user', text: 'a' },
      { ...base, id: '2', role: 'assistant', text: 'b', engine: { kind: 'local', model: 'm', label: 'l' } },
    ]);
    assert.deepEqual(out[1], { role: 'assistant', content: 'b' });
  });
});

describe('localHistory', () => {
  test('keeps recent text turns within budget and starts with a user turn', () => {
    const long = 'я'.repeat(3000);
    const out = localHistory([
      { ...base, id: '1', role: 'user', text: long },
      { ...base, id: '2', role: 'assistant', text: long },
      { ...base, id: '3', role: 'tool', text: 'x' },
      { ...base, id: '4', role: 'user', text: 'последний вопрос' },
    ]);
    assert.equal(out.at(-1)!.content, 'последний вопрос');
    assert.equal(out[0]!.role, 'user');
    assert.ok(out.every((t) => t.role !== 'system'));
  });
});
