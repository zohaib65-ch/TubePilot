/** Calendar day ("YYYY-MM-DD") for a date in the given IANA timezone. */
export function dayKey(timezone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatDateTime(date: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimezone(timezone) ? timezone : "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
