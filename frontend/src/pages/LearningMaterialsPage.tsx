import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { CheckOutlined, FitScreenOutlined, FullscreenOutlined, MenuBookOutlined, PlayCircleOutline, PsychologyOutlined, ZoomInOutlined, ZoomOutOutlined } from '@mui/icons-material';
import { api, normalizeProtectedUrl } from '../api/client';
import type { LearningAssignment } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useStudentScope } from '../components/StudentScopeContext';
import { useTalaChatContext } from '../components/TalaChatContext';
import { LearningQuizDialog } from '../components/LearningQuizDialog';

const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];

export function LearningMaterialsPage() {
  const [assignments, setAssignments] = useState<LearningAssignment[] | null>(null);
  const [selected, setSelected] = useState<LearningAssignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(100);
  const [pdfError, setPdfError] = useState('');
  const [pdfRetry, setPdfRetry] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean; required_score: number } | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<number | null>(null);
  const lastSavedSecond = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scope = useStudentScope();
  const { setLearningContext } = useTalaChatContext();

  const replaceAssignment = (updated: LearningAssignment) => {
    setSelected(updated);
    setAssignments(current => current?.map(item => item.id === updated.id ? updated : item) ?? null);
  };
  const load = useCallback(() => { if (!scope?.selectedSubjectId) return Promise.resolve(); return api<LearningAssignment[] | { results?: LearningAssignment[] }>(`/learning-assignments/?subject=${scope.selectedSubjectId}`).then(result => setAssignments(unwrap(result))).catch(reason => setError(reason.message)); }, [scope?.selectedSubjectId]);
  useEffect(() => { setAssignments(null); setSelected(null); void load(); }, [load]);
  useEffect(() => {
    if (!selected?.file_url || selected.resource_type === 'video') { setPdfPreviewUrl(''); setPdfError(''); return; }
    setPdfBusy(false); setPdfError('');
    setPdfPreviewUrl(normalizeProtectedUrl(selected.file_url));
  }, [selected?.file_url, selected?.resource_type, pdfRetry]);
  useEffect(() => {
    if (!selected) { setLearningContext(null); return; }
    const focusedQuestion = selected.practice_questions.find(question => question.id === focusedQuestionId);
    setLearningContext({ contextType: 'learning_material', assignmentId: selected.id, competency: selected.competency?.title ?? 'General learning material', activityTitle: selected.resource_title, questionId: focusedQuestion?.id, questionPrompt: focusedQuestion?.prompt, selectedAnswer: focusedQuestion ? quizAnswers[focusedQuestion.id] : undefined });
  }, [focusedQuestionId, quizAnswers, selected, setLearningContext]);
  useEffect(() => () => setLearningContext(null), [setLearningContext]);
  const ordered = useMemo(() => [...(assignments ?? [])].sort((a, b) => Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [assignments]);

  const openMaterial = async (assignment: LearningAssignment) => {
    setBusy(true); setError(''); setPdfError(''); setPdfZoom(100); setQuizAnswers({}); setQuizResult(null); setQuizOpen(false); setFocusedQuestionId(null);
    try { replaceAssignment(await api<LearningAssignment>(`/learning-assignments/${assignment.id}/open/`, { method: 'POST' })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open this learning material.'); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { replaceAssignment(await api<LearningAssignment>(`/learning-assignments/${selected.id}/complete/`, { method: 'POST' })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete this material.'); }
    finally { setBusy(false); }
  };
  const openMaterialTala = () => {
    if (!selected) return;
    const focusedQuestion = selected.practice_questions.find(question => question.id === focusedQuestionId);
    setLearningContext({ contextType: 'learning_material', assignmentId: selected.id, competency: selected.competency?.title ?? 'General learning material', activityTitle: selected.resource_title, questionId: focusedQuestion?.id, questionPrompt: focusedQuestion?.prompt, selectedAnswer: focusedQuestion ? quizAnswers[focusedQuestion.id] : undefined, openChat: true });
  };
  const submitQuiz = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ score: number; passed: boolean; required_score: number; assignment: LearningAssignment }>(`/learning-assignments/${selected.id}/submit-quiz/`, { method: 'POST', body: JSON.stringify({ answers: selected.practice_questions.map(question => ({ question_id: question.id, answer: quizAnswers[question.id] })) }) });
      setQuizResult(result); replaceAssignment(result.assignment);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit the module quiz.'); }
    finally { setBusy(false); }
  };
  const savePlayback = async (video: HTMLVideoElement, force = false) => {
    if (!selected || selected.resource_type !== 'video') return;
    const position = Math.floor(video.currentTime);
    const duration = Number.isFinite(video.duration) ? Math.floor(video.duration) : 0;
    if (!force && Math.abs(position - lastSavedSecond.current) < 10) return;
    lastSavedSecond.current = position;
    try {
      const updated = await api<LearningAssignment>(`/learning-assignments/${selected.id}/progress/`, { method: 'POST', body: JSON.stringify({ position_seconds: position, duration_seconds: duration }) });
      const progressOnly = (current: LearningAssignment) => ({ ...current, playback_position_seconds: updated.playback_position_seconds, duration_seconds: updated.duration_seconds, progress_percent: updated.progress_percent, opened_at: updated.opened_at, completed_at: updated.completed_at });
      setSelected(current => current?.id === updated.id ? progressOnly(current) : current);
      setAssignments(current => current?.map(item => item.id === updated.id ? progressOnly(item) : item) ?? null);
    }
    catch { /* A later playback event retries without interrupting the video. */ }
  };

  if (scope && !scope.loading && !scope.selectedSubjectId) return <><PageHeader title="Learning Materials" /><Alert severity="info">No subject with assigned learning materials is available yet.</Alert></>;
  if (!assignments && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  return <>
    <PageHeader title="Learning Materials" description="Complete the modules and videos assigned to your class." />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Card><Stack divider={<Divider />}>
      {ordered.map(item => <Box key={item.id} sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '40px minmax(0, 1fr) auto' }, alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, width: 40, height: 40, placeItems: 'center', bgcolor: '#edf3f6', color: 'primary.dark', borderRadius: 1 }}>{item.resource_type === 'video' ? <PlayCircleOutline /> : <MenuBookOutlined />}</Box>
        <Box><Stack direction="row" alignItems="center" gap={1} flexWrap="wrap"><Typography variant="body1" fontWeight={700}>{item.resource_title}</Typography><StatusChip label={item.completed_at ? 'Completed' : item.latest_quiz_score !== null ? 'Quiz needs retry' : item.opened_at ? 'In Progress' : 'Assigned'} />{item.quiz_required && <StatusChip label={item.quiz_passed ? 'Quiz passed' : item.latest_quiz_score !== null ? `Latest quiz ${Math.round(Number(item.latest_quiz_score))}%` : 'Quiz included'} />}</Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{item.competency ? `${item.competency.code} · ${item.competency.title}` : 'General learning material'}{item.due_at ? ` · Due ${new Date(item.due_at).toLocaleDateString()}` : ''}</Typography><Typography variant="caption" color="text.secondary">Uploaded by {item.uploaded_by_name}</Typography>{item.quiz_required && item.latest_quiz_score !== null && !item.quiz_passed && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: .5 }}>Attempt recorded · {Math.round(Number(item.latest_quiz_score))}% scored · {item.passing_score}% required to complete</Typography>}{item.resource_type === 'video' && item.opened_at && !item.completed_at && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, maxWidth: 360 }}><LinearProgress variant="determinate" value={item.progress_percent} sx={{ flex: 1, height: 6 }} /><Typography variant="caption" color="text.secondary">{item.progress_percent}%</Typography></Box>}{item.instructions && <Typography variant="body2" sx={{ mt: .75 }}>{item.instructions}</Typography>}</Box>
        <Button variant={item.completed_at ? 'text' : 'outlined'} onClick={() => void openMaterial(item)} disabled={busy}>{item.completed_at ? 'Review' : item.opened_at ? 'Continue' : 'Open Material'}</Button>
      </Box>)}
    </Stack>{!ordered.length && <Box sx={{ p: 6, textAlign: 'center' }}><MenuBookOutlined color="disabled" /><Typography fontWeight={700} sx={{ mt: 1 }}>No learning materials assigned</Typography><Typography variant="body2" color="text.secondary">New modules and videos assigned by your teacher will appear here.</Typography></Box>}</Card>
    {selected && <Dialog open={!quizOpen} onClose={() => !busy && setSelected(null)} fullWidth maxWidth="lg">
      <DialogTitle><Typography variant="overline" color="text.secondary">{selected.resource_type}</Typography><Typography variant="h2">{selected.resource_title}</Typography>{selected.competency && <Typography variant="body2" color="text.secondary">{selected.competency.code} · {selected.competency.title}</Typography>}{selected.quiz_required && <Typography variant="caption" color="primary.main" fontWeight={750} sx={{ display: 'block', mt: .5 }}>{selected.quiz_passed ? 'Learning quiz passed' : selected.latest_quiz_score !== null ? `Latest attempt ${Math.round(Number(selected.latest_quiz_score))}% · Pass ${selected.passing_score}% to complete` : `Learning quiz required · Pass ${selected.passing_score}% to complete`}</Typography>}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {selected.instructions && <Alert severity="info" sx={{ m: 2 }}>{selected.instructions}</Alert>}
        {selected.resource_type === 'video' && selected.file_url ? <Box sx={{ p: 2 }}><Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}><Typography variant="body2" fontWeight={650} sx={{ flex: 1 }}>Video lesson</Typography><Button size="small" startIcon={<FullscreenOutlined />} onClick={() => void videoRef.current?.requestFullscreen()}>Full screen</Button></Box><video ref={videoRef} controls playsInline preload="metadata" src={normalizeProtectedUrl(selected.file_url)} onLoadedMetadata={event => { const video = event.currentTarget; lastSavedSecond.current = selected.playback_position_seconds; if (selected.playback_position_seconds > 0 && selected.playback_position_seconds < video.duration - 2) video.currentTime = selected.playback_position_seconds; }} onTimeUpdate={event => void savePlayback(event.currentTarget)} onPause={event => void savePlayback(event.currentTarget, true)} onEnded={event => { void savePlayback(event.currentTarget, true).then(() => complete()); }} style={{ width: '100%', maxHeight: '68vh', background: '#111', borderRadius: 8 }}><track kind="captions" /></video>{selected.playback_position_seconds > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Continues from your saved position ({Math.floor(selected.playback_position_seconds / 60)}:{String(selected.playback_position_seconds % 60).padStart(2, '0')}).</Typography>}</Box> : selected.file_url ? <>
          <Box sx={{ minHeight: 48, px: 2, display: 'flex', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}><Typography variant="body2" fontWeight={650} sx={{ flex: 1 }}>Document reader</Typography><Tooltip title="Zoom out"><span><IconButton size="small" disabled={pdfZoom <= 75} onClick={() => setPdfZoom(value => Math.max(75, value - 25))}><ZoomOutOutlined /></IconButton></span></Tooltip><Typography variant="caption" sx={{ width: 52, textAlign: 'center' }}>{pdfZoom}%</Typography><Tooltip title="Zoom in"><span><IconButton size="small" disabled={pdfZoom >= 200} onClick={() => setPdfZoom(value => Math.min(200, value + 25))}><ZoomInOutlined /></IconButton></span></Tooltip><Tooltip title="Fit width"><IconButton size="small" onClick={() => setPdfZoom(100)}><FitScreenOutlined /></IconButton></Tooltip></Box>
          {pdfBusy ? <Box sx={{ minHeight: 420, display: 'grid', placeItems: 'center' }}><Stack alignItems="center" gap={1.5}><CircularProgress size={28} /><Typography variant="body2" color="text.secondary">Preparing document preview…</Typography></Stack></Box> : pdfPreviewUrl ? <Box sx={{ width: '100%', height: '68vh', overflow: 'auto', bgcolor: '#e9edf0' }}><Box component="iframe" title={selected.resource_title} src={pdfPreviewUrl} sx={{ display: 'block', width: `${pdfZoom}%`, height: `calc(68vh * ${pdfZoom / 100})`, minHeight: 520, border: 0, bgcolor: '#fff', mx: pdfZoom <= 100 ? 'auto' : 0 }} /></Box> : <Alert severity="error" sx={{ m: 2 }} action={<Stack direction="row"><Button color="inherit" size="small" onClick={() => setPdfRetry(value => value + 1)}>Retry</Button><Button color="inherit" size="small" component="a" href={normalizeProtectedUrl(selected.file_url)} target="_blank" rel="noreferrer">Open Separately</Button></Stack>}>{pdfError || 'The PDF preview could not be prepared.'}</Alert>}
        </> : <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.8, p: 3 }}>{selected.resource_content}</Typography>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: { xs: 2, sm: 3 } }}><Button onClick={() => setSelected(null)} disabled={busy}>Close</Button><Button variant="outlined" startIcon={<PsychologyOutlined />} onClick={openMaterialTala}>Ask TALA</Button>{selected.quiz_required ? <Button variant="contained" disabled={busy || selected.quiz_passed} onClick={() => setQuizOpen(true)}>{selected.quiz_passed ? 'Quiz Passed' : 'Take Learning Quiz'}</Button> : <Button variant="contained" startIcon={<CheckOutlined />} onClick={() => void complete()} disabled={busy || Boolean(selected.completed_at)}>{selected.completed_at ? 'Completed' : busy ? 'Saving…' : 'Mark as Completed'}</Button>}</DialogActions>
    </Dialog>}
    {selected?.quiz_required && <LearningQuizDialog assignment={selected} open={quizOpen} answers={quizAnswers} result={quizResult} busy={busy} onAnswers={setQuizAnswers} onClose={() => setQuizOpen(false)} onSubmit={submitQuiz} onFocusQuestion={setFocusedQuestionId} onAskTala={question => { setFocusedQuestionId(question.id); setLearningContext({ contextType: 'learning_material', assignmentId: selected.id, competency: selected.competency?.title ?? 'General learning material', activityTitle: selected.resource_title, questionId: question.id, questionPrompt: question.prompt, selectedAnswer: quizAnswers[question.id], openChat: true }); }} />}
  </>;
}
