import React, { createContext, useContext, useState, useEffect } from 'react';
import { Project, Event, Language, Theme, UserProfile, Department, UserStatus, UserRole } from '../types';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  FirebaseUser,
  OperationType,
  handleFirestoreError
} from '../firebase';

interface AppContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isAuthReady: boolean;
  projects: Project[];
  events: Event[];
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
  updateUserStatus: (uid: string, status: UserStatus) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [language, setLanguage] = useState<Language>('MN');
  const [theme, setTheme] = useState<Theme>('light');

  const ADMIN_EMAIL = 'javkhlanbn30@gmail.com';

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch or create profile
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          // If Google login and no profile, create one
          const isDefaultAdmin = firebaseUser.email === ADMIN_EMAIL;
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            firstName: firebaseUser.displayName?.split(' ')[0] || '',
            lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || undefined,
            department: 'Захиргаа, санхүүгийн хэлтэс', // Default
            role: isDefaultAdmin ? 'admin' : 'user',
            status: isDefaultAdmin ? 'approved' : 'pending',
            createdAt: new Date().toISOString()
          };
          await setDoc(userRef, newProfile).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`));
          setProfile(newProfile);
        }

        // Listen for profile changes
        const unsubProfile = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
          }
        });
        
        setIsAuthReady(true);
        return () => unsubProfile();
      } else {
        setProfile(null);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listeners (only if approved)
  useEffect(() => {
    if (!isAuthReady || !user || !profile || profile.status !== 'approved') {
      setProjects([]);
      setEvents([]);
      return;
    }

    const projectsQuery = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => doc.data() as Project);
      setProjects(projectsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'projects'));

    const eventsQuery = query(collection(db, 'events'), orderBy('date', 'asc'));
    const unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => doc.data() as Event);
      setEvents(eventsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'events'));

    return () => {
      unsubscribeProjects();
      unsubscribeEvents();
    };
  }, [isAuthReady, user, profile]);

  // Theme and Language Persistence
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) setTheme(savedTheme);
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang) setLanguage(savedLang);
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

  // Actions
  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      console.error('Email login error:', err);
      throw err;
    }
  };

  const register = async (email: string, pass: string, firstName: string, lastName: string, department: Department) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      const displayName = `${lastName} ${firstName}`;
      
      await updateProfile(firebaseUser, { displayName });
      
      const isDefaultAdmin = email === ADMIN_EMAIL;
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: email,
        firstName,
        lastName,
        displayName,
        department,
        role: isDefaultAdmin ? 'admin' : 'user',
        status: isDefaultAdmin ? 'approved' : 'pending',
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
      setProfile(newProfile);
    } catch (err) {
      console.error('Registration error:', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const updateUserStatus = async (uid: string, status: UserStatus) => {
    if (!profile || profile.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'users', uid), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const addProject = async (project: Project) => {
    if (!user || !profile || profile.status !== 'approved') return;
    const path = `projects/${project.id}`;
    try {
      const projectData = {
        ...project,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'projects', project.id), projectData);
      
      // Log activity
      const activityId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'activities', activityId), {
        id: activityId,
        userId: user.uid,
        userName: profile.displayName || 'User',
        action: language === 'MN' ? 'төсөл үүсгэсэн' : 'created project',
        target: project.title,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateProject = async (project: Project) => {
    if (!user || !profile || profile.status !== 'approved') return;
    const path = `projects/${project.id}`;
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        ...project,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteProject = async (id: string) => {
    if (!user || !profile || profile.status !== 'approved') return;
    const path = `projects/${id}`;
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const addEvent = async (event: Event) => {
    if (!user || !profile || profile.status !== 'approved') return;
    const path = `events/${event.id}`;
    try {
      const eventData = {
        ...event,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'events', event.id), eventData);
      
      // Log activity
      const activityId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'activities', activityId), {
        id: activityId,
        userId: user.uid,
        userName: profile.displayName || 'User',
        action: language === 'MN' ? 'арга хэмжээ нэмсэн' : 'added event',
        target: event.title,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateEvent = async (event: Event) => {
    if (!user || !profile || profile.status !== 'approved') return;
    const path = `events/${event.id}`;
    try {
      await updateDoc(doc(db, 'events', event.id), { ...event });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!user || !profile || profile.status !== 'approved') return;
    const path = `events/${id}`;
    try {
      await deleteDoc(doc(db, 'events', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <AppContext.Provider value={{
      user, profile, isAuthReady, projects, events, language, theme,
      login, loginWithEmail, register, logout, setLanguage, setTheme,
      addProject, updateProject, deleteProject,
      addEvent, updateEvent, deleteEvent, updateUserStatus
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
