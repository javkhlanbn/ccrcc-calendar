import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Plus,
  ArrowLeft,
  Save,
  Trash2,
  Settings2,
  FileSpreadsheet,
  Printer,
  Columns3,
  Users,
  Building2,
  Lock,
  Pencil,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppContext } from '../context/AppContext';
import { Modal } from '../components/ui/Modal';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/utils';
import {
  WorkPlan,
  WorkPlanColumn,
  WorkPlanPeriodType,
  WorkPlanRow,
  UserProfile,
  Department,
  DEPARTMENTS,
  DEPARTMENT_SHORT_LABELS,
  DEFAULT_WORK_PLAN_COLUMNS,
  WORK_PLAN_PERIOD_LABELS,
} from '../types';
import { buildWorkPlanTemplateRows, WORK_PLAN_TEMPLATE_ROW_COUNT } from '../data/workPlanTemplate';

const genId = () => Math.random().toString(36).slice(2, 11);

const PERIOD_TYPES: WorkPlanPeriodType[] = ['year', 'halfyear', 'month', 'week'];

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Тухайн огноог агуулах 7 хоногийн Даваа гараг
const mondayOf = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7; // Ням = 7
  d.setDate(d.getDate() - (day - 1));
  return d;
};

// ISO стандартын 7 хоногийн дугаар (1-53)
const isoWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

// ISO 7 хоногийн дугаараас Даваа гарагийн огноог буцаана
const mondayOfIsoWeek = (year: number, week: number) => {
  const monday = mondayOf(new Date(year, 0, 4)); // 1-р сарын 4 үргэлж 1-р долоо хоногт багтана
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
};

// Төлөвлөгөөний хугацааны эхлэл, төгсгөлийг төрлөөс нь бодно
const periodRange = (periodType: WorkPlanPeriodType, year: number, periodNo: number | null) => {
  if (periodType === 'year') {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  if (periodType === 'halfyear') {
    return periodNo === 2
      ? { startDate: `${year}-07-01`, endDate: `${year}-12-31` }
      : { startDate: `${year}-01-01`, endDate: `${year}-06-30` };
  }
  if (periodType === 'month') {
    const m = Math.min(12, Math.max(1, periodNo || 1));
    return { startDate: toISODate(new Date(year, m - 1, 1)), endDate: toISODate(new Date(year, m, 0)) };
  }
  const monday = mondayOfIsoWeek(year, Math.max(1, periodNo || 1));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { startDate: toISODate(monday), endDate: toISODate(sunday) };
};

// "Захиргаа, санхүүгийн хэлтэс" → "Захиргаа, санхүүгийн хэлтсийн"
const departmentGenitive = (dept: string) => dept.replace(/хэлтэс$/i, 'хэлтсийн');

// Файл дээрхтэй ижил хэлбэрийн гарчгийг автоматаар бүрдүүлнэ
const buildTitle = (dept: string, periodType: WorkPlanPeriodType, year: number, periodNo: number | null) => {
  let period = `${year} ОНЫ`;
  if (periodType === 'year') period = `${year} ОНЫ ЖИЛИЙН`;
  if (periodType === 'halfyear') period = `${year} ОНЫ ${periodNo === 2 ? 'СҮҮЛИЙН' : 'ЭХНИЙ'} ХАГАС ЖИЛИЙН`;
  if (periodType === 'month') period = `${year} ОНЫ ${periodNo || 1}-Р САРЫН`;
  if (periodType === 'week') period = `${year} ОНЫ ${periodNo || 1}-Р 7 ХОНОГИЙН`;
  return `${departmentGenitive(dept).toUpperCase()} ${period} ҮЙЛ АЖИЛЛАГААНЫ ТӨЛӨВЛӨГӨӨ`;
};

// Жагсаалт болон хүснэгтийн толгойд харагдах хугацааны товч тайлбар
const periodLabel = (plan: Pick<WorkPlan, 'periodType' | 'year' | 'periodNo' | 'startDate' | 'endDate'>, mn: boolean) => {
  const { periodType, year, periodNo } = plan;
  if (periodType === 'year') return mn ? `${year} он` : `Year ${year}`;
  if (periodType === 'halfyear') {
    return mn
      ? `${year} оны ${periodNo === 2 ? 'сүүлийн' : 'эхний'} хагас жил`
      : `${year} H${periodNo === 2 ? 2 : 1}`;
  }
  if (periodType === 'month') return mn ? `${year} оны ${periodNo}-р сар` : `${year}-${String(periodNo).padStart(2, '0')}`;
  const range = plan.startDate && plan.endDate ? ` (${plan.startDate.slice(5)} – ${plan.endDate.slice(5)})` : '';
  return mn ? `${year} оны ${periodNo}-р 7 хоног${range}` : `${year} W${periodNo}${range}`;
};

// Гарын үсэг зурсан огноо. Сервер (PHP ба Node аль аль нь) серверийн ханын цагийг
// буцаадаг тул new Date(...)-аар цагийн бүс хөрвүүлбэл огноо нэг өдрөөр гулсаж болно.
// Иймд ISO мөрийн эхний 10 тэмдэгтийг шууд авч, баримтын хэлбэрээр (2026.07.29) харуулна.
const formatSignedDate = (iso: string) => {
  const datePart = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart.replace(/-/g, '.') : datePart;
};

// Хүснэгтийн нүд — агуулгынхаа хэрээр өндөр нь автоматаар уртасна
const AutoTextarea: React.FC<{
  value: string;
  onChange: (value: string) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(resize, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => {
        onChange(e.target.value);
        resize();
      }}
      className={cn(
        'w-full resize-none bg-transparent outline-none text-sm leading-relaxed rounded-lg px-2 py-1.5',
        'focus:bg-primary/5 focus:ring-2 focus:ring-primary/20 transition-colors',
        className
      )}
    />
  );
};

// Ажилтан сонгох dropdown — хэлтсээр шүүж, бүгдийг нэг дор сонгоно
const UserPicker: React.FC<{
  users: UserProfile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}> = ({ users, selected, onChange, emptyLabel }) => {
  const [open, setOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const filtered = deptFilter === 'all' ? users : users.filter(u => u.department === deptFilter);
  const filteredIds = filtered.map(u => u.uid);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="input-field w-full text-left flex items-center justify-between"
      >
        <span className="truncate">
          {selected.length > 0
            ? `${selected
                .map(uid => users.find(u => u.uid === uid)?.displayName || uid)
                .slice(0, 3)
                .join(', ')}${selected.length > 3 ? '…' : ''} (${selected.length})`
            : emptyLabel}
        </span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
          <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
            <button
              type="button"
              onClick={() => setDeptFilter('all')}
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-bold transition-all',
                deptFilter === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              )}
            >
              Бүгд
            </button>
            {DEPARTMENTS.map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => setDeptFilter(dept)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-bold transition-all',
                  deptFilter === dept ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                )}
              >
                {DEPARTMENT_SHORT_LABELS[dept]}
              </button>
            ))}
          </div>

          <div className="p-3 max-h-44 overflow-y-auto space-y-2">
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400">Ажилтан алга</p>
            )}
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onChange(
                    allFilteredSelected
                      ? selected.filter(id => !filteredIds.includes(id))
                      : [...new Set([...selected, ...filteredIds])]
                  )
                }
                className="text-xs font-bold text-primary hover:underline"
              >
                {allFilteredSelected ? 'Сонголтыг цуцлах' : 'Бүгдийг сонгох'}
              </button>
            )}
            {filtered.map(u => (
              <label key={u.uid} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(u.uid)}
                  onChange={() =>
                    onChange(
                      selected.includes(u.uid) ? selected.filter(id => id !== u.uid) : [...selected, u.uid]
                    )
                  }
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm truncate">{u.displayName}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Гарын үсэг зурах ажилтан сонгох — бүртгэлтэй, зөвшөөрөгдсөн ажилчид хэлтсээрээ бүлэглэгдэнэ
const SignerSelect: React.FC<{
  users: UserProfile[];
  value: string;
  onChange: (uid: string) => void;
  mn: boolean;
}> = ({ users, value, onChange, mn }) => (
  <select value={value} onChange={e => onChange(e.target.value)} className="input-field">
    <option value="">{mn ? '— Сонгоогүй —' : '— Not selected —'}</option>
    {DEPARTMENTS.map(dept => {
      const members = users.filter(u => u.department === dept);
      if (members.length === 0) return null;
      return (
        <optgroup key={dept} label={dept}>
          {members.map(u => (
            <option key={u.uid} value={u.uid}>{u.displayName}</option>
          ))}
        </optgroup>
      );
    })}
  </select>
);

// Баримтын гарын үсгийн блок — сонгогдсон ажилтан өөрөө батална
const SignatureBlock: React.FC<{
  label: string;
  position?: string;
  name: string;
  signedAt?: string;
  canSign: boolean;
  onSign: (revoke: boolean) => void;
  busy: boolean;
  mn: boolean;
}> = ({ label, position, name, signedAt, canSign, onSign, busy, mn }) => (
  <div className="space-y-1">
    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
    {position && <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{position}</p>}
    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
      {name || <span className="font-normal text-slate-400 italic">{mn ? 'Сонгоогүй' : 'Not assigned'}</span>}
    </p>

    {signedAt ? (
      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        {mn ? 'Баталсан' : 'Approved'} · {formatSignedDate(signedAt)}
      </p>
    ) : (
      name && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <Clock className="w-4 h-4 flex-shrink-0" />
          {mn ? 'Гарын үсэг хүлээгдэж байна' : 'Awaiting signature'}
        </p>
      )
    )}

    {canSign && (
      <button
        onClick={() => onSign(!!signedAt)}
        disabled={busy}
        className={cn(
          'mt-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 print:hidden',
          signedAt
            ? 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            : 'bg-primary text-white hover:bg-primary-dark'
        )}
      >
        {signedAt ? (mn ? 'Гарын үсгээ буцаах' : 'Revoke signature') : (mn ? 'Батлах' : 'Approve')}
      </button>
    )}
  </div>
);

// Хэлтэс сонгох чипүүд — эрхийн тохиргоонд ашиглана
const DepartmentChips: React.FC<{ selected: string[]; onChange: (list: string[]) => void }> = ({ selected, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {DEPARTMENTS.map(dept => {
      const active = selected.includes(dept);
      return (
        <button
          key={dept}
          type="button"
          onClick={() => onChange(active ? selected.filter(d => d !== dept) : [...selected, dept])}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-bold transition-all border',
            active
              ? 'bg-primary text-white border-primary'
              : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-primary/40'
          )}
          title={dept}
        >
          {DEPARTMENT_SHORT_LABELS[dept as Department]}
        </button>
      );
    })}
  </div>
);

// Тохиргооны цонхны маягтын өгөгдөл
interface PlanFormState {
  department: Department;
  periodType: WorkPlanPeriodType;
  year: number;
  periodNo: number;
  weekDate: string;           // 7 хоногийн төрөлд огноо сонгоно
  title: string;
  titleTouched: boolean;      // гараар засвал автомат гарчиг дарж бичихгүй
  approvedByTitle: string;
  approvedByUserId: string;   // гарын үсэг зурах хүн — бүртгэлтэй ажилчдаас
  reviewedByTitle: string;
  reviewedByUserId: string;
  compiledByUserId: string;
  visibleToUserIds: string[];
  editableByUserIds: string[];
  visibleToDepartments: string[];
  editableByDepartments: string[];
  useTemplate: boolean;
}

const emptyForm = (): PlanFormState => {
  const now = new Date();
  return {
    department: DEPARTMENTS[0],
    periodType: 'month',
    year: now.getFullYear(),
    periodNo: now.getMonth() + 1,
    weekDate: toISODate(mondayOf(now)),
    title: '',
    titleTouched: false,
    // Файл дээрх батламжийн блоктой ижил өгөгдмөл утгууд
    approvedByTitle: 'УУР АМЬСГАЛЫН ӨӨРЧЛӨЛТИЙН СУДАЛГАА, ХАМТЫН АЖИЛЛАГААНЫ ТӨВИЙН ЗАХИРАЛ',
    approvedByUserId: '',
    reviewedByTitle: 'Захиргаа, санхүүгийн хэлтсийн дарга',
    reviewedByUserId: '',
    compiledByUserId: '',
    visibleToUserIds: [],
    editableByUserIds: [],
    visibleToDepartments: [],
    editableByDepartments: [],
    useTemplate: false,
  };
};

export const WorkPlansPage: React.FC = () => {
  const { language, profile, workPlans, canEditWorkPlan, addWorkPlan, updateWorkPlan, signWorkPlan, deleteWorkPlan } = useAppContext();
  const confirmDialog = useConfirm();
  const mn = language === 'MN';
  const isAdmin = profile?.role === 'admin';

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  // Нээлттэй хүснэгтийн засварлаж буй хувилбар — "Хадгалах" дарж байж хадгалагдана
  const [draft, setDraft] = useState<WorkPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [signing, setSigning] = useState<'approve' | 'review' | 'compile' | null>(null);

  // Жагсаалтын шүүлтүүр
  const [typeFilter, setTypeFilter] = useState<'all' | WorkPlanPeriodType>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | Department>('all');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');

  // Тохиргооны цонх — үүсгэх ба засах хоёуланд ашиглана
  const [formOpen, setFormOpen] = useState(false);
  const [formPlanId, setFormPlanId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm);
  const [formError, setFormError] = useState('');

  // Ажилчдын жагсаалт — эрхийн тохиргоонд шаардлагатай (зөвхөн админд)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        const data = (await res.json()) as UserProfile[];
        if (!cancelled) setUsers(data.filter(u => u.status === 'approved'));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const openPlan = workPlans.find(p => p.id === openPlanId) || null;

  // Хүснэгт нээгдэх/сервер талд шинэчлэгдэх бүрд засварын хувилбарыг шинэчилнэ
  useEffect(() => {
    setDraft(openPlan ? JSON.parse(JSON.stringify(openPlan)) : null);
    setSaveError('');
  }, [openPlanId, openPlan?.updatedAt]);

  const editable = !!draft && canEditWorkPlan(openPlan || undefined);
  const isDirty = !!draft && !!openPlan && JSON.stringify(draft) !== JSON.stringify(openPlan);

  const years = useMemo(() => {
    const set = new Set<number>(workPlans.map(p => p.year));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [workPlans]);

  const filteredPlans = workPlans.filter(p =>
    (typeFilter === 'all' || p.periodType === typeFilter) &&
    (deptFilter === 'all' || p.department === deptFilter) &&
    (yearFilter === 'all' || p.year === yearFilter)
  );

  // ===== Тохиргооны цонх =====
  const openCreateForm = () => {
    const initial = emptyForm();
    setFormPlanId(null);
    // Гарчгийг эхнээс нь бэлдэж өгнө — хэрэглэгч шаардлагатай бол засна
    setForm({ ...initial, title: buildTitle(initial.department, initial.periodType, initial.year, initial.periodNo) });
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (plan: WorkPlan) => {
    const weekMonday = plan.periodType === 'week' && plan.startDate ? plan.startDate : toISODate(mondayOf(new Date()));
    setFormPlanId(plan.id);
    setForm({
      department: plan.department,
      periodType: plan.periodType,
      year: plan.year,
      periodNo: plan.periodNo || 1,
      weekDate: weekMonday,
      title: plan.title,
      titleTouched: true,
      approvedByTitle: plan.approvedByTitle,
      approvedByUserId: plan.approvedByUserId,
      reviewedByTitle: plan.reviewedByTitle,
      reviewedByUserId: plan.reviewedByUserId,
      compiledByUserId: plan.compiledByUserId,
      visibleToUserIds: [...plan.visibleToUserIds],
      editableByUserIds: [...plan.editableByUserIds],
      visibleToDepartments: [...plan.visibleToDepartments],
      editableByDepartments: [...plan.editableByDepartments],
      useTemplate: false,
    });
    setFormError('');
    setFormOpen(true);
  };

  // Маягтын хугацааны утгуудаас periodNo болон огнооны мужийг гаргана
  const formPeriod = (state: PlanFormState) => {
    if (state.periodType === 'week') {
      const monday = mondayOf(new Date(state.weekDate || toISODate(new Date())));
      const weekNo = isoWeekNumber(monday);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return { periodNo: weekNo, startDate: toISODate(monday), endDate: toISODate(sunday), year: monday.getFullYear() };
    }
    const periodNo = state.periodType === 'year' ? null : state.periodNo;
    return { periodNo, ...periodRange(state.periodType, state.year, periodNo), year: state.year };
  };

  // Гарчгийг гараар засаагүй бол хугацаа/хэлтэс солигдох бүрд автоматаар шинэчилнэ
  const patchForm = (patch: Partial<PlanFormState>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (!next.titleTouched) {
        const { periodNo, year } = formPeriod(next);
        next.title = buildTitle(next.department, next.periodType, year, periodNo);
      }
      return next;
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { periodNo, startDate, endDate, year } = formPeriod(form);
    const title = (form.title || buildTitle(form.department, form.periodType, year, periodNo)).trim();
    if (!title) {
      setFormError(mn ? 'Гарчгаа оруулна уу.' : 'Please enter a title.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const shared = {
        title,
        periodType: form.periodType,
        year,
        periodNo,
        startDate,
        endDate,
        department: form.department,
        approvedByTitle: form.approvedByTitle,
        approvedByUserId: form.approvedByUserId,
        // Нэрийг сонгосон ажилтнаас авна — хэрэглэгч устсан ч баримт дээр нэр үлдэнэ
        approvedByName: users.find(u => u.uid === form.approvedByUserId)?.displayName || '',
        reviewedByTitle: form.reviewedByTitle,
        reviewedByUserId: form.reviewedByUserId,
        reviewedByName: users.find(u => u.uid === form.reviewedByUserId)?.displayName || '',
        compiledByUserId: form.compiledByUserId,
        compiledByName: users.find(u => u.uid === form.compiledByUserId)?.displayName || '',
        visibleToUserIds: form.visibleToUserIds,
        editableByUserIds: form.editableByUserIds,
        visibleToDepartments: form.visibleToDepartments,
        editableByDepartments: form.editableByDepartments,
      };

      if (formPlanId) {
        const existing = workPlans.find(p => p.id === formPlanId);
        if (!existing) return;
        // Тохиргоо солихдоо хүснэгтийн агуулгыг хөндөхгүй
        await updateWorkPlan({ ...existing, ...shared });
      } else {
        const created = await addWorkPlan({
          ...shared,
          columns: DEFAULT_WORK_PLAN_COLUMNS.map(c => ({ ...c })),
          rows: form.useTemplate ? buildWorkPlanTemplateRows() : [{ id: genId(), cells: {} }],
        });
        setOpenPlanId(created.id);
      }
      setFormOpen(false);
    } catch (err: any) {
      setFormError(err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  };

  // ===== Хүснэгтийн засвар =====
  const patchDraft = (patch: Partial<WorkPlan>) => setDraft(prev => (prev ? { ...prev, ...patch } : prev));

  const setCell = (rowId: string, columnId: string, value: string) => {
    setDraft(prev =>
      prev
        ? { ...prev, rows: prev.rows.map(r => (r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: value } } : r)) }
        : prev
    );
  };

  const addRow = () => patchDraft({ rows: [...(draft?.rows || []), { id: genId(), cells: {} }] });

  const deleteRow = async (rowId: string) => {
    if (!(await confirmDialog(mn ? 'Энэ мөрийг устгах уу?' : 'Delete this row?'))) return;
    patchDraft({ rows: (draft?.rows || []).filter(r => r.id !== rowId) });
  };

  const addColumn = () => {
    const column: WorkPlanColumn = { id: genId(), label: mn ? 'Шинэ багана' : 'New column', width: 200 };
    patchDraft({ columns: [...(draft?.columns || []), column] });
  };

  const renameColumn = (columnId: string, label: string) =>
    patchDraft({ columns: (draft?.columns || []).map(c => (c.id === columnId ? { ...c, label } : c)) });

  const deleteColumn = async (columnId: string) => {
    if (!draft) return;
    if (draft.columns.length <= 1) return;
    if (!(await confirmDialog(mn ? 'Энэ баганыг бүх утгын хамт устгах уу?' : 'Delete this column and all of its values?'))) return;
    setDraft(prev =>
      prev
        ? {
            ...prev,
            columns: prev.columns.filter(c => c.id !== columnId),
            rows: prev.rows.map(r => {
              const { [columnId]: _removed, ...rest } = r.cells;
              return { ...r, cells: rest };
            }),
          }
        : prev
    );
  };

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    if (!draft) return;
    const index = draft.columns.findIndex(c => c.id === columnId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.columns.length) return;
    const columns = [...draft.columns];
    [columns[index], columns[target]] = [columns[target], columns[index]];
    patchDraft({ columns });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError('');
    try {
      await updateWorkPlan(draft);
    } catch (err: any) {
      setSaveError(err?.message || (mn ? 'Хадгалах үед алдаа гарлаа' : 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  // Гарын үсэг зурах / буцаах. Хадгалагдаагүй засвар байвал эхлээд хадгалуулна.
  const handleSign = async (role: 'approve' | 'review' | 'compile', revoke: boolean) => {
    if (!draft) return;
    if (isDirty) {
      setSaveError(mn ? 'Эхлээд хүснэгтийн засварыг хадгална уу.' : 'Please save your table changes first.');
      return;
    }
    if (revoke && !(await confirmDialog(
      mn ? 'Гарын үсгээ буцаах уу?' : 'Revoke your signature?',
      { confirmLabel: mn ? 'Буцаах' : 'Revoke' }
    ))) return;

    setSigning(role);
    setSaveError('');
    try {
      await signWorkPlan(draft.id, role, revoke);
    } catch (err: any) {
      setSaveError(err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred'));
    } finally {
      setSigning(null);
    }
  };

  const handleDeletePlan = async (plan: WorkPlan) => {
    if (!(await confirmDialog(mn ? 'Энэ ажлын төлөвлөгөөг бүхэлд нь устгах уу?' : 'Delete this entire work plan?'))) return;
    try {
      await deleteWorkPlan(plan.id);
      if (openPlanId === plan.id) setOpenPlanId(null);
    } catch (err: any) {
      alert(err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred'));
    }
  };

  const exportExcel = (plan: WorkPlan) => {
    const header = plan.columns.map(c => c.label);
    const body = plan.rows.map(r => plan.columns.map(c => r.cells[c.id] || ''));
    const ws = XLSX.utils.aoa_to_sheet([[plan.title], [], header, ...body]);
    ws['!cols'] = plan.columns.map(c => ({ wch: Math.round((c.width || 180) / 8) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mn ? 'Төлөвлөгөө' : 'Work plan');
    XLSX.writeFile(wb, `work-plan-${plan.year}-${plan.periodType}${plan.periodNo ? `-${plan.periodNo}` : ''}.xlsx`);
  };

  // ===== Хүснэгтийн дэлгэрэнгүй харагдац =====
  if (draft) {
    const plan = draft;
    const restrictedView = plan.visibleToUserIds.length + plan.visibleToDepartments.length > 0;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => setOpenPlanId(null)}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {mn ? 'Буцах' : 'Back'}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" />
                  {mn ? 'Мөр нэмэх' : 'Add row'}
                </button>
                <button onClick={addColumn} className="btn-secondary flex items-center gap-2 text-sm">
                  <Columns3 className="w-4 h-4" />
                  {mn ? 'Багана нэмэх' : 'Add column'}
                </button>
              </>
            )}
            <button onClick={() => exportExcel(plan)} className="btn-secondary flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-sm">
              <Printer className="w-4 h-4" />
              {mn ? 'Хэвлэх' : 'Print'}
            </button>
            {isAdmin && (
              <>
                <button onClick={() => openEditForm(plan)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Settings2 className="w-4 h-4" />
                  {mn ? 'Тохиргоо, эрх' : 'Settings'}
                </button>
                <button
                  onClick={() => handleDeletePlan(plan)}
                  className="px-4 py-2 rounded-lg font-medium text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {mn ? 'Устгах' : 'Delete'}
                </button>
              </>
            )}
            {editable && (
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {isDirty ? (mn ? 'Хадгалах' : 'Save') : (mn ? 'Хадгалагдсан' : 'Saved')}
              </button>
            )}
          </div>
        </div>

        {!editable && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm font-medium print:hidden">
            <Lock className="w-4 h-4 flex-shrink-0" />
            {mn ? 'Танд энэ хүснэгтийг зөвхөн харах эрх олгогдсон байна.' : 'You have view-only access to this table.'}
          </div>
        )}

        {saveError && (
          <p className="text-sm text-rose-500 font-medium print:hidden">{saveError}</p>
        )}

        <section className="card space-y-6">
          {/* БАТЛАВ — баримтын толгой */}
          <div className="flex justify-end">
            <div className="max-w-md">
              <SignatureBlock
                label={mn ? 'БАТЛАВ.' : 'APPROVED.'}
                position={plan.approvedByTitle}
                name={plan.approvedByName}
                signedAt={plan.approvedAt}
                canSign={profile?.uid === plan.approvedByUserId}
                onSign={revoke => handleSign('approve', revoke)}
                busy={signing === 'approve'}
                mn={mn}
              />
            </div>
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-base sm:text-lg font-bold uppercase leading-snug text-slate-900 dark:text-slate-100">
              {plan.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 print:hidden">
              {plan.department} · {WORK_PLAN_PERIOD_LABELS[plan.periodType][mn ? 'mn' : 'en']} · {periodLabel(plan, mn)}
              {restrictedView && (
                <> · <span className="text-teal-600 dark:text-teal-400 font-bold">{mn ? 'Тусгай эрхтэй' : 'Restricted'}</span></>
              )}
            </p>
          </div>

          {/* Хүснэгт */}
          <div className="overflow-x-auto table-scroll print:overflow-visible">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr>
                  {plan.columns.map((column, index) => (
                    <th
                      key={column.id}
                      style={{ minWidth: column.width || 180 }}
                      className="align-top border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-2"
                    >
                      {editable ? (
                        <div className="space-y-1">
                          <input
                            value={column.label}
                            onChange={e => renameColumn(column.id, e.target.value)}
                            className="w-full bg-transparent outline-none text-xs font-bold uppercase text-slate-700 dark:text-slate-200 rounded px-1 py-0.5 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-primary/20"
                          />
                          <div className="flex items-center gap-0.5 print:hidden">
                            <button
                              onClick={() => moveColumn(column.id, -1)}
                              disabled={index === 0}
                              className="p-0.5 rounded text-slate-400 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-400"
                              title={mn ? 'Зүүн тийш' : 'Move left'}
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveColumn(column.id, 1)}
                              disabled={index === plan.columns.length - 1}
                              className="p-0.5 rounded text-slate-400 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-400"
                              title={mn ? 'Баруун тийш' : 'Move right'}
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteColumn(column.id)}
                              disabled={plan.columns.length <= 1}
                              className="p-0.5 rounded text-slate-400 hover:text-rose-500 disabled:opacity-30 ml-auto"
                              title={mn ? 'Багана устгах' : 'Delete column'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">{column.label}</span>
                      )}
                    </th>
                  ))}
                  {editable && <th className="border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 w-10 print:hidden" />}
                </tr>
              </thead>
              <tbody>
                {plan.rows.map(row => (
                  <tr key={row.id} className="align-top">
                    {plan.columns.map(column => (
                      <td
                        key={column.id}
                        style={{ minWidth: column.width || 180 }}
                        className="border border-slate-200 dark:border-slate-700 p-0.5 align-top"
                      >
                        {editable ? (
                          <AutoTextarea
                            value={row.cells[column.id] || ''}
                            onChange={value => setCell(row.id, column.id, value)}
                          />
                        ) : (
                          <div className="px-2 py-1.5 text-sm leading-relaxed whitespace-pre-wrap">
                            {row.cells[column.id] || ''}
                          </div>
                        )}
                      </td>
                    ))}
                    {editable && (
                      <td className="border border-slate-200 dark:border-slate-700 text-center align-middle print:hidden">
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                          title={mn ? 'Мөр устгах' : 'Delete row'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {plan.rows.length === 0 && (
                  <tr>
                    <td colSpan={plan.columns.length + (editable ? 1 : 0)} className="border border-slate-200 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
                      {mn ? 'Мөр байхгүй байна. "Мөр нэмэх" дарж эхлүүлнэ үү.' : 'No rows yet. Use "Add row" to start.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {editable && (
            <button
              onClick={addRow}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:border-primary hover:text-primary transition-colors print:hidden"
            >
              <Plus className="w-4 h-4" />
              {mn ? 'Мөр нэмэх' : 'Add row'}
            </button>
          )}

          {/* ХЯНАСАН / ТӨЛӨВЛӨГӨӨ НЭГТГЭСЭН */}
          <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <SignatureBlock
              label={mn ? 'ХЯНАСАН:' : 'REVIEWED BY:'}
              position={plan.reviewedByTitle}
              name={plan.reviewedByName}
              signedAt={plan.reviewedAt}
              canSign={profile?.uid === plan.reviewedByUserId}
              onSign={revoke => handleSign('review', revoke)}
              busy={signing === 'review'}
              mn={mn}
            />
            <SignatureBlock
              label={mn ? 'ТӨЛӨВЛӨГӨӨ НЭГТГЭСЭН:' : 'COMPILED BY:'}
              name={plan.compiledByName}
              signedAt={plan.compiledAt}
              canSign={profile?.uid === plan.compiledByUserId}
              onSign={revoke => handleSign('compile', revoke)}
              busy={signing === 'compile'}
              mn={mn}
            />
          </div>
        </section>

        {renderFormModal()}
      </div>
    );
  }

  // ===== Жагсаалтын харагдац =====
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            {mn ? 'Ажлын төлөвлөгөө' : 'Work Plans'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {mn
              ? 'Жилийн, хагас жилийн, сарын болон 7 хоногийн төлөвлөгөө — хэлтэс тус бүрээр.'
              : 'Annual, half-year, monthly and weekly plans — per department.'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={openCreateForm} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {mn ? 'Төлөвлөгөө үүсгэх' : 'New plan'}
          </button>
        )}
      </div>

      {/* Шүүлтүүр */}
      <div className="card space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 uppercase mr-1">{mn ? 'Төрөл' : 'Type'}</span>
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
              typeFilter === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            )}
          >
            {mn ? 'Бүгд' : 'All'}
          </button>
          {PERIOD_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                typeFilter === type ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              )}
            >
              {WORK_PLAN_PERIOD_LABELS[type][mn ? 'mn' : 'en']}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-400 uppercase mr-1">{mn ? 'Хэлтэс' : 'Dept'}</span>
          <button
            onClick={() => setDeptFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
              deptFilter === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            )}
          >
            {mn ? 'Бүгд' : 'All'}
          </button>
          {DEPARTMENTS.map(dept => (
            <button
              key={dept}
              onClick={() => setDeptFilter(dept)}
              title={dept}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-bold transition-all',
                deptFilter === dept ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              )}
            >
              {DEPARTMENT_SHORT_LABELS[dept]}
            </button>
          ))}

          <span className="text-xs font-bold text-slate-400 uppercase ml-3 mr-1">{mn ? 'Он' : 'Year'}</span>
          <select
            value={String(yearFilter)}
            onChange={e => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 outline-none"
          >
            <option value="all">{mn ? 'Бүгд' : 'All'}</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredPlans.length === 0 ? (
        <div className="card text-center py-16">
          <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {mn ? 'Ажлын төлөвлөгөө алга байна.' : 'No work plans yet.'}
          </p>
          {isAdmin && (
            <p className="text-sm text-slate-400 mt-1">
              {mn ? '"Төлөвлөгөө үүсгэх" дарж хэлтсийн төлөвлөгөө нэмнэ үү.' : 'Use "New plan" to create one.'}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPlans.map(plan => {
            const canEdit = canEditWorkPlan(plan);
            const restricted =
              plan.visibleToUserIds.length + plan.visibleToDepartments.length +
              plan.editableByUserIds.length + plan.editableByDepartments.length > 0;

            return (
              <button
                key={plan.id}
                onClick={() => setOpenPlanId(plan.id)}
                className="card text-left hover:border-primary/40 hover:shadow-md transition-all space-y-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">
                    {WORK_PLAN_PERIOD_LABELS[plan.periodType][mn ? 'mn' : 'en']}
                  </span>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <Building2 className="w-3 h-3" />
                    {DEPARTMENT_SHORT_LABELS[plan.department]}
                  </span>
                  {restricted && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
                      <Users className="w-3 h-3" />
                      {mn ? 'Тусгай эрх' : 'Restricted'}
                    </span>
                  )}
                  <span className={cn(
                    'ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold',
                    canEdit
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  )}>
                    {canEdit ? <Pencil className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {canEdit ? (mn ? 'Засах' : 'Edit') : (mn ? 'Харах' : 'View')}
                  </span>
                </div>

                <h3 className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100 line-clamp-3">
                  {plan.title}
                </h3>

                <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>{periodLabel(plan, mn)}</span>
                  <span>{plan.rows.length} {mn ? 'мөр' : 'rows'} · {plan.columns.length} {mn ? 'багана' : 'cols'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {renderFormModal()}
    </div>
  );

  // Үүсгэх/тохируулах цонх — жагсаалт, дэлгэрэнгүй хоёуланд ашиглагдана
  function renderFormModal() {
    return (
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        closeOnBackdropClick={false}
        title={formPlanId ? (mn ? 'Төлөвлөгөөний тохиргоо' : 'Plan settings') : (mn ? 'Ажлын төлөвлөгөө үүсгэх' : 'New work plan')}
        className="max-w-2xl"
      >
        <form onSubmit={handleFormSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Хэлтэс' : 'Department'}</label>
              <select
                value={form.department}
                onChange={e => patchForm({ department: e.target.value as Department })}
                className="input-field"
              >
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Төлөвлөгөөний төрөл' : 'Plan type'}</label>
              <select
                value={form.periodType}
                onChange={e => patchForm({ periodType: e.target.value as WorkPlanPeriodType })}
                className="input-field"
              >
                {PERIOD_TYPES.map(type => (
                  <option key={type} value={type}>{WORK_PLAN_PERIOD_LABELS[type][mn ? 'mn' : 'en']}</option>
                ))}
              </select>
            </div>

            {form.periodType !== 'week' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Он' : 'Year'}</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.year}
                  onChange={e => patchForm({ year: Number(e.target.value) })}
                  className="input-field"
                />
              </div>
            )}

            {form.periodType === 'halfyear' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Хагас жил' : 'Half'}</label>
                <select value={form.periodNo} onChange={e => patchForm({ periodNo: Number(e.target.value) })} className="input-field">
                  <option value={1}>{mn ? 'Эхний хагас жил (1-6 сар)' : 'First half (Jan–Jun)'}</option>
                  <option value={2}>{mn ? 'Сүүлийн хагас жил (7-12 сар)' : 'Second half (Jul–Dec)'}</option>
                </select>
              </div>
            )}

            {form.periodType === 'month' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Сар' : 'Month'}</label>
                <select value={form.periodNo} onChange={e => patchForm({ periodNo: Number(e.target.value) })} className="input-field">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{mn ? `${m}-р сар` : new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}</option>
                  ))}
                </select>
              </div>
            )}

            {form.periodType === 'week' && (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? '7 хоногийн аль нэг өдөр' : 'Any day of the week'}</label>
                <input
                  type="date"
                  value={form.weekDate}
                  onChange={e => patchForm({ weekDate: e.target.value })}
                  className="input-field"
                />
                <p className="text-[11px] text-slate-400 ml-1">
                  {(() => {
                    const { periodNo, startDate, endDate, year } = formPeriod(form);
                    return mn
                      ? `${year} оны ${periodNo}-р 7 хоног: ${startDate} – ${endDate}`
                      : `${year} week ${periodNo}: ${startDate} – ${endDate}`;
                  })()}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Гарчиг' : 'Title'}</label>
            <textarea
              rows={2}
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value, titleTouched: true }))}
              className="input-field"
              placeholder={buildTitle(form.department, form.periodType, form.year, form.periodNo)}
            />
          </div>

          {/* Гарын үсгийн блокууд — гарын үсэг зурах хүнийг бүртгэлтэй ажилчдаас сонгоно */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">{mn ? 'Гарын үсгийн хэсэг' : 'Signature blocks'}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {mn
                  ? 'Сонгогдсон ажилтан төлөвлөгөө дээрээ "Батлах" товч дарж өөрөө баталгаажуулна.'
                  : 'The selected employee confirms the plan by pressing "Approve" on it.'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'БАТЛАВ — албан тушаал' : 'Approved by — position'}</label>
                <input value={form.approvedByTitle} onChange={e => setForm(prev => ({ ...prev, approvedByTitle: e.target.value }))} className="input-field" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'БАТЛАВ — ажилтан' : 'Approved by — employee'}</label>
                <SignerSelect users={users} value={form.approvedByUserId} onChange={uid => setForm(prev => ({ ...prev, approvedByUserId: uid }))} mn={mn} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'ХЯНАСАН — албан тушаал' : 'Reviewed by — position'}</label>
                <input value={form.reviewedByTitle} onChange={e => setForm(prev => ({ ...prev, reviewedByTitle: e.target.value }))} className="input-field" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'ХЯНАСАН — ажилтан' : 'Reviewed by — employee'}</label>
                <SignerSelect users={users} value={form.reviewedByUserId} onChange={uid => setForm(prev => ({ ...prev, reviewedByUserId: uid }))} mn={mn} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'ТӨЛӨВЛӨГӨӨ НЭГТГЭСЭН — ажилтан' : 'Compiled by — employee'}</label>
                <SignerSelect users={users} value={form.compiledByUserId} onChange={uid => setForm(prev => ({ ...prev, compiledByUserId: uid }))} mn={mn} />
              </div>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {mn
                ? 'Анхаар: гарын үсэг зурах хүнийг солиход тухайн баталгаажуулалт хүчингүй болж, шинээр батлуулна.'
                : 'Note: changing a signer clears their existing approval.'}
            </p>
          </div>

          {/* Тусгай эрхийн тохиргоо */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">{mn ? 'Тусгай эрхийн тохиргоо' : 'Access settings'}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {mn
                  ? 'Хоосон орхивол энэ хүснэгт бүх ажилтанд зөвхөн харах эрхтэйгээр нээлттэй байна. Админ үргэлж бүрэн эрхтэй.'
                  : 'Leave empty to make the table view-only for everyone. Admins always have full access.'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'ХАРАХ — хэлтэс' : 'VIEW — departments'}</label>
              <DepartmentChips selected={form.visibleToDepartments} onChange={list => setForm(prev => ({ ...prev, visibleToDepartments: list }))} />
              <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 block pt-1">{mn ? 'ХАРАХ — тодорхой ажилтан' : 'VIEW — specific employees'}</label>
              <UserPicker
                users={users}
                selected={form.visibleToUserIds}
                onChange={list => setForm(prev => ({ ...prev, visibleToUserIds: list }))}
                emptyLabel={mn ? 'Ажилтан сонгоогүй' : 'No employees selected'}
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="text-[11px] font-bold text-slate-400 uppercase ml-1">{mn ? 'ЗАСАХ — хэлтэс' : 'EDIT — departments'}</label>
              <DepartmentChips selected={form.editableByDepartments} onChange={list => setForm(prev => ({ ...prev, editableByDepartments: list }))} />
              <label className="text-[11px] font-bold text-slate-400 uppercase ml-1 block pt-1">{mn ? 'ЗАСАХ — тодорхой ажилтан' : 'EDIT — specific employees'}</label>
              <UserPicker
                users={users}
                selected={form.editableByUserIds}
                onChange={list => setForm(prev => ({ ...prev, editableByUserIds: list }))}
                emptyLabel={mn ? 'Ажилтан сонгоогүй' : 'No employees selected'}
              />
              <p className="text-[11px] text-slate-400 ml-1">
                {mn ? 'Засах эрх олгогдсон ажилтан хүснэгтийг автоматаар харна.' : 'Employees with edit access can always view the table.'}
              </p>
            </div>
          </div>

          {!formPlanId && (
            <label className="flex items-start gap-3 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={form.useTemplate}
                onChange={e => setForm(prev => ({ ...prev, useTemplate: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary mt-0.5"
              />
              <span className="text-sm">
                {mn ? `Файл дээрх жишээ мөрүүдээр эхлүүлэх (${WORK_PLAN_TEMPLATE_ROW_COUNT} мөр)` : `Start from the sample rows (${WORK_PLAN_TEMPLATE_ROW_COUNT} rows)`}
                <span className="block text-[11px] text-slate-400">
                  {mn
                    ? 'Тэмдэглэхгүй бол баганууд өгөгдмөлөөрөө үүсээд хоосон нэг мөр нэмэгдэнэ.'
                    : 'Otherwise the default columns are created with one empty row.'}
                </span>
              </span>
            </label>
          )}

          {formError && <p className="text-xs text-rose-500 font-medium">{formError}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
              {saving
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Save className="w-4 h-4" />}
              {formPlanId ? (mn ? 'Хадгалах' : 'Save') : (mn ? 'Үүсгэх' : 'Create')}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="btn-secondary px-5 py-2.5">
              {mn ? 'Болих' : 'Cancel'}
            </button>
          </div>
        </form>
      </Modal>
    );
  }
};
