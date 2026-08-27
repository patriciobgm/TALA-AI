import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import { ArrowForward, CheckCircleOutline, ScheduleOutlined, WarningAmberOutlined } from '@mui/icons-material';
import { PageHeader } from '../components/PageHeader';
import { api } from '../api/client';
import type { ApiLearner } from '../api/types';

export function TeacherOverview({ onLearners, onAssessments, onReports, onLearner }: { onLearners: () => void; onAssessments: () => void; onReports: () => void; onLearner: (id: number) => void }) {
  const [learners, setLearners] = useState<ApiLearner[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<ApiLearner[]>('/dashboard/teacher/learners/').then(setLearners).catch(reason => setError(reason.message)); }, []);
  if (!learners && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  const flagged = (learners ?? []).filter(item => item.status !== 'On track').sort((a, b) => b.gaps - a.gaps);
  const diagnosticCompletion = learners?.length ? Math.round(learners.filter(item => item.assessment !== null).length / learners.length * 100) : 0;
  const mastery = learners?.length ? Math.round(learners.filter(item => (item.assessment ?? 0) >= 75).length / learners.length * 100) : 0;
  return <>
    <PageHeader title="Recovery workspace" description="Review where assigned learners need attention today." action={<Button variant="outlined" onClick={onReports}>Open class report</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box sx={{ bgcolor: '#173f63', color: '#fff', borderRadius: 1.5, p: { xs: 2.5, md: 3 }, mb: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' }, gap: 3, alignItems: 'center' }}>
      <Box><Typography variant="overline" sx={{ color: 'rgba(255,255,255,.7)', fontWeight: 700 }}>Current recovery cycle</Typography><Typography variant="h2" sx={{ mt: .5, color: '#fff' }}>Operations on fractions</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,.76)', mt: .75 }}>{learners?.filter(item => item.assessment !== null).length ?? 0} of {learners?.length ?? 0} learners have submitted an assessment. {flagged.length} require monitoring or intervention.</Typography></Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button variant="contained" onClick={onLearners} sx={{ bgcolor: '#fff', color: '#173f63', '&:hover': { bgcolor: '#edf3f7' } }}>Review flagged learners</Button><Button variant="outlined" onClick={onAssessments} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.45)', '&:hover': { borderColor: '#fff' } }}>Manage assessment</Button></Stack>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.3fr) minmax(340px, .7fr)' }, gap: 3 }}>
      <Card sx={{ overflow: 'hidden' }}><Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography variant="h2">Intervention queue</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>Ordered by urgency and recent activity.</Typography></Box><Button onClick={onLearners} endIcon={<ArrowForward />}>View all</Button></Box><Divider />
        {flagged.length ? flagged.slice(0, 4).map(item => <Box key={item.id} sx={{ px: 2.5, py: 2, display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', gap: 1.5, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}><Box sx={{ color: item.status === 'Intervention' ? 'error.main' : 'warning.main', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{item.status === 'Intervention' ? <WarningAmberOutlined /> : <ScheduleOutlined />}</Box><Box><Typography variant="body2" fontWeight={650}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.gaps} active learning {item.gaps === 1 ? 'gap' : 'gaps'} · {item.progress}% plan progress</Typography></Box><Button size="small" onClick={() => onLearner(item.id)}>Review</Button></Box>) : <Box sx={{ p: 3 }}><Typography variant="body2" color="text.secondary">No learners currently require intervention.</Typography></Box>}
      </Card>
      <Stack gap={3}>
        <Card sx={{ p: 2.5 }}><Typography variant="h2">Cycle progress</Typography><Box sx={{ mt: 2.5 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="text.secondary">Assessment completion</Typography><Typography variant="body2" fontWeight={700}>{diagnosticCompletion}%</Typography></Box><LinearProgress variant="determinate" value={diagnosticCompletion} sx={{ height: 7, borderRadius: 1 }} /></Box><Box sx={{ mt: 2.5 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="body2" color="text.secondary">Latest assessment mastery</Typography><Typography variant="body2" fontWeight={700}>{mastery}%</Typography></Box><LinearProgress color="success" variant="determinate" value={mastery} sx={{ height: 7, borderRadius: 1 }} /></Box></Card>
        <Card sx={{ p: 2.5 }}><Typography variant="h2">Recent movement</Typography><Box sx={{ py: 2 }}><CheckCircleOutline sx={{ fontSize: 19, color: 'text.disabled', mb: 1 }} /><Typography variant="body2" color="text.secondary">New mastery events will appear after learners submit reassessments.</Typography></Box></Card>
      </Stack>
    </Box>
  </>;
}
