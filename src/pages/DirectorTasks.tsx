import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Search, Filter, ChevronDown, MoreVertical, Eye, Edit2, Trash2,
  AlertCircle, Clock, CheckCircle2, XCircle, Circle, Paperclip, X,
  TrendingUp, Users, BarChart2, PieChart, Download, MessageSquare,
  Calendar as CalIcon, Flag, Building2, ClipboardList
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/utils';
import { DirectorTask, DirectorTaskStatus, DirectorTaskPriority, DirectorTaskActivity, EventAttachment, UserProfile } from '../types';
import { format, isPast, isWithinInterval, addDays, parseISO, startOfDay } from 'date-fns';
import * as XLSX from 'xlsx';

type Tab = 'all' | 'mine' | 'overdue' | 'report';

const DEPT_LABELS: Record<string, string> = {
  'Захиргаа, санхүүгийн хэлтэс': 'Захиргаа',
  'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс': 'Төсөл',
  'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс': 'Судалгаа',
  'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс': 'МК',
};

const DEPARTMENTS = Object.keys(DEPT_LABELS);
const STATUS_LIST: DirectorTaskStatus[] = ['NotStarted', 'InProgress', 'Completed', 'Cancelled'];
const PRIORITY_LIST: DirectorTaskPriority[] = ['High', 'Medium', 'Low'];

function genId() { return Math.random().toString(36).slice(2, 11); }

function isOverdue(task: DirectorTask) {
  if (task.status === 'Completed' || task.status === 'Cancelled') return false;
  return isPast(startOfDay(addDays(parseISO(task.dueDate), 1)));
}

function isDueSoon(task: DirectorTask) {
  if (task.status === 'Completed' || task.status === 'Cancelled') return false;
  const today = new Date();
  return isWithinInterval(parseISO(task.dueDate), { start: today, end: addDays(today, 7) });
}

// --- Simple SVG Pie Chart ---
function PieChartSVG({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Өгөгдөл байхгүй</div>;
  let cumAngle = -Math.PI / 2;
  const cx = 80, cy = 80, r = 70;
  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {data.map((d, i) => {
          if (d.value === 0) return null;
          const angle = (d.value / total) * 2 * Math.PI;
          const x1 = cx + r * Math.cos(cumAngle);
          const y1 = cy + r * Math.sin(cumAngle);
          cumAngle += angle;
          const x2 = cx + r * Math.cos(cumAngle);
          const y2 = cy + r * Math.sin(cumAngle);
          const large = angle > Math.PI ? 1 : 0;
          return (
            <path
              key={i}
              d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
              fill={d.color}
              opacity={0.85}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={30} fill="white" className="dark:fill-slate-900" />
      </svg>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-slate-600 dark:text-slate-400">{d.label}</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Simple SVG Bar Chart ---
function BarChartSVG({ data }: { data: { label: string; value: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = 36, gap = 12, h = 120;
  const totalW = data.length * (barW + gap) + gap;
  return (
    <svg width={totalW} height={h + 32} viewBox={`0 0 ${totalW} ${h + 32}`}>
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * h;
        const x = gap + i * (barW + gap);
        const y = h - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill="#10b981" opacity={0.8} />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="11" fill="#64748b">{d.value}</text>
            <text x={x + barW / 2} y={h + 18} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {DEPT_LABELS[d.label] || d.label.slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const DirectorTasks: React.FC = () => {
  const { profile, language } = useAppContext();
  const t = translations[language];
  const canManage = profile?.role === 'admin';

  const [tasks, setTasks] = useState<DirectorTask[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('all');

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Form modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DirectorTask | null>(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignDeptFilter, setAssignDeptFilter] = useState('all');
  const [formData, setFormData] = useState<Partial<DirectorTask>>({
    title: '', description: '', assignedToUserIds: [], department: '',
    priority: 'Medium', startDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: '', status: 'NotStarted', progress: 0, attachments: [], notes: '',
  });

  // Detail modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<DirectorTask | null>(null);

  // Progress update modal
  const [isProgressOpen, setIsProgressOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [progressStatus, setProgressStatus] = useState<DirectorTaskStatus>('InProgress');
  const [progressComment, setProgressComment] = useState('');

  // Comment
  const [commentText, setCommentText] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Data fetching ----
  const fetchAll = async () => {
    try {
      const [tasksRes, usersRes] = await Promise.all([
        fetch('/api/director-tasks'),
        fetch('/api/users'),
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (usersRes.ok) {
        const all = await usersRes.json() as UserProfile[];
        setUsers(all.filter(u => u.status === 'approved'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ---- Filtering ----
  const filteredTasks = (() => {
    let list = tasks;
    if (activeTab === 'mine') list = list.filter(t => t.assignedToUserIds.includes(profile?.uid ?? ''));
    if (activeTab === 'overdue') list = list.filter(isOverdue);
    if (search) list = list.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || (t.description || '').toLowerCase().includes(search.toLowerCase()));
    if (filterStatus) list = list.filter(t => t.status === filterStatus);
    if (filterPriority) list = list.filter(t => t.priority === filterPriority);
    if (filterDept) list = list.filter(t => t.department === filterDept);
    if (filterAssignee) list = list.filter(t => t.assignedToUserIds.includes(filterAssignee));
    if (filterDateFrom) list = list.filter(t => t.dueDate >= filterDateFrom);
    if (filterDateTo) list = list.filter(t => t.dueDate <= filterDateTo);
    return list;
  })();

  // ---- Stats ----
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'Completed').length,
    inProgress: tasks.filter(t => t.status === 'InProgress').length,
    overdue: tasks.filter(isOverdue).length,
    dueSoon: tasks.filter(isDueSoon).length,
  };

  // ---- Helpers ----
  const getUserName = (uid: string) => users.find(u => u.uid === uid)?.displayName || uid;

  const statusLabel = (s: DirectorTaskStatus) => {
    const map: Record<DirectorTaskStatus, string> = {
      NotStarted: language === 'MN' ? 'Эхлээгүй' : 'Not Started',
      InProgress: language === 'MN' ? 'Хийгдэж байна' : 'In Progress',
      Completed: language === 'MN' ? 'Дууссан' : 'Completed',
      Cancelled: language === 'MN' ? 'Цуцлагдсан' : 'Cancelled',
    };
    return map[s];
  };

  const priorityLabel = (p: DirectorTaskPriority) => {
    const map = { High: language === 'MN' ? 'Өндөр' : 'High', Medium: language === 'MN' ? 'Дунд' : 'Medium', Low: language === 'MN' ? 'Бага' : 'Low' };
    return map[p];
  };

  const statusColor = (s: DirectorTaskStatus) => {
    switch (s) {
      case 'NotStarted': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
      case 'InProgress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Cancelled': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
    }
  };

  const priorityColor = (p: DirectorTaskPriority) => {
    switch (p) {
      case 'High': return 'text-rose-600 dark:text-rose-400';
      case 'Medium': return 'text-amber-600 dark:text-amber-400';
      case 'Low': return 'text-slate-500 dark:text-slate-400';
    }
  };

  const statusIcon = (s: DirectorTaskStatus) => {
    switch (s) {
      case 'NotStarted': return <Circle className="w-3.5 h-3.5" />;
      case 'InProgress': return <Clock className="w-3.5 h-3.5" />;
      case 'Completed': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'Cancelled': return <XCircle className="w-3.5 h-3.5" />;
    }
  };

  const activityIcon = (type: DirectorTaskActivity['type']) => {
    switch (type) {
      case 'created': return <Plus className="w-3.5 h-3.5 text-emerald-500" />;
      case 'progress': return <TrendingUp className="w-3.5 h-3.5 text-blue-500" />;
      case 'comment': return <MessageSquare className="w-3.5 h-3.5 text-violet-500" />;
      case 'status': return <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />;
      case 'attachment': return <Paperclip className="w-3.5 h-3.5 text-slate-500" />;
      default: return <Edit2 className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // ---- CRUD ----
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setSelectedTask(null);
    setFormData({ title: '', description: '', assignedToUserIds: [], department: '', priority: 'Medium', startDate: format(new Date(), 'yyyy-MM-dd'), dueDate: '', status: 'NotStarted', progress: 0, attachments: [], notes: '' });
    setIsAssignOpen(false);
    setAssignDeptFilter('all');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (task: DirectorTask) => {
    setIsEditMode(true);
    setSelectedTask(task);
    setFormData({ ...task });
    setIsAssignOpen(false);
    setAssignDeptFilter('all');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.startDate || !formData.dueDate) return;
    const id = isEditMode && selectedTask ? selectedTask.id : genId();
    const log: DirectorTaskActivity[] = isEditMode && selectedTask ? selectedTask.activityLog : [];
    if (isEditMode && selectedTask) {
      log.push({ id: genId(), type: 'updated', description: 'Үүрэг засварлагдсан', userId: profile?.uid ?? '', userName: profile?.displayName ?? '', timestamp: new Date().toISOString() });
    }
    const payload = { ...formData, id, createdBy: profile?.uid ?? '', createdByName: profile?.displayName ?? '', activityLog: log };
    const res = await fetch(isEditMode ? `/api/director-tasks/${id}` : '/api/director-tasks', {
      method: isEditMode ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) { await fetchAll(); setIsFormOpen(false); }
    else { const d = await res.json(); alert(d.message || 'Алдаа гарлаа'); }
  };

  const handleDelete = async (task: DirectorTask) => {
    if (!confirm(language === 'MN' ? 'Үүргийг устгах уу?' : 'Delete this task?')) return;
    await fetch(`/api/director-tasks/${task.id}`, { method: 'DELETE' });
    await fetchAll();
    if (isDetailOpen && detailTask?.id === task.id) setIsDetailOpen(false);
  };

  const handleOpenDetail = (task: DirectorTask) => {
    setDetailTask(task);
    setProgressValue(task.progress);
    setProgressStatus(task.status);
    setProgressComment('');
    setCommentText('');
    setIsDetailOpen(true);
  };

  const handleUpdateProgress = async () => {
    if (!detailTask) return;
    const res = await fetch(`/api/director-tasks/${detailTask.id}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress: progressValue, status: progressStatus, comment: progressComment, userId: profile?.uid, userName: profile?.displayName }),
    });
    if (res.ok) { await fetchAll(); setIsProgressOpen(false); setProgressComment(''); const updated = tasks.find(t => t.id === detailTask.id); if (updated) setDetailTask({ ...updated, progress: progressValue, status: progressStatus }); }
  };

  const handleAddComment = async () => {
    if (!detailTask || !commentText.trim()) return;
    setAddingComment(true);
    await fetch(`/api/director-tasks/${detailTask.id}/comment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: commentText.trim(), userId: profile?.uid, userName: profile?.displayName }),
    });
    setCommentText('');
    setAddingComment(false);
    await fetchAll();
    const refreshed = tasks.find(t => t.id === detailTask.id);
    if (refreshed) setDetailTask(refreshed);
  };

  // ---- File attachment ----
  const readFile = (f: File) => new Promise<string>((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result ?? ''));
    reader.onerror = () => rej(new Error('File унших алдаа'));
    reader.readAsDataURL(f);
  });

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const uploaded: EventAttachment[] = [];
    for (const f of files) {
      uploaded.push({ id: genId(), name: f.name, type: f.type, size: f.size, dataUrl: await readFile(f) });
    }
    setFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...uploaded] }));
    e.target.value = '';
  };

  // ---- Export ----
  const exportExcel = () => {
    const rows = filteredTasks.map((t, i) => ({
      '№': i + 1,
      'Үүргийн гарчиг': t.title,
      'Хариуцагч': t.assignedToUserIds.map(getUserName).join(', '),
      'Хэлтэс': t.department,
      'Эрэмбэ': priorityLabel(t.priority),
      'Өгсөн огноо': t.startDate,
      'Дуусах хугацаа': t.dueDate,
      'Явц (%)': t.progress,
      'Төлөв': statusLabel(t.status),
      'Тэмдэглэл': t.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Үүрэг даалгавар');
    XLSX.writeFile(wb, 'director-tasks.xlsx');
  };

  // ---- Assign users dropdown ----
  const toggleAssignUser = (uid: string) => {
    const sel = formData.assignedToUserIds || [];
    setFormData({ ...formData, assignedToUserIds: sel.includes(uid) ? sel.filter(id => id !== uid) : [...sel, uid] });
  };

  const toggleAllAssign = () => {
    const filtered = assignDeptFilter === 'all' ? users : users.filter(u => u.department === assignDeptFilter);
    const ids = filtered.map(u => u.uid);
    const cur = formData.assignedToUserIds || [];
    const allSel = ids.every(id => cur.includes(id));
    setFormData({ ...formData, assignedToUserIds: allSel ? cur.filter(id => !ids.includes(id)) : [...new Set([...cur, ...ids])] });
  };

  // ---- Report chart data ----
  const statusChartData = [
    { label: statusLabel('NotStarted'), value: tasks.filter(t => t.status === 'NotStarted').length, color: '#94a3b8' },
    { label: statusLabel('InProgress'), value: tasks.filter(t => t.status === 'InProgress').length, color: '#3b82f6' },
    { label: statusLabel('Completed'), value: tasks.filter(t => t.status === 'Completed').length, color: '#10b981' },
    { label: statusLabel('Cancelled'), value: tasks.filter(t => t.status === 'Cancelled').length, color: '#f43f5e' },
  ];

  const deptChartData = DEPARTMENTS.map(d => ({
    label: d,
    value: tasks.filter(t => t.department === d).length,
  })).filter(d => d.value > 0);

  const employeeChartData = users.map(u => ({
    label: u.displayName,
    value: tasks.filter(t => t.assignedToUserIds.includes(u.uid)).length,
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);

  // ---- Tabs ----
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: t.allTasks, count: tasks.length },
    { key: 'mine', label: t.myTasksDir, count: tasks.filter(tk => tk.assignedToUserIds.includes(profile?.uid ?? '')).length },
    { key: 'overdue', label: t.overdueTab, count: stats.overdue },
    { key: 'report', label: t.reportTab },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.directorTasks}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t.directorTasksDesc}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" />
            {t.exportExcel}
          </button>
          {canManage && (
            <button onClick={handleOpenCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t.newTask}
            </button>
          )}
        </div>
      </header>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: t.taskCount, value: stats.total, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-50 dark:bg-slate-800', icon: <ClipboardList className="w-5 h-5 text-slate-400" /> },
          { label: t.completedCount, value: stats.completed, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> },
          { label: t.inProgressCount, value: stats.inProgress, color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: <Clock className="w-5 h-5 text-blue-500" /> },
          { label: t.overdueCount, value: stats.overdue, color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', icon: <AlertCircle className="w-5 h-5 text-rose-500" /> },
          { label: t.dueSoonCount, value: stats.dueSoon, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: <Flag className="w-5 h-5 text-amber-500" /> },
        ].map((s, i) => (
          <div key={i} className={cn('card p-4 flex items-center gap-3', s.bg)}>
            {s.icon}
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
              <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all', activeTab === tab.key ? 'bg-slate-100 dark:bg-slate-800 text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300')}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold', activeTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-500')}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'report' ? (
        /* ---- Report View ---- */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" />{t.statusDistribution}
            </h3>
            <PieChartSVG data={statusChartData} />
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />{t.tasksByDept}
            </h3>
            {deptChartData.length === 0 ? <p className="text-slate-400 text-sm">Өгөгдөл байхгүй</p> : <BarChartSVG data={deptChartData} />}
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />{t.tasksByEmployee}
            </h3>
            <div className="space-y-2">
              {employeeChartData.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400 w-24 truncate">{d.label}</span>
                  <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(d.value / Math.max(...employeeChartData.map(x => x.value), 1)) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-4">{d.value}</span>
                </div>
              ))}
              {employeeChartData.length === 0 && <p className="text-slate-400 text-sm">Өгөгдөл байхгүй</p>}
            </div>
          </div>
        </div>
      ) : (
        /* ---- Table View ---- */
        <>
          {/* Search & Filter bar */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input-field pl-10 text-sm"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn('flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm transition-all', showFilters ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300')}
              >
                <Filter className="w-4 h-4" />
                {language === 'MN' ? 'Шүүлт' : 'Filter'}
              </button>
            </div>
            {showFilters && (
              <div className="card p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-sm">
                  <option value="">{t.allStatuses}</option>
                  {STATUS_LIST.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
                <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input-field text-sm">
                  <option value="">{t.allPriorities}</option>
                  {PRIORITY_LIST.map(p => <option key={p} value={p}>{priorityLabel(p)}</option>)}
                </select>
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field text-sm">
                  <option value="">{t.allDepts}</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                </select>
                <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="input-field text-sm">
                  <option value="">{t.allAssignees}</option>
                  {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                </select>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input-field text-sm" placeholder={t.startDate} />
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input-field text-sm" placeholder={t.endDate} />
              </div>
            )}
          </div>

          {/* Data Table */}
          <div className="card p-0 overflow-hidden">
            {filteredTasks.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                <ClipboardList className="w-10 h-10 opacity-30" />
                <p className="text-sm">{t.noDirectorTasks}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-8">№</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider min-w-[180px]">{language === 'MN' ? 'Үүргийн гарчиг' : 'Title'}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.assignedTo}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.department}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{language === 'MN' ? 'Эрэмбэ' : 'Priority'}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.dirAssignedDate}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.dueDate}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider min-w-[100px]">{t.progress}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.status}</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTasks.map((task, idx) => {
                      const overdue = isOverdue(task);
                      return (
                        <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">{task.title}</div>
                            {overdue && <span className="text-[10px] text-rose-500 font-bold">⚠ {language === 'MN' ? 'Хугацаа хэтэрсэн' : 'Overdue'}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {task.assignedToUserIds.slice(0, 2).map(uid => (
                                <span key={uid} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{getUserName(uid)}</span>
                              ))}
                              {task.assignedToUserIds.length > 2 && <span className="text-xs text-slate-400">+{task.assignedToUserIds.length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{DEPT_LABELS[task.department] || task.department}</td>
                          <td className="px-4 py-3">
                            <span className={cn('text-xs font-bold flex items-center gap-1', priorityColor(task.priority))}>
                              <Flag className="w-3 h-3" />{priorityLabel(task.priority)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{task.startDate}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{task.dueDate}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden min-w-[60px]">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                              </div>
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-8">{task.progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full w-fit', statusColor(task.status))}>
                              {statusIcon(task.status)}{statusLabel(task.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleOpenDetail(task)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title={t.viewTask}>
                                <Eye className="w-4 h-4 text-slate-400" />
                              </button>
                              {canManage && (
                                <>
                                  <button onClick={() => handleOpenEdit(task)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors" title={t.editTask2}>
                                    <Edit2 className="w-4 h-4 text-slate-400" />
                                  </button>
                                  <button onClick={() => handleDelete(task)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors" title={t.deleteTask2}>
                                    <Trash2 className="w-4 h-4 text-rose-400" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---- Create/Edit Form Modal ---- */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={isEditMode ? (language === 'MN' ? 'Үүрэг засах' : 'Edit Task') : (language === 'MN' ? 'Шинэ үүрэг нэмэх' : 'New Task')}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Үүргийн гарчиг' : 'Title'} *</label>
            <input type="text" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} className="input-field" placeholder={language === 'MN' ? 'Үүргийн гарчиг оруулах' : 'Enter task title'} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Дэлгэрэнгүй тайлбар' : 'Description'}</label>
            <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-field h-24 resize-none" placeholder={language === 'MN' ? 'Үүргийн тайлбар...' : 'Task description...'} />
          </div>

          {/* Assignees */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Хариуцсан ажилтан' : 'Assignees'}</label>
            <div className="relative">
              <button type="button" onClick={() => setIsAssignOpen(!isAssignOpen)} className="input-field w-full text-left flex items-center justify-between">
                <span className="truncate text-sm">
                  {(formData.assignedToUserIds || []).length > 0
                    ? users.filter(u => (formData.assignedToUserIds || []).includes(u.uid)).map(u => u.displayName).join(', ')
                    : (language === 'MN' ? 'Ажилтан сонгох' : 'Select assignees')}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </button>
              {isAssignOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
                  <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                    {['all', ...DEPARTMENTS].map(d => (
                      <button key={d} type="button" onClick={() => setAssignDeptFilter(d)} className={cn('px-2 py-0.5 rounded-full text-xs font-bold transition-all', assignDeptFilter === d ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}>
                        {d === 'all' ? (language === 'MN' ? 'Бүгд' : 'All') : (DEPT_LABELS[d] || d)}
                      </button>
                    ))}
                  </div>
                  <div className="p-3 max-h-44 overflow-y-auto space-y-2">
                    {(() => {
                      const filtered = assignDeptFilter === 'all' ? users : users.filter(u => u.department === assignDeptFilter);
                      const ids = filtered.map(u => u.uid);
                      const cur = formData.assignedToUserIds || [];
                      const allSel = ids.length > 0 && ids.every(id => cur.includes(id));
                      return (
                        <>
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <input type="checkbox" checked={allSel} onChange={toggleAllAssign} />
                            <span>{language === 'MN' ? 'Бүгд сонгох' : 'Select all'} ({filtered.filter(u => cur.includes(u.uid)).length}/{filtered.length})</span>
                          </label>
                          {filtered.map(u => (
                            <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input type="checkbox" checked={cur.includes(u.uid)} onChange={() => toggleAssignUser(u.uid)} />
                              <span>{u.displayName}</span>
                              <span className="text-xs text-slate-400 ml-auto">{DEPT_LABELS[u.department] || ''}</span>
                            </label>
                          ))}
                          {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-2">{language === 'MN' ? 'Ажилтан байхгүй' : 'No users'}</p>}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.department}</label>
              <select value={formData.department || ''} onChange={e => setFormData({ ...formData, department: e.target.value })} className="input-field">
                <option value="">{language === 'MN' ? 'Сонгох' : 'Select'}</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Эрэмбэ' : 'Priority'}</label>
              <select value={formData.priority || 'Medium'} onChange={e => setFormData({ ...formData, priority: e.target.value as DirectorTaskPriority })} className="input-field">
                {PRIORITY_LIST.map(p => <option key={p} value={p}>{priorityLabel(p)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.startDate} *</label>
              <input type="date" value={formData.startDate || ''} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="input-field" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.dueDate} *</label>
              <input type="date" value={formData.dueDate || ''} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.status}</label>
              <select value={formData.status || 'NotStarted'} onChange={e => setFormData({ ...formData, status: e.target.value as DirectorTaskStatus })} className="input-field">
                {STATUS_LIST.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.progress} (0–100)</label>
              <input type="number" min={0} max={100} value={formData.progress ?? 0} onChange={e => setFormData({ ...formData, progress: Math.max(0, Math.min(100, Number(e.target.value))) })} className="input-field" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Тэмдэглэл' : 'Notes'}</label>
            <textarea value={formData.notes || ''} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="input-field h-16 resize-none" placeholder={language === 'MN' ? 'Тэмдэглэл...' : 'Notes...'} />
          </div>
          {/* File attachments */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />{language === 'MN' ? 'Хавсралт файл' : 'Attachments'}
            </label>
            <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-sm cursor-pointer hover:border-primary hover:text-primary transition-colors">
              <Paperclip className="w-4 h-4 flex-shrink-0" />
              <span>{language === 'MN' ? 'Файл сонгох' : 'Choose files'}</span>
              <input type="file" multiple className="sr-only" onChange={handleAttachFile} accept=".pdf,.docx,.xlsx,.zip,image/*" />
            </label>
            {(formData.attachments || []).length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(formData.attachments || []).map(att => (
                  <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{att.name}</span>
                    <span className="text-[10px] text-slate-400">{(att.size / 1024).toFixed(1)}KB</span>
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, attachments: (prev.attachments || []).filter(a => a.id !== att.id) }))} className="p-1 rounded hover:bg-rose-50 text-rose-400 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            {isEditMode && canManage && selectedTask && (
              <button onClick={() => { handleDelete(selectedTask); setIsFormOpen(false); }} className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors">
                {language === 'MN' ? 'Устгах' : 'Delete'}
              </button>
            )}
            <button onClick={() => setIsFormOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors">{t.cancel}</button>
            <button onClick={handleSave} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">{t.save}</button>
          </div>
        </div>
      </Modal>

      {/* ---- Detail Modal ---- */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title={t.taskDetail}>
        {detailTask && (
          <div className="space-y-5">
            {/* Title + Meta */}
            <div>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{detailTask.title}</h2>
                <span className={cn('flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0', statusColor(detailTask.status))}>
                  {statusIcon(detailTask.status)}{statusLabel(detailTask.status)}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Flag className="w-3 h-3" /><span className={priorityColor(detailTask.priority)}>{priorityLabel(detailTask.priority)}</span></span>
                <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{DEPT_LABELS[detailTask.department] || detailTask.department}</span>
                <span className="flex items-center gap-1"><CalIcon className="w-3 h-3" />{detailTask.startDate} – {detailTask.dueDate}</span>
                {isOverdue(detailTask) && <span className="text-rose-500 font-bold">⚠ Хугацаа хэтэрсэн</span>}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{t.progressLabel}</span>
                <span className="text-sm font-bold text-primary">{detailTask.progress}%</span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${detailTask.progress}%` }} />
              </div>
            </div>

            {/* Description */}
            {detailTask.description && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">{t.description}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{detailTask.description}</p>
              </div>
            )}

            {/* Assignees */}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">{t.assignedTo}</p>
              <div className="flex flex-wrap gap-2">
                {detailTask.assignedToUserIds.map(uid => (
                  <span key={uid} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-medium">
                    <Users className="w-3 h-3" />{getUserName(uid)}
                  </span>
                ))}
              </div>
            </div>

            {/* Attachments */}
            {(detailTask.attachments || []).length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">{t.attachments}</p>
                <div className="space-y-1">
                  {detailTask.attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{att.name}</span>
                      <a href={att.dataUrl} download={att.name} className="text-xs px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 transition-colors">{t.download}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {detailTask.notes && (
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">{language === 'MN' ? 'Тэмдэглэл' : 'Notes'}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{detailTask.notes}</p>
              </div>
            )}

            {/* Update Progress Button (all users can do this) */}
            <div className="flex gap-2">
              <button
                onClick={() => { setProgressValue(detailTask.progress); setProgressStatus(detailTask.status); setProgressComment(''); setIsProgressOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <TrendingUp className="w-4 h-4" />{t.updateProgress}
              </button>
              {canManage && (
                <button onClick={() => { setIsDetailOpen(false); handleOpenEdit(detailTask); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Edit2 className="w-4 h-4" />{t.editTask2}
                </button>
              )}
            </div>

            {/* Activity Log */}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />{t.activityLog}
              </p>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {[...(detailTask.activityLog || [])].reverse().map(entry => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {activityIcon(entry.type)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{entry.description}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{entry.userName} · {entry.timestamp ? format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm') : ''}</p>
                    </div>
                  </div>
                ))}
                {(!detailTask.activityLog || detailTask.activityLog.length === 0) && (
                  <p className="text-xs text-slate-400">Бүртгэл байхгүй</p>
                )}
              </div>
            </div>

            {/* Add Comment */}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />{t.addComment}</p>
              <div className="flex gap-2">
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  className="input-field flex-1 h-14 resize-none text-sm"
                  placeholder={t.commentPlaceholder}
                />
                <button
                  onClick={handleAddComment}
                  disabled={addingComment || !commentText.trim()}
                  className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors self-end"
                >
                  {language === 'MN' ? 'Нэмэх' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Progress Update Modal ---- */}
      <Modal isOpen={isProgressOpen} onClose={() => setIsProgressOpen(false)} title={t.updateProgress}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.progress}: <span className="text-primary">{progressValue}%</span></label>
            <input type="range" min={0} max={100} value={progressValue} onChange={e => setProgressValue(Number(e.target.value))} className="w-full accent-primary" />
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressValue}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.status}</label>
            <select value={progressStatus} onChange={e => setProgressStatus(e.target.value as DirectorTaskStatus)} className="input-field">
              {STATUS_LIST.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Сэтгэгдэл (заавал биш)' : 'Comment (optional)'}</label>
            <textarea value={progressComment} onChange={e => setProgressComment(e.target.value)} className="input-field h-20 resize-none" placeholder={t.commentPlaceholder} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setIsProgressOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold">{t.cancel}</button>
            <button onClick={handleUpdateProgress} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">{t.save}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
