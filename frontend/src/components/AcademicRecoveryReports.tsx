import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, Divider, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography } from '@mui/material';
import { api } from '../api/client';
import { downloadText } from '../utils/download';
import { StatusChip } from './StatusChip';

type ReportKey = 'learner_recovery' | 'class_subject_recovery' | 'assessment_performance' | 'learning_gaps' | 'interventions';
type ReportRow = Record<string, unknown>;
type ReportResponse = Record<ReportKey, ReportRow[]> & { generated_at: string };

const reports: { key: ReportKey; label: string; description: string }[] = [
  { key: 'learner_recovery', label: 'Learner Recovery', description: 'Baseline, latest result, learning gaps, and recovery activity completion per learner.' },
  { key: 'class_subject_recovery', label: 'Class / Subject', description: 'Enrollment, average submitted score, and active learning gaps by class and subject.' },
  { key: 'assessment_performance', label: 'Assessment Performance', description: 'Submitted pre-assessment, post-assessment, and remedial results.' },
  { key: 'learning_gaps', label: 'Learning Gaps', description: 'Competency-level gaps, priority, classification, and resolution status.' },
  { key: 'interventions', label: 'Interventions', description: 'Teacher interventions, follow-up status, and responsible teacher.' },
];

const columns: Record<ReportKey, { key: string; label: string }[]> = {
  learner_recovery: [
    { key: 'learner', label: 'Learner' }, { key: 'section', label: 'Section' }, { key: 'subjects', label: 'Subjects' },
    { key: 'baseline_score', label: 'Baseline' }, { key: 'latest_score', label: 'Latest' }, { key: 'active_gaps', label: 'Active Gaps' },
    { key: 'completed_activities', label: 'Activities' },
  ],
  class_subject_recovery: [
    { key: 'subject', label: 'Subject' }, { key: 'section', label: 'Section' }, { key: 'learners', label: 'Learners' },
    { key: 'average_score', label: 'Average Score' }, { key: 'active_gaps', label: 'Active Gaps' },
  ],
  assessment_performance: [
    { key: 'learner', label: 'Learner' }, { key: 'section', label: 'Section' }, { key: 'assessment', label: 'Assessment' },
    { key: 'type', label: 'Type' }, { key: 'score', label: 'Score' }, { key: 'grading_status', label: 'Grading' }, { key: 'submitted_at', label: 'Submitted' },
  ],
  learning_gaps: [
    { key: 'learner', label: 'Learner' }, { key: 'subject', label: 'Subject' }, { key: 'competency', label: 'Competency' },
    { key: 'score', label: 'Score' }, { key: 'classification', label: 'Classification' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' },
  ],
  interventions: [
    { key: 'learner', label: 'Learner' }, { key: 'subject', label: 'Subject' }, { key: 'competency', label: 'Competency' },
    { key: 'action', label: 'Action' }, { key: 'status', label: 'Status' }, { key: 'teacher', label: 'Teacher' }, { key: 'follow_up_at', label: 'Follow-up' },
  ],
};

function displayValue(key: string, value: unknown, row: ReportRow) {
  if (key === 'completed_activities') return `${value ?? 0} / ${row.total_activities ?? 0}`;
  if (key === 'subjects' && Array.isArray(value)) return value.join(', ');
  if (key.includes('score')) return value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100) / 100}%`;
  if (key.endsWith('_at')) return value ? new Date(String(value)).toLocaleString() : '—';
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function AcademicRecoveryReports({ subjectId }: { subjectId: number }) {
  const [selected, setSelected] = useState<ReportKey>('learner_recovery');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true); setError('');
    api<ReportResponse>(`/reports/academic-recovery/?subject=${subjectId}`)
      .then(setData).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load reports.')).finally(() => setLoading(false));
  }, [subjectId]);
  const definition = reports.find(item => item.key === selected) ?? reports[0];
  const rows = useMemo(() => data?.[selected] ?? [], [data, selected]);
  const currentColumns = columns[selected];
  const csv = useMemo(() => [currentColumns.map(item => csvCell(item.label)).join(','), ...rows.map(row => currentColumns.map(item => csvCell(displayValue(item.key, row[item.key], row))).join(','))].join('\n'), [currentColumns, rows]);
  return <Card sx={{ mb: 3 }}>
    <Box sx={{ px: 2.5, pt: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
      <Box><Typography variant="h2">Required Academic Recovery Reports</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Operational reports generated from authorized assessment, gap, recovery, and intervention records.</Typography></Box>
      <Button variant="outlined" disabled={!rows.length} onClick={() => downloadText(`tala-${selected.replaceAll('_', '-')}.csv`, csv)}>Export CSV</Button>
    </Stack></Box>
    <Tabs value={selected} onChange={(_, value) => setSelected(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1.5, mt: 1 }}>
      {reports.map(item => <Tab key={item.key} value={item.key} label={item.label} />)}
    </Tabs><Divider />
    <Box sx={{ px: 2.5, py: 2 }}><Typography fontWeight={700}>{definition.label}</Typography><Typography variant="body2" color="text.secondary">{definition.description}</Typography></Box>
    {error && <Alert severity="error" sx={{ mx: 2.5, mb: 2 }}>{error}</Alert>}
    <TableContainer><Table sx={{ minWidth: 820 }} size="small"><TableHead><TableRow>{currentColumns.map(column => <TableCell key={column.key}>{column.label}</TableCell>)}</TableRow></TableHead><TableBody>
      {!loading && !rows.length && <TableRow><TableCell colSpan={currentColumns.length}><Box sx={{ py: 4, textAlign: 'center' }}><Typography fontWeight={700}>No records for this report</Typography><Typography variant="body2" color="text.secondary">Records will appear after learners complete the corresponding recovery activities.</Typography></Box></TableCell></TableRow>}
      {rows.map((row, index) => <TableRow key={String(row.attempt_id ?? row.gap_id ?? row.intervention_id ?? row.student_id ?? `${row.subject}-${row.section}-${index}`)} hover>{currentColumns.map(column => <TableCell key={column.key}>{['status', 'classification', 'priority', 'grading_status'].includes(column.key) && row[column.key] ? <StatusChip label={String(row[column.key])} /> : displayValue(column.key, row[column.key], row)}</TableCell>)}</TableRow>)}
    </TableBody></Table></TableContainer>
  </Card>;
}
