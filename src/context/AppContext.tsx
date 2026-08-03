import React, { createContext, useContext, useEffect, useState } from 'react';
import { Project, Event, Language, Theme, UserProfile, Department, UserStatus, UserRole, UserPermission, Task, TaskStatus, ProcurementPlan, MeetingMinutes, MeetingSignal, MeetingDuration, LeaveRequest, LeaveStatus, DEFAULT_LEAVE_DAYS, PersonalMeetingNote, MeetingRecurrence, MeetingType, Poll, WorkPlan } from '../types';
import { generateOccurrenceDates } from '../utils/meeting';

export interface NewMeetingInput {
  title: string;
  description?: string;
  date: string;
  time: string;
  durationMinutes: number;
  endTime: string;
  recurrence: MeetingRecurrence;
  meetingType: MeetingType;
  location?: string;
  attendeeUserIds: string[];
  minutesKeeperUserId?: string;
}

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AppContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  isAuthReady: boolean;
  projects: Project[];
  events: Event[];
  tasks: Task[];
  procurementPlans: ProcurementPlan[];
  language: Language;
  theme: Theme;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, firstName: string, lastName: string, department: Department) => Promise<void>;
  logout: () => Promise<void>;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  addProject: (project: Project) => Promise<void>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addEvent: (event: Event) => Promise<void>;
  updateEvent: (event: Event) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  canManageMeetings: boolean;
  createMeetingSeries: (meeting: NewMeetingInput) => Promise<number>;
  addTask: (task: Task) => Promise<void>;
  assignMeetingTask: (data: { title: string; description?: string; dueDate: string; assignedToUserIds: string[]; sourceLabel?: string }) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  canEditProcurement: (plan?: ProcurementPlan) => boolean;
  canAccessProcurement: boolean;
  addProcurementPlan: (plan: ProcurementPlan) => Promise<void>;
  updateProcurementPlan: (plan: ProcurementPlan) => Promise<void>;
  deleteProcurementPlan: (id: string) => Promise<void>;
  meetingMinutes: MeetingMinutes[];
  addMeetingMinutes: (minutes: MeetingMinutes) => Promise<void>;
  updateMeetingMinutes: (minutes: MeetingMinutes) => Promise<void>;
  deleteMeetingMinutes: (id: string) => Promise<void>;
  canManageMinutes: (minutes?: MeetingMinutes) => boolean;
  personalNotes: PersonalMeetingNote[];
  savePersonalNote: (note: Partial<PersonalMeetingNote>) => Promise<void>;
  deletePersonalNote: (id: string) => Promise<void>;
  leaveRequests: LeaveRequest[];
  leaveEntitlement: number;
  leaveYear: number;
  leaveEntitlementFor: (userId: string) => number;
  addLeaveRequest: (request: { startDate: string; endDate: string; reason?: string }) => Promise<void>;
  updateLeaveStatus: (id: string, status: LeaveStatus) => Promise<void>;
  deleteLeaveRequest: (id: string) => Promise<void>;
  updateLeaveEntitlement: (year: number, days: number) => Promise<void>;
  updateUserLeaveEntitlement: (userId: string, year: number, days: number | null) => Promise<void>;
  polls: Poll[];
  refreshPolls: () => Promise<void>;
  addPoll: (poll: { question: string; description?: string; options: string[]; allowMultiple: boolean; minChoices?: number | null; maxChoices?: number | null; anonymous: boolean; visibleToUserIds?: string[]; closesAt?: string }) => Promise<void>;
  votePoll: (pollId: string, optionIds: string[]) => Promise<void>;
  closePoll: (pollId: string) => Promise<void>;
  deletePoll: (pollId: string) => Promise<void>;
  workPlans: WorkPlan[];
  refreshWorkPlans: () => Promise<void>;
  canEditWorkPlan: (plan?: WorkPlan) => boolean;
  addWorkPlan: (plan: Omit<WorkPlan, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<WorkPlan>;
  updateWorkPlan: (plan: WorkPlan) => Promise<void>;
  signWorkPlan: (planId: string, role: 'approve' | 'review' | 'compile', revoke?: boolean) => Promise<void>;
  deleteWorkPlan: (id: string) => Promise<void>;
  unreadMessageCount: number;
  refreshUnreadMessages: () => Promise<void>;
  meetingSignal: MeetingSignal | null;
  meetingDurations: MeetingDuration[];
  canStartMeeting: boolean;
  startMeetingSignal: (meeting: { meetingId?: string; title: string; time?: string }) => Promise<void>;
  endMeetingSignal: () => Promise<void>;
  updateUserStatus: (uid: string, status: UserStatus) => Promise<void>;
  updateManagedUser: (uid: string, updates: { email?: string; firstName: string; lastName: string; department: Department; password?: string; role?: UserRole; permissions?: UserPermission[] }) => Promise<UserProfile>;
  createManagedUser: (data: { email: string; password: string; firstName: string; lastName: string; department: Department; role: UserRole; permissions: UserPermission[] }) => Promise<UserProfile>;
  deleteManagedUser: (uid: string) => Promise<void>;
  updateProfilePicture: (photoDataUrl: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AUTH_USER_KEY = 'auth_user';
const AUTH_PROFILE_KEY = 'auth_profile';

async function parseErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data?.message || fallback;
  } catch {
    return fallback;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [storedProjects, setStoredProjects] = useState<Project[]>([]);
  const [storedEvents, setStoredEvents] = useState<Event[]>([]);
  const [storedTasks, setStoredTasks] = useState<Task[]>([]);
  const [storedProcurementPlans, setStoredProcurementPlans] = useState<ProcurementPlan[]>([]);
  const [storedMeetingMinutes, setStoredMeetingMinutes] = useState<MeetingMinutes[]>([]);
  const [personalNotes, setPersonalNotes] = useState<PersonalMeetingNote[]>([]);
  const [storedLeaveRequests, setStoredLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveEntitlement, setLeaveEntitlement] = useState<number>(DEFAULT_LEAVE_DAYS);
  // Ажилтан тус бүрийн override (userId → хоног). Байхгүй бол глобал өгөгдмөлийг хэрэглэнэ.
  const [userLeaveEntitlements, setUserLeaveEntitlements] = useState<Record<string, number>>({});
  const [storedMeetingSignal, setStoredMeetingSignal] = useState<MeetingSignal | null>(null);
  const [meetingDurations, setMeetingDurations] = useState<MeetingDuration[]>([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [storedWorkPlans, setStoredWorkPlans] = useState<WorkPlan[]>([]);
  const [language, setLanguage] = useState<Language>('MN');
  const [theme, setTheme] = useState<Theme>('dark');

  const hasPermission = (permission: 'procurement' | 'meeting') => {
    if (!profile || profile.status !== 'approved') return false;
    if (profile.role === 'admin') return true;
    return (profile.permissions || []).includes(permission);
  };

  const canViewItem = (item: { visibleToUserIds?: string[] }) => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;

    const visibleTo = item.visibleToUserIds || [];

    if (visibleTo.length === 0) return true;
    return visibleTo.includes(profile.uid);
  };

  const canViewTask = (task: Task) => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    const assigned = task.assignedToUserIds || [];
    if (assigned.length === 0) return false;
    return assigned.includes(profile.uid);
  };

  const canViewMinutesItem = (minutes: MeetingMinutes) => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if ((minutes.attendeeUserIds || []).includes(profile.uid)) return true;
    if (minutes.createdBy === profile.uid) return true;

    const visibleTo = minutes.visibleToUserIds || [];
    if (visibleTo.length === 0) return true;
    return visibleTo.includes(profile.uid);
  };

  // Худалдан авалт: харах эрх нь visibleToUserIds-аар, засах эрх нь editableByUserIds-аар тодорхойлогдоно.
  // Засах эрх олгогдсон ажилтан заавал харна (эс бөгөөс засах боловч харах боломжгүй болно).
  const canViewProcurement = (plan: ProcurementPlan) => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if ((plan.editableByUserIds || []).includes(profile.uid)) return true;

    const visibleTo = plan.visibleToUserIds || [];
    if (visibleTo.length === 0) return true;
    return visibleTo.includes(profile.uid);
  };

  // plan байхгүй = шинээр үүсгэх эрх шалгаж байна
  const canEditProcurement = (plan?: ProcurementPlan) => {
    if (!profile || profile.status !== 'approved') return false;
    if (profile.role === 'admin') return true;
    if (!plan) return hasPermission('procurement');

    const editableBy = plan.editableByUserIds || [];
    // Тодорхой ажилтан сонгогдсон бол ЗӨВХӨН тэд засна
    if (editableBy.length > 0) return editableBy.includes(profile.uid);
    // Хоосон бол хуучин дүрмээр 'procurement' эрхтэй ажилтан засна
    return hasPermission('procurement');
  };

  // Худалдан авалтын хуудас руу нэвтрэх эрх: админ, глобал 'procurement' эрхтэй,
  // эсвэл ямар нэг мөрөнд харах/засах эрх нэрлэгдсэн ажилтан. Аль нь ч биш бол хуудас огт харагдахгүй.
  const canAccessProcurement = !!profile && profile.status === 'approved' && (
    profile.role === 'admin' ||
    hasPermission('procurement') ||
    (profile.permissions || []).includes('procurement_view') ||
    storedProcurementPlans.some(p =>
      (p.visibleToUserIds || []).includes(profile.uid) ||
      (p.editableByUserIds || []).includes(profile.uid)
    )
  );

  // Ажлын төлөвлөгөө: админ бүх төлөвлөгөөг харж, засна.
  // Ажилтан нь тухайн хүснэгтэд нэрээр эсвэл хэлтсээрээ эрх олгогдсон бол л харна/засна.

  // plan байхгүй = шинээр үүсгэх эрх шалгаж байна (зөвхөн админ үүсгэнэ)
  const canEditWorkPlan = (plan?: WorkPlan) => {
    if (!profile || profile.status !== 'approved') return false;
    if (profile.role === 'admin') return true;
    if (!plan) return false;

    return (plan.editableByUserIds || []).includes(profile.uid) ||
      (plan.editableByDepartments || []).includes(profile.department);
  };

  // Дөрвөн жагсаалт бүгд хоосон бол хүснэгт бүх ажилтанд ил (гэхдээ зөвхөн уншина)
  const canViewWorkPlan = (plan: WorkPlan) => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (canEditWorkPlan(plan)) return true;

    const users = plan.visibleToUserIds || [];
    const depts = plan.visibleToDepartments || [];
    const editUsers = plan.editableByUserIds || [];
    const editDepts = plan.editableByDepartments || [];
    if (users.length === 0 && depts.length === 0 && editUsers.length === 0 && editDepts.length === 0) return true;

    return users.includes(profile.uid) || depts.includes(profile.department);
  };

  const projects = storedProjects.filter(canViewItem);
  const events = storedEvents.filter(canViewItem);
  const tasks = storedTasks.filter(canViewTask);
  const procurementPlans = storedProcurementPlans.filter(canViewProcurement);
  const meetingMinutes = storedMeetingMinutes.filter(canViewMinutesItem);
  const workPlans = storedWorkPlans.filter(canViewWorkPlan);
  // Админ бүх хүсэлтийг, ажилтан зөвхөн өөрийнхөө хүсэлтийг харна
  const leaveRequests = storedLeaveRequests.filter(r => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    return r.userId === profile.uid;
  });
  const leaveYear = new Date().getFullYear();
  // Тодорхой ажилтны эрхтэй хоног: override байвал түүнийг, эс бөгөөс глобал өгөгдмөлийг
  const leaveEntitlementFor = (userId: string) =>
    userLeaveEntitlements[userId] !== undefined ? userLeaveEntitlements[userId] : leaveEntitlement;

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) setTheme(savedTheme);

    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang) setLanguage(savedLang);

    const savedUser = localStorage.getItem(AUTH_USER_KEY);
    const savedProfile = localStorage.getItem(AUTH_PROFILE_KEY);
    if (savedUser && savedProfile) {
      setUser(JSON.parse(savedUser));
      setProfile(JSON.parse(savedProfile));
    }

    setIsAuthReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    const loadProjectsAndEvents = async () => {
      try {
        const currentYear = new Date().getFullYear();
        const [projectsRes, eventsRes, tasksRes, procurementRes, minutesRes, leaveRes, leaveSettingsRes, leaveEntitlementsRes, workPlansRes] = await Promise.all([
          fetch('/api/projects'),
          fetch('/api/events'),
          fetch('/api/tasks'),
          fetch('/api/procurement-plans'),
          fetch('/api/meeting-minutes'),
          fetch('/api/leave-requests'),
          fetch(`/api/leave-settings?year=${currentYear}`),
          fetch(`/api/leave-entitlements?year=${currentYear}`),
          fetch('/api/work-plans'),
        ]);

        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          setStoredProjects(projectsData);
        }

        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          setStoredEvents(eventsData);
        }

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          setStoredTasks(tasksData);
        }

        if (procurementRes.ok) {
          const procurementData = await procurementRes.json();
          setStoredProcurementPlans(procurementData);
        }

        if (minutesRes.ok) {
          const minutesData = await minutesRes.json();
          setStoredMeetingMinutes(minutesData);
        }

        if (leaveRes.ok) {
          const leaveData = await leaveRes.json();
          setStoredLeaveRequests(leaveData);
        }

        if (leaveSettingsRes.ok) {
          const settings = await leaveSettingsRes.json();
          setLeaveEntitlement(Number(settings?.days) || DEFAULT_LEAVE_DAYS);
        }

        if (leaveEntitlementsRes.ok) {
          const overrides = (await leaveEntitlementsRes.json()) as { userId: string; days: number }[];
          const map: Record<string, number> = {};
          overrides.forEach(o => { map[o.userId] = Number(o.days); });
          setUserLeaveEntitlements(map);
        }

        if (workPlansRes.ok) {
          setStoredWorkPlans((await workPlansRes.json()) as WorkPlan[]);
        }
      } catch (error) {
        console.error('Error loading projects and events:', error);
      }
    };

    loadProjectsAndEvents();
  }, [isAuthReady]);

  // Хувийн тэмдэглэлийг зөвхөн нэвтэрсэн ажилтныхаар татна
  useEffect(() => {
    if (!profile?.uid) {
      setPersonalNotes([]);
      return;
    }

    let cancelled = false;
    const loadNotes = async () => {
      try {
        const res = await fetch(`/api/personal-notes?userId=${encodeURIComponent(profile.uid)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPersonalNotes(data as PersonalMeetingNote[]);
      } catch (error) {
        console.error('Personal notes fetch error:', error);
      }
    };

    loadNotes();
    return () => {
      cancelled = true;
    };
  }, [profile?.uid]);

  const savePersonalNote = async (note: Partial<PersonalMeetingNote>) => {
    if (!profile || profile.status !== 'approved') return;

    const isUpdate = !!note.id && personalNotes.some(n => n.id === note.id);
    const payload = {
      id: note.id || Math.random().toString(36).slice(2, 11),
      userId: profile.uid,
      meetingId: note.meetingId,
      meetingTitle: note.meetingTitle || '',
      meetingDate: note.meetingDate,
      notes: note.notes || '',
      directorTasks: note.directorTasks || '',
    };

    const res = await fetch(isUpdate ? `/api/personal-notes/${payload.id}` : '/api/personal-notes', {
      method: isUpdate ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хувийн тэмдэглэл хадгалах үед алдаа гарлаа.'));
    }

    const saved = (await res.json()) as PersonalMeetingNote;
    setPersonalNotes(prev => (isUpdate ? prev.map(n => (n.id === saved.id ? saved : n)) : [saved, ...prev]));
  };

  const deletePersonalNote = async (id: string) => {
    if (!profile) return;

    const res = await fetch(`/api/personal-notes/${id}?userId=${encodeURIComponent(profile.uid)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хувийн тэмдэглэл устгах үед алдаа гарлаа.'));
    }

    setPersonalNotes(prev => prev.filter(n => n.id !== id));
  };

  // Дууссан хурлуудын үргэлжилсэн хугацаа
  const loadMeetingDurations = async () => {
    try {
      const res = await fetch('/api/meeting-signal/history');
      if (!res.ok) return;
      const data = await res.json();
      setMeetingDurations(data as MeetingDuration[]);
    } catch {
      /* ignore */
    }
  };

  // Онлайн төлөв: 20 секунд тутам "идэвхтэй" дохио илгээнэ (нэвтэрсэн үед)
  useEffect(() => {
    if (!profile?.uid) return;
    let cancelled = false;
    const beat = async () => {
      try {
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: profile.uid }),
        });
      } catch {
        /* ignore */
      }
    };
    if (!cancelled) beat();
    const timer = setInterval(beat, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile?.uid]);

  // Уншаагүй зурвасын нийт тоог тогтмол шинэчилж, цэсэн дээр тэмдэглэнэ
  const refreshUnreadMessages = async () => {
    if (!profile?.uid) return;
    try {
      const res = await fetch(`/api/messages/threads?userId=${encodeURIComponent(profile.uid)}`);
      if (!res.ok) return;
      const threads = (await res.json()) as { unreadCount: number }[];
      setUnreadMessageCount(threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!profile?.uid) {
      setUnreadMessageCount(0);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await refreshUnreadMessages();
    };
    tick();
    const timer = setInterval(tick, 7000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile?.uid]);

  // Онлайн төлөв — нэвтэрсэн ажилтан тогтмол "ping" илгээж, бусдад онлайн харагдана
  useEffect(() => {
    if (!profile?.uid) return;
    const ping = () => {
      fetch('/api/presence/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.uid }),
      }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 20000);
    return () => clearInterval(timer);
  }, [profile?.uid]);

  // Live meeting signal — poll so a started meeting flashes for every logged-in user.
  useEffect(() => {
    if (!user) {
      setStoredMeetingSignal(null);
      return;
    }

    let cancelled = false;
    const fetchSignal = async () => {
      try {
        const res = await fetch('/api/meeting-signal');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStoredMeetingSignal(data?.active ? (data.signal as MeetingSignal) : null);
      } catch {
        /* ignore transient polling errors */
      }
    };

    fetchSignal();
    loadMeetingDurations();
    const timer = setInterval(fetchSignal, 7000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  // ===== Санал асуулга =====
  const refreshPolls = async () => {
    if (!profile?.uid) {
      setPolls([]);
      return;
    }
    try {
      const res = await fetch(`/api/polls?userId=${encodeURIComponent(profile.uid)}`);
      if (!res.ok) return;
      setPolls((await res.json()) as Poll[]);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!profile?.uid) {
      setPolls([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/polls?userId=${encodeURIComponent(profile.uid)}`);
        if (!res.ok) return;
        const data = (await res.json()) as Poll[];
        if (!cancelled) setPolls(data);
      } catch {
        /* ignore */
      }
    };
    tick();
    // Бусдын өгсөн санал шинэчлэгдэж харагдахын тулд тогтмол татна
    const timer = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile?.uid]);

  const addPoll = async (poll: { question: string; description?: string; options: string[]; allowMultiple: boolean; minChoices?: number | null; maxChoices?: number | null; anonymous: boolean; visibleToUserIds?: string[]; closesAt?: string }) => {
    // Санал асуулга үүсгэх эрх: зөвхөн админ
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

    const res = await fetch('/api/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Math.random().toString(36).slice(2, 11),
        question: poll.question,
        description: poll.description || '',
        options: poll.options.map(text => ({ id: Math.random().toString(36).slice(2, 11), text })),
        allowMultiple: poll.allowMultiple,
        minChoices: poll.allowMultiple ? poll.minChoices ?? null : null,
        maxChoices: poll.allowMultiple ? poll.maxChoices ?? null : null,
        anonymous: poll.anonymous,
        visibleToUserIds: poll.visibleToUserIds || [],
        closesAt: poll.closesAt || null,
        createdBy: profile.uid,
        createdByName: profile.displayName,
      }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Санал асуулга үүсгэх үед алдаа гарлаа.'));
    }

    const created = (await res.json()) as Poll;
    setPolls(prev => [created, ...prev]);
  };

  const votePoll = async (pollId: string, optionIds: string[]) => {
    if (!profile || profile.status !== 'approved') return;

    const res = await fetch(`/api/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.uid, userName: profile.displayName, optionIds }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Санал өгөх үед алдаа гарлаа.'));
    }

    const updated = (await res.json()) as Poll;
    setPolls(prev => prev.map(p => (p.id === pollId ? updated : p)));
  };

  const closePoll = async (pollId: string) => {
    // Хаах эрх: зөвхөн админ
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/polls/${pollId}/close`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.uid }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Санал асуулга хаах үед алдаа гарлаа.'));
    }

    const updated = (await res.json()) as Poll;
    setPolls(prev => prev.map(p => (p.id === pollId ? updated : p)));
  };

  const deletePoll = async (pollId: string) => {
    // Устгах эрх: зөвхөн админ
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/polls/${pollId}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Санал асуулга устгах үед алдаа гарлаа.'));
    }

    setPolls(prev => prev.filter(p => p.id !== pollId));
  };

  // ===== Ажлын төлөвлөгөө =====
  const refreshWorkPlans = async () => {
    try {
      const res = await fetch('/api/work-plans');
      if (!res.ok) return;
      setStoredWorkPlans((await res.json()) as WorkPlan[]);
    } catch {
      /* ignore */
    }
  };

  const addWorkPlan = async (plan: Omit<WorkPlan, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'updatedAt'>) => {
    // Төлөвлөгөө үүсгэх эрх: зөвхөн админ
    if (!profile || profile.role !== 'admin') {
      throw new Error('Ажлын төлөвлөгөө үүсгэх эрхгүй байна.');
    }

    const res = await fetch('/api/work-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...plan,
        id: Math.random().toString(36).slice(2, 11),
        createdBy: profile.uid,
        createdByName: profile.displayName,
      }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Ажлын төлөвлөгөө үүсгэх үед алдаа гарлаа.'));
    }

    const created = (await res.json()) as WorkPlan;
    setStoredWorkPlans(prev => [created, ...prev]);
    return created;
  };

  const updateWorkPlan = async (plan: WorkPlan) => {
    if (!canEditWorkPlan(plan)) {
      throw new Error('Энэ төлөвлөгөөг засах эрхгүй байна.');
    }

    const res = await fetch(`/api/work-plans/${plan.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Ажлын төлөвлөгөө хадгалах үед алдаа гарлаа.'));
    }

    const updated = (await res.json()) as WorkPlan;
    setStoredWorkPlans(prev => prev.map(p => (p.id === plan.id ? updated : p)));
  };

  // Гарын үсэг зурах — сервер тал нь тухайн үүрэгт нэрлэгдсэн ажилтан мөн эсэхийг шалгана
  const signWorkPlan = async (planId: string, role: 'approve' | 'review' | 'compile', revoke = false) => {
    if (!profile || profile.status !== 'approved') return;

    const res = await fetch(`/api/work-plans/${planId}/sign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: profile.uid, role, revoke }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Гарын үсэг зурах үед алдаа гарлаа.'));
    }

    const updated = (await res.json()) as WorkPlan;
    setStoredWorkPlans(prev => prev.map(p => (p.id === planId ? updated : p)));
  };

  const deleteWorkPlan = async (id: string) => {
    // Устгах эрх: зөвхөн админ
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/work-plans/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Ажлын төлөвлөгөө устгах үед алдаа гарлаа.'));
    }

    setStoredWorkPlans(prev => prev.filter(p => p.id !== id));
  };

  // ===== Ээлжийн амралт =====
  const addLeaveRequest = async (request: { startDate: string; endDate: string; reason?: string }) => {
    if (!profile || profile.status !== 'approved') return;

    const res = await fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Math.random().toString(36).slice(2, 11),
        userId: profile.uid,
        userName: profile.displayName,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason || '',
      }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Амралтын хүсэлт илгээх үед алдаа гарлаа.'));
    }

    const created = (await res.json()) as LeaveRequest;
    setStoredLeaveRequests(prev => [created, ...prev]);
  };

  const updateLeaveStatus = async (id: string, status: LeaveStatus) => {
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/leave-requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewedBy: profile.uid, reviewedByName: profile.displayName }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Амралтын төлөв шинэчлэх үед алдаа гарлаа.'));
    }

    const updated = (await res.json()) as LeaveRequest;
    setStoredLeaveRequests(prev => prev.map(r => (r.id === id ? updated : r)));
  };

  const deleteLeaveRequest = async (id: string) => {
    if (!profile) return;
    const target = storedLeaveRequests.find(r => r.id === id);
    // Ажилтан зөвхөн хүлээгдэж буй өөрийн хүсэлтээ цуцалж болно, админ бүгдийг устгана
    const allowed = profile.role === 'admin' || (target?.userId === profile.uid && target?.status === 'Pending');
    if (!allowed) return;

    const res = await fetch(`/api/leave-requests/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Амралтын хүсэлт устгах үед алдаа гарлаа.'));
    }

    setStoredLeaveRequests(prev => prev.filter(r => r.id !== id));
  };

  const updateLeaveEntitlement = async (year: number, days: number) => {
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/leave-settings/${year}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Амралтын эрх шинэчлэх үед алдаа гарлаа.'));
    }

    const data = await res.json();
    if (Number(year) === new Date().getFullYear()) {
      setLeaveEntitlement(Number(data?.days) || DEFAULT_LEAVE_DAYS);
    }
  };

  // Ажилтан тус бүрийн амралтын хоног. days === null бол override устгаж, глобал өгөгдмөл рүү буцаана.
  const updateUserLeaveEntitlement = async (userId: string, year: number, days: number | null) => {
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/leave-entitlements/${userId}/${year}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Ажилтны амралтын эрх шинэчлэх үед алдаа гарлаа.'));
    }

    const data = await res.json();
    if (Number(year) === new Date().getFullYear()) {
      setUserLeaveEntitlements(prev => {
        const next = { ...prev };
        if (data?.isOverride) next[userId] = Number(data.days);
        else delete next[userId]; // override арилсан — глобал өгөгдмөл рүү буцна
        return next;
      });
    }
  };

  // Хурал эхлүүлэх эрх: зөвхөн админ болон хурлын тэмдэглэл хөтөлдөг ('minutes' эрхтэй) хүн
  const canStartMeeting = !!profile && profile.status === 'approved' &&
    (profile.role === 'admin' || (profile.permissions || []).includes('minutes'));

  const startMeetingSignal = async (meeting: { meetingId?: string; title: string; time?: string }) => {
    if (!canStartMeeting || !profile) return;

    const res = await fetch('/api/meeting-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: meeting.meetingId,
        title: meeting.title,
        time: meeting.time,
        startedBy: profile.uid,
        startedByName: profile.displayName,
      }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хурал эхлүүлэх үед алдаа гарлаа.'));
    }

    const data = await res.json();
    setStoredMeetingSignal(data?.signal as MeetingSignal);
  };

  const endMeetingSignal = async () => {
    // Дуусгах эрх: админ эсвэл дохиог эхлүүлсэн хүн
    if (!profile) return;
    const isStarter = storedMeetingSignal?.startedBy === profile.uid;
    if (profile.role !== 'admin' && !isStarter) return;

    const res = await fetch('/api/meeting-signal/end', { method: 'POST' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хурал дуусгах үед алдаа гарлаа.'));
    }
    setStoredMeetingSignal(null);
    // Дууссан хурлын үргэлжилсэн хугацааг шууд татаж шинэчилнэ
    await loadMeetingDurations();
  };

  const login = async () => {
    throw new Error('Google login disabled');
  };

  const loginWithEmail = async (username: string, pass: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Нэвтрэх үед алдаа гарлаа.'));
    }

    const data = await res.json();
    setUser(data.user);
    setProfile(data.profile);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(data.profile));
  };

  const register = async (username: string, pass: string, firstName: string, lastName: string, department: Department) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass, firstName, lastName, department }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Бүртгүүлэх үед алдаа гарлаа.'));
    }

    const data = await res.json();
    setUser(data.user);
    setProfile(data.profile);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(data.profile));
  };

  const logout = async () => {
    setUser(null);
    setProfile(null);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_PROFILE_KEY);
  };

  const updateUserStatus = async (uid: string, status: UserStatus) => {
    if (!profile || profile.role !== 'admin') return;

    const res = await fetch(`/api/users/${uid}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Төлөв шинэчлэх үед алдаа гарлаа.'));
    }

    if (profile.uid === uid) {
      const updated = { ...profile, status };
      setProfile(updated);
      localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(updated));
    }
  };

  const updateManagedUser = async (
    uid: string,
    updates: { email?: string; firstName: string; lastName: string; department: Department; password?: string; role?: UserRole; permissions?: UserPermission[] }
  ) => {
    if (!profile || profile.role !== 'admin') {
      throw new Error('Админ эрх шаардлагатай.');
    }

    const res = await fetch(`/api/users/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хэрэглэгчийн мэдээлэл шинэчлэх үед алдаа гарлаа.'));
    }

    const data = await res.json();
    const updatedProfile = data.profile as UserProfile;

    if (profile.uid === uid) {
      setProfile(updatedProfile);
      localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(updatedProfile));

      if (user) {
        const updatedUser = {
          ...user,
          displayName: updatedProfile.displayName,
          email: updatedProfile.email,
        };
        setUser(updatedUser);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
      }
    }

    return updatedProfile;
  };

  const createManagedUser = async (
    data: { email: string; password: string; firstName: string; lastName: string; department: Department; role: UserRole; permissions: UserPermission[] }
  ) => {
    if (!profile || profile.role !== 'admin') {
      throw new Error('Админ эрх шаардлагатай.');
    }

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        department: data.department,
        role: data.role,
        permissions: data.permissions,
      }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хэрэглэгч нэмэх үед алдаа гарлаа.'));
    }

    const result = await res.json();
    return result.profile as UserProfile;
  };

  const deleteManagedUser = async (uid: string) => {
    if (!profile || profile.role !== 'admin') {
      throw new Error('Админ эрх шаардлагатай.');
    }
    if (profile.uid === uid) {
      throw new Error('Өөрийгөө устгах боломжгүй.');
    }

    const res = await fetch(`/api/users/${uid}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хэрэглэгч устгах үед алдаа гарлаа.'));
    }
  };

  const addProject = async (project: Project) => {
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;
    
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });

      if (res.ok) {
        setStoredProjects(prev => [project, ...prev]);
      } else {
        throw new Error('Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const updateProject = async (project: Project) => {
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;
    
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });

      if (res.ok) {
        setStoredProjects(prev => prev.map(p => (p.id === project.id ? project : p)));
      } else {
        throw new Error('Failed to update project');
      }
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const deleteProject = async (id: string) => {
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;
    
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setStoredProjects(prev => prev.filter(p => p.id !== id));
      } else {
        throw new Error('Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const addEvent = async (event: Event) => {
    if (!profile || profile.status !== 'approved') return;
    if (profile.role !== 'admin' && !(hasPermission('meeting') && event.category === 'Meeting')) return;

    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Арга хэмжээ хадгалах үед алдаа гарлаа.'));
    }

    setStoredEvents(prev => [...prev, event]);
  };

  const updateEvent = async (event: Event) => {
    if (!profile || profile.status !== 'approved') return;
    if (profile.role !== 'admin' && !(hasPermission('meeting') && event.category === 'Meeting')) return;

    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Арга хэмжээ шинэчлэх үед алдаа гарлаа.'));
    }

    setStoredEvents(prev => prev.map(e => (e.id === event.id ? event : e)));
  };

  const deleteEvent = async (id: string) => {
    if (!profile || profile.status !== 'approved') return;
    const target = storedEvents.find(e => e.id === id);
    if (profile.role !== 'admin' && !(hasPermission('meeting') && target?.category === 'Meeting')) return;

    const res = await fetch(`/api/events/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Арга хэмжээ устгах үед алдаа гарлаа.'));
    }

    setStoredEvents(prev => prev.filter(e => e.id !== id));
  };

  // Хурал нэмэх эрх: админ эсвэл 'meeting' эрхтэй ажилтан
  const canManageMeetings = !!profile && profile.status === 'approved' &&
    (profile.role === 'admin' || (profile.permissions || []).includes('meeting'));

  // Давтамжийн дагуу олон хурлын бичлэг (event, category='Meeting') үүсгэнэ. Үүсгэсэн тоог буцаана.
  const createMeetingSeries = async (meeting: NewMeetingInput) => {
    if (!canManageMeetings) return 0;

    const dates = generateOccurrenceDates(meeting.date, meeting.recurrence);
    if (dates.length === 0) throw new Error('Хурлын огноо буруу байна.');

    const seriesId = meeting.recurrence === 'none' ? undefined : Math.random().toString(36).slice(2, 11);
    // Зөвхөн оролцогчид болон тэмдэглэл хөтлөгчид харагдана (аль нь ч сонгогдоогүй бол бүгдэд)
    const visibleToUserIds = Array.from(new Set([
      ...(meeting.attendeeUserIds || []),
      ...(meeting.minutesKeeperUserId ? [meeting.minutesKeeperUserId] : []),
    ]));

    const created: Event[] = dates.map(date => ({
      id: Math.random().toString(36).slice(2, 11),
      title: meeting.title,
      description: meeting.description || '',
      date,
      time: meeting.time,
      category: 'Meeting',
      priority: 'Medium',
      tags: [],
      attachments: [],
      visibleToUserIds,
      endTime: meeting.endTime || undefined,
      durationMinutes: meeting.durationMinutes,
      recurrence: meeting.recurrence,
      meetingType: meeting.meetingType,
      location: meeting.location || undefined,
      attendeeUserIds: meeting.attendeeUserIds || [],
      minutesKeeperUserId: meeting.minutesKeeperUserId || undefined,
      seriesId,
    }));

    for (const event of created) {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res, 'Хурал үүсгэх үед алдаа гарлаа.'));
      }
    }

    setStoredEvents(prev => [...prev, ...created]);
    return created.length;
  };

  const addTask = async (task: Task) => {
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Даалгавар хадгалах үед алдаа гарлаа.'));
    }

    setStoredTasks(prev => [...prev, task]);
  };

  // Хурлын тэмдэглэл хөтөлдөг хүн (админ эсвэл 'minutes' эрхтэй) сонгосон ажилтнуудад даалгавар өгнө
  const assignMeetingTask = async (data: { title: string; description?: string; dueDate: string; assignedToUserIds: string[]; sourceLabel?: string }) => {
    if (!profile || profile.status !== 'approved') return;
    const canAssign = profile.role === 'admin' || (profile.permissions || []).includes('minutes');
    if (!canAssign) return;
    if (!data.title.trim() || !data.dueDate || data.assignedToUserIds.length === 0) {
      throw new Error('Даалгаврын нэр, огноо, хүлээн авагчийг оруулна уу.');
    }

    const task: Task = {
      id: Math.random().toString(36).slice(2, 11),
      projectId: '',
      sourceLabel: data.sourceLabel || undefined,
      assignedByName: profile.displayName,
      title: data.title.trim(),
      description: data.description || '',
      assignedToUserIds: data.assignedToUserIds,
      dueDate: data.dueDate,
      status: 'Pending',
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Даалгавар өгөх үед алдаа гарлаа.'));
    }

    setStoredTasks(prev => [...prev, task]);
  };

  const updateTask = async (task: Task) => {
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Даалгавар шинэчлэх үед алдаа гарлаа.'));
    }

    setStoredTasks(prev => prev.map(t => (t.id === task.id ? task : t)));
  };

  const deleteTask = async (id: string) => {
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Даалгавар устгах үед алдаа гарлаа.'));
    }

    setStoredTasks(prev => prev.filter(t => t.id !== id));
  };

  const updateTaskStatus = async (id: string, status: TaskStatus) => {
    if (!profile || profile.status !== 'approved') return;

    const res = await fetch(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Даалгаврын төлөв шинэчлэх үед алдаа гарлаа.'));
    }

    setStoredTasks(prev => prev.map(t => (t.id === id ? { ...t, status } : t)));
  };

  const addProcurementPlan = async (plan: ProcurementPlan) => {
    if (!hasPermission('procurement')) return;

    const res = await fetch('/api/procurement-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Худалдан авах ажиллагааны мэдээлэл нэмэх үед алдаа гарлаа.'));
    }

    setStoredProcurementPlans(prev => [...prev, plan]);
  };

  const updateProcurementPlan = async (plan: ProcurementPlan) => {
    const existing = storedProcurementPlans.find(p => p.id === plan.id);
    if (!canEditProcurement(existing)) return;

    const res = await fetch(`/api/procurement-plans/${plan.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Худалдан авах ажиллагааны мэдээлэл засах үед алдаа гарлаа.'));
    }

    setStoredProcurementPlans(prev => prev.map(p => (p.id === plan.id ? plan : p)));
  };

  const deleteProcurementPlan = async (id: string) => {
    const existing = storedProcurementPlans.find(p => p.id === id);
    if (!canEditProcurement(existing)) return;

    const res = await fetch(`/api/procurement-plans/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Худалдан авах ажиллагааны мэдээлэл устгах үед алдаа гарлаа.'));
    }

    setStoredProcurementPlans(prev => prev.filter(p => p.id !== id));
  };

  // Тэмдэглэл хөтлөх (нэмэх, засах, устгах) эрх: ЗӨВХӨН админ болон 'minutes' эрх олгогдсон ажилтан.
  // Энгийн ажилтан өөрт харагдах тэмдэглэлийг зөвхөн УНШИНА (canViewMinutesItem-ээр шүүгдэнэ).
  const canManageMinutes = (_minutes?: MeetingMinutes) => {
    if (!profile || profile.status !== 'approved') return false;
    if (profile.role === 'admin') return true;
    return (profile.permissions || []).includes('minutes');
  };

  const addMeetingMinutes = async (minutes: MeetingMinutes) => {
    if (!canManageMinutes()) return;

    const res = await fetch('/api/meeting-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minutes),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хурлын тэмдэглэл нэмэх үед алдаа гарлаа.'));
    }

    setStoredMeetingMinutes(prev => [minutes, ...prev]);
  };

  const updateMeetingMinutes = async (minutes: MeetingMinutes) => {
    const existing = storedMeetingMinutes.find(m => m.id === minutes.id);
    if (!canManageMinutes(existing)) return;

    const res = await fetch(`/api/meeting-minutes/${minutes.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minutes),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хурлын тэмдэглэл засах үед алдаа гарлаа.'));
    }

    setStoredMeetingMinutes(prev => prev.map(m => (m.id === minutes.id ? minutes : m)));
  };

  const deleteMeetingMinutes = async (id: string) => {
    const existing = storedMeetingMinutes.find(m => m.id === id);
    if (!canManageMinutes(existing)) return;

    const res = await fetch(`/api/meeting-minutes/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Хурлын тэмдэглэл устгах үед алдаа гарлаа.'));
    }

    setStoredMeetingMinutes(prev => prev.filter(m => m.id !== id));
  };

  const updateProfilePicture = async (photoDataUrl: string) => {
    if (!user || !profile) return;

    const res = await fetch(`/api/users/${profile.uid}/photo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoURL: photoDataUrl }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Профайл зураг хадгалах үед алдаа гарлаа.'));
    }

    const updatedUser = { ...user, photoURL: photoDataUrl };
    const updatedProfile = { ...profile, photoURL: photoDataUrl };

    setUser(updatedUser);
    setProfile(updatedProfile);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
    localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(updatedProfile));
  };

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        isAuthReady,
        projects,
        events,
        tasks,
        procurementPlans,
        language,
        theme,
        login,
        loginWithEmail,
        register,
        logout,
        setLanguage,
        setTheme,
        addProject,
        updateProject,
        deleteProject,
        addEvent,
        updateEvent,
        deleteEvent,
        canManageMeetings,
        createMeetingSeries,
        addTask,
        assignMeetingTask,
        updateTask,
        deleteTask,
        updateTaskStatus,
        canEditProcurement,
        canAccessProcurement,
        addProcurementPlan,
        updateProcurementPlan,
        deleteProcurementPlan,
        meetingMinutes,
        addMeetingMinutes,
        updateMeetingMinutes,
        deleteMeetingMinutes,
        canManageMinutes,
        personalNotes,
        savePersonalNote,
        deletePersonalNote,
        leaveRequests,
        leaveEntitlement,
        leaveYear,
        leaveEntitlementFor,
        addLeaveRequest,
        updateLeaveStatus,
        deleteLeaveRequest,
        updateLeaveEntitlement,
        updateUserLeaveEntitlement,
        // Ажилчид сонгогдсон асуулгыг зөвхөн тэдэнд (болон админд) харуулна
        polls: polls.filter(canViewItem),
        refreshPolls,
        addPoll,
        votePoll,
        closePoll,
        deletePoll,
        // Эрх олгогдсон төлөвлөгөөг л ажилтанд харуулна
        workPlans,
        refreshWorkPlans,
        canEditWorkPlan,
        addWorkPlan,
        updateWorkPlan,
        signWorkPlan,
        deleteWorkPlan,
        unreadMessageCount,
        refreshUnreadMessages,
        meetingSignal: storedMeetingSignal,
        meetingDurations,
        canStartMeeting,
        startMeetingSignal,
        endMeetingSignal,
        updateUserStatus,
        updateManagedUser,
        createManagedUser,
        deleteManagedUser,
        updateProfilePicture,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
