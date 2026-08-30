import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, CheckCircleOutline, EditOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { CompetencyResult, LearnerDetail, LearnerEvidence, LearningRecommendation } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { LearningRecommendations } from '../components/LearningRecommendations';
import { useTeachingScope } from '../components/TeachingScopeContext';

export function LearnerProfile({ learnerId, onBack }: { learnerId: number; onBack: () => void }) {
  const [data, setData] = useState<LearnerDetail | null>(null);
  const [showIntervention, setShowIntervention] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [action, setAction] = useState('guided_practice');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [consentBusy, setConsentBusy] = useState<number | null>(null);
  const [aiInsight, setAiInsight] = useState('');
  const [aiRecommendation, setAiRecommendation] = useState<{ action: string; note: string; competency: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [recommendationBusy, setRecommendationBusy] = useState('');
  const scope = useTeachingScope();
  const subjectQuery = scope?.selectedSubjectId ? `?subject=${scope.selectedSubjectId}` : '';
  const load = useCallback(() => api<LearnerDetail>(`/dashboard/teacher/learners/${learnerId}/${subjectQuery}`).then(setData).catch(reason => setError(reason.message)), [learnerId, subjectQuery]);
  useEffect(() => { void load(); }, [load]);
  if (!data && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!data) return <><Button startIcon={<ArrowBack />} onClick={onBack}>Back</Button><Alert severity="error" sx={{ mt: 2 }}>{error}</Alert></>;

  const latestAttempt = data.attempts.at(-1);
  const baseline = data.attempts[0];
  const resultsByCompetency = new Map<number, CompetencyResult>();
  data.attempts.forEach(attempt => attempt.competency_results.forEach(result => resultsByCompetency.set(result.competency, result)));
  const results = [...resultsByCompetency.values()];
  const resultGroups = results.reduce<Record<string, CompetencyResult[]>>((groups, result) => {
    (groups[result.subject_name] ??= []).push(result);
    return groups;
  }, {});
  const evidenceGroups = data.evidence.reduce<Record<string, LearnerEvidence[]>>((groups, evidence) => {
    (groups[evidence.subject_name] ??= []).push(evidence);
    return groups;
  }, {});
  const plan = data.plans.find(item => item.status === 'active') ?? data.plans[0];
  const activeGaps = data.plans.filter(item => item.status === 'active').length;
  const learnerStatus = activeGaps >= 3 ? 'Intervention' : activeGaps ? 'Monitor' : 'On track';
  const openIntervention = (prefill?: { action: string; note: string }) => { setSuccessMessage(''); setAction(prefill?.action ?? 'guided_practice'); setNote(prefill?.note ?? ''); setShowIntervention(true); };
  const saveIntervention = async () => {
    setError('');
    try { await api('/interventions/', { method: 'POST', body: JSON.stringify({ student: learnerId, action, note }) }); setShowIntervention(false); setSuccessMessage('Intervention saved to the learner’s recovery history.'); setNote(''); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save intervention.'); }
  };
  const requestConsent = async (assessmentId: number) => {
    const guardian = data.guardians.find(item => item.email);
    if (!guardian) { setError('Add a parent or legal guardian with an email address before requesting consent.'); return; }
    setConsentBusy(assessmentId); setError('');
    try { await api(`/assessments/${assessmentId}/request-consent/`, { method: 'POST', body: JSON.stringify({ student: learnerId, guardian_id: guardian.id }) }); setSuccessMessage('Parent or guardian consent request sent.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send the consent request.'); }
    finally { setConsentBusy(null); }
  };
  const generateInsight = async () => {
    setAiBusy(true); setError('');
    try { const result = await api<{ insight: string; recommended_action: string; recommended_note: string; priority_competency: string }>(`/tutor/learners/${learnerId}/insight/${subjectQuery}`, { method: 'POST' }); setAiInsight(result.insight); setAiRecommendation({ action: result.recommended_action, note: result.recommended_note, competency: result.priority_competency }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to generate a learner-support insight.'); }
    finally { setAiBusy(false); }
  };
  const decideRecommendation = async (recommendation: LearningRecommendation, decision: 'accepted' | 'dismissed') => {
    const key = `${recommendation.plan}-${recommendation.resource}`;
    setRecommendationBusy(key); setError('');
    try {
      await api(`/dashboard/teacher/learners/${learnerId}/recommendations/`, { method: 'POST', body: JSON.stringify({ plan: recommendation.plan, resource: recommendation.resource, decision }) });
      setSuccessMessage(decision === 'accepted' ? 'Recommended material added to the learner’s recovery plan.' : 'Recommendation dismissed and recorded.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to review this recommendation.'); }
    finally { setRecommendationBusy(''); }
  };

  return <>
    <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 1.5, px: 0 }}>Back to learners</Button>
    <PageHeader title={data.student.name} description={`${data.student.section} · ${data.student.email}`} action={<Stack direction="row" gap={1}><StatusChip label={learnerStatus} size="medium" /><Button variant="contained" onClick={() => openIntervention()}>Record Intervention</Button></Stack>} />
    {successMessage && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
    {data.remedial_exams.length > 0 && <Card sx={{ mb: 3 }}><Box sx={{ p: 2.5 }}><Typography variant="h2">Remedial exam consent</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>A remedial exam remains locked until recovery work is complete and a parent or legal guardian approves it.</Typography></Box><Divider /><Stack divider={<Divider />}>{data.remedial_exams.map(exam => <Box key={exam.id} sx={{ p: 2.5, display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={700}>{exam.title}</Typography><Typography variant="caption" color="text.secondary">{exam.eligible ? 'Recovery requirements completed' : `${exam.remaining_activities} recovery activities remaining`}</Typography>{exam.guardian_name && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Guardian: {exam.guardian_name}{exam.evidence_attached ? ' · Signed document attached' : ''}</Typography>}</Box><StatusChip label={exam.consent_status.replace('_', ' ')} />{exam.consent_status !== 'approved' && <Button variant="outlined" size="small" disabled={!exam.eligible || consentBusy === exam.id} onClick={() => void requestConsent(exam.id)}>{consentBusy === exam.id ? 'Sending…' : exam.consent_status === 'requested' ? 'Resend consent request' : 'Request parent consent'}</Button>}</Box>)}</Stack></Card>}
    <Card sx={{ mb: 3, p: 2.5, borderLeft: '3px solid', borderLeftColor: 'primary.main' }}><Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ lg: 'flex-start' }} gap={2}><Box sx={{ flex: 1 }}><Typography variant="overline" color="primary.main" fontWeight={800}>TALA Decision Support</Typography><Typography variant="h2">Evidence-Grounded Next Step</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>TALA summarizes recorded evidence and proposes a teacher action. Review it before creating an intervention record; it never changes grades or assignments automatically.</Typography>{aiInsight && <Typography variant="body2" sx={{ mt: 2, whiteSpace: 'pre-line', lineHeight: 1.7 }}>{aiInsight}</Typography>}{aiRecommendation && <Box sx={{ mt: 2, p: 2, bgcolor: '#f4f7f9', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography variant="body2" fontWeight={750}>Recommended teacher action{aiRecommendation.competency ? ` · ${aiRecommendation.competency}` : ''}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{aiRecommendation.note}</Typography><Button size="small" variant="contained" sx={{ mt: 1.5 }} onClick={() => openIntervention(aiRecommendation)}>Create Intervention Record</Button></Box>}</Box><Button variant={aiInsight ? 'outlined' : 'contained'} disabled={aiBusy} onClick={() => void generateInsight()}>{aiBusy ? 'Analyzing…' : aiInsight ? 'Refresh Insight' : 'Generate Insight'}</Button></Stack></Card>
    <LearningRecommendations recommendations={data.recommendations} busyKey={recommendationBusy} onDecision={(recommendation, decision) => void decideRecommendation(recommendation, decision)} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 380px' }, gap: 3, alignItems: 'start' }}>
      <Stack gap={3}>
        <Card sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Box><Typography variant="h2">Competency results</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{results.length ? 'Latest result for each competency, grouped by subject.' : 'No submitted assessment'}</Typography></Box>
            <Button size="small" disabled={!data.attempts.length} onClick={() => setShowHistory(value => !value)}>{showHistory ? 'Hide history' : 'View history'}</Button>
          </Box>
          {showHistory && <Alert severity="info" sx={{ mb: 2 }}>Assessment history: {data.attempts.map(attempt => `${Math.round(Number(attempt.score))}%`).join(' → ')}</Alert>}
          {results.length ? <Stack gap={2.5}>{Object.entries(resultGroups).map(([subjectName, subjectResults]) => <Box key={subjectName}><Typography variant="subtitle2" sx={{ mb: .5 }}>{subjectName}</Typography><Stack divider={<Divider />}>{subjectResults.map(result => { const score = Math.round(Number(result.score)); const label = result.status === 'mastered' ? 'Mastered' : result.status === 'developing' ? 'Developing' : 'Needs remediation'; return <Box key={result.id} sx={{ py: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 1fr) 160px 140px' }, alignItems: 'center', gap: 2 }}><Typography variant="body2" fontWeight={600}>{result.competency_title}</Typography><Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1 }}><LinearProgress variant="determinate" value={score} sx={{ flex: 1, height: 6, bgcolor: '#e8edf1', '& .MuiLinearProgress-bar': { bgcolor: score >= 75 ? 'success.main' : score >= 50 ? 'warning.main' : 'error.main' } }} /><Typography variant="body2" sx={{ width: 34 }}>{score}%</Typography></Box><StatusChip label={label} /></Box>; })}</Stack></Box>)}</Stack> : <Typography variant="body2" color="text.secondary">No competency results are available.</Typography>}
        </Card>
        <Card>
          <Box sx={{ p: 2.5 }}><Typography variant="h2">Learning evidence</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Auditable assessment and practice events grouped by subject.</Typography></Box>
          <Divider />
          {data.evidence.length ? <Stack divider={<Divider />}>{Object.entries(evidenceGroups).map(([subjectName, items]) => <Box key={subjectName}><Typography variant="subtitle2" sx={{ px: 2.5, pt: 2, pb: .5 }}>{subjectName}</Typography><Stack divider={<Divider />}>{items.slice(0, 10).map(item => <Box key={item.id} sx={{ px: 2.5, py: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: '140px minmax(0, 1fr) auto' }, gap: 2, alignItems: 'center' }}><Box><Typography variant="caption" color="text.secondary">{item.evidence_type_label}</Typography><Typography variant="body2" fontWeight={700}>{item.competency_title}</Typography></Box><Typography variant="body2" color="text.secondary">{item.summary}</Typography><Box sx={{ textAlign: 'right' }}><Typography variant="body2" fontWeight={750}>{item.score === null ? '—' : `${Math.round(Number(item.score))}%`}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.occurred_at).toLocaleDateString()}</Typography></Box></Box>)}</Stack></Box>)}</Stack> : <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>Evidence will appear after the learner completes new assessments or practice attempts.</Typography>}
        </Card>
        {plan && <Card><Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Box><Typography variant="h2">Current recovery plan</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{plan.competency_title}</Typography></Box><Button startIcon={<EditOutlined />} size="small" onClick={() => openIntervention({ action: 'guided_practice', note: `Review and adjust support for ${plan.competency_title}.` })}>Modify plan</Button></Box><Divider /><Stack divider={<Divider />}>{plan.activities.map(activity => <Box key={activity.id} sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'center' }}><CheckCircleOutline sx={{ fontSize: 19, color: activity.completed_at ? 'success.main' : 'text.disabled' }} /><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{activity.title}</Typography><Typography variant="caption" color="text.secondary">{activity.resource_type ?? 'Assessment'}</Typography></Box><Typography variant="caption" color="text.secondary">{activity.completed_at ? 'Completed' : 'Not completed'}</Typography></Box>)}</Stack></Card>}
      </Stack>
      <Stack gap={3}>
        <Card sx={{ p: 2.5 }}><Typography variant="h2">Performance change</Typography><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2.5 }}><Box><Typography variant="caption" color="text.secondary">Baseline</Typography><Typography sx={{ fontSize: 24, fontWeight: 700 }}>{baseline ? `${Math.round(Number(baseline.score))}%` : '—'}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Current</Typography><Typography sx={{ fontSize: 24, fontWeight: 700 }}>{latestAttempt ? `${Math.round(Number(latestAttempt.score))}%` : '—'}</Typography></Box></Box><Divider sx={{ my: 2 }} /><Typography variant="body2" color="text.secondary">{data.attempts.length > 1 ? `${Number(latestAttempt!.score) - Number(baseline!.score) >= 0 ? '+' : ''}${Math.round(Number(latestAttempt!.score) - Number(baseline!.score))} percentage points` : 'Complete a reassessment to measure improvement.'}</Typography></Card>
        {showIntervention && <Dialog component="form" open onClose={() => setShowIntervention(false)} onSubmit={event => { event.preventDefault(); void saveIntervention(); }} fullWidth maxWidth="sm"><DialogTitle>Record Teacher Intervention</DialogTitle><DialogContent dividers><Alert severity="info" sx={{ mb: 2 }}>This records a planned or completed teacher action in the learner’s history. It does not automatically assign content or schedule an assessment.</Alert><Stack gap={2}><TextField select label="Recorded Action" value={action} onChange={event => setAction(event.target.value)}><MenuItem value="guided_practice">Provide guided practice</MenuItem><MenuItem value="resource_support">Review or assign supporting material</MenuItem><MenuItem value="reassess">Plan a reassessment</MenuItem><MenuItem value="monitor">Monitor next evidence</MenuItem><MenuItem value="parent_contact">Contact parent or guardian</MenuItem></TextField><TextField label="Action Note" value={note} onChange={event => setNote(event.target.value)} multiline minRows={4} placeholder="State what will be done, why, and what evidence should be reviewed next." required /></Stack></DialogContent><DialogActions><Button onClick={() => setShowIntervention(false)}>Cancel</Button><Button type="submit" variant="contained">Save Intervention Record</Button></DialogActions></Dialog>}
        {data.interventions.length > 0 && <Card sx={{ p: 2.5 }}><Typography variant="h2">Intervention history</Typography><Stack divider={<Divider />} sx={{ mt: 1 }}>{data.interventions.map(item => <Box key={item.id} sx={{ py: 1.5 }}><Typography variant="body2" fontWeight={650}>{item.action.replaceAll('_', ' ')}</Typography><Typography variant="body2" color="text.secondary">{item.note}</Typography><Typography variant="caption" color="text.secondary">{new Date(item.created_at).toLocaleString()}</Typography></Box>)}</Stack></Card>}
      </Stack>
    </Box>
  </>;
}
