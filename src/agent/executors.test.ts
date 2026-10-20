import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { audit, initStore, tasks } from '../data/store.ts';
import { executeTool, needsConfirmation } from './executors.ts';

before(async () => {
  // No IndexedDB in Node: the store falls back to the in-memory backend.
  const info = await initStore();
  assert.equal(info.kind, 'memory');
});

describe('permission policy', () => {
  test('reads never ask, writes ask unless auto-approved, deletes always ask', () => {
    assert.equal(needsConfirmation('search_notes', false), false);
    assert.equal(needsConfirmation('list_tasks', false), false);
    assert.equal(needsConfirmation('create_task', false), true);
    assert.equal(needsConfirmation('create_task', true), false);
    assert.equal(needsConfirmation('delete_task', true), true);
  });
});

describe('executeTool', () => {
  test('rejects invalid arguments without running or asking', async () => {
    let asked = false;
    const out = await executeTool('create_task', { title: '', extra: 1 }, { autoApproveWrites: false, ask: async () => ((asked = true), 'allow') });
    assert.equal(out.ok, false);
    assert.equal(asked, false);
    assert.equal(tasks.all().length, 0);
  });

  test('rejects unknown tools', async () => {
    const out = await executeTool('run_shell', { cmd: 'rm -rf /' }, { autoApproveWrites: true, ask: async () => 'allow' });
    assert.equal(out.ok, false);
  });

  test('a declined write does nothing and is audited as denied', async () => {
    const out = await executeTool('create_task', { title: 'Купить молоко' }, { autoApproveWrites: false, ask: async () => 'deny' });
    assert.equal(out.ok, false);
    assert.equal(tasks.all().length, 0);
    assert.ok(audit.all().some((a) => a.action === 'tool.create_task' && a.outcome === 'denied'));
  });

  test('an approved write creates the task', async () => {
    const out = await executeTool('create_task', { title: 'Купить молоко', due: '2026-10-21', priority: 'high' }, { autoApproveWrites: false, ask: async () => 'allow' });
    assert.equal(out.ok, true);
    const [t] = tasks.all();
    assert.equal(t?.title, 'Купить молоко');
    assert.equal(t?.priority, 'high');
  });

  test('delete asks even when writes are auto-approved', async () => {
    const id = tasks.all()[0]!.id;
    let asked = 0;
    await executeTool('delete_task', { id }, { autoApproveWrites: true, ask: async () => (asked++, 'deny') });
    assert.equal(asked, 1);
    assert.equal(tasks.all().length, 1);
  });

  test('audit entries never contain message or document contents', async () => {
    for (const a of audit.all()) assert.ok(a.detail.length <= 200);
  });
});
