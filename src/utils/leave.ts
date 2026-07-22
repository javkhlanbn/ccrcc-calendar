import { LeaveBalance, LeaveRequest, MAX_LEAVE_SPLITS } from '../types';

/**
 * Хоёр огнооны хоорондох АЖЛЫН өдрийн тоо (эхлэх/дуусах өдрийг оруулж тооцно).
 * Бямба, ням гарагийг тооцохгүй.
 */
export const countWorkingDays = (startDate: string, endDate: string): number => {
  if (!startDate || !endDate) return 0;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/** Тухайн хэрэглэгчийн тухайн жилийн амралтын хүсэлтүүд (татгалзсаныг тооцохгүй) */
export const activeLeaveRequests = (requests: LeaveRequest[], userId: string, year: number) =>
  requests.filter(r => r.userId === userId && r.year === year && r.status !== 'Rejected');

/**
 * Үлдэгдлийг тооцно. Хүлээгдэж буй хүсэлтийг мөн "нөөцөлсөн"-д тооцож,
 * ажилтан эрхээсээ хэтрүүлж захиалахаас сэргийлнэ.
 */
export const computeLeaveBalance = (
  requests: LeaveRequest[],
  userId: string,
  year: number,
  entitlement: number
): LeaveBalance => {
  const active = activeLeaveRequests(requests, userId, year);
  const approved = active.filter(r => r.status === 'Approved').reduce((sum, r) => sum + (Number(r.days) || 0), 0);
  const pending = active.filter(r => r.status === 'Pending').reduce((sum, r) => sum + (Number(r.days) || 0), 0);

  return {
    entitlement,
    approved,
    pending,
    used: approved,
    remaining: Math.max(0, entitlement - approved - pending),
    usageCount: active.length,
    maxSplits: MAX_LEAVE_SPLITS,
  };
};

/**
 * Шинэ хүсэлт дүрэмд нийцэж байгаа эсэх. Алдаагүй бол null буцаана.
 * Клиент талд урьдчилан шалгахад ашиглана (сервер талд мөн адил шалгагдана).
 */
export const validateLeaveRequest = (
  balance: LeaveBalance,
  days: number,
  isMN: boolean
): string | null => {
  if (days <= 0) {
    return isMN
      ? 'Сонгосон хугацаанд ажлын өдөр байхгүй байна. Огноогоо шалгана уу.'
      : 'The selected range contains no working days. Please check the dates.';
  }

  if (balance.usageCount >= balance.maxSplits) {
    return isMN
      ? `Амралтаа хамгийн ихдээ ${balance.maxSplits} хэсэг болгон хуваах боломжтой. Та аль хэдийн ${balance.usageCount} удаа авсан байна.`
      : `Leave can be split into at most ${balance.maxSplits} parts. You have already used ${balance.usageCount}.`;
  }

  if (days > balance.remaining) {
    return isMN
      ? `Үлдсэн амралт ${balance.remaining} ажлын өдөр байна. ${days} өдөр авах боломжгүй.`
      : `You have ${balance.remaining} working days left, so ${days} days cannot be requested.`;
  }

  return null;
};
