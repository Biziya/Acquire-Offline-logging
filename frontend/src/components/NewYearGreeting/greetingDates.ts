import type { MonthDay } from "./config";

const toNumber = ({ month, day }: MonthDay) => month * 100 + day;

// True when today falls in the window (both days included). A window whose
// end comes before its start crosses the year end.
export function isInWindow(today: Date, start: MonthDay, end: MonthDay) {
  const now = toNumber({ month: today.getMonth() + 1, day: today.getDate() });
  const from = toNumber(start);
  const to = toNumber(end);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

// The year being welcomed: next year from October on, this year before.
export function greetingYear(today: Date) {
  return today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();
}
