import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, LinearProgress, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import type { ApiPracticeQuestion, LearningAssignment } from '../api/types';

type QuizResult = { score: number; passed: boolean; required_score: number } | null;

export function LearningQuizDialog({ assignment, open, answers, result, busy, onAnswers, onClose, onSubmit, onFocusQuestion, onAskTala }: {
  assignment: LearningAssignment;
  open: boolean;
  answers: Record<number, string>;
  result: QuizResult;
  busy: boolean;
  onAnswers: (answers: Record<number, string>) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  onFocusQuestion: (questionId: number) => void;
  onAskTala: (question: ApiPracticeQuestion) => void;
}) {
  const [started, setStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const questions = assignment.practice_questions;
  const question = questions[questionIndex];
  const answeredCount = useMemo(() => questions.filter(item => Boolean(answers[item.id]?.trim())).length, [answers, questions]);
  const allAnswered = answeredCount === questions.length;
  const currentAnswered = Boolean(question && answers[question.id]?.trim());

  useEffect(() => {
    if (!open) { setStarted(false); setQuestionIndex(0); setConfirming(false); }
  }, [open]);
  useEffect(() => { if (open && started && question) onFocusQuestion(question.id); }, [onFocusQuestion, open, question, started]);

  const move = (next: number) => setQuestionIndex(Math.max(0, Math.min(questions.length - 1, next)));
  const updateAnswer = (value: string) => { if (question) onAnswers({ ...answers, [question.id]: value }); };

  return <><Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth={started ? 'md' : 'sm'}>
    <DialogTitle>{started ? <Box><Typography variant="overline" color="text.secondary">Question {questionIndex + 1} of {questions.length}</Typography><Typography variant="h2">Learning Quiz</Typography></Box> : 'Ready to Take the Learning Quiz?'}</DialogTitle>
    <DialogContent dividers>
      {!started ? <Stack gap={2}>
        <Box><Typography variant="body1" fontWeight={700}>{assignment.resource_title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Answer {questions.length} questions and reach the required passing mark to complete this material. Your answers remain available if you return to the document.</Typography></Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}><Box><Typography variant="caption" color="text.secondary">Questions</Typography><Typography fontWeight={750}>{questions.length}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Answered</Typography><Typography fontWeight={750}>{answeredCount} of {questions.length}</Typography></Box></Box>
        {result && !result.passed && <Alert severity="warning">Your previous score was {Math.round(result.score)}%. The passing score is {result.required_score}%. Review your answers and try again.</Alert>}
        <Alert severity="info">Ask TALA can explain a concept or provide a hint, but it will not reveal or confirm an answer.</Alert>
      </Stack> : assignment.quiz_passed || result?.passed ? <Stack gap={2} alignItems="center" sx={{ py: 4, textAlign: 'center' }}><Typography variant="h2">Quiz passed</Typography><Typography color="success.main" sx={{ fontSize: 34, fontWeight: 800 }}>{Math.round(result?.score ?? Number(assignment.latest_quiz_score ?? 0))}%</Typography><Typography variant="body2" color="text.secondary">This learning material is now complete.</Typography></Stack> : question ? <Stack gap={2.5}>
        {result && !result.passed && <Alert severity="warning">Previous attempt: {Math.round(result.score)}%. Update your answers before submitting again.</Alert>}
        <Box><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1 }}><Typography variant="body2" color="text.secondary">{answeredCount} of {questions.length} answered</Typography><Typography variant="body2" fontWeight={700}>{Math.round(((questionIndex + 1) / questions.length) * 100)}%</Typography></Box><LinearProgress variant="determinate" value={((questionIndex + 1) / questions.length) * 100} sx={{ height: 7, borderRadius: 4 }} /></Box>
        <Box><Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}><Typography variant="h3" sx={{ lineHeight: 1.5 }}>{questionIndex + 1}. {question.prompt}</Typography><Button size="small" onClick={() => onAskTala(question)}>Ask TALA</Button></Box>{question.question_type === 'short' ? <TextField fullWidth autoFocus sx={{ mt: 2 }} label="Your answer" value={answers[question.id] ?? ''} onChange={event => updateAnswer(event.target.value)} /> : <FormControl sx={{ mt: 1.5, width: '100%' }}><RadioGroup value={answers[question.id] ?? ''} onChange={event => updateAnswer(event.target.value)}>{question.options.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} sx={{ py: .5, px: 1, mx: 0, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }} />)}</RadioGroup></FormControl>}</Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .75 }}>{questions.map((item, index) => <Button key={item.id} size="small" variant={index === questionIndex ? 'contained' : answers[item.id]?.trim() ? 'outlined' : 'text'} onClick={() => move(index)} sx={{ minWidth: 36 }}>{index + 1}</Button>)}</Box>
      </Stack> : <Alert severity="warning">No quiz questions are available for this material.</Alert>}
    </DialogContent>
    <DialogActions sx={{ justifyContent: 'space-between' }}><Button onClick={onClose} disabled={busy}>{started ? 'Back to material' : 'Cancel'}</Button><Stack direction="row" gap={1}>{!started ? <Button variant="contained" disabled={!questions.length} onClick={() => { setQuestionIndex(Math.max(0, questions.findIndex(item => !answers[item.id]?.trim()))); setStarted(true); }}>{answeredCount ? 'Continue quiz' : result ? 'Try again' : 'Start quiz'}</Button> : assignment.quiz_passed || result?.passed ? <Button variant="contained" onClick={onClose}>Done</Button> : <><Button disabled={questionIndex === 0} onClick={() => move(questionIndex - 1)}>Previous</Button>{questionIndex < questions.length - 1 ? <Button variant="contained" disabled={!currentAnswered} onClick={() => move(questionIndex + 1)}>Next</Button> : <Button variant="contained" disabled={busy || !allAnswered} onClick={() => setConfirming(true)}>{busy ? 'Checking…' : 'Review & submit'}</Button>}</>}</Stack></DialogActions>
  </Dialog>
  <Dialog open={confirming} onClose={() => !busy && setConfirming(false)} fullWidth maxWidth="xs"><DialogTitle>Submit learning quiz?</DialogTitle><DialogContent><Typography variant="body2">You answered all {questions.length} questions. Submit now for scoring?</Typography></DialogContent><DialogActions><Button disabled={busy} onClick={() => setConfirming(false)}>Keep reviewing</Button><Button variant="contained" disabled={busy} onClick={() => { setConfirming(false); void onSubmit(); }}>{busy ? 'Submitting…' : 'Submit quiz'}</Button></DialogActions></Dialog>
  </>;
}
