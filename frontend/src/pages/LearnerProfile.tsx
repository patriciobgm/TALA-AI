import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, CheckCircleOutline, EditOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { LearnerDetail } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

export function LearnerProfile({ learnerId, onBack }: { learnerId: number; onBack: () => void }) {
  const [data, setData] = useState<LearnerDetail | null>(null);
  const [showIntervention, setShowIntervention] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [insightVisible, setInsightVisible] = useState(true);
  const [action, setAction] = useState('resource');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api<LearnerDetail>(`/dashboard/teacher/learners/${learnerId}/`).then(setData).catch(reason => setError(reason.message)), [learnerId]);
  useEffect(() => { void load(); }, [load]);
  if (!data && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!data) return <><Button startIcon={<ArrowBack />} onClick={onBack}>Back</Button><Alert severity="error" sx={{ mt: 2 }}>{error}</Alert></>;

  const latestAttempt = data.attempts.at(-1);
  const baseline = data.attempts[0];
  const results = latestAttempt?.competency_results ?? [];
  const plan = data.plans.find(item => item.status === 'active') ?? data.plans[0];
  const activeGaps = data.plans.filter(item => item.status === 'active').length;
  const learnerStatus = activeGaps >= 3 ? 'Intervention' : activeGaps ? 'Monitor' : 'On track';
  const saveIntervention = async () => {
    setError('');
    try { await api('/interventions/', { method: 'POST', body: JSON.stringify({ student: learnerId, action, note }) }); setShowIntervention(false); setSaved(true); setNote(''); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save intervention.'); }
  };

  return <>
    <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 1.5, px: 0 }}>Back to learners</Button>
    <PageHeader title={data.student.name} description={`${data.student.section} · ${data.student.email}`} action={<Stack direction="row" gap={1}><StatusChip label={learnerStatus} size="medium" /><Button variant="contained" onClick={() => { setSaved(false); setShowIntervention(true); }}>Add intervention</Button></Stack>} />
    {saved && <Alert severity="success" sx={{ mb: 3 }}>Intervention saved to the learner’s recovery history.</Alert>}
    {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 380px' }, gap: 3, alignItems: 'start' }}>
      <Stack gap={3}>
        <Card sx={{ p: 2.5 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}><Box><Typography variant="h2">Competency results</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{latestAttempt ? `Latest assessment · ${new Date(latestAttempt.submitted_at).toLocaleDateString()}` : 'No submitted assessment'}</Typography></Box><Button size="small" disabled={!data.attempts.length} onClick={() => setShowHistory(value => !value)}>{showHistory ? 'Hide history' : 'View history'}</Button></Box>{showHistory && <Alert severity="info" sx={{ mb: 2 }}>Assessment history: {data.attempts.map(attempt => `${Math.round(Number(attempt.score))}%`).join(' → ')}</Alert>}{results.length ? <Stack divider={<Divider />}>{results.map(result => { const score = Math.round(Number(result.score)); const label = result.status === 'mastered' ? 'Mastered' : result.status === 'developing' ? 'Developing' : 'Needs remediation'; return <Box key={result.id} sx={{ py: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 1fr) 160px 140px' }, alignItems: 'center', gap: 2 }}><Typography variant="body2" fontWeight={600}>{result.competency_title}</Typography><Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1 }}><LinearProgress variant="determinate" value={score} sx={{ flex: 1, height: 6, bgcolor: '#e8edf1', '& .MuiLinearProgress-bar': { bgcolor: score >= 75 ? 'success.main' : score >= 50 ? 'warning.main' : 'error.main' } }} /><Typography variant="body2" sx={{ width: 34 }}>{score}%</Typography></Box><StatusChip label={label} /></Box>; })}</Stack> : <Typography variant="body2" color="text.secondary">No competency results are available.</Typography>}</Card>
        {plan && <Card><Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography variant="h2">Current recovery plan</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{plan.competency_title}</Typography></Box><Button startIcon={<EditOutlined />} size="small" onClick={() => { setAction('resource'); setShowIntervention(true); }}>Modify plan</Button></Box><Divider /><Stack divider={<Divider />}>{plan.activities.map(activity => <Box key={activity.id} sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'center' }}><CheckCircleOutline sx={{ fontSize: 19, color: activity.completed_at ? 'success.main' : 'text.disabled' }} /><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{activity.title}</Typography><Typography variant="caption" color="text.secondary">{activity.resource_type ?? 'Assessment'}</Typography></Box><Typography variant="caption" color="text.secondary">{activity.completed_at ? 'Completed' : 'Not completed'}</Typography></Box>)}</Stack></Card>}
      </Stack>
      <Stack gap={3}>
        <Card sx={{ p: 2.5 }}><Typography variant="h2">Performance change</Typography><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2.5 }}><Box><Typography variant="caption" color="text.secondary">Baseline</Typography><Typography sx={{ fontSize: 24, fontWeight: 700 }}>{baseline ? `${Math.round(Number(baseline.score))}%` : '—'}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Current</Typography><Typography sx={{ fontSize: 24, fontWeight: 700 }}>{latestAttempt ? `${Math.round(Number(latestAttempt.score))}%` : '—'}</Typography></Box></Box><Divider sx={{ my: 2 }} /><Typography variant="body2" color="text.secondary">{data.attempts.length > 1 ? `${Number(latestAttempt!.score) - Number(baseline!.score) >= 0 ? '+' : ''}${Math.round(Number(latestAttempt!.score) - Number(baseline!.score))} percentage points` : 'Complete a reassessment to measure improvement.'}</Typography></Card>
        {insightVisible && activeGaps > 0 && <Card sx={{ p: 2.5, borderLeft: '3px solid #2563a6' }}><Typography variant="overline" color="primary.main" fontWeight={800}>System recommendation</Typography><Typography variant="body2" sx={{ mt: 1 }}>This learner has {activeGaps} active learning {activeGaps === 1 ? 'gap' : 'gaps'} below the configured mastery threshold.</Typography><Divider sx={{ my: 2 }} /><Typography variant="body2" fontWeight={700}>Suggested teacher action</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Review the current recovery activities and assign an approved prerequisite resource before reassessment.</Typography><Stack direction="row" gap={1} sx={{ mt: 2 }}><Button variant="contained" size="small" onClick={() => setShowIntervention(true)}>Use suggestion</Button><Button size="small" onClick={() => setInsightVisible(false)}>Dismiss</Button></Stack></Card>}
        {showIntervention && <Card component="form" onSubmit={event => { event.preventDefault(); void saveIntervention(); }} sx={{ p: 2.5 }}><Typography variant="h2">Add intervention</Typography><Stack gap={2} sx={{ mt: 2 }}><TextField select label="Action" size="small" value={action} onChange={event => setAction(event.target.value)}><MenuItem value="resource">Assign learning resource</MenuItem><MenuItem value="activity">Assign another activity</MenuItem><MenuItem value="reassess">Schedule reassessment</MenuItem><MenuItem value="monitor">Mark for monitoring</MenuItem></TextField><TextField label="Teacher note" value={note} onChange={event => setNote(event.target.value)} multiline minRows={3} placeholder="Explain the intervention and what to review." required /><Stack direction="row" gap={1} justifyContent="flex-end"><Button onClick={() => setShowIntervention(false)}>Cancel</Button><Button type="submit" variant="contained">Save intervention</Button></Stack></Stack></Card>}
        {data.interventions.length > 0 && <Card sx={{ p: 2.5 }}><Typography variant="h2">Intervention history</Typography><Stack divider={<Divider />} sx={{ mt: 1 }}>{data.interventions.map(item => <Box key={item.id} sx={{ py: 1.5 }}><Typography variant="body2" fontWeight={650}>{item.action.replaceAll('_', ' ')}</Typography><Typography variant="body2" color="text.secondary">{item.note}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.created_at).toLocaleString()}</Typography></Box>)}</Stack></Card>}
      </Stack>
    </Box>
  </>;
}
