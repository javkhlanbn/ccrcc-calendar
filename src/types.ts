export type ProjectStatus = 'Planning' | 'Ongoing' | 'Completed';
export type EventCategory = 'Project' | 'Environmental' | 'Internal' | 'Birthday';
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
  category: EventCategory;
  priority: Priority;
  birthdayUserId?: string;
  projectId?: string;
  tags: EnvironmentalTag[];
  attachments?: EventAttachment[];
  visibleToUserIds?: string[];
  hiddenFromUserIds?: string[];
}

export interface EventAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface Task {
  id: string;
  projectId: string;
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
  visibleToUserIds?: string[];
}

export type Language = 'EN' | 'MN';
export type Theme = 'light' | 'dark';

export type UserStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'admin' | 'user';

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
  status: UserStatus;
  createdAt: string;
}
