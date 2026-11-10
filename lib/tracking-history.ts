type EventTime = {
  occurredAt: Date | string | null;
  timeText: string | null;
  tieOrder: number;
};

function eventTimestamp(event: EventTime): number {
  if (event.occurredAt) {
    const instant = new Date(event.occurredAt).getTime();
    if (Number.isFinite(instant)) return instant;
  }

  // Some carriers supply only their local clock, with no timezone. Keep that
  // original text for display; use its calendar order without the host timezone.
  const localTime = event.timeText?.trim();
  if (!localTime || !/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(localTime)) return -Infinity;
  const isoTime = localTime.replace(" ", "T");
  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoTime) ? isoTime : `${isoTime}Z`);
  return Number.isFinite(timestamp) ? timestamp : -Infinity;
}

export function newestEventsFirst<T extends EventTime>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => eventTimestamp(b) - eventTimestamp(a) || b.tieOrder - a.tieOrder);
}
