import { round } from "../math";

export function getTodayUTC() {
  const currentDate = toUTC(new Date());
  currentDate.setUTCHours(0, 0, 0, 0);

  return currentDate;
}

export function toUTC(date: Date) {
  const now_utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());

  return new Date(now_utc);
}

export function getPrettyTime(timeMs: number): string {
  if (timeMs < 10) {
    return `${round(timeMs, 2)}ms`;
  } else if (timeMs < 1_000) {
    return `${round(timeMs, 0)}ms`;
  } else if (timeMs < 60 * 1_000) {
    return `${round(timeMs / 1_000, 2)}s`;
  } else if (timeMs < 60 * 60 * 1_000) {
    return `${Math.floor(timeMs / 1_000 / 60)}m ${Math.round((timeMs / 1000) % 60)}s`;
  } else {
    return `${Math.floor(timeMs / 1_000 / 60 / 60)}h ${Math.floor(timeMs / 1_000 / 60) % 60}m`;
  }
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
function toISODateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
export function normalizeInputToISO(input: string | undefined, kind: "start" | "end"): string | undefined {
  if (!input) return undefined;
  if (DATE_ONLY_RE.test(input)) {
    if (kind === "start") {
      return toISODateOnly(input).toISOString();
    } else {
      const d = toISODateOnly(input);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString();
    }
  }
  const dt = new Date(input);
  if (isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}


