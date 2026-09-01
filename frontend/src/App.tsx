import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { AppShell, type Role, type Route } from './components/AppShell';
import { LoginPage, ResetPasswordPage } from './pages/LoginPage';
import { RemedialConsentPage } from './pages/RemedialConsentPage';
import { PrivacyDeclarationPage } from './pages/PrivacyDeclarationPage';
import { currentUser, login, logout, type AuthUser } from './api/auth';
import { roleThemes } from './theme';

const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard').then(module => ({ default: module.TeacherDashboard })));
const TeacherOverview = lazy(() => import('./pages/TeacherOverviewPage').then(module => ({ default: module.TeacherOverviewPage })));
const StudentOverview = lazy(() => import('./pages/StudentOverview').then(module => ({ default: module.StudentOverview })));
const RecoveryWorkspace = lazy(() => import('./pages/RecoveryWorkspace').then(module => ({ default: module.RecoveryWorkspace })));
const LearnerProfile = lazy(() => import('./pages/LearnerProfile').then(module => ({ default: module.LearnerProfile })));
const AdminOverview = lazy(() => import('./pages/AdminOverview').then(module => ({ default: module.AdminOverview })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then(module => ({ default: module.AdminUsers })));
const SubjectsPage = lazy(() => import('./pages/CurriculumPages').then(module => ({ default: module.SubjectsPage })));
const CompetenciesPage = lazy(() => import('./pages/CurriculumPages').then(module => ({ default: module.CompetenciesPage })));
const ResearchEvidencePage = lazy(() => import('./pages/ResearchEvidencePage').then(module => ({ default: module.ResearchEvidencePage })));
const AssessmentsPage = lazy(() => import('./pages/AssessmentManagementPage').then(module => ({ default: module.AssessmentManagementPage })));
const StudentAssessments = lazy(() => import('./pages/StudentAssessments').then(module => ({ default: module.StudentAssessments })));
const ReportsPage = lazy(() => import('./pages/TeacherReportsPage').then(module => ({ default: module.TeacherReportsPage })));
const SettingsPage = lazy(() => import('./pages/ManagementPages').then(module => ({ default: module.SettingsPage })));
const ContentImportsPage = lazy(() => import('./pages/ContentImportsPage').then(module => ({ default: module.ContentImportsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(module => ({ default: module.NotificationsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(module => ({ default: module.ProfilePage })));
const LearningMaterialsPage = lazy(() => import('./pages/LearningMaterialsPage').then(module => ({ default: module.LearningMaterialsPage })));
const StudentCompanionPage = lazy(() => import('./pages/StudentCompanionPage').then(module => ({ default: module.StudentCompanionPage })));
const EvidenceViewPage = lazy(() => import('./pages/EvidenceViewPage').then(module => ({ default: module.EvidenceViewPage })));
const StudentEnrollmentPage = lazy(() => import('./pages/StudentEnrollmentPage').then(module => ({ default: module.StudentEnrollmentPage })));

const routePaths: Record<Route, string> = { overview: '/', companion: '/companion', evidence: '/evidence', recovery: '/recovery', materials: '/materials', enrollment: '/enrollment', learners: '/learners', classes: '/classes', assessments: '/assessments', resources: '/subjects', competencies: '/subjects', content: '/imports', notifications: '/notifications', reports: '/reports', research: '/research', settings: '/settings', profile: '/profile' };
const allowedRoutes: Record<Role, Set<Route>> = {
  student: new Set(['overview', 'companion', 'evidence', 'recovery', 'materials', 'enrollment', 'assessments', 'notifications', 'profile']),
  teacher: new Set(['overview', 'learners', 'assessments', 'resources', 'content', 'notifications', 'reports', 'profile']),
  admin: new Set(['overview', 'learners', 'classes', 'resources', 'competencies', 'content', 'notifications', 'research', 'settings', 'profile']),
};
function locationStateForPath(pathname: string) {
  const learner = pathname.match(/^\/learners\/(\d+)\/?$/);
  if (learner) return { route: 'learners' as Route, learnerId: Number(learner[1]), subjectId: null, contentImportId: null, privacyRequestId: null };
  const competencySubject = pathname.match(/^\/subjects\/(\d+)\/competencies\/?$/);
  if (competencySubject) return { route: 'competencies' as Route, learnerId: null, subjectId: Number(competencySubject[1]), contentImportId: null, privacyRequestId: null };
  const contentImport = pathname.match(/^\/imports\/(\d+)\/?$/);
  if (contentImport) return { route: 'content' as Route, learnerId: null, subjectId: null, contentImportId: Number(contentImport[1]), privacyRequestId: null };
  const privacyRequest = pathname.match(/^\/settings\/privacy\/(\d+)\/?$/);
  if (privacyRequest) return { route: 'settings' as Route, learnerId: null, subjectId: null, contentImportId: null, privacyRequestId: Number(privacyRequest[1]) };
  const found = (Object.entries(routePaths) as [Route, string][]).find(([, path]) => path === pathname.replace(/\/$/, '') || (path === '/' && pathname === '/'));
  return { route: found?.[0] ?? 'overview', learnerId: null, subjectId: null, contentImportId: null, privacyRequestId: null };
}
function locationState() { return locationStateForPath(window.location.pathname); }

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [role, setRole] = useState<Role>('teacher');
  const initialLocation = locationState();
  const [route, setRoute] = useState<Route>(initialLocation.route);
  const [learnerId, setLearnerId] = useState<number | null>(initialLocation.learnerId);
  const [curriculumSubjectId, setCurriculumSubjectId] = useState<number | null>(initialLocation.subjectId ?? null);
  const [contentImportId, setContentImportId] = useState<number | null>(initialLocation.contentImportId ?? null);
  const [privacyRequestId, setPrivacyRequestId] = useState<number | null>(initialLocation.privacyRequestId ?? null);
  const [assessmentCompetency, setAssessmentCompetency] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('tala_access')) { setCheckingSession(false); return; }
    currentUser().then(found => { setUser(found); setRole(found.role); }).catch(() => logout()).finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    const handlePopState = () => { const next = locationState(); setRoute(next.route); setLearnerId(next.learnerId); setCurriculumSubjectId(next.subjectId ?? null); setContentImportId(next.contentImportId ?? null); setPrivacyRequestId(next.privacyRequestId ?? null); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((next: Route) => { if (user?.must_change_password && next !== 'profile') return; setRoute(next); setLearnerId(null); if (next !== 'competencies') setCurriculumSubjectId(null); if (next !== 'content') setContentImportId(null); setPrivacyRequestId(null); if (window.location.pathname !== routePaths[next]) window.history.pushState({}, '', routePaths[next]); }, [user?.must_change_password]);
  const openLearner = (id: number) => { setRoute('learners'); setLearnerId(id); window.history.pushState({}, '', `/learners/${id}`); };
  const closeLearner = () => { setLearnerId(null); setRoute('learners'); window.history.pushState({}, '', routePaths.learners); };
  const openCompetencies = (subjectId: number) => { setCurriculumSubjectId(subjectId); setRoute('competencies'); window.history.pushState({}, '', `/subjects/${subjectId}/competencies`); };
  const closeCompetencies = () => { setCurriculumSubjectId(null); setRoute('resources'); window.history.pushState({}, '', routePaths.resources); };
  useEffect(() => {
    if (!user || allowedRoutes[role].has(route)) return;
    setRoute('overview'); setLearnerId(null); window.history.replaceState({}, '', '/');
  }, [role, route, user]);
  const openNotificationUrl = useCallback((path: string) => {
    const learner = path.match(/^\/learners\/(\d+)\/?$/);
    if (learner && role !== 'student') { openLearner(Number(learner[1])); return; }
    const contentImport = path.match(/^\/imports\/(\d+)\/?$/);
    if (contentImport && role === 'admin') { setContentImportId(Number(contentImport[1])); setRoute('content'); window.history.pushState({}, '', path); return; }
    const privacyRequest = path.match(/^\/settings\/privacy\/(\d+)\/?$/);
    if (privacyRequest && role === 'admin') { setPrivacyRequestId(Number(privacyRequest[1])); setRoute('settings'); window.history.pushState({}, '', path); return; }
    const next = locationStateForPath(path).route;
    if (allowedRoutes[role].has(next)) navigate(next);
  }, [navigate, role]);
  const visibleRoute = user?.must_change_password ? 'profile' : allowedRoutes[role].has(route) ? route : 'overview';
  let page;
  if (learnerId && role !== 'student') page = <LearnerProfile learnerId={learnerId} onBack={closeLearner} />;
  else if (visibleRoute === 'assessments' && role === 'student') page = <StudentAssessments onRecovery={() => navigate('recovery')} onMaterials={() => navigate('materials')} targetCompetency={assessmentCompetency} onTargetHandled={() => setAssessmentCompetency(null)} />;
  else if (visibleRoute === 'assessments') page = <AssessmentsPage admin={role === 'admin'} />;
  else if (visibleRoute === 'competencies' && role === 'admin' && curriculumSubjectId) page = <CompetenciesPage subjectId={curriculumSubjectId} onBack={closeCompetencies} />;
  else if (visibleRoute === 'resources' && role === 'admin') page = <SubjectsPage onOpenCompetencies={openCompetencies} />;
  else if (visibleRoute === 'resources' && role === 'teacher') page = <ContentImportsPage admin={false} />;
  else if (visibleRoute === 'reports') page = <ReportsPage />;
  else if (visibleRoute === 'research' && role === 'admin') page = <ResearchEvidencePage />;
  else if (visibleRoute === 'settings') page = <SettingsPage initialSection={privacyRequestId ? 'privacy' : 'health'} initialPrivacyRequestId={privacyRequestId} />;
  else if (visibleRoute === 'content') page = <ContentImportsPage admin={role === 'admin'} initialImportId={contentImportId} />;
  else if (visibleRoute === 'notifications') page = <NotificationsPage onOpenUrl={openNotificationUrl} />;
  else if (visibleRoute === 'profile') page = <>{user?.must_change_password && <Box sx={{ mb: 2, p: 2, borderRadius: 1, bgcolor: '#fff3cd', color: '#664d03', border: '1px solid #ffecb5' }}>You must replace your temporary password before using the rest of TALA-AI.</Box>}<ProfilePage onPasswordChanged={() => { logout(); setUser(null); window.history.replaceState({}, '', '/'); }} /></>;
  else if (visibleRoute === 'recovery') page = <RecoveryWorkspace onAssessments={competencyId => { setAssessmentCompetency(competencyId ?? null); navigate('assessments'); }} onMaterials={() => navigate('materials')} />;
  else if (visibleRoute === 'companion' && role === 'student') page = <StudentCompanionPage onOpenRoute={path => navigate(locationStateForPath(path).route)} onEvidence={() => navigate('evidence')} />;
  else if (visibleRoute === 'evidence' && role === 'student') page = <EvidenceViewPage />;
  else if (visibleRoute === 'materials' && role === 'student') page = <LearningMaterialsPage />;
  else if (visibleRoute === 'enrollment' && role === 'student') page = <StudentEnrollmentPage />;
  else if (role === 'admin' && visibleRoute === 'learners') page = <AdminUsers superadmin={Boolean(user?.is_superadmin)} mode="users" />;
  else if (role === 'admin' && visibleRoute === 'classes') page = <AdminUsers superadmin={Boolean(user?.is_superadmin)} mode="classes" />;
  else if (role === 'student') page = <StudentOverview onContinue={() => navigate('recovery')} onAssessments={() => navigate('assessments')} onMaterials={() => navigate('materials')} onEnrollment={() => navigate('enrollment')} />;
  else if (role === 'admin') page = <AdminOverview onUsers={() => navigate('learners')} onCurriculum={() => navigate('resources')} onContent={() => navigate('content')} onSettings={() => navigate('settings')} />;
  else if (visibleRoute === 'learners') page = <TeacherDashboard onSelectLearner={openLearner} />;
  else page = <TeacherOverview onLearners={() => navigate('learners')} onAssessments={() => navigate('assessments')} onReports={() => navigate('reports')} onLearner={openLearner} />;

  if (checkingSession) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress size={28} aria-label="Checking session" /></Box>;
  if (window.location.pathname === '/consent') return <RemedialConsentPage />;
  if (!user && window.location.pathname === '/reset-password') return <ResetPasswordPage />;
  if (!user) return <LoginPage onLogin={async (email, password, otp) => { const authenticated = await login(email, password, otp); setUser(authenticated); setRole(authenticated.role); if (authenticated.must_change_password) { setRoute('profile'); window.history.replaceState({}, '', '/profile'); } }} />;
  if (user.privacy_acknowledgment_required && !user.must_change_password) return <PrivacyDeclarationPage onAccepted={() => setUser(current => current ? { ...current, privacy_acknowledgment_required: false } : current)} onLogout={() => { logout(); setUser(null); window.history.replaceState({}, '', '/'); }} />;
  return <ThemeProvider theme={roleThemes[role]}><AppShell route={visibleRoute} onRoute={navigate} onNotificationUrl={openNotificationUrl} role={role} userName={user.name} userEmail={user.email} className={user.class_name} onLogout={() => { logout(); setUser(null); setRoute('overview'); setLearnerId(null); window.history.replaceState({}, '', '/'); }}><Suspense fallback={<Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} aria-label="Loading page" /></Box>}>{page}</Suspense></AppShell></ThemeProvider>;
}
