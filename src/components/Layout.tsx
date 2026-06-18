import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Briefcase, 
  Settings, 
  LogOut,
  Leaf,
  Globe,
  Sun,
  Moon,
  Search,
  User,
  Menu,
  X,
  LogIn,
  UserPlus,
  ShieldCheck,
  Building2,
  Mail,
  Lock,
  UserCircle,
  ClipboardList
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { cn } from '../lib/utils';
import { Department } from '../types';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language, setLanguage, theme, setTheme, user, profile, loginWithEmail, register, logout, isAuthReady, updateProfilePicture, tasks } = useAppContext();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [department, setDepartment] = useState<Department>('Захиргаа, санхүүгийн хэлтэс');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const t = translations[language];

  const departments: Department[] = [
    'Захиргаа, санхүүгийн хэлтэс',
    'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс',
    'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс',
    'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс'
  ];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await register(email, password, firstName, lastName, department);
      }
    } catch (err: any) {
      setError(err.message || 'Алдаа гарлаа');
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const resizeImageFile = async (file: File): Promise<string> => {
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(language === 'MN' ? 'Зургийг уншиж чадсангүй' : 'Unable to read image'));
        img.src = objectUrl;
      });

      const maxSize = 512;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const targetWidth = Math.max(1, Math.round(image.width * scale));
      const targetHeight = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error(language === 'MN' ? 'Зургийн боловсруулалт амжилтгүй боллоо' : 'Image processing failed');
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
            return;
          }
          reject(new Error(language === 'MN' ? 'Зургийн шахалт амжилтгүй боллоо' : 'Image compression failed'));
        }, 'image/jpeg', 0.82);
      });

      const compressedDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(String(event.target?.result || ''));
        reader.onerror = () => reject(new Error(language === 'MN' ? 'Зургийг хувиргаж чадсангүй' : 'Unable to convert image'));
        reader.readAsDataURL(blob);
      });

      if (!compressedDataUrl) {
        throw new Error(language === 'MN' ? 'Зургийн өгөгдөл хоосон байна' : 'Image data is empty');
      }

      return compressedDataUrl;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert(language === 'MN' ? 'Зургийн файл сонгоно уу' : 'Please select an image file');
      return;
    }

    setUploadingPhoto(true);
    try {
      const photoDataUrl = await resizeImageFile(file);
      await updateProfilePicture(photoDataUrl);
    } catch (err: any) {
      console.error('Error uploading photo:', err);
      alert(err?.message || (language === 'MN' ? 'Профайл зураг оруулах үед алдаа гарлаа' : 'Failed to upload profile photo'));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const activeTaskCount = tasks.filter(tk => tk.status !== 'Completed').length;

  const navItems: { icon: React.ElementType; label: string; path: string; badge?: number }[] = [
    { icon: LayoutDashboard, label: t.dashboard, path: '/' },
    { icon: CalendarIcon, label: t.calendar, path: '/calendar' },
    { icon: Briefcase, label: t.projects, path: '/projects' },
  ];

  if (profile?.role !== 'admin') {
    navItems.push({ icon: ClipboardList, label: t.myTasks, path: '/my-tasks', badge: activeTaskCount });
  }

  if (profile?.role === 'admin') {
    navItems.push({ icon: ShieldCheck, label: language === 'MN' ? 'Хэрэглэгчид' : 'Users', path: '/admin/users' });
  }

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20 mx-auto mb-4">
              <Leaf className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">CCRCC CALENDAR</h1>
              
          </div>

          <div className="card shadow-2xl border-none">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
              <button 
                onClick={() => setAuthMode('login')}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                  authMode === 'login' ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"
                )}
              >
                {language === 'MN' ? 'Нэвтрэх' : 'Login'}
              </button>
              <button 
                onClick={() => setAuthMode('register')}
                className={cn(
                  "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                  authMode === 'register' ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500"
                )}
              >
                {language === 'MN' ? 'Бүртгүүлэх' : 'Register'}
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">{language === 'MN' ? 'Овог' : 'Last Name'}</label>
                    <div className="relative">
                      <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        required
                        type="text" 
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="input-field pl-10" 
                        placeholder={language === 'MN' ? 'Овог' : 'Last Name'}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">{language === 'MN' ? 'Нэр' : 'First Name'}</label>
                    <div className="relative">
                      <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        required
                        type="text" 
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="input-field pl-10" 
                        placeholder={language === 'MN' ? 'Нэр' : 'First Name'}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{language === 'MN' ? 'Нэвтрэх нэр' : 'Email'}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    required
                    type="text" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-10" 
                    placeholder="Нэвтрэх нэр"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">{language === 'MN' ? 'Нууц үг' : 'Password'}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    required
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-10" 
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {authMode === 'register' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">{language === 'MN' ? 'Хэлтэс' : 'Department'}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select 
                      value={department}
                      onChange={(e) => setDepartment(e.target.value as Department)}
                      className="input-field pl-10 appearance-none"
                    >
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-rose-500 font-medium text-center">{error}</p>}

              <button 
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {authMode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                    {authMode === 'login' ? (language === 'MN' ? 'Нэвтрэх' : 'Login') : (language === 'MN' ? 'Бүртгүүлэх' : 'Register')}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (profile?.status === 'pending') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-3xl flex items-center justify-center text-amber-600 dark:text-amber-400 mb-8">
          <ShieldCheck className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-4">
          {language === 'MN' ? 'Зөвшөөрөл хүлээгдэж байна' : 'Pending Approval'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
          {language === 'MN' 
            ? 'Таны бүртгэл амжилттай хийгдлээ. Админ таны эрхийг зөвшөөрсний дараа системд нэвтрэх боломжтой болно. Түр хүлээнэ үү.' 
            : 'Your registration was successful. You will be able to access the system once an admin approves your account. Please wait.'}
        </p>
        <button onClick={logout} className="btn-secondary flex items-center gap-2">
          <LogOut className="w-5 h-5" />
          {language === 'MN' ? 'Гарах' : 'Logout'}
        </button>
      </div>
    );
  }

  if (profile?.status === 'rejected') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center">
        <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/30 rounded-3xl flex items-center justify-center text-rose-600 dark:text-rose-400 mb-8">
          <X className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-4 text-rose-600">
          {language === 'MN' ? 'Хүсэлт татгалзсан' : 'Request Rejected'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
          {language === 'MN' 
            ? 'Уучлаарай, таны системд нэвтрэх хүсэлтийг админ татгалзсан байна. Дэлгэрэнгүй мэдээллийг админаас авна уу.' 
            : 'Sorry, your request to access the system has been rejected by the admin. Please contact the admin for more information.'}
        </p>
        <button onClick={logout} className="btn-secondary flex items-center gap-2">
          <LogOut className="w-5 h-5" />
          {language === 'MN' ? 'Гарах' : 'Logout'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 lg:relative lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <Leaf className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">CCRCC CALENDAR</span>
          </div>

          <nav className="flex-1 px-4 space-y-1 mt-4">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  isActive 
                    ? "bg-primary text-white shadow-md shadow-primary/20" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium flex-1">{item.label}</span>
                    {'badge' in item && (item as any).badge > 0 && (
                      <span className={cn(
                        "min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-xs font-bold",
                        isActive
                          ? "bg-white/25 text-white"
                          : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400"
                      )}>
                        {(item as any).badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <button 
              onClick={() => setLanguage(language === 'EN' ? 'MN' : 'EN')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Globe className="w-5 h-5" />
              <span className="font-medium">{language === 'EN' ? t.mongolian : t.english}</span>
            </button>
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              <span className="font-medium">{theme === 'light' ? t.darkMode : t.lightMode}</span>
            </button>
            <button 
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{language === 'MN' ? 'Гарах' : 'Logout'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navbar */}
        <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 lg:hidden hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder={t.search}
                className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{profile?.displayName || user.displayName}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{profile?.role === 'admin' ? t.admin : t.user}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoFileChange}
              className="hidden"
            />
            <button
              onClick={handleProfilePhotoClick}
              disabled={uploadingPhoto}
              className="w-10 h-10 rounded-full overflow-hidden border-2 border-white dark:border-slate-700 shadow-sm bg-slate-200 hover:ring-2 hover:ring-primary/50 transition-all disabled:opacity-50 cursor-pointer"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-6 h-6 text-slate-500" />
                </div>
              )}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/50">
          {children}
        </main>
      </div>
    </div>
  );
};
