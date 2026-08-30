import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { ArrowForward, WarningAmberOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

type Overview = {
  active_accounts: number; students: number; teachers: number; classes: number; subjects: number; competencies: number;
  approved_resources: number; pending_resources: number; failed_imports: number; unassigned_students: number;
  unassigned_teachers: number; pending_consents: number; active_learning_assignments: number;
  recent_imports: { id: number; title: string; kind: string; status: string; uploaded_by: string; created_at: string }[];
};
type Props = { onUsers: () => void; onCurriculum: () => void; onContent: () => void; onSettings: () => void };

export function AdminOverview({ onUsers, onCurriculum, onContent, onSettings }: Props) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Overview>('/dashboard/admin/').then(setData).catch(reason => setError(reason.message)); }, []);
  if (!data && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  const attention = data ? [
    { label: 'Content Awaiting Review', count: data.pending_resources, detail: 'Verify extracted questions, source documents, and assignments.', action: 'Review Content', onClick: onContent },
    { label: 'Failed Content Imports', count: data.failed_imports, detail: 'Inspect extraction errors and help uploaders retry.', action: 'Inspect Issues', onClick: onContent },
    { label: 'Students Without a Class', count: data.unassigned_students, detail: 'Assign a year and section before learning content can be delivered.', action: 'Manage Students', onClick: onUsers },
    { label: 'Teachers Without Subject Scope', count: data.unassigned_teachers, detail: 'Assign subjects; matching grade-level classes are granted automatically.', action: 'Manage Teachers', onClick: onUsers },
  ].filter(item => item.count > 0) : [];
  return <>
    <PageHeader title="System Overview" description="Resolve operational issues affecting access, curriculum, content publication, and learner delivery." action={<Button variant="outlined" onClick={onSettings}>System Settings</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {data && <>
      <Card sx={{ mb: 3, p: 2.5 }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 2, lg: 0 } }}>{[
        ['Active Accounts', data.active_accounts, `${data.students} students · ${data.teachers} teachers`],
        ['Academic Structure', data.classes, `${data.subjects} subjects · ${data.competencies} competencies`],
        ['Approved Content', data.approved_resources, `${data.active_learning_assignments} active assignments`],
        ['Requires Attention', attention.reduce((sum, item) => sum + item.count, 0), `${data.pending_consents} consent requests pending`],
      ].map(([label, value, detail], index) => <Box key={label} sx={{ px: { lg: index === 0 ? 0 : 3 }, borderLeft: { lg: index > 0 ? '1px solid #e1e6eb' : 0 } }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontSize: 26, fontWeight: 750, mt: .25 }}>{value}</Typography><Typography variant="caption" color="text.secondary">{detail}</Typography></Box>)}</Box></Card>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(340px, .8fr)' }, gap: 3, alignItems: 'start' }}>
        <Card><Box sx={{ p: 2.5 }}><Typography variant="h2">Administrative Attention Queue</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Items that can prevent staff or learners from completing their work.</Typography></Box><Divider />{attention.length ? <Stack divider={<Divider />}>{attention.map(item => <Box key={item.label} sx={{ p: 2.5, display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', gap: 1.5, alignItems: 'center' }}><WarningAmberOutlined color="warning" fontSize="small" /><Box><Typography variant="body2" fontWeight={700}>{item.count} {item.label}</Typography><Typography variant="caption" color="text.secondary">{item.detail}</Typography></Box><Button size="small" onClick={item.onClick} endIcon={<ArrowForward />}>{item.action}</Button></Box>)}</Stack> : <Alert severity="success" sx={{ m: 2 }}>No unresolved administrative items were detected.</Alert>}</Card>
        <Stack gap={3}>
          <Card><Box sx={{ p: 2.5 }}><Typography variant="h2">Recent Content Activity</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Latest submissions across the governed content library.</Typography></Box><Divider /><Stack divider={<Divider />}>{data.recent_imports.map(item => <Box key={item.id} sx={{ px: 2.5, py: 1.5 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}><Typography variant="body2" fontWeight={700}>{item.title}</Typography><StatusChip label={item.status.replace('_', ' ')} /></Box><Typography variant="caption" color="text.secondary">{item.uploaded_by} · {item.kind} · {new Date(item.created_at).toLocaleDateString()}</Typography></Box>)}</Stack><Divider /><Button fullWidth onClick={onContent}>Open Content Governance</Button></Card>
          <Card sx={{ p: 2.5 }}><Typography variant="h2">Common Administration</Typography><Stack gap={1} sx={{ mt: 1.5 }}><Button variant="outlined" onClick={onUsers}>Manage Users & Security</Button><Button variant="outlined" onClick={onCurriculum}>Manage Subjects</Button><Button variant="outlined" onClick={onSettings}>Check System Services</Button></Stack></Card>
        </Stack>
      </Box>
    </>}
  </>;
}
