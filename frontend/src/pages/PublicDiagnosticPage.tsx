import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, FormControl, FormControlLabel, LinearProgress, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import { AccessTimeOutlined, ArrowBack, ArrowForward } from '@mui/icons-material';
import { api } from '../api/client';

type Diagnostic = { code: string; title: string; subject: string; subject_code: string; grade_level: number; question_count: number; time_limit_minutes: number; instructions: string; sections: { id: number; label: string; cluster: number | null }[]; clusters: { id: number; name: string }[] };
type Question = { id: number; prompt: string; question_type: string; options: string[]; character_limit: number };
type Started = { session_id: string; expires_at: string; assessment: { title: string; subject: string; instructions: string; time_limit_minutes: number; questions: Question[] } };
type Result = { score: number; requires_remediation: boolean; account_created: boolean; timed_out: boolean; message: string; email?: string };

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const preventCopy = (event: React.SyntheticEvent) => event.preventDefault();

export function PublicDiagnosticPage() {
  const code = window.location.pathname.match(/^\/diagnostic\/([^/]+)/)?.[1] ?? '';
  const [items, setItems] = useState<Diagnostic[] | null>(null);
  const [selected, setSelected] = useState<Diagnostic | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', lrn: '', password: '', cluster: '' as number | '', section: '' as number | '' });

  useEffect(() => { api<Diagnostic[]>('/public/diagnostics/').then(data => { setItems(data); if (code) setSelected(data.find(item => item.code === code) ?? null); }).catch(reason => setError(reason.message)); }, [code]);
  const sections = useMemo(() => selected?.sections.filter(item => !item.cluster || item.cluster === form.cluster) ?? [], [form.cluster, selected]);
  const submit = async (timedOut = false) => {
    if (!started || busy) return;
    setBusy(true); setError('');
    try {
      const response = await api<Result>(`/public/diagnostics/${selected?.code}/submit/`, { method: 'POST', body: JSON.stringify({ session_id: started.session_id, answers: started.assessment.questions.map(question => ({ question_id: question.id, answer: answers[question.id] ?? '' })) }) });
      setResult({ ...response, timed_out: response.timed_out || timedOut });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit the diagnostic.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!started || result) return;
    const tick = () => { const next = Math.max(0, Math.ceil((new Date(started.expires_at).getTime() - Date.now()) / 1000)); setRemaining(next); if (next === 0) void submit(true); };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  // Re-register on answer changes so timeout submission uses the latest answers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, busy, started, result]);
  const begin = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { setStarted(await api<Started>(`/public/diagnostics/${selected.code}/start/`, { method: 'POST', body: JSON.stringify(form) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to start the diagnostic.'); }
    finally { setBusy(false); }
  };
  const header = <Box component="header" sx={{ bgcolor: '#0F766E', color: '#fff', px: { xs: 2, sm: 4 }, py: 1.5 }}><Stack direction="row" alignItems="center" gap={1.25} maxWidth={1080} mx="auto"><Box component="img" src="/tala.png" alt="TALA-AI" sx={{ width: 42, height: 42, objectFit: 'contain' }} /><Box><Typography fontWeight={800}>TALA-AI</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)' }}>Public Diagnostic Assessment</Typography></Box></Stack></Box>;
  if (!items) return <>{header}<Box sx={{ minHeight: 500, display: 'grid', placeItems: 'center' }}>{error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}</Box></>;
  if (result) return <>{header}<Box component="main" sx={{ maxWidth: 680, mx: 'auto', p: { xs: 2, sm: 5 } }}><Card sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }}><Typography variant="h1">Diagnostic complete</Typography><Typography sx={{ fontSize: 46, fontWeight: 850, color: result.requires_remediation ? 'warning.dark' : 'success.main', my: 2 }}>{Math.round(result.score)}%</Typography>{result.timed_out && <Alert severity="warning" sx={{ mb: 2 }}>Time expired, so unanswered questions were scored as incorrect.</Alert>}<Alert severity={result.account_created ? 'info' : 'success'}>{result.message}</Alert>{result.account_created && <Typography sx={{ mt: 2 }}>Sign in with <strong>{result.email}</strong> to open your recovery plan.</Typography>}<Button variant="contained" component="a" href="/" sx={{ mt: 3 }}>{result.account_created ? 'Sign in' : 'Return to sign in'}</Button></Card></Box></>;
  if (started) {
    const questions = started.assessment.questions; const question = questions[index]; const answered = questions.filter(item => answers[item.id]?.trim()).length; const free = ['short', 'essay'].includes(question.question_type);
    return <Box onCopy={preventCopy} onCut={preventCopy} onContextMenu={preventCopy} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') event.preventDefault(); }} sx={{ minHeight: '100vh', userSelect: 'none', bgcolor: 'background.default' }}>{header}<Box component="main" sx={{ maxWidth: 860, mx: 'auto', p: { xs: 2, sm: 4 } }}><Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} mb={2}><Box><Typography variant="h1">{started.assessment.title}</Typography><Typography color="text.secondary">{answered} of {questions.length} answered</Typography></Box><Box sx={{ display: 'flex', gap: .75, alignItems: 'center', color: remaining <= 60 ? 'error.main' : 'text.primary', fontWeight: 800 }}><AccessTimeOutlined fontSize="small" />{formatTime(remaining)}</Box></Stack><Alert severity="info" sx={{ mb: 2 }}>The timer continues until submission and automatically submits at zero. Assessment text cannot be copied.</Alert>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<LinearProgress variant="determinate" value={((index + 1) / questions.length) * 100} sx={{ mb: 2 }} /><Card sx={{ p: { xs: 2.5, sm: 4 } }}><Typography variant="overline">Question {index + 1} of {questions.length}</Typography><Typography variant="h2" sx={{ mt: 1 }}>{question.prompt}</Typography>{free ? <TextField fullWidth sx={{ mt: 2, userSelect: 'text' }} multiline={question.question_type === 'essay'} minRows={question.question_type === 'essay' ? 4 : undefined} value={answers[question.id] ?? ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))} inputProps={{ maxLength: question.character_limit }} /> : <FormControl sx={{ mt: 2, width: '100%' }}><RadioGroup value={answers[question.id] ?? ''} onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}>{question.options.map(option => <FormControlLabel key={option} value={option} control={<Radio />} label={option} sx={{ border: '1px solid', borderColor: answers[question.id] === option ? 'primary.main' : 'divider', borderRadius: 1, m: 0, mb: 1, px: 1.5, py: .5 }} />)}</RadioGroup></FormControl>}<Stack direction="row" justifyContent="space-between" mt={3}><Button disabled={!index} startIcon={<ArrowBack />} onClick={() => setIndex(value => value - 1)}>Previous</Button>{index < questions.length - 1 ? <Button variant="contained" endIcon={<ArrowForward />} onClick={() => setIndex(value => value + 1)}>Next</Button> : <Button variant="contained" disabled={busy || answered !== questions.length} onClick={() => void submit()}>{busy ? 'Submitting…' : 'Submit diagnostic'}</Button>}</Stack></Card></Box></Box>;
  }
  if (!selected) return <>{header}<Box component="main" sx={{ maxWidth: 960, mx: 'auto', p: { xs: 2, sm: 4 } }}><Typography variant="h1">Choose a subject diagnostic</Typography><Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>You do not need an account. An account is created only if your result identifies competencies that need remediation.</Typography>{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Stack gap={2}>{items.map(item => <Card key={item.code} sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="h2">{item.subject}</Typography><Typography color="text.secondary">{item.title} · Grade {item.grade_level}</Typography><Typography variant="body2" sx={{ mt: 1 }}>{item.question_count} questions · {item.time_limit_minutes} minutes</Typography></Box><Button variant="contained" component="a" href={`/diagnostic/${item.code}`}>Open diagnostic</Button></Stack></Card>)}{!items.length && <Alert severity="info">No public diagnostic is available. Ask the subject teacher to activate one.</Alert>}</Stack><Button component="a" href="/" sx={{ mt: 3 }}>Back to sign in</Button></Box></>;
  return <>{header}<Box component="main" sx={{ maxWidth: 720, mx: 'auto', p: { xs: 2, sm: 4 } }}><Button startIcon={<ArrowBack />} component="a" href="/diagnostic" sx={{ mb: 2 }}>All diagnostics</Button><Card sx={{ p: { xs: 2.5, sm: 4 } }}><Typography variant="overline">{selected.subject_code} · Grade {selected.grade_level}</Typography><Typography variant="h1">{selected.title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Enter your learner information before the {selected.time_limit_minutes}-minute diagnostic begins. Your password is used only if the result creates a remediation account.</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}<Stack gap={2} mt={3}><TextField label="Complete name" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} required /><TextField label="Email" type="email" value={form.email} onChange={event => setForm(value => ({ ...value, email: event.target.value }))} required /><TextField label="12-digit LRN" value={form.lrn} onChange={event => setForm(value => ({ ...value, lrn: event.target.value.replace(/\D/g, '').slice(0, 12) }))} required inputProps={{ inputMode: 'numeric', maxLength: 12 }} /><TextField label="Password for recovery access" type="password" value={form.password} onChange={event => setForm(value => ({ ...value, password: event.target.value }))} helperText="At least 8 characters. It is retained only when remediation access is created." required /><TextField select label="Cluster" value={form.cluster} onChange={event => setForm(value => ({ ...value, cluster: Number(event.target.value), section: '' }))} required>{selected.clusters.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><TextField select label="Section" value={form.section} onChange={event => setForm(value => ({ ...value, section: Number(event.target.value) }))} disabled={!form.cluster} required>{sections.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField><Alert severity="warning">Starting begins the timer. Do not refresh or close the page.</Alert><Button variant="contained" size="large" disabled={busy || !form.name.trim() || !form.email.includes('@') || form.lrn.length !== 12 || form.password.length < 8 || !form.cluster || !form.section} onClick={() => void begin()}>{busy ? 'Starting…' : 'Start timed diagnostic'}</Button></Stack></Card></Box></>;
}
