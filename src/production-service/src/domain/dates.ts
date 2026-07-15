/** Date helpers shared by the board, load monitor and scheduler. Weeks are
 * identified by the ISO date (YYYY-MM-DD) of their Monday. */

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monday(d: Date): string {
  const copy = new Date(d);
  const diff = (copy.getDay() + 6) % 7; // Mon=0 .. Sun=6
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

export const DAY_NAMES = ["hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"];
