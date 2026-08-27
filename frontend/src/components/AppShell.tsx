import { useState, type ReactNode } from 'react';
import {
  AppBar, Avatar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography,
} from '@mui/material';
import {
  AccountCircleOutlined, AssessmentOutlined, AutoStoriesOutlined, DashboardOutlined,
  ExpandMore, HelpOutline, LibraryBooksOutlined, Logout, Menu as MenuIcon,
  PeopleAltOutlined, SettingsOutlined, TuneOutlined,
} from '@mui/icons-material';

export type Role = 'teacher' | 'student' | 'admin';
export type Route = 'overview' | 'recovery' | 'learners' | 'assessments' | 'resources' | 'reports' | 'settings';

const roleNavigation: Record<Role, { id: Route; label: string; icon: ReactNode }[]> = {
  teacher: [
    { id: 'overview', label: 'Overview', icon: <DashboardOutlined /> },
    { id: 'learners', label: 'Learners', icon: <PeopleAltOutlined /> },
    { id: 'assessments', label: 'Assessments', icon: <AssessmentOutlined /> },
    { id: 'resources', label: 'Resources', icon: <LibraryBooksOutlined /> },
    { id: 'reports', label: 'Reports', icon: <AutoStoriesOutlined /> },
  ],
  student: [
    { id: 'overview', label: 'My progress', icon: <DashboardOutlined /> },
    { id: 'recovery', label: 'Recovery plan', icon: <AutoStoriesOutlined /> },
    { id: 'assessments', label: 'Assessments', icon: <AssessmentOutlined /> },
    { id: 'resources', label: 'Resources', icon: <LibraryBooksOutlined /> },
  ],
  admin: [
    { id: 'overview', label: 'Overview', icon: <DashboardOutlined /> },
    { id: 'learners', label: 'Users & classes', icon: <PeopleAltOutlined /> },
    { id: 'resources', label: 'Curriculum', icon: <LibraryBooksOutlined /> },
    { id: 'settings', label: 'Settings', icon: <TuneOutlined /> },
  ],
};

export function AppShell({ children, route, onRoute, role, userName, className, onLogout }: { children: ReactNode; route: Route; onRoute: (route: Route) => void; role: Role; userName: string; className?: string | null; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const displayName = userName;
  const subtitle = role === 'teacher' ? 'ARAL Tutor' : role === 'student' ? className ?? 'Student' : 'Administrator';
  const context = role === 'teacher' ? 'General Mathematics · Assigned classes' : role === 'student' ? `General Mathematics · ${className ?? 'Unassigned'}` : 'Talavera Senior High School';
  const navigation = roleNavigation[role];

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Toolbar sx={{ minHeight: '68px !important', px: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1600, width: '100%', mx: 'auto' }}>
        <IconButton onClick={() => setMobileOpen(true)} edge="start" aria-label="Open navigation" sx={{ display: { md: 'none' }, mr: 1 }}><MenuIcon /></IconButton>
        <Button onClick={() => onRoute('overview')} color="inherit" sx={{ p: 0, mr: { md: 5 }, minWidth: 0, '&:hover': { bgcolor: 'transparent' } }} aria-label="TALA-AI home">
          <Box sx={{ width: 34, height: 34, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: '#fff', fontWeight: 800, mr: 1.25 }}>T</Box>
          <Box sx={{ textAlign: 'left' }}><Typography fontWeight={780} lineHeight={1.1}>TALA-AI</Typography><Typography variant="caption" color="text.secondary">Academic Recovery</Typography></Box>
        </Button>
        <Box component="nav" aria-label="Primary navigation" sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'stretch', gap: .5 }}>
          {navigation.map(item => <Button key={item.id} onClick={() => onRoute(item.id)} color="inherit" aria-current={route === item.id ? 'page' : undefined} sx={{ px: 1.5, borderRadius: 0, color: route === item.id ? 'primary.main' : 'text.secondary', borderBottom: '2px solid', borderColor: route === item.id ? 'primary.main' : 'transparent', fontWeight: route === item.id ? 700 : 550 }}>{item.label}</Button>)}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Email help desk"><IconButton aria-label="Email help desk" sx={{ mr: 1 }} onClick={() => { window.location.href = 'mailto:support@tala.edu.ph'; }}><HelpOutline fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Account menu"><IconButton onClick={event => setAccountAnchor(event.currentTarget)} sx={{ borderRadius: 1, p: .5, gap: 1 }} aria-label="Open account menu"><Avatar sx={{ width: 34, height: 34, fontSize: 12, bgcolor: '#dce8f1', color: 'primary.dark' }}>{displayName.split(' ').map(x => x[0]).slice(-2).join('')}</Avatar><Box sx={{ textAlign: 'left', display: { xs: 'none', sm: 'block' } }}><Typography variant="body2" fontWeight={650}>{displayName}</Typography><Typography variant="caption" color="text.secondary">{subtitle}</Typography></Box><ExpandMore fontSize="small" sx={{ display: { xs: 'none', sm: 'block' } }} /></IconButton></Tooltip>
        <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)} PaperProps={{ sx: { mt: 1, minWidth: 220 } }}>
          <MenuItem disabled><ListItemIcon><AccountCircleOutlined fontSize="small" /></ListItemIcon>Profile</MenuItem>
          <MenuItem disabled={role !== 'admin'} onClick={() => { onRoute('settings'); setAccountAnchor(null); }}><ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>System settings</MenuItem>
          <Divider />
          <MenuItem onClick={onLogout}><ListItemIcon><Logout fontSize="small" /></ListItemIcon>Sign out</MenuItem>
        </Menu>
      </Toolbar>
      <Box sx={{ bgcolor: '#f8fafb', borderTop: '1px solid', borderColor: '#edf0f2' }}><Box sx={{ maxWidth: 1600, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Typography variant="caption" color="text.secondary" fontWeight={600}>{context}</Typography><Typography variant="caption" color="text.secondary">School year 2026–2027</Typography></Box></Box>
    </AppBar>
    <Drawer anchor="left" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ '& .MuiDrawer-paper': { width: 280 } }}><Box sx={{ p: 2.5 }}><Typography fontWeight={750}>TALA-AI</Typography><Typography variant="caption" color="text.secondary">{context}</Typography></Box><Divider /><List sx={{ p: 1.5 }}>{navigation.map(item => <ListItemButton key={item.id} selected={route === item.id} onClick={() => { onRoute(item.id); setMobileOpen(false); }} sx={{ borderRadius: 1, mb: .5 }}><ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} /></ListItemButton>)}</List></Drawer>
    <Box component="main"><Box sx={{ width: '100%', maxWidth: 1480, mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2.5, sm: 3.5 } }}>{children}</Box></Box>
  </Box>;
}
