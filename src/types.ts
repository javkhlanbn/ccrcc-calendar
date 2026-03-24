export type ProjectStatus = 'Planning' | 'Ongoing' | 'Completed';
export type EventCategory = 'Project' | 'Environmental' | 'Internal';
export type Priority = 'Low' | 'Medium' | 'High';
export type EnvironmentalTag = 'Water' | 'Climate' | 'Forest' | 'Waste';

export interface Project {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  tags: EnvironmentalTag[];
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  category: EventCategory;
  priority: Priority;
  projectId?: string;
  tags: EnvironmentalTag[];
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
