import { useEffect, useState } from 'react';
import { Alert, Box, Card, CircularProgress, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { api } from '../api/client';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useDataTable } from './DataTable';
import { StatusChip } from './StatusChip';

type ConsentRow = {
  user_id: number;
  name: string;
  email: string;
  class_name: string;
  status: 'acknowledged' | 'pending';
  policy_version: string;
  accepted_at: string | null;
};

type ConsentRegistry = {
  policy_version: string;
  total_students: number;
  acknowledged: number;
  pending: number;
  results: ConsentRow[];
};

export function PrivacyConsentRegistry() {
  const [registry, setRegistry] = useState<ConsentRegistry | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<ConsentRegistry>('/privacy/acknowledgments/').then(setRegistry).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load consent records.'));
  }, []);
  const table = useDataTable(registry?.results ?? [], {
    searchText: row => `${row.name} ${row.email} ${row.class_name} ${row.status} ${row.policy_version}`,
    sortValues: {
      learner: row => row.name,
      class: row => row.class_name,
      status: row => row.status,
      accepted: row => row.accepted_at ? new Date(row.accepted_at).getTime() : 0,
    },
    initialSort: 'learner',
  });

  if (error) return <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>;
  if (!registry) return <Card sx={{ mt: 3, p: 4, display: 'grid', placeItems: 'center' }}><CircularProgress size={26} /></Card>;
  return <Card sx={{ mt: 3 }}>
    <Box sx={{ p: 2.5 }}><Typography variant="h2">Learner Consent Records</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Evidence of consent for the current login privacy notice, version {registry.policy_version}.</Typography></Box>
    <Divider />
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>{[['Learners', registry.total_students], ['Consented', registry.acknowledged], ['Pending', registry.pending]].map(([label, value], index) => <Box key={String(label)} sx={{ px: 2.5, py: 2, borderLeft: index ? '1px solid' : 0, borderColor: 'divider' }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontSize: 24, fontWeight: 800 }}>{value}</Typography></Box>)}</Box>
    <Divider />
    <DataTableToolbar query={table.query} onQuery={table.setQuery} placeholder="Search learner, email, class, or status" count={table.filteredCount} />
    <TableContainer><Table sx={{ minWidth: 720 }}><TableHead><TableRow><SortableTableCell column="learner" label="Learner" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="class" label="Class" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="status" label="Consent Status" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /><SortableTableCell column="accepted" label="Recorded" orderBy={table.orderBy} direction={table.direction} onSort={table.toggleSort} /></TableRow></TableHead><TableBody>{table.pageRows.map(row => <TableRow key={row.user_id} hover><TableCell><Typography variant="body2" fontWeight={700}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.email}</Typography></TableCell><TableCell>{row.class_name}</TableCell><TableCell><StatusChip label={row.status} /></TableCell><TableCell>{row.accepted_at ? new Date(row.accepted_at).toLocaleString() : 'Not yet recorded'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    {!table.filteredCount && <Box sx={{ p: 4, textAlign: 'center' }}><Typography fontWeight={700}>No matching learners</Typography><Typography variant="body2" color="text.secondary">Consent records appear after learner accounts are created.</Typography></Box>}
    <DataTablePagination count={table.filteredCount} page={table.page} rowsPerPage={table.rowsPerPage} onPage={table.setPage} onRowsPerPage={table.setRowsPerPage} />
  </Card>;
}
