import { RecurrenceFrequency } from '@prisma/client';

export function nextOccurrence(date: Date, frequency: RecurrenceFrequency, interval = 1) {
  const next = new Date(date);
  if (frequency === 'DAILY') next.setUTCDate(next.getUTCDate() + interval);
  if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7 * interval);
  if (frequency === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + interval);
  if (frequency === 'QUARTERLY') next.setUTCMonth(next.getUTCMonth() + 3 * interval);
  if (frequency === 'YEARLY') next.setUTCFullYear(next.getUTCFullYear() + interval);
  return next;
}
