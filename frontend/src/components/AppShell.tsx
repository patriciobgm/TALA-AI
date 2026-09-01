import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Badge, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Popover, TextField, Tooltip, Typography } from '@mui/material';
import { AssessmentOutlined, AutoStoriesOutlined, Close, DashboardOutlined, FactCheckOutlined, LibraryBooksOutlined, LogoutOutlined, ManageAccountsOutlined, Menu as MenuIcon, NotificationsNoneOutlined, PeopleAltOutlined, PsychologyOutlined, SchoolOutlined, TuneOutlined, UploadFileOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiNotification } from '../api/types';
import { StudentTalaChat } from './StudentTalaChat';
import { TalaChatContext, type TalaLearningContext } from './TalaChatContext';
import { TeachingScopeContext } from './TeachingScopeContext';
import { StudentScopeContext } from './StudentScopeContext';
import type { ApiClass, ApiSubject } from '../api/types';

export type Role = 'teacher' | 'student' | 'admin';
export type Route = 'overview' | 'companion' | 'evidence' | 'recovery' | 'materials' | 'enrollment' | 'learners' | 'classes' | 'assessments' | 'resources' | 'competencies' | 'content' | 'notifications' | 'reports' | 'research' | 'settings' | 'profile';
type NavigationItem = { id: Route; label: string; icon: ReactNode };
type NavigationGroup = { label: string; items: NavigationItem[] };

const roleNavigation: Record<Role, NavigationGroup[]> = {
  teacher: [
    { label: 'Workspace', items: [{ id: 'overview', label: 'Recovery Overview', icon: <DashboardOutlined /> }, { id: 'learners', label: 'Learners', icon: <PeopleAltOutlined /> }] },
    { label: 'Teaching', items: [{ id: 'assessments', label: 'Assessments', icon: <AssessmentOutlined /> }, { id: 'resources', label: 'Learning Materials', icon: <LibraryBooksOutlined /> }, { id: 'reports', label: 'Reports & Analytics', icon: <AutoStoriesOutlined /> }] },
  ],
  student: [
    { label: 'My Learning', items: [{ id: 'overview', label: 'My Progress', icon: <DashboardOutlined /> }, { id: 'companion', label: 'TALA Companion', icon: <PsychologyOutlined /> }, { id: 'recovery', label: 'Recovery Plan', icon: <AutoStoriesOutlined /> }, { id: 'materials', label: 'Learning Materials', icon: <LibraryBooksOutlined /> }, { id: 'assessments', label: 'Assessments', icon: <AssessmentOutlined /> }, { id: 'evidence', label: 'My Learning Record', icon: <FactCheckOutlined /> }] },
    { label: 'Access', items: [{ id: 'enrollment', label: 'Subject Enrollment', icon: <SchoolOutlined /> }] },
  ],
  admin: [
    { label: 'Administration', items: [{ id: 'overview', label: 'System Overview', icon: <DashboardOutlined /> }, { id: 'learners', label: 'Users & Security', icon: <PeopleAltOutlined /> }, { id: 'classes', label: 'Class Management', icon: <SchoolOutlined /> }] },
    { label: 'Academic Content', items: [{ id: 'resources', label: 'Subjects', icon: <LibraryBooksOutlined /> }, { id: 'content', label: 'Content Governance', icon: <UploadFileOutlined /> }] },
    { label: 'Evaluation', items: [{ id: 'research', label: 'Program Evaluation', icon: <FactCheckOutlined /> }] },
    { label: 'System', items: [{ id: 'settings', label: 'System Settings', icon: <TuneOutlined /> }] },
  ],
};

type Props = {
  children: ReactNode; route: Route; onRoute: (route: Route) => void; role: Role;
  userName: string; userEmail: string; className?: string | null; onLogout: () => void;
  onNotificationUrl: (url: string) => void;
};

export function AppShell({ children, route, onRoute, role, userName, userEmail, className, onLogout, onNotificationUrl }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const [learningContext, setLearningContext] = useState<TalaLearningContext | null>(null);
  const [teachingContext, setTeachingContext] = useState<{ subjects: ApiSubject[]; classes: ApiClass[] }>({ subjects: [], classes: [] });
  const [selectedSubjectId, setSelectedSubjectIdState] = useState<number | null>(() => Number(sessionStorage.getItem('tala_teacher_subject')) || null);
  const [selectedClassId, setSelectedClassIdState] = useState<number | null>(() => Number(sessionStorage.getItem('tala_teacher_class')) || null);
  const [studentSubjects, setStudentSubjects] = useState<ApiSubject[]>([]);
  const [studentSubjectId, setStudentSubjectIdState] = useState<number | null>(() => Number(sessionStorage.getItem('tala_student_subject')) || null);
  const [studentScopeLoading, setStudentScopeLoading] = useState(role === 'student');
  const groups = roleNavigation[role];
  const unread = notifications.filter(item => !item.is_read).length;
  const currentLabel = groups.flatMap(group => group.items).find(item => item.id === route)?.label ?? (route === 'competencies' ? 'Competencies' : route === 'notifications' ? 'Notifications' : route === 'profile' ? 'Account & Security' : 'Workspace');
  const roleLabel = role === 'teacher' ? 'SHS Teacher' : role === 'student' ? className ?? 'Student' : 'Administrator';
  const roleVisual = role === 'student' ? { navigation: '#edf7f4', selection: '#d6eee7', accent: '#087f72', header: '#fbfefd' } : role === 'teacher' ? { navigation: '#f0f3fa', selection: '#dfe7f7', accent: '#315da8', header: '#fcfdff' } : { navigation: '#eef1f4', selection: '#dce3e9', accent: '#34495e', header: '#fafbfc' };
  const initials = userName.split(' ').map(part => part[0]).slice(-2).join('');

  const loadNotifications = () => api<ApiNotification[] | { results?: ApiNotification[] }>('/notifications/').then(result => setNotifications(Array.isArray(result) ? result : result.results ?? [])).catch(() => undefined);
  useEffect(() => {
    let active = true;
    const load = () => api<ApiNotification[] | { results?: ApiNotification[] }>('/notifications/').then(result => { if (active) setNotifications(Array.isArray(result) ? result : result.results ?? []); }).catch(() => undefined);
    void load(); const timer = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (role !== 'teacher') return;
    api<{ subjects: ApiSubject[]; classes: ApiClass[] }>('/dashboard/teacher/context/').then(context => {
      setTeachingContext(context);
      setSelectedSubjectIdState(current => current && context.subjects.some(item => item.id === current) ? current : context.subjects[0]?.id ?? null);
    }).catch(() => undefined);
  }, [role]);
  useEffect(() => {
    if (role !== 'student') return;
    api<{ subjects: ApiSubject[] }>('/dashboard/student/context/').then(context => {
      setStudentSubjects(context.subjects);
      setStudentSubjectIdState(current => current && context.subjects.some(item => item.id === current) ? current : context.subjects[0]?.id ?? null);
    }).catch(() => { setStudentSubjects([]); setStudentSubjectIdState(null); }).finally(() => setStudentScopeLoading(false));
  }, [role]);
  const setSelectedSubjectId = (subjectId: number) => { sessionStorage.setItem('tala_teacher_subject', String(subjectId)); setSelectedSubjectIdState(subjectId); };
  const selectedSubject = teachingContext.subjects.find(item => item.id === selectedSubjectId) ?? null;
  const scopedClasses = selectedSubject ? teachingContext.classes.filter(item => item.grade_level === selectedSubject.grade_level) : teachingContext.classes;
  const selectedClass = scopedClasses.find(item => item.id === selectedClassId) ?? scopedClasses[0] ?? null;
  useEffect(() => { if (role !== 'teacher' || !scopedClasses.length || scopedClasses.some(item => item.id === selectedClassId)) return; const next = scopedClasses[0].id; setSelectedClassIdState(next); sessionStorage.setItem('tala_teacher_class', String(next)); }, [role, scopedClasses, selectedClassId]);
  const setSelectedClassId = (classId: number) => { sessionStorage.setItem('tala_teacher_class', String(classId)); setSelectedClassIdState(classId); };
  const selectedStudentSubject = studentSubjects.find(item => item.id === studentSubjectId) ?? null;
  const setStudentSubjectId = (subjectId: number) => { sessionStorage.setItem('tala_student_subject', String(subjectId)); setStudentSubjectIdState(subjectId); };
  const openNotification = async (item: ApiNotification) => {
    if (!item.is_read) {
      await api(`/notifications/${item.id}/read/`, { method: 'POST' });
      setNotifications(current => current.map(found => found.id === item.id ? { ...found, is_read: true } : found));
    }
    setNotificationAnchor(null);
    if (item.action_url) onNotificationUrl(item.action_url);
  };
  const markAllRead = async () => {
    await api('/notifications/read-all/', { method: 'POST' });
    setNotifications(current => current.map(item => ({ ...item, is_read: true })));
  };
  const dismissNotification = async (id: number) => {
    await api(`/notifications/${id}/dismiss/`, { method: 'DELETE' });
    setNotifications(current => current.filter(item => item.id !== id));
  };

  const navigation = <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: roleVisual.navigation }}>
    <Box onClick={() => onRoute('overview')} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onRoute('overview'); }} sx={{ height: 76, px: 2.5, display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider' }}><Box component="img" src="/school_logo.png" alt="Talavera Senior High School" sx={{ width: 40, height: 40, objectFit: 'contain', mr: 1.25 }} /><Box sx={{ minWidth: 0 }}><Typography fontWeight={800} lineHeight={1.15}>TALA-AI</Typography><Typography variant="caption" color="text.secondary" noWrap>Talavera Senior High School</Typography></Box></Box>
    <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', minWidth: 0 }}><Typography variant="caption" color="text.secondary" fontWeight={650}>{role === 'admin' ? 'System Administration' : role === 'student' ? 'My Learning' : 'Teacher Workspace'}</Typography>{role === 'teacher' && teachingContext.subjects.length > 1 ? <TextField select size="small" label="Teaching subject" value={selectedSubjectId ?? ''} onChange={event => setSelectedSubjectId(Number(event.target.value))} fullWidth sx={{ mt: 1.25, minWidth: 0, '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }} SelectProps={{ renderValue: value => { const subject = teachingContext.subjects.find(item => item.id === Number(value)); return subject ? `${subject.code} · ${subject.name}` : ''; }, MenuProps: { PaperProps: { sx: { maxWidth: 360 } } } }}>{teachingContext.subjects.map(subject => <MenuItem key={subject.id} value={subject.id} sx={{ whiteSpace: 'normal' }}>{subject.code} · {subject.name}</MenuItem>)}</TextField> : role === 'student' && route === 'enrollment' ? <Typography variant="body2" fontWeight={700} sx={{ mt: .25 }}>All subjects</Typography> : role === 'student' && studentSubjects.length > 1 ? <TextField select size="small" label="Learning subject" value={studentSubjectId ?? ''} onChange={event => setStudentSubjectId(Number(event.target.value))} fullWidth sx={{ mt: 1.25, minWidth: 0, '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }} SelectProps={{ renderValue: value => { const subject = studentSubjects.find(item => item.id === Number(value)); return subject ? `${subject.code} · ${subject.name}` : ''; }, MenuProps: { PaperProps: { sx: { maxWidth: 360 } } } }}>{studentSubjects.map(subject => <MenuItem key={subject.id} value={subject.id} sx={{ whiteSpace: 'normal' }}>{subject.code} · {subject.name}</MenuItem>)}</TextField> : <Typography variant="body2" fontWeight={700} noWrap title={role === 'teacher' ? selectedSubject?.name : role === 'student' ? selectedStudentSubject?.name : undefined} sx={{ mt: .25 }}>{role === 'student' ? selectedStudentSubject?.name ?? className ?? 'No assigned subject' : role === 'teacher' ? selectedSubject?.name ?? 'Assigned Curriculum' : 'Academic Configuration'}</Typography>}{role === 'teacher' && scopedClasses.length > 1 && <TextField select size="small" label="Teaching class" value={selectedClass?.id ?? ''} onChange={event => setSelectedClassId(Number(event.target.value))} fullWidth sx={{ mt: 1.25 }}>{scopedClasses.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>}</Box>
    <Box component="nav" className="tala-app-navigation" aria-label="Primary navigation" sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 2 }}>{groups.map(group => <Box key={group.label} sx={{ mb: 2.5 }}><Typography variant="overline" color="text.secondary" sx={{ px: 1.25, fontSize: 10, fontWeight: 800, letterSpacing: '.09em' }}>{group.label}</Typography><List disablePadding sx={{ mt: .5 }}>{group.items.map(item => <ListItemButton key={item.id} selected={route === item.id} aria-current={route === item.id ? 'page' : undefined} onClick={() => { onRoute(item.id); setMobileOpen(false); }} sx={{ minHeight: 42, px: 1.25, mb: .25, borderRadius: 1, color: route === item.id ? 'primary.dark' : 'text.secondary', '&.Mui-selected': { bgcolor: roleVisual.selection, color: 'primary.dark', boxShadow: `inset 3px 0 0 ${roleVisual.accent}` } }}><ListItemIcon sx={{ minWidth: 36, color: 'inherit', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} slotProps={{ primary: { fontSize: 13, fontWeight: route === item.id ? 750 : 600 } }} /></ListItemButton>)}</List></Box>)}</Box>
    <Divider /><Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 1, alignItems: 'center' }}><Avatar sx={{ width: 36, height: 36, bgcolor: '#dce8ef', color: 'primary.dark', fontSize: 12, fontWeight: 750 }}>{initials}</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap>{userName}</Typography><Typography variant="caption" color="text.secondary" noWrap title={userEmail}>{roleLabel}</Typography></Box></Box>
  </Box>;

  return <StudentScopeContext.Provider value={role === 'student' ? { subjects: studentSubjects, selectedSubjectId: studentSubjectId, selectedSubject: selectedStudentSubject, setSelectedSubjectId: setStudentSubjectId, loading: studentScopeLoading } : null}><TeachingScopeContext.Provider value={role === 'teacher' ? { subjects: teachingContext.subjects, classes: scopedClasses, selectedSubjectId, selectedSubject, setSelectedSubjectId, selectedClassId: selectedClass?.id ?? null, selectedClass, setSelectedClassId } : null}><TalaChatContext.Provider value={{ learningContext, setLearningContext }}><Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
    <Box component="aside" className="tala-app-navigation" sx={{ width: 252, flexShrink: 0, display: { xs: 'none', md: 'block' }, height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid', borderColor: 'divider' }}>{navigation}</Box>
    <Drawer anchor="left" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: 280 } }}>{navigation}</Drawer>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Box component="header" className="tala-app-header" sx={{ height: 76, px: { xs: 2, sm: 3, lg: 4 }, display: 'flex', alignItems: 'center', gap: 1, bgcolor: roleVisual.header, borderBottom: '1px solid', borderBottomColor: roleVisual.accent, position: 'sticky', top: 0, zIndex: theme => theme.zIndex.appBar }}>
        <IconButton onClick={() => setMobileOpen(true)} edge="start" aria-label="Open navigation" sx={{ display: { md: 'none' }, mr: .5 }}><MenuIcon /></IconButton>
        <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{role === 'student' ? 'My Learning' : role === 'teacher' ? 'Teacher Workspace' : 'Administration'}</Typography><Typography variant="body2" fontWeight={750} noWrap>{currentLabel}</Typography></Box><Box sx={{ flex: 1 }} />
        <Tooltip title="Notifications"><IconButton sx={{ flexShrink: 0 }} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={event => { setNotificationAnchor(event.currentTarget); void loadNotifications(); }}><Badge badgeContent={unread} color="error"><NotificationsNoneOutlined /></Badge></IconButton></Tooltip>
        <Tooltip title="Account menu"><IconButton aria-label="Account menu" onClick={event => setAccountAnchor(event.currentTarget)} sx={{ ml: .5, flexShrink: 0 }}><Avatar sx={{ width: 34, height: 34, bgcolor: '#dce8ef', color: 'primary.dark', fontSize: 12, fontWeight: 750 }}>{initials}</Avatar></IconButton></Tooltip>
      </Box>
      <Box component="main"><Box sx={{ width: '100%', maxWidth: 1420, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, pt: { xs: 2.5, sm: 3.5 }, pb: role === 'student' ? { xs: 64, sm: 66 } : { xs: 2.5, sm: 3.5 } }}>{children}</Box></Box>
    </Box>
    <Popover open={Boolean(notificationAnchor)} anchorEl={notificationAnchor} onClose={() => setNotificationAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: { xs: 'calc(100vw - 24px)', sm: 400 }, maxHeight: 520, mt: 1 } } }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography fontWeight={750}>Notifications</Typography><Typography variant="caption" color="text.secondary">{unread ? `${unread} unread` : 'You are up to date'}</Typography></Box><Button size="small" disabled={!unread} onClick={() => void markAllRead()}>Mark all read</Button></Box><Divider />
      <List disablePadding>{notifications.slice(0, 6).map(item => <Box key={item.id} sx={{ position: 'relative' }}><ListItemButton onClick={() => void openNotification(item)} sx={{ alignItems: 'flex-start', pl: 2, pr: 6, py: 1.5, bgcolor: item.is_read ? 'transparent' : '#f2f7fa' }}><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: item.is_read ? 'transparent' : 'primary.main', mt: .75, mr: 1.25, flexShrink: 0 }} /><ListItemText primary={<Typography variant="body2" fontWeight={item.is_read ? 600 : 750}>{item.title}</Typography>} secondary={<><Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: .25 }}>{item.message}</Typography><Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5 }}>{new Date(item.created_at).toLocaleString()}</Typography></>} /></ListItemButton><Tooltip title="Dismiss notification"><IconButton size="small" aria-label={`Dismiss ${item.title}`} onClick={() => void dismissNotification(item.id)} sx={{ position: 'absolute', right: 8, top: 10 }}><Close fontSize="small" /></IconButton></Tooltip></Box>)}</List>
      {!notifications.length && <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>No notifications yet.</Typography>}<Divider /><Button fullWidth onClick={() => { setNotificationAnchor(null); onRoute('notifications'); }} sx={{ borderRadius: 0 }}>View all notifications</Button>
    </Popover>
    <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: 240, mt: 1 } } }}>
      <Box sx={{ px: 2, py: 1.25 }}><Typography variant="body2" fontWeight={750} noWrap>{userName}</Typography><Typography variant="caption" color="text.secondary" noWrap>{userEmail}</Typography></Box><Divider /><MenuItem onClick={() => { setAccountAnchor(null); onRoute('profile'); }}><ManageAccountsOutlined fontSize="small" sx={{ mr: 1.25 }} />Account & Security</MenuItem><MenuItem onClick={onLogout}><LogoutOutlined fontSize="small" sx={{ mr: 1.25 }} />Sign Out</MenuItem>
    </Menu>
    {role === 'student' && route !== 'companion' && <StudentTalaChat />}
  </Box></TalaChatContext.Provider></TeachingScopeContext.Provider></StudentScopeContext.Provider>;
}
