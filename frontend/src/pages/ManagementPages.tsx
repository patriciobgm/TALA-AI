import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  InputAdornment, MenuItem, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, Search } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiAssessment, ApiLearner } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { downloadText } from '../utils/download';

type Subject = { id: number; name: string; code: string; competency_count: number };
type Competency = { id: number; subject: number; code: string; title: string; mastery_threshold: number };
type Resource = { id: number; title: string; resource_type: string; difficulty: string; content: string; competencies: number[]; is_approved: boolean };
const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];

export function AssessmentsPage() {
  const [rows, setRows] = useState<ApiAssessment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<ApiAssessment | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'pre' | 'post'>('pre');
  const [subject, setSubject] = useState<number | ''>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const load = () => Promise.all([api<ApiAssessment[] | { results?: ApiAssessment[] }>('/assessments/'), api<Subject[] | { results?: Subject[] }>('/subjects/')]).then(([assessments, subjectRows]) => { setRows(unwrap(assessments)); const available = unwrap(subjectRows); setSubjects(available); setSubject(current => current || available[0]?.id || ''); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => rows.filter(row => row.title.toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const create = async () => {
    if (!subject) return;
    try { await api('/assessments/', { method: 'POST', body: JSON.stringify({ title, subject, kind, is_active: false }) }); setOpen(false); setTitle(''); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create assessment.'); }
  };
  return <><PageHeader title="Assessments" description="Create competency-aligned assessments and monitor persisted records." action={<Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>Create assessment</Button>} />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Card><Box sx={{ p: 2 }}><TextField size="small" placeholder="Search assessments" value={query} onChange={event => setQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /></Box><Divider /><TableContainer><Table sx={{ minWidth: 760 }}><TableHead><TableRow><TableCell>Assessment</TableCell><TableCell>Type</TableCell><TableCell>Questions</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{visible.map(row => <TableRow key={row.id}><TableCell><Typography variant="body2" fontWeight={650}>{row.title}</Typography></TableCell><TableCell>{row.kind === 'pre' ? 'Diagnostic' : 'Post-assessment'}</TableCell><TableCell>{row.question_count}</TableCell><TableCell><StatusChip label={row.is_active ? 'Active' : 'Draft'} /></TableCell><TableCell align="right"><Button size="small" onClick={() => setViewing(row)}>View</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>{!visible.length && <Box sx={{ p: 4, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">No assessments found.</Typography></Box>}</Card>
    <Dialog component="form" onSubmit={event => { event.preventDefault(); void create(); }} open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Create assessment draft</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Assessment title" value={title} onChange={event => setTitle(event.target.value)} required autoFocus /><TextField select label="Assessment type" value={kind} onChange={event => setKind(event.target.value as 'pre' | 'post')}><MenuItem value="pre">Diagnostic assessment</MenuItem><MenuItem value="post">Post-assessment</MenuItem></TextField><TextField select label="Subject" value={subject} onChange={event => setSubject(Number(event.target.value))} required>{subjects.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><Alert severity="info">The draft is persisted in Django. Question authoring will be added as the next teacher workflow.</Alert></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="contained">Create draft</Button></DialogActions></Dialog>
    <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} fullWidth maxWidth="sm"><DialogTitle>{viewing?.title}</DialogTitle><DialogContent><Stack direction="row" gap={4}><Box><Typography variant="caption" color="text.secondary">Questions</Typography><Typography fontWeight={700}>{viewing?.question_count}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Status</Typography><Typography fontWeight={700}>{viewing?.is_active ? 'Active' : 'Draft'}</Typography></Box></Stack></DialogContent><DialogActions><Button onClick={() => setViewing(null)}>Close</Button></DialogActions></Dialog></>;
}

export function ResourcesPage({ admin = false, readonly = false }: { admin?: boolean; readonly?: boolean }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('lesson');
  const [content, setContent] = useState('');
  const [competency, setCompetency] = useState<number | ''>('');
  const [error, setError] = useState('');
  const load = () => Promise.all([api<Subject[] | { results?: Subject[] }>('/subjects/'), api<Competency[] | { results?: Competency[] }>('/competencies/'), api<Resource[] | { results?: Resource[] }>('/resources/')]).then(([subjectRows, competencyRows, resourceRows]) => { setSubjects(unwrap(subjectRows)); const mapped = unwrap(competencyRows); setCompetencies(mapped); setCompetency(current => current || mapped[0]?.id || ''); setResources(unwrap(resourceRows)); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const openEditor = (resource?: Resource) => { setEditing(resource ?? null); setTitle(resource?.title ?? ''); setType(resource?.resource_type ?? 'lesson'); setContent(resource?.content ?? ''); setCompetency(resource?.competencies[0] ?? competencies[0]?.id ?? ''); setOpen(true); };
  const save = async () => {
    const body = JSON.stringify({ title, resource_type: type, difficulty: 'foundation', content, competencies: competency ? [competency] : [], is_approved: true });
    try { await api(editing ? `/resources/${editing.id}/` : '/resources/', { method: editing ? 'PUT' : 'POST', body }); setOpen(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save resource.'); }
  };

  if (admin) return <><PageHeader title="Subjects & competencies" description="Maintain the curriculum structure used by assessments and recovery plans." />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 3 }}><Card sx={{ p: 2.5 }}><Typography variant="h2">Subjects</Typography><Stack sx={{ mt: 2 }}>{subjects.map((item, index) => <Button key={item.id} variant={index === 0 ? 'contained' : 'text'} sx={{ justifyContent: 'flex-start' }}>{item.name}</Button>)}</Stack></Card><Card><Box sx={{ p: 2.5 }}><Typography variant="h2">{subjects[0]?.name ?? 'Curriculum'}</Typography><Typography variant="body2" color="text.secondary">{competencies.length} competencies</Typography></Box><Divider /><Stack divider={<Divider />}>{competencies.map(item => <Box key={item.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}><Typography variant="caption" color="text.secondary" sx={{ width: 54 }}>{item.code}</Typography><Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.mastery_threshold}% mastery</Typography></Box>)}</Stack></Card></Box></>;

  return <><PageHeader title="Learning resources" description={readonly ? 'Review teacher-approved resources available for your recovery activities.' : 'Manage approved content used by recovery activities and TALA retrieval.'} action={readonly ? undefined : <Button variant="contained" startIcon={<Add />} onClick={() => openEditor()}>Add resource</Button>} />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Card><TableContainer><Table sx={{ minWidth: 680 }}><TableHead><TableRow><TableCell>Resource</TableCell><TableCell>Type</TableCell><TableCell>Difficulty</TableCell><TableCell>Approval</TableCell>{!readonly && <TableCell align="right">Action</TableCell>}</TableRow></TableHead><TableBody>{resources.map(row => <TableRow key={row.id}><TableCell><Typography variant="body2" fontWeight={650}>{row.title}</Typography>{readonly && <Typography variant="caption" color="text.secondary">{row.content}</Typography>}</TableCell><TableCell>{row.resource_type}</TableCell><TableCell>{row.difficulty}</TableCell><TableCell><StatusChip label={row.is_approved ? 'Active' : 'Draft'} /></TableCell>{!readonly && <TableCell align="right"><Button size="small" onClick={() => openEditor(row)}>Edit</Button></TableCell>}</TableRow>)}</TableBody></Table></TableContainer></Card><Dialog component="form" onSubmit={event => { event.preventDefault(); void save(); }} open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Edit resource' : 'Add resource'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Resource title" value={title} onChange={event => setTitle(event.target.value)} required /><TextField select label="Resource type" value={type} onChange={event => setType(event.target.value)}><MenuItem value="lesson">Lesson</MenuItem><MenuItem value="example">Worked example</MenuItem><MenuItem value="exercise">Exercise</MenuItem></TextField><TextField select label="Competency" value={competency} onChange={event => setCompetency(Number(event.target.value))} required>{competencies.map(item => <MenuItem key={item.id} value={item.id}>{item.code} · {item.title}</MenuItem>)}</TextField><TextField label="Approved learning content" value={content} onChange={event => setContent(event.target.value)} multiline minRows={6} required /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="contained">Save resource</Button></DialogActions></Dialog></>;
}

export function ReportsPage() {
  const [learners, setLearners] = useState<ApiLearner[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api<ApiLearner[]>('/dashboard/teacher/learners/').then(setLearners).catch(reason => setError(reason.message)); }, []);
  const assessed = learners.filter(item => item.assessment !== null);
  const average = assessed.length ? Math.round(assessed.reduce((sum, item) => sum + Number(item.assessment), 0) / assessed.length) : 0;
  const mastery = assessed.length ? Math.round(assessed.filter(item => Number(item.assessment) >= 75).length / assessed.length * 100) : 0;
  const exportReport = () => downloadText('tala-recovery-report.csv', ['Learner,Plan progress,Active gaps,Latest assessment,Status', ...learners.map(item => `${item.name},${item.progress}%,${item.gaps},${item.assessment ?? ''},${item.status}`)].join('\n'));
  return <><PageHeader title="Reports" description="Review recovery outcomes calculated from current learner records." action={<Button variant="outlined" disabled={!learners.length} onClick={exportReport}>Export CSV</Button>} />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}><Card sx={{ p: 2.5 }}><Typography variant="h2">Class recovery report</Typography><Divider sx={{ my: 2 }} />{[['Learners', String(learners.length)], ['Assessed learners', String(assessed.length)], ['Average latest assessment', assessed.length ? `${average}%` : '—'], ['Latest assessment mastery rate', assessed.length ? `${mastery}%` : '—']].map(([label, value]) => <Box key={label} sx={{ py: 1, display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700}>{value}</Typography></Box>)}</Card><Card sx={{ p: 2.5 }}><Typography variant="h2">Intervention status</Typography><Divider sx={{ my: 2 }} />{['On track', 'Monitor', 'Intervention'].map(status => <Box key={status} sx={{ py: 1, display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{status}</Typography><Typography variant="body2" fontWeight={700}>{learners.filter(item => item.status === status).length}</Typography></Box>)}</Card></Box></>;
}

export function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<{ provider: string; model: string; available: boolean } | null>(null);
  useEffect(() => { api<{ provider: string; model: string; available: boolean }>('/tutor/health/').then(setProvider).catch(() => setProvider({ provider: 'unavailable', model: 'unknown', available: false })); }, []);
  return <><PageHeader title="System settings" description="Configure deterministic rules and review the local TALA service." />{saved && <Alert severity="success" sx={{ mb: 2, maxWidth: 760 }}>Mastery rules saved for this session.</Alert>}<Stack gap={3} sx={{ maxWidth: 760 }}><Card sx={{ p: 2.5 }}><Typography variant="h2">TALA provider</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Provider credentials and model selection are deployment environment settings.</Typography><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 2, mt: 2, alignItems: 'center' }}><Box><Typography variant="caption" color="text.secondary">Provider</Typography><Typography variant="body2" fontWeight={700}>{provider?.provider ?? 'Checking…'}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Model</Typography><Typography variant="body2" fontWeight={700}>{provider?.model ?? 'Checking…'}</Typography></Box>{provider && <StatusChip label={provider.available ? 'Active' : 'Unavailable'} />}</Box></Card><Card><Box sx={{ p: 2.5 }}><Typography variant="h2">Mastery rules</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>These thresholds classify competency results. TALA does not override them.</Typography></Box><Divider /><Box component="form" onSubmit={event => { event.preventDefault(); setSaved(true); }} sx={{ p: 2.5 }}><Stack gap={2.5} maxWidth={420}><TextField label="Mastered threshold" defaultValue="75" type="number" inputProps={{ min: 1, max: 100 }} /><TextField label="Developing threshold" defaultValue="50" type="number" inputProps={{ min: 1, max: 100 }} /><TextField label="Maximum remediation attempts" defaultValue="3" type="number" inputProps={{ min: 1, max: 10 }} /><Box><Button type="submit" variant="contained">Save changes</Button></Box></Stack></Box></Card></Stack></>;
}
