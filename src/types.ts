export type ProjectStatus = 'Planning' | 'Ongoing' | 'Completed';
export type EventCategory = 'Project' | 'Environmental' | 'Internal' | 'Birthday' | 'Meeting' | 'Report';
export type Priority = 'Low' | 'Medium' | 'High';
export type EnvironmentalTag = 'Water' | 'Climate' | 'Forest' | 'Waste' | 'Peatland' | 'Report';
export type TaskStatus = 'Pending' | 'InProgress' | 'Completed';

export interface Project {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  tags: EnvironmentalTag[];
  visibleToUserIds?: string[];
  hiddenFromUserIds?: string[];
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  category: EventCategory;
  priority: Priority;
  birthdayUserId?: string;
  projectId?: string;
  tags: EnvironmentalTag[];
  attachments?: EventAttachment[];
  visibleToUserIds?: string[];
  hiddenFromUserIds?: string[];
  // Хурлын нэмэлт талбарууд (category === 'Meeting')
  endTime?: string;               // Дуусах цаг (эхлэх цаг + хугацаа)
  durationMinutes?: number;       // Хугацаа (минут)
  recurrence?: MeetingRecurrence; // Давтамж
  meetingType?: MeetingType;      // Танхимын / Цахим
  location?: string;              // Хуралдах байр
  attendeeUserIds?: string[];     // Хуралд оролцох хэрэглэгчид
  minutesKeeperUserId?: string;   // Хурлын тэмдэглэл хөтлөх хэрэглэгч
  seriesId?: string;              // Давтагдах хурлын цуврал id
}

// Хурлын давтамж ба төрөл
export type MeetingRecurrence =
  | 'none'        // Ээлжит бус
  | 'daily'       // Өдөр дутам
  | 'every3days'  // 3 хоног тутам
  | 'every5days'  // 5 хоног тутам
  | 'weekly'      // 7 хоног тутам
  | 'every14days' // 14 хоног тутам
  | 'every21days' // 21 хоног тутам
  | 'monthly'     // Сар тутам
  | 'quarterly';  // Улирал тутам

export type MeetingType = 'inperson' | 'online'; // Танхимын / Цахим

export interface EventAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface Task {
  id: string;
  projectId: string;        // хурлаас өгсөн даалгаварт хоосон байж болно
  sourceLabel?: string;     // эх сурвалж (жишээ нь хурлын нэр)
  assignedByName?: string;  // даалгавар өгсөн хүн
  title: string;
  description: string;
  assignedToUserIds: string[];
  dueDate: string;
  status: TaskStatus;
  attachments?: EventAttachment[];
  createdAt: string;
}

export interface ProcurementPlan {
  id: string;
  idx: number | null;
  code: string;
  name: string;
  type: string;
  budgetCost: number;
  yearFinancing: number;
  tenderMethod: string;
  tenderMonth: string;
  sustainable: string;
  notes: string;
  projectName: string;
  implementPeriod: string;
  committeeFormed: string;
  advertised: string;
  tenderOpened: string;
  committeeMet: string;
  noticeSent: string;
  contractSigned: string;
  contractValue: number;
  payment1: number;
  payment2: number;
  payment3: number;
  variance: string;
  extraNotes: string;
  visibleToUserIds?: string[];   // хоосон бол бүгд харна
  editableByUserIds?: string[];  // хоосон бол 'procurement' эрхтэй бүх ажилтан засна
}

export interface MeetingMinutes {
  id: string;
  title: string;
  date: string;
  time?: string;
  attendeeUserIds: string[];
  agenda: string;      // Хэлэлцсэн асуудал
  decisions: string;   // Гаргасан шийдвэр
  notes: string;       // Тэмдэглэл
  attachments?: EventAttachment[];
  visibleToUserIds?: string[];
  createdBy?: string;
}

// Ажилчид хоорондын шууд зурвас
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  attachments?: EventAttachment[];
  readAt?: string;
  createdAt: string;
}

// Ярианы товч мэдээлэл (зурвасын жагсаалтад)
export interface MessageThreadSummary {
  otherUserId: string;
  lastMessage: string;
  lastAt: string;
  lastSenderId: string;
  unreadCount: number;
  hasAttachment: boolean;
}

// Ажилтны ХУВИЙН хурлын тэмдэглэл — зөвхөн бичсэн ажилтанд харагдана
export interface PersonalMeetingNote {
  id: string;
  userId: string;
  meetingId?: string;
  meetingTitle: string;
  meetingDate?: string; // yyyy-MM-dd
  notes: string;         // Хурлын тэмдэглэл
  directorTasks: string; // Захирлаас өгсөн үүрэг даалгавар
  createdAt: string;
  updatedAt?: string;
}

// ===== Ээлжийн амралт =====
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

// Жилд эдлэх ажлын өдөр, хамгийн ихдээ хэдэн хэсэг болгон хуваахыг зөвшөөрөх
export const DEFAULT_LEAVE_DAYS = 15;
export const MAX_LEAVE_SPLITS = 4;

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
  days: number;      // ажлын өдрөөр автоматаар тооцогдоно
  reason?: string;
  status: LeaveStatus;
  year: number;
  createdAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
}

export interface LeaveBalance {
  entitlement: number;  // нийт эрхтэй (15 ажлын өдөр)
  approved: number;     // батлагдсан хоног
  pending: number;      // хүлээгдэж буй хоног
  used: number;         // ашигласан (батлагдсан)
  remaining: number;    // үлдсэн
  usageCount: number;   // хэдэн удаа авсан (батлагдсан + хүлээгдэж буй)
  maxSplits: number;
}

// Идэвхтэй (эхэлсэн) хурлын дохио — бүх ажилтанд гэрэл анивчиж харагдана
// Дууссан хурал хэр удсан бэ
export interface MeetingDuration {
  meetingId?: string;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
}

export interface MeetingSignal {
  id: number;
  meetingId?: string;
  title: string;
  time?: string;
  startedBy?: string;
  startedByName?: string;
  startedAt: string;
}

export type DirectorTaskStatus = 'NotStarted' | 'InProgress' | 'Completed' | 'Cancelled';
export type DirectorTaskPriority = 'High' | 'Medium' | 'Low';

export interface DirectorTaskActivity {
  id: string;
  type: 'created' | 'assigned' | 'updated' | 'progress' | 'comment' | 'attachment' | 'status';
  description: string;
  userId: string;
  userName: string;
  timestamp: string;
  data?: Record<string, any>;
}

export interface DirectorTask {
  id: string;
  title: string;
  description: string;
  assignedToUserIds: string[];
  department: string;
  priority: DirectorTaskPriority;
  startDate: string;
  dueDate: string;
  status: DirectorTaskStatus;
  progress: number;
  attachments: EventAttachment[];
  notes: string;
  activityLog: DirectorTaskActivity[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type Language = 'EN' | 'MN';
export type Theme = 'light' | 'dark';

export type UserStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'admin' | 'user';

// Нэмэлт хандалтын эрх: админ бүх эрхтэй, энгийн хэрэглэгч эдгээрээс олгогдсоныг ашиглана.
// 'procurement' = Худалдан авалт засах, 'procurement_view' = зөвхөн харах (аль нь ч биш бол огт харагдахгүй)
export type UserPermission = 'procurement' | 'procurement_view' | 'meeting' | 'minutes';

export type Department = 
  | 'Захиргаа, санхүүгийн хэлтэс'
  | 'Төсөл, хөтөлбөр, хамтын ажиллагааны хэлтэс'
  | 'Судалгаа, бүртгэл, баталгаажуулалтын хэлтэс'
  | 'Монгол-Кувейтын байгаль хамгаалах судалгааны хэлтэс';

export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  photoURL?: string;
  department: Department;
  role: UserRole;
  permissions?: UserPermission[];
  status: UserStatus;
  createdAt: string;
}
