import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Add, EditOutlined, RateReviewOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiAssessment, ApiClass, ApiCompetency, ApiQuestion, ApiSubject } from '../api/types';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useDataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useTeachingScope } from '../components/TeachingScopeContext';

const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];
const emptyAssessment = { title: '', subject: '' as number | '', kind: 'pre' as ApiAssessment['kind'], instructions: '', due_at: '', assigned_classes: [] as number[] };

export function AssessmentManagementPage() {
  const [rows, setRows] = useState<ApiAssessment[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [competencies, setCompetencies] = useState<ApiCompetency[]>([]);
  const [viewing, setViewing] = useState<ApiAssessment | null>(null);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<ApiAssessment | null>(null);
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessment);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ApiQuestion | null>(null);
  const [questionForm, setQuestionForm] = useState({ competency: '' as number | '', prompt: '', question_type: 'mcq', options: '', correct_answer: '' });
  const [questionError, setQuestionError] = useState('');
  const [error, setError] = useState('');
  const scope = useTeachingScope();

  const load = useCallback(() => Promise.all([
    api<ApiAssessment[] | { results?: ApiAssessment[] }>(`/assessments/?page_size=100${scope?.selectedSubjectId ? `&subject=${scope.selectedSubjectId}` : ''}`),
    api<ApiSubject[] | { results?: ApiSubject[] }>('/subjects/?page_size=100&status=active'),
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/?page_size=100&status=active'),
    api<ApiCompetency[] | { results?: ApiCompetency[] }>('/competencies/?page_size=200&status=active'),
  ]).then(([assessmentRows, subjectRows, classRows, competencyRows]) => {
    setRows(unwrap(assessmentRows)); setSubjects(unwrap(subjectRows)); setClasses(unwrap(classRows)); setCompetencies(unwrap(competencyRows));
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
      due_at: assessment.due_at ? new Date(assessment.due_at).toISOString().slice(0, 16) : '', assigned_classes: assessment.assigned_classes,
    } : { ...emptyAssessment, subject: scope?.selectedSubjectId ?? subjects[0]?.id ?? '' });
    setAssessmentOpen(true);
  };
  const saveAssessment = async () => {
    if (!assessmentForm.assigned_classes.length) {
      setError('Select at least one assigned class before saving the assessment.');
      return;
    }
    setError('');
    try {
      const body = { ...assessmentForm, due_at: assessmentForm.due_at ? new Date(assessmentForm.due_at).toISOString() : null };
      const saved = await api<ApiAssessment>(editingAssessment ? `/assessments/${editingAssessment.id}/` : '/assessments/', { method: editingAssessment ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setAssessmentOpen(false); await load(); if (editingAssessment) await openReview(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this assessment.'); }
  };
  const setActive = async (assessment: ApiAssessment, active: boolean) => {
    try { await api(`/assessments/${assessment.id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }); setViewing(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update assessment availability.'); }
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
  const questionChoices = questionForm.question_type === 'short' ? [] : questionForm.options.split('\n').map(item => item.trim()).filter(Boolean);

  return <>
    <PageHeader title="Assessments" description="Create drafts, manage questions and class assignments, then control learner availability." action={<Button variant="contained" startIcon={<Add />} onClick={() => openAssessmentEditor()}>Add Assessment</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    <Card><DataTableToolbar query={table.query} onQuery={table.setQuery} placeholder="Search assessments" count={table.filteredCount} /><Divider /><TableContainer><Table sx={{ minWidth: 760 }}><TableHead><TableRow><SortableTableCell column="assessment" label="Assessment" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="type" label="Type" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="questions" label="Questions" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{table.pageRows.map(row => <TableRow key={row.id} hover><TableCell><Typography variant="body2" fontWeight={700}>{row.title}</Typography><Typography variant="caption" color="text.secondary">{subjects.find(item => item.id === row.subject)?.name}</Typography></TableCell><TableCell>{row.kind === 'pre' ? 'Diagnostic' : row.kind === 'post' ? 'Mastery' : 'Remedial exam'}</TableCell><TableCell>{row.question_count}</TableCell><TableCell><StatusChip label={row.is_active ? 'Active' : 'Draft'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<RateReviewOutlined />} onClick={() => void openReview(row)}>Review</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer><DataTablePagination count={table.filteredCount} page={table.page} rowsPerPage={table.rowsPerPage} onPage={table.setPage} onRowsPerPage={table.setRowsPerPage} /></Card>

    <Dialog component="form" open={assessmentOpen} onClose={() => setAssessmentOpen(false)} onSubmit={event => { event.preventDefault(); void saveAssessment(); }} fullWidth maxWidth="sm"><DialogTitle>{editingAssessment ? 'Edit Assessment' : 'Add Assessment'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><Alert severity="info">New assessments are saved as drafts. Add questions and review the class assignment before activation.</Alert><TextField label="Assessment Title" value={assessmentForm.title} onChange={event => setAssessmentForm(value => ({ ...value, title: event.target.value }))} required /><TextField select label="Subject" value={assessmentForm.subject} onChange={event => setAssessmentForm(value => ({ ...value, subject: Number(event.target.value) }))} disabled={Boolean(editingAssessment?.question_count)} required>{subjects.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · Grade {item.grade_level}</MenuItem>)}</TextField><TextField select label="Assessment Type" value={assessmentForm.kind} onChange={event => setAssessmentForm(value => ({ ...value, kind: event.target.value as ApiAssessment['kind'] }))}><MenuItem value="pre">Diagnostic assessment</MenuItem><MenuItem value="post">Mastery assessment</MenuItem><MenuItem value="remedial">Remedial exam · parent consent required</MenuItem></TextField><Autocomplete multiple disableCloseOnSelect options={classes} value={classes.filter(item => assessmentForm.assigned_classes.includes(item.id))} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={item => item.label} onChange={(_, values) => setAssessmentForm(value => ({ ...value, assigned_classes: values.map(item => item.id) }))} renderOption={(props, option, state) => <Box component="li" {...props} key={option.id}><Checkbox checked={state.selected} size="small" sx={{ mr: 1 }} />{option.label}</Box>} renderInput={params => <TextField {...params} label="Assigned Classes" error={!assessmentForm.assigned_classes.length && Boolean(error)} helperText="Select one or more classes that should receive this assessment." />} /><TextField label="Due Date" type="datetime-local" value={assessmentForm.due_at} onChange={event => setAssessmentForm(value => ({ ...value, due_at: event.target.value }))} InputLabelProps={{ shrink: true }} /><TextField label="Instructions" value={assessmentForm.instructions} onChange={event => setAssessmentForm(value => ({ ...value, instructions: event.target.value }))} multiline minRows={3} /></Stack></DialogContent><DialogActions><Button onClick={() => setAssessmentOpen(false)}>Cancel</Button><Button type="submit" variant="contained">Save Assessment</Button></DialogActions></Dialog>

    <Dialog open={Boolean(viewing) && !questionOpen && !assessmentOpen} onClose={() => setViewing(null)} fullWidth maxWidth="md"><DialogTitle><Typography variant="h2">{viewing?.title}</Typography><Typography variant="body2" color="text.secondary">{viewing?.is_active ? 'Active assessment' : 'Draft assessment'}</Typography></DialogTitle><DialogContent dividers><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>{[['Questions', viewing?.question_count], ['Assigned Classes', viewing?.assigned_classes.length], ['Due Date', viewing?.due_at ? new Date(viewing.due_at).toLocaleString() : 'None'], ['Type', viewing?.kind]].map(([label, value]) => <Box key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700}>{value}</Typography></Box>)}</Box><Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1 }}><Typography variant="h3">Questions</Typography>{viewing && !viewing.is_active && <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => openQuestionEditor()}>Add Question</Button>}</Box><Stack divider={<Divider />}>{viewing?.questions?.map((question, index) => <Box key={question.id} sx={{ py: 2, display: 'flex', gap: 2 }}><Typography variant="body2" color="text.secondary">{index + 1}.</Typography><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={700}>{question.prompt}</Typography><Typography variant="caption" color="text.secondary">{question.competency_title}</Typography>{question.options.length > 0 && <Box component="ol" type="A" sx={{ my: 1, pl: 3 }}>{question.options.map(option => <Typography component="li" variant="body2" key={option}>{option}</Typography>)}</Box>}<Typography variant="caption" color="success.dark" fontWeight={700}>Correct answer: {question.correct_answer}</Typography></Box>{viewing && !viewing.is_active && <Button size="small" startIcon={<EditOutlined />} onClick={() => openQuestionEditor(question)}>Edit</Button>}</Box>)}</Stack>{viewing && !viewing.questions?.length && <Alert severity="warning">Add at least one question before activation.</Alert>}</DialogContent><DialogActions>{viewing && !viewing.is_active && <Button startIcon={<EditOutlined />} onClick={() => openAssessmentEditor(viewing)}>Edit Assessment</Button>}<Box sx={{ flex: 1 }} /><Button onClick={() => setViewing(null)}>Close</Button>{viewing && <Button variant={viewing.is_active ? 'outlined' : 'contained'} onClick={() => void setActive(viewing, !viewing.is_active)}>{viewing.is_active ? 'Return to Draft' : 'Activate Assessment'}</Button>}</DialogActions></Dialog>

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
