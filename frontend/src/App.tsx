import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { AppShell, type Role, type Route } from './components/AppShell';
import { LoginPage, ResetPasswordPage } from './pages/LoginPage';
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
const ContentImportsPage = lazy(() => import('./pages/ContentImportsPage').then(module => ({ default: module.ContentImportsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(module => ({ default: module.NotificationsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })));

const routePaths: Record<Route, string> = { overview: '/', recovery: '/recovery', learners: '/learners', assessments: '/assessments', resources: '/resources', content: '/imports', notifications: '/notifications', reports: '/reports', settings: '/settings', profile: '/profile' };
const allowedRoutes: Record<Role, Set<Route>> = {
  student: new Set(['overview', 'recovery', 'assessments', 'notifications', 'profile']),
  teacher: new Set(['overview', 'learners', 'assessments', 'resources', 'content', 'notifications', 'reports', 'profile']),
  admin: new Set(['overview', 'learners', 'resources', 'content', 'notifications', 'settings', 'profile']),
};
function locationStateForPath(pathname: string) {
  const learner = pathname.match(/^\/learners\/(\d+)\/?$/);
  if (learner) return { route: 'learners' as Route, learnerId: Number(learner[1]) };
  const found = (Object.entries(routePaths) as [Route, string][]).find(([, path]) => path === pathname.replace(/\/$/, '') || (path === '/' && pathname === '/'));
  return { route: found?.[0] ?? 'overview', learnerId: null };
}
function locationState() { return locationStateForPath(window.location.pathname); }

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [role, setRole] = useState<Role>('teacher');
  const initialLocation = locationState();
  const [route, setRoute] = useState<Route>(initialLocation.route);
  const [learnerId, setLearnerId] = useState<number | null>(initialLocation.learnerId);
  const [assessmentCompetency, setAssessmentCompetency] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('tala_access')) { setCheckingSession(false); return; }
    currentUser().then(found => { setUser(found); setRole(found.role); }).catch(() => logout()).finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    const handlePopState = () => { const next = locationState(); setRoute(next.route); setLearnerId(next.learnerId); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((next: Route) => { setRoute(next); setLearnerId(null); if (window.location.pathname !== routePaths[next]) window.history.pushState({}, '', routePaths[next]); }, []);
  const openLearner = (id: number) => { setRoute('learners'); setLearnerId(id); window.history.pushState({}, '', `/learners/${id}`); };
  const closeLearner = () => { setLearnerId(null); setRoute('learners'); window.history.pushState({}, '', routePaths.learners); };
  useEffect(() => {
    if (!user || allowedRoutes[role].has(route)) return;
    setRoute('overview'); setLearnerId(null); window.history.replaceState({}, '', '/');
  }, [role, route, user]);
  const openNotificationUrl = useCallback((path: string) => {
    const learner = path.match(/^\/learners\/(\d+)\/?$/);
    if (learner && role !== 'student') { openLearner(Number(learner[1])); return; }
    const next = locationStateForPath(path).route;
    if (allowedRoutes[role].has(next)) navigate(next);
  }, [navigate, role]);
  const visibleRoute = allowedRoutes[role].has(route) ? route : 'overview';
  let page;
  if (learnerId && role !== 'student') page = <LearnerProfile learnerId={learnerId} onBack={closeLearner} />;
  else if (visibleRoute === 'assessments' && role === 'student') page = <StudentAssessments onRecovery={() => navigate('recovery')} targetCompetency={assessmentCompetency} onTargetHandled={() => setAssessmentCompetency(null)} />;
  else if (visibleRoute === 'assessments') page = <AssessmentsPage />;
  else if (visibleRoute === 'resources' && role !== 'student') page = <ResourcesPage admin={role === 'admin'} />;
  else if (visibleRoute === 'reports') page = <ReportsPage />;
  else if (visibleRoute === 'settings') page = <SettingsPage />;
  else if (visibleRoute === 'content') page = <ContentImportsPage admin={role === 'admin'} />;
  else if (visibleRoute === 'notifications') page = <NotificationsPage onOpenUrl={openNotificationUrl} />;
  else if (visibleRoute === 'profile') page = <ProfilePage onPasswordChanged={() => { logout(); setUser(null); window.history.replaceState({}, '', '/'); }} />;
  else if (visibleRoute === 'recovery') page = <RecoveryWorkspace onAssessments={competencyId => { setAssessmentCompetency(competencyId); navigate('assessments'); }} />;
  else if (role === 'admin' && visibleRoute === 'learners') page = <AdminUsers />;
  else if (role === 'student') page = <StudentOverview onContinue={() => navigate('recovery')} onAssessments={() => navigate('assessments')} />;
  else if (role === 'admin') page = <AdminOverview onSettings={() => navigate('settings')} />;
  else if (visibleRoute === 'learners') page = <TeacherDashboard onSelectLearner={openLearner} />;
  else page = <TeacherOverview onLearners={() => navigate('learners')} onAssessments={() => navigate('assessments')} onReports={() => navigate('reports')} onLearner={openLearner} />;

  if (checkingSession) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress size={28} aria-label="Checking session" /></Box>;
  if (!user && window.location.pathname === '/reset-password') return <ResetPasswordPage />;
  if (!user) return <LoginPage onLogin={async (email, password, otp) => { const authenticated = await login(email, password, otp); setUser(authenticated); setRole(authenticated.role); if (authenticated.must_change_password) { setRoute('profile'); window.history.replaceState({}, '', '/profile'); } }} />;
  return <AppShell route={visibleRoute} onRoute={navigate} onNotificationUrl={openNotificationUrl} role={role} userName={user.name} userEmail={user.email} className={user.class_name} onLogout={() => { logout(); setUser(null); setRoute('overview'); setLearnerId(null); window.history.replaceState({}, '', '/'); }}><Suspense fallback={<Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} aria-label="Loading page" /></Box>}>{page}</Suspense></AppShell>;
}
