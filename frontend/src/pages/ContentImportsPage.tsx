import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, InputLabel, MenuItem, Radio, RadioGroup, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { CloudUploadOutlined, DescriptionOutlined, PlayCircleOutline } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass, ApiCompetency, ApiSubject, ContentImport, ExtractedQuestion } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useDataTable } from '../components/DataTable';

const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];
const statusLabel: Record<ContentImport['status'], string> = { uploaded: 'Uploaded', processing: 'Processing', needs_review: 'Needs review', published: 'Published', failed: 'Failed', rejected: 'Rejected' };

export function ContentImportsPage({ admin = false }: { admin?: boolean }) {
  const [imports, setImports] = useState<ContentImport[] | null>(null);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [competencies, setCompetencies] = useState<ApiCompetency[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [selected, setSelected] = useState<ContentImport | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ContentImport['kind'] | ''>('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<number | ''>('');
  const [competency, setCompetency] = useState<number | ''>('');
  const [assignedClass, setAssignedClass] = useState<number | ''>('');
  const [assessmentKind, setAssessmentKind] = useState<'pre' | 'post'>('pre');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => Promise.all([
    api<ContentImport[] | { results?: ContentImport[] }>('/content-imports/'),
    api<ApiSubject[] | { results?: ApiSubject[] }>('/subjects/'),
    api<ApiCompetency[] | { results?: ApiCompetency[] }>('/competencies/'),
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/'),
  ]).then(([importRows, subjectRows, competencyRows, classRows]) => {
    setImports(unwrap(importRows)); setSubjects(unwrap(subjectRows)); setCompetencies(unwrap(competencyRows)); setClasses(unwrap(classRows));
  }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const availableCompetencies = useMemo(() => competencies.filter(item => !subject || item.subject === subject), [competencies, subject]);
  const importTable = useDataTable(imports ?? [], { searchText: item => `${item.title} ${item.original_filename} ${item.kind} ${statusLabel[item.status]}`, sortValues: { upload: item => item.title, type: item => item.kind, status: item => item.status, uploaded: item => new Date(item.created_at).getTime() }, initialSort: 'uploaded', initialDirection: 'desc' });

  const selectImport = (item: ContentImport) => { setSelected(item); setQuestions(item.extracted_payload.questions ?? []); setError(''); setSuccess(''); };
  const resetUpload = () => { setTitle(''); setDescription(''); setFile(null); setOpen(false); };
  const upload = async () => {
    if (!kind || !file || !subject || !competency) return;
    setBusy(true); setError('');
    const configuration = kind === 'exam' ? { assessment_kind: assessmentKind, assigned_class_ids: assignedClass ? [assignedClass] : [] } : { description, difficulty: 'foundation' };
    const body = new FormData();
    body.append('title', title); body.append('kind', kind); body.append('subject', String(subject)); body.append('competency', String(competency)); body.append('configuration', JSON.stringify(configuration)); body.append('source_file', file);
    try { const created = await api<ContentImport>('/content-imports/', { method: 'POST', body }); resetUpload(); await load(); selectImport(created); setSuccess(created.status === 'failed' ? '' : 'Upload processed. Review the extracted content before publishing.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to upload content.'); }
    finally { setBusy(false); }
  };
  const updateQuestion = (index: number, changes: Partial<ExtractedQuestion>) => setQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  const saveReview = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const updated = await api<ContentImport>(`/content-imports/${selected.id}/`, { method: 'PATCH', body: JSON.stringify({ extracted_payload: { ...selected.extracted_payload, questions, question_count: questions.length } }) });
      setSelected(updated); setSuccess('Review changes saved.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save review changes.'); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      let current = selected;
      if (selected.kind === 'exam') current = await api<ContentImport>(`/content-imports/${selected.id}/`, { method: 'PATCH', body: JSON.stringify({ extracted_payload: { ...selected.extracted_payload, questions, question_count: questions.length } }) });
      const published = await api<ContentImport>(`/content-imports/${current.id}/publish/`, { method: 'POST' });
      setSelected(published); setSuccess(published.kind === 'exam' ? 'Assessment draft created. Review and activate it from Assessments.' : 'Learning material published to the approved resource library.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to publish this import.'); }
    finally { setBusy(false); }
  };

  if (!imports && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  return <>
    <PageHeader title={admin ? 'Content governance' : 'Content imports'} description={admin ? 'Review teacher submissions and control what becomes available to learners.' : 'Submit exams, modules, and learning videos for administrator review.'} action={admin ? undefined : <Button variant="contained" startIcon={<CloudUploadOutlined />} onClick={() => setOpen(true)}>Upload content</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
    <Alert severity="info" sx={{ mb: 3 }}>{admin ? 'Teachers submit content; administrators verify its accuracy, rights, and competency mapping before publication.' : 'Your upload remains unavailable to learners until an administrator reviews and publishes it.'}</Alert>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: selected ? 'minmax(420px, .75fr) minmax(0, 1.25fr)' : '1fr' }, gap: 3, alignItems: 'start' }}>
      <Card><DataTableToolbar query={importTable.query} onQuery={importTable.setQuery} placeholder="Search content imports" count={importTable.filteredCount} /><TableContainer><Table sx={{ minWidth: 720 }}><TableHead><TableRow><SortableTableCell column="upload" label="Upload" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><SortableTableCell column="type" label="Type" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><SortableTableCell column="uploaded" label="Uploaded" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{importTable.pageRows.map(item => <TableRow key={item.id} selected={selected?.id === item.id}><TableCell><Typography variant="body2" fontWeight={700}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.original_filename}</Typography></TableCell><TableCell sx={{ textTransform: 'capitalize' }}>{item.kind}</TableCell><TableCell><StatusChip label={statusLabel[item.status]} /></TableCell><TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell><TableCell align="right"><Button size="small" onClick={() => selectImport(item)}>{admin && item.status === 'needs_review' ? 'Review' : 'View'}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>{!importTable.filteredCount && <Box sx={{ p: 5, textAlign: 'center' }}><DescriptionOutlined color="disabled" /><Typography fontWeight={700} sx={{ mt: 1 }}>{imports?.length ? 'No imports match this search' : 'No uploads yet'}</Typography><Typography variant="body2" color="text.secondary">{imports?.length ? 'Try a different title, filename, type, or status.' : admin ? 'Teacher submissions will appear here for review.' : 'Choose Upload content, then select an exam or module for PDF/DOCX, or a learning video for MP4/WebM/MOV.'}</Typography></Box>}<DataTablePagination count={importTable.filteredCount} page={importTable.page} rowsPerPage={importTable.rowsPerPage} onPage={importTable.setPage} onRowsPerPage={importTable.setRowsPerPage} /></Card>
      {selected && <Card sx={{ p: { xs: 2.5, sm: 3 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="overline" color="text.secondary">{selected.kind} review</Typography><Typography variant="h2">{selected.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{selected.original_filename} · {(selected.size_bytes / 1024 / 1024).toFixed(1)} MB</Typography></Box><StatusChip label={statusLabel[selected.status]} size="medium" /></Stack><Divider sx={{ my: 2.5 }} />
        {selected.error_message && <Alert severity={selected.status === 'failed' ? 'error' : 'warning'} sx={{ mb: 2 }}>{selected.error_message}</Alert>}
        {selected.kind === 'exam' && <Stack gap={2.5}>{questions.map((question, index) => <Box key={`${question.source_number}-${index}`} sx={{ pb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Typography fontWeight={750}>Question {index + 1}</Typography><StatusChip label={question.confidence === 'high' ? 'Parsed' : 'Review'} /></Stack><Stack gap={1.5}><TextField label="Question" multiline minRows={2} value={question.prompt} disabled={!admin || selected.status !== 'needs_review'} onChange={event => updateQuestion(index, { prompt: event.target.value })} /><TextField select label="Competency" value={question.competency_id ?? ''} disabled={!admin || selected.status !== 'needs_review'} onChange={event => updateQuestion(index, { competency_id: Number(event.target.value), competency_code: competencies.find(item => item.id === Number(event.target.value))?.code ?? '' })}>{competencies.filter(item => item.subject === selected.subject).map(item => <MenuItem key={item.id} value={item.id}>{item.code} · {item.title}</MenuItem>)}</TextField>{question.question_type !== 'short' && <TextField label="Choices (one per line)" multiline minRows={3} value={question.options.join('\n')} disabled={!admin || selected.status !== 'needs_review'} onChange={event => updateQuestion(index, { options: event.target.value.split('\n').filter(Boolean) })} />}<TextField label="Correct answer" value={question.correct_answer} disabled={!admin || selected.status !== 'needs_review'} onChange={event => updateQuestion(index, { correct_answer: event.target.value })} /></Stack></Box>)}</Stack>}
        {selected.kind === 'module' && <Box><Typography variant="h3" sx={{ mb: 1 }}>Extracted module text</Typography><Box sx={{ maxHeight: 520, overflowY: 'auto', whiteSpace: 'pre-wrap', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#fafbfc' }}><Typography variant="body2" sx={{ lineHeight: 1.75 }}>{selected.extracted_text}</Typography></Box></Box>}
        {selected.kind === 'video' && <Box><video controls preload="metadata" src={selected.source_file_url} style={{ width: '100%', maxHeight: 480, background: '#111', borderRadius: 8 }}><track kind="captions" /></video><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Verify playback and content suitability before publishing.</Typography></Box>}
        {admin && selected.status === 'needs_review' && <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 3 }}>{selected.kind === 'exam' && <Button onClick={saveReview} disabled={busy}>Save review</Button>}<Button variant="contained" onClick={publish} disabled={busy}>Approve and publish</Button></Stack>}
        {selected.status === 'published' && <Alert severity="success" sx={{ mt: 3 }}>{selected.published_assessment_title ? `Assessment draft: ${selected.published_assessment_title}` : `Published resource: ${selected.published_resource_title}`}</Alert>}
      </Card>}
    </Box>
    <Dialog component="form" open={open} onClose={() => !busy && setOpen(false)} onSubmit={event => { event.preventDefault(); void upload(); }} fullWidth maxWidth="sm"><DialogTitle>Upload teaching content</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><FormControl required><InputLabel id="content-kind">Content type</InputLabel><Select labelId="content-kind" label="Content type" value={kind} onChange={event => { setKind(event.target.value as ContentImport['kind']); setFile(null); }}><MenuItem value="exam">Exam document · PDF or DOCX</MenuItem><MenuItem value="module">Learning module · PDF or DOCX</MenuItem><MenuItem value="video">Learning video · MP4, WebM, or MOV</MenuItem></Select></FormControl>{!kind && <Typography variant="caption" color="text.secondary">Select a content type to see its upload fields and supported file format.</Typography>}<TextField label="Title" value={title} onChange={event => setTitle(event.target.value)} required /><TextField select label="Subject" value={subject} onChange={event => { setSubject(Number(event.target.value)); setCompetency(''); }} required>{subjects.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><TextField select label="Default competency" value={competency} onChange={event => setCompetency(Number(event.target.value))} required helperText={kind === 'exam' ? 'The extractor uses this when the document does not specify a competency.' : 'Determines which recovery plans can use this material.'}>{availableCompetencies.map(item => <MenuItem key={item.id} value={item.id}>{item.code} · {item.title}</MenuItem>)}</TextField>{kind === 'exam' ? <><FormControl><Typography variant="body2" fontWeight={650}>Assessment type</Typography><RadioGroup row value={assessmentKind} onChange={event => setAssessmentKind(event.target.value as 'pre' | 'post')}><FormControlLabel value="pre" control={<Radio />} label="Diagnostic" /><FormControlLabel value="post" control={<Radio />} label="Mastery" /></RadioGroup></FormControl><TextField select label="Assign to class" value={assignedClass} onChange={event => setAssignedClass(Number(event.target.value))} required>{classes.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField></> : kind ? <TextField label="Description" multiline minRows={2} value={description} onChange={event => setDescription(event.target.value)} /> : null}{kind && <Button component="label" variant="outlined" startIcon={kind === 'video' ? <PlayCircleOutline /> : <CloudUploadOutlined />} sx={{ justifyContent: 'flex-start', minHeight: 48 }}>{file ? file.name : kind === 'video' ? 'Choose an MP4, WebM, or MOV video' : `Choose a ${kind === 'exam' ? 'PDF or DOCX exam' : 'PDF or DOCX module'}`}<input hidden type="file" accept={kind === 'video' ? '.mp4,.webm,.mov' : '.pdf,.docx'} onChange={event => setFile(event.target.files?.[0] ?? null)} /></Button>}<Typography variant="caption" color="text.secondary">Document limit: 25 MB. Video limit: 500 MB. Upload only school-authorized material.</Typography></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || !kind || !file || !subject || !competency || !title.trim() || (kind === 'exam' && !assignedClass)}>{busy ? 'Processing…' : 'Upload and process'}</Button></DialogActions></Dialog>
  </>;
}
