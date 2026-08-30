import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Card, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Radio, RadioGroup, Select, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { ArchiveOutlined, CloudUploadOutlined, DescriptionOutlined, EditOutlined, PlayCircleOutline, RateReviewOutlined, VisibilityOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass, ApiCompetency, ApiSubject, ContentImport, ExtractedQuestion } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useDataTable } from '../components/DataTable';
import { useTeachingScope } from '../components/TeachingScopeContext';

const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];
const statusLabel: Record<ContentImport['status'], string> = { uploaded: 'Uploaded', processing: 'Processing', needs_review: 'Needs review', published: 'Published', failed: 'Failed', rejected: 'Rejected' };
const displayStatus = (item: ContentImport) => item.archived_at ? 'Archived' : statusLabel[item.status];

export function ContentImportsPage({ admin = false, initialImportId = null }: { admin?: boolean; initialImportId?: number | null }) {
  const scope = useTeachingScope();
  const [imports, setImports] = useState<ContentImport[] | null>(null);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [competencies, setCompetencies] = useState<ApiCompetency[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [selected, setSelected] = useState<ContentImport | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [reviewTab, setReviewTab] = useState<'questions' | 'original'>('questions');
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [governanceGroup, setGovernanceGroup] = useState<'review' | 'published' | 'issues' | 'archived'>('review');
  const [kind, setKind] = useState<ContentImport['kind'] | ''>('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<number | ''>('');
  const [competency, setCompetency] = useState<number | ''>('');
  const [assignedClass, setAssignedClass] = useState<number | ''>('');
  const [materialClassIds, setMaterialClassIds] = useState<number[]>([]);
  const [reviewClassIds, setReviewClassIds] = useState<number[]>([]);
  const [assessmentKind, setAssessmentKind] = useState<'pre' | 'post' | 'remedial'>('pre');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [focusedImportId, setFocusedImportId] = useState(initialImportId);
  useEffect(() => { setFocusedImportId(initialImportId); }, [initialImportId]);

  const load = useCallback(() => Promise.all([
    api<ContentImport[] | { results?: ContentImport[] }>(`/content-imports/${!admin && scope?.selectedSubjectId ? `?subject=${scope.selectedSubjectId}` : ''}`),
    api<ApiSubject[] | { results?: ApiSubject[] }>('/subjects/'),
    api<ApiCompetency[] | { results?: ApiCompetency[] }>('/competencies/'),
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/'),
  ]).then(([importRows, subjectRows, competencyRows, classRows]) => {
    setImports(unwrap(importRows)); setSubjects(unwrap(subjectRows)); setCompetencies(unwrap(competencyRows)); setClasses(unwrap(classRows));
  }).catch(reason => setError(reason.message)), [admin, scope?.selectedSubjectId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (admin || !scope?.selectedSubjectId) return;
    setSubject(scope.selectedSubjectId);
    setCompetency('');
    setAssignedClass('');
    setMaterialClassIds([]);
    setSelected(null);
  }, [admin, scope?.selectedSubjectId]);
  useEffect(() => {
    const isPdf = selected && (selected.mime_type === 'application/pdf' || selected.original_filename.toLowerCase().endsWith('.pdf'));
    if (!selected || reviewTab !== 'original' || !isPdf) { setOriginalPreviewUrl(''); return; }
    let active = true;
    let objectUrl = '';
    setPreviewBusy(true);
    fetch(selected.source_file_url).then(response => {
      if (!response.ok) throw new Error('The original document could not be loaded.');
      return response.blob();
    }).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setOriginalPreviewUrl(objectUrl); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to preview the original document.'); }).finally(() => { if (active) setPreviewBusy(false); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [reviewTab, selected]);
  const availableCompetencies = useMemo(() => competencies.filter(item => !subject || item.subject === subject), [competencies, subject]);
  const availableClasses = useMemo(() => admin || !scope ? classes : classes.filter(item => scope.classes.some(assigned => assigned.id === item.id)), [admin, classes, scope]);
  const groupedImports = (imports ?? []).filter(item => !admin || (governanceGroup === 'review' ? !item.archived_at && ['uploaded', 'processing', 'needs_review'].includes(item.status) : governanceGroup === 'published' ? !item.archived_at && item.status === 'published' : governanceGroup === 'issues' ? !item.archived_at && ['failed', 'rejected'].includes(item.status) : Boolean(item.archived_at)));
  const importTable = useDataTable(groupedImports, { searchText: item => `${item.title} ${item.original_filename} ${item.kind} ${displayStatus(item)} ${item.uploaded_by_name} ${item.uploaded_by_email}`, sortValues: { upload: item => item.title, author: item => item.uploaded_by_name, type: item => item.kind, status: item => displayStatus(item), uploaded: item => new Date(item.created_at).getTime() }, initialSort: 'uploaded', initialDirection: 'desc' });

  const selectImport = (item: ContentImport) => { setSelected(item); setQuestions(item.kind === 'exam' ? item.extracted_payload.questions ?? [] : item.extracted_payload.practice_questions ?? []); setReviewClassIds(Array.isArray(item.configuration.assigned_class_ids) ? item.configuration.assigned_class_ids.map(Number) : []); setReviewTab('questions'); setError(''); setSuccess(''); };
  useEffect(() => {
    if (!focusedImportId || !imports) return;
    const item = imports.find(row => row.id === focusedImportId);
    if (!item) { setError('The requested content submission is unavailable or you do not have access to it.'); setFocusedImportId(null); return; }
    if (admin) setGovernanceGroup(item.archived_at ? 'archived' : item.status === 'published' ? 'published' : ['failed', 'rejected'].includes(item.status) ? 'issues' : 'review');
    selectImport(item);
    setFocusedImportId(null);
    window.history.replaceState({}, '', '/imports');
  }, [admin, focusedImportId, imports]);
  const retryProcessing = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const updated = await api<ContentImport>(`/content-imports/${selected.id}/process/`, { method: 'POST' });
      setSelected(updated); setQuestions(updated.kind === 'exam' ? updated.extracted_payload.questions ?? [] : updated.extracted_payload.practice_questions ?? []); await load();
      setSuccess(updated.status === 'needs_review' ? 'Processing completed. The upload is ready for review.' : 'Processing finished, but the file still needs attention.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to retry processing.'); }
    finally { setBusy(false); }
  };
  const resetUpload = () => { setTitle(''); setDescription(''); setFile(null); setMaterialClassIds([]); setOpen(false); };
  const upload = async () => {
    if (!kind || !file || !subject || !competency) return;
    setBusy(true); setError('');
    const configuration = kind === 'exam' ? { assessment_kind: assessmentKind, assigned_class_ids: assignedClass ? [assignedClass] : [] } : { description, difficulty: 'foundation', assigned_class_ids: materialClassIds };
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
      const extracted_payload = selected.kind === 'exam' ? { ...selected.extracted_payload, questions, question_count: questions.length } : { ...selected.extracted_payload, practice_questions: questions, practice_question_count: questions.length };
      const updated = await api<ContentImport>(`/content-imports/${selected.id}/`, { method: 'PATCH', body: JSON.stringify({ extracted_payload }) });
      setSelected(updated); setSuccess('Review changes saved.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save review changes.'); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      let current = selected;
      const extracted_payload = selected.kind === 'exam' ? { ...selected.extracted_payload, questions, question_count: questions.length } : { ...selected.extracted_payload, practice_questions: questions, practice_question_count: questions.length };
      current = await api<ContentImport>(`/content-imports/${selected.id}/`, { method: 'PATCH', body: JSON.stringify({ configuration: selected.kind === 'exam' ? selected.configuration : { ...selected.configuration, assigned_class_ids: reviewClassIds }, extracted_payload }) });
      const published = await api<ContentImport>(`/content-imports/${current.id}/publish/`, { method: 'POST' });
      setSelected(published); setSuccess(published.kind === 'exam' ? 'Assessment draft created. Review and activate it from Assessments.' : 'Learning material published to the approved resource library.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to publish this import.'); }
    finally { setBusy(false); }
  };
  const saveAssignment = async () => {
    if (!selected?.published_resource) return;
    setBusy(true); setError('');
    try {
      const updated = await api<ContentImport>(`/content-imports/${selected.id}/assign/`, { method: 'POST', body: JSON.stringify({ assigned_class_ids: reviewClassIds }) });
      setSelected(updated); await load(); setSuccess(reviewClassIds.length ? 'Student assignment updated. Assigned learners were notified.' : 'Class assignment removed.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update the class assignment.'); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const updated = await api<ContentImport>(`/content-imports/${selected.id}/archive/`, { method: 'POST' });
      setSelected(updated); setConfirmArchive(false); await load(); setSuccess('Content archived. Published learner access and assignments were disabled.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to archive this content.'); }
    finally { setBusy(false); }
  };

  if (!imports && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  return <>
    <PageHeader title={admin ? 'Content Governance' : 'Content Imports'} description={admin ? 'Review teacher submissions and control what becomes available to learners.' : 'Submit exams, modules, and learning videos for administrator review.'} action={admin ? undefined : <Button variant="contained" startIcon={<CloudUploadOutlined />} onClick={() => setOpen(true)}>Upload Content</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
    <Alert severity="info" sx={{ mb: 3 }}>{admin ? 'Teachers submit content; administrators verify its accuracy, rights, and competency mapping before publication.' : 'Your upload remains unavailable to learners until an administrator reviews and publishes it.'}</Alert>
      <Box>
      {admin && <Card sx={{ mb: 2 }}><Tabs value={governanceGroup} onChange={(_, value) => setGovernanceGroup(value)} variant="scrollable" scrollButtons="auto" aria-label="Content governance groups"><Tab value="review" label={`For Review · ${(imports ?? []).filter(item => !item.archived_at && ['uploaded', 'processing', 'needs_review'].includes(item.status)).length}`} /><Tab value="published" label={`Published · ${(imports ?? []).filter(item => !item.archived_at && item.status === 'published').length}`} /><Tab value="issues" label={`Needs Attention · ${(imports ?? []).filter(item => !item.archived_at && ['failed', 'rejected'].includes(item.status)).length}`} /><Tab value="archived" label={`Archived · ${(imports ?? []).filter(item => item.archived_at).length}`} /></Tabs></Card>}
      <Card><DataTableToolbar query={importTable.query} onQuery={importTable.setQuery} placeholder="Search content imports" count={importTable.filteredCount} /><TableContainer><Table sx={{ minWidth: admin ? 900 : 720 }}><TableHead><TableRow><SortableTableCell column="upload" label="Upload" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} />{admin && <SortableTableCell column="author" label="Uploaded By" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} />}<SortableTableCell column="type" label="Type" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><SortableTableCell column="uploaded" label="Uploaded" orderBy={importTable.orderBy} direction={importTable.direction} onSort={importTable.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{importTable.pageRows.map(item => { const reviewing = admin && item.status === 'needs_review' && !item.archived_at; const editing = !admin && item.status === 'needs_review' && !item.archived_at; return <TableRow key={item.id}><TableCell><Typography variant="body2" fontWeight={700}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.original_filename}</Typography></TableCell>{admin && <TableCell><Typography variant="body2" fontWeight={650}>{item.uploaded_by_name}</Typography><Typography variant="caption" color="text.secondary">{item.uploaded_by_email}</Typography></TableCell>}<TableCell sx={{ textTransform: 'capitalize' }}>{item.kind}</TableCell><TableCell><StatusChip label={displayStatus(item)} /></TableCell><TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell><TableCell align="right"><Button size="small" startIcon={reviewing ? <RateReviewOutlined /> : editing ? <EditOutlined /> : <VisibilityOutlined />} onClick={() => selectImport(item)}>{reviewing ? 'Review' : editing ? 'Edit' : 'View'}</Button></TableCell></TableRow>; })}</TableBody></Table></TableContainer>{!importTable.filteredCount && <Box sx={{ p: 5, textAlign: 'center' }}><DescriptionOutlined color="disabled" /><Typography fontWeight={700} sx={{ mt: 1 }}>{imports?.length ? 'No imports match this search' : 'No uploads yet'}</Typography><Typography variant="body2" color="text.secondary">{imports?.length ? 'Try a different title, filename, author, type, or status.' : admin ? 'Teacher submissions will appear here for review.' : 'Choose Upload Content, then select an exam or module for PDF/DOCX, or a learning video for MP4/WebM/MOV.'}</Typography></Box>}<DataTablePagination count={importTable.filteredCount} page={importTable.page} rowsPerPage={importTable.rowsPerPage} onPage={importTable.setPage} onRowsPerPage={importTable.setRowsPerPage} /></Card>
      {selected && <Dialog open onClose={() => !busy && setSelected(null)} fullWidth maxWidth="lg"><DialogTitle sx={{ pr: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="overline" color="text.secondary">{selected.kind} review</Typography><Typography variant="h2">{selected.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{selected.original_filename} · {(selected.size_bytes / 1024 / 1024).toFixed(1)} MB · Uploaded by {selected.uploaded_by_name}</Typography></Box><StatusChip label={displayStatus(selected)} size="medium" /></Stack><Tabs value={reviewTab} onChange={(_, value) => setReviewTab(value)} sx={{ mt: 2 }}><Tab value="questions" label={selected.kind === 'exam' ? `Extracted Questions (${questions.length})` : `Extracted Quiz (${questions.length})`} /><Tab value="original" label={selected.kind === 'video' ? 'Original Video' : 'Original Document'} /></Tabs></DialogTitle><DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {selected.archived_at && <Alert severity="info" sx={{ mb: 2 }}>Archived {new Date(selected.archived_at).toLocaleString()}. This item remains available for governance history, but published learner access is disabled.</Alert>}
        {selected.error_message && <Alert severity={selected.status === 'failed' ? 'error' : 'warning'} sx={{ mb: 2 }} action={selected.status === 'failed' ? <Button color="inherit" size="small" disabled={busy} onClick={() => void retryProcessing()}>{busy ? 'Retrying…' : 'Retry Processing'}</Button> : undefined}>{selected.error_message}</Alert>}
        {reviewTab === 'questions' && questions.length > 0 && <Stack gap={2.5}><Typography variant="h3">{selected.kind === 'exam' ? 'Extracted Assessment Questions' : 'Detected Learning Quiz'}</Typography><Alert severity="info">{selected.status === 'published' ? 'Saving revisions updates the published quiz. Existing completed attempts remain part of the learner record.' : 'Review every answer and competency before publication.'}</Alert>{questions.map((question, index) => <Box key={`${question.source_number}-${index}`} sx={{ pb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Typography fontWeight={750}>Question {index + 1}</Typography><StatusChip label={question.confidence === 'high' ? 'Parsed' : 'Review'} /></Stack><Stack gap={1.5}><TextField label="Question" multiline minRows={2} value={question.prompt} disabled={!['needs_review', 'published'].includes(selected.status)} onChange={event => updateQuestion(index, { prompt: event.target.value })} /><TextField select label="Competency" value={question.competency_id ?? ''} disabled={!['needs_review', 'published'].includes(selected.status)} onChange={event => updateQuestion(index, { competency_id: Number(event.target.value), competency_code: competencies.find(item => item.id === Number(event.target.value))?.code ?? '' })}>{competencies.filter(item => item.subject === selected.subject).map(item => <MenuItem key={item.id} value={item.id}>{item.code} · {item.title}</MenuItem>)}</TextField>{question.question_type !== 'short' && <TextField label="Choices (one per line)" multiline minRows={3} value={question.options.join('\n')} disabled={!['needs_review', 'published'].includes(selected.status)} onChange={event => updateQuestion(index, { options: event.target.value.split('\n').map(value => value.trim()).filter(Boolean) })} />}<TextField label="Correct Answer" value={question.correct_answer} disabled={!['needs_review', 'published'].includes(selected.status)} onChange={event => updateQuestion(index, { correct_answer: event.target.value })} /></Stack></Box>)}</Stack>}
        {reviewTab === 'questions' && !questions.length && <Alert severity="warning">{selected.kind === 'video' ? selected.extracted_payload.transcription_status === 'not_configured' ? 'Local transcription was not configured when this video was processed. Configure Whisper, then retry processing to detect spoken quiz questions.' : 'The transcript did not contain answer-keyed questions. You can create a separate assessment manually.' : 'No complete questions were detected. Check the original document for a recognizable Assessment and Answer Key before publishing.'}</Alert>}
        {reviewTab === 'original' && selected.kind !== 'video' && (selected.mime_type === 'application/pdf' || selected.original_filename.toLowerCase().endsWith('.pdf') ? previewBusy ? <Box sx={{ minHeight: 520, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box> : originalPreviewUrl ? <Box component="iframe" title={`Original document: ${selected.title}`} src={originalPreviewUrl} sx={{ width: '100%', height: { xs: 520, md: 720 }, border: '1px solid', borderColor: 'divider', borderRadius: 1 }} /> : <Alert severity="error">The original PDF preview could not be prepared. Close this review and try again.</Alert> : <Box sx={{ py: 6, textAlign: 'center' }}><DescriptionOutlined color="disabled" /><Typography variant="body2" sx={{ mt: 1 }}>Browser preview is unavailable for this DOCX file.</Typography><Button component="a" href={selected.source_file_url} target="_blank" rel="noreferrer" sx={{ mt: 1 }}>Open Original Document</Button></Box>)}
        {reviewTab === 'original' && selected.kind === 'video' && <Box><video controls preload="metadata" src={selected.source_file_url} style={{ width: '100%', maxHeight: 480, background: '#111', borderRadius: 8 }}><track kind="captions" /></video>{selected.extracted_text && <Box sx={{ mt: 2 }}><Typography variant="h3">Transcript</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-line', maxHeight: 240, overflow: 'auto' }}>{selected.extracted_text}</Typography></Box>}</Box>}
        {selected.kind !== 'exam' && ['needs_review', 'published'].includes(selected.status) && (selected.kind === 'video' || reviewTab === 'questions') && <Box sx={{ mt: 3, p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography variant="h3">Learner Assignment</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2 }}>{selected.status === 'published' ? 'Changes take effect immediately. Students in newly assigned classes receive a notification.' : 'Choose the classes that will receive this material after approval. Leaving this empty publishes it to the library without exposing it to students.'}</Typography><Autocomplete multiple disableCloseOnSelect disabled={busy} options={classes} value={classes.filter(item => reviewClassIds.includes(item.id))} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={item => item.label} onChange={(_, values) => setReviewClassIds(values.map(item => item.id))} renderOption={(props, option, state) => <Box component="li" {...props} key={option.id}><Checkbox checked={state.selected} size="small" sx={{ mr: 1 }} />{option.label}</Box>} renderInput={params => <TextField {...params} label="Assign to Classes" placeholder={reviewClassIds.length ? '' : 'Select classes'} />} />{selected.status === 'published' && <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}><Button variant="contained" onClick={() => void saveAssignment()} disabled={busy}>{busy ? 'Saving…' : 'Save Assignment'}</Button></Box>}</Box>}
        {reviewTab === 'questions' && ['needs_review', 'published'].includes(selected.status) && <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 3 }}>{questions.length > 0 && <Button onClick={saveReview} disabled={busy}>{selected.status === 'published' ? 'Save Published Quiz Revision' : 'Save Question Edits'}</Button>}{admin && selected.status === 'needs_review' && <Button variant="contained" onClick={publish} disabled={busy}>Approve and Publish</Button>}</Stack>}
        {selected.status === 'published' && <Alert severity="success" sx={{ mt: 3 }}>{selected.published_assessment_title ? `Assessment draft: ${selected.published_assessment_title}` : `Published resource: ${selected.published_resource_title}`}</Alert>}
      </DialogContent><DialogActions>{admin && !selected.archived_at && selected.status !== 'processing' && <Button color="warning" startIcon={<ArchiveOutlined />} onClick={() => setConfirmArchive(true)} disabled={busy}>Archive</Button>}<Box sx={{ flex: 1 }} /><Button onClick={() => setSelected(null)} disabled={busy}>Close</Button></DialogActions></Dialog>}
    </Box>
    <Dialog open={confirmArchive} onClose={() => !busy && setConfirmArchive(false)} maxWidth="xs" fullWidth><DialogTitle>Archive Content?</DialogTitle><DialogContent><Typography variant="body2">The source file and review history will be retained. If this content is published, learner access, class assignments, or assessment availability will be disabled.</Typography></DialogContent><DialogActions><Button onClick={() => setConfirmArchive(false)} disabled={busy}>Cancel</Button><Button color="warning" variant="contained" onClick={() => void archive()} disabled={busy}>{busy ? 'Archiving…' : 'Archive Content'}</Button></DialogActions></Dialog>
    <Dialog component="form" open={open} onClose={() => !busy && setOpen(false)} onSubmit={event => { event.preventDefault(); void upload(); }} fullWidth maxWidth="sm"><DialogTitle>Upload Teaching Content</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><FormControl required><InputLabel id="content-kind">Content Type</InputLabel><Select labelId="content-kind" label="Content Type" value={kind} onChange={event => { setKind(event.target.value as ContentImport['kind']); setFile(null); setMaterialClassIds([]); }}><MenuItem value="exam">Exam document · PDF or DOCX</MenuItem><MenuItem value="module">Learning module · PDF or DOCX</MenuItem><MenuItem value="video">Learning video · MP4, WebM, or MOV</MenuItem></Select></FormControl>{!kind && <Typography variant="caption" color="text.secondary">Select a content type to see its upload fields and supported file format.</Typography>}{kind === 'video' && <Alert severity="info">When local transcription is configured, TALA extracts the video transcript and detects explicit, answer-keyed quiz questions for review. Check the Transcription service in System Settings before processing large videos.</Alert>}<TextField label="Title" value={title} onChange={event => setTitle(event.target.value)} required /><TextField select label="Subject" value={subject} onChange={event => { setSubject(Number(event.target.value)); setCompetency(''); }} required disabled={!admin && Boolean(scope?.selectedSubjectId)} helperText={!admin && scope?.selectedSubject ? `Using the current teaching subject: ${scope.selectedSubject.name}.` : 'Only subjects assigned to you are available.'}>{subjects.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><TextField select label="Default Competency" value={competency} onChange={event => setCompetency(Number(event.target.value))} required disabled={!subject || availableCompetencies.length === 0} helperText={!subject ? 'Select a subject first.' : !availableCompetencies.length ? 'This subject has no active competency available to your account. Ask an administrator to review your subject assignment.' : kind === 'exam' ? 'The extractor uses this when the document does not specify a competency.' : 'Determines which recovery plans can use this material.'}>{availableCompetencies.map(item => <MenuItem key={item.id} value={item.id}>{item.code} · {item.title}</MenuItem>)}</TextField>{kind === 'exam' ? <><FormControl><Typography variant="body2" fontWeight={650}>Assessment Type</Typography><RadioGroup row value={assessmentKind} onChange={event => setAssessmentKind(event.target.value as 'pre' | 'post' | 'remedial')}><FormControlLabel value="pre" control={<Radio />} label="Diagnostic" /><FormControlLabel value="post" control={<Radio />} label="Mastery" /><FormControlLabel value="remedial" control={<Radio />} label="Remedial exam" /></RadioGroup></FormControl><TextField select label="Assign to Class" value={assignedClass} onChange={event => setAssignedClass(Number(event.target.value))} required>{availableClasses.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField></> : kind ? <><TextField label="Description" multiline minRows={2} value={description} onChange={event => setDescription(event.target.value)} /><Autocomplete multiple disableCloseOnSelect options={availableClasses} value={availableClasses.filter(item => materialClassIds.includes(item.id))} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={item => item.label} onChange={(_, values) => setMaterialClassIds(values.map(item => item.id))} renderOption={(props, option, state) => <Box component="li" {...props} key={option.id}><Checkbox checked={state.selected} size="small" sx={{ mr: 1 }} />{option.label}</Box>} renderInput={params => <TextField {...params} label="Assign to Classes" helperText="Students in these classes receive the material after administrator approval." placeholder={materialClassIds.length ? '' : 'Select classes'} />} /></> : null}{kind && <Button component="label" variant="outlined" startIcon={kind === 'video' ? <PlayCircleOutline /> : <CloudUploadOutlined />} sx={{ justifyContent: 'flex-start', minHeight: 48 }}>{file ? file.name : kind === 'video' ? 'Choose an MP4, WebM, or MOV video' : `Choose a ${kind === 'exam' ? 'PDF or DOCX exam' : 'PDF or DOCX module'}`}<input hidden type="file" accept={kind === 'video' ? '.mp4,.webm,.mov' : '.pdf,.docx'} onChange={event => setFile(event.target.files?.[0] ?? null)} /></Button>}<Typography variant="caption" color="text.secondary">Document limit: 25 MB. Video limit: 500 MB. Upload only school-authorized material.</Typography></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || !kind || !file || !subject || !competency || !title.trim() || (kind === 'exam' && !assignedClass)}>{busy ? 'Processing…' : 'Upload and Process'}</Button></DialogActions></Dialog>
  </>;
}
