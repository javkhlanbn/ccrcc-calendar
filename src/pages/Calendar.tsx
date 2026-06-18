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
  const canManageEvents = profile?.role === 'admin';
  const projectOptions = ['peatland', 'btr1', 'btr2', 'unido'];
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isYearOverview, setIsYearOverview] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isVisibleUsersOpen, setIsVisibleUsersOpen] = useState(false);
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Event>>({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Project',
    priority: 'Medium',
    projectId: 'peatland',
    tags: [],
    attachments: [],
    visibleToUserIds: [],
  });
  const isReadOnlyEventView = isEditMode && !canManageEvents;
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

    if (formData.category === 'Birthday' && !formData.birthdayUserId) {
      alert(language === 'MN' ? 'Төрсөн өдрийн хэрэглэгчийг сонгоно уу.' : 'Please select the birthday user.');
      return;
    }

    const visibleToUserIds = formData.category === 'Birthday'
      ? users.map(user => user.uid)
      : (formData.visibleToUserIds || []);

    const payload: Event = {
      ...formData,
      priority: formData.priority || 'Medium',
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
    setFormData({
      ...formData,
      visibleToUserIds: isAllVisibleSelected ? [] : users.map(user => user.uid),
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
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getDayCategoryColor = (dayEvents: Event[]) => {
    if (dayEvents.length === 0) return '';

    const priorityOrder: EventCategory[] = ['Birthday', 'Project', 'Environmental', 'Internal'];
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
      default:
        return 'font-bold bg-primary/20 text-primary dark:bg-primary/30';
    }
  };

  const getEventDisplayLabel = (event: Event) => {
    if (event.category !== 'Birthday') return event.title;

    const birthdayUser = users.find(user => user.uid === event.birthdayUserId);
    return `🎂 ${birthdayUser?.displayName || event.title}`;
  };

  const getUrgencyLevel = (day: Date) => {
    const hasEvent = events.some(e => isSameDay(parseISO(e.date), day));
    if (!hasEvent) return null;

    const daysUntil = differenceInCalendarDays(startOfDay(day), startOfDay(new Date()));

    if (daysUntil === 0) return 'today';
    if (daysUntil >= 1 && daysUntil <= 3) return 'high';
    if (daysUntil >= 4 && daysUntil <= 7) return 'medium';
    return null;
  };

  const monthLabel =
    language === 'MN'
      ? `${format(currentDate, 'yyyy')} ${format(currentDate, 'M')} сар`
      : format(currentDate, 'MMMM yyyy');

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
    <div className="space-y-6 h-full flex flex-col">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.calendar}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{monthLabel}</p>
          {!canManageEvents && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {language === 'MN' ? 'Зөвхөн админ хэрэглэгч арга хэмжээ нэмэх, засах, устгах эрхтэй.' : 'Only admins can create, edit, and delete events.'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
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
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
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
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg max-h-52 overflow-y-auto space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <input
                      type="checkbox"
                      checked={isAllVisibleSelected}
                      onChange={toggleAllVisibleUsers}
                    />
                    <span>
                      {language === 'MN' ? 'Бүгд' : 'All'} ({selectedVisibleCount}/{totalVisibleUsers})
                    </span>
                  </label>
                  {users.map(user => (
                    <label key={user.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={(formData.visibleToUserIds || []).includes(user.uid)}
                        onChange={() => toggleVisibleUser(user.uid)}
                      />
                      <span>{user.displayName}</span>
                    </label>
                  ))}
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
                    birthdayUserId: shouldAutoSelectAllUsers ? (formData.birthdayUserId || users[0]?.uid) : undefined,
                    projectId: nextCategory === 'Project' ? (formData.projectId || 'peatland') : undefined,
                    visibleToUserIds: shouldAutoSelectAllUsers ? allUserIds : (formData.visibleToUserIds || []),
                  });
                }}
                className="input-field"
                disabled={isReadOnlyEventView}
              >
                <option value="Project">{t.project}</option>
                <option value="Environmental">{t.environmental}</option>
                <option value="Internal">{t.internal}</option>
                <option value="Birthday">{t.birthday}</option>
              </select>
            </div>
          </div>

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
            {isEditMode && canManageEvents && (
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
            {canManageEvents && (
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
