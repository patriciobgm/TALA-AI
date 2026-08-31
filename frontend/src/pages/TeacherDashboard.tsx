import { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Box, Button, Card, Divider, FormControl, InputLabel,
  Alert, CircularProgress, LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material';
import { ArrowForward, GroupsOutlined, TrendingUp, WarningAmberOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiLearner } from '../api/types';
import { Metric } from '../components/Metric';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { downloadText } from '../utils/download';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useDataTable } from '../components/DataTable';
import { useTeachingScope } from '../components/TeachingScopeContext';
import { EnrollmentPanel } from '../components/EnrollmentPanel';

export function TeacherDashboard({ onSelectLearner }: { onSelectLearner: (id: number) => void }) {
  const [status, setStatus] = useState('All');
  const [learners, setLearners] = useState<ApiLearner[] | null>(null);
  const [error, setError] = useState('');
  const scope = useTeachingScope();
  const load = useCallback(() => { if (!scope?.selectedSubjectId || !scope.selectedClassId) return Promise.resolve(); setLearners(null); setError(''); return api<ApiLearner[]>(`/dashboard/teacher/learners/?subject=${scope.selectedSubjectId}&class=${scope.selectedClassId}`).then(setLearners).catch(reason => setError(reason.message)); }, [scope?.selectedClassId, scope?.selectedSubjectId]);
  useEffect(() => { void load(); }, [load]);
  const statusRows = (learners ?? []).filter(learner => status === 'All' || learner.status === status);
  const table = useDataTable(statusRows, { searchText: learner => `${learner.name} ${learner.email} ${learner.section} ${learner.status}`, sortValues: { learner: learner => learner.name, progress: learner => learner.progress, gaps: learner => learner.gaps, assessment: learner => learner.assessment, status: learner => learner.status }, initialSort: 'learner' });
  if (!learners && !error) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  const counts = { onTrack: learners?.filter(item => item.status === 'On track').length ?? 0, monitor: learners?.filter(item => item.status === 'Monitor').length ?? 0, intervention: learners?.filter(item => item.status === 'Intervention').length ?? 0 };
  const masteryRate = learners?.length ? Math.round((learners.filter(item => (item.assessment ?? 0) >= 75).length / learners.length) * 100) : 0;

  return <>
    <PageHeader title="Learners" description="Monitor recovery progress and identify where teacher support is needed." action={<Button variant="outlined" disabled={!learners?.length} onClick={() => downloadText('tala-class-recovery.csv', ['Learner,Progress,Learning gaps,Last assessment,Status', ...(learners ?? []).map(l => `${l.name},${l.progress}%,${l.gaps},${l.assessment ?? ''}%,${l.status}`)].join('\n'))}>Download CSV</Button>} />
    {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>{error}</Alert>}
    <EnrollmentPanel role="teacher" subjectId={scope?.selectedSubjectId} gradeLevel={scope?.selectedSubject?.grade_level} selectedClass={scope?.selectedClass} />
    <Card sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: { xs: 2, md: 0 } }}>
        <Box sx={{ pr: { md: 3 } }}><Metric label="Learners" value={learners?.length ?? 0} detail="Assigned to this class" icon={<GroupsOutlined fontSize="small" />} /></Box>
        <Box sx={{ px: { md: 3 }, borderLeft: { md: '1px solid #e1e6eb' } }}><Metric label="On track" value={counts.onTrack} detail="No active learning gaps" icon={<TrendingUp fontSize="small" />} /></Box>
        <Box sx={{ px: { md: 3 }, borderLeft: { md: '1px solid #e1e6eb' } }}><Metric label="Need monitoring" value={counts.monitor} detail="One or two active gaps" icon={<WarningAmberOutlined fontSize="small" />} /></Box>
        <Box sx={{ pl: { md: 3 }, borderLeft: { md: '1px solid #e1e6eb' } }}><Metric label="Need intervention" value={counts.intervention} detail="Three or more active gaps" /></Box>
      </Box>
    </Card>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' }, gap: 3 }}>
      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Box><Typography variant="h2">Learner progress</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>{scope?.selectedSubject?.name ?? 'Assigned subject'} · {scope?.classes.map(item => `Grade ${item.grade_level} – ${item.name}`).join(', ') || 'No assigned class'}</Typography></Box>
          <Stack direction="row" gap={1}>
            <FormControl size="small" sx={{ minWidth: 120 }}><InputLabel>Status</InputLabel><Select value={status} label="Status" onChange={e => setStatus(e.target.value)}><MenuItem value="All">All</MenuItem><MenuItem value="On track">On track</MenuItem><MenuItem value="Monitor">Monitor</MenuItem><MenuItem value="Intervention">Intervention</MenuItem></Select></FormControl>
          </Stack>
        </Box>
        <Divider /><DataTableToolbar query={table.query} onQuery={table.setQuery} placeholder="Search learners" count={table.filteredCount} />
        <TableContainer sx={{ overflowX: 'auto' }}><Table aria-label="Learner recovery progress" sx={{ minWidth: 720 }}>
          <TableHead><TableRow><SortableTableCell column="learner" label="Learner" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="progress" label="Plan progress" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} sx={{ width: 190 }} /><SortableTableCell column="gaps" label="Learning gaps" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} align="right" /><SortableTableCell column="assessment" label="Last assessment" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} align="right" /><SortableTableCell column="status" label="Status" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><TableCell align="right"><span className="visually-hidden">Action</span></TableCell></TableRow></TableHead>
          <TableBody>{table.pageRows.map(learner => <TableRow hover key={learner.id} sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }} onClick={() => onSelectLearner(learner.id)}>
            <TableCell><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: '#edf1f5', color: 'text.primary' }}>{learner.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</Avatar><Box><Typography variant="body2" fontWeight={650}>{learner.name}</Typography><Typography variant="caption" color="text.secondary">{learner.section}</Typography></Box></Box></TableCell>
            <TableCell><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}><LinearProgress variant="determinate" value={learner.progress} sx={{ flex: 1, height: 6, borderRadius: 2, bgcolor: '#e8edf1', '& .MuiLinearProgress-bar': { bgcolor: learner.status === 'Intervention' ? 'error.main' : learner.status === 'Monitor' ? 'warning.main' : 'success.main' } }} /><Typography variant="body2" sx={{ width: 34 }}>{learner.progress}%</Typography></Box></TableCell>
            <TableCell align="right">{learner.gaps}</TableCell><TableCell align="right">{learner.assessment === null ? '—' : `${Math.round(learner.assessment)}%`}</TableCell><TableCell><StatusChip label={learner.status} /></TableCell><TableCell align="right"><Button size="small" endIcon={<ArrowForward />} onClick={(e) => { e.stopPropagation(); onSelectLearner(learner.id); }}>View</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>
        {table.filteredCount === 0 && <Box sx={{ p: 5, textAlign: 'center' }}><Typography fontWeight={650}>No learners found</Typography><Typography variant="body2" color="text.secondary">Try a different name or status filter.</Typography></Box>}<DataTablePagination count={table.filteredCount} page={table.page} rowsPerPage={table.rowsPerPage} onPage={table.setPage} onRowsPerPage={table.setRowsPerPage} />
      </Card>

      <Stack gap={3}>
        <Card sx={{ p: 2.5 }}><Typography variant="h2">Requires attention</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Prioritized using mastery results and plan activity.</Typography><Stack divider={<Divider />} sx={{ mt: 1.5 }}>
          {(learners ?? []).filter(item => item.status !== 'On track').sort((a, b) => b.gaps - a.gaps).slice(0, 3).map((learner, i) => <Box key={learner.id} sx={{ py: 1.5, display: 'flex', gap: 1.25, alignItems: 'center' }}><Box sx={{ width: 28, height: 28, borderRadius: 1, bgcolor: learner.status === 'Intervention' ? 'error.light' : 'warning.light', color: learner.status === 'Intervention' ? 'error.main' : 'warning.main', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{i + 1}</Box><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={650}>{learner.name}</Typography><Typography variant="caption" color="text.secondary">{learner.gaps} active learning {learner.gaps === 1 ? 'gap' : 'gaps'}</Typography></Box><Button size="small" onClick={() => onSelectLearner(learner.id)}>Review</Button></Box>)}
        </Stack></Card>
        <Card sx={{ p: 2.5 }}><Typography variant="h2">Class mastery</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5, mb: 2 }}>{learners?.filter(item => (item.assessment ?? 0) >= 75).length ?? 0} of {learners?.length ?? 0} learners currently meet the 75% threshold.</Typography><LinearProgress variant="determinate" value={masteryRate} sx={{ height: 8, borderRadius: 3, bgcolor: '#e8edf1' }} /><Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}><Typography variant="caption" color="text.secondary">Mastery rate</Typography><Typography variant="body2" fontWeight={700}>{masteryRate}%</Typography></Box></Card>
      </Stack>
    </Box>
  </>;
}
