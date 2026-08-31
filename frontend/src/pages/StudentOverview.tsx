import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import { ArrowForward, AssignmentOutlined, CheckCircle, PlayArrow } from '@mui/icons-material';
import { PageHeader } from '../components/PageHeader';
import { Metric } from '../components/Metric';
import { StatusChip } from '../components/StatusChip';
import { api } from '../api/client';
import type { StudentDashboardData } from '../api/types';
import { useStudentScope } from '../components/StudentScopeContext';
import { EnrollmentPanel } from '../components/EnrollmentPanel';

export function StudentOverview({ onContinue, onAssessments, onMaterials }: { onContinue: () => void; onAssessments: () => void; onMaterials: () => void }) {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [error, setError] = useState('');
  const scope = useStudentScope();
  const load = useCallback(() => { if (!scope?.selectedSubjectId) return; setData(null); setError(''); api<StudentDashboardData>(`/dashboard/student/?subject=${scope.selectedSubjectId}`).then(setData).catch(reason => setError(reason.message)); }, [scope?.selectedSubjectId]);
  useEffect(() => { load(); }, [load]);
  if (scope && !scope.loading && !scope.selectedSubjectId) return <><PageHeader title="My Academic Recovery" /><EnrollmentPanel role="student" /><Alert severity="info">No subject with assigned learning work is available yet.</Alert></>;
  if (!data && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (error) return <><PageHeader title="My academic recovery" /><Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert></>;

  const plan = data!.plans.find(item => item.status === 'active');
  const completed = plan?.activities.filter(item => item.completed_at).length ?? 0;
  const progress = plan?.activities.length ? Math.round(completed / plan.activities.length * 100) : 0;
  const firstAttempt = data!.attempts[0];
  const latestAttempt = data!.attempts.at(-1);
  const improvement = firstAttempt && latestAttempt ? Math.round(Number(latestAttempt.score) - Number(firstAttempt.score)) : 0;
  const latestResults = latestAttempt?.competency_results ?? [];

  return <>
    <PageHeader title="My academic recovery" description="Continue your plan and track your competency progress." />
    {data!.academic_class?.class_code && <Alert severity="info" sx={{ mb: 3 }}><strong>{data!.academic_class.subject_name}</strong> enrollment code <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 800, ml: .5 }}>{data!.academic_class.class_code}</Box>.</Alert>}
    {data!.pending_diagnostic && <Card sx={{ mb: 3, p: { xs: 2.5, sm: 3 }, border: '2px solid', borderColor: 'primary.main', bgcolor: '#f5faff' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2.5} alignItems={{ sm: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', flexShrink: 0 }}><AssignmentOutlined /></Box>
        <Box sx={{ flex: 1 }}><Typography variant="overline" color="primary.main" fontWeight={800}>{data!.pending_diagnostic.remaining_prerequisites ? 'Learning materials required first' : 'Required diagnostic'}</Typography><Typography variant="h2">{data!.pending_diagnostic.remaining_prerequisites ? `${data!.pending_diagnostic.remaining_prerequisites} material${data!.pending_diagnostic.remaining_prerequisites === 1 ? '' : 's'} before ${data!.pending_diagnostic.title}` : data!.pending_diagnostic.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{data!.pending_diagnostic.remaining_prerequisites ? data!.pending_diagnostic.prerequisite_titles.join(' · ') : `Answer ${data!.pending_diagnostic.question_count} questions so TALA can identify which competencies need support and prepare the correct recovery plan.`}</Typography></Box>
        <Button variant="contained" size="large" endIcon={<ArrowForward />} onClick={data!.pending_diagnostic.remaining_prerequisites ? onMaterials : onAssessments}>{data!.pending_diagnostic.remaining_prerequisites ? 'Complete materials' : 'Take diagnostic'}</Button>
      </Stack>
    </Card>}
    <EnrollmentPanel role="student" compact />
    {plan ? <Card sx={{ mb: 3, overflow: 'hidden' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.5fr) minmax(320px, .7fr)' } }}>
        <Box sx={{ p: { xs: 2.5, sm: 3 } }}><Typography variant="overline" color="text.secondary" fontWeight={700}>Current recovery plan</Typography><Typography variant="h2" sx={{ mt: .5 }}>{plan.competency_title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>Complete the approved activities in order, then take the mastery check.</Typography><Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><LinearProgress variant="determinate" value={progress} sx={{ flex: 1, maxWidth: 440, height: 8, borderRadius: 3, bgcolor: '#e6ebef' }} /><Typography variant="body2" fontWeight={700}>{progress}%</Typography></Box><Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 3 }}><Button variant="contained" startIcon={<PlayArrow />} onClick={onContinue}>Continue recovery plan</Button></Stack></Box>
        <Box sx={{ bgcolor: '#f8fafb', p: { xs: 2.5, sm: 3 }, borderLeft: { md: '1px solid #dce2e8' }, borderTop: { xs: '1px solid #dce2e8', md: 0 } }}><Typography variant="h3">Next activity</Typography><Typography variant="body2" fontWeight={650} sx={{ mt: 2 }}>{plan.activities.find(item => !item.completed_at)?.title ?? 'Recovery plan complete'}</Typography><Typography variant="caption" color="text.secondary">{completed} of {plan.activities.length} activities completed</Typography><Divider sx={{ my: 2 }} /><Typography variant="caption" color="text.secondary">Mastery target</Typography><Typography variant="body2" fontWeight={650} sx={{ mt: .25 }}>75% or higher</Typography></Box>
      </Box>
    </Card> : <Alert severity="info" sx={{ mb: 3 }} action={<Button onClick={onAssessments}>View assessments</Button>}>No active recovery plan. Complete an assigned diagnostic assessment to identify learning gaps.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' }, gap: 3 }}>
      <Card sx={{ p: 2.5 }}><Typography variant="h2">Progress summary</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4,1fr)' }, gap: 2, mt: 2.5 }}><Metric label="Mastered" value={`${data!.mastered} / ${data!.total_competencies}`} detail="competencies" /><Metric label="Baseline" value={firstAttempt ? `${Math.round(Number(firstAttempt.score))}%` : '—'} /><Metric label="Current" value={latestAttempt ? `${Math.round(Number(latestAttempt.score))}%` : '—'} /><Metric label="Improvement" value={data!.attempts.length > 1 ? `${improvement >= 0 ? '+' : ''}${improvement} pp` : '—'} detail="percentage points" /></Box><Divider sx={{ my: 3 }} /><Typography variant="h3">Latest competency results</Typography>{latestResults.length ? <Stack sx={{ mt: 1 }} divider={<Divider />}>{latestResults.map(result => <Box key={result.id} sx={{ py: 1.5, display: 'flex', gap: 1.5, alignItems: 'center' }}><CheckCircle sx={{ fontSize: 20, color: result.status === 'mastered' ? 'success.main' : result.status === 'developing' ? 'warning.main' : 'error.main' }} /><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{result.competency_title}</Typography><Typography variant="caption" color="text.secondary">{Math.round(Number(result.score))}%</Typography></Box><StatusChip label={result.status === 'mastered' ? 'Mastered' : result.status === 'developing' ? 'Developing' : 'Needs remediation'} /></Box>)}</Stack> : <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No submitted assessment results yet.</Typography>}</Card>
      <Card sx={{ p: 2.5 }}><Typography variant="h2">Assessments</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Complete assigned diagnostic and mastery assessments from the assessment workspace.</Typography><Button endIcon={<ArrowForward />} sx={{ mt: 2, px: 0 }} onClick={onAssessments}>View assessments</Button></Card>
    </Box>
  </>;
}
