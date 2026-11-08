import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Add, ArrowBack, AutoAwesomeOutlined, ChevronRight, EditOutlined, UploadFileOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiCluster, ApiCompetency, ApiSubject, ApiTopic } from '../api/types';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useServerTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { MultiSelectField } from '../components/MultiSelectField';

export function SubjectsPage({ onOpenCompetencies }: { onOpenCompetencies: (subjectId: number) => void }) {
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<ApiSubject | null | undefined>();
  const [clusters, setClusters] = useState<ApiCluster[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);
  const [clustersError, setClustersError] = useState('');
  const [form, setForm] = useState({ name: '', code: '', grade_level: 11, clusters: [] as number[], is_active: true });
  const [curriculumFile, setCurriculumFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const table = useServerTable<ApiSubject>({ path: '/subjects/', initialSort: 'name', extraParams: `${grade ? `grade=${grade}` : ''}${status ? `${grade ? '&' : ''}status=${status}` : ''}` });
  const loadClusters = useCallback(async (selectDefaults = false) => {
    setClustersLoading(true); setClustersError('');
    try {
      const result = await api<ApiCluster[] | { results?: ApiCluster[] }>('/clusters/?page_size=100');
      const activeClusters = (Array.isArray(result) ? result : result.results ?? []).filter(item => item.is_active);
      setClusters(activeClusters);
      if (selectDefaults) setForm(current => ({ ...current, clusters: current.clusters.length ? current.clusters : activeClusters.map(item => item.id) }));
    } catch (reason) {
      setClustersError(reason instanceof Error ? reason.message : 'Unable to load available clusters.');
    } finally {
      setClustersLoading(false);
    }
  }, []);
  useEffect(() => { void loadClusters(); }, [loadClusters]);
  const open = (item?: ApiSubject) => {
    setEditor(item ?? null); setCurriculumFile(null); setClustersError('');
    setForm(item ? { name: item.name, code: item.code, grade_level: item.grade_level, clusters: item.clusters, is_active: item.is_active } : { name: '', code: '', grade_level: 11, clusters: clusters.map(itemValue => itemValue.id), is_active: true });
    if (!item) void loadClusters(true);
  };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const saved = await api<ApiSubject>(editor ? `/subjects/${editor.id}/` : '/subjects/', { method: editor ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      setEditor(undefined); table.reload();
      if (!editor && curriculumFile) {
        const body = new FormData(); body.append('source_file', curriculumFile);
        try { await api<ApiSubject>(`/subjects/${saved.id}/analyze-curriculum/`, { method: 'POST', body }); setMessage('Subject created and its curriculum proposal is ready for review.'); onOpenCompetencies(saved.id); }
        catch (analysisError) { setError(`Subject created, but curriculum analysis did not finish: ${analysisError instanceof Error ? analysisError.message : 'AI is temporarily unavailable.'}`); }
      } else setMessage(editor ? 'Subject updated.' : 'Subject created.');
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this subject.'); }
    finally { setSaving(false); }
  };
  return <>
    <PageHeader title="Subjects" description="Manage Grade 11 and Grade 12 subjects. Open a subject to maintain its competencies." action={<Button variant="contained" startIcon={<Add />} onClick={() => open()}>Add Subject</Button>} />
    {(error || table.error) && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error || table.error}</Alert>}{message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    <Card><DataTableToolbar query={table.query} onQuery={table.setQuery} placeholder="Search subjects" count={table.count} actions={<Stack direction="row" gap={1}><TextField select size="small" label="Grade" value={grade} onChange={event => setGrade(event.target.value)} sx={{ width: 125 }}><MenuItem value="">All grades</MenuItem><MenuItem value="11">Grade 11</MenuItem><MenuItem value="12">Grade 12</MenuItem></TextField><TextField select size="small" label="Status" value={status} onChange={event => setStatus(event.target.value)} sx={{ width: 120 }}><MenuItem value="">All</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="archived">Archived</MenuItem></TextField></Stack>} /><Divider />
      <TableContainer><Table sx={{ minWidth: 760 }}><TableHead><TableRow><SortableTableCell column="code" label="Code" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="name" label="Subject" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell>Grade</TableCell><SortableTableCell column="competencies" label="Competencies" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{table.rows.map(item => <TableRow key={item.id} hover><TableCell>{item.code}</TableCell><TableCell><Button onClick={() => onOpenCompetencies(item.id)} endIcon={<ChevronRight />} sx={{ justifyContent: 'flex-start', px: 0, fontWeight: 700, textAlign: 'left' }}>{item.name}</Button></TableCell><TableCell>Grade {item.grade_level}</TableCell><TableCell>{item.competency_count}</TableCell><TableCell><StatusChip label={item.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => open(item)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
      {!table.loading && !table.count && <Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>No subjects match the current filters.</Typography>}<DataTablePagination count={table.count} page={table.page} rowsPerPage={table.rowsPerPage} onPage={table.setPage} onRowsPerPage={table.setRowsPerPage} />
    </Card>
    <Dialog component="form" open={editor !== undefined} onClose={() => !saving && setEditor(undefined)} onSubmit={event => { event.preventDefault(); void save(); }} fullWidth maxWidth="sm"><DialogTitle>{editor ? 'Edit Subject' : 'Add Subject'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>{clustersError && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadClusters(!editor)}>Retry</Button>}>{clustersError}</Alert>}<TextField label="Subject Name" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} required autoFocus /><TextField label="Subject Code" value={form.code} onChange={event => setForm(value => ({ ...value, code: event.target.value.toUpperCase() }))} required /><TextField select label="Grade Level" value={form.grade_level} onChange={event => setForm(value => ({ ...value, grade_level: Number(event.target.value) }))}><MenuItem value={11}>Grade 11</MenuItem><MenuItem value={12}>Grade 12</MenuItem></TextField><MultiSelectField label="Available clusters" options={clusters.map(item => ({ id: item.id, label: item.name }))} value={form.clusters} onChange={values => setForm(current => ({ ...current, clusters: values.map(Number) }))} required loading={clustersLoading} disabled={clustersLoading} noOptionsText="No active clusters are available" helperText="Learners see the subject only when their cluster is selected." />{!editor && <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1.5, p: 2 }}><Typography variant="body2" fontWeight={700}>Curriculum Guide/Lesson Exemplar</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5, mb: 1.25 }}>Upload a text-based PDF or DOCX. AI will propose topics and competencies for administrator review; nothing is applied automatically.</Typography><Button component="label" variant="outlined" startIcon={<UploadFileOutlined />}>{curriculumFile?.name ?? 'Choose file'}<input hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => setCurriculumFile(event.target.files?.[0] ?? null)} /></Button></Box>}{editor && <TextField select label="Status" value={form.is_active ? 'active' : 'archived'} onChange={event => setForm(value => ({ ...value, is_active: event.target.value === 'active' }))} helperText="Archive a subject to prevent new use while preserving its academic history."><MenuItem value="active">Active</MenuItem><MenuItem value="archived">Archived</MenuItem></TextField>}</Stack></DialogContent><DialogActions><Button onClick={() => setEditor(undefined)} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" loading={saving} disabled={clustersLoading || !form.clusters.length}>{curriculumFile && !editor ? 'Create & analyze' : 'Save Subject'}</Button></DialogActions></Dialog>
  </>;
}

export function CompetenciesPage({ subjectId, onBack }: { subjectId: number; onBack: () => void }) {
  const [subject, setSubject] = useState<ApiSubject | null>(null);
  const [status, setStatus] = useState('');
  const [topics, setTopics] = useState<ApiTopic[]>([]);
  const [editor, setEditor] = useState<ApiCompetency | null | undefined>();
  const [topicEditor, setTopicEditor] = useState<ApiTopic | null | undefined>();
  const [topicForm, setTopicForm] = useState({ code: '', title: '', description: '', sequence_order: 1, prerequisites: [] as number[], is_active: true });
  const [form, setForm] = useState({ topic: '' as number | '', code: '', title: '', sequence_order: 1, prerequisites: [] as number[], mastery_threshold: 75, is_active: true });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [analyzingCurriculum, setAnalyzingCurriculum] = useState(false);
  const table = useServerTable<ApiCompetency>({ path: '/competencies/', initialSort: 'code', extraParams: `subject=${subjectId}${status ? `&status=${status}` : ''}` });
  const loadTopics = useCallback(() => api<ApiTopic[] | { results?: ApiTopic[] }>(`/topics/?page_size=100&subject=${subjectId}`).then(result => setTopics(Array.isArray(result) ? result : result.results ?? [])).catch(reason => setError(reason.message)), [subjectId]);
  useEffect(() => { api<ApiSubject>(`/subjects/${subjectId}/`).then(setSubject).catch(reason => setError(reason.message)); void loadTopics(); }, [loadTopics, subjectId]);
  const open = (item?: ApiCompetency) => { setEditor(item ?? null); setForm(item ? { topic: item.topic ?? '', code: item.code, title: item.title, sequence_order: item.sequence_order, prerequisites: item.prerequisites, mastery_threshold: item.mastery_threshold, is_active: item.is_active } : { topic: topics[0]?.id ?? '', code: '', title: '', sequence_order: table.count + 1, prerequisites: [], mastery_threshold: 75, is_active: true }); };
  const openTopic = (item?: ApiTopic) => { setTopicEditor(item ?? null); setTopicForm(item ? { code: item.code, title: item.title, description: item.description, sequence_order: item.sequence_order, prerequisites: item.prerequisites, is_active: item.is_active } : { code: '', title: '', description: '', sequence_order: topics.length + 1, prerequisites: [], is_active: true }); };
  const save = async () => {
    try { await api(editor ? `/competencies/${editor.id}/` : '/competencies/', { method: editor ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, subject: subjectId }) }); setEditor(undefined); setMessage(editor ? 'Competency updated.' : 'Competency created.'); table.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this competency.'); }
  };
  const saveTopic = async () => {
    try { await api(topicEditor ? `/topics/${topicEditor.id}/` : '/topics/', { method: topicEditor ? 'PATCH' : 'POST', body: JSON.stringify({ ...topicForm, subject: subjectId }) }); setTopicEditor(undefined); setMessage(topicEditor ? 'Topic updated.' : 'Topic created.'); await loadTopics(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this topic.'); }
  };
  const applyCurriculumProposal = async () => {
    setApplyingProposal(true); setError('');
    try {
      const updated = await api<ApiSubject>(`/subjects/${subjectId}/apply-curriculum/`, { method: 'POST' });
      setSubject(updated); setMessage('The reviewed curriculum proposal was applied. You can now edit each topic and competency.'); await loadTopics(); table.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to apply the curriculum proposal.'); }
    finally { setApplyingProposal(false); }
  };
  const analyzeCurriculum = async (replacement?: File) => {
    setAnalyzingCurriculum(true); setError(''); setMessage('');
    try {
      const body = new FormData();
      if (replacement) body.append('source_file', replacement);
      const updated = await api<ApiSubject>(`/subjects/${subjectId}/analyze-curriculum/`, { method: 'POST', body });
      setSubject(updated); setMessage('The curriculum proposal is ready for review.');
    } catch (reason) {
      const latest = await api<ApiSubject>(`/subjects/${subjectId}/`).catch(() => null);
      if (latest) {
        setSubject(latest);
        if (latest.curriculum_analysis_status === 'ready') {
          setMessage('The curriculum proposal completed and is ready for review.');
          return;
        }
      }
      setError(reason instanceof Error ? reason.message : 'Curriculum analysis is temporarily unavailable.');
    } finally { setAnalyzingCurriculum(false); }
  };
  return <>
    <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 1.5 }}>Back to Subjects</Button>
    <PageHeader title={subject ? `${subject.name} Curriculum` : 'Curriculum'} description={subject ? `${subject.code} · Grade ${subject.grade_level}. Topics and ordered competencies control assessment, recovery, and progression.` : 'Loading subject…'} action={<Stack direction="row" gap={1}><Button variant="outlined" startIcon={<Add />} onClick={() => openTopic()} disabled={!subject}>Add Topic</Button><Button variant="contained" startIcon={<Add />} onClick={() => open()} disabled={!subject || !topics.length}>Add Competency</Button></Stack>} />
    {(error || table.error) && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error || table.error}</Alert>}{message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
    {subject?.curriculum_analysis_status === 'ready' && <Card sx={{ mb: 2, p: 2.5 }}><Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'flex-start' }}><AutoAwesomeOutlined color="primary" /><Box sx={{ flex: 1 }}><Typography variant="h3">AI curriculum proposal</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Grounded in {subject.curriculum_source_name}. Review this outline before applying it; you can edit every record afterward.</Typography><Stack divider={<Divider flexItem />} sx={{ mt: 1.5 }}>{subject.curriculum_analysis.topics?.map(topic => <Box key={topic.code} sx={{ py: 1 }}><Typography variant="body2" fontWeight={750}>{topic.code} · {topic.title}</Typography><Typography variant="caption" color="text.secondary">{topic.competencies.map(item => `${item.code} · ${item.title}`).join(' • ')}</Typography></Box>)}</Stack></Box><Button variant="contained" loading={applyingProposal} onClick={() => void applyCurriculumProposal()}>Apply proposal</Button></Stack></Card>}
    {subject?.curriculum_analysis_status === 'processing' && <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" loading={analyzingCurriculum} onClick={() => void analyzeCurriculum()}>Retry analysis</Button>}>Curriculum analysis is marked as in progress. If it does not finish after the AI service is ready, retry using the saved guide.</Alert>}
    {subject?.curriculum_analysis_status === 'failed' && <Card sx={{ mb: 2, p: 2.5 }}><Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}><Box sx={{ flex: 1 }}><Typography variant="body1" fontWeight={750}>Curriculum analysis needs to be retried</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>The subject and uploaded guide are safe. TALA could not finish the analysis because the AI service was unavailable. Retry after the service is ready, or select a different PDF or DOCX.</Typography>{subject.curriculum_analysis_error && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>{subject.curriculum_analysis_error}</Typography>}</Box><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button variant="outlined" component="label" startIcon={<UploadFileOutlined />} disabled={analyzingCurriculum}>Use a different guide<input hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { const file = event.target.files?.[0]; if (file) void analyzeCurriculum(file); event.target.value = ''; }} /></Button><Button variant="contained" startIcon={<AutoAwesomeOutlined />} loading={analyzingCurriculum} onClick={() => void analyzeCurriculum()}>Retry analysis</Button></Stack></Stack></Card>}
    {topics.length > 0 && <Card sx={{ mb: 2 }}><Box sx={{ p: 2.25 }}><Typography variant="h3">Topic sequence</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Learners progress through this ordered curriculum after meeting prerequisite mastery.</Typography></Box><Divider /><Stack divider={<Divider flexItem />}>{topics.map(topic => <Box key={topic.id} sx={{ px: 2.25, py: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}><Typography fontWeight={800} color="text.secondary" sx={{ width: 28 }}>{topic.sequence_order}</Typography><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={700}>{topic.code} · {topic.title}</Typography><Typography variant="caption" color="text.secondary">{topic.competency_count} competencies</Typography></Box><Button size="small" startIcon={<EditOutlined />} onClick={() => openTopic(topic)}>Edit</Button></Box>)}</Stack></Card>}
    <Card><DataTableToolbar query={table.query} onQuery={table.setQuery} placeholder="Search competencies" count={table.count} actions={<TextField select size="small" label="Status" value={status} onChange={event => setStatus(event.target.value)} sx={{ width: 120 }}><MenuItem value="">All</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="archived">Archived</MenuItem></TextField>} /><Divider /><TableContainer><Table sx={{ minWidth: 820 }}><TableHead><TableRow><SortableTableCell column="code" label="Code" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell>Topic</TableCell><SortableTableCell column="title" label="Competency" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="threshold" label="Mastery Threshold" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{table.rows.map(item => <TableRow key={item.id} hover><TableCell>{item.code}</TableCell><TableCell>{topics.find(topic => topic.id === item.topic)?.title ?? 'Unassigned'}</TableCell><TableCell><Typography variant="body2" fontWeight={650}>{item.title}</Typography></TableCell><TableCell>{item.mastery_threshold}%</TableCell><TableCell><StatusChip label={item.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => open(item)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>{!table.loading && !table.count && <Typography variant="body2" color="text.secondary" sx={{ p: 4, textAlign: 'center' }}>No competencies match the current filters.</Typography>}<DataTablePagination count={table.count} page={table.page} rowsPerPage={table.rowsPerPage} onPage={table.setPage} onRowsPerPage={table.setRowsPerPage} /></Card>
    <Dialog component="form" open={editor !== undefined} onClose={() => setEditor(undefined)} onSubmit={event => { event.preventDefault(); void save(); }} fullWidth maxWidth="sm"><DialogTitle>{editor ? 'Edit Competency' : 'Add Competency'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField select label="Topic" value={form.topic} onChange={event => setForm(value => ({ ...value, topic: Number(event.target.value) }))} required>{topics.map(topic => <MenuItem key={topic.id} value={topic.id}>{topic.sequence_order}. {topic.title}</MenuItem>)}</TextField><TextField label="Competency Code" value={form.code} onChange={event => setForm(value => ({ ...value, code: event.target.value.toUpperCase() }))} required autoFocus /><TextField label="Competency" value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} multiline minRows={2} required /><TextField label="Sequence" type="number" value={form.sequence_order} onChange={event => setForm(value => ({ ...value, sequence_order: Number(event.target.value) }))} inputProps={{ min: 1 }} required /><MultiSelectField label="Prerequisite competencies" options={table.rows.filter(item => item.id !== editor?.id).map(item => ({ id: item.id, label: `${item.code} · ${item.title}` }))} value={form.prerequisites} onChange={values => setForm(current => ({ ...current, prerequisites: values.map(Number) }))} helperText="Leave empty to use the preceding sequence." /><TextField label="Mastery Threshold" type="number" value={form.mastery_threshold} onChange={event => setForm(value => ({ ...value, mastery_threshold: Number(event.target.value) }))} inputProps={{ min: 1, max: 100 }} required /><TextField select label="Status" value={form.is_active ? 'active' : 'archived'} onChange={event => setForm(value => ({ ...value, is_active: event.target.value === 'active' }))}><MenuItem value="active">Active</MenuItem><MenuItem value="archived">Archived</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setEditor(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save Competency</Button></DialogActions></Dialog>
    <Dialog component="form" open={topicEditor !== undefined} onClose={() => setTopicEditor(undefined)} onSubmit={event => { event.preventDefault(); void saveTopic(); }} fullWidth maxWidth="sm"><DialogTitle>{topicEditor ? 'Edit Topic' : 'Add Topic'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Topic Code" value={topicForm.code} onChange={event => setTopicForm(value => ({ ...value, code: event.target.value.toUpperCase() }))} required /><TextField label="Topic Title" value={topicForm.title} onChange={event => setTopicForm(value => ({ ...value, title: event.target.value }))} required /><TextField label="Description" value={topicForm.description} onChange={event => setTopicForm(value => ({ ...value, description: event.target.value }))} multiline minRows={2} /><TextField label="Sequence" type="number" value={topicForm.sequence_order} onChange={event => setTopicForm(value => ({ ...value, sequence_order: Number(event.target.value) }))} inputProps={{ min: 1 }} required /><MultiSelectField label="Prerequisite topics" options={topics.filter(item => item.id !== topicEditor?.id).map(item => ({ id: item.id, label: `${item.sequence_order}. ${item.title}` }))} value={topicForm.prerequisites} onChange={values => setTopicForm(current => ({ ...current, prerequisites: values.map(Number) }))} helperText="Leave empty to use the preceding topic." /><TextField select label="Status" value={topicForm.is_active ? 'active' : 'archived'} onChange={event => setTopicForm(value => ({ ...value, is_active: event.target.value === 'active' }))}><MenuItem value="active">Active</MenuItem><MenuItem value="archived">Archived</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setTopicEditor(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save Topic</Button></DialogActions></Dialog>
  </>;
}
