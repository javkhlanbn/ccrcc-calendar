import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Filter,
  MoreHorizontal,
  Calendar as CalendarIcon,
  Clock,
  Tag,
  AlertCircle
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
  eachDayOfInterval
} from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Event, EventCategory, Priority, EnvironmentalTag } from '../types';
import { cn } from '../lib/utils';

export const Calendar: React.FC = () => {
  const { events, language, addEvent, updateEvent, deleteEvent } = useAppContext();
  const t = translations[language];
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<Event>>({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    category: 'Project',
    priority: 'Medium',
    tags: [],
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const handleDayClick = (day: Date) => {
    setFormData({
      ...formData,
      date: format(day, 'yyyy-MM-dd'),
    });
    setIsEditMode(false);
    setIsModalOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, event: Event) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setFormData(event);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (isEditMode && selectedEvent) {
      updateEvent(formData as Event);
    } else {
      addEvent({
        ...formData,
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
      tags: [],
    });
  };

  const handleDelete = () => {
    if (selectedEvent) {
      deleteEvent(selectedEvent.id);
      setIsModalOpen(false);
    }
  };

  const getEventColor = (category: EventCategory) => {
    switch (category) {
      case 'Project': return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      case 'Environmental': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'Internal': return 'bg-slate-500/10 text-slate-600 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.calendar}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{format(currentDate, 'MMMM yyyy')}</p>
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
            onClick={() => {
              setIsEditMode(false);
              setIsModalOpen(true);
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">{t.addEvent}</span>
          </button>
        </div>
      </header>

      {/* Calendar Grid */}
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
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());

            return (
              <div 
                key={day.toString()} 
                onClick={() => handleDayClick(day)}
                className={cn(
                  "min-h-[120px] p-2 border-r border-b border-slate-100 dark:border-slate-800 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50",
                  !isCurrentMonth && "bg-slate-50/50 dark:bg-slate-950/20 text-slate-300 dark:text-slate-700",
                  i % 7 === 6 && "border-r-0"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={cn(
                    "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
                    isToday ? "bg-primary text-white" : "text-slate-700 dark:text-slate-300"
                  )}>
                    {format(day, 'd')}
                  </span>
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
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={isEditMode ? t.editEvent : t.addEvent}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.title}</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="input-field"
              placeholder={t.eventTitlePlaceholder}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.description}</label>
            <textarea 
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="input-field h-24 resize-none"
              placeholder={t.eventDescriptionPlaceholder}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.date}</label>
              <input 
                type="date" 
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.category}</label>
              <select 
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value as EventCategory })}
                className="input-field"
              >
                <option value="Project">{t.project}</option>
                <option value="Environmental">{t.environmental}</option>
                <option value="Internal">{t.internal}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.priority}</label>
              <select 
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value as Priority })}
                className="input-field"
              >
                <option value="Low">{t.low}</option>
                <option value="Medium">{t.medium}</option>
                <option value="High">{t.high}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.tags}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['Water', 'Climate', 'Forest', 'Waste'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      const tags = formData.tags || [];
                      if (tags.includes(tag as EnvironmentalTag)) {
                        setFormData({ ...formData, tags: tags.filter(t => t !== tag) });
                      } else {
                        setFormData({ ...formData, tags: [...tags, tag as EnvironmentalTag] });
                      }
                    }}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border transition-all",
                      formData.tags?.includes(tag as EnvironmentalTag)
                        ? "bg-primary text-white border-primary"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent"
                    )}
                  >
                    {t[tag.toLowerCase() as keyof typeof t.EN]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            {isEditMode && (
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
              {t.cancel}
            </button>
            <button 
              onClick={handleSave}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
            >
              {t.save}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
