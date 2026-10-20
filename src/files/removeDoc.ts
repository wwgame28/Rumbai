import { conversations, docs, excerpts, logAudit } from '../data/store.ts';

/** Removes a document, its saved excerpts and its use as conversation context. */
export async function removeDoc(id: string) {
  await excerpts.remove(excerpts.all().filter((e) => e.docId === id).map((e) => e.id));
  const affected = conversations.all().filter((c) => c.contextDocIds.includes(id));
  await conversations.putMany(affected.map((c) => ({ ...c, contextDocIds: c.contextDocIds.filter((d) => d !== id) })));
  await docs.remove(id);
  await logAudit({ actor: 'user', action: 'doc.delete', detail: id, outcome: 'ok' });
}
