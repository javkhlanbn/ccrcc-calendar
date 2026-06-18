import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Shield, 
  User as UserIcon,
  Search,
  Filter,
  Mail,
  Building2,
  Calendar,
  Pencil
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Department, UserProfile, UserStatus } from '../types';
import { format } from 'date-fns';
import { Modal } from '../components/ui/Modal';

const departments: Department[] = [
  'Захиргаа, санхүүгийн хэлтэс',
  'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс',
  'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс',
  'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс'
];

const AdminUsers: React.FC = () => {
  const { language, updateUserStatus, updateManagedUser, profile } = useAppContext();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    department: departments[0] as Department,
    password: '',
  });

  useEffect(() => {
    if (profile?.role !== 'admin') {
      setLoading(false);
      return;
    }

    const fetchUsers = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error('Failed to fetch users');
        const usersData = await res.json();
        setUsers(usersData as UserProfile[]);
      } catch (error) {
        console.error('Users fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [profile]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            {language === 'MN' ? 'Зөвшөөрсөн' : 'Approved'}
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            <XCircle className="w-3 h-3" />
            {language === 'MN' ? 'Татгалзсан' : 'Rejected'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="w-3 h-3" />
            {language === 'MN' ? 'Хүлээгдэж буй' : 'Pending'}
          </span>
        );
    }
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department,
      password: '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    try {
      setIsSaving(true);
      const updatedUser = await updateManagedUser(selectedUser.uid, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        department: formData.department,
        password: formData.password.trim() || undefined,
      });

      setUsers(prev => prev.map(user => (user.uid === updatedUser.uid ? updatedUser : user)));
      setIsModalOpen(false);
      setSelectedUser(null);
      setFormData({
        firstName: '',
        lastName: '',
        department: departments[0],
        password: '',
      });
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Хэрэглэгчийн мэдээлэл шинэчлэх үед алдаа гарлаа.' : 'Failed to update user.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Shield className="w-16 h-16 text-rose-500 mb-4 opacity-20" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Хандах эрхгүй</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">Энэ хуудсыг үзэхийн тулд админ эрхтэй байх шаардлагатай.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {language === 'MN' ? 'Хэрэглэгчийн удирдлага' : 'User Management'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {language === 'MN' ? 'Системийн хэрэглэгчдийг удирдах, зөвшөөрөл олгох' : 'Manage system users and grant permissions'}
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder={language === 'MN' ? 'Нэр эсвэл и-мэйлээр хайх...' : 'Search by name or email...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="input-field w-40"
          >
            <option value="all">{language === 'MN' ? 'Бүх төлөв' : 'All Status'}</option>
            <option value="pending">{language === 'MN' ? 'Хүлээгдэж буй' : 'Pending'}</option>
            <option value="approved">{language === 'MN' ? 'Зөвшөөрсөн' : 'Approved'}</option>
            <option value="rejected">{language === 'MN' ? 'Татгалзсан' : 'Rejected'}</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden border-none shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Хэрэглэгч' : 'User'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Хэлтэс' : 'Department'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Төлөв' : 'Status'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Бүртгүүлсэн' : 'Joined'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{language === 'MN' ? 'Үйлдэл' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    {language === 'MN' ? 'Хэрэглэгч олдсонгүй' : 'No users found'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 overflow-hidden">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{user.displayName}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Building2 className="w-4 h-4 opacity-50" />
                        {user.department}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 opacity-50" />
                        {user.createdAt ? format(new Date(user.createdAt), 'yyyy-MM-dd') : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                          title={language === 'MN' ? 'Засах' : 'Edit'}
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        {user.status !== 'approved' && (
                          <button 
                            onClick={async () => {
                              await updateUserStatus(user.uid, 'approved');
                              setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: 'approved' } : u));
                            }}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                            title={language === 'MN' ? 'Зөвшөөрөх' : 'Approve'}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                        )}
                        {user.status !== 'rejected' && (
                          <button 
                            onClick={async () => {
                              await updateUserStatus(user.uid, 'rejected');
                              setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: 'rejected' } : u));
                            }}
                            className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            title={language === 'MN' ? 'Татгалзах' : 'Reject'}
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={language === 'MN' ? 'Хэрэглэгч засах' : 'Edit User'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Нэр' : 'First Name'}</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Овог' : 'Last Name'}</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Хэлтэс' : 'Department'}</label>
            <select
              value={formData.department}
              onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value as Department }))}
              className="input-field"
            >
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Шинэ нууц үг' : 'New Password'}</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="input-field"
              placeholder={language === 'MN' ? 'Хоосон орхивол өөрчлөхгүй' : 'Leave blank to keep unchanged'}
            />
            <p className="text-[11px] text-slate-500">
              {language === 'MN' ? 'Нууц үг солихгүй бол хоосон орхи.' : 'Leave blank if password should stay unchanged.'}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {language === 'MN' ? 'Цуцлах' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {isSaving
                ? (language === 'MN' ? 'Хадгалж байна...' : 'Saving...')
                : (language === 'MN' ? 'Хадгалах' : 'Save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminUsers;
