import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Add, EditOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass, ApiSubject } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { DataTablePagination, DataTableToolbar, SortableTableCell, useServerTable } from '../components/DataTable';
import { EnrollmentPanel } from '../components/EnrollmentPanel';
import { MultiSelectField } from '../components/MultiSelectField';

type ManagedUser = {
  id: number; name: string; email: string; role: 'student' | 'teacher' | 'admin';
  is_superadmin: boolean; grade_level: number | null; section: string;
  academic_class: number | null; assigned_classes: number[]; assigned_subjects: number[];
  assignment: string; status: string; is_active: boolean; mfa_enabled: boolean; must_change_password: boolean;
  date_of_birth: string | null; gender: string; phone: string; student_number: string; employee_id: string;
};
const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];
const emptyUser = { name: '', email: '', role: 'student' as ManagedUser['role'], password: '', academic_class: '' as number | '', assigned_classes: [] as number[], assigned_subjects: [] as number[], is_active: true, date_of_birth: '', gender: '', phone: '', student_number: '', employee_id: '' };
const emptyClass = { name: '', grade_level: 11, school_year: '2026-2027', is_active: true };

export function AdminUsers({ superadmin, mode = 'users' }: { superadmin: boolean; mode?: 'users' | 'classes' }) {
  const [tab, setTab] = useState(0);
  const [studentGrade, setStudentGrade] = useState('');
  const [studentSection, setStudentSection] = useState('');
  const [classGrade, setClassGrade] = useState('11');
  const [formGrade, setFormGrade] = useState(11);
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

  const isClassTab = mode === 'classes';
  const roleForTab: ManagedUser['role'] = tab === 0 ? 'student' : tab === 1 ? 'teacher' : 'admin';
  const studentFilters = roleForTab === 'student' ? `${studentGrade ? `&grade=${studentGrade}` : ''}${studentSection ? `&section=${studentSection}` : ''}` : '';
  const userTable = useServerTable<ManagedUser>({ path: '/users/', initialSort: roleForTab === 'student' ? 'grade' : 'user', extraParams: `role=${roleForTab}${studentFilters}` });
  const classTable = useServerTable<ApiClass>({ path: '/classes/', initialSort: 'class', extraParams: `grade=${classGrade}` });
  const openUser = (user?: ManagedUser) => {
    setEditingUser(user ?? null);
    setUserForm(user ? { name: user.name, email: user.email, role: user.role, password: '', academic_class: user.academic_class ?? '', assigned_classes: user.assigned_classes, assigned_subjects: user.assigned_subjects, is_active: user.is_active, date_of_birth: user.date_of_birth ?? '', gender: user.gender, phone: user.phone, student_number: user.student_number, employee_id: user.employee_id } : { ...emptyUser, role: roleForTab });
    setFormGrade(user?.grade_level ?? 11);
  };
  const saveUser = async () => {
    const body: Record<string, unknown> = { ...userForm, grade_level: userForm.role === 'student' ? formGrade : undefined, date_of_birth: userForm.date_of_birth || null, academic_class: userForm.role === 'student' ? userForm.academic_class || null : null, assigned_classes: userForm.role === 'teacher' ? userForm.assigned_classes : [], assigned_subjects: userForm.role === 'teacher' ? userForm.assigned_subjects : [] };
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
  const subjectOptions = subjects.filter(item => item.is_active).map(item => ({ id: item.id, label: item.name, detail: `Grade ${item.grade_level} · ${item.code}` }));
  const teacherGrades = [...new Set(subjects.filter(item => userForm.assigned_subjects.includes(item.id)).map(item => item.grade_level))];
  const derivedClasses = classes.filter(item => item.is_active && teacherGrades.includes(item.grade_level));

  return <>
    <PageHeader title={isClassTab ? 'Class Management' : 'User & Security Management'} description={isClassTab ? 'Maintain Grade 11 and Grade 12 sections. Teacher class access is derived from assigned subject grades.' : 'Manage identities, account status, recovery, and role-appropriate academic placement.'} action={<Button variant="contained" startIcon={<Add />} onClick={() => isClassTab ? openClass() : openUser()}>{isClassTab ? 'Add Class' : `Add ${roleForTab.charAt(0).toUpperCase()}${roleForTab.slice(1)}`}</Button>} />
    {(error || userTable.error || classTable.error) && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error || userTable.error || classTable.error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
    {isClassTab && <EnrollmentPanel role="admin" />}
    <Card>
      {!isClassTab && <><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 2 }}><Tab label="Students" /><Tab label="Teachers" />{superadmin && <Tab label="Administrators" />}</Tabs><Divider /></>}
      {!isClassTab ? <>
        <DataTableToolbar query={userTable.query} onQuery={userTable.setQuery} placeholder={`Search ${roleForTab}s`} count={userTable.count} actions={roleForTab === 'student' ? <Stack direction="row" gap={1}><TextField select size="small" label="Year" value={studentGrade} onChange={event => { setStudentGrade(event.target.value); setStudentSection(''); }} sx={{ minWidth: 125 }}><MenuItem value="">All years</MenuItem><MenuItem value="11">Grade 11</MenuItem><MenuItem value="12">Grade 12</MenuItem></TextField><TextField select size="small" label="Section" value={studentSection} onChange={event => setStudentSection(event.target.value)} sx={{ minWidth: 170 }}><MenuItem value="">All sections</MenuItem>{classes.filter(item => !studentGrade || String(item.grade_level) === studentGrade).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField></Stack> : undefined} />
        <TableContainer><Table sx={{ minWidth: roleForTab === 'teacher' ? 760 : 900 }}><TableHead><TableRow><SortableTableCell column="user" label="User" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} />{roleForTab === 'student' ? <><TableCell>Year</TableCell><TableCell>Section</TableCell></> : roleForTab === 'admin' ? <SortableTableCell column="role" label="Role" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /> : null}<SortableTableCell column="assignment" label="Assignment" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={userTable.orderBy} direction={userTable.direction} onSort={userTable.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{userTable.pageRows.map(user => <TableRow key={user.id} hover><TableCell><Typography variant="body2" fontWeight={650}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.email}</Typography></TableCell>{roleForTab === 'student' ? <><TableCell>Grade {user.grade_level}</TableCell><TableCell>{user.section || 'Unassigned'}</TableCell></> : roleForTab === 'admin' ? <TableCell sx={{ textTransform: 'capitalize' }}>{user.is_superadmin ? 'Superadministrator' : user.role}</TableCell> : null}<TableCell>{user.assignment}</TableCell><TableCell><Stack direction="row" gap={.75}><StatusChip label={user.status} />{user.mfa_enabled && <StatusChip label="MFA" />}{user.must_change_password && <StatusChip label="Password change" />}</Stack></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => openUser(user)} aria-label={`Edit ${user.name}`}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <DataTablePagination count={userTable.filteredCount} page={userTable.page} rowsPerPage={userTable.rowsPerPage} onPage={userTable.setPage} onRowsPerPage={userTable.setRowsPerPage} />
      </> : <>
        <DataTableToolbar query={classTable.query} onQuery={classTable.setQuery} placeholder={`Search Grade ${classGrade} classes`} count={classTable.count} actions={<TextField select size="small" label="Grade" value={classGrade} onChange={event => setClassGrade(event.target.value)} sx={{ width: 130 }}><MenuItem value="11">Grade 11</MenuItem><MenuItem value="12">Grade 12</MenuItem></TextField>} />
        <TableContainer><Table sx={{ minWidth: 720 }}><TableHead><TableRow><SortableTableCell column="class" label="Class" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="grade" label="Grade" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="year" label="School year" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="students" label="Students" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><SortableTableCell column="status" label="Status" orderBy={classTable.orderBy} direction={classTable.direction} onSort={classTable.toggleSort} /><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{classTable.pageRows.map(item => <TableRow key={item.id}><TableCell><Typography variant="body2" fontWeight={650}>{item.name}</Typography></TableCell><TableCell>{item.grade_level}</TableCell><TableCell>{item.school_year}</TableCell><TableCell>{item.student_count} students · {item.teacher_count} teachers</TableCell><TableCell><StatusChip label={item.is_active ? 'Active' : 'Archived'} /></TableCell><TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => openClass(item)} aria-label={`Edit ${item.name}`}>Edit</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <DataTablePagination count={classTable.filteredCount} page={classTable.page} rowsPerPage={classTable.rowsPerPage} onPage={classTable.setPage} onRowsPerPage={classTable.setRowsPerPage} />
      </>}
    </Card>
    <Dialog component="form" open={editingUser !== undefined} onClose={() => setEditingUser(undefined)} onSubmit={event => { event.preventDefault(); void saveUser(); }} fullWidth maxWidth="sm">
      <DialogTitle>{editingUser ? `Manage ${userForm.role}` : `Add ${roleForTab}`}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
        <TextField label="Full name" value={userForm.name} onChange={event => setUserForm(value => ({ ...value, name: event.target.value }))} required autoFocus />
        <TextField label="School email" type="email" value={userForm.email} onChange={event => setUserForm(value => ({ ...value, email: event.target.value }))} required />
        <TextField label="Role" value={userForm.role === 'teacher' ? 'Teacher' : userForm.role === 'admin' ? 'Administrator' : 'Student'} disabled helperText="The account type is determined by the selected user-management tab." />
        <TextField label={userForm.role === 'student' ? 'Student number' : 'Employee ID'} value={userForm.role === 'student' ? userForm.student_number : userForm.employee_id} onChange={event => setUserForm(value => userForm.role === 'student' ? ({ ...value, student_number: event.target.value }) : ({ ...value, employee_id: event.target.value }))} />
        <TextField label="Date of birth" type="date" value={userForm.date_of_birth} onChange={event => setUserForm(value => ({ ...value, date_of_birth: event.target.value }))} InputLabelProps={{ shrink: true }} />
        <TextField label="Contact number" value={userForm.phone} onChange={event => setUserForm(value => ({ ...value, phone: event.target.value }))} />
        {userForm.role === 'student' && <><TextField select label="Grade Level" value={formGrade} onChange={event => { const next = Number(event.target.value); setFormGrade(next); setUserForm(value => ({ ...value, academic_class: '' })); }}><MenuItem value={11}>Grade 11</MenuItem><MenuItem value={12}>Grade 12</MenuItem></TextField><TextField select label="Initial ARAL class (optional)" value={userForm.academic_class} onChange={event => setUserForm(value => ({ ...value, academic_class: event.target.value ? Number(event.target.value) : '' }))} helperText="A teacher can enroll this learner later, or the learner can request access with a class code."><MenuItem value="">Not enrolled yet</MenuItem>{classes.filter(item => item.is_active && item.grade_level === formGrade).map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField></>}
        {userForm.role === 'teacher' && <><MultiSelectField label="Assigned Subjects" options={subjectOptions} value={userForm.assigned_subjects} onChange={ids => setUserForm(value => ({ ...value, assigned_subjects: ids.map(Number) }))} helperText="Each subject determines its grade level and learner scope." /><Box sx={{ p: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}><Typography variant="body2" fontWeight={700}>Derived Class Access</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{derivedClasses.length ? derivedClasses.map(item => item.label).join(', ') : 'Assign at least one subject to derive class access.'}</Typography></Box></>}
        <TextField label={editingUser ? 'New password (optional)' : 'Temporary password'} type="password" value={userForm.password} onChange={event => setUserForm(value => ({ ...value, password: event.target.value }))} required={!editingUser} helperText={editingUser ? 'Leave blank to keep the existing password.' : 'At least eight characters. The user can change it after signing in.'} />
        <FormControlLabel control={<Checkbox checked={userForm.is_active} onChange={event => setUserForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Account is active" />
        {editingUser && <><Divider /><Typography variant="h3">Account recovery</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Button variant="outlined" onClick={sendReset}>Send reset link</Button><Button variant="outlined" onClick={requireChange}>Require password change</Button></Stack></>}
      </Stack></DialogContent><DialogActions><Button onClick={() => setEditingUser(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save user</Button></DialogActions>
    </Dialog>
    <Dialog component="form" open={editingClass !== undefined} onClose={() => setEditingClass(undefined)} onSubmit={event => { event.preventDefault(); void saveClass(); }} fullWidth maxWidth="sm">
      <DialogTitle>{editingClass ? 'Edit class' : 'Add class'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Section name" value={classForm.name} onChange={event => setClassForm(value => ({ ...value, name: event.target.value }))} required /><TextField select label="Year level" value={classForm.grade_level} onChange={event => setClassForm(value => ({ ...value, grade_level: Number(event.target.value) }))} required><MenuItem value={11}>Grade 11</MenuItem><MenuItem value={12}>Grade 12</MenuItem></TextField><TextField label="School year" value={classForm.school_year} onChange={event => setClassForm(value => ({ ...value, school_year: event.target.value }))} placeholder="2026-2027" required /><FormControlLabel control={<Checkbox checked={classForm.is_active} onChange={event => setClassForm(value => ({ ...value, is_active: event.target.checked }))} />} label="Class is active" /></Stack></DialogContent><DialogActions><Button onClick={() => setEditingClass(undefined)}>Cancel</Button><Button type="submit" variant="contained">Save class</Button></DialogActions>
    </Dialog>
  </>;
}
