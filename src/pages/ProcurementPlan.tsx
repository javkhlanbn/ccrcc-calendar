import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ShoppingCart, Printer, MoreVertical, Search, Columns3, Check, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppContext';
import { ProcurementPlan as ProcurementPlanType, UserProfile } from '../types';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/utils';

type ColKey = keyof Omit<ProcurementPlanType, 'id' | 'visibleToUserIds'>;

interface ColumnDef {
  key: ColKey;
  mn: string;
  en: string;
  money?: boolean;
  badge?: 'type' | 'project';
  wide?: boolean;
  wrap?: boolean;
  right?: boolean;
}

// Every column from the source spreadsheet, in order.
const COLUMNS: ColumnDef[] = [
  { key: 'idx', mn: '№', en: '№' },
  { key: 'code', mn: 'ТШ-ын код', en: 'Code' },
  { key: 'name', mn: 'Худалдан авах бараа, ажил, үйлчилгээ', en: 'Item / Work / Service', wide: true, wrap: true },
  { key: 'type', mn: 'Төрөл', en: 'Type', badge: 'type' },
  { key: 'budgetCost', mn: 'Төсөвт өртөг', en: 'Budget cost', money: true, right: true },
  { key: 'yearFinancing', mn: 'Тухайн онд санхүүжих дүн', en: 'Year financing', money: true, right: true },
  { key: 'tenderMethod', mn: 'Тендер шалгаруулалтын арга', en: 'Tender method' },
  { key: 'tenderMonth', mn: 'Тендер зарлах сар', en: 'Tender month' },
  { key: 'sustainable', mn: 'Тогтвортой худалдан авалтын шалгуур', en: 'Sustainable criteria' },
  { key: 'notes', mn: 'Тайлбар, тодруулга', en: 'Notes', wrap: true },
  { key: 'projectName', mn: 'Төслийн нэр', en: 'Project', badge: 'project' },
  { key: 'implementPeriod', mn: 'Хэрэгжих боломжтой хугацаа', en: 'Implementation period' },
  { key: 'committeeFormed', mn: 'Үнэлгэний хороо байгуулсан', en: 'Committee formed' },
  { key: 'advertised', mn: 'Зар тавьсан', en: 'Advertised' },
  { key: 'tenderOpened', mn: 'Тендер нээсэн', en: 'Tender opened' },
  { key: 'committeeMet', mn: 'Үнэлгээний хороо хуралдсан', en: 'Committee met' },
  { key: 'noticeSent', mn: 'Мэдэгдэл хүргүүлсэн', en: 'Notice sent' },
  { key: 'contractSigned', mn: 'Гэрээ байгуулсан', en: 'Contract signed' },
  { key: 'contractValue', mn: 'Гэрээний нийт үнийн дүн', en: 'Contract value', money: true, right: true },
  { key: 'payment1', mn: 'Эхний төлбөр', en: 'Payment 1', money: true, right: true },
  { key: 'payment2', mn: '2 дахь төлбөр', en: 'Payment 2', money: true, right: true },
  { key: 'payment3', mn: '3 дахь төлбөр', en: 'Payment 3', money: true, right: true },
  { key: 'variance', mn: 'Хэтрэлт / Хэмнэлт', en: 'Overrun / Savings' },
  { key: 'extraNotes', mn: 'Нэмэлт тайлбар', en: 'Extra notes', wrap: true },
];

const ALL_KEYS = COLUMNS.map(c => c.key);
const STORAGE_KEY = 'procurement_visible_columns';

// Palette for project-name badges — each project gets a stable colour based on its name.
const PROJECT_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
];

const projectColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
};

// Reusable text input for the modal form.
// Defined at module scope so it is NOT re-created on every parent render,
// which would remount the <input> and make it lose focus after each keystroke.
const Field = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  textarea,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
}) => (
  <div className="space-y-1">
    <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{label}</label>
    {textarea ? (
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="input-field h-20 resize-none"
        placeholder={placeholder}
      />
    ) : (
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="input-field"
        placeholder={placeholder}
      />
    )}
  </div>
);

// Duration units for the "Implementation period" field (e.g. "24 сар").
const DURATION_UNITS = ['day', 'month', 'year'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
const UNIT_LABELS: Record<DurationUnit, { mn: string; en: string }> = {
  day: { mn: 'өдөр', en: 'days' },
  month: { mn: 'сар', en: 'months' },
  year: { mn: 'жил', en: 'years' },
};

// Split a stored value like "24 сар" into its number and unit.
const parseDuration = (raw?: string | null): { amount: string; unit: DurationUnit } => {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  const amount = m ? m[1] : '';
  const rest = (m ? m[2] : s).toLowerCase();
  let unit: DurationUnit = 'month';
  if (/жил|year|он/.test(rest)) unit = 'year';
  else if (/өдөр|day|хоног/.test(rest)) unit = 'day';
  else if (/сар|month/.test(rest)) unit = 'month';
  return { amount, unit };
};

const emptyPlan = (): Partial<ProcurementPlanType> => ({
  idx: null,
  code: '',
  name: '',
  type: 'үйлчилгээ',
  budgetCost: 0,
  yearFinancing: 0,
  tenderMethod: '',
  tenderMonth: '',
  sustainable: 'үгүй',
  notes: '',
  projectName: '',
  implementPeriod: '',
  committeeFormed: '',
  advertised: '',
  tenderOpened: '',
  committeeMet: '',
  noticeSent: '',
  contractSigned: '',
  contractValue: 0,
  payment1: 0,
  payment2: 0,
  payment3: 0,
  variance: '',
  extraNotes: '',
  visibleToUserIds: [],
});

export const ProcurementPlan: React.FC = () => {
  const {
    procurementPlans,
    projects,
    language,
    profile,
    addProcurementPlan,
    updateProcurementPlan,
    deleteProcurementPlan,
  } = useAppContext();
  const isMN = language === 'MN';
  const canManage = profile?.role === 'admin';
  const t = (mn: string, en: string) => (isMN ? mn : en);
  const buildDuration = (amount: string, unit: DurationUnit) => {
    const a = String(amount).trim();
    if (!a) return '';
    return `${a} ${isMN ? UNIT_LABELS[unit].mn : UNIT_LABELS[unit].en}`;
  };

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  // Column visibility — default shows every column ("show all"), persisted locally.
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const arr = JSON.parse(saved) as ColKey[];
        const valid = arr.filter(k => ALL_KEYS.includes(k));
        if (valid.length > 0) return new Set(valid);
      }
    } catch {
      /* ignore */
    }
    return new Set(ALL_KEYS);
  });
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  // Synced horizontal scrollbars (one above the table, one below).
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  const onTopScroll = () => {
    if (mainScrollRef.current && topScrollRef.current) {
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };
  const onMainScroll = () => {
    if (mainScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selected, setSelected] = useState<ProcurementPlanType | null>(null);
  const [isVisibleUsersOpen, setIsVisibleUsersOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<ProcurementPlanType>>(emptyPlan());

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        const data = await res.json();
        setUsers((data as UserProfile[]).filter(u => u.role === 'user'));
      } catch (error) {
        console.error('Users fetch error:', error);
      }
    };
    if (canManage) fetchUsers();
  }, [canManage]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visibleCols)));
    } catch {
      /* ignore */
    }
  }, [visibleCols]);

  // Close the column picker when clicking outside it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    };
    if (colPickerOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [colPickerOpen]);

  const fmt = (n: number) =>
    (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const shownColumns = useMemo(() => COLUMNS.filter(c => visibleCols.has(c.key)), [visibleCols]);

  const projectNames = useMemo(() => {
    const set = new Set<string>();
    procurementPlans.forEach(p => {
      if (p.projectName.trim()) set.add(p.projectName.trim());
    });
    return Array.from(set).sort();
  }, [procurementPlans]);

  // Options for the project-name dropdown: registered projects + any name already used in the table.
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(p => {
      if (p.title.trim()) set.add(p.title.trim());
    });
    projectNames.forEach(n => set.add(n));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects, projectNames]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return procurementPlans.filter(p => {
      if (projectFilter !== 'all' && p.projectName.trim() !== projectFilter) return false;
      if (!q) return true;
      // Search across every field's value.
      return ALL_KEYS.some(k => {
        const v = p[k];
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(q);
      });
    });
  }, [procurementPlans, search, projectFilter]);

  // Keep the top scrollbar's width matched to the actual table width.
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const update = () => setTableWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) ro.observe(tableEl);
    return () => ro.disconnect();
  }, [shownColumns, filteredPlans, language]);

  const moneyTotals = useMemo(() => {
    const totals: Partial<Record<ColKey, number>> = {};
    COLUMNS.filter(c => c.money).forEach(c => {
      totals[c.key] = filteredPlans.reduce((s, p) => s + (Number(p[c.key]) || 0), 0);
    });
    return totals;
  }, [filteredPlans]);

  const handleCreate = () => {
    if (!canManage) return;
    const nextIdx = procurementPlans.reduce((max, p) => Math.max(max, p.idx || 0), 0) + 1;
    setFormData({ ...emptyPlan(), idx: nextIdx });
    setIsEditMode(false);
    setSelected(null);
    setIsVisibleUsersOpen(false);
    setIsModalOpen(true);
  };

  const handleEdit = (plan: ProcurementPlanType) => {
    if (!canManage) return;
    setFormData({ ...plan, visibleToUserIds: plan.visibleToUserIds || [] });
    setSelected(plan);
    setIsEditMode(true);
    setIsVisibleUsersOpen(false);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!canManage) return;
    if (!String(formData.name || '').trim()) {
      alert(t('Худалдан авах бараа/үйлчилгээний нэрийг оруулна уу.', 'Please enter the procurement item name.'));
      return;
    }
    try {
      if (isEditMode && selected) {
        await updateProcurementPlan({ ...selected, ...formData } as ProcurementPlanType);
      } else {
        await addProcurementPlan({
          ...formData,
          id: Math.random().toString(36).slice(2, 11),
        } as ProcurementPlanType);
      }
      setIsModalOpen(false);
    } catch (error: any) {
      alert(error?.message || t('Хадгалах үед алдаа гарлаа.', 'Failed to save.'));
    }
  };

  const handleDelete = async () => {
    if (!canManage || !selected) return;
    if (!confirm(t('Энэ мэдээллийг устгах уу?', 'Delete this record?'))) return;
    try {
      await deleteProcurementPlan(selected.id);
      setIsModalOpen(false);
    } catch (error: any) {
      alert(error?.message || t('Устгах үед алдаа гарлаа.', 'Failed to delete.'));
    }
  };

  const toggleVisibleUser = (userId: string) => {
    const sel = formData.visibleToUserIds || [];
    setFormData({
      ...formData,
      visibleToUserIds: sel.includes(userId) ? sel.filter(id => id !== userId) : [...sel, userId],
    });
  };

  const toggleAllVisibleUsers = () => {
    const allIds = users.map(u => u.uid);
    const isAll = allIds.length > 0 && allIds.every(id => (formData.visibleToUserIds || []).includes(id));
    setFormData({ ...formData, visibleToUserIds: isAll ? [] : allIds });
  };

  const toggleColumn = (key: ColKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return next; // keep at least one column
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const allColumnsShown = visibleCols.size === COLUMNS.length;

  const handlePrint = () => window.print();

  // Export the table exactly as shown (visible columns, current filter) to .xlsx
  const handleExportExcel = () => {
    const header = shownColumns.map(c => colName(c));
    const rows = filteredPlans.map(plan =>
      shownColumns.map(c => {
        const value = plan[c.key];
        if (c.money) return Number(value) || 0;
        if (value === null || value === undefined) return '';
        return String(value);
      })
    );
    const totalRow = shownColumns.map((c, i) => {
      if (c.money) return moneyTotals[c.key] || 0;
      if (i === 0) return t('НИЙТ:', 'TOTAL:');
      return '';
    });

    const aoa: (string | number)[][] = [header, ...rows, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths roughly matching the on-screen layout.
    ws['!cols'] = shownColumns.map(c => ({ wch: c.wide ? 45 : c.wrap ? 26 : 18 }));

    // Apply a thousands/decimal number format to money cells so Excel treats them as numbers.
    shownColumns.forEach((c, ci) => {
      if (!c.money) return;
      for (let r = 1; r < aoa.length; r++) {
        const addr = XLSX.utils.encode_cell({ r, c: ci });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('Худалдан авалт', 'Procurement'));
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `procurement-plan-${today}.xlsx`);
  };

  const typeBadge = (type: string) => {
    const v = type.trim().toLowerCase();
    if (v.includes('бараа') || v.includes('good')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (v.includes('ажил') || v.includes('work')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  };

  const renderCell = (plan: ProcurementPlanType, col: ColumnDef) => {
    const value = plan[col.key];
    if (col.money) {
      return <span className="tabular-nums text-slate-700 dark:text-slate-300">{fmt(Number(value) || 0)}</span>;
    }
    if (col.key === 'idx') return <span className="text-slate-500">{value ?? ''}</span>;
    if (col.badge === 'type' && value) {
      return <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap', typeBadge(String(value)))}>{String(value)}</span>;
    }
    if (col.badge === 'project') {
      return value ? (
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap', projectColor(String(value)))}>
          {String(value)}
        </span>
      ) : null;
    }
    if (col.key === 'name') {
      return <div className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-3 break-words" title={String(value || '')}>{String(value || '')}</div>;
    }
    if (col.key === 'code') {
      return <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 break-words">{String(value || '')}</div>;
    }
    return <div className="text-slate-600 dark:text-slate-400 line-clamp-3 break-words" title={String(value || '')}>{String(value || '')}</div>;
  };

  const colName = (c: ColumnDef) => (isMN ? c.mn : c.en);

  // Compact width hints per column so the table squeezes instead of stretching wide.
  const colSize = (c: ColumnDef) => {
    if (c.key === 'idx') return 'w-10 min-w-[40px]';
    if (c.money) return 'min-w-[100px]';
    if (c.badge) return 'min-w-[80px] max-w-[140px]';
    if (c.key === 'code') return 'min-w-[70px] max-w-[110px]';
    if (c.wide) return 'min-w-[170px] max-w-[230px]';
    return 'min-w-[100px] max-w-[150px]';
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
              {t('Худалдан авах ажиллагааны төлөвлөгөө', 'Procurement Plan')}
            </h2>
            <span className="bg-slate-200 dark:bg-slate-800 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">
              {filteredPlans.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={filteredPlans.length === 0}
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
              {t('Хэвлэх', 'Print')}
            </button>
            {canManage && (
              <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {t('Мэдээлэл нэмэх', 'Add record')}
              </button>
            )}
          </div>
        </div>

        {/* Filters & column picker */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Бүх талбараар хайх...', 'Search all fields...')}
              className="pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm w-64 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className="py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">{t('Бүх төсөл', 'All projects')}</option>
            {projectNames.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Column picker */}
          <div className="relative" ref={colPickerRef}>
            <button
              onClick={() => setColPickerOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              <Columns3 className="w-4 h-4" />
              {t('Багана', 'Columns')}
              <span className="bg-slate-200 dark:bg-slate-700 text-slate-500 text-xs px-1.5 rounded-full">
                {visibleCols.size}/{COLUMNS.length}
              </span>
            </button>
            {colPickerOpen && (
              <div className="absolute z-30 mt-2 right-0 sm:left-0 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xl max-h-80 overflow-y-auto space-y-1">
                <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {t('Харуулах багана', 'Visible columns')}
                  </span>
                  <button
                    onClick={() => setVisibleCols(allColumnsShown ? new Set([ALL_KEYS[2]]) : new Set(ALL_KEYS))}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    {allColumnsShown ? t('Цэвэрлэх', 'Clear') : t('Бүгд', 'All')}
                  </button>
                </div>
                {COLUMNS.map(c => {
                  const active = visibleCols.has(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleColumn(c.key)}
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                          active ? 'bg-primary border-primary text-white' : 'border-slate-300 dark:border-slate-600'
                        )}
                      >
                        {active && <Check className="w-3 h-3" />}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{colName(c)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {!canManage && (
        <p className="text-xs text-amber-600 dark:text-amber-400 print:hidden">
          {t(
            'Зөвхөн админ хэрэглэгч мэдээлэл нэмэх, засах, устгах эрхтэй. Танд харагдах эрх олгогдсон мэдээлэл л харагдана.',
            'Only admins can add, edit, and delete. You only see records shared with you.'
          )}
        </p>
      )}

      {/* Print title */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">
          {t(
            '"УУР АМЬСГАЛЫН ӨӨРЧЛӨЛТИЙН СУДАЛГАА, ХАМТЫН АЖИЛЛАГААНЫ ТӨВ" ТӨААТҮГ-ЫН 2026 ОНЫ ХУДАЛДАН АВАХ АЖИЛЛАГААНЫ ТӨЛӨВЛӨГӨӨ',
            '2026 Procurement Plan'
          )}
        </h1>
      </div>

      {/* Top horizontal scrollbar — mirrors the table's scroll position */}
      {filteredPlans.length > 0 && (
        <div
          ref={topScrollRef}
          onScroll={onTopScroll}
          className="overflow-x-auto table-scroll print:hidden -mb-2"
          aria-hidden="true"
        >
          <div style={{ width: tableWidth || '100%' }} className="h-px" />
        </div>
      )}

      {/* Table */}
      <div
        ref={mainScrollRef}
        onScroll={onMainScroll}
        className="card p-0 overflow-auto table-scroll max-h-[70vh] print:overflow-visible print:max-h-none"
      >
        {filteredPlans.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
            <ShoppingCart className="w-10 h-10 opacity-30" />
            <p className="text-sm">{t('Мэдээлэл олдсонгүй', 'No records found')}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm print:min-w-0">
            <thead>
              <tr>
                {shownColumns.map(c => (
                  <th
                    key={c.key}
                    className={cn(
                      'sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 px-2 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700 shadow-sm align-bottom whitespace-normal break-words leading-tight',
                      c.right ? 'text-right' : 'text-left',
                      colSize(c)
                    )}
                  >
                    {colName(c)}
                  </th>
                ))}
                {canManage && (
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 py-3 print:hidden"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPlans.map(plan => (
                <tr
                  key={plan.id}
                  onClick={() => handleEdit(plan)}
                  className={cn(
                    'transition-colors align-top',
                    canManage ? 'hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer' : ''
                  )}
                >
                  {shownColumns.map(c => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-2 py-2 align-top text-xs',
                        c.right ? 'text-right' : '',
                        colSize(c),
                        c.money || c.badge || c.key === 'idx' ? 'whitespace-nowrap' : 'whitespace-normal break-words'
                      )}
                    >
                      {renderCell(plan, c)}
                    </td>
                  ))}
                  {canManage && (
                    <td className="px-3 py-3 text-right print:hidden">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleEdit(plan);
                        }}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-400" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                {shownColumns.map((c, i) => (
                  <td key={c.key} className={cn('px-2 py-2 text-xs whitespace-nowrap', c.right ? 'text-right' : '', colSize(c))}>
                    {c.money ? (
                      <span className="tabular-nums text-slate-900 dark:text-slate-100">{fmt(moneyTotals[c.key] || 0)}</span>
                    ) : i === 0 ? (
                      t('НИЙТ:', 'TOTAL:')
                    ) : (
                      ''
                    )}
                  </td>
                ))}
                {canManage && <td className="px-3 py-3 print:hidden"></td>}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditMode ? t('Мэдээлэл засах', 'Edit record') : t('Шинэ мэдээлэл нэмэх', 'Add record')}
        className="max-w-2xl"
      >
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <Field label="№" type="number" value={formData.idx ?? ''} onChange={v => setFormData({ ...formData, idx: v === '' ? null : Number(v) })} />
            <Field label={t('ТШ-ын код', 'Code')} value={formData.code} onChange={v => setFormData({ ...formData, code: v })} />
          </div>
          <Field
            label={t('Худалдан авах бараа, ажил, үйлчилгээний нэр', 'Item / work / service name')}
            value={formData.name}
            onChange={v => setFormData({ ...formData, name: v })}
            textarea
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Төрөл', 'Type')}</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="input-field">
                <option value="бараа">{t('бараа', 'goods')}</option>
                <option value="ажил">{t('ажил', 'work')}</option>
                <option value="үйлчилгээ">{t('үйлчилгээ', 'service')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Төслийн нэр', 'Project name')}</label>
              <select
                value={formData.projectName ?? ''}
                onChange={e => setFormData({ ...formData, projectName: e.target.value })}
                className="input-field"
              >
                <option value="">{t('— Сонгох —', '— Select —')}</option>
                {projectOptions.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {formData.projectName && !projectOptions.includes(formData.projectName) && (
                  <option value={formData.projectName}>{formData.projectName}</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Төсөвт өртөг (мян.төг)', 'Budget cost (k MNT)')} type="number" value={formData.budgetCost} onChange={v => setFormData({ ...formData, budgetCost: Number(v) || 0 })} />
            <Field label={t('Тухайн онд санхүүжих дүн (мян.төг)', 'Year financing (k MNT)')} type="number" value={formData.yearFinancing} onChange={v => setFormData({ ...formData, yearFinancing: Number(v) || 0 })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Тендер шалгаруулалтын арга', 'Tender method')} value={formData.tenderMethod} onChange={v => setFormData({ ...formData, tenderMethod: v })} />
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Тендер зарлах сар', 'Tender month')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.tenderMonth ?? ''}
                  onChange={e => setFormData({ ...formData, tenderMonth: e.target.value })}
                  className="input-field flex-1"
                  placeholder={t('ж: 3-р сар эсвэл сонгох →', 'e.g. March or pick →')}
                />
                <input
                  type="month"
                  value={/^\d{4}-\d{2}$/.test(String(formData.tenderMonth ?? '')) ? String(formData.tenderMonth) : ''}
                  onChange={e => setFormData({ ...formData, tenderMonth: e.target.value })}
                  className="input-field w-40"
                  title={t('Сар сонгох', 'Pick month')}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Тогтвортой худалдан авалтын шалгуур', 'Sustainable criteria')}</label>
              <select value={formData.sustainable} onChange={e => setFormData({ ...formData, sustainable: e.target.value })} className="input-field">
                <option value="үгүй">{t('үгүй', 'no')}</option>
                <option value="тийм">{t('тийм', 'yes')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хэрэгжих боломжтой хугацаа', 'Implementation period')}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={parseDuration(formData.implementPeriod).amount}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      implementPeriod: buildDuration(e.target.value, parseDuration(formData.implementPeriod).unit),
                    })
                  }
                  className="input-field flex-1"
                  placeholder="24"
                />
                <select
                  value={parseDuration(formData.implementPeriod).unit}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      implementPeriod: buildDuration(parseDuration(formData.implementPeriod).amount, e.target.value as DurationUnit),
                    })
                  }
                  className="input-field w-28"
                >
                  {DURATION_UNITS.map(u => (
                    <option key={u} value={u}>
                      {isMN ? UNIT_LABELS[u].mn : UNIT_LABELS[u].en}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <Field label={t('Тайлбар, тодруулга', 'Notes / clarification')} value={formData.notes} onChange={v => setFormData({ ...formData, notes: v })} textarea />

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('Хэрэгжилтийн мэдээлэл', 'Execution details')}</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('Үнэлгэний хороо байгуулсан', 'Committee formed')} type="date" value={formData.committeeFormed} onChange={v => setFormData({ ...formData, committeeFormed: v })} />
              <Field label={t('Зар тавьсан', 'Advertised')} type="date" value={formData.advertised} onChange={v => setFormData({ ...formData, advertised: v })} />
              <Field label={t('Тендер нээсэн', 'Tender opened')} type="date" value={formData.tenderOpened} onChange={v => setFormData({ ...formData, tenderOpened: v })} />
              <Field label={t('Үнэлгээний хороо хуралдсан', 'Committee met')} type="date" value={formData.committeeMet} onChange={v => setFormData({ ...formData, committeeMet: v })} />
              <Field label={t('Мэдэгдэл хүргүүлсэн', 'Notice sent')} type="date" value={formData.noticeSent} onChange={v => setFormData({ ...formData, noticeSent: v })} />
              <Field label={t('Гэрээ байгуулсан', 'Contract signed')} type="date" value={formData.contractSigned} onChange={v => setFormData({ ...formData, contractSigned: v })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Гэрээний нийт үнийн дүн', 'Total contract value')} type="number" value={formData.contractValue} onChange={v => setFormData({ ...formData, contractValue: Number(v) || 0 })} />
            <Field label={t('Хэтрэлт / Хэмнэлт', 'Overrun / Savings')} value={formData.variance} onChange={v => setFormData({ ...formData, variance: v })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label={t('Эхний төлбөр', 'Payment 1')} type="number" value={formData.payment1} onChange={v => setFormData({ ...formData, payment1: Number(v) || 0 })} />
            <Field label={t('2 дахь төлбөр', 'Payment 2')} type="number" value={formData.payment2} onChange={v => setFormData({ ...formData, payment2: Number(v) || 0 })} />
            <Field label={t('3 дахь төлбөр', 'Payment 3')} type="number" value={formData.payment3} onChange={v => setFormData({ ...formData, payment3: Number(v) || 0 })} />
          </div>
          <Field label={t('Нэмэлт тайлбар', 'Additional notes')} value={formData.extraNotes} onChange={v => setFormData({ ...formData, extraNotes: v })} textarea />

          {/* Visibility restriction */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Харах эрхтэй хэрэглэгчид', 'Visible to users')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsVisibleUsersOpen(!isVisibleUsersOpen)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className="truncate">
                  {(formData.visibleToUserIds || []).length > 0
                    ? users.filter(u => (formData.visibleToUserIds || []).includes(u.uid)).map(u => u.displayName).join(', ')
                    : t('Бүх хэрэглэгч (хязгаарлаагүй)', 'All users (unrestricted)')}
                </span>
                <span className="text-slate-400 text-xs">▼</span>
              </button>
              {isVisibleUsersOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg max-h-52 overflow-y-auto space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <input
                      type="checkbox"
                      checked={users.length > 0 && users.every(u => (formData.visibleToUserIds || []).includes(u.uid))}
                      onChange={toggleAllVisibleUsers}
                    />
                    <span>{t('Бүгд', 'All')}</span>
                  </label>
                  {users.map(u => (
                    <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={(formData.visibleToUserIds || []).includes(u.uid)}
                        onChange={() => toggleVisibleUser(u.uid)}
                      />
                      <span>{u.displayName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {t(
                'Хэрэглэгч сонгосон тохиолдолд зөвхөн тэдгээрт харагдана. Хоосон бол бүх хэрэглэгчид харагдана.',
                'If users are selected, only they can see this record. If empty, everyone can.'
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
          {isEditMode && (
            <button
              onClick={handleDelete}
              className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors"
            >
              {t('Устгах', 'Delete')}
            </button>
          )}
          <button
            onClick={() => setIsModalOpen(false)}
            className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
          >
            {t('Болих', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
          >
            {t('Хадгалах', 'Save')}
          </button>
        </div>
      </Modal>
    </section>
  );
};
