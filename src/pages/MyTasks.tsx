import React from 'react';
import { useAppContext } from '../context/AppContext';
import { translations } from '../utils/translations';
import { cn } from '../lib/utils';
import { Task, TaskStatus } from '../types';
import { Modal } from '../components/ui/Modal';
import { Circle, Clock, CheckCircle2, Printer, CalendarDays, FolderOpen, Paperclip, Download, Eye } from 'lucide-react';

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

export const MyTasks: React.FC = () => {
  const { tasks, projects, language, profile, updateTaskStatus } = useAppContext();
  const t = translations[language];
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);

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

  const getProjectTitle = (projectId: string) =>
    projects.find(p => p.id === projectId)?.title || projectId;

  const handleCycleStatus = async (taskId: string, currentStatus: TaskStatus) => {
    const cycle: TaskStatus[] = ['Pending', 'InProgress', 'Completed'];
    const nextIndex = (cycle.indexOf(currentStatus) + 1) % cycle.length;
    await updateTaskStatus(taskId, cycle[nextIndex]);
  };

  const pendingCount = tasks.filter(t => t.status !== 'Completed').length;

  const formatFileSize = (size: number) => {
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${(size / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t.myTasks}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {profile?.displayName} &mdash; {language === 'MN' ? `${tasks.length} даалгавар` : `${tasks.length} tasks`}
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                {pendingCount} {language === 'MN' ? 'идэвхтэй' : 'active'}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          <Printer className="w-4 h-4" />
          {t.printReport}
        </button>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">{t.taskReport} — {profile?.displayName}</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString()}</p>
      </div>

      {tasks.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center print:hidden">
          <CheckCircle2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-slate-400 dark:text-slate-500 font-medium">{t.noTasksAssigned}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">    
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.taskTitle}</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5" />{language === 'MN' ? 'Төсөл' : 'Project'}</span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{t.dueDate}</span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.taskStatus}</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider print:hidden">{t.details}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.map(task => {
                const isOverdue = task.status !== 'Completed' && new Date(task.dueDate) < new Date();
                return (
                  <tr key={task.id} className={cn("hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors", task.status === 'Completed' && 'opacity-60')}>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{task.title}</div>
                      {task.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{task.description}</div>
                      )}
                      {(task.attachments?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-slate-400">
                          <Paperclip className="w-3 h-3" /> {task.attachments!.length}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 hidden md:table-cell">
                      {getProjectTitle(task.projectId)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("text-sm font-medium", isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-600 dark:text-slate-400')}>
                        {task.dueDate}
                        {isOverdue && <span className="ml-1 text-xs">(!)</span>}
                      </span>
                    </td>
                    <td className="px-6 py-4 print:hidden">
                      <button
                        onClick={() => handleCycleStatus(task.id, task.status)}
                        className={cn("flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full transition-all hover:opacity-80 active:scale-95", getTaskStatusColor(task.status))}
                        title={language === 'MN' ? 'Дарж төлвийг өөрчлөх' : 'Click to change status'}
                      >
                        {getTaskStatusIcon(task.status)}
                        {getTaskStatusLabel(task.status)}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right print:hidden">
                      <button
                        onClick={() => setSelectedTask(task)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t.details}
                      </button>
                    </td>
                    <td className="px-6 py-4 hidden print:table-cell text-slate-700">
                      {getTaskStatusLabel(task.status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title || t.details}
        className="max-w-2xl"
      >
        {selectedTask && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{language === 'MN' ? 'Төсөл' : 'Project'}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{getProjectTitle(selectedTask.projectId)}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t.dueDate}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedTask.dueDate}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t.taskStatus}</p>
                <div className="mt-1 inline-flex items-center gap-1.5">
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full", getTaskStatusColor(selectedTask.status))}>
                    {getTaskStatusIcon(selectedTask.status)}
                    {getTaskStatusLabel(selectedTask.status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400">{t.description}</h4>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap min-h-24">
                {selectedTask.description || (language === 'MN' ? 'Тайлбар оруулаагүй' : 'No description')}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                {t.attachments}
              </h4>

              {(selectedTask.attachments?.length ?? 0) > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedTask.attachments!.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                      {attachment.type.startsWith('image/') ? (
                        <img src={attachment.dataUrl} alt={attachment.name} className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <Paperclip className="w-4 h-4 text-slate-400" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{attachment.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatFileSize(attachment.size)}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={attachment.dataUrl}
                          download={attachment.name}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t.download}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-400 dark:text-slate-500 text-center">
                  {t.noAttachments}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
