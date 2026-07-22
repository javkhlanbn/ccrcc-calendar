import { useEffect, useState } from 'react';

/** Миллисекундыг "1 цаг 23 мин" хэлбэрт хөрвүүлнэ */
export const formatDuration = (ms: number, isMN: boolean): string => {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return isMN ? `${hours} цаг ${minutes} мин` : `${hours}h ${minutes}m`;
  if (minutes > 0) return isMN ? `${minutes} мин` : `${minutes}m`;
  return isMN ? `${seconds} сек` : `${seconds}s`;
};

/** Минутыг "1 цаг 23 мин" хэлбэрт хөрвүүлнэ */
export const formatMinutes = (totalMinutes: number, isMN: boolean): string => {
  const safe = Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.round(totalMinutes) : 0;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;

  if (hours > 0) return isMN ? `${hours} цаг ${minutes} мин` : `${hours}h ${minutes}m`;
  return isMN ? `${minutes} мин` : `${minutes}m`;
};

/**
 * Эхэлсэн цагаас хойш өнгөрсөн хугацааг секунд тутам шинэчилж буцаана.
 * startedAt байхгүй үед тоолуур ажиллахгүй.
 */
export const useElapsed = (startedAt?: string): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, now - start);
};
