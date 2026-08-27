import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, FormControl, FormControlLabel, LinearProgress, Radio, RadioGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { api } from '../api/client';
import type { ApiAssessment, AssessmentAttempt } from '../api/types';

export function StudentAssessments() {
  const [assessments, setAssessments] = useState<ApiAssessment[] | null>(null);
  const [active, setActive] = useState<ApiAssessment | null>(null);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<AssessmentAttempt | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api<{ results?: ApiAssessment[] } | ApiAssessment[]>('/assessments/'), api<{ results?: AssessmentAttempt[] } | AssessmentAttempt[]>('/assessments/my-attempts/')]).then(([assessmentResult, attemptResult]) => { setAssessments(Array.isArray(assessmentResult) ? assessmentResult : assessmentResult.results ?? []); setAttempts(Array.isArray(attemptResult) ? attemptResult : attemptResult.results ?? []); }).catch(reason => setError(reason.message));
  useEffect(() => { load(); }, []);

  const start = async (assessment: ApiAssessment) => {
    setBusy(true); setError('');
    try { const response = await api<{ assessment: ApiAssessment }>(`/assessments/${assessment.id}/start/`); setActive(response.assessment); setAnswers({}); setQuestionIndex(0); setResult(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to start assessment.'); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!active?.questions) return;
    setBusy(true); setError('');
    try { const submitted = await api<AssessmentAttempt>(`/assessments/${active.id}/submit/`, { method: 'POST', body: JSON.stringify({ answers: active.questions.map(question => ({ question_id: question.id, answer: answers[question.id] })) }) }); setResult(submitted); setActive(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit assessment.'); } finally { setBusy(false); }
  };

  if (!assessments && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (active?.questions) {
    const question = active.questions[questionIndex];
    const answeredCount = Object.keys(answers).length;
    return <><Button startIcon={<ArrowBack />} onClick={() => setActive(null)} sx={{ mb: 2, px: 0 }}>Exit assessment</Button><PageHeader title={active.title} description={`${answeredCount} of ${active.questions.length} answered`} /><Box sx={{ maxWidth: 840, mx: 'auto' }}><LinearProgress variant="determinate" value={(questionIndex + 1) / active.questions.length * 100} sx={{ height: 7, borderRadius: 1, mb: 3 }} /><Card sx={{ p: { xs: 2.5, sm: 4 } }}><Typography variant="overline" color="text.secondary" fontWeight={700}>Question {questionIndex + 1} of {active.questions.length}</Typography><Typography variant="h2" sx={{ mt: 1 }}>{question.prompt}</Typography><FormControl sx={{ mt: 2, width: '100%' }}><RadioGroup value={answers[question.id] ?? ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}>{question.options.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} sx={{ border: '1px solid', borderColor: answers[question.id] === option ? 'primary.main' : 'divider', borderRadius: 1, m: 0, mb: 1, px: 1.5, py: .5, bgcolor: answers[question.id] === option ? '#f0f6fa' : '#fff' }} />)}</RadioGroup></FormControl><Divider sx={{ my: 3 }} /><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Button disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => index - 1)}>Previous</Button>{questionIndex < active.questions.length - 1 ? <Button variant="contained" endIcon={<ArrowForward />} disabled={!answers[question.id]} onClick={() => setQuestionIndex(index => index + 1)}>Next question</Button> : <Button variant="contained" disabled={answeredCount !== active.questions.length || busy} onClick={submit}>Submit assessment</Button>}</Box></Card></Box></>;
  }
  return <><PageHeader title="Assessments" description="Complete assigned checks and review your persisted results." />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{result && <Alert severity="success" sx={{ mb: 2 }}>Assessment submitted. Your score is {Math.round(Number(result.score))}% and your recovery plan has been updated.</Alert>}<Card><TableContainer><Table sx={{ minWidth: 650 }}><TableHead><TableRow><TableCell>Assessment</TableCell><TableCell>Type</TableCell><TableCell>Questions</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{assessments?.map(assessment => { const previous = attempts.find(attempt => attempt.assessment === assessment.id); return <TableRow key={assessment.id}><TableCell><Typography variant="body2" fontWeight={650}>{assessment.title}</Typography></TableCell><TableCell>{assessment.kind === 'pre' ? 'Diagnostic' : 'Post-assessment'}</TableCell><TableCell>{assessment.question_count}</TableCell><TableCell><StatusChip label={previous ? 'Completed' : assessment.available ? 'Available' : 'Locked'} /></TableCell><TableCell align="right">{previous ? <Typography variant="body2" fontWeight={700}>{Math.round(Number(previous.score))}%</Typography> : <Button size="small" variant="contained" disabled={busy || !assessment.available} onClick={() => start(assessment)}>{assessment.available ? 'Start' : 'Finish recovery plan'}</Button>}</TableCell></TableRow>; })}</TableBody></Table></TableContainer></Card></>;
}
