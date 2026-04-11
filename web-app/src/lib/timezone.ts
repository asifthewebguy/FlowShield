/**
 * Returns the hour (0–23) of a UTC Date in the given IANA timezone.
 * Handles the edge case where some environments return "24" for midnight.
 */
export function getLocalHour(date: Date, timezone: string): number {
  const hourStr = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(hourStr, 10);
  if (isNaN(hour)) {
    throw new RangeError(`getLocalHour: unexpected format from toLocaleString for timezone "${timezone}"`);
  }
  return hour === 24 ? 0 : hour;
}

/**
 * Returns the date as a YYYY-MM-DD string in the given IANA timezone.
 * Uses en-CA locale because it produces ISO-style date strings natively.
 */
export function getLocalDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}
