import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, FormControl, FormControlLabel, LinearProgress, Link, Radio, RadioGroup, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Check, LockOutlined, OpenInNewOutlined, RadioButtonChecked } from '@mui/icons-material';
import { PageHeader } from '../components/PageHeader';
import { api } from '../api/client';
import type { ApiActivity, ApiPlan, ApiPracticeFeedback } from '../api/types';
import { useTalaChatContext } from '../components/TalaChatContext';

type PracticeResult = { passed: boolean; required_score: number; feedback: ApiPracticeFeedback[] };

export function RecoveryWorkspace({ onAssessments }: { onAssessments: (competencyId: number) => void }) {
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [error, setError] = useState('');
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<number | null>(null);
  const { setLearningContext } = useTalaChatContext();

  const load = () => api<{ results?: ApiPlan[] } | ApiPlan[]>('/recovery-plans/').then(result => {
    const items = Array.isArray(result) ? result : result.results ?? [];
    setPlans(items);
    const active = items.find(item => item.status === 'active');
    if (active) {
      setSelectedPlanId(current => current ?? active.id);
      setSelectedId(current => current ?? active.activities.find(item => !item.completed_at)?.id ?? active.activities[0]?.id ?? null);
    }
  }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);

  const plan = plans?.find(item => item.id === selectedPlanId) ?? plans?.find(item => item.status === 'active') ?? plans?.[0];
  const selected = plan?.activities.find(item => item.id === selectedId);
  const focusedQuestion = selected?.practice_questions?.find(question => question.id === focusedQuestionId) ?? selected?.practice_questions?.[0];
  const learningActivities = plan?.activities.filter(item => item.resource) ?? [];
  const completed = learningActivities.filter(item => item.completed_at).length;
  const progress = learningActivities.length ? Math.round(completed / learningActivities.length * 100) : 0;
  const canOpen = (activity: ApiActivity) => !plan?.activities.some(item => item.position < activity.position && !item.completed_at);
  const chooseActivity = (activity: ApiActivity) => { if (!canOpen(activity)) return; setSelectedId(activity.id); setFocusedQuestionId(activity.practice_questions?.[0]?.id ?? null); setAnswers(activity.review?.answers ? Object.fromEntries(Object.entries(activity.review.answers).map(([key, value]) => [Number(key), value])) : {}); setPracticeResult(null); setError(''); };
  const choosePlan = (next: ApiPlan) => { setSelectedPlanId(next.id); const nextActivity = next.activities.find(item => !item.completed_at) ?? next.activities[0]; setSelectedId(nextActivity?.id ?? null); setFocusedQuestionId(nextActivity?.practice_questions?.[0]?.id ?? null); setAnswers(nextActivity?.review?.answers ? Object.fromEntries(Object.entries(nextActivity.review.answers).map(([key, value]) => [Number(key), value])) : {}); setPracticeResult(null); setError(''); };
  useEffect(() => {
    if (!plan || !selected) return;
    setLearningContext({ planId: plan.id, competency: plan.competency_title, activityId: selected.id, activityTitle: selected.title, questionId: focusedQuestion?.id, questionPrompt: focusedQuestion?.prompt, selectedAnswer: focusedQuestion ? answers[focusedQuestion.id] : undefined });
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

  if (!plans && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!plan) return <><PageHeader parent="My learning" title="Recovery plan" /><Alert severity="info">No recovery plan is assigned. Complete a diagnostic assessment first.</Alert></>;

  const selectedQuestions = selected?.practice_questions ?? [];
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
        <Typography variant="overline" color="text.secondary" fontWeight={700}>{selected.resource_type?.replace('_', ' ') ?? 'Mastery activity'}</Typography><Typography variant="h2" sx={{ mt: .5 }}>{selected.title}</Typography>{selected.due_at && <Typography variant="caption" color="text.secondary">Due {new Date(selected.due_at).toLocaleString()}</Typography>}<Divider sx={{ my: 2.5 }} />
        {selected.resource_type === 'video' && selected.file_url && <Box sx={{ mb: 3 }}><video controls preload="metadata" src={selected.file_url} style={{ width: '100%', maxHeight: 480, background: '#111', borderRadius: 8 }}><track kind="captions" /></video></Box>}
        {selected.resource_type === 'module' && selected.file_url && <Button component={Link} href={selected.file_url} target="_blank" rel="noreferrer" variant="outlined" startIcon={<OpenInNewOutlined />} sx={{ mb: 2 }}>Open original module</Button>}
        {selected.content ? <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{selected.content}</Typography> : <Alert severity={plan.mastery_assessment?.available ? 'info' : 'warning'}>{!canOpen(selected) ? 'Finish the preceding learning activities to continue.' : !plan.mastery_assessment ? 'No active mastery assessment is assigned for this competency. Contact your teacher.' : plan.mastery_assessment.available ? `All required recovery work is complete. Open ${plan.mastery_assessment.title} to finish the recovery plan.` : plan.mastery_assessment.availability_reason}</Alert>}
        {selectedQuestions.length > 0 && <Box sx={{ mt: 4 }}><Divider sx={{ mb: 3 }} /><Typography variant="h3">Lesson practice</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2.5 }}>{selected.completed_at ? 'Review your submitted answers and the correct answers below.' : `Answer every item and reach ${selected.passing_score ?? 70}% to complete this activity.`}</Typography><Stack gap={3}>{selectedQuestions.map((question, index) => { const feedback = practiceResult?.feedback.find(item => item.question_id === question.id) ?? selected.review?.feedback.find(item => item.question_id === question.id); const answer = selected.completed_at ? feedback?.student_answer ?? answers[question.id] ?? '' : answers[question.id] ?? ''; return <Box key={question.id} onFocus={() => setFocusedQuestionId(question.id)} onClick={() => setFocusedQuestionId(question.id)}><Typography variant="body2" fontWeight={700}>{index + 1}. {question.prompt}</Typography>{question.question_type === 'short' ? <TextField fullWidth size="small" label="Your answer" value={answer} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))} disabled={practiceBusy || Boolean(selected.completed_at)} sx={{ mt: 1.5, '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: 'text.primary' } }} /> : <FormControl sx={{ width: '100%', mt: 1 }}><RadioGroup value={answer} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}>{question.options.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} disabled={practiceBusy || Boolean(selected.completed_at)} sx={{ border: '1px solid', borderColor: feedback?.correct_answer === option ? 'success.main' : answer === option ? 'primary.main' : 'divider', bgcolor: feedback?.correct_answer === option ? 'success.50' : 'transparent', borderRadius: 1, m: 0, mb: 1, px: 1, '& .MuiFormControlLabel-label.Mui-disabled': { color: 'text.primary' } }} />)}</RadioGroup></FormControl>}{feedback && <Alert severity={feedback.is_correct ? 'success' : 'warning'} sx={{ mt: 1 }}><strong>Your answer:</strong> {feedback.student_answer || 'No answer'}<br /><strong>Correct answer:</strong> {feedback.correct_answer}<br />{feedback.explanation}</Alert>}</Box>; })}</Stack></Box>}
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>{selected.completed_at ? <Button disabled startIcon={<Check />}>Completed</Button> : selected.resource ? <Button variant="contained" onClick={() => complete(selected)} disabled={practiceBusy || !allAnswered}>{practiceBusy ? 'Checking answers…' : selected.practice_questions?.length ? 'Check answers' : 'Mark activity complete'}</Button> : <Button variant="contained" onClick={() => onAssessments(plan.competency)} disabled={!canOpen(selected) || !plan.mastery_assessment?.available}>Open mastery assessment</Button>}</Box>
        {practiceResult && <Alert severity={practiceResult.passed ? 'success' : 'warning'} sx={{ mt: 2 }}>{practiceResult.passed ? 'Activity completed. The next activity is now available.' : `You have not reached the required ${practiceResult.required_score}% yet. Review the feedback and try again.`}</Alert>}
      </> : <Typography color="text.secondary">Select an activity to begin.</Typography>}</Box></Card>
    </Box>
  </>;
}
