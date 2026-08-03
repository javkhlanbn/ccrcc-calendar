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
  Pencil,
  UserPlus,
  Trash2
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Department, UserProfile, UserStatus, UserRole, UserPermission } from '../types';
import { format } from 'date-fns';
import { Modal } from '../components/ui/Modal';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/utils';

const departments: Department[] = [
  'Захиргаа, санхүүгийн хэлтэс',
  'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс',
  'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс',
  'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс'
];

const AdminUsers: React.FC = () => {
  const { language, updateUserStatus, updateManagedUser, createManagedUser, deleteManagedUser, profile } = useAppContext();
  const confirmDialog = useConfirm();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    department: departments[0] as Department,
    password: '',
    role: 'user' as UserRole,
    permissions: [] as UserPermission[],
  });

  const emptyForm = {
    email: '',
    firstName: '',
    lastName: '',
    department: departments[0] as Department,
    password: '',
    role: 'user' as UserRole,
    permissions: [] as UserPermission[],
  };

  // Худалдан авалт нь 3 түвшинтэй тул чагтын жагсаалтад биш, тусдаа сонголтоор удирдана
  const permissionOptions: { key: UserPermission; mn: string; en: string }[] = [
    { key: 'meeting', mn: 'Хуанли дээр шуурхай хурал нэмэх', en: 'Add urgent meetings on calendar' },
    { key: 'minutes', mn: 'Хурлын тэмдэглэл хөтлөх ажилтан', en: 'Meeting minutes keeper' },
  ];

  const togglePermission = (permission: UserPermission) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  // Худалдан авалтын хандах түвшин: 'hidden' | 'view' | 'edit'
  type ProcurementLevel = 'hidden' | 'view' | 'edit';
  const procurementLevel: ProcurementLevel = formData.permissions.includes('procurement')
    ? 'edit'
    : formData.permissions.includes('procurement_view')
      ? 'view'
      : 'hidden';

  const setProcurementLevel = (level: ProcurementLevel) => {
    setFormData(prev => {
      const others = prev.permissions.filter(p => p !== 'procurement' && p !== 'procurement_view');
      const next =
        level === 'edit' ? [...others, 'procurement' as UserPermission]
          : level === 'view' ? [...others, 'procurement_view' as UserPermission]
            : others;
      return { ...prev, permissions: next };
    });
  };

  const procurementLevelOptions: { key: ProcurementLevel; mn: string; en: string; desc: string }[] = [
    { key: 'hidden', mn: 'Огт харагдахгүй', en: 'Hidden', desc: 'Хуудас цэснээс болон нээхэд харагдахгүй' },
    { key: 'view', mn: 'Зөвхөн харах', en: 'View only', desc: 'Хуудсыг харна, гэхдээ засах боломжгүй' },
    { key: 'edit', mn: 'Засах', en: 'Edit', desc: 'Мэдээлэл нэмэх, засах, устгах' },
  ];

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
    setIsCreateMode(false);
    setFormData({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department,
      password: '',
      role: user.role,
      permissions: user.permissions || [],
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setSelectedUser(null);
    setIsCreateMode(true);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.email.trim() || !formData.password.trim() || !formData.firstName.trim() || !formData.lastName.trim()) {
      alert(language === 'MN' ? 'Бүх талбарыг бөглөнө үү.' : 'Please fill in all fields.');
      return;
    }

    try {
      setIsSaving(true);
      const newUser = await createManagedUser({
        email: formData.email.trim(),
        password: formData.password.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        department: formData.department,
        role: formData.role,
        permissions: formData.role === 'admin' ? [] : formData.permissions,
      });

      setUsers(prev => [newUser, ...prev]);
      setIsModalOpen(false);
      setFormData(emptyForm);
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Хэрэглэгч нэмэх үед алдаа гарлаа.' : 'Failed to create user.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    try {
      setIsSaving(true);
      const updatedUser = await updateManagedUser(selectedUser.uid, {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        department: formData.department,
        password: formData.password.trim() || undefined,
        role: formData.role,
        permissions: formData.role === 'admin' ? [] : formData.permissions,
      });

      setUsers(prev => prev.map(user => (user.uid === updatedUser.uid ? updatedUser : user)));
      setIsModalOpen(false);
      setSelectedUser(null);
      setFormData(emptyForm);
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Хэрэглэгчийн мэдээлэл шинэчлэх үед алдаа гарлаа.' : 'Failed to update user.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;

    const confirmMsg = language === 'MN'
      ? `"${selectedUser.displayName}" хэрэглэгчийг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`
      : `Delete user "${selectedUser.displayName}"? This action cannot be undone.`;
    if (!(await confirmDialog(confirmMsg))) return;

    try {
      setIsSaving(true);
      await deleteManagedUser(selectedUser.uid);
      setUsers(prev => prev.filter(user => user.uid !== selectedUser.uid));
      setIsModalOpen(false);
      setSelectedUser(null);
      setFormData(emptyForm);
    } catch (error: any) {
      alert(error?.message || (language === 'MN' ? 'Хэрэглэгч устгах үед алдаа гарлаа.' : 'Failed to delete user.'));
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
        <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          {language === 'MN' ? 'Хэрэглэгч нэмэх' : 'Add User'}
        </button>
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
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Хандалт' : 'Access'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Төлөв' : 'Status'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{language === 'MN' ? 'Бүртгүүлсэн' : 'Joined'}</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">{language === 'MN' ? 'Үйлдэл' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
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
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                          <Shield className="w-3 h-3" />
                          {language === 'MN' ? 'Админ' : 'Admin'}
                        </span>
                      ) : (user.permissions || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(user.permissions || []).includes('procurement') && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                              {language === 'MN' ? 'ХАА төлөвлөгөө' : 'Procurement'}
                            </span>
                          )}
                          {(user.permissions || []).includes('meeting') && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              {language === 'MN' ? 'Шуурхай хурал' : 'Meetings'}
                            </span>
                          )}
                          {(user.permissions || []).includes('minutes') && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {language === 'MN' ? 'Хурлын тэмдэглэл' : 'Minutes'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {language === 'MN' ? 'Зөвхөн харах' : 'View only'}
                        </span>
                      )}
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
        title={isCreateMode
          ? (language === 'MN' ? 'Хэрэглэгч нэмэх' : 'Add User')
          : (language === 'MN' ? 'Хэрэглэгч засах' : 'Edit User')}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Нэвтрэх нэр' : 'Username'}</label>
            <input
              type="text"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="input-field"
              placeholder={language === 'MN' ? 'Нэвтрэх нэр' : 'Username'}
            />
            {!isCreateMode && (
              <p className="text-[11px] text-slate-500">
                {language === 'MN' ? 'Нэвтрэх нэрийг өөрчилвөл хэрэглэгч шинэ нэрээрээ нэвтэрнэ.' : 'If changed, the user must log in with the new username.'}
              </p>
            )}
          </div>
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

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">{language === 'MN' ? 'Хандалтын эрх' : 'Access Level'}</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))}
              className="input-field"
              disabled={selectedUser?.uid === profile?.uid}
            >
              <option value="admin">{language === 'MN' ? 'Админ (бүх эрхтэй)' : 'Admin (full access)'}</option>
              <option value="user">{language === 'MN' ? 'Энгийн хэрэглэгч' : 'Regular user'}</option>
            </select>
            {selectedUser?.uid === profile?.uid && (
              <p className="text-[11px] text-slate-500">
                {language === 'MN' ? 'Өөрийн админ эрхийг өөрчлөх боломжгүй.' : 'You cannot change your own role.'}
              </p>
            )}

            {formData.role === 'user' && (
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                {/* Худалдан авалт — 3 түвшний хандалт */}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {language === 'MN' ? 'Худалдан авах ажиллагааны төлөвлөгөө' : 'Procurement Plan'}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {procurementLevelOptions.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setProcurementLevel(option.key)}
                        className={cn(
                          'px-2 py-2 rounded-lg text-xs font-bold border transition-all text-center',
                          procurementLevel === option.key
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        )}
                      >
                        {language === 'MN' ? option.mn : option.en}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {language === 'MN'
                      ? procurementLevelOptions.find(o => o.key === procurementLevel)?.desc
                      : procurementLevelOptions.find(o => o.key === procurementLevel)?.en}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {language === 'MN' ? 'Бусад нэмэлт эрх' : 'Other permissions'}
                  </p>
                  {permissionOptions.map(option => (
                    <label key={option.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(option.key)}
                        onChange={() => togglePermission(option.key)}
                      />
                      <span>{language === 'MN' ? option.mn : option.en}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-bold text-slate-500 dark:text-slate-400">
              {isCreateMode
                ? (language === 'MN' ? 'Нууц үг' : 'Password')
                : (language === 'MN' ? 'Шинэ нууц үг' : 'New Password')}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="input-field"
              placeholder={isCreateMode
                ? (language === 'MN' ? 'Хамгийн багадаа 6 тэмдэгт' : 'At least 6 characters')
                : (language === 'MN' ? 'Хоосон орхивол өөрчлөхгүй' : 'Leave blank to keep unchanged')}
            />
            {!isCreateMode && (
              <p className="text-[11px] text-slate-500">
                {language === 'MN' ? 'Нууц үг солихгүй бол хоосон орхи.' : 'Leave blank if password should stay unchanged.'}
              </p>
            )}
          </div>

          {/* Ажилтан устгах — зөвхөн засах горимд, өөрийгөө биш */}
          {!isCreateMode && selectedUser && selectedUser.uid !== profile?.uid && (
            <button
              onClick={handleDelete}
              disabled={isSaving}
              className="w-full py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              {language === 'MN' ? 'Ажилтан устгах' : 'Delete user'}
            </button>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold hover:bg-slate-200 transition-colors"
            >
              {language === 'MN' ? 'Цуцлах' : 'Cancel'}
            </button>
            <button
              onClick={isCreateMode ? handleCreate : handleSave}
              disabled={isSaving}
              className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {isSaving
                ? (language === 'MN' ? 'Хадгалж байна...' : 'Saving...')
                : isCreateMode
                  ? (language === 'MN' ? 'Нэмэх' : 'Add')
                  : (language === 'MN' ? 'Хадгалах' : 'Save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminUsers;
