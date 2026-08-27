import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Divider, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import { Check, LockOutlined, RadioButtonChecked, SendOutlined } from '@mui/icons-material';
import { PageHeader } from '../components/PageHeader';
import { api } from '../api/client';
import type { ApiActivity, ApiPlan } from '../api/types';

type Message = { sender: 'tala' | 'student'; text: string; sources?: { id: number; title: string }[] };
const actions = [{ label: 'Explain it', value: 'explain' }, { label: 'Give an example', value: 'example' }, { label: 'Give me a hint', value: 'hint' }, { label: 'Check my understanding', value: 'check' }];

export function RecoveryWorkspace() {
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ sender: 'tala', text: 'Ask for help with the current competency. My answer will use only teacher-approved resources.' }]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<{ results?: ApiPlan[] } | ApiPlan[]>('/recovery-plans/').then(result => { const items = Array.isArray(result) ? result : result.results ?? []; setPlans(items); const plan = items.find(item => item.status === 'active'); if (plan) setSelectedId(current => current ?? plan.activities.find(item => !item.completed_at)?.id ?? plan.activities[0]?.id ?? null); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const plan = plans?.find(item => item.status === 'active') ?? plans?.[0];
  const selected = plan?.activities.find(item => item.id === selectedId);
  const completed = plan?.activities.filter(item => item.completed_at).length ?? 0;
  const progress = plan?.activities.length ? Math.round(completed / plan.activities.length * 100) : 0;
  const canOpen = (activity: ApiActivity) => !plan?.activities.some(item => item.position < activity.position && !item.completed_at);

  const complete = async (activity: ApiActivity) => {
    if (!plan) return;
    setBusy(true); setError('');
    try {
      await api(`/recovery-plans/${plan.id}/activities/${activity.id}/complete/`, { method: 'POST', body: JSON.stringify({ answers: {} }) });
      await load();
      const next = plan.activities.find(item => item.position > activity.position && !item.completed_at);
      if (next) setSelectedId(next.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete activity.'); } finally { setBusy(false); }
  };

  const ask = async (text: string, action = 'explain') => {
    if (!text.trim() || !plan) return;
    setMessages(current => [...current, { sender: 'student', text }]); setDraft(''); setBusy(true); setError('');
    try {
      const response = await api<{ answer: string; sources: { id: number; title: string }[] }>(`/tutor/plans/${plan.id}/messages/`, { method: 'POST', body: JSON.stringify({ message: text, action }) });
      setMessages(current => [...current, { sender: 'tala', text: response.answer, sources: response.sources }]);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'TALA is temporarily unavailable.';
      setMessages(current => [...current, { sender: 'tala', text: `${message} You can continue the lesson and assessments without AI assistance.` }]);
    } finally { setBusy(false); }
  };

  if (!plans && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!plan) return <><PageHeader parent="My learning" title="Recovery plan" /><Alert severity="info">No recovery plan is assigned. Complete a diagnostic assessment first.</Alert></>;

  return <>
    <PageHeader parent="My learning" title="Recovery plan" description={plan.competency_title} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr) 380px' }, gap: 3, alignItems: 'start' }}>
      <Card sx={{ overflow: 'hidden' }}><Box sx={{ p: 2.5 }}><Typography variant="h3">Plan activities</Typography><Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5 }}><LinearProgress variant="determinate" value={progress} sx={{ flex: 1, height: 7, borderRadius: 1 }} /><Typography variant="caption" fontWeight={700}>{progress}%</Typography></Box></Box><Divider /><Stack divider={<Divider />}>{plan.activities.map(activity => { const unlocked = canOpen(activity); return <Button key={activity.id} color="inherit" onClick={() => unlocked && setSelectedId(activity.id)} disabled={!unlocked} sx={{ p: 2, borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left', bgcolor: selectedId === activity.id ? '#eef4f8' : '#fff' }}><Box sx={{ width: 26, height: 26, mr: 1.25, borderRadius: '50%', border: '1px solid', borderColor: activity.completed_at ? 'success.main' : unlocked ? 'primary.main' : 'divider', bgcolor: activity.completed_at ? 'success.main' : '#fff', color: activity.completed_at ? '#fff' : unlocked ? 'primary.main' : 'text.disabled', display: 'grid', placeItems: 'center' }}>{activity.completed_at ? <Check sx={{ fontSize: 16 }} /> : unlocked ? <RadioButtonChecked sx={{ fontSize: 14 }} /> : <LockOutlined sx={{ fontSize: 14 }} />}</Box><Box><Typography variant="body2" fontWeight={selectedId === activity.id ? 700 : 600}>{activity.title}</Typography><Typography variant="caption" color="text.secondary">{activity.completed_at ? 'Completed' : unlocked ? 'Available' : 'Locked'}</Typography></Box></Button>; })}</Stack></Card>
      <Card sx={{ minHeight: 460 }}><Box sx={{ p: { xs: 2.5, sm: 3 } }}>{selected ? <><Typography variant="overline" color="text.secondary" fontWeight={700}>{selected.resource_type ?? 'Mastery activity'}</Typography><Typography variant="h2" sx={{ mt: .5 }}>{selected.title}</Typography><Divider sx={{ my: 2.5 }} />{selected.content ? <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{selected.content}</Typography> : <Alert severity="info">This mastery check is completed from the Assessments module after all learning resources are finished.</Alert>}<Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>{selected.completed_at ? <Button disabled startIcon={<Check />}>Completed</Button> : selected.resource ? <Button variant="contained" onClick={() => complete(selected)} disabled={busy}>Mark activity complete</Button> : null}</Box></> : <Typography color="text.secondary">Select an activity to begin.</Typography>}</Box></Card>
      <Card sx={{ overflow: 'hidden', position: { lg: 'sticky' }, top: { lg: 124 } }}><Box sx={{ p: 2.5, bgcolor: '#f8fafb', borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="h2">Ask TALA</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Local Llama assistance grounded in approved resources.</Typography></Box><Box aria-live="polite" sx={{ p: 2, height: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>{messages.map((message, index) => <Box key={index} sx={{ alignSelf: message.sender === 'student' ? 'flex-end' : 'flex-start', maxWidth: '92%', p: 1.5, borderRadius: 1.5, bgcolor: message.sender === 'student' ? 'primary.main' : '#eef2f5', color: message.sender === 'student' ? '#fff' : 'text.primary' }}><Typography variant="body2">{message.text}</Typography>{message.sources?.length ? <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: .75 }}>Sources: {message.sources.map(source => source.title).join(', ')}</Typography> : null}</Box>)}</Box><Divider /><Box sx={{ p: 2 }}><Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>{actions.map(action => <Button key={action.value} size="small" variant="outlined" disabled={busy} onClick={() => ask(action.label, action.value)}>{action.label}</Button>)}</Stack><Box component="form" onSubmit={event => { event.preventDefault(); ask(draft); }} sx={{ display: 'flex', gap: 1 }}><TextField fullWidth size="small" label="Ask about this lesson" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} /><Button type="submit" variant="contained" disabled={busy || !draft.trim()} aria-label="Send question" sx={{ minWidth: 44, px: 1 }}><SendOutlined fontSize="small" /></Button></Box></Box></Card>
    </Box>
  </>;
}
