import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Palmtree,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  FileSpreadsheet,
  Printer,
  Settings2,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format, parseISO, isValid } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { Modal } from '../components/ui/Modal';
import { LeaveRequest, LeaveStatus, UserProfile } from '../types';
import { countWorkingDays, computeLeaveBalance, validateLeaveRequest } from '../utils/leave';
import { cn } from '../lib/utils';

export const LeavePage: React.FC = () => {
  const {
    leaveRequests,
    leaveEntitlement,
    leaveYear,
    addLeaveRequest,
    updateLeaveStatus,
    deleteLeaveRequest,
    updateLeaveEntitlement,
    leaveEntitlementFor,
    updateUserLeaveEntitlement,
    profile,
    language,
  } = useAppContext();

  const isMN = language === 'MN';
  const t = (mn: string, en: string) => (isMN ? mn : en);
  const isAdmin = profile?.role === 'admin';

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
  const [activeTab, setActiveTab] = useState<'requests' | 'summary'>('requests');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ year: String(leaveYear), days: String(leaveEntitlement) });
  // Ажилтны хоног гараас засах (staff summary)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDaysValue, setEditDaysValue] = useState('');
  const [savingEntitlement, setSavingEntitlement] = useState(false);

  useEffect(() => {
    setSettingsForm({ year: String(leaveYear), days: String(leaveEntitlement) });
  }, [leaveYear, leaveEntitlement]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        const data = await res.json();
        setUsers((data as UserProfile[]).filter(u => u.status === 'approved'));
      } catch (error) {
        console.error('Users fetch error:', error);
      }
    };
    fetchUsers();
  }, [isAdmin]);

  // Нэвтэрсэн ажилтны өөрийн үлдэгдэл (өөрийн эрхтэй хоногоор)
  const myEntitlement = leaveEntitlementFor(profile?.uid || '');
  const myBalance = useMemo(
    () => computeLeaveBalance(leaveRequests, profile?.uid || '', leaveYear, myEntitlement),
    [leaveRequests, profile?.uid, leaveYear, myEntitlement]
  );

  const myRequests = useMemo(
    () =>
      leaveRequests
        .filter(r => r.userId === profile?.uid)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [leaveRequests, profile?.uid]
  );

  const visibleRequests = useMemo(() => {
    const base = isAdmin ? leaveRequests : myRequests;
    return base
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [isAdmin, leaveRequests, myRequests, statusFilter]);

  // Админд: ажилтан бүрийн ашигласан / үлдсэн хоног
  const staffSummary = useMemo(() => {
    return users
      .map(u => ({
        user: u,
        balance: computeLeaveBalance(leaveRequests, u.uid, leaveYear, leaveEntitlementFor(u.uid)),
      }))
      .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
  }, [users, leaveRequests, leaveYear, leaveEntitlementFor]);

  const formDays = countWorkingDays(form.startDate, form.endDate);
  const formError = form.startDate && form.endDate ? validateLeaveRequest(myBalance, formDays, isMN) : null;

  const openRequestModal = () => {
    setForm({ startDate: '', endDate: '', reason: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate) {
      alert(t('Амралт эхлэх болон дуусах огноог сонгоно уу.', 'Please select the start and end dates.'));
      return;
    }
    if (formError) {
      alert(formError);
      return;
    }

    setSaving(true);
    try {
      await addLeaveRequest(form);
      setIsModalOpen(false);
      setForm({ startDate: '', endDate: '', reason: '' });
    } catch (error: any) {
      alert(error?.message || t('Хүсэлт илгээх үед алдаа гарлаа.', 'Failed to submit the request.'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id: string, status: LeaveStatus) => {
    try {
      await updateLeaveStatus(id, status);
    } catch (error: any) {
      alert(error?.message || t('Төлөв шинэчлэх үед алдаа гарлаа.', 'Failed to update the status.'));
    }
  };

  const handleDelete = async (request: LeaveRequest) => {
    if (!confirm(t('Энэ хүсэлтийг устгах уу?', 'Delete this request?'))) return;
    try {
      await deleteLeaveRequest(request.id);
    } catch (error: any) {
      alert(error?.message || t('Устгах үед алдаа гарлаа.', 'Failed to delete.'));
    }
  };

  const startEditEntitlement = (userId: string, currentDays: number) => {
    setEditingUserId(userId);
    setEditDaysValue(String(currentDays));
  };

  const saveEntitlement = async () => {
    if (!editingUserId) return;
    const days = Number(editDaysValue);
    if (!Number.isFinite(days) || days < 0) {
      alert(t('Хоногийг зөв оруулна уу.', 'Please enter a valid number of days.'));
      return;
    }
    setSavingEntitlement(true);
    try {
      await updateUserLeaveEntitlement(editingUserId, leaveYear, days);
      setEditingUserId(null);
    } catch (error: any) {
      alert(error?.message || t('Хадгалах үед алдаа гарлаа.', 'Failed to save.'));
    } finally {
      setSavingEntitlement(false);
    }
  };

  // Тухайн ажилтны override-ийг арилгаж, глобал өгөгдмөл рүү буцаах
  const resetEntitlement = async (userId: string) => {
    setSavingEntitlement(true);
    try {
      await updateUserLeaveEntitlement(userId, leaveYear, null);
      setEditingUserId(null);
    } catch (error: any) {
      alert(error?.message || t('Хадгалах үед алдаа гарлаа.', 'Failed to save.'));
    } finally {
      setSavingEntitlement(false);
    }
  };

  const handleSaveSettings = async () => {
    const year = Number(settingsForm.year);
    const days = Number(settingsForm.days);
    if (!year || !Number.isFinite(days) || days < 0) {
      alert(t('Он болон хоногийг зөв оруулна уу.', 'Please enter a valid year and number of days.'));
      return;
    }
    try {
      await updateLeaveEntitlement(year, days);
      setIsSettingsOpen(false);
    } catch (error: any) {
      alert(error?.message || t('Хадгалах үед алдаа гарлаа.', 'Failed to save.'));
    }
  };

  const statusLabel = (status: LeaveStatus) => {
    if (status === 'Approved') return t('Батлагдсан', 'Approved');
    if (status === 'Rejected') return t('Татгалзсан', 'Rejected');
    return t('Хүлээгдэж байна', 'Pending');
  };

  const statusBadge = (status: LeaveStatus) => {
    const styles: Record<LeaveStatus, string> = {
      Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      Rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
      Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    };
    const icons: Record<LeaveStatus, React.ReactNode> = {
      Approved: <CheckCircle2 className="w-3 h-3" />,
      Rejected: <XCircle className="w-3 h-3" />,
      Pending: <Clock className="w-3 h-3" />,
    };
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap', styles[status])}>
        {icons[status]}
        {statusLabel(status)}
      </span>
    );
  };

  const fmtDate = (value: string) => {
    const d = parseISO(value);
    return isValid(d) ? format(d, 'yyyy-MM-dd') : value;
  };

  const handlePrint = () => window.print();

  const handleExportExcel = () => {
    const header = [
      t('Ажилтан', 'Employee'),
      t('Эхлэх', 'Start'),
      t('Дуусах', 'End'),
      t('Ажлын өдөр', 'Working days'),
      t('Тайлбар', 'Reason'),
      t('Төлөв', 'Status'),
      t('Он', 'Year'),
    ];
    const rows = visibleRequests.map(r => [
      r.userName,
      fmtDate(r.startDate),
      fmtDate(r.endDate),
      r.days,
      r.reason || '',
      statusLabel(r.status),
      r.year,
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 18 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, t('Хүсэлтүүд', 'Requests'));

    // Ажилтан бүрийн нэгтгэлийг админд хоёр дахь хуудсаар нэмнэ
    if (isAdmin && staffSummary.length > 0) {
      const sumHeader = [
        t('Ажилтан', 'Employee'),
        t('Хэлтэс', 'Department'),
        t('Нийт эрх', 'Entitlement'),
        t('Ашигласан', 'Used'),
        t('Хүлээгдэж буй', 'Pending'),
        t('Үлдсэн', 'Remaining'),
        t('Хэдэн удаа', 'Times used'),
      ];
      const sumRows = staffSummary.map(({ user, balance }) => [
        user.displayName,
        user.department,
        balance.entitlement,
        balance.used,
        balance.pending,
        balance.remaining,
        `${balance.usageCount}/${balance.maxSplits}`,
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([sumHeader, ...sumRows]);
      ws2['!cols'] = [{ wch: 26 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, t('Нэгтгэл', 'Summary'));
    }

    XLSX.writeFile(wb, `leave-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const balanceCards = [
    {
      label: t('Нийт эрхтэй', 'Entitlement'),
      value: `${myBalance.entitlement}`,
      suffix: t('ажлын өдөр', 'working days'),
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      icon: CalendarDays,
    },
    {
      label: t('Ашигласан', 'Used'),
      value: `${myBalance.used}`,
      suffix: t('ажлын өдөр', 'working days'),
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      icon: CheckCircle2,
    },
    {
      label: t('Үлдсэн', 'Remaining'),
      value: `${myBalance.remaining}`,
      suffix: t('ажлын өдөр', 'working days'),
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      icon: Palmtree,
    },
    {
      label: t('Ашигласан удаа', 'Times used'),
      value: `${myBalance.usageCount}/${myBalance.maxSplits}`,
      suffix: t('хэсэг', 'parts'),
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
      icon: Clock,
    },
  ];

  const canRequest =
    myBalance.usageCount < myBalance.maxSplits && myBalance.remaining > 0 && profile?.status === 'approved';

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-3">
            <Palmtree className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
            {t('Ээлжийн амралт', 'Annual Leave')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t(
              `${leaveYear} онд ажилтан бүр ${myBalance.entitlement} ажлын өдрийн амралт эдлэх эрхтэй (хамгийн ихдээ ${myBalance.maxSplits} хэсэг).`,
              `In ${leaveYear} each employee is entitled to ${myBalance.entitlement} working days (max ${myBalance.maxSplits} parts).`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              {t('Амралтын эрх', 'Entitlement')}
            </button>
          )}
          <button
            onClick={handleExportExcel}
            disabled={visibleRequests.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t('Excel татах', 'Export Excel')}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            {t('PDF / Хэвлэх', 'PDF / Print')}
          </button>
          <button
            onClick={openRequestModal}
            disabled={!canRequest}
            title={!canRequest ? t('Амралтын эрх дууссан байна.', 'No leave entitlement left.') : undefined}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {t('Амралт хүсэх', 'Request leave')}
          </button>
        </div>
      </header>

      {/* Хэвлэх үеийн гарчиг */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">
          {t(`${leaveYear} оны ээлжийн амралтын тайлан`, `${leaveYear} Annual Leave Report`)}
        </h1>
      </div>

      {/* Өөрийн үлдэгдэл */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {balanceCards.map(card => (
          <div key={card.label} className="card flex items-center gap-3">
            <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', card.bg, card.color)}>
              <card.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">{card.label}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-50">{card.value}</p>
              <p className="text-[11px] text-slate-400 truncate">{card.suffix}</p>
            </div>
          </div>
        ))}
      </div>

      {myBalance.pending > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 print:hidden">
          {t(
            `${myBalance.pending} ажлын өдөр батлагдахыг хүлээж байна. Энэ хоног үлдэгдлээс урьдчилан хасагдсан.`,
            `${myBalance.pending} working days are awaiting approval and are already reserved from your balance.`
          )}
        </p>
      )}

      {/* Админы таб */}
      {isAdmin && (
        <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1 w-fit print:hidden">
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
              activeTab === 'requests' ? 'bg-slate-100 dark:bg-slate-800 text-primary' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            <CalendarDays className="w-4 h-4" />
            {t('Хүсэлтүүд', 'Requests')} ({leaveRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
              activeTab === 'summary' ? 'bg-slate-100 dark:bg-slate-800 text-primary' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            <UsersIcon className="w-4 h-4" />
            {t('Ажилтны нэгтгэл', 'Staff summary')}
          </button>
        </div>
      )}

      {(!isAdmin || activeTab === 'requests') && (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {(['all', 'Pending', 'Approved', 'Rejected'] as const).map(key => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                  statusFilter === key ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                )}
              >
                {key === 'all' ? t('Бүгд', 'All') : statusLabel(key)}
              </button>
            ))}
          </div>

          <div className="card p-0 overflow-x-auto">
            {visibleRequests.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                <Palmtree className="w-10 h-10 opacity-30" />
                <p className="text-sm">{t('Амралтын хүсэлт байхгүй байна', 'No leave requests')}</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    {isAdmin && (
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Ажилтан', 'Employee')}</th>
                    )}
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Эхлэх', 'Start')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Дуусах', 'End')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">{t('Ажлын өдөр', 'Days')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Тайлбар', 'Reason')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Төлөв', 'Status')}</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right print:hidden">
                      {t('Үйлдэл', 'Actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleRequests.map(request => (
                    <tr key={request.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      {isAdmin && (
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {request.userName}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtDate(request.startDate)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtDate(request.endDate)}</td>
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{request.days}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[240px]">
                        <span className="line-clamp-2 break-words">{request.reason || '-'}</span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(request.status)}</td>
                      <td className="px-4 py-3 text-right print:hidden">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && request.status !== 'Approved' && (
                            <button
                              onClick={() => handleStatus(request.id, 'Approved')}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                              title={t('Батлах', 'Approve')}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && request.status !== 'Rejected' && (
                            <button
                              onClick={() => handleStatus(request.id, 'Rejected')}
                              className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                              title={t('Татгалзах', 'Reject')}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {(isAdmin || (request.userId === profile?.uid && request.status === 'Pending')) && (
                            <button
                              onClick={() => handleDelete(request)}
                              className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title={t('Устгах', 'Delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {isAdmin && activeTab === 'summary' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Ажилтан', 'Employee')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Хэлтэс', 'Department')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">{t('Нийт эрх', 'Entitlement')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Ашигласан', 'Used')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">{t('Хүлээгдэж буй', 'Pending')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">{t('Үлдсэн', 'Remaining')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">{t('Хэдэн удаа', 'Times')}</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right whitespace-nowrap">{t('Хоног тохируулах', 'Set days')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {staffSummary.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                    {t('Ажилтан олдсонгүй', 'No employees found')}
                  </td>
                </tr>
              ) : (
                staffSummary.map(({ user, balance }) => {
                  const isCustom = leaveEntitlementFor(user.uid) !== leaveEntitlement;
                  const isEditing = editingUserId === user.uid;
                  return (
                    <tr key={user.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{user.displayName}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{user.department}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <span className="font-bold">{balance.entitlement}</span>
                        {isCustom && (
                          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {t('тусгай', 'custom')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">{balance.used}</td>
                      <td className="px-4 py-3 text-slate-500">{balance.pending}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{balance.remaining}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {balance.usageCount}/{balance.maxSplits}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={editDaysValue}
                              autoFocus
                              onChange={e => setEditDaysValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEntitlement(); if (e.key === 'Escape') setEditingUserId(null); }}
                              className="input-field w-20 py-1.5 text-sm"
                            />
                            <button
                              onClick={saveEntitlement}
                              disabled={savingEntitlement}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title={t('Хадгалах', 'Save')}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            {isCustom && (
                              <button
                                onClick={() => resetEntitlement(user.uid)}
                                disabled={savingEntitlement}
                                className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                                title={t('Өгөгдмөл рүү буцаах', 'Reset to default')}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditEntitlement(user.uid, balance.entitlement)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            {t('Засах', 'Edit')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Амралт хүсэх Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('Амралт хүсэх', 'Request Leave')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Эхлэх огноо', 'Start date')}</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Дуусах огноо', 'End date')}</label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t('Ажлын өдрийн тоо', 'Working days')}</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{formDays}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t('Одоогийн үлдэгдэл', 'Current balance')}</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{myBalance.remaining}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">{t('Ашигласан удаа', 'Times used')}</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {myBalance.usageCount}/{myBalance.maxSplits}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 pt-1">
              {t('Бямба, ням гарагийг тооцохгүй.', 'Weekends are not counted.')}
            </p>
          </div>

          {formError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-900/20 p-2 rounded-lg">
              {formError}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {t('Тайлбар (сонголтоор)', 'Reason (optional)')}
            </label>
            <textarea
              value={form.reason}
              onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
              className="input-field h-20 resize-none"
              placeholder={t('Шалтгаан, нэмэлт тайлбар...', 'Reason or extra notes...')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('Цуцлах', 'Cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !!formError || formDays <= 0}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? t('Илгээж байна...', 'Submitting...') : t('Хүсэлт илгээх', 'Submit request')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Амралтын эрх тохируулах (админ) */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title={t('Жилийн амралтын эрх', 'Annual Entitlement')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Он', 'Year')}</label>
              <input
                type="number"
                value={settingsForm.year}
                onChange={e => setSettingsForm(prev => ({ ...prev, year: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Ажлын өдөр', 'Working days')}</label>
              <input
                type="number"
                min="0"
                value={settingsForm.days}
                onChange={e => setSettingsForm(prev => ({ ...prev, days: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            {t(
              'Энэ тохиргоо тухайн оны бүх ажилтанд үйлчилнэ. Анхдагч утга нь 15 ажлын өдөр.',
              'This applies to all employees for that year. The default is 15 working days.'
            )}
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('Цуцлах', 'Cancel')}
            </button>
            <button
              onClick={handleSaveSettings}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
            >
              {t('Хадгалах', 'Save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
