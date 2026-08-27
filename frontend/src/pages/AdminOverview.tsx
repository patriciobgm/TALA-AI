import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { Metric } from '../components/Metric';
import { StatusChip } from '../components/StatusChip';

type Overview = { active_accounts: number; students: number; teachers: number; classes: number; subjects: number; competencies: number; approved_resources: number; pending_resources: number };

export function AdminOverview({ onSettings }: { onSettings: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Overview>('/dashboard/admin/').then(setData).catch(reason => setError(reason.message)); }, []);
  if (!data && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  return <><PageHeader title="System overview" description="Manage access, curriculum structure, and recovery rules." action={<Button variant="outlined" onClick={onSettings}>Review settings</Button>} />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{data && <><Card sx={{ p: 2.5, mb: 3 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}><Metric label="Active accounts" value={data.active_accounts} detail={`${data.students} students · ${data.teachers} teachers`} /><Metric label="Classes" value={data.classes} detail="With assigned students" /><Metric label="Subjects" value={data.subjects} detail={`${data.competencies} competencies`} /><Metric label="Approved resources" value={data.approved_resources} detail={`${data.pending_resources} awaiting approval`} /></Box></Card><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}><Card sx={{ p: 2.5 }}><Typography variant="h2">Configuration status</Typography><Stack divider={<Divider />} sx={{ mt: 1 }}><Box sx={{ py: 1.5, display: 'flex', justifyContent: 'space-between' }}><Box><Typography variant="body2" fontWeight={650}>Mastery classification</Typography><Typography variant="caption" color="text.secondary">Deterministic competency thresholds</Typography></Box><StatusChip label="Active" /></Box><Box sx={{ py: 1.5, display: 'flex', justifyContent: 'space-between' }}><Box><Typography variant="body2" fontWeight={650}>Approved retrieval content</Typography><Typography variant="caption" color="text.secondary">{data.approved_resources} indexed curriculum records</Typography></Box><StatusChip label="Active" /></Box></Stack></Card><Card sx={{ p: 2.5 }}><Typography variant="h2">Deployment note</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>The local Llama provider is configured through backend environment variables. Its live availability is shown under System Settings.</Typography><Button onClick={onSettings} sx={{ mt: 1, px: 0 }}>Open system settings</Button></Card></Box></>}</>;
}
