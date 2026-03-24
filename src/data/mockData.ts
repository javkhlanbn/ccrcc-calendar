import { Project, Event } from '../types';

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    title: 'Сэлэнгэ мөрний сав газрыг ойжуулах',
    description: 'Хөрсний элэгдлээс урьдчилан сэргийлэх, экосистемийг сэргээх зорилгоор 10,000 нутгийн мод тарих.',
    startDate: '2026-04-01',
    endDate: '2026-10-31',
    status: 'Ongoing',
    tags: ['Forest', 'Water'],
  },
  {
    id: 'p2',
    title: 'Улаанбаатар хотын хог хаягдлын менежментийг оновчтой болгох',
    description: 'Хотын төвд хог хаягдлыг ангилан ялгах, дахин боловсруулах ухаалаг хөтөлбөрийг хэрэгжүүлэх.',
    startDate: '2026-05-15',
    endDate: '2027-05-15',
    status: 'Planning',
    tags: ['Waste'],
  },
  {
    id: 'p3',
    title: 'Говийн бүс дэх уур амьсгалын өөрчлөлтөд тэсвэртэй байдал',
    description: 'Нүүдэлчин малчдад зориулсан усны тогтвортой менежментийн системийг хөгжүүлэх.',
    startDate: '2025-01-10',
    endDate: '2026-12-20',
    status: 'Ongoing',
    tags: ['Climate', 'Water'],
  },
];

export const MOCK_EVENTS: Event[] = [
  {
    id: 'e1',
    title: 'Дэлхийн байгаль орчны өдөр',
    description: 'Байгаль орчны талаарх мэдлэгийг дээшлүүлэх, үйл ажиллагааг дэмжих дэлхийн хэмжээний баяр.',
    date: '2026-06-05',
    category: 'Environmental',
    priority: 'High',
    tags: ['Climate', 'Forest', 'Water', 'Waste'],
  },
  {
    id: 'e2',
    title: 'Эх дэлхийн өдөр',
    description: 'Байгаль орчныг хамгаалах үйлсийг дэмжих жил бүрийн арга хэмжээ.',
    date: '2026-04-22',
    category: 'Environmental',
    priority: 'High',
    tags: ['Climate'],
  },
  {
    id: 'e3',
    title: 'Төслийн нээлт: Сэлэнгийг ойжуулах',
    description: 'Орон нутгийн иргэд болон оролцогч талуудтай хийх анхны уулзалт.',
    date: '2026-04-05',
    category: 'Project',
    priority: 'Medium',
    projectId: 'p1',
    tags: ['Forest'],
  },
  {
    id: 'e4',
    title: 'Дотоод стратегийн уулзалт',
    description: 'Удахгүй болох байгаль орчны санаачилгуудын улирлын төлөвлөлт.',
    date: '2026-03-28',
    category: 'Internal',
    priority: 'Low',
    tags: ['Climate'],
  },
];
