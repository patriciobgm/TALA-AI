import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Add, MoreHoriz } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass, ApiSubject } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useServerTable } from '../components/DataTable';

type ManagedUser = {
  id: number; name: string; email: string; role: 'student' | 'teacher' | 'admin';
  academic_class: number | null; assigned_classes: number[]; assigned_subjects: number[];
  assignment: string; status: string; is_active: boolean; mfa_enabled: boolean; must_change_password: boolean;
  date_of_birth: string | null; gender: string; phone: string; student_number: string; employee_id: string;
};
const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];
const emptyUser = { name: '', email: '', role: 'student' as ManagedUser['role'], password: '', academic_class: '' as number | '', assigned_classes: [] as number[], assigned_subjects: [] as number[], is_active: true, date_of_birth: '', gender: '', phone: '', student_number: '', employee_id: '' };
const emptyClass = { name: '', grade_level: 11, school_year: '2026-2027', is_active: true };

export function AdminUsers() {
  const [tab, setTab] = useState(0);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [editingUser, setEditingUser] = useState<ManagedUser | null | undefined>();
  const [userForm, setUserForm] = useState(emptyUser);
  const [editingClass, setEditingClass] = useState<ApiClass | null | undefined>();
  const [classForm, setClassForm] = useState(emptyClass);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadOptions = () => Promise.all([
    api<ApiClass[] | { results?: ApiClass[] }>('/classes/?page_size=100&status=active'),
    api<ApiSubject[] | { results?: ApiSubject[] }>('/subjects/?page_size=100&status=active'),
  ]).then(([classRows, subjectRows]) => {
    setClasses(unwrap(classRows)); setSubjects(unwrap(subjectRows));
  }).catch(reason => setError(reason.message));
  useEffect(() => { void loadOptions(); }, []);

  const roleForTab: ManagedUser['role'] = tab === 0 ? 'student' : tab === 1 ? 'teacher' : 'admin';
  const userTable = useServerTable<ManagedUser>({ path: '/users/', initialSort: 'user', extraParams: `role=${roleForTab}` });
  const classTable = useServerTable<ApiClass>({ path: '/classes/', initialSort: 'class' });
  const openUser = (user?: ManagedUser) => {
    setEditingUser(user ?? null);
    setUserForm(user ? { name: user.name, email: user.email, role: user.role, password: '', academic_class: user.academic_class ?? '', assigned_classes: user.assigned_classes, assigned_subjects: user.assigned_subjects, is_active: user.is_active, date_of_birth: user.date_of_birth ?? '', gender: user.gender, phone: user.phone, student_number: user.student_number, employee_id: user.employee_id } : { ...emptyUser, role: roleForTab });
  };
  const saveUser = async () => {
    const body: Record<string, unknown> = { ...userForm, date_of_birth: userForm.date_of_birth || null, academic_class: userForm.role === 'student' ? userForm.academic_class : null, assigned_classes: userForm.role === 'teacher' ? userForm.assigned_classes : [], assigned_subjects: userForm.role === 'teacher' ? userForm.assigned_subjects : [] };
    if (!userForm.password) delete body.password;
    try {
      await api(editingUser ? `/users/${editingUser.id}/` : '/users/', { method: editingUser ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setSuccess(editingUser ? 'User account updated.' : 'User account created.'); setEditingUser(undefined); userTable.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this user.'); }
  };
  const sendReset = async () => {
    if (!editingUser) return;
    try { await api(`/users/${editingUser.id}/send-password-reset/`, { method: 'POST' }); setSuccess(`Password reset instructions sent to ${editingUser.email}.`); setEditingUser(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to request password reset.'); }
  };
  const requireChange = async () => {
    if (!editingUser) return;
    try { await api(`/users/${editingUser.id}/require-password-change/`, { method: 'POST' }); setSuccess('The user will be directed to change their password after sign-in.'); setEditingUser(undefined); userTable.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update the account.'); }
  };
  const openClass = (item?: ApiClass) => { setEditingClass(item ?? null); setClassForm(item ? { name: item.name, grade_level: item.grade_level, school_year: item.school_year, is_active: item.is_active } : emptyClass); };
  const saveClass = async () => {
    try { await api(editingClass ? `/classes/${editingClass.id}/` : '/classes/', { method: editingClass ? 'PATCH' : 'POST', body: JSON.stringify(classForm) }); setSuccess(editingClass ? 'Class updated.' : 'Class created.'); setEditingClass(undefined); classTable.reload(); await loadOptions(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this class.'); }
  };
  const numberArray = (value: unknown) => (Array.isArray(value) ? value : String(value).split(',')).map(Number);

  return <>
    <PageHeader title="Users & classes" description="Manage account access, teaching assignments, and class membership." action={<Button variant="contained" startIcon={<Add />} onClick={() => tab === 3 ? openClass() : openUser()}>{tab === 3 ? 'Add class' : `Add ${roleForTab}`}</Button>} />
    {(error || userTable.error || classTable.error) && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error || userTable.error || classTable.error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
    <Card>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 2 }}><Tab label="Students" /><Tab label="Teachers" /><Tab label="Administrators" /><Tab label="Classes" /></Tabs><Divider />
      {tab < 3 ? <>
        <DataTableToolbar query={userTable.query} onQuery={userTable.setQuery} placeholder={`Search ${roleForTab}s`} count={userTable.count} />
        <TableContainer><Table sx={{ minWidth: 820 }}><TableHead><TableRow><SortableTableCell column="user" label="User" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /><SortableTableCell column="role" label="Role" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /><SortableTableCell column="assignment" label="Assignment" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{userTable.pageRows.map(user => <TableRow key={user.id} hover><TableCell><Typography variant="body2" fontWeight={650}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.email}</Typography></TableCell><TableCell sx={{ textTransform: 'capitalize' }}>{user.role}</TableCell><TableCell>{user.assignment}</TableCell><TableCell><Stack direction="row" gap={.75}><StatusChip label={user.status} />{user.mfa_enabled && <StatusChip label="MFA" />}{user.must_change_password && <StatusChip label="Password change" />}</Stack></TableCell><TableCell align="right"><Button size="small" startIcon={<MoreHoriz />} onClick={() => openUser(user)}>Manage</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <DataTablePagination count={userTable.filteredCount} page={userTable.page} rowsPerPage={userTable.rowsPerPage} onPage={userTable.setPage} onRowsPerPage={userTable.setRowsPerPage} />
      </> : <>
        <DataTableToolbar query={classTable.query} onQuery={classTable.setQuery} placeholder="Search classes" count={classTable.filteredCount} />
        <TableContainer><Table sx={{ minWidth: 720 }}><TableHead><TableRow><SortableTableCell column="class" label="Class" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="grade" label="Grade" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="year" label="School year" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="students" label="Students" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{classTable.pageRows.map(item => <TableRow key={item.id}><TableCell><Typography variant="body2" fontWeight={650}>{item.name}</Typography></TableCell><TableCell>{item.grade_level}</TableCell><TableCell>{item.school_year}</TableCell><TableCell>{item.student_count} students · {item.teacher_count} teachers</TableCell><TableCell><StatusChip label={item.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" onClick={() => openClass(item)}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <DataTablePagination count={classTable.filteredCount} page={classTable.page} rowsPerPage={classTable.rowsPerPage} onPage={classTable.setPage} onRowsPerPage={classTable.setRowsPerPage} />
      </>}
    </Card>
    <Dialog component="form" open={editingUser !== undefined} onClose={() => setEditingUser(undefined)} onSubmit={event => { event.preventDefault(); void saveUser(); }} fullWidth maxWidth="sm">
      <DialogTitle>{editingUser ? 'Manage user' : 'Add user'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
        <TextField label="Full name" value={userForm.name} onChange={event => setUserForm(value => ({ ...value, name: event.target.value }))} required autoFocus />
        <TextField label="School email" type="email" value={userForm.email} onChange={event => setUserForm(value => ({ ...value, email: event.target.value }))} required />
        <TextField select label="Role" value={userForm.role} onChange={event => setUserForm(value => ({ ...value, role: event.target.value as ManagedUser['role'] }))}><MenuItem value="student">Student</MenuItem><MenuItem value="teacher">Teacher / ARAL Tutor</MenuItem><MenuItem value="admin">Administrator</MenuItem></TextField>
        <TextField label={userForm.role === 'student' ? 'Student number' : 'Employee ID'} value={userForm.role === 'student' ? userForm.student_number : userForm.employee_id} onChange={event => setUserForm(value => userForm.role === 'student' ? ({ ...value, student_number: event.target.value }) : ({ ...value, employee_id: event.target.value }))} />
        <TextField label="Date of birth" type="date" value={userForm.date_of_birth} onChange={event => setUserForm(value => ({ ...value, date_of_birth: event.target.value }))} InputLabelProps={{ shrink: true }} />
        <TextField label="Contact number" value={userForm.phone} onChange={event => setUserForm(value => ({ ...value, phone: event.target.value }))} />
        {userForm.role === 'student' && <TextField select label="Class" value={userForm.academic_class} onChange={event => setUserForm(value => ({ ...value, academic_class: Number(event.target.value) }))} required>{classes.filter(item => item.is_active).map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>}
        {userForm.role === 'teacher' && <><TextField select SelectProps={{ multiple: true }} label="Assigned classes" value={userForm.assigned_classes} onChange={event => setUserForm(value => ({ ...value, assigned_classes: numberArray(event.target.value) }))}>{classes.filter(item => item.is_active).map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField><TextField select SelectProps={{ multiple: true }} label="Assigned subjects" value={userForm.assigned_subjects} onChange={event => setUserForm(value => ({ ...value, assigned_subjects: numberArray(event.target.value) }))}>{subjects.filter(item => item.is_active).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField></>}
        <TextField label={editingUser ? 'New password (optional)' : 'Temporary password'} type="password" value={userForm.password} onChange={event => setUserForm(value => ({ ...value, password: event.target.value }))} required={!editingUser} helperText={editingUser ? 'Leave blank to keep the existing password.' : 'At least eight characters. The user can change it after signing in.'} />
        <FormControlLabel control={<Checkbox checked={userForm.is_active} onChange={event => setUserForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Account is active" />
        {editingUser && <><Divider /><Typography variant="h3">Account recovery</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button variant="outlined" onClick={sendReset}>Send reset link</Button><Button variant="outlined" onClick={requireChange}>Require password change</Button></Stack></>}
      </Stack></DialogContent><DialogActions><Button onClick={() => setEditingUser(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save user</Button></DialogActions>
    </Dialog>
    <Dialog component="form" open={editingClass !== undefined} onClose={() => setEditingClass(undefined)} onSubmit={event => { event.preventDefault(); void saveClass(); }} fullWidth maxWidth="sm">
      <DialogTitle>{editingClass ? 'Edit class' : 'Add class'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Section or class name" value={classForm.name} onChange={event => setClassForm(value => ({ ...value, name: event.target.value }))} required /><TextField label="Grade level" type="number" value={classForm.grade_level} onChange={event => setClassForm(value => ({ ...value, grade_level: Number(event.target.value) }))} inputProps={{ min: 1, max: 12 }} required /><TextField label="School year" value={classForm.school_year} onChange={event => setClassForm(value => ({ ...value, school_year: event.target.value }))} placeholder="2026-2027" required /><FormControlLabel control={<Checkbox checked={classForm.is_active} onChange={event => setClassForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Class is active" /></Stack></DialogContent><DialogActions><Button onClick={() => setEditingClass(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save class</Button></DialogActions>
    </Dialog>
  </>;
}
