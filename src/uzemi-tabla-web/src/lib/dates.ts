/** Client-side mirror of production-service/src/domain/dates.ts — kept in
 * sync manually since the two packages don't share a module boundary yet. */

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monday(d: Date): string {
  const copy = new Date(d);
  const diff = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return iso(copy);
}

export function addDays(weekStartIso: string, days: number): Date {
  const d = new Date(`${weekStartIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

export function shiftWeek(weekStartIso: string, weeks: number): string {
  const d = new Date(`${weekStartIso}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return iso(d);
}

export const DAY_NAMES = ["HÉTFŐ", "KEDD", "SZERDA", "CSÜTÖRTÖK", "PÉNTEK", "SZOMBAT", "VASÁRNAP"];

export function weekLabel(weekStartIso: string): string {
  const start = addDays(weekStartIso, 0);
  const end = addDays(weekStartIso, 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}.`;
  return `${start.getFullYear()}. ${fmt(start)} – ${fmt(end)}`;
}
