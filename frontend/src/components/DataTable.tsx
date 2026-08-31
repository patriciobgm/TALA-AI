/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, InputAdornment, TableCell, TablePagination, TableSortLabel, TextField, Typography, type TableCellProps } from '@mui/material';
import { Search } from '@mui/icons-material';
import { api } from '../api/client';

type SortValue = string | number | boolean | null | undefined;
type Direction = 'asc' | 'desc';

export function useDataTable<T>(rows: T[], options: { searchText: (row: T) => string; sortValues: Record<string, (row: T) => SortValue>; initialSort: string; initialDirection?: Direction; initialRowsPerPage?: number }) {
  const [query, setQueryState] = useState('');
  const [orderBy, setOrderBy] = useState(options.initialSort);
  const [direction, setDirection] = useState<Direction>(options.initialDirection ?? 'asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(options.initialRowsPerPage ?? 10);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matching = normalized ? rows.filter(row => options.searchText(row).toLocaleLowerCase().includes(normalized)) : rows;
    const accessor = options.sortValues[orderBy];
    return matching.map((row, index) => ({ row, index })).sort((left, right) => {
      const a = accessor?.(left.row); const b = accessor?.(right.row);
      if (a == null && b == null) return left.index - right.index;
      if (a == null) return 1; if (b == null) return -1;
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      return (direction === 'asc' ? comparison : -comparison) || left.index - right.index;
    }).map(item => item.row);
  }, [direction, options, orderBy, query, rows]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1));
  const setQuery = (value: string) => { setQueryState(value); setPage(0); };
  const toggleSort = (key: string) => { if (orderBy === key) setDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setOrderBy(key); setDirection('asc'); } setPage(0); };
  return { query, setQuery, orderBy, direction, toggleSort, page: safePage, setPage, rowsPerPage, setRowsPerPage: (value: number) => { setRowsPerPage(value); setPage(0); }, filteredCount: filtered.length, pageRows: filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage) };
}

export function useServerTable<T>({ path, initialSort, initialDirection = 'asc', initialRowsPerPage = 25, extraParams = '' }: { path: string; initialSort: string; initialDirection?: Direction; initialRowsPerPage?: number; extraParams?: string }) {
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [query, setQueryState] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [orderBy, setOrderBy] = useState(initialSort);
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(0); }, [extraParams]);
  useEffect(() => { setOrderBy(initialSort); setDirection(initialDirection); setPage(0); }, [initialDirection, initialSort]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const params = new URLSearchParams(extraParams);
    params.set('page', String(page + 1)); params.set('page_size', String(rowsPerPage)); params.set('ordering', `${direction === 'desc' ? '-' : ''}${orderBy}`);
    if (debouncedQuery) params.set('search', debouncedQuery); else params.delete('search');
    api<{ count: number; results: T[] }>(`${path}?${params}`).then(result => { if (active) { setRows(result.results); setCount(result.count); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load records.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery, direction, extraParams, orderBy, page, path, revision, rowsPerPage]);
  const setQuery = (value: string) => { setQueryState(value); setPage(0); };
  const toggleSort = (key: string) => { if (orderBy === key) setDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setOrderBy(key); setDirection('asc'); } setPage(0); };
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { rows, count, pageRows: rows, filteredCount: count, query, setQuery, orderBy, direction, toggleSort, page, setPage, rowsPerPage, setRowsPerPage: (value: number) => { setRowsPerPage(value); setPage(0); }, loading, error, reload };
}

export function DataTableToolbar({ query, onQuery, placeholder, count, actions }: { query: string; onQuery: (value: string) => void; placeholder: string; count: number; actions?: ReactNode }) {
  return <Box sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}><TextField size="small" placeholder={placeholder} value={query} onChange={event => onQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} sx={{ width: { xs: '100%', sm: 300 } }} inputProps={{ 'aria-label': placeholder }} /><Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{count} {count === 1 ? 'result' : 'results'}</Typography>{actions}</Box>;
}

export function SortableTableCell({ column, label, orderBy, direction, onSort, ...props }: { column: string; label: string; orderBy: string; direction: Direction; onSort: (column: string) => void } & Omit<TableCellProps, 'sortDirection'>) {
  const active = orderBy === column;
  return <TableCell sortDirection={active ? direction : false} {...props}><TableSortLabel active={active} direction={active ? direction : 'asc'} onClick={() => onSort(column)}>{label}{active && <Box component="span" className="visually-hidden">{direction === 'desc' ? 'sorted descending' : 'sorted ascending'}</Box>}</TableSortLabel></TableCell>;
}

export function DataTablePagination({ count, page, rowsPerPage, onPage, onRowsPerPage }: { count: number; page: number; rowsPerPage: number; onPage: (page: number) => void; onRowsPerPage: (count: number) => void }) {
  return <TablePagination component="div" count={count} page={page} rowsPerPage={rowsPerPage} rowsPerPageOptions={[10, 25, 50]} onPageChange={(_, next) => onPage(next)} onRowsPerPageChange={event => onRowsPerPage(Number(event.target.value))} labelRowsPerPage="Rows per page" />;
}
