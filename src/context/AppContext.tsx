import React, { createContext, useContext, useEffect, useState } from 'react';
import { Project, Event, Language, Theme, UserProfile, Department, UserStatus, Task, TaskStatus, ProcurementPlan } from '../types';

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
  addTask: (task: Task) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  addProcurementPlan: (plan: ProcurementPlan) => Promise<void>;
  updateProcurementPlan: (plan: ProcurementPlan) => Promise<void>;
  deleteProcurementPlan: (id: string) => Promise<void>;
  updateUserStatus: (uid: string, status: UserStatus) => Promise<void>;
  updateManagedUser: (uid: string, updates: { firstName: string; lastName: string; department: Department; password?: string }) => Promise<UserProfile>;
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
  const [language, setLanguage] = useState<Language>('MN');
  const [theme, setTheme] = useState<Theme>('light');

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

  const projects = storedProjects.filter(canViewItem);
  const events = storedEvents.filter(canViewItem);
  const tasks = storedTasks.filter(canViewTask);
  const procurementPlans = storedProcurementPlans.filter(canViewItem);

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
        const [projectsRes, eventsRes, tasksRes, procurementRes] = await Promise.all([
          fetch('/api/projects'),
          fetch('/api/events'),
          fetch('/api/tasks'),
          fetch('/api/procurement-plans'),
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
      } catch (error) {
        console.error('Error loading projects and events:', error);
      }
    };

    loadProjectsAndEvents();
  }, [isAuthReady]);

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
    updates: { firstName: string; lastName: string; department: Department; password?: string }
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
        };
        setUser(updatedUser);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
      }
    }

    return updatedProfile;
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
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

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
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

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
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

    const res = await fetch(`/api/events/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Арга хэмжээ устгах үед алдаа гарлаа.'));
    }

    setStoredEvents(prev => prev.filter(e => e.id !== id));
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
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

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
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

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
    if (!profile || profile.status !== 'approved' || profile.role !== 'admin') return;

    const res = await fetch(`/api/procurement-plans/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Худалдан авах ажиллагааны мэдээлэл устгах үед алдаа гарлаа.'));
    }

    setStoredProcurementPlans(prev => prev.filter(p => p.id !== id));
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
        addTask,
        updateTask,
        deleteTask,
        updateTaskStatus,
        addProcurementPlan,
        updateProcurementPlan,
        deleteProcurementPlan,
        updateUserStatus,
        updateManagedUser,
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
