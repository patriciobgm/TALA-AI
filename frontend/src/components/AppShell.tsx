import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Badge, Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Popover, Tooltip, Typography } from '@mui/material';
import { AssessmentOutlined, AutoStoriesOutlined, DashboardOutlined, LibraryBooksOutlined, LogoutOutlined, ManageAccountsOutlined, Menu as MenuIcon, NotificationsNoneOutlined, PeopleAltOutlined, TuneOutlined, UploadFileOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiNotification } from '../api/types';
import { StudentTalaChat } from './StudentTalaChat';
import { TalaChatContext, type TalaLearningContext } from './TalaChatContext';

export type Role = 'teacher' | 'student' | 'admin';
export type Route = 'overview' | 'recovery' | 'learners' | 'assessments' | 'resources' | 'content' | 'notifications' | 'reports' | 'settings' | 'profile';
type NavigationItem = { id: Route; label: string; icon: ReactNode };
type NavigationGroup = { label: string; items: NavigationItem[] };

const roleNavigation: Record<Role, NavigationGroup[]> = {
  teacher: [
    { label: 'Workspace', items: [{ id: 'overview', label: 'Recovery overview', icon: <DashboardOutlined /> }, { id: 'learners', label: 'Learners', icon: <PeopleAltOutlined /> }] },
    { label: 'Teaching', items: [{ id: 'assessments', label: 'Assessments', icon: <AssessmentOutlined /> }, { id: 'resources', label: 'Learning resources', icon: <LibraryBooksOutlined /> }, { id: 'content', label: 'Content imports', icon: <UploadFileOutlined /> }, { id: 'reports', label: 'Reports & analytics', icon: <AutoStoriesOutlined /> }] },
  ],
  student: [{ label: 'My learning', items: [{ id: 'overview', label: 'My progress', icon: <DashboardOutlined /> }, { id: 'recovery', label: 'Recovery plan', icon: <AutoStoriesOutlined /> }, { id: 'assessments', label: 'Assessments', icon: <AssessmentOutlined /> }] }],
  admin: [
    { label: 'Administration', items: [{ id: 'overview', label: 'System overview', icon: <DashboardOutlined /> }, { id: 'learners', label: 'Users & classes', icon: <PeopleAltOutlined /> }] },
    { label: 'Academic content', items: [{ id: 'resources', label: 'Curriculum', icon: <LibraryBooksOutlined /> }, { id: 'content', label: 'Content governance', icon: <UploadFileOutlined /> }, { id: 'settings', label: 'System settings', icon: <TuneOutlined /> }] },
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
  const groups = roleNavigation[role];
  const unread = notifications.filter(item => !item.is_read).length;
  const currentLabel = groups.flatMap(group => group.items).find(item => item.id === route)?.label ?? (route === 'notifications' ? 'Notifications' : route === 'profile' ? 'Account & security' : 'Workspace');
  const roleLabel = role === 'teacher' ? 'ARAL Tutor' : role === 'student' ? className ?? 'Student' : 'Administrator';
  const initials = userName.split(' ').map(part => part[0]).slice(-2).join('');

  const loadNotifications = () => api<ApiNotification[] | { results?: ApiNotification[] }>('/notifications/').then(result => setNotifications(Array.isArray(result) ? result : result.results ?? [])).catch(() => undefined);
  useEffect(() => {
    let active = true;
    const load = () => api<ApiNotification[] | { results?: ApiNotification[] }>('/notifications/').then(result => { if (active) setNotifications(Array.isArray(result) ? result : result.results ?? []); }).catch(() => undefined);
    void load(); const timer = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
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

  const navigation = <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#f7f9fa' }}>
    <Box onClick={() => onRoute('overview')} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') onRoute('overview'); }} sx={{ height: 76, px: 2.5, display: 'flex', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider' }}><Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: '#fff', borderRadius: 1, fontWeight: 850, mr: 1.25 }}>T</Box><Box><Typography fontWeight={800} lineHeight={1.15}>TALA-AI</Typography><Typography variant="caption" color="text.secondary">Academic Recovery</Typography></Box></Box>
    <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="caption" color="text.secondary" fontWeight={650}>{role === 'admin' ? 'System administration' : role === 'student' ? 'My learning' : 'Teacher workspace'}</Typography><Typography variant="body2" fontWeight={700} sx={{ mt: .25 }}>{role === 'student' ? className ?? 'Unassigned class' : role === 'teacher' ? 'Assigned curriculum' : 'Academic configuration'}</Typography></Box>
    <Box component="nav" aria-label="Primary navigation" sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 2 }}>{groups.map(group => <Box key={group.label} sx={{ mb: 2.5 }}><Typography variant="overline" color="text.secondary" sx={{ px: 1.25, fontSize: 10, fontWeight: 800, letterSpacing: '.09em' }}>{group.label}</Typography><List disablePadding sx={{ mt: .5 }}>{group.items.map(item => <ListItemButton key={item.id} selected={route === item.id} aria-current={route === item.id ? 'page' : undefined} onClick={() => { onRoute(item.id); setMobileOpen(false); }} sx={{ minHeight: 42, px: 1.25, mb: .25, borderRadius: 1, color: route === item.id ? 'primary.dark' : 'text.secondary', '&.Mui-selected': { bgcolor: '#e7eff4', color: 'primary.dark', boxShadow: 'inset 3px 0 0 #174b7a' } }}><ListItemIcon sx={{ minWidth: 36, color: 'inherit', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} slotProps={{ primary: { fontSize: 13, fontWeight: route === item.id ? 750 : 600 } }} /></ListItemButton>)}</List></Box>)}</Box>
    <Divider /><Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', gap: 1, alignItems: 'center' }}><Avatar sx={{ width: 36, height: 36, bgcolor: '#dce8ef', color: 'primary.dark', fontSize: 12, fontWeight: 750 }}>{initials}</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap>{userName}</Typography><Typography variant="caption" color="text.secondary" noWrap title={userEmail}>{roleLabel}</Typography></Box></Box>
  </Box>;

  return <TalaChatContext.Provider value={{ learningContext, setLearningContext }}><Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
    <Box component="aside" sx={{ width: 252, flexShrink: 0, display: { xs: 'none', md: 'block' }, height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid', borderColor: 'divider' }}>{navigation}</Box>
    <Drawer anchor="left" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: 280 } }}>{navigation}</Drawer>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Box component="header" sx={{ height: 76, px: { xs: 2, sm: 3, lg: 4 }, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider', position: 'sticky', top: 0, zIndex: theme => theme.zIndex.appBar }}>
        <IconButton onClick={() => setMobileOpen(true)} edge="start" aria-label="Open navigation" sx={{ display: { md: 'none' }, mr: .5 }}><MenuIcon /></IconButton>
        <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{role === 'student' ? 'My learning' : role === 'teacher' ? 'Teacher workspace' : 'Administration'}</Typography><Typography variant="body2" fontWeight={750} noWrap>{currentLabel}</Typography></Box><Box sx={{ flex: 1 }} />
        <Tooltip title="Notifications"><IconButton aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={event => { setNotificationAnchor(event.currentTarget); void loadNotifications(); }}><Badge badgeContent={unread} color="error"><NotificationsNoneOutlined /></Badge></IconButton></Tooltip>
        <Tooltip title="Account menu"><IconButton aria-label="Account menu" onClick={event => setAccountAnchor(event.currentTarget)} sx={{ ml: .5 }}><Avatar sx={{ width: 34, height: 34, bgcolor: '#dce8ef', color: 'primary.dark', fontSize: 12, fontWeight: 750 }}>{initials}</Avatar></IconButton></Tooltip>
      </Box>
      <Box component="main"><Box sx={{ width: '100%', maxWidth: 1420, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, pt: { xs: 2.5, sm: 3.5 }, pb: role === 'student' ? { xs: 64, sm: 66 } : { xs: 2.5, sm: 3.5 } }}>{children}</Box></Box>
    </Box>
    <Popover open={Boolean(notificationAnchor)} anchorEl={notificationAnchor} onClose={() => setNotificationAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: { xs: 'calc(100vw - 24px)', sm: 400 }, maxHeight: 520, mt: 1 } } }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography fontWeight={750}>Notifications</Typography><Typography variant="caption" color="text.secondary">{unread ? `${unread} unread` : 'You are up to date'}</Typography></Box><Button size="small" disabled={!unread} onClick={() => void markAllRead()}>Mark all read</Button></Box><Divider />
      <List disablePadding>{notifications.slice(0, 6).map(item => <ListItemButton key={item.id} onClick={() => void openNotification(item)} sx={{ alignItems: 'flex-start', px: 2, py: 1.5, bgcolor: item.is_read ? 'transparent' : '#f2f7fa' }}><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: item.is_read ? 'transparent' : 'primary.main', mt: .75, mr: 1.25, flexShrink: 0 }} /><ListItemText primary={<Typography variant="body2" fontWeight={item.is_read ? 600 : 750}>{item.title}</Typography>} secondary={<><Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: .25 }}>{item.message}</Typography><Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5 }}>{new Date(item.created_at).toLocaleString()}</Typography></>} /></ListItemButton>)}</List>
      {!notifications.length && <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>No notifications yet.</Typography>}<Divider /><Button fullWidth onClick={() => { setNotificationAnchor(null); onRoute('notifications'); }} sx={{ borderRadius: 0 }}>View all notifications</Button>
    </Popover>
    <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: 240, mt: 1 } } }}>
      <Box sx={{ px: 2, py: 1.25 }}><Typography variant="body2" fontWeight={750} noWrap>{userName}</Typography><Typography variant="caption" color="text.secondary" noWrap>{userEmail}</Typography></Box><Divider /><MenuItem onClick={() => { setAccountAnchor(null); onRoute('profile'); }}><ManageAccountsOutlined fontSize="small" sx={{ mr: 1.25 }} />Account & security</MenuItem><MenuItem onClick={onLogout}><LogoutOutlined fontSize="small" sx={{ mr: 1.25 }} />Sign out</MenuItem>
    </Menu>
    {role === 'student' && <StudentTalaChat />}
  </Box></TalaChatContext.Provider>;
}
