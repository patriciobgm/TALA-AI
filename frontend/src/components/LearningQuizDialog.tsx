import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, LinearProgress, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import type { ApiPracticeQuestion, LearningAssignment } from '../api/types';

type QuizResult = { score: number; passed: boolean; required_score: number } | null;

export function LearningQuizDialog({ assignment, open, answers, result, busy, onAnswers, onClose, onStart, onSubmit, onFocusQuestion, onAskTala }: {
  assignment: LearningAssignment;
  open: boolean;
  answers: Record<number, string>;
  result: QuizResult;
  busy: boolean;
  onAnswers: (answers: Record<number, string>) => void;
  onClose: () => void;
  onStart: () => Promise<{ session_id: number; expires_at: string }>;
  onSubmit: (sessionId: number) => Promise<void>;
  onFocusQuestion: (questionId: number) => void;
  onAskTala: (question: ApiPracticeQuestion) => void;
}) {
  const [started, setStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [startError, setStartError] = useState('');
  const questions = assignment.practice_questions;
  const question = questions[questionIndex];
  const answeredCount = useMemo(() => questions.filter(item => Boolean(answers[item.id]?.trim())).length, [answers, questions]);
  const allAnswered = answeredCount === questions.length;
  const currentAnswered = Boolean(question && answers[question.id]?.trim());

  useEffect(() => {
    if (!open) { setStarted(false); setQuestionIndex(0); setConfirming(false); setSessionId(null); setExpiresAt(''); setStartError(''); }
  }, [open]);
  useEffect(() => { if (open && started && question) onFocusQuestion(question.id); }, [onFocusQuestion, open, question, started]);
  useEffect(() => {
    if (!started || !expiresAt || !sessionId || result?.passed) return;
    const tick = () => { const next = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)); setRemaining(next); if (next === 0) void onSubmit(sessionId); };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [expiresAt, onSubmit, result?.passed, sessionId, started]);

  const begin = async () => {
    setStartError('');
    try { const session = await onStart(); setSessionId(session.session_id); setExpiresAt(session.expires_at); setQuestionIndex(Math.max(0, questions.findIndex(item => !answers[item.id]?.trim()))); setStarted(true); }
    catch (reason) { setStartError(reason instanceof Error ? reason.message : 'Unable to start the timed quiz.'); }
  };

  const move = (next: number) => setQuestionIndex(Math.max(0, Math.min(questions.length - 1, next)));
  const updateAnswer = (value: string) => { if (question) onAnswers({ ...answers, [question.id]: value }); };

  return <><Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth={started ? 'md' : 'sm'} onCopy={event => event.preventDefault()} onCut={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>
    <DialogTitle>{started ? <Box><Typography variant="overline" color="text.secondary">Question {questionIndex + 1} of {questions.length}</Typography><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="h2">Learning Quiz</Typography><Typography fontWeight={800} color={remaining <= 60 ? 'error.main' : 'text.primary'}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Typography></Box></Box> : 'Ready to Take the Learning Quiz?'}</DialogTitle>
    <DialogContent dividers>
      {!started ? <Stack gap={2}>
        {startError && <Alert severity="error">{startError}</Alert>}
        <Box><Typography variant="body1" fontWeight={700}>{assignment.resource_title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Answer {questions.length} questions and reach the required passing mark to complete this material. Your answers remain available if you return to the document.</Typography></Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}><Box><Typography variant="caption" color="text.secondary">Questions</Typography><Typography fontWeight={750}>{questions.length}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Time limit</Typography><Typography fontWeight={750}>{assignment.quiz_time_limit_minutes} min</Typography></Box><Box><Typography variant="caption" color="text.secondary">Answered</Typography><Typography fontWeight={750}>{answeredCount} of {questions.length}</Typography></Box></Box>
        <Typography variant="caption" color="text.secondary">The timer continues until submission. Quiz text cannot be copied.</Typography>
        {result && !result.passed && <Alert severity="warning">Your previous score was {Math.round(result.score)}%. The passing score is {result.required_score}%. Review your answers and try again.</Alert>}
      </Stack> : assignment.quiz_passed || result?.passed ? <Stack gap={2} alignItems="center" sx={{ py: 4, textAlign: 'center' }}><Typography variant="h2">Quiz passed</Typography><Typography color="success.main" sx={{ fontSize: 34, fontWeight: 800 }}>{Math.round(result?.score ?? Number(assignment.latest_quiz_score ?? 0))}%</Typography><Typography variant="body2" color="text.secondary">This learning material is now complete.</Typography></Stack> : question ? <Stack gap={2.5}>
        {result && !result.passed && <Alert severity="warning">Previous attempt: {Math.round(result.score)}%. Update your answers before submitting again.</Alert>}
        <Box><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1 }}><Typography variant="body2" color="text.secondary">{answeredCount} of {questions.length} answered</Typography><Typography variant="body2" fontWeight={700}>{Math.round(((questionIndex + 1) / questions.length) * 100)}%</Typography></Box><LinearProgress variant="determinate" value={((questionIndex + 1) / questions.length) * 100} sx={{ height: 7, borderRadius: 4 }} /></Box>
        <Box sx={{ userSelect: 'none' }}><Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}><Typography variant="h3" sx={{ lineHeight: 1.5 }}>{questionIndex + 1}. {question.prompt}</Typography><Button size="small" onClick={() => onAskTala(question)}>Ask TALA</Button></Box>{question.question_type === 'short' ? <TextField fullWidth autoFocus sx={{ mt: 2, userSelect: 'text' }} label="Your answer" value={answers[question.id] ?? ''} onChange={event => updateAnswer(event.target.value)} /> : <FormControl sx={{ mt: 1.5, width: '100%' }}><RadioGroup value={answers[question.id] ?? ''} onChange={event => updateAnswer(event.target.value)}>{question.options.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} sx={{ py: .5, px: 1, mx: 0, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }} />)}</RadioGroup></FormControl>}</Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .75 }}>{questions.map((item, index) => <Button key={item.id} size="small" variant={index === questionIndex ? 'contained' : answers[item.id]?.trim() ? 'outlined' : 'text'} onClick={() => move(index)} sx={{ minWidth: 36 }}>{index + 1}</Button>)}</Box>
      </Stack> : <Alert severity="warning">No quiz questions are available for this material.</Alert>}
    </DialogContent>
    <DialogActions sx={{ justifyContent: 'space-between' }}><Button onClick={onClose} disabled={busy}>{started ? 'Back to material' : 'Cancel'}</Button><Stack direction="row" gap={1}>{!started ? <Button variant="contained" disabled={!questions.length} onClick={() => void begin()}>{answeredCount ? 'Continue quiz' : result ? 'Try again' : 'Start quiz'}</Button> : assignment.quiz_passed || result?.passed ? <Button variant="contained" onClick={onClose}>Done</Button> : <><Button disabled={questionIndex === 0} onClick={() => move(questionIndex - 1)}>Previous</Button>{questionIndex < questions.length - 1 ? <Button variant="contained" disabled={!currentAnswered} onClick={() => move(questionIndex + 1)}>Next</Button> : <Button variant="contained" disabled={busy || !allAnswered} onClick={() => setConfirming(true)}>{busy ? 'Checking…' : 'Review & submit'}</Button>}</>}</Stack></DialogActions>
  </Dialog>
  <Dialog open={confirming} onClose={() => !busy && setConfirming(false)} fullWidth maxWidth="xs"><DialogTitle>Submit learning quiz?</DialogTitle><DialogContent><Typography variant="body2">You answered all {questions.length} questions. Submit now for scoring?</Typography></DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirming(false)}>Keep reviewing</Button><Button variant="contained" disabled={busy || !sessionId} onClick={() => { setConfirming(false); if (sessionId) void onSubmit(sessionId); }}>{busy ? 'Submitting…' : 'Submit quiz'}</Button></DialogActions></Dialog>
  </>;
}
