import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, FormControlLabel, List, ListItemButton, ListItemText, Stack, Switch, Typography } from '@mui/material';
import { DoneAllOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiNotification } from '../api/types';
import { PageHeader } from '../components/PageHeader';

type Preferences = { in_app_enabled: boolean; email_enabled: boolean; push_enabled: boolean; reminders_enabled: boolean; quiet_hours_start: string | null; quiet_hours_end: string | null };
const defaults: Preferences = { in_app_enabled: true, email_enabled: false, push_enabled: true, reminders_enabled: true, quiet_hours_start: null, quiet_hours_end: null };

export function NotificationsPage({ onOpenUrl }: { onOpenUrl: (url: string) => void }) {
  const [items, setItems] = useState<ApiNotification[] | null>(null);
  const [preferences, setPreferences] = useState(defaults);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = () => Promise.all([
    api<ApiNotification[] | { results?: ApiNotification[] }>('/notifications/'),
    api<Preferences>('/notification-preferences/'),
  ]).then(([result, found]) => { setItems(Array.isArray(result) ? result : result.results ?? []); setPreferences(found); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);

  const markAllRead = async () => {
    await api('/notifications/read-all/', { method: 'POST' });
    setItems(current => current?.map(item => ({ ...item, is_read: true })) ?? []);
  };
  const openNotification = async (item: ApiNotification) => {
    if (!item.is_read) {
      await api(`/notifications/${item.id}/read/`, { method: 'POST' });
      setItems(current => current?.map(found => found.id === item.id ? { ...found, is_read: true } : found) ?? []);
    }
    if (item.action_url) onOpenUrl(item.action_url);
  };
  const savePreferences = async () => {
    try {
      const updated = await api<Preferences>('/notification-preferences/', { method: 'PATCH', body: JSON.stringify(preferences) });
      setPreferences(updated); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save notification preferences.'); }
  };

  if (!items && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  return <>
    <PageHeader title="Notifications" description="Progress updates, assigned work, and recovery reminders." action={<Button startIcon={<DoneAllOutlined />} disabled={!items?.some(item => !item.is_read)} onClick={markAllRead}>Mark all read</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {saved && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaved(false)}>Notification preferences saved.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
      <Card>
        {items?.length ? <List disablePadding>{items.map((item, index) => <Box key={item.id}><ListItemButton onClick={() => void openNotification(item)} sx={{ px: 2.5, py: 2, alignItems: 'flex-start', bgcolor: item.is_read ? 'transparent' : '#f2f7fa' }}><Box aria-hidden sx={{ width: 8, height: 8, mt: .8, mr: 1.5, borderRadius: '50%', bgcolor: item.is_read ? 'transparent' : 'primary.main' }} /><ListItemText primary={<Typography variant="body2" fontWeight={item.is_read ? 600 : 750}>{item.title}</Typography>} secondary={<><Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: .5 }}>{item.message}</Typography><Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: .75 }}>{new Date(item.created_at).toLocaleString()}</Typography></>} /></ListItemButton>{index < items.length - 1 && <Divider />}</Box>)}</List> : <Box sx={{ p: 5, textAlign: 'center' }}><Typography fontWeight={700}>No notifications</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Progress updates and reminders will appear here.</Typography></Box>}
      </Card>
      <Card sx={{ p: 2.5 }}><Typography variant="h2">Preferences</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2 }}>Choose which updates can be delivered outside the app.</Typography><Stack><FormControlLabel control={<Switch checked={preferences.reminders_enabled} onChange={event => setPreferences(current => ({ ...current, reminders_enabled: event.target.checked }))} />} label="Activity reminders" /><FormControlLabel control={<Switch checked={preferences.email_enabled} onChange={event => setPreferences(current => ({ ...current, email_enabled: event.target.checked }))} />} label="Email notifications" /><FormControlLabel control={<Switch checked={preferences.push_enabled} onChange={event => setPreferences(current => ({ ...current, push_enabled: event.target.checked }))} />} label="Mobile push notifications" /></Stack><Button variant="outlined" fullWidth sx={{ mt: 2 }} onClick={savePreferences}>Save preferences</Button></Card>
    </Box>
  </>;
}
