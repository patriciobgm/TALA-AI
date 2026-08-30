import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Divider, Stack, Typography } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { api } from '../api/client';
import type { MaterialAnalytics } from '../api/types';
import { TeacherOverview } from './TeacherOverview';
import { useTeachingScope } from '../components/TeachingScopeContext';

type Props = { onLearners: () => void; onAssessments: () => void; onReports: () => void; onLearner: (id: number) => void };

export function TeacherOverviewPage(props: Props) {
  const [analytics, setAnalytics] = useState<MaterialAnalytics | null>(null);
  const [error, setError] = useState('');
  const scope = useTeachingScope();
  useEffect(() => { if (!scope?.selectedSubjectId) return; setAnalytics(null); api<MaterialAnalytics>(`/dashboard/teacher/materials/?subject=${scope.selectedSubjectId}`).then(setAnalytics).catch(reason => setError(reason.message)); }, [scope?.selectedSubjectId]);
  return <>
    <TeacherOverview {...props} />
    <Card sx={{ mt: 3 }}>
      <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}><Box><Typography variant="h2">Learning Material Engagement</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Module reading, video progress, completion, and quiz outcomes for your assignments.</Typography></Box><Button onClick={props.onReports} endIcon={<ArrowForward />}>Open Analytics</Button></Box>
      <Divider sx={{ borderColor: '#e1e6eb' }} />
      {error ? <Alert severity="warning" sx={{ m: 2 }}>{error}</Alert> : <Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: { xs: 2, md: 0 } }}>{[['Materials', analytics?.summary.materials ?? 0], ['Learner Assignments', analytics?.summary.assigned_learners ?? 0], ['Currently Reading', analytics?.summary.in_progress ?? 0], ['Completed', analytics?.summary.completed ?? 0], ['Quiz Passed', analytics?.summary.quiz_passed ?? 0]].map(([label, value], index) => <Box key={label} sx={{ px: { md: index === 0 ? 0 : 3 }, borderLeft: { md: index > 0 ? '1px solid #e1e6eb' : 0 } }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontSize: 22, fontWeight: 750 }}>{value}</Typography></Box>)}</Box>}
      {analytics?.materials.length ? <><Divider sx={{ borderColor: '#e1e6eb' }} /><Stack divider={<Divider sx={{ borderColor: '#e1e6eb' }} />}>{analytics.materials.slice(0, 3).map(item => <Box key={item.id} sx={{ px: 2.5, py: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 1fr) repeat(3, 100px)' }, gap: 2 }}><Typography variant="body2" fontWeight={700}>{item.title}</Typography><Box><Typography variant="caption" color="text.secondary">Reading</Typography><Typography variant="body2" fontWeight={700}>{item.in_progress}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Completed</Typography><Typography variant="body2" fontWeight={700}>{item.completed}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Quiz Average</Typography><Typography variant="body2" fontWeight={700}>{item.average_quiz_score === null ? '—' : `${item.average_quiz_score}%`}</Typography></Box></Box>)}</Stack></> : null}
    </Card>
  </>;
}
