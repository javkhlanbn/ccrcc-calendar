import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Calendar } from './pages/Calendar';
import { Projects } from './pages/Projects';
import { ProcurementPlan } from './pages/ProcurementPlan';
import { MeetingMinutesPage } from './pages/MeetingMinutesPage';
import { LeavePage } from './pages/LeavePage';
import { MessagesPage } from './pages/MessagesPage';
import { MyTasks } from './pages/MyTasks';
import AdminUsers from './pages/AdminUsers';
import { DirectorTasks } from './pages/DirectorTasks';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/procurement" element={<ProcurementPlan />} />
              <Route path="/meeting-minutes" element={<MeetingMinutesPage />} />
              <Route path="/leave" element={<LeavePage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/my-tasks" element={<MyTasks />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/director-tasks" element={<DirectorTasks />} />
            </Routes>
          </Layout>
        </Router>
      </AppProvider>
    </ErrorBoundary>
  );
}
