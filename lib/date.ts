import { formatDistanceToNowStrict } from "date-fns";

export function formatRemainingTime(date: Date) {
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
