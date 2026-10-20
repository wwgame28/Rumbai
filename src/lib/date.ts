/** Local calendar date as YYYY-MM-DD (not UTC). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return toISODate(new Date(y, m - 1, d + days));
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const fullFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatDue(iso: string, today = todayISO()): string {
  if (iso === today) return 'Сегодня';
  if (iso === addDays(today, 1)) return 'Завтра';
  if (iso === addDays(today, -1)) return 'Вчера';
  return dayFmt.format(parseISODate(iso));
}

export const formatFullDate = (d: Date) => fullFmt.format(d);
export const formatTime = (d: Date) => timeFmt.format(d);
export const formatDateTime = (ts: number) => dateTimeFmt.format(new Date(ts));

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.round((now - ts) / 1000);
  if (diff < 45) return 'только что';
  if (diff < 3600) return `${Math.round(diff / 60)} мин назад`;
  if (diff < 86400 && new Date(ts).getDate() === new Date(now).getDate()) return `сегодня в ${formatTime(new Date(ts))}`;
  return formatDateTime(ts);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function localTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
