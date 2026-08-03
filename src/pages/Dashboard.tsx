import React, { useEffect, useMemo, useState } from 'react';
import { 
  Briefcase, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Badge } from '../components/ui/Badge';
import { motion } from 'motion/react';
import { format, parseISO, startOfDay, compareAsc, isValid, startOfMonth, endOfMonth, getDate, isSameDay } from 'date-fns';
import { cn } from '../lib/utils';
import { UserProfile, Poll } from '../types';
import { computeLeaveBalance } from '../utils/leave';
import { Link } from 'react-router-dom';
import { Palmtree, Vote } from 'lucide-react';

// Donut-ийн сонголт бүрийн өнгө — тогтмол дараалалтай, CVD-safe categorical palette
const POLL_COLORS_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const POLL_COLORS_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

interface PollTooltip {
  x: number;
  y: number;
  question: string;
  option?: string;
  count?: number;
  percent?: number;
}

interface Activity {
  id: string;
  userId: string;
  userName: string;
  action: string;
  target: string;
  createdAt: string;
}

export const Dashboard: React.FC = () => {
  const { projects, events, language, leaveRequests, leaveEntitlementFor, leaveYear, profile, polls, theme } = useAppContext();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [now, setNow] = useState(new Date());
  // Идэвхтэй санал асуулгын donut дээр hover хийхэд гарах жижиг tooltip
  const [pollTip, setPollTip] = useState<PollTooltip | null>(null);
  const t = translations[language];

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers(data as UserProfile[]);
      } catch (error) {
        console.error('Users fetch error:', error);
      }
    };

    fetchUsers();
  }, []);

  const userNameById = useMemo(() => {
    return users.reduce<Record<string, string>>((acc, user) => {
      acc[user.uid] = user.displayName || `${user.lastName} ${user.firstName}`.trim();
      return acc;
    }, {});
  }, [users]);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(now);

    return events
      .filter(event => {
        const eventDate = parseISO(event.date);
        return isValid(eventDate) && startOfDay(eventDate) >= today;
      })
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)));
  }, [events, now]);

  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);

  const monthDays = useMemo(() => {
    const daysInMonth = getDate(monthEnd);
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [monthEnd]);

  const currentMonthEvents = useMemo(() => {
    return events
      .filter(e => {
        const eventDate = parseISO(e.date);
        return isValid(eventDate) && eventDate >= monthStart && eventDate <= monthEnd;
      })
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)));
  }, [events, monthStart, monthEnd]);

  const hasEventOnDay = (day: number) => {
    return events.some(e => {
      const eventDate = parseISO(e.date);
      if (!isValid(eventDate)) return false;
      return (
        eventDate >= monthStart &&
        eventDate <= monthEnd &&
        getDate(eventDate) === day
      );
    });
  };

  // Ээлжийн амралтын үлдэгдэл (нэвтэрсэн ажилтны)
  const leaveBalance = useMemo(
    () => computeLeaveBalance(leaveRequests, profile?.uid || '', leaveYear, leaveEntitlementFor(profile?.uid || '')),
    [leaveRequests, profile?.uid, leaveYear, leaveEntitlementFor]
  );

  const stats = [
    { label: t.totalProjects, value: projects.length, icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: t.upcomingEvents, value: upcomingEvents.length, icon: CalendarIcon, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: t.completedTasks, value: projects.filter(p => p.status === 'Completed').length, icon: CheckCircle2, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return language === 'MN' ? 'саяхан' : 'just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return language === 'MN' ? `${diffInMinutes} минутын өмнө` : `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return language === 'MN' ? `${diffInHours} цагийн өмнө` : `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return language === 'MN' ? `${diffInDays} өдрийн өмнө` : `${diffInDays}d ago`;
  };

  const getEventDisplayTitle = (eventId: string) => {
    const event = events.find(item => item.id === eventId);
    if (!event) return '';

    if (event.category !== 'Birthday') {
      return event.title;
    }

    if (event.birthdayUserId && userNameById[event.birthdayUserId]) {
      return `🎂 ${userNameById[event.birthdayUserId]}`;
    }

    const matchedBirthdayEvent = events.find(item =>
      item.category === 'Birthday' &&
      item.birthdayUserId === event.birthdayUserId &&
      item.id !== event.id &&
      item.title &&
      item.title.trim().length > 0 &&
      item.title.trim().toLowerCase() !== 'birthday'
    );

    const birthdayName = matchedBirthdayEvent?.title || event.title;
    return `🎂 ${birthdayName}`;
  };

  const openPolls = polls.filter(p => p.status === 'open');
  const pollColors = theme === 'dark' ? POLL_COLORS_DARK : POLL_COLORS_LIGHT;

  // Асуулгын дүнг donut-ийн сегментүүд болгон бэлтгэнэ (8-аас олон сонголттой бол "Бусад"-д нэгтгэнэ)
  const pollSegments = (poll: Poll): { label: string; count: number; other?: boolean }[] => {
    const named = poll.results.map(r => ({
      label: poll.options.find(o => o.id === r.optionId)?.text || '',
      count: r.count,
    }));
    if (named.length <= 8) return named;
    const sorted = [...named].sort((a, b) => b.count - a.count);
    return [
      ...sorted.slice(0, 7),
      {
        label: language === 'MN' ? 'Бусад' : 'Other',
        count: sorted.slice(7).reduce((s, x) => s + x.count, 0),
        other: true,
      },
    ];
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">EcoPlan {t.dashboard}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t.welcomeBack}</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card flex items-center gap-4"
          >
            <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Ээлжийн амралт */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Palmtree className="w-5 h-5 text-primary" />
            {language === 'MN' ? 'Ээлжийн амралт' : 'Annual Leave'}
            <span className="text-xs font-semibold text-slate-400">({leaveYear})</span>
          </h2>
          <Link to="/leave" className="text-primary text-sm font-semibold flex items-center gap-1 hover:underline">
            {language === 'MN' ? 'Дэлгэрэнгүй' : 'Details'} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {language === 'MN' ? 'Нийт эрхтэй' : 'Entitlement'}
            </p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{leaveBalance.entitlement}</p>
            <p className="text-[11px] text-slate-400">{language === 'MN' ? 'ажлын өдөр' : 'working days'}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {language === 'MN' ? 'Ашигласан' : 'Used'}
            </p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{leaveBalance.used}</p>
            <p className="text-[11px] text-slate-400">{language === 'MN' ? 'ажлын өдөр' : 'working days'}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {language === 'MN' ? 'Үлдсэн' : 'Remaining'}
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{leaveBalance.remaining}</p>
            <p className="text-[11px] text-slate-400">{language === 'MN' ? 'ажлын өдөр' : 'working days'}</p>
          </div>
          <div className="p-3 rounded-xl bg-violet-500/10">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {language === 'MN' ? 'Ашигласан удаа' : 'Times used'}
            </p>
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              {leaveBalance.usageCount}/{leaveBalance.maxSplits}
            </p>
            <p className="text-[11px] text-slate-400">{language === 'MN' ? 'хэсэг' : 'parts'}</p>
          </div>
        </div>
      </div>

      {/* Идэвхтэй санал асуулга — сонголт бүрийн хувийг donut-оор харуулна */}
      {openPolls.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Vote className="w-5 h-5 text-primary" />
              {language === 'MN' ? 'Идэвхтэй санал асуулга' : 'Active Polls'}
            </h2>
            <Link to="/polls" className="text-primary text-sm font-semibold flex items-center gap-1 hover:underline">
              {language === 'MN' ? 'Дэлгэрэнгүй' : 'Details'} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex flex-wrap gap-6">
            {openPolls.map(poll => {
              const segments = pollSegments(poll);
              const total = segments.reduce((s, x) => s + x.count, 0);
              const R = 40;
              const CIRC = 2 * Math.PI * R;
              // Сегмент хоорондын 2px зай (нэг л сегменттэй бол зай хэрэггүй)
              const gap = segments.filter(s => s.count > 0).length > 1 ? 2 : 0;
              let acc = 0;
              return (
                <Link
                  to="/polls"
                  key={poll.id}
                  className="flex flex-col items-center gap-2 w-36 group"
                  onMouseMove={e => {
                    // Сегмент дээр биш үед зөвхөн асуултын нэрийг харуулна
                    if ((e.target as SVGElement).tagName !== 'circle') {
                      setPollTip({ x: e.clientX, y: e.clientY, question: poll.question });
                    }
                  }}
                  onMouseLeave={() => setPollTip(null)}
                >
                  <div className="relative w-28 h-28">
                    <svg viewBox="0 0 112 112" className="w-28 h-28 -rotate-90">
                      <circle cx="56" cy="56" r={R} fill="none" strokeWidth="16" className="stroke-slate-100 dark:stroke-slate-800" />
                      {total > 0 && segments.map((seg, i) => {
                        if (seg.count === 0) return null;
                        const len = (seg.count / total) * CIRC;
                        const dash = Math.max(0.5, len - gap);
                        const offset = acc;
                        acc += len;
                        return (
                          <circle
                            key={i}
                            cx="56"
                            cy="56"
                            r={R}
                            fill="none"
                            strokeWidth="16"
                            stroke={seg.other ? '#898781' : pollColors[i]}
                            strokeDasharray={`${dash} ${CIRC - dash}`}
                            strokeDashoffset={-offset}
                            className="transition-opacity hover:opacity-75"
                            onMouseMove={e => setPollTip({
                              x: e.clientX,
                              y: e.clientY,
                              question: poll.question,
                              option: seg.label,
                              count: seg.count,
                              percent: Math.round((seg.count / total) * 100),
                            })}
                          />
                        );
                      })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{poll.totalVotes}</span>
                      <span className="text-[10px] text-slate-400">{language === 'MN' ? 'хүн' : 'voted'}</span>
                    </div>
                  </div>
                  <p className="text-xs text-center font-medium text-slate-500 dark:text-slate-400 group-hover:text-primary transition-colors line-clamp-2">
                    {poll.question}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Donut дээр hover хийхэд асуулт болон сонголтын мэдээлэл жижгээр гарна */}
      {pollTip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-slate-900/95 dark:bg-slate-700/95 text-white text-xs shadow-xl max-w-[240px]"
          style={{ left: pollTip.x + 12, top: pollTip.y + 12 }}
        >
          <p className="font-bold">{pollTip.question}</p>
          {pollTip.option && (
            <p className="text-slate-300 mt-0.5">
              {pollTip.option}: {pollTip.count} ({pollTip.percent}%)
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upcoming Events */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t.upcomingEvents}</h2>
            <button className="text-primary text-sm font-semibold flex items-center gap-1 hover:underline">
              {t.viewAll} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-4">
            {upcomingEvents.length > 0 ? (
              upcomingEvents.slice(0, 4).map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="card hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center justify-center w-14 h-14 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{format(parseISO(event.date), 'MMM')}</span>
                        <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{format(parseISO(event.date), 'dd')}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">{getEventDisplayTitle(event.id)}</h3>
                        {event.time && (
                          <p className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3.5 h-3.5" />
                            {format(parseISO(event.date), 'yyyy.MM.dd')} • {event.time}
                          </p>
                        )}
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{event.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant={
                            event.category === 'Project' ? 'primary'
                              : event.category === 'Environmental' ? 'success'
                              : event.category === 'Meeting' ? 'error'
                              : event.category === 'Report' ? 'warning'
                              : 'secondary'
                          }>
                            {event.category === 'Meeting'
                              ? (language === 'MN' ? 'Шуурхай хурал' : 'Urgent Meeting')
                              : event.category === 'Report'
                                ? (language === 'MN' ? 'Тайлан мэдээ' : 'Report')
                                : t[event.category.toLowerCase() as keyof typeof t]}
                          </Badge>
                          {event.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="opacity-70">
                              {t[tag.toLowerCase() as keyof typeof t]}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Badge variant={event.priority === 'High' ? 'error' : event.priority === 'Medium' ? 'warning' : 'outline'}>
                      {t[event.priority.toLowerCase() as keyof typeof t]}
                    </Badge>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="card text-center py-12 text-slate-500 dark:text-slate-400">
                {language === 'MN' ? 'Одоогоор арга хэмжээ байхгүй байна' : 'No upcoming events'}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t.recentActivities}</h2>
          <div className="card space-y-6">
            {activities.length > 0 ? (
              activities.map((activity, i) => (
                <div key={activity.id} className="flex gap-4 relative">
                  {i !== activities.length - 1 && (
                    <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-200 dark:bg-slate-800/50" />
                  )}
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-900 dark:text-slate-100">
                      <span className="font-bold">{activity.userName}</span> {activity.action} <span className="font-semibold text-primary">{activity.target}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{getTimeAgo(activity.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-slate-500 dark:text-slate-400 text-sm">
                {language === 'MN' ? 'Одоогоор идэвх байхгүй байна' : 'No recent activities'}
              </div>
            )}
          </div>

          {/* Mini Calendar */}
          <div className="card">
            <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <CalendarIcon className="w-5 h-5 text-primary" />
              {t.calendar}
            </h3>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                <span key={d} className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{d}</span>
              ))}
              {monthDays.map((day) => {
                const hasEvent = hasEventOnDay(day);
                const isToday = isSameDay(now, new Date(now.getFullYear(), now.getMonth(), day));

                return (
                  <div 
                    key={day} 
                    className={cn(
                      "aspect-square flex items-center justify-center text-xs rounded-lg transition-colors",
                      isToday ? "bg-primary text-white font-bold" : "hover:bg-slate-100 dark:hover:bg-slate-800",
                      hasEvent && !isToday && "text-primary font-bold underline underline-offset-2"
                    )}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800/50">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                {language === 'MN' ? 'Энэ сарын арга хэмжээнүүд' : 'This month events'}
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {currentMonthEvents.length > 0 ? (
                  currentMonthEvents.map((event) => (
                    <div key={event.id} className="text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2">
                      <span className="truncate">{getEventDisplayTitle(event.id)}</span>
                      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">
                        {format(parseISO(event.date), 'MM/dd')}{event.time ? ` ${event.time}` : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {language === 'MN' ? 'Энэ сард арга хэмжээ байхгүй' : 'No events this month'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Environmental Awareness Card */}
         
        </div>
      </div>
    </div>
  );
};
