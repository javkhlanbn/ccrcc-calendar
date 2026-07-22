import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  NotebookPen,
  Clock,
  CalendarDays,
  Users as UsersIcon,
  Search,
  Paperclip,
  X,
  Lock,
  Trash2,
  Radio,
} from 'lucide-react';
import { format, parseISO, startOfDay, isValid } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { Modal } from '../components/ui/Modal';
import { RichTextEditor, stripHtml } from '../components/ui/RichTextEditor';
import { MeetingMinutes, EventAttachment, UserProfile, PersonalMeetingNote, MeetingRecurrence, MeetingType } from '../types';
import { cn } from '../lib/utils';
import { formatDuration, formatMinutes, useElapsed } from '../utils/duration';
import {
  recurrenceOptions,
  meetingTypeOptions,
  recurrenceLabel,
  meetingTypeLabel,
  durationOptions,
  durationLabel,
  addMinutesToTime,
  generateOccurrenceDates,
} from '../utils/meeting';
import { MapPin, Video, Repeat, ClipboardList } from 'lucide-react';

const emptyForm = (): Partial<MeetingMinutes> => ({
  title: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  time: '',
  attendeeUserIds: [],
  agenda: '',
  decisions: '',
  notes: '',
  attachments: [],
  visibleToUserIds: [],
});

export const MeetingMinutesPage: React.FC = () => {
  const {
    meetingMinutes,
    events,
    language,
    profile,
    addMeetingMinutes,
    updateMeetingMinutes,
    deleteMeetingMinutes,
    canManageMinutes,
    meetingSignal,
    canStartMeeting,
    startMeetingSignal,
    endMeetingSignal,
    personalNotes,
    savePersonalNote,
    deletePersonalNote,
    meetingDurations,
    canManageMeetings,
    createMeetingSeries,
    assignMeetingTask,
  } = useAppContext();

  // Явж буй хурал хэр удаж байгаа (секунд тутам шинэчлэгдэнэ)
  const liveElapsed = useElapsed(meetingSignal?.startedAt);

  // Дууссан хурлын үргэлжилсэн хугацааг эвент-ээр нь хайх (хамгийн сүүлийнх)
  const durationByMeetingId = useMemo(() => {
    const map: Record<string, number> = {};
    meetingDurations.forEach(d => {
      if (d.meetingId && map[d.meetingId] === undefined) map[d.meetingId] = d.durationMinutes;
    });
    return map;
  }, [meetingDurations]);
  const isMN = language === 'MN';
  const t = (mn: string, en: string) => (isMN ? mn : en);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Нэгдсэн цонхны дэд гарчиг: Тэмдэглэл | Даалгавар
  const [modalTab, setModalTab] = useState<'minutes' | 'task'>('minutes');
  const [selected, setSelected] = useState<MeetingMinutes | null>(null);
  const [formData, setFormData] = useState<Partial<MeetingMinutes>>(emptyForm());
  const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);
  const [isVisibleUsersOpen, setIsVisibleUsersOpen] = useState(false);
  const [deptFilters, setDeptFilters] = useState<Record<'attendeeUserIds' | 'visibleToUserIds', string>>({
    attendeeUserIds: 'all',
    visibleToUserIds: 'all',
  });

  const departments = [
    { key: 'Захиргаа, санхүүгийн хэлтэс', label: 'Захиргаа' },
    { key: 'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс', label: 'Төсөл' },
    { key: 'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс', label: 'Судалгаа' },
    { key: 'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс', label: 'МК' },
  ];
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'minutes' | 'past' | 'mynotes'>('minutes');

  // Ажилтны хувийн тэмдэглэл (зөвхөн өөрт нь харагдана)
  const emptyNoteForm = (): Partial<PersonalMeetingNote> => ({
    meetingId: undefined,
    meetingTitle: '',
    meetingDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    directorTasks: '',
  });
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<PersonalMeetingNote | null>(null);
  const [noteForm, setNoteForm] = useState<Partial<PersonalMeetingNote>>(emptyNoteForm());
  const [savingNote, setSavingNote] = useState(false);

  // Хурал нэмэх (шинэ)
  interface MeetingFormState {
    title: string;
    date: string;
    time: string;
    durationMinutes: number;
    recurrence: MeetingRecurrence;
    meetingType: MeetingType;
    location: string;
    attendeeUserIds: string[];
    minutesKeeperUserId: string;
  }
  const emptyMeetingForm = (): MeetingFormState => ({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '09:00',
    durationMinutes: 60,
    recurrence: 'none',
    meetingType: 'inperson',
    location: '',
    attendeeUserIds: [],
    minutesKeeperUserId: '',
  });
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(emptyMeetingForm());
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [isMeetingAttendeesOpen, setIsMeetingAttendeesOpen] = useState(false);

  const meetingEndTime = addMinutesToTime(meetingForm.time, meetingForm.durationMinutes);
  const meetingOccurrenceCount = generateOccurrenceDates(meetingForm.date, meetingForm.recurrence).length;

  const openMeetingModal = () => {
    setMeetingForm(emptyMeetingForm());
    setIsMeetingAttendeesOpen(false);
    setIsMeetingModalOpen(true);
  };

  const handleSaveMeeting = async () => {
    if (!meetingForm.title.trim()) {
      alert(t('Хурлын нэрийг оруулна уу.', 'Please enter the meeting name.'));
      return;
    }
    if (!meetingForm.date || !meetingForm.time) {
      alert(t('Хуралдах өдөр, эхлэх цагийг оруулна уу.', 'Please set the date and start time.'));
      return;
    }

    setSavingMeeting(true);
    try {
      const count = await createMeetingSeries({
        title: meetingForm.title.trim(),
        date: meetingForm.date,
        time: meetingForm.time,
        durationMinutes: meetingForm.durationMinutes,
        endTime: meetingEndTime,
        recurrence: meetingForm.recurrence,
        meetingType: meetingForm.meetingType,
        location: meetingForm.location.trim(),
        attendeeUserIds: meetingForm.attendeeUserIds,
        minutesKeeperUserId: meetingForm.minutesKeeperUserId || undefined,
      });
      setIsMeetingModalOpen(false);
      if (count > 1) {
        alert(t(`${count} удаагийн давтагдах хурал үүслээ.`, `Created ${count} recurring meetings.`));
      }
    } catch (error: any) {
      alert(error?.message || t('Хурал үүсгэх үед алдаа гарлаа.', 'Failed to create the meeting.'));
    } finally {
      setSavingMeeting(false);
    }
  };

  const toggleMeetingAttendee = (uid: string) => {
    setMeetingForm(prev => ({
      ...prev,
      attendeeUserIds: prev.attendeeUserIds.includes(uid)
        ? prev.attendeeUserIds.filter(id => id !== uid)
        : [...prev.attendeeUserIds, uid],
    }));
  };

  // ===== Хурлаас даалгавар өгөх (тэмдэглэл хөтлөгч) =====
  const [savingTask, setSavingTask] = useState(false);
  const [taskDeptFilter, setTaskDeptFilter] = useState<string>('all');
  const emptyTaskForm = () => ({
    title: '',
    description: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    assignedToUserIds: [] as string[],
    sourceLabel: '',
  });
  const [taskForm, setTaskForm] = useState(emptyTaskForm());

  const openTaskModal = () => {
    // Явж буй хурал эсвэл дараагийн хурлын нэрийг эх сурвалж болгож урьдчилан бичнэ
    const source = meetingSignal?.title || nextMeeting?.title || '';
    setTaskForm({ ...emptyTaskForm(), sourceLabel: source });
    setTaskDeptFilter('all');
    // Нэгдсэн цонхыг "Даалгавар" гарчиг дээр нээнэ (тэмдэглэлийг цэвэр байлгана)
    setSelected(null);
    setFormData(emptyForm());
    setModalTab('task');
    setIsModalOpen(true);
  };

  const taskFilteredUsers = taskDeptFilter === 'all' ? users : users.filter(u => u.department === taskDeptFilter);

  const toggleTaskUser = (uid: string) => {
    setTaskForm(prev => ({
      ...prev,
      assignedToUserIds: prev.assignedToUserIds.includes(uid)
        ? prev.assignedToUserIds.filter(id => id !== uid)
        : [...prev.assignedToUserIds, uid],
    }));
  };

  const toggleTaskDeptAll = () => {
    const ids = taskFilteredUsers.map(u => u.uid);
    const allSelected = ids.length > 0 && ids.every(id => taskForm.assignedToUserIds.includes(id));
    setTaskForm(prev => ({
      ...prev,
      assignedToUserIds: allSelected
        ? prev.assignedToUserIds.filter(id => !ids.includes(id))
        : [...new Set([...prev.assignedToUserIds, ...ids])],
    }));
  };

  const handleAssignTask = async () => {
    if (!taskForm.title.trim()) {
      alert(t('Даалгаврын нэрийг оруулна уу.', 'Please enter the task title.'));
      return;
    }
    if (taskForm.assignedToUserIds.length === 0) {
      alert(t('Хүлээн авах ажилтныг сонгоно уу.', 'Please select at least one employee.'));
      return;
    }
    setSavingTask(true);
    try {
      await assignMeetingTask({
        title: taskForm.title,
        // Хоосон HTML (жишээ нь "<br>") хадгалахгүй
        description: stripHtml(taskForm.description) ? taskForm.description : '',
        dueDate: taskForm.dueDate,
        assignedToUserIds: taskForm.assignedToUserIds,
        sourceLabel: taskForm.sourceLabel.trim() || undefined,
      });
      setIsModalOpen(false);
      alert(t(`${taskForm.assignedToUserIds.length} ажилтанд даалгавар өглөө.`, `Task assigned to ${taskForm.assignedToUserIds.length} employee(s).`));
    } catch (error: any) {
      alert(error?.message || t('Даалгавар өгөх үед алдаа гарлаа.', 'Failed to assign the task.'));
    } finally {
      setSavingTask(false);
    }
  };

  const canCreate = canManageMinutes();
  const canEditSelected = selected ? canManageMinutes(selected) : canCreate;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers((data as UserProfile[]).filter(u => u.status === 'approved'));
      } catch (error) {
        console.error('Users fetch error:', error);
      }
    };
    fetchUsers();
  }, []);

  const userNameById = useMemo(() => {
    return users.reduce<Record<string, string>>((acc, u) => {
      acc[u.uid] = u.displayName || `${u.lastName} ${u.firstName}`.trim();
      return acc;
    }, {});
  }, [users]);

  // Өнөөдрийн огноог "амьд" барина — шөнө дунд өдөр солигдоход хуудсыг дахин ачаалахгүйгээр
  // өнөөдрийн хурал автоматаар "Өмнөх хурлууд" руу шилжинэ.
  const [todayKey, setTodayKey] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const timer = setInterval(() => {
      const key = format(new Date(), 'yyyy-MM-dd');
      // Өдөр үнэхээр солигдсон үед л шинэчилнэ (илүүдэл re-render хийхгүй)
      setTodayKey(prev => (prev === key ? prev : key));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const today = useMemo(() => startOfDay(parseISO(todayKey)), [todayKey]);

  // Дараагийн товлогдсон нэг л хурлыг харуулна (хуанлийн Шуурхай хурал ангиллаас)
  const nextMeeting = useMemo(() => {
    return events
      .filter(e => {
        if (e.category !== 'Meeting') return false;
        const d = parseISO(e.date);
        return isValid(d) && startOfDay(d) >= today;
      })
      .sort((a, b) => {
        const dateDiff = parseISO(a.date).getTime() - parseISO(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.time || '').localeCompare(b.time || '');
      })[0];
  }, [events, today]);

  const isNextMeetingLive = !!nextMeeting && !!meetingSignal && (
    meetingSignal.meetingId === nextMeeting.id ||
    (meetingSignal.title === nextMeeting.title && meetingSignal.time === (nextMeeting.time || undefined))
  );

  const handleStartMeeting = async () => {
    if (!nextMeeting) return;
    if (!confirm(t('Энэ хурлыг эхлүүлэх үү? Бүх ажилтанд мэдэгдэл очно.', 'Start this meeting? All staff will be notified.'))) return;
    try {
      await startMeetingSignal({ meetingId: nextMeeting.id, title: nextMeeting.title, time: nextMeeting.time });
    } catch (error: any) {
      alert(error?.message || t('Хурал эхлүүлэх үед алдаа гарлаа.', 'Failed to start the meeting.'));
    }
  };

  const handleEndMeeting = async () => {
    try {
      await endMeetingSignal();
    } catch (error: any) {
      alert(error?.message || t('Хурал дуусгах үед алдаа гарлаа.', 'Failed to end the meeting.'));
    }
  };

  // Өмнөх (болсон) хурлууд
  const pastMeetings = useMemo(() => {
    return events
      .filter(e => {
        if (e.category !== 'Meeting') return false;
        const d = parseISO(e.date);
        return isValid(d) && startOfDay(d) < today;
      })
      .sort((a, b) => {
        const dateDiff = parseISO(b.date).getTime() - parseISO(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.time || '').localeCompare(a.time || '');
      });
  }, [events, today]);

  // Хувийн тэмдэглэлд сонгох боломжтой хурлууд (хуанлийн Шуурхай хурлууд)
  const meetingOptions = useMemo(() => {
    return events
      .filter(e => e.category === 'Meeting')
      .map(e => ({ id: e.id, title: e.title, date: format(parseISO(e.date), 'yyyy-MM-dd') }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [events]);

  const myNotes = useMemo(
    () => [...personalNotes].sort((a, b) => (b.meetingDate || '').localeCompare(a.meetingDate || '')),
    [personalNotes]
  );

  const openNoteModal = (note?: PersonalMeetingNote) => {
    if (note) {
      setSelectedNote(note);
      setNoteForm(note);
    } else {
      setSelectedNote(null);
      // Хурал явж байвал түүнийг, эсвэл дараагийн хурлыг урьдчилан сонгоно
      const live = meetingSignal
        ? meetingOptions.find(m => m.id === meetingSignal.meetingId)
        : undefined;
      const preset = live || (nextMeeting
        ? { id: nextMeeting.id, title: nextMeeting.title, date: format(parseISO(nextMeeting.date), 'yyyy-MM-dd') }
        : undefined);

      setNoteForm({
        ...emptyNoteForm(),
        ...(preset ? { meetingId: preset.id, meetingTitle: preset.title, meetingDate: preset.date } : {}),
        ...(!preset && meetingSignal ? { meetingTitle: meetingSignal.title } : {}),
      });
    }
    setIsNoteModalOpen(true);
  };

  const handleSaveNote = async () => {
    if (!String(noteForm.meetingTitle || '').trim()) {
      alert(t('Хурлын нэрийг оруулна уу.', 'Please enter the meeting title.'));
      return;
    }

    setSavingNote(true);
    try {
      await savePersonalNote({ ...noteForm, id: selectedNote?.id });
      setIsNoteModalOpen(false);
      setSelectedNote(null);
      setNoteForm(emptyNoteForm());
    } catch (error: any) {
      alert(error?.message || t('Хадгалах үед алдаа гарлаа.', 'Failed to save.'));
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    if (!confirm(t('Энэ тэмдэглэлийг устгах уу?', 'Delete this note?'))) return;
    try {
      await deletePersonalNote(selectedNote.id);
      setIsNoteModalOpen(false);
      setSelectedNote(null);
    } catch (error: any) {
      alert(error?.message || t('Устгах үед алдаа гарлаа.', 'Failed to delete.'));
    }
  };

  const findMinutesForMeeting = (meetingDate: string, meetingTitle: string, meetingTime?: string) => {
    return meetingMinutes.find(m => {
      if (m.date.slice(0, 10) !== meetingDate) return false;
      return m.title === meetingTitle || (!!m.time && !!meetingTime && m.time === meetingTime);
    });
  };

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    meetingMinutes.forEach(m => {
      const d = parseISO(m.date);
      if (isValid(d)) years.add(format(d, 'yyyy'));
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [meetingMinutes]);

  const filteredMinutes = useMemo(() => {
    return meetingMinutes
      .filter(m => {
        const d = parseISO(m.date);
        if (yearFilter !== 'all' && (!isValid(d) || format(d, 'yyyy') !== yearFilter)) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const attendeeNames = (m.attendeeUserIds || []).map(uid => (userNameById[uid] || '').toLowerCase()).join(' ');
          return (
            m.title.toLowerCase().includes(q) ||
            stripHtml(m.agenda || '').toLowerCase().includes(q) ||
            stripHtml(m.decisions || '').toLowerCase().includes(q) ||
            attendeeNames.includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const dateDiff = parseISO(b.date).getTime() - parseISO(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.time || '').localeCompare(a.time || '');
      });
  }, [meetingMinutes, search, yearFilter, userNameById]);

  // Он-сараар бүлэглэх
  const groupedMinutes = useMemo(() => {
    const groups: { key: string; label: string; items: MeetingMinutes[] }[] = [];
    filteredMinutes.forEach(m => {
      const d = parseISO(m.date);
      const key = isValid(d) ? format(d, 'yyyy-MM') : 'unknown';
      const label = isValid(d)
        ? (isMN ? `${format(d, 'yyyy')} оны ${format(d, 'M')}-р сар` : format(d, 'MMMM yyyy'))
        : '-';
      const existing = groups.find(g => g.key === key);
      if (existing) {
        existing.items.push(m);
      } else {
        groups.push({ key, label, items: [m] });
      }
    });
    return groups;
  }, [filteredMinutes, isMN]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(t('File унших үед алдаа гарлаа', 'Failed to read file')));
      reader.readAsDataURL(file);
    });

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
      setFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...uploaded] }));
    } catch (error: any) {
      alert(error?.message || t('Файл оруулах үед алдаа гарлаа.', 'Failed to upload file.'));
    } finally {
      e.target.value = '';
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setFormData(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(a => a.id !== attachmentId),
    }));
  };

  const toggleId = (field: 'attendeeUserIds' | 'visibleToUserIds', uid: string) => {
    setFormData(prev => {
      const current = prev[field] || [];
      return {
        ...prev,
        [field]: current.includes(uid) ? current.filter(id => id !== uid) : [...current, uid],
      };
    });
  };

  const toggleAllIds = (field: 'attendeeUserIds' | 'visibleToUserIds', filteredIds: string[]) => {
    setFormData(prev => {
      const current = prev[field] || [];
      const allSelected = filteredIds.length > 0 && filteredIds.every(id => current.includes(id));
      return {
        ...prev,
        [field]: allSelected
          ? current.filter(id => !filteredIds.includes(id))
          : [...new Set([...current, ...filteredIds])],
      };
    });
  };

  const handleCreate = () => {
    // Өмнө нь хаагдсан хадгалаагүй ноорог байвал үргэлжлүүлнэ (refresh хийтэл алдагдахгүй)
    const hasDraft = !selected && (
      String(formData.title || '').trim() !== '' ||
      stripHtml(formData.agenda || '') !== '' ||
      stripHtml(formData.decisions || '') !== '' ||
      stripHtml(formData.notes || '') !== ''
    );

    if (!hasDraft) {
      setFormData({
        ...emptyForm(),
        // Тэмдэглэл оруулж буй ажилтан өөрөө оролцогчоор орно
        attendeeUserIds: profile ? [profile.uid] : [],
        ...(nextMeeting
          ? { title: nextMeeting.title, date: nextMeeting.date.slice(0, 10), time: nextMeeting.time || '' }
          : {}),
      });
    }

    setSelected(null);
    setIsAttendeesOpen(false);
    setIsVisibleUsersOpen(false);
    setModalTab('minutes');
    setIsModalOpen(true);
  };

  // Өмнөх хурал дээр дарахад: тэмдэглэл нь байвал шууд нээнэ, байхгүй бол шинээр бөглүүлнэ
  const handleOpenPastMeeting = (dateStr: string, title: string, time?: string) => {
    const existing = findMinutesForMeeting(dateStr, title, time);
    if (existing) {
      handleOpen(existing);
      return;
    }
    if (canCreate) {
      setSelected(null);
      setFormData({
        ...emptyForm(),
        title,
        date: dateStr,
        time: time || '',
        attendeeUserIds: profile ? [profile.uid] : [],
      });
      setIsAttendeesOpen(false);
      setIsVisibleUsersOpen(false);
      setModalTab('minutes');
      setIsModalOpen(true);
    } else {
      alert(t('Энэ хуралд тэмдэглэл бүртгэгдээгүй байна.', 'No minutes recorded for this meeting.'));
    }
  };

  const handleOpen = (minutes: MeetingMinutes) => {
    setSelected(minutes);
    setFormData(minutes);
    setIsAttendeesOpen(false);
    setIsVisibleUsersOpen(false);
    setModalTab('minutes');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!String(formData.title || '').trim()) {
      alert(t('Хурлын нэрийг оруулна уу.', 'Please enter the meeting title.'));
      return;
    }
    if (!formData.date) {
      alert(t('Хурлын огноог оруулна уу.', 'Please enter the meeting date.'));
      return;
    }

    setSaving(true);
    try {
      if (selected) {
        await updateMeetingMinutes({ ...selected, ...formData } as MeetingMinutes);
      } else {
        await addMeetingMinutes({
          ...formData,
          id: Math.random().toString(36).substr(2, 9),
          createdBy: profile?.uid,
        } as MeetingMinutes);
      }
      setIsModalOpen(false);
      setFormData(emptyForm());
      setSelected(null);
    } catch (error: any) {
      alert(error?.message || t('Хадгалах үед алдаа гарлаа.', 'Failed to save.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(t('Энэ хурлын тэмдэглэлийг устгах уу?', 'Delete this meeting minutes?'))) return;

    try {
      await deleteMeetingMinutes(selected.id);
      setIsModalOpen(false);
      setSelected(null);
    } catch (error: any) {
      alert(error?.message || t('Устгах үед алдаа гарлаа.', 'Failed to delete.'));
    }
  };

  const renderUserPicker = (
    field: 'attendeeUserIds' | 'visibleToUserIds',
    isOpen: boolean,
    setOpen: (open: boolean) => void,
    placeholder: string,
  ) => {
    const selectedIds = formData[field] || [];
    return (
      <div className="relative">
        <button
          type="button"
          disabled={!canEditSelected}
          onClick={() => setOpen(!isOpen)}
          className="input-field w-full text-left flex items-center justify-between"
        >
          <span className="truncate">
            {selectedIds.length > 0
              ? selectedIds.map(uid => userNameById[uid] || uid).join(', ') + ` (${selectedIds.length})`
              : placeholder}
          </span>
          <span className="text-slate-400 text-xs">▼</span>
        </button>
        {isOpen && (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
            <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
              <button
                type="button"
                onClick={() => setDeptFilters(prev => ({ ...prev, [field]: 'all' }))}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-bold transition-all',
                  deptFilters[field] === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                )}
              >
                {t('Бүгд', 'All')}
              </button>
              {departments.map(dept => (
                <button
                  key={dept.key}
                  type="button"
                  onClick={() => setDeptFilters(prev => ({ ...prev, [field]: dept.key }))}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-bold transition-all',
                    deptFilters[field] === dept.key ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  )}
                >
                  {dept.label}
                </button>
              ))}
            </div>
            <div className="p-3 max-h-44 overflow-y-auto space-y-2">
              {(() => {
                const filteredUsers = deptFilters[field] === 'all'
                  ? users
                  : users.filter(u => u.department === deptFilters[field]);
                const filteredIds = filteredUsers.map(u => u.uid);
                const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
                return (
                  <>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={() => toggleAllIds(field, filteredIds)}
                      />
                      <span>
                        {t('Бүгд сонгох', 'Select all')} ({filteredUsers.filter(u => selectedIds.includes(u.uid)).length}/{filteredUsers.length})
                      </span>
                    </label>
                    {filteredUsers.map(u => (
                      <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.uid)}
                          onChange={() => toggleId(field, u.uid)}
                        />
                        <span>{u.displayName}</span>
                      </label>
                    ))}
                    {filteredUsers.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-2">{t('Ажилтан байхгүй', 'No users')}</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-3">
            <NotebookPen className="w-8 h-8 text-primary" />
            {t('Хурлын тэмдэглэл', 'Meeting Minutes')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t('Хурлын тэмдэглэлүүдийг бүртгэх, хадгалах', 'Record and store meeting minutes')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageMeetings && (
            <button onClick={openMeetingModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('Хурал нэмэх', 'Add Meeting')}
            </button>
          )}
          {canCreate && (
            <button
              onClick={openTaskModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 font-bold text-sm hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              {t('Даалгавар өгөх', 'Assign Task')}
            </button>
          )}
          {canCreate && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 transition-colors"
            >
              <NotebookPen className="w-4 h-4" />
              {t('Тэмдэглэл нэмэх', 'Add Minutes')}
            </button>
          )}
        </div>
      </header>

      {/* Дараагийн товлогдсон нэг хурал */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {t('Дараагийн товлогдсон хурал', 'Next scheduled meeting')}
        </p>
        {nextMeeting ? (
          <div
            className={cn(
              'card border-l-4 transition-colors',
              isNextMeetingLive ? 'border-l-red-500 bg-red-50/60 dark:bg-red-900/10' : 'border-l-red-500'
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex flex-col items-center justify-center w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-xl flex-shrink-0">
                  <span className="text-xs font-bold text-red-500 uppercase">{format(parseISO(nextMeeting.date), 'MMM')}</span>
                  <span className="text-xl font-bold text-red-600 dark:text-red-400">{format(parseISO(nextMeeting.date), 'dd')}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{nextMeeting.title}</h3>
                    {isNextMeetingLive && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500 text-white flex-shrink-0">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                        </span>
                        {t('Хурал эхэлсэн', 'Meeting live')} · {formatDuration(liveElapsed, isMN)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {format(parseISO(nextMeeting.date), 'yyyy-MM-dd')}
                    </span>
                    {nextMeeting.time && (
                      <span className="flex items-center gap-1 font-bold text-red-600 dark:text-red-400">
                        <Clock className="w-3.5 h-3.5" />
                        {nextMeeting.time}{nextMeeting.endTime ? `–${nextMeeting.endTime}` : ''}
                      </span>
                    )}
                    {nextMeeting.meetingType && (
                      <span className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold',
                        nextMeeting.meetingType === 'online'
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      )}>
                        {meetingTypeLabel(nextMeeting.meetingType, isMN)}
                      </span>
                    )}
                    {nextMeeting.location && (
                      <span className="truncate max-w-[160px]">📍 {nextMeeting.location}</span>
                    )}
                    {nextMeeting.recurrence && nextMeeting.recurrence !== 'none' && (
                      <span className="flex items-center gap-1 text-primary font-semibold">
                        <Repeat className="w-3 h-3" /> {recurrenceLabel(nextMeeting.recurrence, isMN)}
                      </span>
                    )}
                  </div>
                  {nextMeeting.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{nextMeeting.description}</p>
                  )}
                </div>
              </div>

              {canStartMeeting && (
                <div className="flex-shrink-0">
                  {isNextMeetingLive ? (
                    <button
                      onClick={handleEndMeeting}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    >
                      {t('Хурал дуусгах', 'End meeting')}
                    </button>
                  ) : (
                    <button
                      onClick={handleStartMeeting}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                    >
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                      </span>
                      {t('Хурал эхлүүлэх', 'Start meeting')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <p className="text-sm text-slate-400">
              {t('Одоогоор товлогдсон хурал алга байна.', 'No upcoming meetings scheduled.')}
            </p>
          </div>
        )}
      </div>

      {/* Дэд цэс: Тэмдэглэлүүд / Өмнөх хурлууд */}
      <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1 w-fit">
        <button
          onClick={() => setActiveTab('minutes')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
            activeTab === 'minutes' ? 'bg-slate-100 dark:bg-slate-800 text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          )}
        >
          <NotebookPen className="w-4 h-4" />
          {t('Тэмдэглэлүүд', 'Minutes')}
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
            activeTab === 'past' ? 'bg-slate-100 dark:bg-slate-800 text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          )}
        >
          <Clock className="w-4 h-4" />
          {t('Өмнөх хурлууд', 'Past meetings')} ({pastMeetings.length})
        </button>
        <button
          onClick={() => setActiveTab('mynotes')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
            activeTab === 'mynotes' ? 'bg-slate-100 dark:bg-slate-800 text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
          )}
        >
          <Lock className="w-4 h-4" />
          {t('Миний тэмдэглэл', 'My notes')} ({myNotes.length})
        </button>
      </div>

      {activeTab === 'minutes' && (
      <>
      {/* Хайлт, шүүлтүүр */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('Хурлын нэр, асуудал, оролцогчоор хайх...', 'Search by title, agenda, attendees...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className="input-field w-40"
        >
          <option value="all">{t('Бүх он', 'All years')}</option>
          {availableYears.map(year => (
            <option key={year} value={year}>{isMN ? `${year} он` : year}</option>
          ))}
        </select>
      </div>

      {/* Жагсаалт (он, сараар бүлэглэсэн) */}
      {groupedMinutes.length === 0 ? (
        <div className="card py-16 flex flex-col items-center gap-2 text-slate-400">
          <NotebookPen className="w-10 h-10 opacity-30" />
          <p className="text-sm">{t('Хурлын тэмдэглэл байхгүй байна', 'No meeting minutes yet')}</p>
        </div>
      ) : (
        groupedMinutes.map(group => (
          <section key={group.key} className="space-y-3">
            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
              {group.label} ({group.items.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {group.items.map(minutes => (
                <div
                  key={minutes.id}
                  onClick={() => handleOpen(minutes)}
                  className="card hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center justify-center w-14 h-14 bg-slate-100 dark:bg-slate-800/50 rounded-xl flex-shrink-0">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{format(parseISO(minutes.date), 'MMM')}</span>
                      <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{format(parseISO(minutes.date), 'dd')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                        {minutes.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>{format(parseISO(minutes.date), 'yyyy-MM-dd')}</span>
                        {minutes.time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {minutes.time}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <UsersIcon className="w-3 h-3" />
                          {(minutes.attendeeUserIds || []).length} {t('оролцогч', 'attendees')}
                        </span>
                        {(minutes.attachments || []).length > 0 && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3 h-3" />
                            {(minutes.attachments || []).length}
                          </span>
                        )}
                      </div>
                      {minutes.agenda && stripHtml(minutes.agenda) && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{stripHtml(minutes.agenda)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
      </>
      )}

      {activeTab === 'past' && (
        <div className="space-y-3">
          {pastMeetings.length === 0 ? (
            <div className="card py-16 flex flex-col items-center gap-2 text-slate-400">
              <Clock className="w-10 h-10 opacity-30" />
              <p className="text-sm">{t('Өмнөх хурал байхгүй байна', 'No past meetings')}</p>
            </div>
          ) : (
            pastMeetings.map(meeting => {
              const dateStr = format(parseISO(meeting.date), 'yyyy-MM-dd');
              const minutes = findMinutesForMeeting(dateStr, meeting.title, meeting.time);
              return (
                <div
                  key={meeting.id}
                  onClick={() => handleOpenPastMeeting(dateStr, meeting.title, meeting.time)}
                  className="card hover:shadow-md transition-shadow cursor-pointer group flex items-center gap-4"
                >
                  <div className="flex flex-col items-center justify-center w-14 h-14 bg-slate-100 dark:bg-slate-800/50 rounded-xl flex-shrink-0">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{format(parseISO(meeting.date), 'MMM')}</span>
                    <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{format(parseISO(meeting.date), 'dd')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                      {meeting.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{dateStr}</span>
                      {meeting.time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {meeting.time}
                        </span>
                      )}
                      {durationByMeetingId[meeting.id] !== undefined && (
                        <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                          <Clock className="w-3 h-3" />
                          {t('Үргэлжилсэн', 'Lasted')}: {formatMinutes(durationByMeetingId[meeting.id], isMN)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {minutes ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <NotebookPen className="w-3.5 h-3.5" />
                        {t('Тэмдэглэлтэй', 'Has minutes')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {t('Тэмдэглэл алга', 'No minutes')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'mynotes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              {t(
                'Эдгээр тэмдэглэл зөвхөн танд харагдана. Админ ч үзэхгүй.',
                'These notes are visible only to you — not even to admins.'
              )}
            </p>
            <button onClick={() => openNoteModal()} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
              <Plus className="w-5 h-5" />
              {t('Тэмдэглэл бичих', 'Write a note')}
            </button>
          </div>

          {/* Хурал явж байвал шууд бичих сануулга */}
          {meetingSignal && (
            <div className="card border-l-4 border-l-red-500 bg-red-50/60 dark:bg-red-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-3 w-3 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <Radio className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                    {t('Хурал явж байна', 'Meeting in progress')}: {meetingSignal.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formatDuration(liveElapsed, isMN)}
                    </span>{' '}
                    {t('үргэлжилж байна · Одоо тэмдэглэлээ бичиж болно.', 'elapsed · You can take your notes now.')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openNoteModal()}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors"
              >
                {t('Тэмдэглэл бичих', 'Take notes')}
              </button>
            </div>
          )}

          {myNotes.length === 0 ? (
            <div className="card py-16 flex flex-col items-center gap-2 text-slate-400">
              <NotebookPen className="w-10 h-10 opacity-30" />
              <p className="text-sm">{t('Хувийн тэмдэглэл байхгүй байна', 'No personal notes yet')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {myNotes.map(note => (
                <div
                  key={note.id}
                  onClick={() => openNoteModal(note)}
                  className="card hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                        {note.meetingTitle}
                      </h3>
                      {note.meetingDate && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{note.meetingDate}</p>
                      )}
                    </div>
                    <Lock className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </div>

                  {stripHtml(note.notes || '') && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
                      {stripHtml(note.notes)}
                    </p>
                  )}
                  {stripHtml(note.directorTasks || '') && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 line-clamp-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1">
                      <span className="font-bold">{t('Үүрэг: ', 'Task: ')}</span>
                      {stripHtml(note.directorTasks)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Хурал нэмэх Modal */}
      <Modal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        closeOnBackdropClick={false}
        className="max-w-[820px]"
        title={t('Хурал нэмэх', 'Add Meeting')}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын нэр', 'Meeting name')}</label>
            <input
              type="text"
              value={meetingForm.title}
              onChange={e => setMeetingForm(prev => ({ ...prev, title: e.target.value }))}
              className="input-field"
              placeholder={t('Хурлын нэр', 'Meeting name')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хуралдах өдөр', 'Meeting date')}</label>
              <input
                type="date"
                value={meetingForm.date}
                onChange={e => setMeetingForm(prev => ({ ...prev, date: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Эхлэх цаг', 'Start time')}</label>
              <input
                type="time"
                value={meetingForm.time}
                onChange={e => setMeetingForm(prev => ({ ...prev, time: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хугацаа', 'Duration')}</label>
              <select
                value={meetingForm.durationMinutes}
                onChange={e => setMeetingForm(prev => ({ ...prev, durationMinutes: Number(e.target.value) }))}
                className="input-field"
              >
                {durationOptions.map(min => (
                  <option key={min} value={min}>{durationLabel(min, isMN)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Дуусах хугацаа — автоматаар (эхлэх цаг + хугацаа) */}
          <div className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-slate-500 dark:text-slate-400">{t('Дуусах хугацаа', 'End time')}:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{meetingEndTime || '—'}</span>
            <span className="text-slate-400 text-xs">({meetingForm.time} + {durationLabel(meetingForm.durationMinutes, isMN)})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" /> {t('Давтамж', 'Recurrence')}
              </label>
              <select
                value={meetingForm.recurrence}
                onChange={e => setMeetingForm(prev => ({ ...prev, recurrence: e.target.value as MeetingRecurrence }))}
                className="input-field"
              >
                {recurrenceOptions.map(o => (
                  <option key={o.value} value={o.value}>{isMN ? o.mn : o.en}</option>
                ))}
              </select>
              {meetingForm.recurrence !== 'none' && (
                <p className="text-[11px] text-slate-500">
                  {t(`${meetingOccurrenceCount} удаагийн хурал үүснэ.`, `Will create ${meetingOccurrenceCount} meetings.`)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын төрөл', 'Meeting type')}</label>
              <select
                value={meetingForm.meetingType}
                onChange={e => setMeetingForm(prev => ({ ...prev, meetingType: e.target.value as MeetingType }))}
                className="input-field"
              >
                {meetingTypeOptions.map(o => (
                  <option key={o.value} value={o.value}>{isMN ? o.mn : o.en}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              {meetingForm.meetingType === 'online' ? <Video className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
              {meetingForm.meetingType === 'online' ? t('Холбоос / платформ', 'Link / platform') : t('Хуралдах байр', 'Location')}
            </label>
            <input
              type="text"
              value={meetingForm.location}
              onChange={e => setMeetingForm(prev => ({ ...prev, location: e.target.value }))}
              className="input-field"
              placeholder={meetingForm.meetingType === 'online' ? 'Zoom / Google Meet ...' : t('Хурлын танхим ...', 'Meeting room ...')}
            />
          </div>

          {/* Оролцогчид */}
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хуралд оролцох хэрэглэгчид', 'Attendees')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMeetingAttendeesOpen(o => !o)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className="truncate">
                  {meetingForm.attendeeUserIds.length > 0
                    ? meetingForm.attendeeUserIds.map(uid => userNameById[uid] || uid).join(', ') + ` (${meetingForm.attendeeUserIds.length})`
                    : t('Хэрэглэгч сонгох', 'Select users')}
                </span>
                <span className="text-slate-400 text-xs">▼</span>
              </button>
              {isMeetingAttendeesOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-3 max-h-52 overflow-y-auto space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <input
                      type="checkbox"
                      checked={users.length > 0 && users.every(u => meetingForm.attendeeUserIds.includes(u.uid))}
                      onChange={() => setMeetingForm(prev => ({
                        ...prev,
                        attendeeUserIds: users.every(u => prev.attendeeUserIds.includes(u.uid)) ? [] : users.map(u => u.uid),
                      }))}
                    />
                    <span>{t('Бүгд', 'All')}</span>
                  </label>
                  {users.map(u => (
                    <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={meetingForm.attendeeUserIds.includes(u.uid)}
                        onChange={() => toggleMeetingAttendee(u.uid)}
                      />
                      <span>{u.displayName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Тэмдэглэл хөтлөгч */}
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын тэмдэглэл хөтлөх хэрэглэгч', 'Minutes keeper')}</label>
            <select
              value={meetingForm.minutesKeeperUserId}
              onChange={e => setMeetingForm(prev => ({ ...prev, minutesKeeperUserId: e.target.value }))}
              className="input-field"
            >
              <option value="">{t('— Сонгоогүй —', '— None —')}</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>{u.displayName}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsMeetingModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('Цуцлах', 'Cancel')}
            </button>
            <button
              onClick={handleSaveMeeting}
              disabled={savingMeeting}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {savingMeeting ? t('Хадгалж байна...', 'Saving...') : t('Хурал үүсгэх', 'Create meeting')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Хувийн тэмдэглэлийн Modal */}
      <Modal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        closeOnBackdropClick={false}
        className="max-w-[900px]"
        title={selectedNote ? t('Миний тэмдэглэл', 'My note') : t('Тэмдэглэл бичих', 'Write a note')}
      >
        <div className="space-y-4">
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            {t('Энэ тэмдэглэл зөвхөн танд харагдана.', 'This note is visible only to you.')}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурал', 'Meeting')}</label>
              <select
                value={noteForm.meetingId || ''}
                onChange={e => {
                  const picked = meetingOptions.find(m => m.id === e.target.value);
                  setNoteForm(prev => ({
                    ...prev,
                    meetingId: picked?.id,
                    meetingTitle: picked ? picked.title : prev.meetingTitle,
                    meetingDate: picked ? picked.date : prev.meetingDate,
                  }));
                }}
                className="input-field"
              >
                <option value="">{t('— Гараар бичих —', '— Enter manually —')}</option>
                {meetingOptions.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.date} · {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Огноо', 'Date')}</label>
              <input
                type="date"
                value={noteForm.meetingDate || ''}
                onChange={e => setNoteForm(prev => ({ ...prev, meetingDate: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын нэр', 'Meeting title')}</label>
            <input
              type="text"
              value={noteForm.meetingTitle || ''}
              onChange={e => setNoteForm(prev => ({ ...prev, meetingTitle: e.target.value }))}
              className="input-field"
              placeholder={t('Хурлын нэр', 'Meeting title')}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын тэмдэглэл', 'Meeting notes')}</label>
            <RichTextEditor
              value={noteForm.notes || ''}
              onChange={html => setNoteForm(prev => ({ ...prev, notes: html }))}
              placeholder={t('Хурлаар хэлэлцсэн зүйлээ бичнэ үү...', 'Write what was discussed...')}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {t('Захирлаас өгсөн үүрэг даалгавар', 'Tasks assigned by the director')}
            </label>
            <RichTextEditor
              value={noteForm.directorTasks || ''}
              onChange={html => setNoteForm(prev => ({ ...prev, directorTasks: html }))}
              placeholder={t('Танд өгсөн үүрэг даалгавар...', 'Tasks assigned to you...')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            {selectedNote && (
              <button
                onClick={handleDeleteNote}
                className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t('Устгах', 'Delete')}
              </button>
            )}
            <button
              onClick={() => setIsNoteModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('Цуцлах', 'Cancel')}
            </button>
            <button
              onClick={handleSaveNote}
              disabled={savingNote}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {savingNote ? t('Хадгалж байна...', 'Saving...') : t('Хадгалах', 'Save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Тэмдэглэлийн Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        closeOnBackdropClick={false}
        className="max-w-[1100px]"
        title={modalTab === 'task'
          ? t('Хурлаас даалгавар өгөх', 'Assign Task')
          : (selected
            ? (canEditSelected ? t('Хурлын тэмдэглэл засах', 'Edit Meeting Minutes') : t('Хурлын тэмдэглэл', 'Meeting Minutes'))
            : t('Хурлын тэмдэглэл нэмэх', 'Add Meeting Minutes'))}
      >
        <div className="space-y-4">
          {/* Дэд гарчиг: Тэмдэглэл | Даалгавар (зөвхөн эрхтэй ажилтанд) */}
          {canCreate && (
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setModalTab('minutes')}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all',
                  modalTab === 'minutes' ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}
              >
                <NotebookPen className="w-4 h-4" /> {t('Хурлын тэмдэглэл', 'Meeting Minutes')}
              </button>
              <button
                type="button"
                onClick={() => setModalTab('task')}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all',
                  modalTab === 'task' ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}
              >
                <ClipboardList className="w-4 h-4" /> {t('Даалгавар өгөх', 'Assign Task')}
              </button>
            </div>
          )}

          {modalTab === 'minutes' && (
          <>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын нэр', 'Meeting Title')}</label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="input-field"
              placeholder={t('Хурлын нэр', 'Meeting title')}
              readOnly={!canEditSelected}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын огноо', 'Date')}</label>
              <input
                type="date"
                value={formData.date || ''}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="input-field"
                disabled={!canEditSelected}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хурлын цаг', 'Time')}</label>
              <input
                type="time"
                value={formData.time || ''}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
                className="input-field"
                disabled={!canEditSelected}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Оролцогчид', 'Attendees')}</label>
            {renderUserPicker('attendeeUserIds', isAttendeesOpen, setIsAttendeesOpen, t('Оролцогч сонгох', 'Select attendees'))}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хэлэлцсэн асуудал', 'Agenda / Discussed Issues')}</label>
            <RichTextEditor
              value={formData.agenda || ''}
              onChange={html => setFormData(prev => ({ ...prev, agenda: html }))}
              placeholder={t('Хэлэлцсэн асуудлууд...', 'Discussed issues...')}
              readOnly={!canEditSelected}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Гаргасан шийдвэр', 'Decisions')}</label>
            <RichTextEditor
              value={formData.decisions || ''}
              onChange={html => setFormData(prev => ({ ...prev, decisions: html }))}
              placeholder={t('Гаргасан шийдвэрүүд...', 'Decisions made...')}
              readOnly={!canEditSelected}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Тэмдэглэл', 'Notes')}</label>
            <RichTextEditor
              value={formData.notes || ''}
              onChange={html => setFormData(prev => ({ ...prev, notes: html }))}
              placeholder={t('Нэмэлт тэмдэглэл...', 'Additional notes...')}
              readOnly={!canEditSelected}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хавсаргасан файл', 'Attachments')}</label>
            {canEditSelected && (
              <input type="file" multiple onChange={handleAttachmentUpload} className="input-field" />
            )}
            {(formData.attachments || []).length > 0 && (
              <div className="space-y-2">
                {(formData.attachments || []).map(item => (
                  <div key={item.id} className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500">{(item.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={item.dataUrl}
                        download={item.name}
                        className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 transition-colors"
                      >
                        {t('Татах', 'Download')}
                      </a>
                      {canEditSelected && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canEditSelected && (
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Харах хэрэглэгч', 'Visible Users')}</label>
              {renderUserPicker('visibleToUserIds', isVisibleUsersOpen, setIsVisibleUsersOpen, t('Хэрэглэгч сонгох', 'Select users'))}
              <p className="text-[11px] text-slate-500">
                {t('Юу ч сонгохгүй бол бүх ажилтанд харагдана. Оролцогчид үргэлж харна.', 'Visible to everyone if none selected. Attendees can always view.')}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {selected && canEditSelected && (
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
              {canEditSelected ? t('Цуцлах', 'Cancel') : t('Хаах', 'Close')}
            </button>
            {canEditSelected && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
              >
                {saving ? t('Хадгалж байна...', 'Saving...') : t('Хадгалах', 'Save')}
              </button>
            )}
          </div>
          </>
          )}

          {/* Даалгавар өгөх дэд хэсэг */}
          {modalTab === 'task' && (
          <>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Даалгаврын нэр', 'Task title')}</label>
            <input
              type="text"
              value={taskForm.title}
              onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
              className="input-field"
              placeholder={t('Юу хийх ёстой вэ?', 'What needs to be done?')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Дуусах хугацаа', 'Due date')}</label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={e => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Холбогдох хурал (сонголтоор)', 'Related meeting (optional)')}</label>
              <input
                type="text"
                value={taskForm.sourceLabel}
                onChange={e => setTaskForm(prev => ({ ...prev, sourceLabel: e.target.value }))}
                className="input-field"
                placeholder={t('Хурлын нэр', 'Meeting name')}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Тайлбар (сонголтоор)', 'Description (optional)')}</label>
            <RichTextEditor
              value={taskForm.description}
              onChange={html => setTaskForm(prev => ({ ...prev, description: html }))}
              placeholder={t('Дэлгэрэнгүй тайлбар...', 'Details...')}
            />
          </div>

          {/* Ажилтныг хэлтсээр эсвэл нэг бүрчлэн сонгох */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('Хэнд даалгах вэ?', 'Assign to')}</label>
              <span className="text-xs font-semibold text-primary">
                {taskForm.assignedToUserIds.length} {t('сонгосон', 'selected')}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setTaskDeptFilter('all')}
                className={cn('px-2.5 py-1 rounded-full text-xs font-bold transition-all', taskDeptFilter === 'all' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}
              >
                {t('Бүгд', 'All')}
              </button>
              {departments.map(dept => (
                <button
                  key={dept.key}
                  type="button"
                  onClick={() => setTaskDeptFilter(dept.key)}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-bold transition-all', taskDeptFilter === dept.key ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}
                >
                  {dept.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 max-h-52 overflow-y-auto space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskFilteredUsers.length > 0 && taskFilteredUsers.every(u => taskForm.assignedToUserIds.includes(u.uid))}
                  onChange={toggleTaskDeptAll}
                />
                <span>
                  {t('Энэ хэсгийн бүгдийг сонгох', 'Select all in this group')} ({taskFilteredUsers.filter(u => taskForm.assignedToUserIds.includes(u.uid)).length}/{taskFilteredUsers.length})
                </span>
              </label>
              {taskFilteredUsers.map(u => (
                <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taskForm.assignedToUserIds.includes(u.uid)}
                    onChange={() => toggleTaskUser(u.uid)}
                  />
                  <span>{u.displayName}</span>
                  <span className="text-[11px] text-slate-400">· {u.department}</span>
                </label>
              ))}
              {taskFilteredUsers.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">{t('Ажилтан байхгүй', 'No users')}</p>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {t('Сонгосон ажилтнуудын "Миний даалгаврууд" хэсэгт даалгавар гарч ирнэ.', 'The task will appear in the selected employees\' "My Tasks".')}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {t('Цуцлах', 'Cancel')}
            </button>
            <button
              onClick={handleAssignTask}
              disabled={savingTask}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {savingTask ? t('Өгч байна...', 'Assigning...') : t('Даалгавар өгөх', 'Assign task')}
            </button>
          </div>
          </>
          )}
        </div>
      </Modal>
    </div>
  );
};
