import React, { useEffect, useRef, useState } from 'react';
import { 
  Plus, 
  LayoutGrid, 
  List, 
  MoreVertical,
  Calendar as CalendarIcon,
  Users,
  ChevronRight,
  ClipboardList,
  Printer,
  CheckCircle2,
  Clock,
  Circle,
  Paperclip,
  X,
  Briefcase,
  ShoppingCart,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Project, ProjectStatus, EnvironmentalTag, UserProfile, Task, TaskStatus, EventAttachment } from '../types';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { ProcurementPlan } from './ProcurementPlan';

export const Projects: React.FC = () => {
  const { projects, tasks, language, addProject, updateProject, deleteProject, addTask, updateTask, deleteTask, updateTaskStatus, profile } = useAppContext();
  const t = translations[language];
  const canManageProjects = profile?.role === 'admin';
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [mainView, setMainView] = useState<'projects' | 'procurement'>('projects');

  // Project modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isVisibleUsersOpen, setIsVisibleUsersOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Project>>({
    title: '', description: '', startDate: '', endDate: '',
    status: 'Planning', tags: [], visibleToUserIds: [],
  });

  // Task modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTaskEditMode, setIsTaskEditMode] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isAssignUsersOpen, setIsAssignUsersOpen] = useState(false);
  const [taskFormData, setTaskFormData] = useState<Partial<Task>>({
    projectId: '', title: '', description: '', assignedToUserIds: [], dueDate: '', status: 'Pending', attachments: [],
  });

  // Print ref
  const printRef = useRef<HTMLDivElement>(null);

  // Project plan view state
  const [showProjectPlan, setShowProjectPlan] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers((data as UserProfile[]).filter(u => u.role === 'user'));
      } catch (error) {
        console.error('Users fetch error:', error);
      }
    };
    fetchUsers();
  }, []);

  // ---- Project CRUD handlers ----
  const handleCreate = () => {
    if (!canManageProjects) return;
    setIsEditMode(false);
    setFormData({ title: '', description: '', startDate: '', endDate: '', status: 'Planning', tags: [], visibleToUserIds: [] });
    setIsVisibleUsersOpen(false);
    setIsModalOpen(true);
  };

  const handleEdit = (project: Project) => {
    if (!canManageProjects) return;
    setSelectedProject(project);
    setFormData(project);
    setIsEditMode(true);
    setIsVisibleUsersOpen(false);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!canManageProjects) return;
    if (isEditMode && selectedProject) {
      updateProject(formData as Project);
    } else {
      addProject({ ...formData, id: Math.random().toString(36).substr(2, 9) } as Project);
    }
    setIsModalOpen(false);
  };

  const toggleVisibleUser = (userId: string) => {
    const selected = formData.visibleToUserIds || [];
    setFormData({ ...formData, visibleToUserIds: selected.includes(userId) ? selected.filter(id => id !== userId) : [...selected, userId] });
  };

  const toggleAllVisibleUsers = () => {
    const allUserIds = users.map(u => u.uid);
    const isAllSelected = allUserIds.every(id => (formData.visibleToUserIds || []).includes(id));
    setFormData({ ...formData, visibleToUserIds: isAllSelected ? [] : allUserIds });
  };

  // ---- Task CRUD handlers ----
  const handleCreateTask = (presetProjectId?: string) => {
    if (!canManageProjects) return;
    setIsTaskEditMode(false);
    setSelectedTask(null);
    setTaskFormData({ projectId: presetProjectId || (projects[0]?.id ?? ''), title: '', description: '', assignedToUserIds: [], dueDate: '', status: 'Pending', attachments: [] });
    setIsAssignUsersOpen(false);
    setIsTaskModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    if (!canManageProjects) return;
    setSelectedTask(task);
    setTaskFormData(task);
    setIsTaskEditMode(true);
    setIsAssignUsersOpen(false);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!canManageProjects) return;
    if (!taskFormData.title || !taskFormData.projectId || !taskFormData.dueDate) return;
    try {
      if (isTaskEditMode && selectedTask) {
        await updateTask({ ...selectedTask, ...taskFormData } as Task);
      } else {
        await addTask({
          ...taskFormData,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString(),
        } as Task);
      }
      setIsTaskModalOpen(false);
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Хадгалах үед алдаа гарлаа.' : 'Failed to save.'));
    }
  };

  const handleDeleteTask = async () => {
    if (!canManageProjects || !selectedTask) return;
    try {
      await deleteTask(selectedTask.id);
      setIsTaskModalOpen(false);
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Алдаа гарлаа.' : 'Error.'));
    }
  };

  const toggleAssignUser = (userId: string) => {
    const selected = taskFormData.assignedToUserIds || [];
    setTaskFormData({ ...taskFormData, assignedToUserIds: selected.includes(userId) ? selected.filter(id => id !== userId) : [...selected, userId] });
  };

  const toggleAllAssignUsers = () => {
    const allUserIds = users.map(u => u.uid);
    const isAllSelected = allUserIds.every(id => (taskFormData.assignedToUserIds || []).includes(id));
    setTaskFormData({ ...taskFormData, assignedToUserIds: isAllSelected ? [] : allUserIds });
  };

  const readTaskFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('File унших үед алдаа гарлаа'));
      reader.readAsDataURL(file);
    });

  // ---- Project Plan helpers ----
  const getYearsFromProjects = () => {
    const years = new Set<number>();
    projects.forEach(project => {
      const startYear = new Date(project.startDate).getFullYear();
      const endYear = new Date(project.endDate).getFullYear();
      for (let y = startYear; y <= endYear; y++) {
        years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  };

  const getQuarterFromDate = (date: Date): number => {
    const month = date.getMonth();
    return Math.floor(month / 3) + 1;
  };

  const isProjectActiveInQuarter = (project: Project, year: number, quarter: number): boolean => {
    const startDate = new Date(project.startDate);
    const endDate = new Date(project.endDate);
    
    const quarterStart = new Date(year, (quarter - 1) * 3, 1);
    const quarterEnd = new Date(year, quarter * 3, 0);
    
    return startDate <= quarterEnd && endDate >= quarterStart;
  };

  const handleTaskAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    try {
      const uploaded: EventAttachment[] = [];
      for (const file of files) {
        const dataUrl = await readTaskFileAsDataUrl(file);
        uploaded.push({
          id: Math.random().toString(36).slice(2, 11),
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
        });
      }
      setTaskFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...uploaded],
      }));
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Файл оруулах үед алдаа гарлаа.' : 'Failed to upload file.'));
    } finally {
      e.target.value = '';
    }
  };

  const removeTaskAttachment = (attachmentId: string) => {
    setTaskFormData(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(a => a.id !== attachmentId),
    }));
  };

  // ---- Status cycle for workers ----
  const handleCycleStatus = async (task: Task) => {
    const cycle: TaskStatus[] = ['Pending', 'InProgress', 'Completed'];
    const nextIndex = (cycle.indexOf(task.status) + 1) % cycle.length;
    try {
      await updateTaskStatus(task.id, cycle[nextIndex]);
    } catch (error: any) {
      alert(error?.message || 'Error');
    }
  };

  // ---- Print ----
  const handlePrint = () => {
    window.print();
  };

  // ---- Helpers ----
  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'Planning': return 'warning';
      case 'Ongoing': return 'primary';
      case 'Completed': return 'success';
      default: return 'outline';
    }
  };

  const getTaskStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'Pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'InProgress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    }
  };

  const getTaskStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'Pending': return <Circle className="w-3.5 h-3.5" />;
      case 'InProgress': return <Clock className="w-3.5 h-3.5" />;
      case 'Completed': return <CheckCircle2 className="w-3.5 h-3.5" />;
    }
  };

  const getTaskStatusLabel = (status: TaskStatus) => {
    if (language === 'MN') {
      switch (status) {
        case 'Pending': return 'Хүлээгдэж буй';
        case 'InProgress': return 'Хийгдэж буй';
        case 'Completed': return 'Дууссан';
      }
    } else {
      switch (status) {
        case 'Pending': return 'Pending';
        case 'InProgress': return 'In Progress';
        case 'Completed': return 'Completed';
      }
    }
  };

  const getProjectTitle = (projectId: string) => projects.find(p => p.id === projectId)?.title || projectId;

  const getUserDisplayName = (uid: string) => {
    const found = users.find(u => u.uid === uid);
    return found?.displayName || uid;
  };

  // ---- Kanban column ----
  const KanbanColumn = ({ status, title }: { status: ProjectStatus; title: string }) => {
    const columnProjects = projects.filter(p => p.status === status);
    return (
      <div className="flex flex-col gap-4 min-w-[300px]">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-600 dark:text-slate-400">{title}</h3>
            <span className="bg-slate-200 dark:bg-slate-800 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">
              {columnProjects.length}
            </span>
          </div>
          {canManageProjects && (
            <button onClick={handleCreate} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors">
              <Plus className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {columnProjects.map(project => {
            const projectTaskCount = tasks.filter(tk => tk.projectId === project.id).length;
            return (
              <motion.div
                layoutId={project.id}
                key={project.id}
                onClick={() => canManageProjects && handleEdit(project)}
                className={cn(
                  "card p-4 group border-l-4 border-l-transparent transition-all",
                  canManageProjects ? "hover:shadow-md cursor-pointer hover:border-l-primary" : "cursor-default"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={getStatusColor(project.status)}>
                    {t[project.status.toLowerCase() as keyof typeof t.EN]}
                  </Badge>
                  {canManageProjects && (
                    <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-all">
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                </div>
                <h4 className="font-bold mb-1 text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">{project.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{project.description}</p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {project.tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-[10px] py-0 px-1.5 opacity-70">
                      {t[tag.toLowerCase() as keyof typeof t.EN]}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1 text-slate-400">
                    <CalendarIcon className="w-3 h-3" />
                    <span className="text-[10px] font-medium">{project.startDate}</span>
                  </div>
                  {projectTaskCount > 0 && (
                    <div className="flex items-center gap-1 text-slate-400">
                      <ClipboardList className="w-3 h-3" />
                      <span className="text-[10px] font-medium">{projectTaskCount}</span>
                    </div>
                  )}
                  {canManageProjects && (
                    <button
                      onClick={e => { e.stopPropagation(); handleCreateTask(project.id); }}
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                    >
                      <Plus className="w-3 h-3" />
                      {language === 'MN' ? 'Даалгавар' : 'Task'}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  // Tasks for display
  const myTasks = tasks;

  return (
    <div className="space-y-8">
      {/* ---- Module switcher: Projects vs Procurement plan ---- */}
      <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1 w-fit print:hidden">
        <button
          onClick={() => setMainView('projects')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            mainView === 'projects' ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          )}
        >
          <Briefcase className="w-4 h-4" />
          {t.projects}
        </button>
        <button
          onClick={() => setMainView('procurement')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            mainView === 'procurement' ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          )}
        >
          <ShoppingCart className="w-4 h-4" />
          {language === 'MN' ? 'Худалдан авах ажиллагааны төлөвлөгөө' : 'Procurement Plan'}
        </button>
      </div>

      {mainView === 'procurement' ? (
        <ProcurementPlan />
      ) : (
      <>
      {/* ---- Header ---- */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.projects}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t.manageProjectsDesc}</p>
          {!canManageProjects && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {language === 'MN' ? 'Зөвхөн админ хэрэглэгч төсөл нэмэх, засах, устгах эрхтэй.' : 'Only admins can create, edit, and delete projects.'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1">
            <button onClick={() => setView('kanban')} className={cn("p-2 rounded-lg transition-all", view === 'kanban' ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400")}>
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button onClick={() => setView('table')} className={cn("p-2 rounded-lg transition-all", view === 'table' ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400")}>
              <List className="w-5 h-5" />
            </button>
          </div>
          {canManageProjects && (
            <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-5 h-5" />
              <span>{t.createProject}</span>
            </button>
          )}
        </div>
      </header>

      {/* ---- Projects view ---- */}
      {view === 'kanban' ? (
        <div className="flex gap-8 overflow-x-auto pb-8 scrollbar-hide">
          <KanbanColumn status="Planning" title={t.planning} />
          <KanbanColumn status="Ongoing" title={t.ongoing} />
          <KanbanColumn status="Completed" title={t.completed} />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.title}</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.status}</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.startDate}</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.endDate}</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.tags}</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {projects.map(project => (
                  <tr
                    key={project.id}
                    className={cn("transition-colors", canManageProjects ? "hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer" : "")}
                    onClick={() => canManageProjects && handleEdit(project)}
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{project.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{project.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusColor(project.status)}>
                        {t[project.status.toLowerCase() as keyof typeof t.EN]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{project.startDate}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{project.endDate}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {project.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {t[tag.toLowerCase() as keyof typeof t.EN]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canManageProjects && <ChevronRight className="w-5 h-5 text-slate-300 ml-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Tasks Section ---- */}
      <section>
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {showProjectPlan ? (language === 'MN' ? 'Төслийн төлөвлөгөө' : 'Project Plan') : t.tasks}
              </h2>
              <span className="bg-slate-200 dark:bg-slate-800 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">
                {showProjectPlan ? projects.length : myTasks.length}
              </span>
            </div>
            <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-1">
              <button
                onClick={() => setShowProjectPlan(false)}
                className={cn(
                  "px-3 py-1 rounded text-sm font-bold transition-all",
                  !showProjectPlan ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                )}
              >
                {t.tasks}
              </button>
              <button
                onClick={() => setShowProjectPlan(true)}
                className={cn(
                  "px-3 py-1 rounded text-sm font-bold transition-all",
                  showProjectPlan ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                )}
              >
                {language === 'MN' ? 'Төлөвлөгөө' : 'Plan'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showProjectPlan && (
              <>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  {t.printReport}
                </button>
                {canManageProjects && (
                  <button onClick={() => handleCreateTask()} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    {t.addTask}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Print header (only visible when printing) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">{showProjectPlan ? (language === 'MN' ? 'Төслийн төлөвлөгөө' : 'Project Plan') : t.taskReport}</h1>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString(language === 'MN' ? 'mn-MN' : 'en-US')}</p>
        </div>

        {!showProjectPlan ? (
          // ---- Tasks Table ----
          <div ref={printRef} className="card p-0 overflow-hidden">
            {myTasks.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-400 print:hidden">
                <ClipboardList className="w-10 h-10 opacity-30" />
                <p className="text-sm">{t.noTasks}</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 print:bg-slate-100">
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.taskTitle}</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.project}</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.assignedTo}</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.dueDate}</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.taskStatus}</th>
                    {canManageProjects && <th className="px-6 py-3 print:hidden"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                  {myTasks.map(task => (
                    <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors print:hover:bg-transparent">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{task.title}</div>
                        {task.description && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{task.description}</div>}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{getProjectTitle(task.projectId)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(task.assignedToUserIds || []).map(uid => (
                            <span key={uid} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                              {getUserDisplayName(uid)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{task.dueDate}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleCycleStatus(task)}
                          className={cn("flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full transition-all", getTaskStatusColor(task.status))}
                          title={language === 'MN' ? 'Дараагийн төлөв рүү шилжих' : 'Click to advance status'}
                        >
                          {getTaskStatusIcon(task.status)}
                          {getTaskStatusLabel(task.status)}
                        </button>
                      </td>
                      {canManageProjects && (
                        <td className="px-6 py-4 text-right print:hidden">
                          <div className="flex items-center justify-end gap-2">
                            {(task.attachments || []).length > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <Paperclip className="w-3 h-3" />
                                {(task.attachments || []).length}
                              </span>
                            )}
                            <button
                              onClick={() => handleEditTask(task)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-slate-400" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          // ---- Project Plan Table ----
          <div className="card p-0 overflow-x-auto">
            {projects.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                <ClipboardList className="w-10 h-10 opacity-30" />
                <p className="text-sm">{language === 'MN' ? 'Төсөл байхгүй байна' : 'No projects'}</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider min-w-[250px]">
                      {t.project}
                    </th>
                    {getYearsFromProjects().map(year => (
                      <th key={year} colSpan={4} className="px-3 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center border-l border-slate-200 dark:border-slate-800">
                        {year}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-2"></th>
                    {getYearsFromProjects().map(year => (
                      <React.Fragment key={`quarters-${year}`}>
                        {[1, 2, 3, 4].map(q => (
                          <th
                            key={`${year}-Q${q}`}
                            className="px-2 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-center border-l border-slate-200 dark:border-slate-800"
                          >
                            Q{q}
                          </th>
                        ))}
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {projects.map(project => (
                    <tr
                      key={project.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => canManageProjects && handleEdit(project)}
                    >
                      <td className="px-6 py-4 sticky left-0 z-10 bg-white dark:bg-slate-950">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{project.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{project.description}</div>
                      </td>
                      {getYearsFromProjects().map(year => (
                        <React.Fragment key={`row-${project.id}-${year}`}>
                          {[1, 2, 3, 4].map(quarter => (
                            <td
                              key={`${project.id}-${year}-Q${quarter}`}
                              className="px-2 py-4 text-center border-l border-slate-200 dark:border-slate-800"
                            >
                              {isProjectActiveInQuarter(project, year, quarter) && (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold">
                                  ✓
                                </span>
                              )}
                            </td>
                          ))}
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* ---- Project Modal ---- */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditMode ? (language === 'MN' ? 'Төсөл засах' : 'Edit Project') : t.createProject}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.title}</label>
            <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="input-field" placeholder={t.projectTitlePlaceholder} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.description}</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="input-field h-24 resize-none" placeholder={t.projectDescriptionPlaceholder} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.startDate}</label>
              <input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="input-field" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.endDate}</label>
              <input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.status}</label>
              <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as ProjectStatus })} className="input-field">
                <option value="Planning">{t.planning}</option>
                <option value="Ongoing">{t.ongoing}</option>
                <option value="Completed">{t.completed}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.tags}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['Water', 'Climate', 'Forest', 'Waste', 'Peatland', 'Report'].map(tag => (
                  <button key={tag} onClick={() => {
                    const tags = formData.tags || [];
                    setFormData({ ...formData, tags: tags.includes(tag as EnvironmentalTag) ? tags.filter(t => t !== tag) : [...tags, tag as EnvironmentalTag] });
                  }} className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-all", formData.tags?.includes(tag as EnvironmentalTag) ? "bg-primary text-white border-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent")}>
                    {t[tag.toLowerCase() as keyof typeof t.EN]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Харах хэрэглэгч' : 'Visible Users'}</label>
            <div className="relative">
              <button type="button" onClick={() => setIsVisibleUsersOpen(!isVisibleUsersOpen)} className="input-field w-full text-left flex items-center justify-between">
                <span className="truncate">
                  {(formData.visibleToUserIds || []).length > 0
                    ? users.filter(u => (formData.visibleToUserIds || []).includes(u.uid)).map(u => u.displayName).join(', ')
                    : (language === 'MN' ? 'Хэрэглэгч сонгох' : 'Select users')}
                </span>
                <span className="text-slate-400 text-xs">▼</span>
              </button>
              {isVisibleUsersOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg max-h-52 overflow-y-auto space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <input type="checkbox" checked={users.length > 0 && users.every(u => (formData.visibleToUserIds || []).includes(u.uid))} onChange={toggleAllVisibleUsers} />
                    <span>{language === 'MN' ? 'Бүгд' : 'All'}</span>
                  </label>
                  {users.map(u => (
                    <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={(formData.visibleToUserIds || []).includes(u.uid)} onChange={() => toggleVisibleUser(u.uid)} />
                      <span>{u.displayName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">{language === 'MN' ? 'Энд сонгогдоогүй хэрэглэгчдэд харагдахгүй.' : 'Users not selected here will not see this item.'}</p>
          </div>
          <div className="flex gap-3 pt-4">
            {isEditMode && (
              <button onClick={() => { if (selectedProject) deleteProject(selectedProject.id); setIsModalOpen(false); }} className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors">
                {t.deleteEvent}
              </button>
            )}
            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors">{t.cancel}</button>
            <button onClick={handleSave} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">{t.save}</button>
          </div>
        </div>
      </Modal>

      {/* ---- Task Modal ---- */}
      <Modal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} title={isTaskEditMode ? t.editTask : t.addTask}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.project}</label>
            <select value={taskFormData.projectId} onChange={e => setTaskFormData({ ...taskFormData, projectId: e.target.value })} className="input-field">
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.taskTitle}</label>
            <input type="text" value={taskFormData.title} onChange={e => setTaskFormData({ ...taskFormData, title: e.target.value })} className="input-field" placeholder={t.taskTitlePlaceholder} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.taskDescription}</label>
            <textarea value={taskFormData.description} onChange={e => setTaskFormData({ ...taskFormData, description: e.target.value })} className="input-field h-20 resize-none" placeholder={t.taskDescriptionPlaceholder} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.dueDate}</label>
              <input type="date" value={taskFormData.dueDate} onChange={e => setTaskFormData({ ...taskFormData, dueDate: e.target.value })} className="input-field" />
            </div>

          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.assignedTo}</label>
            <div className="relative">
              <button type="button" onClick={() => setIsAssignUsersOpen(!isAssignUsersOpen)} className="input-field w-full text-left flex items-center justify-between">
                <span className="truncate">
                  {(taskFormData.assignedToUserIds || []).length > 0
                    ? users.filter(u => (taskFormData.assignedToUserIds || []).includes(u.uid)).map(u => u.displayName).join(', ')
                    : (language === 'MN' ? 'Ажилтан сонгох' : 'Select workers')}
                </span>
                <span className="text-slate-400 text-xs">▼</span>
              </button>
              {isAssignUsersOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg max-h-52 overflow-y-auto space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <input type="checkbox" checked={users.length > 0 && users.every(u => (taskFormData.assignedToUserIds || []).includes(u.uid))} onChange={toggleAllAssignUsers} />
                    <span>{language === 'MN' ? 'Бүгд' : 'All'}</span>
                  </label>
                  {users.map(u => (
                    <label key={u.uid} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={(taskFormData.assignedToUserIds || []).includes(u.uid)} onChange={() => toggleAssignUser(u.uid)} />
                      <span>{u.displayName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* File attachments */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              {language === 'MN' ? 'Файл хавсаргах' : 'Attachments'}
            </label>
            <label className="flex items-center gap-2 w-full px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm cursor-pointer hover:border-primary hover:text-primary transition-colors">
              <Paperclip className="w-4 h-4 flex-shrink-0" />
              <span>{language === 'MN' ? 'Файл сонгох...' : 'Choose files...'}</span>
              <input type="file" multiple className="sr-only" onChange={handleTaskAttachmentUpload} />
            </label>
            {(taskFormData.attachments || []).length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(taskFormData.attachments || []).map(att => (
                  <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    {att.type.startsWith('image/') ? (
                      <img src={att.dataUrl} alt={att.name} className="w-10 h-10 rounded object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                        <Paperclip className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{att.name}</p>
                      <p className="text-[11px] text-slate-400">{(att.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a href={att.dataUrl} download={att.name} className="text-[11px] px-2 py-1 rounded bg-primary text-white hover:bg-primary/90 transition-colors">
                        {language === 'MN' ? 'Татах' : 'Download'}
                      </a>
                      <button type="button" onClick={() => removeTaskAttachment(att.id)} className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-4">
            {isTaskEditMode && (
              <button onClick={handleDeleteTask} className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors">
                {t.deleteTask}
              </button>
            )}
            <button onClick={() => setIsTaskModalOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors">{t.cancel}</button>
            <button onClick={handleSaveTask} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">{t.save}</button>
          </div>
        </div>
      </Modal>
      </>
      )}
    </div>
  );
};

