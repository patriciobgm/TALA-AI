import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { AppShell, type Role, type Route } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { currentUser, login, logout, type AuthUser } from './api/auth';

const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard').then(module => ({ default: module.TeacherDashboard })));
const TeacherOverview = lazy(() => import('./pages/TeacherOverview').then(module => ({ default: module.TeacherOverview })));
const StudentOverview = lazy(() => import('./pages/StudentOverview').then(module => ({ default: module.StudentOverview })));
const RecoveryWorkspace = lazy(() => import('./pages/RecoveryWorkspace').then(module => ({ default: module.RecoveryWorkspace })));
const LearnerProfile = lazy(() => import('./pages/LearnerProfile').then(module => ({ default: module.LearnerProfile })));
const AdminOverview = lazy(() => import('./pages/AdminOverview').then(module => ({ default: module.AdminOverview })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then(module => ({ default: module.AdminUsers })));
const AssessmentsPage = lazy(() => import('./pages/ManagementPages').then(module => ({ default: module.AssessmentsPage })));
const StudentAssessments = lazy(() => import('./pages/StudentAssessments').then(module => ({ default: module.StudentAssessments })));
const ReportsPage = lazy(() => import('./pages/ManagementPages').then(module => ({ default: module.ReportsPage })));
const ResourcesPage = lazy(() => import('./pages/ManagementPages').then(module => ({ default: module.ResourcesPage })));
const SettingsPage = lazy(() => import('./pages/ManagementPages').then(module => ({ default: module.SettingsPage })));

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [role, setRole] = useState<Role>('teacher');
  const [route, setRoute] = useState<Route>('overview');
  const [learnerId, setLearnerId] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('tala_access')) { setCheckingSession(false); return; }
    currentUser().then(found => { setUser(found); setRole(found.role); }).catch(() => logout()).finally(() => setCheckingSession(false));
  }, []);

  const navigate = (next: Route) => { setRoute(next); setLearnerId(null); };
  let page;
  if (learnerId) page = <LearnerProfile learnerId={learnerId} onBack={() => setLearnerId(null)} />;
  else if (route === 'assessments' && role === 'student') page = <StudentAssessments />;
  else if (route === 'assessments') page = <AssessmentsPage />;
  else if (route === 'resources') page = <ResourcesPage admin={role === 'admin'} readonly={role === 'student'} />;
  else if (route === 'reports') page = <ReportsPage />;
  else if (route === 'settings') page = <SettingsPage />;
  else if (route === 'recovery') page = <RecoveryWorkspace />;
  else if (role === 'admin' && route === 'learners') page = <AdminUsers />;
  else if (role === 'student') page = <StudentOverview onContinue={() => navigate('recovery')} onAssessments={() => navigate('assessments')} />;
  else if (role === 'admin') page = <AdminOverview onSettings={() => navigate('settings')} />;
  else if (route === 'learners') page = <TeacherDashboard onSelectLearner={setLearnerId} />;
  else page = <TeacherOverview onLearners={() => navigate('learners')} onAssessments={() => navigate('assessments')} onReports={() => navigate('reports')} onLearner={setLearnerId} />;

  if (checkingSession) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress size={28} aria-label="Checking session" /></Box>;
  if (!user) return <LoginPage onLogin={async (email, password) => { const authenticated = await login(email, password); setUser(authenticated); setRole(authenticated.role); }} />;
  return <AppShell route={route} onRoute={navigate} role={role} userName={user.name} className={user.class_name} onLogout={() => { logout(); setUser(null); setRoute('overview'); setLearnerId(null); }}><Suspense fallback={<Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} aria-label="Loading page" /></Box>}>{page}</Suspense></AppShell>;
}
