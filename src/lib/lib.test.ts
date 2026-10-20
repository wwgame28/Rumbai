import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { filterTasks, sortTasks, summarize } from '../screens/tasks/taskLogic.ts';
import type { Task } from '../data/types.ts';
import { addDays, formatDue, toISODate } from './date.ts';
import { countLabel } from './format.ts';
import { findSnippets, highlightParts, matchesAll } from './search.ts';

describe('search', () => {
  test('is case and ё insensitive and requires all terms', () => {
    assert.ok(matchesAll('Ёлка и ПЛАН встречи', 'елка план'));
    assert.ok(!matchesAll('Ёлка', 'елка план'));
  });
  test('snippets carry 1-based line numbers', () => {
    const s = findSnippets('первая\nвторая строка с бюджетом\nтретья', 'бюджет');
    assert.equal(s[0]?.line, 2);
  });
  test('highlight splits without HTML', () => {
    assert.deepEqual(highlightParts('a<b>Мир', 'мир'), [
      { text: 'a<b>', hit: false },
      { text: 'Мир', hit: true },
    ]);
  });
});

describe('dates and plurals', () => {
  test('local ISO dates and relative labels', () => {
    assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(formatDue('2026-10-21', '2026-10-20'), 'Завтра');
  });
  test('Russian plural forms', () => {
    assert.equal(countLabel(1, ['задача', 'задачи', 'задач']), '1 задача');
    assert.equal(countLabel(3, ['задача', 'задачи', 'задач']), '3 задачи');
    assert.equal(countLabel(11, ['задача', 'задачи', 'задач']), '11 задач');
    assert.equal(countLabel(22, ['задача', 'задачи', 'задач']), '22 задачи');
  });
});

describe('task logic', () => {
  const t = (id: string, p: Partial<Task>): Task => ({ id, title: id, notes: '', priority: 'medium', due: null, done: false, doneAt: null, createdAt: 0, updatedAt: 0, ...p });
  const today = '2026-10-20';
  const list = [t('a', { due: '2026-10-19' }), t('b', { due: today, priority: 'high' }), t('c', { due: '2026-10-25' }), t('d', { done: true, doneAt: 10 }), t('e', {})];
  test('filters', () => {
    assert.deepEqual(filterTasks(list, 'today', today).map((x) => x.id), ['a', 'b']);
    assert.deepEqual(filterTasks(list, 'overdue', today).map((x) => x.id), ['a']);
    assert.deepEqual(filterTasks(list, 'upcoming', today).map((x) => x.id), ['c']);
    assert.deepEqual(filterTasks(list, 'done', today).map((x) => x.id), ['d']);
  });
  test('sorting by priority puts high first and done last', () => {
    assert.deepEqual(sortTasks(list, 'priority').map((x) => x.id), ['b', 'a', 'c', 'e', 'd']);
  });
  test('summary', () => {
    assert.deepEqual(summarize(list, today, 5), { dueToday: 1, overdue: 1, doneToday: 1, open: 4 });
  });
});

describe('stripMarkdown', () => {
  test('removes emphasis, headings and link syntax', async () => {
    const { stripMarkdown } = await import('./search.ts');
    assert.equal(stripMarkdown('# Заголовок\nОбсудить **бюджет** и [ссылку](https://x.y)'), 'Заголовок\nОбсудить бюджет и ссылку');
  });
});

describe('HTML import', () => {
  test('reduces markup to text without scripts, handlers or entities', async () => {
    const { extractText } = await import('../files/importer.ts');
    const out = extractText('<h1>Заголовок</h1><script>alert(1)</script><img src=x onerror="pwn()"><p>Текст &amp; ещё&nbsp;&#1105;</p>', 'html');
    assert.equal(out, 'Заголовок\nТекст & ещё ё');
  });
});
