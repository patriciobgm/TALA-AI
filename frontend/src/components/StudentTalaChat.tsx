import { useEffect, useRef, useState } from 'react';
import { Box, Button, Card, CircularProgress, Collapse, Divider, IconButton, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { KeyboardArrowUp, Remove, SendOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiPlan } from '../api/types';
import { useTalaChatContext } from './TalaChatContext';

type Source = { number: number; chunk_id: number; resource_id: number; title: string; resource_type: string; locator: string; excerpt: string };
type Message = { sender: 'tala' | 'student'; text: string; sources?: Source[]; groundingStatus?: string };
const actions = [{ label: 'Explain', value: 'explain' }, { label: 'Example', value: 'example' }, { label: 'Hint', value: 'hint' }, { label: 'Simpler', value: 'simplify' }, { label: 'Check me', value: 'check' }];
const welcome: Message = { sender: 'tala', text: 'I can explain, give a hint, or check your understanding using approved learning materials and your current activity.' };

export function StudentTalaChat() {
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  const [planId, setPlanId] = useState<number | ''>('');
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const theme = useTheme();
  const compactScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [minimized, setMinimized] = useState(true);
  const messageBox = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const { learningContext } = useTalaChatContext();

  useEffect(() => {
    api<ApiPlan[] | { results?: ApiPlan[] }>('/recovery-plans/').then(result => {
      const found = Array.isArray(result) ? result : result.results ?? [];
      const active = found.filter(item => item.status === 'active');
      const available = active.length ? active : found;
      setPlans(available);
      setPlanId(available[0]?.id ?? '');
    }).catch(() => undefined);
  }, []);
  useEffect(() => { if (learningContext?.contextType === 'recovery') setPlanId(learningContext.planId); }, [learningContext]);
  useEffect(() => { if (learningContext?.openChat) setMinimized(false); }, [learningContext]);
  useEffect(() => { if (!minimized) messageBox.current?.scrollTo({ top: messageBox.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy, minimized]);
  useEffect(() => {
    if (minimized) return;
    const minimizeOnOutsideClick = (event: PointerEvent) => {
      if (chatBox.current && !chatBox.current.contains(event.target as Node)) setMinimized(true);
    };
    document.addEventListener('pointerdown', minimizeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', minimizeOnOutsideClick);
  }, [minimized]);

  const ask = async (text: string, action = 'explain') => {
    if (!text.trim() || (!planId && learningContext?.contextType !== 'learning_material')) return;
    setMessages(current => [...current, { sender: 'student', text: text.trim() }]); setDraft(''); setBusy(true);
    try {
      const materialContext = learningContext?.contextType === 'learning_material' ? learningContext : null;
      const recoveryContext = learningContext?.contextType === 'recovery' && learningContext.planId === planId ? learningContext : null;
      const endpoint = materialContext ? `/tutor/learning-assignments/${materialContext.assignmentId}/messages/` : `/tutor/plans/${planId}/messages/`;
      const response = await api<{ answer: string; grounding_status: string; sources: Source[] }>(endpoint, { method: 'POST', body: JSON.stringify({ message: text.trim(), action, activity_id: recoveryContext?.activityId, question_id: materialContext?.questionId ?? recoveryContext?.questionId, selected_answer: materialContext?.selectedAnswer ?? recoveryContext?.selectedAnswer }) });
      setMessages(current => [...current, { sender: 'tala', text: response.answer, sources: response.sources, groundingStatus: response.grounding_status }]);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'TALA is temporarily unavailable.';
      setMessages(current => [...current, { sender: 'tala', text: `${message} You can continue your recovery work without assistance.` }]);
    } finally { setBusy(false); }
  };

  const currentPlan = plans.find(plan => plan.id === planId);
  const contextLabel = learningContext ? learningContext.questionPrompt || learningContext.activityTitle : currentPlan?.competency_title;
  const canAsk = Boolean(planId || learningContext?.contextType === 'learning_material');
  return <Card ref={chatBox} sx={{ position: 'fixed', zIndex: theme => learningContext?.contextType === 'learning_material' ? theme.zIndex.modal + 1 : theme.zIndex.drawer + 2, right: { xs: 12, sm: 24 }, bottom: { xs: 12, sm: 24 }, width: { xs: minimized ? 236 : 'calc(100vw - 24px)', sm: minimized ? 280 : 370 }, maxHeight: compactScreen ? 'calc(100vh - 88px)' : 'none', overflow: 'hidden', boxShadow: '0 10px 30px rgba(18, 38, 52, .18)', transition: 'width 160ms ease' }}>
    <Box sx={{ minHeight: 58, px: 2, display: 'flex', alignItems: 'center', gap: 1.25, bgcolor: 'primary.dark', color: '#fff' }}><Box component="img" src="/tala.png" alt="Ask TALA" sx={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', bgcolor: '#fff' }} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={800}>Ask TALA</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.76)' }}>{busy ? 'Preparing a response…' : minimized ? 'Open learning support' : 'Learning support'}</Typography></Box><Tooltip title={minimized ? 'Expand TALA' : 'Minimize TALA'}><IconButton size="small" onClick={() => setMinimized(value => !value)} aria-label={minimized ? 'Expand TALA chat' : 'Minimize TALA chat'} aria-expanded={!minimized} sx={{ color: '#fff' }}>{minimized ? <KeyboardArrowUp /> : <Remove />}</IconButton></Tooltip></Box>
    <Collapse in={!minimized} timeout={160}><Box>{contextLabel && <Box sx={{ px: 2, py: 1.25, bgcolor: '#f8fafb' }}><Typography variant="caption" color="text.secondary">Helping with</Typography><Typography variant="body2" fontWeight={700} noWrap title={contextLabel}>{contextLabel}</Typography></Box>}<Divider /><Box ref={messageBox} aria-live="polite" aria-busy={busy} sx={{ p: 2, height: { xs: 250, sm: 310 }, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25 }}>{messages.map((message, index) => <Box key={index} sx={{ alignSelf: message.sender === 'student' ? 'flex-end' : 'flex-start', maxWidth: '90%', p: 1.25, borderRadius: 1.5, bgcolor: message.sender === 'student' ? 'primary.main' : '#eef2f5', color: message.sender === 'student' ? '#fff' : 'text.primary' }}><Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{message.text}</Typography>{message.sources?.length ? <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'rgba(80,100,112,.18)' }}><Typography variant="caption" fontWeight={750}>Approved sources</Typography>{message.sources.map(source => <Typography key={source.chunk_id} variant="caption" color="text.secondary" sx={{ display: 'block', mt: .35 }}>[{source.number}] {source.title}{source.locator ? ` · ${source.locator}` : ''}</Typography>)}</Box> : message.groundingStatus === 'insufficient_evidence' ? <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: .75 }}>No approved source was available for this answer.</Typography> : null}</Box>)}{busy && <Box sx={{ alignSelf: 'flex-start', display: 'flex', gap: 1, alignItems: 'center', p: 1.25, borderRadius: 1.5, bgcolor: '#eef2f5' }}><CircularProgress size={14} /><Typography variant="body2" color="text.secondary">Reviewing your activity and approved sources…</Typography></Box>}</Box><Divider /><Box sx={{ p: 1.5 }}><Stack direction="row" useFlexGap flexWrap="wrap" gap={.75} sx={{ mb: 1.25 }}>{actions.map(action => <Button key={action.value} size="small" variant="outlined" disabled={busy || !canAsk} onClick={() => void ask(action.label, action.value)}>{action.label}</Button>)}</Stack><Box component="form" onSubmit={event => { event.preventDefault(); void ask(draft); }} sx={{ display: 'flex', gap: 1 }}><TextField fullWidth size="small" label="Ask about this question" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy || !canAsk} /><Button type="submit" variant="contained" disabled={busy || !canAsk || !draft.trim()} aria-label="Send question" sx={{ minWidth: 42, px: 1 }}><SendOutlined fontSize="small" /></Button></Box>{!canAsk && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Open a recovery activity or learning material to start a TALA conversation.</Typography>}</Box></Box></Collapse>
  </Card>;
}
