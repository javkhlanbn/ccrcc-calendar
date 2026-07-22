import { addDays, addMonths, format, parseISO, isValid } from 'date-fns';
import { MeetingRecurrence, MeetingType } from '../types';

// Давтагдах хурлын дээд тоо ба хугацааны хязгаар (хэт олон бичлэг үүсгэхээс сэргийлнэ)
const MAX_OCCURRENCES = 30;
const HORIZON_MONTHS = 12;

export const recurrenceOptions: { value: MeetingRecurrence; mn: string; en: string }[] = [
  { value: 'none', mn: 'Ээлжит бус', en: 'One-time' },
  { value: 'daily', mn: 'Өдөр дутам', en: 'Daily' },
  { value: 'every3days', mn: '3 хоног тутам', en: 'Every 3 days' },
  { value: 'every5days', mn: '5 хоног тутам', en: 'Every 5 days' },
  { value: 'weekly', mn: '7 хоног тутам', en: 'Weekly' },
  { value: 'every14days', mn: '14 хоног тутам', en: 'Every 14 days' },
  { value: 'every21days', mn: '21 хоног тутам', en: 'Every 21 days' },
  { value: 'monthly', mn: 'Сар тутам', en: 'Monthly' },
  { value: 'quarterly', mn: 'Улирал тутам', en: 'Quarterly' },
];

export const meetingTypeOptions: { value: MeetingType; mn: string; en: string }[] = [
  { value: 'inperson', mn: 'Танхимын хурал', en: 'In-person' },
  { value: 'online', mn: 'Цахим хурал', en: 'Online' },
];

export const recurrenceLabel = (r: MeetingRecurrence | undefined, isMN: boolean) =>
  recurrenceOptions.find(o => o.value === (r || 'none'))?.[isMN ? 'mn' : 'en'] || '';

export const meetingTypeLabel = (m: MeetingType | undefined, isMN: boolean) =>
  meetingTypeOptions.find(o => o.value === m)?.[isMN ? 'mn' : 'en'] || '';

// "HH:mm" + минут → "HH:mm" (шөнө дунд давбал 23:59-д тайрна)
export const addMinutesToTime = (time: string, minutes: number): string => {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return '';
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + (Number(minutes) || 0), 23 * 60 + 59);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
};

// Түгээмэл үргэлжлэх хугацаанууд (минутаар)
export const durationOptions = [15, 30, 45, 60, 90, 120, 150, 180, 240];

export const durationLabel = (minutes: number, isMN: boolean): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return isMN ? `${h} цаг ${m} мин` : `${h}h ${m}m`;
  if (h > 0) return isMN ? `${h} цаг` : `${h}h`;
  return isMN ? `${m} мин` : `${m}m`;
};

// Давтамжийн дагуу хурлын өдрүүдийг (yyyy-MM-dd) үүсгэнэ
export const generateOccurrenceDates = (startDate: string, recurrence: MeetingRecurrence): string[] => {
  const start = parseISO(startDate);
  if (!isValid(start)) return [];
  if (recurrence === 'none') return [startDate];

  const stepDays: Record<string, number> = {
    daily: 1,
    every3days: 3,
    every5days: 5,
    weekly: 7,
    every14days: 14,
    every21days: 21,
  };

  const horizon = addMonths(start, HORIZON_MONTHS);
  const dates: string[] = [];
  let cursor = start;

  while (dates.length < MAX_OCCURRENCES && cursor <= horizon) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    if (recurrence === 'monthly') cursor = addMonths(cursor, 1);
    else if (recurrence === 'quarterly') cursor = addMonths(cursor, 3);
    else cursor = addDays(cursor, stepDays[recurrence] || 1);
  }

  return dates;
};
