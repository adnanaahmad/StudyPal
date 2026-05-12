export const isoToday = (): string => new Date().toISOString().slice(0, 10);

const MAX_ALLOWED_PAST_DAYS = 0;

const parseISODate = (value: string): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const daysBetween = (fromISO: string, toISO: string): number => {
  const from = new Date(`${fromISO}T00:00:00.000Z`).getTime();
  const to = new Date(`${toISO}T00:00:00.000Z`).getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
};

const shiftISODate = (iso: string, days: number): string => {
  const base = new Date(`${iso}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/**
 * Normalize incoming agent/user date values into planner-safe YYYY-MM-DD.
 * - Invalid dates become today.
 * - Extremely stale dates (older than 30 days) are treated as likely hallucinations.
 */
export const normalizePlannerDate = (raw: string, todayISO = isoToday()): string => {
  const parsed = parseISODate(raw);
  if (!parsed) return todayISO;
  const normalized = parsed.toISOString().slice(0, 10);
  const ageInDays = daysBetween(normalized, todayISO);
  if (ageInDays > MAX_ALLOWED_PAST_DAYS) return todayISO;
  return normalized;
};

const isStalePlannerDate = (raw: string, todayISO: string): boolean => {
  const parsed = parseISODate(raw);
  if (!parsed) return false;
  const normalized = parsed.toISOString().slice(0, 10);
  return daysBetween(normalized, todayISO) > MAX_ALLOWED_PAST_DAYS;
};

/**
 * Resolve a task date while keeping schedules usable:
 * - Valid modern dates are kept as-is.
 * - Very stale hallucinated dates are remapped to the next free day starting today,
 *   so a weekly plan does not collapse into the same date repeatedly.
 */
export const resolvePlannerTaskDate = (
  raw: string,
  existingDates: string[],
  todayISO = isoToday(),
): string => {
  const normalized = normalizePlannerDate(raw, todayISO);
  if (!isStalePlannerDate(raw, todayISO)) return normalized;
  const occupied = new Set(existingDates);
  let offset = 0;
  while (offset < 365) {
    const candidate = shiftISODate(todayISO, offset);
    if (!occupied.has(candidate)) return candidate;
    offset += 1;
  }
  return normalized;
};

