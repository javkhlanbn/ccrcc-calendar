import React, { useState } from 'react';
import { 
  Plus, 
  LayoutGrid, 
  List, 
  Search,
  MoreVertical,
  Calendar as CalendarIcon,
  Users,
  Tag,
  ChevronRight
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Project, ProjectStatus, EnvironmentalTag } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export const Projects: React.FC = () => {
  const { projects, language, addProject, updateProject, deleteProject } = useAppContext();
  const t = translations[language];
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [formData, setFormData] = useState<Partial<Project>>({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    status: 'Planning',
    tags: [],
  });

  const handleCreate = () => {
    setIsEditMode(false);
    setFormData({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      status: 'Planning',
      tags: [],
    });
    setIsModalOpen(true);
  };

  const handleEdit = (project: Project) => {
    setSelectedProject(project);
    setFormData(project);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (isEditMode && selectedProject) {
      updateProject(formData as Project);
    } else {
      addProject({
        ...formData,
        id: Math.random().toString(36).substr(2, 9),
      } as Project);
    }
    setIsModalOpen(false);
  };

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'Planning': return 'warning';
      case 'Ongoing': return 'primary';
      case 'Completed': return 'success';
      default: return 'outline';
    }
  };

  const KanbanColumn = ({ status, title }: { status: ProjectStatus, title: string }) => {
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
          <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors">
            <Plus className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {columnProjects.map(project => (
            <motion.div
              layoutId={project.id}
              key={project.id}
              onClick={() => handleEdit(project)}
              className="card p-4 hover:shadow-md cursor-pointer group border-l-4 border-l-transparent hover:border-l-primary transition-all"
            >
              <div className="flex justify-between items-start mb-2">
                <Badge variant={getStatusColor(project.status)}>
                  {t[project.status.toLowerCase() as keyof typeof t.EN]}
                </Badge>
                <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-all">
                  <MoreVertical className="w-4 h-4 text-slate-400" />
                </button>
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
                <div className="flex -space-x-2">
                  {[1, 2].map(i => (
                    <div key={i} className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                      <Users className="w-3 h-3 text-slate-500" />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{t.projects}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t.manageProjectsDesc}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-1">
            <button 
              onClick={() => setView('kanban')}
              className={cn(
                "p-2 rounded-lg transition-all",
                view === 'kanban' ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400"
              )}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setView('table')}
              className={cn(
                "p-2 rounded-lg transition-all",
                view === 'table' ? "bg-slate-100 dark:bg-slate-800 text-primary" : "text-slate-400"
              )}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
          <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            <span>{t.createProject}</span>
          </button>
        </div>
      </header>

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
                  <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => handleEdit(project)}>
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
                      <ChevronRight className="w-5 h-5 text-slate-300 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Project Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={isEditMode ? "Edit Project" : t.createProject}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.title}</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="input-field"
              placeholder={t.projectTitlePlaceholder}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.description}</label>
            <textarea 
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="input-field h-24 resize-none"
              placeholder={t.projectDescriptionPlaceholder}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.startDate}</label>
              <input 
                type="date" 
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.endDate}</label>
              <input 
                type="date" 
                value={formData.endDate}
                onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.status}</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                className="input-field"
              >
                <option value="Planning">{t.planning}</option>
                <option value="Ongoing">{t.ongoing}</option>
                <option value="Completed">{t.completed}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.tags}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {['Water', 'Climate', 'Forest', 'Waste'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      const tags = formData.tags || [];
                      if (tags.includes(tag as EnvironmentalTag)) {
                        setFormData({ ...formData, tags: tags.filter(t => t !== tag) });
                      } else {
                        setFormData({ ...formData, tags: [...tags, tag as EnvironmentalTag] });
                      }
                    }}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border transition-all",
                      formData.tags?.includes(tag as EnvironmentalTag)
                        ? "bg-primary text-white border-primary"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent"
                    )}
                  >
                    {t[tag.toLowerCase() as keyof typeof t.EN]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            {isEditMode && (
              <button 
                onClick={() => {
                  if (selectedProject) deleteProject(selectedProject.id);
                  setIsModalOpen(false);
                }}
                className="flex-1 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 transition-colors"
              >
                {t.deleteEvent}
              </button>
            )}
            <button 
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {t.cancel}
            </button>
            <button 
              onClick={handleSave}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20"
            >
              {t.save}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
