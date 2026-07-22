import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Filter,
  MoreHorizontal,
  Calendar as CalendarIcon,
  Clock,
  Tag,
  AlertCircle,
  Flame
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  parseISO,
  eachDayOfInterval,
  differenceInCalendarDays,
  startOfDay
} from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Event, EventAttachment, EventCategory, UserProfile, Task } from '../types';
import { cn } from '../lib/utils';

export const Calendar: React.FC = () => {
  const { events, tasks, language, addEvent, updateEvent, deleteEvent, profile } = useAppContext();
  const t = translations[language];
  const isAdmin = profile?.role === 'admin';
  // Хурлыг ЗӨВХӨН "Хурал" цэснээс нэмнэ — хуанли дээр хурал үүсгэхийг больсон.
  // Тиймээс зөвхөн админ л хуанли дээр арга хэмжээ нэмж/засна.
  const isMeetingOnly = !isAdmin && (profile?.permissions || []).includes('meeting');
  const canManageEvents = isAdmin;
  const projectOptions = ['peatland', 'btr1', 'btr2', 'unido'];
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isYearOverview, setIsYearOverview] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isVisibleUsersOpen, setIsVisibleUsersOpen] = useState(false);
  const [visibleUsersDeptFilter, setVisibleUsersDeptFilter] = useState<string>('all');
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<EventCategory | 'all'>('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const departments = [
    { key: 'Захиргаа, санхүүгийн хэлтэс', label: 'Захиргаа' },
    { key: 'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс', label: 'Төсөл' },
    { key: 'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс', label: 'Судалгаа' },
    { key: 'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс', label: 'МК' },
  ];

  // Form state
  const [formData, setFormData] = useState<Partial<Event>>({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
    category: 'Project',
    priority: 'Medium',
    projectId: 'peatland',
    tags: [],
    attachments: [],
    visibleToUserIds: [],
  });
  const isReadOnlyEventView = isEditMode && !(isAdmin || (isMeetingOnly && selectedEvent?.category === 'Meeting'));
  const selectedVisibleCount = (formData.visibleToUserIds || []).length;
  const totalVisibleUsers = users.length;
  const isAllVisibleSelected = totalVisibleUsers > 0 && selectedVisibleCount === totalVisibleUsers;
  const isBirthdayCategory = formData.category === 'Birthday';

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers((data as UserProfile[]).filter(user => user.role === 'user' || user.role === 'admin'));
      } catch (error) {
        console.error('Users fetch error:', error);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    if (formData.category !== 'Birthday' || users.length === 0) return;

    const allUserIds = users.map(user => user.uid);

    setFormData(prev => {
      const current = prev.visibleToUserIds || [];
      const alreadyAllSelected = current.length === allUserIds.length && allUserIds.every(id => current.includes(id));

      if (alreadyAllSelected) return prev;

      return {
        ...prev,
        title: '',
        description: '',
        visibleToUserIds: allUserIds,
      };
    });
  }, [formData.category, users]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('File унших үед алдаа гарлаа'));
      reader.readAsDataURL(file);
    });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const handleDayClick = (day: Date) => {
    if (!canManageEvents) return;
    setFormData({
      ...formData,
      date: format(day, 'yyyy-MM-dd'),
      ...(isMeetingOnly ? { category: 'Meeting' as EventCategory, time: formData.time || '09:00' } : {}),
    });
    setIsEditMode(false);
    setIsVisibleUsersOpen(false);
    setIsModalOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, event: Event) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setFormData(event);
    setIsEditMode(true);
    setIsVisibleUsersOpen(false);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!canManageEvents) return;
    if (isReadOnlyEventView) return;

    if (isMeetingOnly && formData.category !== 'Meeting') {
      alert(language === 'MN' ? 'Та зөвхөн шуурхай хурал нэмэх эрхтэй.' : 'You can only add urgent meetings.');
      return;
    }

    if (formData.category === 'Birthday' && !formData.birthdayUserId) {
      alert(language === 'MN' ? 'Төрсөн өдрийн хэрэглэгчийг сонгоно уу.' : 'Please select the birthday user.');
      return;
    }

    if (formData.category === 'Meeting' && !formData.time) {
      alert(language === 'MN' ? 'Шуурхай хурлын цагийг заавал оруулна уу.' : 'Please set the time for the urgent meeting.');
      return;
    }

    const visibleToUserIds = formData.category === 'Birthday'
      ? users.map(user => user.uid)
      : (formData.visibleToUserIds || []);

    const payload: Event = {
      ...formData,
      priority: formData.priority || 'Medium',
      time: formData.time || undefined,
      birthdayUserId: formData.category === 'Birthday' ? formData.birthdayUserId : undefined,
      visibleToUserIds,
    } as Event;

    try {
      if (isEditMode && selectedEvent) {
        await updateEvent(payload);
      } else {
        await addEvent({
          ...payload,
          id: Math.random().toString(36).substr(2, 9),
        } as Event);
      }

      setIsModalOpen(false);
      setFormData({
        title: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '',
        category: 'Project',
        priority: 'Medium',
        birthdayUserId: undefined,
        projectId: 'peatland',
        tags: [],
        attachments: [],
        visibleToUserIds: [],
      });
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Арга хэмжээ хадгалах үед алдаа гарлаа.' : 'Failed to save event.'));
      console.error('Event save error:', error);
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    try {
      const uploaded: EventAttachment[] = [];

      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);

        uploaded.push({
          id: Math.random().toString(36).slice(2, 11),
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
        });
      }

      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...uploaded],
      }));
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Файл оруулах үед алдаа гарлаа.' : 'Failed to upload file.'));
      console.error('Attachment upload error:', error);
    } finally {
      e.target.value = '';
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setFormData(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(item => item.id !== attachmentId),
    }));
  };

  const toggleVisibleUser = (userId: string) => {
    const selected = formData.visibleToUserIds || [];
    const next = selected.includes(userId)
      ? selected.filter(id => id !== userId)
      : [...selected, userId];

    setFormData({
      ...formData,
      visibleToUserIds: next,
    });
  };

  const toggleAllVisibleUsers = () => {
    const filteredUsers = visibleUsersDeptFilter === 'all'
      ? users
      : users.filter(u => u.department === visibleUsersDeptFilter);
    const filteredIds = filteredUsers.map(u => u.uid);
    const current = formData.visibleToUserIds || [];
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => current.includes(id));
    setFormData({
      ...formData,
      visibleToUserIds: allFilteredSelected
        ? current.filter(id => !filteredIds.includes(id))
        : [...new Set([...current, ...filteredIds])],
    });
  };

  const handleDelete = async () => {
    if (!canManageEvents) return;

    if (!selectedEvent) return;

    try {
      await deleteEvent(selectedEvent.id);
      setIsModalOpen(false);
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Арга хэмжээ устгах үед алдаа гарлаа.' : 'Failed to delete event.'));
      console.error('Event delete error:', error);
    }
  };

  const getEventColor = (category: EventCategory) => {
    switch (category) {
      case 'Project': return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      case 'Environmental': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'Internal': return 'bg-slate-500/10 text-slate-600 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800';
      case 'Birthday': return 'bg-pink-500/10 text-pink-600 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800';
      case 'Meeting': return 'bg-red-500/10 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'Report': return 'bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getDayCategoryColor = (dayEvents: Event[]) => {
    if (dayEvents.length === 0) return '';

    const priorityOrder: EventCategory[] = ['Meeting', 'Report', 'Birthday', 'Project', 'Environmental', 'Internal'];
    const prioritizedCategory = priorityOrder.find(category =>
      dayEvents.some(event => event.category === category)
    );

    switch (prioritizedCategory) {
      case 'Project':
        return 'font-bold bg-blue-500/20 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'Environmental':
        return 'font-bold bg-emerald-500/20 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'Internal':
        return 'font-bold bg-slate-400/20 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200';
      case 'Birthday':
        return 'font-bold bg-pink-500/20 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300';
      case 'Meeting':
        return 'font-bold bg-red-500/20 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      case 'Report':
        return 'font-bold bg-amber-500/20 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      default:
        return 'font-bold bg-primary/20 text-primary dark:bg-primary/30';
    }
  };

  const getEventDisplayLabel = (event: Event) => {
    if (event.category === 'Meeting') {
      return event.time ? `🕐 ${event.time} ${event.title}` : event.title;
    }

    if (event.category !== 'Birthday') return event.title;

    const birthdayUser = users.find(user => user.uid === event.birthdayUserId);
    return `🎂 ${birthdayUser?.displayName || event.title}`;
  };

  const getUrgencyLevel = (day: Date) => {
    const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
    if (dayEvents.length === 0) return null;

    const daysUntil = differenceInCalendarDays(startOfDay(day), startOfDay(new Date()));

    if (daysUntil === 0) return 'today';

    // Тайлан мэдээ: 14 хоногийн өмнөөс гал, 1 сарын өмнөөс цаг харагдана
    const hasReport = dayEvents.some(e => e.category === 'Report');
    if (hasReport && daysUntil >= 1) {
      if (daysUntil <= 14) return 'high';
      if (daysUntil <= 31) return 'medium';
    }

    if (daysUntil >= 1 && daysUntil <= 3) return 'high';
    if (daysUntil >= 4 && daysUntil <= 7) return 'medium';
    return null;
  };

  const monthLabel =
    language === 'MN'
      ? `${format(currentDate, 'yyyy')} ${format(currentDate, 'M')} сар`
      : format(currentDate, 'MMMM yyyy');

  const categoryOptions: { value: EventCategory; label: string }[] = [
    { value: 'Project', label: t.project },
    { value: 'Environmental', label: t.environmental },
    { value: 'Internal', label: t.internal },
    { value: 'Birthday', label: t.birthday },
    { value: 'Meeting', label: language === 'MN' ? 'Шуурхай хурал' : 'Urgent Meeting' },
    { value: 'Report', label: language === 'MN' ? 'Тайлан мэдээ' : 'Report' },
  ];

  const getCategoryLabel = (category: EventCategory) =>
    categoryOptions.find(option => option.value === category)?.label || category;

  const isFilterActive = filterFrom !== '' && filterTo !== '';
  const filteredRangeEvents = isFilterActive
    ? events
        .filter(e => {
          const eventDay = startOfDay(parseISO(e.date));
          const fromDay = startOfDay(parseISO(filterFrom));
          const toDay = startOfDay(parseISO(filterTo));
          if (eventDay < fromDay || eventDay > toDay) return false;
          return filterCategory === 'all' || e.category === filterCategory;
        })
        .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
    : [];

  const yearMonths = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthDate = new Date(currentDate.getFullYear(), monthIndex, 1);
    const miniMonthStart = startOfMonth(monthDate);
    const miniMonthEnd = endOfMonth(miniMonthStart);
    const miniStartDate = startOfWeek(miniMonthStart);
    const miniEndDate = endOfWeek(miniMonthEnd);
    const miniDays = eachDayOfInterval({ start: miniStartDate, end: miniEndDate });
    const monthEventCount = events.filter(e => isSameMonth(parseISO(e.date), monthDate)).length;

    return {
      monthDate,
      miniMonthStart,
      miniDays,
      monthEventCount,
    };
  });

  return (
    <div className="space-y-6 min-h-full flex flex-col">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.calendar}</h1>
          <p className="text-2xl font-extrabold text-primary mt-1 tracking-tight">
            {isYearOverview
              ? (language === 'MN' ? `${format(currentDate, 'yyyy')} он` : format(currentDate, 'yyyy'))
              : monthLabel}
          </p>
          {!canManageEvents && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {language === 'MN' ? 'Зөвхөн админ хэрэглэгч арга хэмжээ нэмэх, засах, устгах эрхтэй.' : 'Only admins can create, edit, and delete events.'}
            </p>
          )}
          {isMeetingOnly && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {language === 'MN' ? "Хурлыг \"Хурал\" цэснээс нэмнэ үү." : 'Please add meetings from the "Meeting" menu.'}
            </p>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              {t.today}
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setIsYearOverview(!isYearOverview)}
            className="px-4 py-2 text-sm font-semibold bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isYearOverview
              ? (language === 'MN' ? 'Сар харах' : 'Month view')
              : (language === 'MN' ? 'Томоор харах' : 'Year view')}
          </button>
          {canManageEvents && (
            <button
              onClick={() => {
                if (isMeetingOnly) {
                  setFormData(prev => ({ ...prev, category: 'Meeting', time: prev.time || '09:00' }));
                }
                setIsEditMode(false);
                setIsVisibleUsersOpen(false);
                setIsModalOpen(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">{t.addEvent}</span>
            </button>
          )}
        </div>
      </header>

      {/* Category / date range filter */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
            <Filter className="w-4 h-4 text-primary" />
            {language === 'MN' ? 'Ангиллаар шүүх' : 'Filter by category'}
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">{t.category}</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as EventCategory | 'all')}
              className="input-field py-2 text-sm"
            >
              <option value="all">{language === 'MN' ? 'Бүх ангилал' : 'All categories'}</option>
              {categoryOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">{language === 'MN' ? 'Эхлэх өдөр' : 'From'}</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="input-field py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase">{language === 'MN' ? 'Дуусах өдөр' : 'To'}</label>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="input-field py-2 text-sm"
            />
          </div>
          {(isFilterActive || filterCategory !== 'all') && (
            <button
              onClick={() => {
                setFilterCategory('all');
                setFilterFrom('');
                setFilterTo('');
              }}
              className="px-3 py-2 text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {language === 'MN' ? 'Цэвэрлэх' : 'Clear'}
            </button>
          )}
        </div>
      </div>

      {/* Calendar + results side by side */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 flex flex-col">
      {/* Calendar Grid */}
      {isYearOverview ? (
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 overflow-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {yearMonths.map(({ monthDate, miniMonthStart, miniDays, monthEventCount }) => (
              <button
                key={monthDate.toISOString()}
                onClick={() => {
                  setCurrentDate(monthDate);
                  setIsYearOverview(false);
                }}
                className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-2">
                  {language === 'MN'
                    ? `${format(monthDate, 'M')} сар (${monthEventCount})`
                    : `${format(monthDate, 'MMMM')} (${monthEventCount})`}
                </div>
                <div className="grid grid-cols-7 gap-1 relative" onMouseLeave={() => setHoveredDayKey(null)}>
                  {miniDays.map((day) => {
                    const dayKey = `${monthDate.getMonth()}-${day.toISOString()}`;
                    const isMiniCurrentMonth = isSameMonth(day, miniMonthStart);
                    const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
                    const hasEvent = dayEvents.length > 0;
                    const urgencyLevel = getUrgencyLevel(day);
                    const isHoveredDay = hoveredDayKey === dayKey;

                    return (
                      <span
                        key={dayKey}
                        onMouseEnter={() => {
                          if (!isMiniCurrentMonth || dayEvents.length === 0) {
                            setHoveredDayKey(null);
                            return;
                          }

                          setHoveredDayKey(dayKey);
                        }}
                        className={cn(
                          "h-5 w-5 text-[10px] rounded flex items-center justify-center relative",
                          isMiniCurrentMonth
                            ? "text-slate-700 dark:text-slate-300"
                            : "text-slate-300 dark:text-slate-700",
                          hasEvent && isMiniCurrentMonth && getDayCategoryColor(dayEvents)
                        )}
                      >
                        {format(day, 'd')}
                        {urgencyLevel === 'today' && (
                          <>
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
                          </>
                        )}
                        {urgencyLevel === 'high' && (
                          <Flame className="absolute -top-1 -right-1 w-2.5 h-2.5 text-orange-500 fill-orange-400" />
                        )}
                        {urgencyLevel === 'medium' && (
                          <Clock className="absolute -top-1 -right-1 w-2.5 h-2.5 text-amber-500" />
                        )}

                        {isHoveredDay && (
                          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 min-w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2 space-y-1">
                            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                              {format(day, 'yyyy-MM-dd')}
                            </p>
                            {dayEvents.slice(0, 4).map(event => (
                              <div
                                key={event.id}
                                className={cn(
                                  "px-2 py-1 text-[10px] font-semibold rounded-md border truncate",
                                  getEventColor(event.category)
                                )}
                              >
                                {getEventDisplayLabel(event)}
                              </div>
                            ))}
                            {dayEvents.length > 4 && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                +{dayEvents.length - 4} {language === 'MN' ? 'нэмэлт' : 'more'}
                              </p>
                            )}
                          </div>
                        )}
                      </span>
                    );
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
            {(language === 'MN' ? ['Ням', 'Дав', 'Мяг', 'Лха', 'Пүр', 'Баа', 'Бям'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map(day => (
              <div key={day} className="py-3 text-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 auto-rows-fr">
            {calendarDays.map((day, i) => {
              const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
              const dayTasks = tasks.filter(tk => isSameDay(parseISO(tk.dueDate), day));
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());
              const urgencyLevel = getUrgencyLevel(day);

              return (
                <div 
                  key={day.toString()} 
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "min-h-[120px] p-2 border-r border-b border-slate-100 dark:border-slate-800 transition-colors relative",
                    canManageEvents && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    !isCurrentMonth && "bg-slate-50/50 dark:bg-slate-950/20 text-slate-300 dark:text-slate-700",
                    i % 7 === 6 && "border-r-0"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="relative">
                      <span className={cn(
                        "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                        isToday ? "bg-primary text-white" : "text-slate-700 dark:text-slate-300"
                      )}>
                        {format(day, 'd')}
                      </span>
                      {urgencyLevel === 'today' && (
                        <>
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping" />
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500" />
                        </>
                      )}
                      {urgencyLevel === 'high' && (
                        <Flame className="absolute -top-1 -right-1 w-3.5 h-3.5 text-orange-500 fill-orange-400" />
                      )}
                      {urgencyLevel === 'medium' && (
                        <Clock className="absolute -top-1 -right-1 w-3 h-3 text-amber-500" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map(event => (
                      <div 
                        key={event.id}
                        onClick={(e) => handleEventClick(e, event)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded-md border truncate transition-all hover:scale-[1.02]",
                          getEventColor(event.category)
                        )}
                      >
                        {getEventDisplayLabel(event)}
                      </div>
                    ))}
                    {dayTasks.map(task => (
                      <div
                        key={task.id}
                        onClick={e => e.stopPropagation()}
                        title={task.title}
                        className="px-2 py-1 text-[10px] font-bold rounded-md border truncate bg-violet-500/10 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800"
                      >
                        📋 {task.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* Filter results — separate scrollable column beside the calendar */}
      {isFilterActive && (
        <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[70vh] lg:max-h-none">
          <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                {language === 'MN' ? 'Хайлтын үр дүн' : 'Search results'}
              </h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                {language === 'MN'
                  ? `${filterFrom} — ${filterTo} хооронд ${filteredRangeEvents.length} арга хэмжээ`
                  : `${filteredRangeEvents.length} events between ${filterFrom} — ${filterTo}`}
              </p>
            </div>
            <button
              onClick={() => {
                setFilterCategory('all');
                setFilterFrom('');
                setFilterTo('');
              }}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {language === 'MN' ? 'Хаах' : 'Close'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredRangeEvents.length > 0 ? (
              filteredRangeEvents.map(event => (
                <div
                  key={event.id}
                  onClick={(e) => handleEventClick(e, event)}
                  className={cn(
                    "px-3 py-2 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.005]",
                    getEventColor(event.category)
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{getEventDisplayLabel(event)}</p>
                    <p className="text-[11px] opacity-80">{getCategoryLabel(event.category)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold">{format(parseISO(event.date), 'yyyy-MM-dd')}</p>
                    {event.time && (
                      <p className="text-[11px] font-semibold flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" /> {event.time}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">
                {language === 'MN' ? 'Сонгосон хугацаанд арга хэмжээ байхгүй байна.' : 'No events in the selected range.'}
              </p>
            )}
          </div>
        </aside>
      )}
      </div>

      {/* Event Modal */}
      <Modal
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={isEditMode ? t.editEvent : t.addEvent}
      >
        <div className="space-y-4">
          {!isBirthdayCategory && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.title}</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="input-field"
                  placeholder={t.eventTitlePlaceholder}
                  readOnly={isReadOnlyEventView}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.description}</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="input-field h-24 resize-none"
                  placeholder={t.eventDescriptionPlaceholder}
                  readOnly={isReadOnlyEventView}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {language === 'MN' ? 'Файл / зураг' : 'Files / Images'}
            </label>
            {canManageEvents && (
              <input
                type="file"
                multiple
                onChange={handleAttachmentUpload}
                className="input-field"
              />
            )}

            {(formData.attachments || []).length > 0 && (
              <div className="space-y-2">
                {(formData.attachments || []).map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500">{(item.size / 1024).toFixed(1)} KB</p>
                      {item.type.startsWith('image/') && (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="mt-2 w-14 h-14 rounded object-cover border border-slate-200 dark:border-slate-700"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={item.dataUrl}
                        download={item.name}
                        className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 transition-colors"
                      >
                        {language === 'MN' ? 'Татах' : 'Download'}
                      </a>
                      {canManageEvents && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400"
                        >
                          {language === 'MN' ? 'Устгах' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canManageEvents && (
          !isBirthdayCategory && (
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {language === 'MN' ? 'Харах хэрэглэгч' : 'Visible Users'}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsVisibleUsersOpen(!isVisibleUsersOpen)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className="truncate">
                  {(formData.visibleToUserIds || []).length > 0
                    ? users
                        .filter(user => (formData.visibleToUserIds || []).includes(user.uid))
                        .map(user => user.displayName)
                        .join(', ') + ` (${selectedVisibleCount})`
                    : (language === 'MN' ? 'Хэрэглэгч сонгох' : 'Select users')}
                </span>
                <span className="text-slate-400 text-xs">▼</span>
              </button>

              {isVisibleUsersOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
                  <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setVisibleUsersDeptFilter('all')}
                      className={cn("px-2 py-0.5 rounded-full text-xs font-bold transition-all", visibleUsersDeptFilter === 'all' ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}
                    >
                      {language === 'MN' ? 'Бүгд' : 'All'}
                    </button>
                    {departments.map(dept => (
                      <button
                        key={dept.key}
                        type="button"
                        onClick={() => setVisibleUsersDeptFilter(dept.key)}
                        className={cn("px-2 py-0.5 rounded-full text-xs font-bold transition-all", visibleUsersDeptFilter === dept.key ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}
                      >
                        {dept.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-3 max-h-44 overflow-y-auto space-y-2">
                    {(() => {
                      const filteredUsers = visibleUsersDeptFilter === 'all' ? users : users.filter(u => u.department === visibleUsersDeptFilter);
                      const filteredIds = filteredUsers.map(u => u.uid);
                      const current = formData.visibleToUserIds || [];
                      const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => current.includes(id));
                      return (
                        <>
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
                            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllVisibleUsers} />
                            <span>{language === 'MN' ? 'Бүгд сонгох' : 'Select all'} ({filteredUsers.filter(u => current.includes(u.uid)).length}/{filteredUsers.length})</span>
                          </label>
                          {filteredUsers.map(user => (
                            <label key={user.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input type="checkbox" checked={current.includes(user.uid)} onChange={() => toggleVisibleUser(user.uid)} />
                              <span>{user.displayName}</span>
                            </label>
                          ))}
                          {filteredUsers.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-2">{language === 'MN' ? 'Ажилтан байхгүй' : 'No users'}</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {language === 'MN' ? 'Энд сонгогдоогүй хэрэглэгчдэд харагдахгүй.' : 'Users not selected here will not see this item.'}
            </p>
          </div>
          )
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.date}</label>
              <input 
                type="date" 
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="input-field"
                disabled={isReadOnlyEventView}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.category}</label>
              <select 
                value={formData.category}
                onChange={e => {
                  const nextCategory = e.target.value as EventCategory;
                  const shouldAutoSelectAllUsers = nextCategory === 'Birthday';
                  const allUserIds = users.map(user => user.uid);

                  setFormData({
                    ...formData,
                    title: shouldAutoSelectAllUsers ? '' : (formData.title || ''),
                    description: shouldAutoSelectAllUsers ? '' : (formData.description || ''),
                    category: nextCategory,
                    time: nextCategory === 'Meeting' ? (formData.time || '09:00') : formData.time,
                    birthdayUserId: shouldAutoSelectAllUsers ? (formData.birthdayUserId || users[0]?.uid) : undefined,
                    projectId: nextCategory === 'Project' ? (formData.projectId || 'peatland') : undefined,
                    visibleToUserIds: shouldAutoSelectAllUsers ? allUserIds : (formData.visibleToUserIds || []),
                  });
                }}
                className="input-field"
                disabled={isReadOnlyEventView || isMeetingOnly}
              >
                <option value="Project">{t.project}</option>
                <option value="Environmental">{t.environmental}</option>
                <option value="Internal">{t.internal}</option>
                <option value="Birthday">{t.birthday}</option>
                {/* Хурал зөвхөн одоо байгаа хурлыг засах үед харагдана — шинээр 'Хурал' цэснээс нэмнэ */}
                {isEditMode && formData.category === 'Meeting' && (
                  <option value="Meeting">{language === 'MN' ? 'Хурал' : 'Meeting'}</option>
                )}
                <option value="Report">{language === 'MN' ? 'Тайлан мэдээ' : 'Report'}</option>
              </select>
            </div>
          </div>

          {formData.category === 'Meeting' && (
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {language === 'MN' ? 'Хурлын цаг' : 'Meeting Time'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={formData.time || ''}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
                className="input-field"
                required
                disabled={isReadOnlyEventView}
              />
              <p className="text-[11px] text-slate-500">
                {language === 'MN' ? 'Шуурхай хурлын цагийг заавал оруулна.' : 'Time is required for urgent meetings.'}
              </p>
            </div>
          )}

          {isBirthdayCategory && (
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {language === 'MN' ? 'Хэний төрсөн өдөр' : 'Birthday Person'}
              </label>
              <select
                value={formData.birthdayUserId || ''}
                onChange={e => setFormData({ ...formData, birthdayUserId: e.target.value })}
                className="input-field"
                disabled={isReadOnlyEventView}
              >
                <option value="">{language === 'MN' ? 'Хэрэглэгч сонгох' : 'Select user'}</option>
                {users.map(user => (
                  <option key={user.uid} value={user.uid}>{user.displayName}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                {language === 'MN' ? 'Төрсөн өдөр ангилалд бүх хэрэглэгч автоматаар харна.' : 'Birthday category is automatically visible to all users.'}
              </p>
            </div>
          )}

          {formData.category === 'Project' && (
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {language === 'MN' ? 'Төслийн нэр' : 'Project Name'}
              </label>
              <select
                value={formData.projectId || 'peatland'}
                onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                className="input-field"
                disabled={isReadOnlyEventView}
              >
                {projectOptions.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {isEditMode && canManageEvents && !isReadOnlyEventView && (
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors"
              >
                {t.deleteEvent}
              </button>
            )}
            <button 
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {isReadOnlyEventView ? (language === 'MN' ? 'Хаах' : 'Close') : t.cancel}
            </button>
            {canManageEvents && !isReadOnlyEventView && (
              <button
                onClick={handleSave}
                className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
              >
                {t.save}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
