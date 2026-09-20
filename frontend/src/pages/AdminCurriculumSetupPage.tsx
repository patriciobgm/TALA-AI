import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Checkbox, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { Add, EditOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass, ApiCluster, ApiOffering, ApiSubject } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useUrlView } from '../utils/useUrlView';
import { SubjectsPage } from './CurriculumPages';

type Teacher = { id: number; name: string; email: string; is_active: boolean };
const views = ['subjects', 'clusters', 'sections', 'offerings'] as const;
const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];

export function AdminCurriculumSetupPage({ onOpenCompetencies }: { onOpenCompetencies: (subjectId: number) => void }) {
  const [view, setView] = useUrlView(views, 'subjects');
  return <>
    <Card sx={{ mb: 3 }}><Tabs value={view} onChange={(_, value) => setView(value)} variant="scrollable" scrollButtons="auto"><Tab value="subjects" label="Subjects & Curriculum" /><Tab value="clusters" label="Clusters" /><Tab value="sections" label="Sections & Advisers" /><Tab value="offerings" label="Subject Offerings" /></Tabs></Card>
    {view === 'subjects' && <SubjectsPage onOpenCompetencies={onOpenCompetencies} />}
    {view === 'clusters' && <ClusterManager />}
    {view === 'sections' && <SectionManager />}
    {view === 'offerings' && <OfferingManager />}
  </>;
}

function SectionManager() {
  const [rows, setRows] = useState<ApiClass[]>([]);
  const [clusters, setClusters] = useState<ApiCluster[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [editor, setEditor] = useState<ApiClass | null | undefined>();
  const [form, setForm] = useState({ name: '', grade_level: 11, cluster: '' as number | '', adviser: '' as number | '', school_year: '2026-2027', is_active: true });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => Promise.all([
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/?page_size=250'),
    api<ApiCluster[] | { results?: ApiCluster[] }>('/clusters/?page_size=100'),
    api<Teacher[] | { results?: Teacher[] }>('/users/?role=teacher&page_size=250'),
  ]).then(([sectionRows, clusterRows, teacherRows]) => { setRows(unwrap(sectionRows)); setClusters(unwrap(clusterRows)); setTeachers(unwrap(teacherRows)); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const open = (row?: ApiClass) => { setEditor(row ?? null); setForm(row ? { name: row.name, grade_level: row.grade_level, cluster: row.cluster ?? '', adviser: row.adviser ?? '', school_year: row.school_year, is_active: row.is_active } : { name: '', grade_level: 11, cluster: clusters.find(item => item.is_active)?.id ?? '', adviser: '', school_year: '2026-2027', is_active: true }); };
  const save = async () => { try { await api(editor ? `/classes/${editor.id}/` : '/classes/', { method: editor ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, cluster: form.cluster || null, adviser: form.adviser || null }) }); setEditor(undefined); setMessage(editor ? 'Section updated.' : 'Section created.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the section.'); } };
  return <>
    <PageHeader title="Sections & Advisers" description="Maintain grade-level sections, cluster placement, school year, and the adviser shown during learner registration." action={<Button variant="contained" startIcon={<Add />} onClick={() => open()}>Add Section</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}{message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    <Card><TableContainer><Table sx={{ minWidth: 780 }}><TableHead><TableRow><TableCell>Section</TableCell><TableCell>Grade</TableCell><TableCell>Cluster</TableCell><TableCell>Adviser</TableCell><TableCell>School Year</TableCell><TableCell>Learners</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell><Typography fontWeight={700}>{row.name}</Typography></TableCell><TableCell>Grade {row.grade_level}</TableCell><TableCell>{clusters.find(item => item.id === row.cluster)?.name ?? 'Shared / not restricted'}</TableCell><TableCell>{teachers.find(item => item.id === row.adviser)?.name ?? 'To be assigned'}</TableCell><TableCell>{row.school_year}</TableCell><TableCell>{row.student_count}</TableCell><TableCell><StatusChip label={row.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => open(row)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></Card>
    <Dialog component="form" open={editor !== undefined} onClose={() => setEditor(undefined)} onSubmit={event => { event.preventDefault(); void save(); }} fullWidth maxWidth="sm"><DialogTitle>{editor ? 'Edit Section' : 'Add Section'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Section Name" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} required /><TextField select label="Grade Level" value={form.grade_level} onChange={event => setForm(value => ({ ...value, grade_level: Number(event.target.value) }))}><MenuItem value={11}>Grade 11</MenuItem><MenuItem value={12}>Grade 12</MenuItem></TextField><TextField select label="Cluster" value={form.cluster} onChange={event => setForm(value => ({ ...value, cluster: Number(event.target.value) }))}><MenuItem value="">Shared / not restricted</MenuItem>{clusters.filter(item => item.is_active).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><TextField select label="Adviser" value={form.adviser} onChange={event => setForm(value => ({ ...value, adviser: Number(event.target.value) }))}><MenuItem value="">To be assigned</MenuItem>{teachers.filter(item => item.is_active).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><TextField label="School Year" value={form.school_year} onChange={event => setForm(value => ({ ...value, school_year: event.target.value }))} required /><FormControlLabel control={<Checkbox checked={form.is_active} onChange={event => setForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Section is active" /></Stack></DialogContent><DialogActions><Button onClick={() => setEditor(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save Section</Button></DialogActions></Dialog>
  </>;
}

function ClusterManager() {
  const [rows, setRows] = useState<ApiCluster[]>([]);
  const [editor, setEditor] = useState<ApiCluster | null | undefined>();
  const [form, setForm] = useState({ name: '', code: '', description: '', is_active: true });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => api<ApiCluster[] | { results?: ApiCluster[] }>('/clusters/?page_size=100').then(value => setRows(unwrap(value))).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const open = (row?: ApiCluster) => { setEditor(row ?? null); setForm(row ? { name: row.name, code: row.code, description: row.description, is_active: row.is_active } : { name: '', code: '', description: '', is_active: true }); };
  const save = async () => { try { await api(editor ? `/clusters/${editor.id}/` : '/clusters/', { method: editor ? 'PATCH' : 'POST', body: JSON.stringify(form) }); setEditor(undefined); setMessage(editor ? 'Cluster updated.' : 'Cluster created.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the cluster.'); } };
  return <>
    <PageHeader title="Clusters" description="Control which learning areas are available to each learner pathway. Additional clusters can be added without changing the application." action={<Button variant="contained" startIcon={<Add />} onClick={() => open()}>Add Cluster</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}{message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    <Card><TableContainer><Table><TableHead><TableRow><TableCell>Cluster</TableCell><TableCell>Code</TableCell><TableCell>Subjects</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell><Typography fontWeight={700}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.description || 'No description'}</Typography></TableCell><TableCell>{row.code}</TableCell><TableCell>{row.subject_count}</TableCell><TableCell><StatusChip label={row.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => open(row)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>{!rows.length && <Typography color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>No clusters have been configured.</Typography>}</Card>
    <Dialog component="form" open={editor !== undefined} onClose={() => setEditor(undefined)} onSubmit={event => { event.preventDefault(); void save(); }} fullWidth maxWidth="sm"><DialogTitle>{editor ? 'Edit Cluster' : 'Add Cluster'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Cluster Name" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} required /><TextField label="Code" value={form.code} onChange={event => setForm(value => ({ ...value, code: event.target.value.toUpperCase() }))} required /><TextField label="Description" value={form.description} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} multiline minRows={3} /><FormControlLabel control={<Checkbox checked={form.is_active} onChange={event => setForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Cluster is active" /></Stack></DialogContent><DialogActions><Button onClick={() => setEditor(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save Cluster</Button></DialogActions></Dialog>
  </>;
}

function OfferingManager() {
  const [rows, setRows] = useState<ApiOffering[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [editor, setEditor] = useState<ApiOffering | null | undefined>();
  const [form, setForm] = useState({ subject: '' as number | '', academic_class: '' as number | '', teacher: '' as number | '', school_year: '2026-2027', term: 'Full year', is_active: true });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => Promise.all([
    api<ApiOffering[] | { results?: ApiOffering[] }>('/subject-offerings/?page_size=250'),
    api<ApiSubject[] | { results?: ApiSubject[] }>('/subjects/?page_size=250&status=active'),
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/?page_size=250&status=active'),
    api<Teacher[] | { results?: Teacher[] }>('/users/?role=teacher&page_size=250'),
  ]).then(([offeringRows, subjectRows, classRows, teacherRows]) => { setRows(unwrap(offeringRows)); setSubjects(unwrap(subjectRows)); setClasses(unwrap(classRows)); setTeachers(unwrap(teacherRows)); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const selectedSubject = subjects.find(item => item.id === Number(form.subject));
  const availableClasses = useMemo(() => classes.filter(item => !selectedSubject || item.grade_level === selectedSubject.grade_level), [classes, selectedSubject]);
  const open = (row?: ApiOffering) => { setEditor(row ?? null); setForm(row ? { subject: row.subject, academic_class: row.academic_class, teacher: row.teacher ?? '', school_year: row.school_year, term: row.term, is_active: row.is_active } : { subject: subjects[0]?.id ?? '', academic_class: '', teacher: '', school_year: classes[0]?.school_year ?? '2026-2027', term: 'Full year', is_active: true }); };
  const save = async () => { try { await api(editor ? `/subject-offerings/${editor.id}/` : '/subject-offerings/', { method: editor ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, teacher: form.teacher || null }) }); setEditor(undefined); setMessage(editor ? 'Subject offering updated.' : 'Subject offering created with a unique enrollment code.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the subject offering.'); } };
  return <>
    <PageHeader title="Subject Offerings" description="Assign each subject to a section and teacher for a school term. Enrollment codes belong to these subject offerings—not to the section alone." action={<Button variant="contained" startIcon={<Add />} onClick={() => open()}>Add Offering</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}{message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    <Card><TableContainer><Table sx={{ minWidth: 900 }}><TableHead><TableRow><TableCell>Subject</TableCell><TableCell>Section</TableCell><TableCell>Teacher</TableCell><TableCell>Term</TableCell><TableCell>Enrollment Code</TableCell><TableCell>Learners</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell><Typography fontWeight={700}>{row.subject_name}</Typography></TableCell><TableCell>{row.class_label}</TableCell><TableCell>{row.teacher_name}</TableCell><TableCell>{row.school_year} · {row.term}</TableCell><TableCell><Typography component="code" fontWeight={800}>{row.enrollment_code}</Typography></TableCell><TableCell>{row.enrolled_count}</TableCell><TableCell><StatusChip label={row.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => open(row)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></Card>
    <Dialog component="form" open={editor !== undefined} onClose={() => setEditor(undefined)} onSubmit={event => { event.preventDefault(); void save(); }} fullWidth maxWidth="sm"><DialogTitle>{editor ? 'Edit Subject Offering' : 'Add Subject Offering'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField select label="Subject" value={form.subject} onChange={event => setForm(value => ({ ...value, subject: Number(event.target.value), academic_class: '' }))} required>{subjects.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · Grade {item.grade_level}</MenuItem>)}</TextField><TextField select label="Section" value={form.academic_class} onChange={event => setForm(value => ({ ...value, academic_class: Number(event.target.value) }))} required>{availableClasses.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField><TextField select label="Assigned Teacher" value={form.teacher} onChange={event => setForm(value => ({ ...value, teacher: Number(event.target.value) }))}><MenuItem value="">Unassigned</MenuItem>{teachers.filter(item => item.is_active).map(item => <MenuItem key={item.id} value={item.id}>{item.name} · {item.email}</MenuItem>)}</TextField><TextField label="School Year" value={form.school_year} onChange={event => setForm(value => ({ ...value, school_year: event.target.value }))} required /><TextField label="Term" value={form.term} onChange={event => setForm(value => ({ ...value, term: event.target.value }))} required /><FormControlLabel control={<Checkbox checked={form.is_active} onChange={event => setForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Offering is active" />{editor && <Box sx={{ p: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography variant="caption" color="text.secondary">Enrollment code</Typography><Typography component="code" display="block" fontWeight={800}>{editor.enrollment_code}</Typography></Box>}</Stack></DialogContent><DialogActions><Button onClick={() => setEditor(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save Offering</Button></DialogActions></Dialog>
  </>;
}
