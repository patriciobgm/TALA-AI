import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Collapse, Divider, FormControl, FormControlLabel, IconButton, LinearProgress, Link, Radio, RadioGroup, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import { AssignmentOutlined, Check, CheckCircleOutline, FitScreenOutlined, LockOutlined, MenuBookOutlined, OpenInNewOutlined, RadioButtonChecked, ZoomInOutlined, ZoomOutOutlined } from '@mui/icons-material';
import { PageHeader } from '../components/PageHeader';
import { api, normalizeProtectedUrl } from '../api/client';
import type { ApiActivity, ApiPlan, ApiPracticeFeedback, StudentDashboardData } from '../api/types';
import { useTalaChatContext } from '../components/TalaChatContext';
import { useStudentScope } from '../components/StudentScopeContext';

type PracticeResult = { passed: boolean; required_score: number; feedback: ApiPracticeFeedback[] };

export function RecoveryWorkspace({ onAssessments, onMaterials }: { onAssessments: (competencyId?: number) => void; onMaterials: () => void }) {
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [dashboard, setDashboard] = useState<StudentDashboardData | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [error, setError] = useState('');
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<number | null>(null);
  const [extractedOpen, setExtractedOpen] = useState(false);
  const [documentZoom, setDocumentZoom] = useState(100);
  const { setLearningContext } = useTalaChatContext();
  const scope = useStudentScope();

  const load = useCallback(async () => {
    if (!scope?.selectedSubjectId) return;
    try {
      const [planResult, dashboardResult] = await Promise.all([
        api<{ results?: ApiPlan[] } | ApiPlan[]>(`/recovery-plans/?subject=${scope.selectedSubjectId}`),
        api<StudentDashboardData>(`/dashboard/student/?subject=${scope.selectedSubjectId}`),
      ]);
      const returned = Array.isArray(planResult) ? planResult : planResult.results ?? [];
      const plansByCompetency = new Map<number, ApiPlan>();
      for (const item of returned) {
        const current = plansByCompetency.get(item.competency);
        if (!current || (item.status === 'active' && current.status !== 'active')) plansByCompetency.set(item.competency, item);
      }
      const items = Array.from(plansByCompetency.values());
      setPlans(items);
      setDashboard(dashboardResult);
      const initial = items.find(item => item.status === 'active') ?? items[0];
      if (initial) {
        setSelectedPlanId(current => current && items.some(item => item.id === current) ? current : initial.id);
        setSelectedId(current => current && items.some(item => item.activities.some(activity => activity.id === current)) ? current : initial.activities.find(item => !item.completed_at)?.id ?? initial.activities[0]?.id ?? null);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load your recovery plan.'); }
  }, [scope?.selectedSubjectId]);
  useEffect(() => { setPlans(null); setSelectedPlanId(null); setSelectedId(null); void load(); }, [load]);

  const plan = plans?.find(item => item.id === selectedPlanId) ?? plans?.[0];
  const selected = plan?.activities.find(item => item.id === selectedId);
  const focusedQuestion = selected?.practice_questions?.find(question => question.id === focusedQuestionId) ?? selected?.practice_questions?.[0];
  const learningActivities = plan?.activities.filter(item => item.resource) ?? [];
  const completed = learningActivities.filter(item => item.completed_at).length;
  const progress = learningActivities.length ? Math.round(completed / learningActivities.length * 100) : 0;
  const canOpen = (activity: ApiActivity) => !plan?.activities.some(item => item.position < activity.position && !item.completed_at);
  const chooseActivity = (activity: ApiActivity) => { if (!canOpen(activity)) return; setSelectedId(activity.id); setFocusedQuestionId(activity.practice_questions?.[0]?.id ?? null); setAnswers(activity.review?.answers ? Object.fromEntries(Object.entries(activity.review.answers).map(([key, value]) => [Number(key), value])) : {}); setPracticeResult(null); setExtractedOpen(false); setDocumentZoom(100); setError(''); };
  const choosePlan = (next: ApiPlan) => { setSelectedPlanId(next.id); const nextActivity = next.activities.find(item => !item.completed_at) ?? next.activities[0]; setSelectedId(nextActivity?.id ?? null); setFocusedQuestionId(nextActivity?.practice_questions?.[0]?.id ?? null); setAnswers(nextActivity?.review?.answers ? Object.fromEntries(Object.entries(nextActivity.review.answers).map(([key, value]) => [Number(key), value])) : {}); setPracticeResult(null); setError(''); };
  useEffect(() => {
    if (!plan || !selected) return;
    setLearningContext({ contextType: 'recovery', planId: plan.id, competency: plan.competency_title, activityId: selected.id, activityTitle: selected.title, questionId: focusedQuestion?.id, questionPrompt: focusedQuestion?.prompt, selectedAnswer: focusedQuestion ? answers[focusedQuestion.id] : undefined });
  }, [answers, focusedQuestion, plan, selected, setLearningContext]);

  const complete = async (activity: ApiActivity) => {
    if (!plan) return;
    setPracticeBusy(true); setError(''); setPracticeResult(null);
    try {
      const response = await api<PracticeResult>(`/recovery-plans/${plan.id}/activities/${activity.id}/complete/`, { method: 'POST', body: JSON.stringify({ answers }) });
      setPracticeResult(response);
      if (response.passed) {
        await load();
        const next = plan.activities.find(item => item.position > activity.position && !item.completed_at);
        if (next) window.setTimeout(() => chooseActivity(next), 700);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to check this activity.'); }
    finally { setPracticeBusy(false); }
  };

  if (scope && !scope.loading && !scope.selectedSubjectId) return <><PageHeader title="Recovery Plan" /><Alert severity="info">No subject with an assigned recovery plan is available yet.</Alert></>;
  if ((!plans || !dashboard) && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!plan) {
    const pending = dashboard?.pending_diagnostic;
    const latestAttempt = dashboard?.attempts.at(-1);
    const pendingReview = latestAttempt?.grading_status === 'pending_review';
    const allMastered = Boolean(latestAttempt?.competency_results.length) && latestAttempt!.competency_results.every(item => item.status === 'mastered');
    const needsMaterials = Boolean(pending?.remaining_prerequisites);
    const title = needsMaterials ? 'Complete your learning materials first' : pending ? 'Your diagnostic is ready' : pendingReview ? 'Your assessment is being reviewed' : allMastered ? 'No recovery support is needed right now' : latestAttempt ? 'Recovery support is not currently assigned' : 'No recovery activity has been assigned';
    const detail = needsMaterials
      ? `Finish ${pending!.remaining_prerequisites} required material${pending!.remaining_prerequisites === 1 ? '' : 's'} and the related learning quiz before taking ${pending!.title}.`
      : pending
        ? 'Take the assigned diagnostic. A recovery plan will only be created if the result shows that you need additional support.'
        : pendingReview
          ? 'Your teacher must finish reviewing your submitted answers before any recovery support is determined.'
          : allMastered
            ? 'Your latest assessment did not identify a competency that requires remediation. Keep reviewing your learning materials and assessments.'
            : latestAttempt
              ? 'Your assessment result is recorded, but no recovery plan is currently assigned. Review your assessments or ask your teacher if you need help.'
              : 'There is no diagnostic or recovery activity waiting for you in this subject. Your teacher will assign one when support is needed.';
    const icon = needsMaterials ? <MenuBookOutlined /> : pending || pendingReview ? <AssignmentOutlined /> : <CheckCircleOutline />;
    return <><PageHeader parent="My learning" title="Recovery plan" /><Card sx={{ maxWidth: 720, mx: 'auto', mt: 4, p: { xs: 3, sm: 4 }, textAlign: 'center' }}><Box sx={{ width: 56, height: 56, mx: 'auto', mb: 2, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: allMastered ? 'success.light' : 'primary.light', color: allMastered ? 'success.dark' : 'primary.dark' }}>{icon}</Box><Typography variant="h2">{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, mx: 'auto', maxWidth: 540, lineHeight: 1.7 }}>{detail}</Typography>{(pending || latestAttempt) && <Button variant="contained" sx={{ mt: 3 }} onClick={needsMaterials ? onMaterials : () => onAssessments()}>{needsMaterials ? 'Open learning materials' : 'View assessments'}</Button>}</Card></>;
  }

  const selectedQuestions = selected?.practice_questions ?? [];
  const hasUploadedDocument = Boolean(selected?.file_url && selected.resource_type !== 'video');
  const isPdf = Boolean(selected?.mime_type === 'application/pdf' || selected?.original_filename?.toLowerCase().endsWith('.pdf'));
  const allAnswered = selectedQuestions.every(question => Boolean(answers[question.id]?.trim()));
  const allLearningActivities = (plans ?? []).flatMap(item => item.activities.filter(activity => activity.resource));
  const allCompletedActivities = allLearningActivities.filter(activity => activity.completed_at).length;
  return <>
    <PageHeader parent="My learning" title="Recovery plan" description={plan.competency_title} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Box sx={{ mb: 2.5, px: 2, py: 1.5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}><Typography variant="body2" fontWeight={700}>Overall recovery progress</Typography><Typography variant="body2" color="text.secondary">{allCompletedActivities} of {allLearningActivities.length} learning activities completed · {allLearningActivities.length - allCompletedActivities} remaining</Typography></Box>
    {plans && plans.length > 1 && <Box sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}><Tabs value={plan.id} onChange={(_, value: number) => { const next = plans.find(item => item.id === value); if (next) choosePlan(next); }} variant="scrollable" scrollButtons="auto" aria-label="Recovery competencies">{plans.map(item => { const resources = item.activities.filter(activity => activity.resource); const done = resources.filter(activity => activity.completed_at).length; return <Tab key={item.id} value={item.id} label={<Box sx={{ textAlign: 'left' }}><Typography variant="body2" fontWeight={700}>{item.competency_title}</Typography><Typography variant="caption" color="text.secondary">{item.status === 'completed' ? 'Mastered' : `${done} of ${resources.length} activities`}</Typography></Box>} sx={{ alignItems: 'flex-start', minHeight: 58, px: 2 }} />; })}</Tabs></Box>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
      <Card sx={{ overflow: 'hidden' }}><Box sx={{ p: 2.5 }}><Typography variant="h3">Plan activities</Typography><Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5 }}><LinearProgress variant="determinate" value={progress} sx={{ flex: 1, height: 7, borderRadius: 1 }} /><Typography variant="caption" fontWeight={700}>{progress}%</Typography></Box></Box><Divider /><Stack divider={<Divider />}>{plan.activities.map(activity => { const unlocked = canOpen(activity); return <Button key={activity.id} color="inherit" onClick={() => chooseActivity(activity)} disabled={!unlocked} sx={{ p: 2, borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left', bgcolor: selectedId === activity.id ? '#eef4f8' : '#fff' }}><Box sx={{ width: 26, height: 26, mr: 1.25, borderRadius: '50%', border: '1px solid', borderColor: activity.completed_at ? 'success.main' : unlocked ? 'primary.main' : 'divider', bgcolor: activity.completed_at ? 'success.main' : '#fff', color: activity.completed_at ? '#fff' : unlocked ? 'primary.main' : 'text.disabled', display: 'grid', placeItems: 'center' }}>{activity.completed_at ? <Check sx={{ fontSize: 16 }} /> : unlocked ? <RadioButtonChecked sx={{ fontSize: 14 }} /> : <LockOutlined sx={{ fontSize: 14 }} />}</Box><Box><Typography variant="body2" fontWeight={selectedId === activity.id ? 700 : 600}>{activity.title}</Typography><Typography variant="caption" color="text.secondary">{activity.completed_at ? 'Completed' : unlocked ? activity.due_at ? `Due ${new Date(activity.due_at).toLocaleDateString()}` : 'Available' : 'Locked'}</Typography></Box></Button>; })}</Stack></Card>

      <Card sx={{ minHeight: 460 }}><Box sx={{ p: { xs: 2.5, sm: 3 } }}>{selected ? <>
        <Typography variant="overline" color="text.secondary" fontWeight={700}>{selected.resource_type?.replace('_', ' ') ?? 'Mastery activity'}</Typography><Typography variant="h2" sx={{ mt: .5 }}>{selected.title}</Typography>{selected.due_at && <Typography variant="caption" color="text.secondary">Due {new Date(selected.due_at).toLocaleString()}</Typography>}{selected.recommendation_reason && <Box sx={{ mt: 2, px: 2, py: 1.5, bgcolor: '#f4f7f9', borderLeft: '3px solid', borderLeftColor: 'primary.main' }}><Typography variant="caption" color="text.secondary" fontWeight={750}>Why this activity is in your plan</Typography><Typography variant="body2" sx={{ mt: .5 }}>{selected.recommendation_reason}</Typography></Box>}<Divider sx={{ my: 2.5 }} />
        {selected.resource_type === 'video' && selected.file_url && <Box sx={{ mb: 3 }}><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Watch the teacher-approved video, then complete the competency practice below.</Typography><video controls preload="metadata" src={normalizeProtectedUrl(selected.file_url)} style={{ width: '100%', maxHeight: 480, background: '#111', borderRadius: 8 }}><track kind="captions" /></video></Box>}
        {hasUploadedDocument && <Box sx={{ mb: 3 }}><Alert severity="info" sx={{ mb: 2 }}>Review the original learning material, focusing on {plan.competency_title}. Complete the competency practice below when you are ready.</Alert><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}><Button component={Link} href={normalizeProtectedUrl(selected.file_url!)} target="_blank" rel="noreferrer" variant="outlined" startIcon={<OpenInNewOutlined />}>Open original material</Button><Box sx={{ flex: 1 }} />{isPdf && <><Tooltip title="Zoom out"><span><IconButton size="small" disabled={documentZoom <= 75} onClick={() => setDocumentZoom(value => Math.max(75, value - 25))}><ZoomOutOutlined /></IconButton></span></Tooltip><Typography variant="caption" sx={{ width: 48, textAlign: 'center' }}>{documentZoom}%</Typography><Tooltip title="Zoom in"><span><IconButton size="small" disabled={documentZoom >= 200} onClick={() => setDocumentZoom(value => Math.min(200, value + 25))}><ZoomInOutlined /></IconButton></span></Tooltip><Tooltip title="Fit width"><IconButton size="small" onClick={() => setDocumentZoom(100)}><FitScreenOutlined /></IconButton></Tooltip></>}</Stack>{isPdf ? <Box sx={{ width: '100%', height: '65vh', minHeight: 520, overflow: 'auto', bgcolor: '#e9edf0', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Box component="iframe" title={selected.title} src={normalizeProtectedUrl(selected.file_url!)} sx={{ display: 'block', width: `${documentZoom}%`, height: `calc(65vh * ${documentZoom / 100})`, minHeight: 520, border: 0, bgcolor: '#fff', mx: documentZoom <= 100 ? 'auto' : 0 }} /></Box> : <Alert severity="info">This file type opens in its original viewer. Use “Open original material” above.</Alert>}</Box>}
        {!selected.file_url && selected.content ? <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{selected.content}</Typography> : !selected.resource && <Alert severity={plan.mastery_assessment?.available ? 'info' : 'warning'}>{!canOpen(selected) ? 'Finish the preceding learning activities to continue.' : !plan.mastery_assessment ? 'No active mastery assessment is assigned for this competency. Contact your teacher.' : plan.mastery_assessment.available ? `All required recovery work is complete. Open ${plan.mastery_assessment.title} to finish the recovery plan.` : plan.mastery_assessment.availability_reason}</Alert>}
        {selected.file_url && selected.content && <Box sx={{ mt: 2 }}><Button size="small" onClick={() => setExtractedOpen(value => !value)}>{extractedOpen ? 'Hide extracted text' : `View extracted ${selected.resource_type === 'video' ? 'transcript' : 'text'}`}</Button><Collapse in={extractedOpen}><Box sx={{ mt: 1.5, p: 2, maxHeight: 360, overflowY: 'auto', bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>{selected.content}</Typography></Box></Collapse></Box>}
        {selectedQuestions.length > 0 && <Box sx={{ mt: 4 }}><Divider sx={{ mb: 3 }} /><Typography variant="h3">Lesson practice</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2.5 }}>{selected.completed_at ? 'Review your submitted answers and the correct answers below.' : `Answer every item and reach ${selected.passing_score ?? 70}% to complete this activity.`}</Typography><Stack gap={3}>{selectedQuestions.map((question, index) => { const feedback = practiceResult?.feedback.find(item => item.question_id === question.id) ?? selected.review?.feedback.find(item => item.question_id === question.id); const answer = selected.completed_at ? feedback?.student_answer ?? answers[question.id] ?? '' : answers[question.id] ?? ''; return <Box key={question.id} onFocus={() => setFocusedQuestionId(question.id)} onClick={() => setFocusedQuestionId(question.id)}><Typography variant="body2" fontWeight={700}>{index + 1}. {question.prompt}</Typography>{question.question_type === 'short' ? <TextField fullWidth size="small" label="Your answer" value={answer} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))} disabled={practiceBusy || Boolean(selected.completed_at)} sx={{ mt: 1.5, '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: 'text.primary' } }} /> : <FormControl sx={{ width: '100%', mt: 1 }}><RadioGroup value={answer} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}>{question.options.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} disabled={practiceBusy || Boolean(selected.completed_at)} sx={{ border: '1px solid', borderColor: feedback?.correct_answer === option ? 'success.main' : answer === option ? 'primary.main' : 'divider', bgcolor: feedback?.correct_answer === option ? 'success.50' : 'transparent', borderRadius: 1, m: 0, mb: 1, px: 1, '& .MuiFormControlLabel-label.Mui-disabled': { color: 'text.primary' } }} />)}</RadioGroup></FormControl>}{feedback && <Alert severity={feedback.is_correct ? 'success' : 'warning'} sx={{ mt: 1 }}><strong>Your answer:</strong> {feedback.student_answer || 'No answer'}<br /><strong>Correct answer:</strong> {feedback.correct_answer}<br />{feedback.explanation}</Alert>}</Box>; })}</Stack></Box>}
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>{selected.completed_at ? <Button disabled startIcon={<Check />}>Completed</Button> : selected.resource ? <Button variant="contained" onClick={() => complete(selected)} disabled={practiceBusy || !allAnswered}>{practiceBusy ? 'Checking answers…' : selected.practice_questions?.length ? 'Check answers' : 'Mark activity complete'}</Button> : <Button variant="contained" onClick={() => onAssessments(plan.competency)} disabled={!canOpen(selected) || !plan.mastery_assessment?.available}>Open mastery assessment</Button>}</Box>
        {practiceResult && <Alert severity={practiceResult.passed ? 'success' : 'warning'} sx={{ mt: 2 }}>{practiceResult.passed ? 'Activity completed. The next activity is now available.' : `You have not reached the required ${practiceResult.required_score}% yet. Review the feedback and try again.`}</Alert>}
      </> : <Typography color="text.secondary">Select an activity to begin.</Typography>}</Box></Card>
    </Box>
  </>;
}
