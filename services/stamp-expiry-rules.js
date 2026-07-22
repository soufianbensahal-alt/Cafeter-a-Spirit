export const STAMP_REQUEST_DURATION_SECONDS = 90;

export function formatStampCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, '0')} min ${String(remainder).padStart(2, '0')} s`;
  }
  if (minutes > 0) {
    return `${minutes} min ${String(remainder).padStart(2, '0')} s`;
  }
  return `${remainder} s`;
}
