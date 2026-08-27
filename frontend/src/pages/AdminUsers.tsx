import { useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

type ManagedUser = { id: number; name: string; email: string; role: 'student' | 'teacher' | 'admin'; assignment: string; status: string };

export function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ManagedUser['role']>('student');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const load = () => api<ManagedUser[] | { results?: ManagedUser[] }>('/users/').then(result => setUsers(Array.isArray(result) ? result : result.results ?? [])).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const addUser = async () => {
    try { await api('/users/', { method: 'POST', body: JSON.stringify({ name, email, role, password }) }); setName(''); setEmail(''); setRole('student'); setPassword(''); setOpen(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create user.'); }
  };
  return <><PageHeader title="Users & classes" description="Manage persisted account access and academic assignments." action={<Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>Add user</Button>} />{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Card><TableContainer><Table sx={{ minWidth: 720 }}><TableHead><TableRow><TableCell>User</TableCell><TableCell>Role</TableCell><TableCell>Assignment</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>{users.map(user => <TableRow key={user.id}><TableCell><Typography variant="body2" fontWeight={650}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.email}</Typography></TableCell><TableCell sx={{ textTransform: 'capitalize' }}>{user.role}</TableCell><TableCell>{user.assignment}</TableCell><TableCell><StatusChip label={user.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer></Card><Dialog component="form" open={open} onClose={() => setOpen(false)} onSubmit={event => { event.preventDefault(); void addUser(); }} fullWidth maxWidth="sm"><DialogTitle>Add user</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><TextField label="Full name" value={name} onChange={event => setName(event.target.value)} required autoFocus /><TextField label="School email" type="email" value={email} onChange={event => setEmail(event.target.value)} required /><TextField select label="Role" value={role} onChange={event => setRole(event.target.value as ManagedUser['role'])}><MenuItem value="student">Student</MenuItem><MenuItem value="teacher">Teacher / ARAL Tutor</MenuItem><MenuItem value="admin">Administrator</MenuItem></TextField><TextField label="Temporary password" type="password" value={password} onChange={event => setPassword(event.target.value)} helperText="At least eight characters. Share it securely and require a later reset." required inputProps={{ minLength: 8 }} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="contained">Create user</Button></DialogActions></Dialog></>;
}
