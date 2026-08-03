import React, { useState } from 'react';
import {
  Vote,
  Plus,
  X,
  Trash2,
  Lock,
  CheckCircle2,
  Circle,
  CheckSquare,
  Square,
  Clock,
  Users,
  EyeOff,
  ListChecks,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/utils';
import { Poll, UserProfile } from '../types';

// Санал асуулгын хуудас — бүх ажилтан асуулга үүсгэж, санал өгч болно.
// Хаах/устгах эрх нь зөвхөн үүсгэсэн хүн болон админд бий.
export const PollsPage: React.FC = () => {
  const { language, profile, polls, addPoll, votePoll, closePoll, deletePoll } = useAppContext();
  const confirmDialog = useConfirm();
  const mn = language === 'MN';

  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  // Сонголтын хязгаарын горим: хязгааргүй / доод-дээд хязгаар / яг тодорхой тоо
  const [limitMode, setLimitMode] = useState<'none' | 'range' | 'exact'>('none');
  const [minLimit, setMinLimit] = useState('');
  const [maxLimit, setMaxLimit] = useState('');
  const [exactLimit, setExactLimit] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  // Оролцох ажилчид (хоосон бол бүх ажилтан)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isUsersOpen, setIsUsersOpen] = useState(false);
  // Dropdown доторх хэлтсийн шүүлтүүр ('all' = бүх хэлтэс)
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [closesAt, setClosesAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Асуулга тус бүрийн түр сонголт (санал өгөхөөс өмнө)
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  // Санал өгсөн ч "Саналаа өөрчлөх" дарсан асуулгууд
  const [editingVote, setEditingVote] = useState<Record<string, boolean>>({});
  // Олон сонголттой урт асуулгыг дэлгэсэн эсэх (хураангуй ↔ дэлгэрэнгүй)
  const [expandedPolls, setExpandedPolls] = useState<Record<string, boolean>>({});
  const [votingId, setVotingId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<Record<string, string>>({});

  // Ажилчдын жагсаалт — зөвхөн админд (асуулга үүсгэхэд оролцогч сонгоход) хэрэгтэй
  React.useEffect(() => {
    if (profile?.role !== 'admin') return;
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
  }, [profile?.role]);

  const resetForm = () => {
    setQuestion('');
    setDescription('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setLimitMode('none');
    setMinLimit('');
    setMaxLimit('');
    setExactLimit('');
    setAnonymous(false);
    setSelectedUserIds([]);
    setIsUsersOpen(false);
    setDeptFilter('all');
    setClosesAt('');
    setFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim()) {
      setFormError(mn ? 'Асуултаа оруулна уу.' : 'Please enter a question.');
      return;
    }
    if (cleanOptions.length < 2) {
      setFormError(mn ? 'Дор хаяж 2 сонголт оруулна уу.' : 'Please enter at least 2 options.');
      return;
    }

    // Сонголтын хязгаарыг горимоос тооцоолж шалгана
    let minChoices: number | null = null;
    let maxChoices: number | null = null;
    if (allowMultiple && limitMode === 'range') {
      minChoices = minLimit ? parseInt(minLimit, 10) : null;
      maxChoices = maxLimit ? parseInt(maxLimit, 10) : null;
      if (minChoices == null && maxChoices == null) {
        setFormError(mn ? 'Доод эсвэл дээд хязгаарын аль нэгийг оруулна уу.' : 'Enter a minimum or maximum limit.');
        return;
      }
      if ((minChoices != null && (minChoices < 1 || minChoices > cleanOptions.length)) ||
          (maxChoices != null && (maxChoices < 1 || maxChoices > cleanOptions.length))) {
        setFormError(mn ? `Хязгаар 1-ээс ${cleanOptions.length} хооронд байх ёстой.` : `Limits must be between 1 and ${cleanOptions.length}.`);
        return;
      }
      if (minChoices != null && maxChoices != null && minChoices > maxChoices) {
        setFormError(mn ? 'Доод хязгаар дээд хязгаараас их байж болохгүй.' : 'Minimum cannot be greater than maximum.');
        return;
      }
    }
    if (allowMultiple && limitMode === 'exact') {
      const exact = exactLimit ? parseInt(exactLimit, 10) : NaN;
      if (!Number.isInteger(exact) || exact < 1 || exact > cleanOptions.length) {
        setFormError(mn ? `Сонгох тоо 1-ээс ${cleanOptions.length} хооронд байх ёстой.` : `The exact count must be between 1 and ${cleanOptions.length}.`);
        return;
      }
      minChoices = exact;
      maxChoices = exact;
    }

    setSaving(true);
    setFormError('');
    try {
      await addPoll({
        question: question.trim(),
        description: description.trim(),
        options: cleanOptions,
        allowMultiple,
        minChoices,
        maxChoices,
        anonymous,
        visibleToUserIds: selectedUserIds,
        closesAt: closesAt || undefined,
      });
      resetForm();
      setShowCreate(false);
    } catch (err: any) {
      setFormError(err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const toggleSelection = (poll: Poll, optionId: string) => {
    setSelections(prev => {
      const current = prev[poll.id] || [];
      if (poll.allowMultiple) {
        if (current.includes(optionId)) {
          return { ...prev, [poll.id]: current.filter(id => id !== optionId) };
        }
        // Дээд хязгаарт хүрсэн бол нэмэхгүй
        if (poll.maxChoices != null && current.length >= poll.maxChoices) {
          return prev;
        }
        return { ...prev, [poll.id]: [...current, optionId] };
      }
      return { ...prev, [poll.id]: [optionId] };
    });
  };

  const handleVote = async (poll: Poll) => {
    const chosen = selections[poll.id] || [];
    if (chosen.length === 0) return;
    setVotingId(poll.id);
    setVoteError(prev => ({ ...prev, [poll.id]: '' }));
    try {
      await votePoll(poll.id, chosen);
      setEditingVote(prev => ({ ...prev, [poll.id]: false }));
      setSelections(prev => ({ ...prev, [poll.id]: [] }));
    } catch (err: any) {
      setVoteError(prev => ({ ...prev, [poll.id]: err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred') }));
    } finally {
      setVotingId(null);
    }
  };

  const handleClose = async (poll: Poll) => {
    if (!(await confirmDialog(
      mn ? 'Санал асуулгыг хаах уу? Дахин санал өгөх боломжгүй болно.' : 'Close this poll? No more votes will be accepted.',
      { confirmLabel: mn ? 'Хаах' : 'Close' }
    ))) return;
    try {
      await closePoll(poll.id);
    } catch (err: any) {
      alert(err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred'));
    }
  };

  const handleDelete = async (poll: Poll) => {
    if (!(await confirmDialog(mn ? 'Санал асуулгыг бүх саналын хамт устгах уу?' : 'Delete this poll and all of its votes?'))) return;
    try {
      await deletePoll(poll.id);
    } catch (err: any) {
      alert(err?.message || (mn ? 'Алдаа гарлаа' : 'An error occurred'));
    }
  };

  // Асуулга нэмэх, хаах, устгах эрх: зөвхөн админ
  const isAdmin = profile?.role === 'admin';

  // Хуанлийн "Харах хэрэглэгч" сонгогчтой ижил: хэлтсийн шүүлтүүр + Бүгд сонгох
  const departments = [
    { key: 'Захиргаа, санхүүгийн хэлтэс', label: 'Захиргаа' },
    { key: 'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс', label: 'Төсөл' },
    { key: 'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс', label: 'Судалгаа' },
    { key: 'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс', label: 'МК' },
  ];

  const toggleSelectedUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleAllSelectedUsers = () => {
    const filteredUsers = deptFilter === 'all' ? users : users.filter(u => u.department === deptFilter);
    const filteredIds = filteredUsers.map(u => u.uid);
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedUserIds.includes(id));
    setSelectedUserIds(prev =>
      allFilteredSelected
        ? prev.filter(id => !filteredIds.includes(id))
        : [...new Set([...prev, ...filteredIds])]
    );
  };
  const canManage = (_poll: Poll) => isAdmin;

  // Сонголтын хязгаарын тайлбар (жишээ: "Яг 5 сонголт", "2–5 сонголт")
  const choiceLimitLabel = (poll: Poll): string => {
    const min = poll.minChoices ?? null;
    const max = poll.maxChoices ?? null;
    if (min != null && max != null) {
      if (min === max) return mn ? `Яг ${min} сонголт` : `Exactly ${min} choices`;
      return mn ? `${min}–${max} сонголт` : `${min}–${max} choices`;
    }
    if (max != null) return mn ? `Дээд тал нь ${max} сонголт` : `Up to ${max} choices`;
    if (min != null) return mn ? `Дор хаяж ${min} сонголт` : `At least ${min} choices`;
    return mn ? 'Олон сонголт' : 'Multiple choice';
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(mn ? 'mn-MN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const openPolls = polls.filter(p => p.status === 'open');
  const closedPolls = polls.filter(p => p.status === 'closed');

  const renderPollCard = (poll: Poll) => {
    const isOpen = poll.status === 'open';
    const hasVoted = poll.myOptionIds.length > 0;
    const isEditing = !!editingVote[poll.id];
    // Санал өгөх горим: нээлттэй + (санал өгөөгүй эсвэл өөрчилж байгаа)
    const showVoteForm = isOpen && (!hasVoted || isEditing);
    const showResults = !showVoteForm;
    const chosen = selections[poll.id] || (isEditing ? poll.myOptionIds : []);
    const maxCount = Math.max(1, ...poll.results.map(r => r.count));
    // Хувийг нийт өгөгдсөн саналын тооноос бодно — олон сонголттой үед ч
    // бүх сонголтын хувийн нийлбэр 100% болно
    const totalCastVotes = poll.results.reduce((sum, r) => sum + r.count, 0);
    // Санал өгөхөд шаардагдах сонголтын тоо (хязгааргүй бол 1..бүх сонголт)
    const minRequired = poll.allowMultiple ? Math.max(1, poll.minChoices ?? 1) : 1;
    const maxAllowed = poll.allowMultiple ? (poll.maxChoices ?? poll.options.length) : 1;
    const selectionValid = chosen.length >= minRequired && chosen.length <= maxAllowed;

    // Minimal: анхнаасаа хураангуй — зөвхөн асуулт харагдана.
    // "Дэлгэрэнгүй" дарахад л сонголт, дүн, санал өгсөн хүмүүс харагдана.
    const isExpanded = !!expandedPolls[poll.id];

    return (
      <div key={poll.id} className="card space-y-4">
        {/* Толгой: төлөв, тохиргооны badge-ууд */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'px-2.5 py-1 rounded-full text-xs font-bold',
            isOpen
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
          )}>
            {isOpen ? (mn ? 'Нээлттэй' : 'Open') : (mn ? 'Хаагдсан' : 'Closed')}
          </span>
          {poll.anonymous && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
              <EyeOff className="w-3 h-3" />
              {mn ? 'Нууц санал' : 'Anonymous'}
            </span>
          )}
          {poll.allowMultiple && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">
              <ListChecks className="w-3 h-3" />
              {choiceLimitLabel(poll)}
            </span>
          )}
          {(poll.visibleToUserIds || []).length > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
              <Users className="w-3 h-3" />
              {poll.visibleToUserIds!.length} {mn ? 'ажилтан' : 'employees'}
            </span>
          )}
          {poll.closesAt && isOpen && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              <Clock className="w-3 h-3" />
              {mn ? 'Дуусах:' : 'Ends:'} {poll.closesAt}
            </span>
          )}

          {canManage(poll) && (
            <div className="ml-auto flex items-center gap-1">
              {isOpen && (
                <button
                  onClick={() => handleClose(poll)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  title={mn ? 'Санал асуулгыг хаах' : 'Close poll'}
                >
                  <Lock className="w-3.5 h-3.5" />
                  {mn ? 'Хаах' : 'Close'}
                </button>
              )}
              <button
                onClick={() => handleDelete(poll)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                title={mn ? 'Устгах' : 'Delete'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Асуулт */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{poll.question}</h3>
          {isExpanded && poll.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-wrap">{poll.description}</p>
          )}
        </div>

        {/* Санал өгөх хэсэг */}
        {isExpanded && showVoteForm && (
          <div className="space-y-2">
            {poll.options.map(option => {
              const selected = chosen.includes(option.id);
              const SelectedIcon = poll.allowMultiple ? CheckSquare : CheckCircle2;
              const UnselectedIcon = poll.allowMultiple ? Square : Circle;
              return (
                <button
                  key={option.id}
                  onClick={() => toggleSelection(poll, option.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                    selected
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300',
                    // Дээд хязгаарт хүрсэн үед сонгогдоогүй сонголтуудыг бүдэгрүүлнэ
                    !selected && poll.allowMultiple && poll.maxChoices != null && chosen.length >= poll.maxChoices && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  {selected
                    ? <SelectedIcon className="w-5 h-5 flex-shrink-0" />
                    : <UnselectedIcon className="w-5 h-5 flex-shrink-0 text-slate-400" />}
                  <span className="font-medium">{option.text}</span>
                </button>
              );
            })}

            {/* Олон сонголттой үед сонгосон тоо болон шаардлагыг харуулна */}
            {poll.allowMultiple && (
              <p className={cn(
                'text-xs font-medium ml-1',
                selectionValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
              )}>
                {mn ? 'Сонгосон:' : 'Selected:'} {chosen.length}
                {poll.maxChoices != null && ` / ${poll.maxChoices}`}
                {!selectionValid && ` — ${choiceLimitLabel(poll)} ${mn ? 'хийнэ' : 'required'}`}
              </p>
            )}

            {voteError[poll.id] && <p className="text-xs text-rose-500 font-medium">{voteError[poll.id]}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleVote(poll)}
                disabled={!selectionValid || votingId === poll.id}
                className="btn-primary px-5 py-2.5 flex items-center gap-2 disabled:opacity-50"
              >
                {votingId === poll.id
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Vote className="w-4 h-4" />}
                {mn ? 'Санал өгөх' : 'Vote'}
              </button>
              {isEditing && (
                <button
                  onClick={() => {
                    setEditingVote(prev => ({ ...prev, [poll.id]: false }));
                    setSelections(prev => ({ ...prev, [poll.id]: [] }));
                  }}
                  className="btn-secondary px-4 py-2.5"
                >
                  {mn ? 'Болих' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Дүн — санал өгсний дараа эсвэл хаагдсан үед */}
        {isExpanded && showResults && (
          <div className="space-y-3">
            {poll.results.map(result => {
              const option = poll.options.find(o => o.id === result.optionId);
              if (!option) return null;
              const percent = totalCastVotes > 0 ? Math.round((result.count / totalCastVotes) * 100) : 0;
              const isMine = poll.myOptionIds.includes(option.id);
              const isLeading = result.count > 0 && result.count === maxCount;
              return (
                <div key={option.id}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={cn('text-sm font-medium flex items-center gap-1.5', isMine ? 'text-primary' : 'text-slate-700 dark:text-slate-300')}>
                      {isMine && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                      {option.text}
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">
                      {result.count} {mn ? 'санал' : 'votes'} · {percent}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', isLeading ? 'bg-primary' : 'bg-primary/40')}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  {!poll.anonymous && result.voters.length > 0 && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate" title={result.voters.join(', ')}>
                      {result.voters.join(', ')}
                    </p>
                  )}
                </div>
              );
            })}

            {isOpen && hasVoted && (
              <button
                onClick={() => {
                  setEditingVote(prev => ({ ...prev, [poll.id]: true }));
                  setSelections(prev => ({ ...prev, [poll.id]: poll.myOptionIds }));
                }}
                className="text-xs font-bold text-primary hover:underline"
              >
                {mn ? 'Саналаа өөрчлөх' : 'Change my vote'}
              </button>
            )}
          </div>
        )}

        {/* Дэлгэрэнгүй / Хураах — сонголт, дүн, санал өгсөн хүмүүсийг нээж хаана */}
        <button
          onClick={() => setExpandedPolls(prev => ({ ...prev, [poll.id]: !isExpanded }))}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-primary hover:bg-primary/5 transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {isExpanded ? (mn ? 'Хураах' : 'Collapse') : (mn ? 'Дэлгэрэнгүй' : 'Details')}
        </button>

        {/* Хөл: үүсгэсэн хүн, огноо, оролцоо */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
          <span>{poll.createdByName} · {formatDate(poll.createdAt)}</span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {poll.totalVotes} {mn ? 'хүн санал өгсөн' : 'voted'}
          </span>
          {isOpen && !hasVoted && (
            <span className="text-amber-500 font-medium">{mn ? 'Та санал өгөөгүй байна' : 'You have not voted yet'}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Толгой хэсэг */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Vote className="w-7 h-7 text-primary" />
            {mn ? 'Санал асуулга' : 'Polls'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? (mn ? 'Хамт олны санал асуулга үүсгэж, саналаа өгөөрэй' : 'Create polls and cast your vote')
              : (mn ? 'Нээлттэй асуулгад саналаа өгөөрэй' : 'Cast your vote in open polls')}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5">
            <Plus className="w-5 h-5" />
            {mn ? 'Шинэ асуулга' : 'New Poll'}
          </button>
        )}
      </div>

      {polls.length === 0 && (
        <div className="card text-center py-16">
          <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="font-medium text-slate-500 dark:text-slate-400">
            {mn ? 'Одоогоор санал асуулга алга байна' : 'No polls yet'}
          </p>
          {isAdmin && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              {mn ? '«Шинэ асуулга» товчоор эхний асуулгаа үүсгээрэй' : 'Create the first poll with the "New Poll" button'}
            </p>
          )}
        </div>
      )}

      {openPolls.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {openPolls.map(renderPollCard)}
        </div>
      )}

      {closedPolls.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
            {mn ? 'Хаагдсан асуулгууд' : 'Closed polls'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {closedPolls.map(renderPollCard)}
          </div>
        </div>
      )}

      {/* Шинэ асуулга үүсгэх modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" />
                {mn ? 'Шинэ санал асуулга' : 'New Poll'}
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Асуулт' : 'Question'} *</label>
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  className="input-field"
                  placeholder={mn ? 'Жишээ: Баярын арга хэмжээг хэзээ зохион байгуулах вэ?' : 'e.g. When should we hold the celebration?'}
                  maxLength={500}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Тайлбар (заавал биш)' : 'Description (optional)'}</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="input-field min-h-[70px]"
                  placeholder={mn ? 'Нэмэлт тайлбар...' : 'Additional details...'}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Сонголтууд' : 'Options'} *</label>
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={e => setOptions(prev => prev.map((o, i) => (i === index ? e.target.value : o)))}
                      className="input-field flex-1"
                      placeholder={`${mn ? 'Сонголт' : 'Option'} ${index + 1}`}
                      maxLength={255}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions(prev => prev.filter((_, i) => i !== index))}
                        className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                        aria-label={mn ? 'Сонголт хасах' : 'Remove option'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions(prev => [...prev, ''])}
                  className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline ml-1"
                >
                  <Plus className="w-4 h-4" />
                  {mn ? 'Сонголт нэмэх' : 'Add option'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-3 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowMultiple}
                    onChange={e => setAllowMultiple(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm font-medium">{mn ? 'Олон сонголт зөвшөөрөх' : 'Allow multiple choices'}</span>
                </label>

                {/* Олон сонголттой үед: хэдэн сонголт хийхийг хязгаарлах тохиргоо */}
                {allowMultiple && (
                  <div className="ml-7 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">{mn ? 'Сонголтын тооны хязгаар' : 'Choice limit'}</label>
                    <select
                      value={limitMode}
                      onChange={e => setLimitMode(e.target.value as 'none' | 'range' | 'exact')}
                      className="input-field text-sm"
                    >
                      <option value="none">{mn ? 'Хязгааргүй (хүссэн тоогоо сонгоно)' : 'No limit (choose any number)'}</option>
                      <option value="range">{mn ? 'Доод / дээд хязгаар тогтоох' : 'Set minimum / maximum'}</option>
                      <option value="exact">{mn ? 'Яг тодорхой тоо сонгуулах' : 'Require an exact number'}</option>
                    </select>

                    {limitMode === 'range' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-400 uppercase">{mn ? 'Доод тал нь' : 'Minimum'}</label>
                          <input
                            type="number"
                            min={1}
                            max={options.length}
                            value={minLimit}
                            onChange={e => setMinLimit(e.target.value)}
                            className="input-field text-sm"
                            placeholder={mn ? 'Жишээ: 2' : 'e.g. 2'}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-400 uppercase">{mn ? 'Дээд тал нь' : 'Maximum'}</label>
                          <input
                            type="number"
                            min={1}
                            max={options.length}
                            value={maxLimit}
                            onChange={e => setMaxLimit(e.target.value)}
                            className="input-field text-sm"
                            placeholder={mn ? 'Жишээ: 5' : 'e.g. 5'}
                          />
                        </div>
                      </div>
                    )}

                    {limitMode === 'exact' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 uppercase">{mn ? 'Сонгох ёстой тоо' : 'Required count'}</label>
                        <input
                          type="number"
                          min={1}
                          max={options.length}
                          value={exactLimit}
                          onChange={e => setExactLimit(e.target.value)}
                          className="input-field text-sm"
                          placeholder={mn ? 'Жишээ: 5' : 'e.g. 5'}
                        />
                      </div>
                    )}

                    {limitMode !== 'none' && (
                      <p className="text-[11px] text-slate-400">
                        {limitMode === 'range'
                          ? (mn ? 'Аль нэгийг нь хоосон үлдээвэл тухайн тал хязгааргүй болно.' : 'Leave one empty for no limit on that side.')
                          : (mn ? 'Санал өгөгч яг энэ тооны сонголт хийж байж санал өгнө.' : 'Voters must select exactly this many options.')}
                      </p>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-3 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={e => setAnonymous(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm font-medium">{mn ? 'Нууц санал асуулга (хэн санал өгсөн нь харагдахгүй)' : 'Anonymous poll (voters are hidden)'}</span>
                </label>
              </div>

              {/* Оролцох ажилчид — хоосон бол бүх ажилтанд нээлттэй */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Оролцох ажилчид' : 'Participants'}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUsersOpen(prev => !prev)}
                    className="input-field w-full text-left flex items-center justify-between"
                  >
                    <span className="truncate">
                      {selectedUserIds.length > 0
                        ? `${selectedUserIds
                            .map(uid => users.find(u => u.uid === uid)?.displayName || uid)
                            .slice(0, 3)
                            .join(', ')}${selectedUserIds.length > 3 ? '…' : ''} (${selectedUserIds.length})`
                        : (mn ? 'Бүх ажилтан' : 'All employees')}
                    </span>
                    <span className="text-slate-400 text-xs">▼</span>
                  </button>
                  {isUsersOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
                      {/* Хэлтсийн шүүлтүүр — хуанлийн сонгогчтой ижил */}
                      <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setDeptFilter('all')}
                          className={cn("px-2 py-0.5 rounded-full text-xs font-bold transition-all", deptFilter === 'all' ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}
                        >
                          {mn ? 'Бүгд' : 'All'}
                        </button>
                        {departments.map(dept => (
                          <button
                            key={dept.key}
                            type="button"
                            onClick={() => setDeptFilter(dept.key)}
                            className={cn("px-2 py-0.5 rounded-full text-xs font-bold transition-all", deptFilter === dept.key ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}
                          >
                            {dept.label}
                          </button>
                        ))}
                      </div>
                      <div className="p-3 max-h-44 overflow-y-auto space-y-2">
                        {(() => {
                          const filteredUsers = deptFilter === 'all' ? users : users.filter(u => u.department === deptFilter);
                          const filteredIds = filteredUsers.map(u => u.uid);
                          const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedUserIds.includes(id));
                          return (
                            <>
                              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
                                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllSelectedUsers} />
                                <span>{mn ? 'Бүгд сонгох' : 'Select all'} ({filteredUsers.filter(u => selectedUserIds.includes(u.uid)).length}/{filteredUsers.length})</span>
                              </label>
                              {filteredUsers.map(user => (
                                <label key={user.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                  <input type="checkbox" checked={selectedUserIds.includes(user.uid)} onChange={() => toggleSelectedUser(user.uid)} />
                                  <span>{user.displayName}</span>
                                </label>
                              ))}
                              {filteredUsers.length === 0 && (
                                <p className="text-xs text-slate-400 text-center py-2">{mn ? 'Ажилтан байхгүй' : 'No users'}</p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 ml-1">
                  {mn ? 'Ажилтан сонгоогүй бол асуулга бүх ажилтанд харагдана' : 'If no one is selected, the poll is visible to all employees'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{mn ? 'Дуусах огноо (заавал биш)' : 'End date (optional)'}</label>
                <input
                  type="date"
                  value={closesAt}
                  onChange={e => setClosesAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="input-field"
                />
                <p className="text-[11px] text-slate-400 ml-1">
                  {mn ? 'Энэ өдрөөс хойш санал асуулга автоматаар хаагдана' : 'The poll closes automatically after this date'}
                </p>
              </div>

              {formError && <p className="text-xs text-rose-500 font-medium">{formError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary px-4 py-2.5">
                  {mn ? 'Болих' : 'Cancel'}
                </button>
                <button type="submit" disabled={saving} className="btn-primary px-5 py-2.5 flex items-center gap-2 disabled:opacity-50">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Plus className="w-4 h-4" />}
                  {mn ? 'Үүсгэх' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
