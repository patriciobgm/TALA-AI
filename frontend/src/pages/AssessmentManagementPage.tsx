import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, AutoAwesome, CategoryOutlined, DeleteOutline, EditOutlined, EventOutlined, GroupsOutlined, QuizOutlined, RateReviewOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiAssessment, ApiClass, ApiCompetency, ApiQuestion, ApiSubject, LearningAssignment } from '../api/types';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useDataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useTeachingScope } from '../components/TeachingScopeContext';
import { MultiSelectField } from '../components/MultiSelectField';

const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];
const emptyAssessment = { title: '', subject: '' as number | '', kind: 'pre' as ApiAssessment['kind'], instructions: '', due_at: '', assigned_classes: [] as number[], prerequisite_assignments: [] as number[] };

export function AssessmentManagementPage({ admin = false }: { admin?: boolean }) {
  const [rows, setRows] = useState<ApiAssessment[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [competencies, setCompetencies] = useState<ApiCompetency[]>([]);
  const [materials, setMaterials] = useState<LearningAssignment[]>([]);
  const [viewing, setViewing] = useState<ApiAssessment | null>(null);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<ApiAssessment | null>(null);
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessment);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ApiQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<ApiQuestion | null>(null);
  const [questionDeleteBusy, setQuestionDeleteBusy] = useState(false);
  const [questionForm, setQuestionForm] = useState({ competency: '' as number | '', prompt: '', question_type: 'mcq', options: '', correct_answer: '' });
  const [questionError, setQuestionError] = useState('');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorBusy, setGeneratorBusy] = useState(false);
  const [generatorError, setGeneratorError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [generatorForm, setGeneratorForm] = useState({ competency_ids: [] as number[], resource_ids: [] as number[], count: 4, question_type: 'mcq' });
  const [error, setError] = useState('');
  const scope = useTeachingScope();

  const load = useCallback(() => Promise.all([
    api<ApiAssessment[] | { results?: ApiAssessment[] }>(`/assessments/?page_size=100${scope?.selectedSubjectId ? `&subject=${scope.selectedSubjectId}` : ''}`),
    api<ApiSubject[] | { results?: ApiSubject[] }>('/subjects/?page_size=100&status=active'),
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/?page_size=100&status=active'),
    api<ApiCompetency[] | { results?: ApiCompetency[] }>('/competencies/?page_size=200&status=active'),
    api<LearningAssignment[] | { results?: LearningAssignment[] }>('/learning-assignments/?page_size=200'),
  ]).then(([assessmentRows, subjectRows, classRows, competencyRows, materialRows]) => {
    setRows(unwrap(assessmentRows)); setSubjects(unwrap(subjectRows)); setClasses(unwrap(classRows)); setCompetencies(unwrap(competencyRows)); setMaterials(unwrap(materialRows));
  }).catch(reason => setError(reason.message)), [scope?.selectedSubjectId]);
  useEffect(() => { void load(); }, [load]);

  const table = useDataTable(rows, {
    searchText: row => `${row.title} ${row.kind} ${row.is_active ? 'active' : 'draft'}`,
    sortValues: { assessment: row => row.title, type: row => row.kind, questions: row => row.question_count, status: row => row.is_active },
    initialSort: 'assessment',
  });
  const openReview = async (assessment: ApiAssessment) => {
    try { setViewing(await api<ApiAssessment>(`/assessments/${assessment.id}/`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load assessment details.'); }
  };
  const openAssessmentEditor = (assessment?: ApiAssessment) => {
    setEditingAssessment(assessment ?? null);
    setAssessmentForm(assessment ? {
      title: assessment.title, subject: assessment.subject, kind: assessment.kind, instructions: assessment.instructions,
      due_at: assessment.due_at ? new Date(assessment.due_at).toISOString().slice(0, 16) : '', assigned_classes: assessment.assigned_classes, prerequisite_assignments: assessment.prerequisite_assignments,
    } : { ...emptyAssessment, subject: scope?.selectedSubjectId ?? subjects[0]?.id ?? '', assigned_classes: scope?.classes.map(item => item.id) ?? [] });
    setAssessmentOpen(true);
  };
  const saveAssessment = async () => {
    if (admin && !assessmentForm.assigned_classes.length) {
      setError('Select at least one assigned class before saving the assessment.');
      return;
    }
    if (!admin && !scope?.classes.length) {
      setError('No active class is available for this teaching subject. Ask an administrator to review the subject and class setup.');
      return;
    }
    setError('');
    try {
      const body = { ...assessmentForm, assigned_classes: admin ? assessmentForm.assigned_classes : undefined, due_at: assessmentForm.due_at ? new Date(assessmentForm.due_at).toISOString() : null };
      const saved = await api<ApiAssessment>(editingAssessment ? `/assessments/${editingAssessment.id}/` : '/assessments/', { method: editingAssessment ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setAssessmentOpen(false); await load(); if (editingAssessment) await openReview(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this assessment.'); }
  };
  const setActive = async (assessment: ApiAssessment, active: boolean) => {
    try { await api(`/assessments/${assessment.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }); setViewing(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update assessment availability.'); }
  };
  const deleteAssessment = async () => {
    if (!viewing || viewing.is_active) return;
    setDeleteBusy(true); setError('');
    try {
      await api(`/assessments/${viewing.id}/`, { method: 'DELETE' });
      setConfirmDelete(false); setViewing(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete this draft assessment.'); }
    finally { setDeleteBusy(false); }
  };
  const openQuestionEditor = (question?: ApiQuestion) => {
    const first = competencies.find(item => item.subject === viewing?.subject);
    setEditingQuestion(question ?? null);
    setQuestionError('');
    setQuestionForm({ competency: question?.competency ?? first?.id ?? '', prompt: question?.prompt ?? '', question_type: question?.question_type ?? 'mcq', options: question?.options.join('\n') ?? '', correct_answer: question?.correct_answer ?? '' });
    setQuestionOpen(true);
  };
  const saveQuestion = async () => {
    if (!viewing) return;
    const options = questionForm.question_type === 'short' ? [] : questionForm.options.split('\n').map(item => item.trim()).filter(Boolean);
    if (!questionForm.competency || !questionForm.prompt.trim() || !questionForm.correct_answer.trim()) {
      setQuestionError('Complete the competency, question, and correct answer fields.');
      return;
    }
    if (questionForm.question_type !== 'short' && options.length < 2) {
      setQuestionError('Enter at least two answer choices.');
      return;
    }
    if (questionForm.question_type !== 'short' && !options.includes(questionForm.correct_answer)) {
      setQuestionError('Select a correct answer from the available choices.');
      return;
    }
    setQuestionError('');
    try {
      await api(`/assessments/${viewing.id}/questions/${editingQuestion ? `${editingQuestion.id}/` : ''}`, { method: editingQuestion ? 'PATCH' : 'POST', body: JSON.stringify({ ...questionForm, options }) });
      setQuestionOpen(false); await openReview(viewing); await load();
    } catch (reason) { setQuestionError(reason instanceof Error ? reason.message : 'Unable to save this question.'); }
  };
  const deleteQuestion = async () => {
    if (!viewing || !deletingQuestion) return;
    setQuestionDeleteBusy(true); setError('');
    try {
      await api(`/assessments/${viewing.id}/questions/${deletingQuestion.id}/`, { method: 'DELETE' });
      setDeletingQuestion(null); await openReview(viewing); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete this question.'); }
    finally { setQuestionDeleteBusy(false); }
  };
  const questionChoices = questionForm.question_type === 'short' ? [] : questionForm.options.split('\n').map(item => item.trim()).filter(Boolean);
  const workspaceCompetencies = competencies.filter(item => item.subject === viewing?.subject);
  const workspaceMaterials = materials.filter(item => item.competency && competencies.some(competency => competency.id === item.competency?.id && competency.subject === viewing?.subject));
  const openGenerator = () => {
    setGeneratorForm({ competency_ids: workspaceCompetencies.map(item => item.id), resource_ids: workspaceMaterials.map(item => item.resource), count: 4, question_type: 'mcq' });
    setGeneratorError('');
    setGeneratorOpen(true);
  };
  const generateQuestions = async () => {
    if (!viewing || !generatorForm.competency_ids.length) { setGeneratorError('Select at least one competency.'); return; }
    setGeneratorBusy(true); setGeneratorError('');
    try {
      await api(`/assessments/${viewing.id}/generate-questions/`, { method: 'POST', body: JSON.stringify(generatorForm) });
      setGeneratorOpen(false); await openReview(viewing); await load();
    } catch (reason) { setGeneratorError(reason instanceof Error ? reason.message : 'Unable to generate questions.'); }
    finally { setGeneratorBusy(false); }
  };
  const reviewType = viewing?.kind === 'pre' ? 'Diagnostic' : viewing?.kind === 'post' ? 'Mastery' : 'Remedial exam';
  const reviewClassLabels = classes.filter(item => viewing?.assigned_classes.includes(item.id)).map(item => item.label);
  const reviewSummary = [
    { label: 'Questions', value: viewing?.question_count ?? 0, detail: viewing?.question_count ? 'Ready for review' : 'Questions required', icon: <QuizOutlined /> },
    { label: 'Assigned classes', value: reviewClassLabels.length || viewing?.assigned_classes.length || 0, detail: reviewClassLabels.join(', ') || 'No classes assigned', icon: <GroupsOutlined /> },
    { label: 'Due date', value: viewing?.due_at ? new Date(viewing.due_at).toLocaleDateString() : 'No deadline', detail: viewing?.due_at ? new Date(viewing.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Available until deactivated', icon: <EventOutlined /> },
    { label: 'Assessment type', value: reviewType, detail: viewing?.kind === 'remedial' ? 'Individual eligibility applies' : viewing?.kind === 'pre' ? 'Measures initial competency' : 'Checks mastery after learning', icon: <CategoryOutlined /> },
  ];

  return <>
    <PageHeader title="Assessments" description={admin ? 'Create drafts, manage questions and class assignments, then control learner availability.' : 'Create drafts for the current teaching subject. Matching classes are assigned automatically.'} action={<Button variant="contained" startIcon={<Add />} onClick={() => openAssessmentEditor()}>Add Assessment</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Card><DataTableToolbar query={table.query} onQuery={table.setQuery} placeholder="Search assessments" count={table.filteredCount} /><Divider /><TableContainer><Table sx={{ minWidth: 760 }}><TableHead><TableRow><SortableTableCell column="assessment" label="Assessment" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="type" label="Type" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="questions" label="Questions" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{table.pageRows.map(row => <TableRow key={row.id} hover><TableCell><Typography variant="body2" fontWeight={700}>{row.title}</Typography><Typography variant="caption" color="text.secondary">{subjects.find(item => item.id === row.subject)?.name}</Typography></TableCell><TableCell>{row.kind === 'pre' ? 'Diagnostic' : row.kind === 'post' ? 'Mastery' : 'Remedial exam'}</TableCell><TableCell>{row.question_count}</TableCell><TableCell><StatusChip label={row.is_active ? 'Active' : 'Draft'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<RateReviewOutlined />} onClick={() => void openReview(row)}>Review</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer><DataTablePagination count={table.filteredCount} page={table.page} rowsPerPage={table.rowsPerPage} onPage={table.setPage} onRowsPerPage={table.setRowsPerPage} /></Card>

    <Dialog component="form" open={assessmentOpen} onClose={() => setAssessmentOpen(false)} onSubmit={event => { event.preventDefault(); void saveAssessment(); }} fullWidth maxWidth="sm">
      <DialogTitle>{editingAssessment ? 'Edit Assessment' : 'Add Assessment'}</DialogTitle>
      <DialogContent><Stack gap={2} sx={{ pt: 1 }}>
        <Alert severity="info">{admin ? 'New assessments are saved as drafts. Add questions and review the class assignment before activation.' : `New assessments are saved as drafts and automatically assigned to ${scope?.classes.length ?? 0} active class${scope?.classes.length === 1 ? '' : 'es'} for this teaching subject.`}</Alert>
        <TextField label="Assessment Title" value={assessmentForm.title} onChange={event => setAssessmentForm(value => ({ ...value, title: event.target.value }))} required />
        <TextField select label="Subject" value={assessmentForm.subject} onChange={event => setAssessmentForm(value => ({ ...value, subject: Number(event.target.value), prerequisite_assignments: [] }))} disabled={!admin || Boolean(editingAssessment?.question_count)} helperText={!admin ? 'Controlled by the teaching subject selected in the sidebar.' : undefined} required>{subjects.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · Grade {item.grade_level}</MenuItem>)}</TextField>
        <TextField select label="Assessment Type" value={assessmentForm.kind} onChange={event => setAssessmentForm(value => ({ ...value, kind: event.target.value as ApiAssessment['kind'], prerequisite_assignments: event.target.value === 'pre' ? value.prerequisite_assignments : [] }))}><MenuItem value="pre">Diagnostic assessment</MenuItem><MenuItem value="post">Mastery assessment</MenuItem><MenuItem value="remedial">Remedial exam · parent consent required</MenuItem></TextField>
        {admin && <MultiSelectField label="Assigned Classes" options={classes.map(item => ({ id: item.id, label: item.label, detail: `Grade ${item.grade_level}` }))} value={assessmentForm.assigned_classes} onChange={ids => setAssessmentForm(value => ({ ...value, assigned_classes: ids.map(Number) }))} helperText="Select one or more classes that should receive this assessment." required />}
        {assessmentForm.kind === 'pre' && <MultiSelectField label="Required Learning Materials" options={materials.filter(item => item.competency && competencies.some(competency => competency.id === item.competency?.id && competency.subject === assessmentForm.subject)).map(item => ({ id: item.id, label: item.resource_title, detail: item.competency?.title }))} value={assessmentForm.prerequisite_assignments} onChange={ids => setAssessmentForm(value => ({ ...value, prerequisite_assignments: ids.map(Number) }))} helperText="Optional. Learners must complete these assignments before this diagnostic unlocks." />}
        <TextField label="Due Date" type="datetime-local" value={assessmentForm.due_at} onChange={event => setAssessmentForm(value => ({ ...value, due_at: event.target.value }))} InputLabelProps={{ shrink: true }} />
        <TextField label="Instructions" value={assessmentForm.instructions} onChange={event => setAssessmentForm(value => ({ ...value, instructions: event.target.value }))} multiline minRows={3} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setAssessmentOpen(false)}>Cancel</Button><Button type="submit" variant="contained">Save Assessment</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(viewing) && !questionOpen && !assessmentOpen && !generatorOpen && !confirmDelete && !deletingQuestion} onClose={() => setViewing(null)} fullWidth maxWidth="md"><DialogTitle><Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}><Box><Typography variant="h2">{viewing?.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{subjects.find(item => item.id === viewing?.subject)?.name}</Typography></Box><StatusChip label={viewing?.is_active ? 'Active' : 'Draft'} /></Stack></DialogTitle><DialogContent dividers><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 3 }}>{reviewSummary.map(item => <Box key={item.label} sx={{ display: 'flex', gap: 1.5, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', minWidth: 0 }}><Box sx={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: '#edf4f7', color: 'primary.main' }}>{item.icon}</Box><Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{item.label}</Typography><Typography variant="h3" sx={{ mt: .25 }}>{item.value}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .25, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</Typography></Box></Box>)}</Box><Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1 }}><Typography variant="h3">Questions</Typography>{viewing && !viewing.is_active && <Stack direction="row" gap={1}><Button size="small" variant="outlined" startIcon={<AutoAwesome />} onClick={openGenerator}>Generate with AI</Button><Button size="small" variant="outlined" startIcon={<Add />} onClick={() => openQuestionEditor()}>Add Question</Button></Stack>}</Box><Stack divider={<Divider />}>{viewing?.questions?.map((question, index) => <Box key={question.id} sx={{ py: 2, display: 'flex', gap: 2 }}><Typography variant="body2" color="text.secondary">{index + 1}.</Typography><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={700}>{question.prompt}</Typography><Typography variant="caption" color="text.secondary">{question.competency_title}</Typography>{question.options.length > 0 && <Box component="ol" type="A" sx={{ my: 1, pl: 3 }}>{question.options.map(option => <Typography component="li" variant="body2" key={option}>{option}</Typography>)}</Box>}<Typography variant="caption" color="success.dark" fontWeight={700}>Correct answer: {question.correct_answer}</Typography></Box>{viewing && !viewing.is_active && <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="flex-start" gap={.5}><Button size="small" startIcon={<EditOutlined />} onClick={() => openQuestionEditor(question)}>Edit</Button><Button size="small" color="error" startIcon={<DeleteOutline />} onClick={() => setDeletingQuestion(question)}>Delete</Button></Stack>}</Box>)}</Stack>{viewing && !viewing.questions?.length && <Alert severity="warning">Add at least one question before activation.</Alert>}</DialogContent><DialogActions>{viewing && !viewing.is_active && <><Button color="error" startIcon={<DeleteOutline />} onClick={() => setConfirmDelete(true)}>Delete Draft</Button><Button startIcon={<EditOutlined />} onClick={() => openAssessmentEditor(viewing)}>Edit Assessment</Button></>}<Box sx={{ flex: 1 }} /><Button onClick={() => setViewing(null)}>Close</Button>{viewing && <Button variant={viewing.is_active ? 'outlined' : 'contained'} onClick={() => void setActive(viewing, !viewing.is_active)}>{viewing.is_active ? 'Return to Draft' : 'Activate Assessment'}</Button>}</DialogActions></Dialog>

    <Dialog open={confirmDelete} onClose={() => !deleteBusy && setConfirmDelete(false)} maxWidth="xs" fullWidth><DialogTitle>Delete Draft Assessment?</DialogTitle><DialogContent><Typography variant="body2">This permanently removes “{viewing?.title}” and all of its draft questions. Assessments with learner attempts cannot be deleted.</Typography></DialogContent><DialogActions><Button onClick={() => setConfirmDelete(false)} disabled={deleteBusy}>Cancel</Button><Button color="error" variant="contained" onClick={() => void deleteAssessment()} disabled={deleteBusy}>{deleteBusy ? 'Deleting…' : 'Delete Draft'}</Button></DialogActions></Dialog>

    <Dialog open={Boolean(deletingQuestion)} onClose={() => !questionDeleteBusy && setDeletingQuestion(null)} maxWidth="xs" fullWidth><DialogTitle>Delete Question?</DialogTitle><DialogContent><Typography variant="body2">This permanently removes this question from the draft assessment:</Typography><Typography variant="body2" fontWeight={700} sx={{ mt: 1.5 }}>{deletingQuestion?.prompt}</Typography></DialogContent><DialogActions><Button onClick={() => setDeletingQuestion(null)} disabled={questionDeleteBusy}>Cancel</Button><Button color="error" variant="contained" onClick={() => void deleteQuestion()} disabled={questionDeleteBusy}>{questionDeleteBusy ? 'Deleting…' : 'Delete Question'}</Button></DialogActions></Dialog>

    <Dialog component="form" open={generatorOpen} onClose={() => !generatorBusy && setGeneratorOpen(false)} onSubmit={event => { event.preventDefault(); void generateQuestions(); }} fullWidth maxWidth="sm">
      <DialogTitle><Typography variant="h2">Generate Questions with AI</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{viewing?.title}</Typography></DialogTitle>
      <DialogContent dividers><Stack gap={2}>
        {generatorError && <Alert severity="error">{generatorError}</Alert>}
        <Alert severity="info">Questions are generated only from this teaching workspace and your selected competencies. They remain editable drafts for teacher review.</Alert>
        <MultiSelectField label="Competencies" options={workspaceCompetencies.map(item => ({ id: item.id, label: `${item.code} · ${item.title}` }))} value={generatorForm.competency_ids} onChange={ids => setGeneratorForm(value => ({ ...value, competency_ids: ids.map(Number) }))} helperText="Select one or more competencies from this teaching workspace." disabled={generatorBusy} required />
        <MultiSelectField label="Approved Learning Material Sources" options={workspaceMaterials.map(item => ({ id: item.resource, label: item.resource_title, detail: item.competency?.title }))} value={generatorForm.resource_ids} onChange={ids => setGeneratorForm(value => ({ ...value, resource_ids: ids.map(Number) }))} helperText="Optional but recommended. AI grounds new questions in these reviewed documents or transcripts." disabled={generatorBusy} />
        <TextField select label="Question Type" value={generatorForm.question_type} disabled={generatorBusy} onChange={event => setGeneratorForm(value => ({ ...value, question_type: event.target.value }))}><MenuItem value="mcq">Multiple choice</MenuItem><MenuItem value="tf">True or false</MenuItem><MenuItem value="short">Short answer</MenuItem></TextField>
        <TextField label="Number of Questions" type="number" value={generatorForm.count} disabled={generatorBusy} onChange={event => setGeneratorForm(value => ({ ...value, count: Number(event.target.value) }))} inputProps={{ min: 1, max: 12 }} helperText="Generate 1 to 12 questions at a time." required />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setGeneratorOpen(false)} disabled={generatorBusy}>Cancel</Button><Button type="submit" variant="contained" startIcon={<AutoAwesome />} disabled={generatorBusy}>{generatorBusy ? 'Generating…' : 'Generate Drafts'}</Button></DialogActions>
    </Dialog>

    <Dialog component="form" open={questionOpen} onClose={() => setQuestionOpen(false)} onSubmit={event => { event.preventDefault(); void saveQuestion(); }} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h2">{editingQuestion ? 'Edit Assessment Question' : 'Add Assessment Question'}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{viewing?.title}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          {questionError && <Alert severity="error">{questionError}</Alert>}
          <Alert severity="info">Changes remain in draft until the assessment is activated.</Alert>
          <TextField select label="Competency" value={questionForm.competency} onChange={event => setQuestionForm(value => ({ ...value, competency: Number(event.target.value) }))} required>
            {competencies.filter(item => item.subject === viewing?.subject).map(item => <MenuItem key={item.id} value={item.id}>{item.code} · {item.title}</MenuItem>)}
          </TextField>
          <TextField label="Question" value={questionForm.prompt} onChange={event => setQuestionForm(value => ({ ...value, prompt: event.target.value }))} multiline minRows={3} required />
          <TextField select label="Question Type" value={questionForm.question_type} onChange={event => { const questionType = event.target.value; setQuestionForm(value => ({ ...value, question_type: questionType, options: questionType === 'tf' ? 'True\nFalse' : questionType === 'short' ? '' : value.options, correct_answer: '' })); }}>
            <MenuItem value="mcq">Multiple choice</MenuItem>
            <MenuItem value="tf">True or false</MenuItem>
            <MenuItem value="short">Short answer</MenuItem>
          </TextField>
          {questionForm.question_type === 'mcq' && <TextField label="Answer Choices" value={questionForm.options} onChange={event => setQuestionForm(value => ({ ...value, options: event.target.value, correct_answer: event.target.value.split('\n').map(item => item.trim()).includes(value.correct_answer) ? value.correct_answer : '' }))} multiline minRows={4} helperText="Enter one answer choice per line. Add at least two choices." required />}
          {questionForm.question_type !== 'short' ? <TextField select label="Correct Answer" value={questionChoices.includes(questionForm.correct_answer) ? questionForm.correct_answer : ''} onChange={event => setQuestionForm(value => ({ ...value, correct_answer: event.target.value }))} helperText="Select the exact answer learners must choose." required>{questionChoices.map(choice => <MenuItem key={choice} value={choice}>{choice}</MenuItem>)}</TextField> : <TextField label="Correct Answer" value={questionForm.correct_answer} onChange={event => setQuestionForm(value => ({ ...value, correct_answer: event.target.value }))} helperText="Enter the expected short answer." required />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setQuestionOpen(false)}>Cancel</Button>
        <Button type="submit" variant="contained">{editingQuestion ? 'Save Changes' : 'Add Question'}</Button>
      </DialogActions>
    </Dialog>
  </>;
}
