import { useCallback, useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Card, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { SearchOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass } from '../api/types';

type Role = 'student' | 'teacher' | 'admin';
type Candidate = { id: number; name: string; email: string; grade_level: 11 | 12; academic_class: number | null; class_label: string };
type Enrollment = { id: number; student_name: string; student_email: string; class_label: string; subject_name: string | null; status: string; source: string; decision_reason: string; created_at: string };
const unwrap = <T,>(value: T[] | { results?: T[] }) => Array.isArray(value) ? value : value.results ?? [];

export function EnrollmentPanel({ role, compact = false, subjectId, gradeLevel, selectedClass }: { role: Role; compact?: boolean; subjectId?: number | null; gradeLevel?: number | null; selectedClass?: ApiClass | null }) {
  const [requests, setRequests] = useState<Enrollment[]>([]);
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [enrolledCandidates, setEnrolledCandidates] = useState<Candidate[]>([]);
  const [student, setStudent] = useState<number | ''>('');
  const [enrolledStudent, setEnrolledStudent] = useState<number | ''>('');
  const [academicClass, setAcademicClass] = useState<number | ''>('');
  const [classCode, setClassCode] = useState('');
  const [reason, setReason] = useState(role === 'admin' ? 'Assigned teacher unavailable; administrator override.' : '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => { if (role === 'teacher') { setAcademicClass(selectedClass?.id ?? ''); setStudent(''); } }, [role, selectedClass?.id]);
  const load = useCallback(async () => {
    if (role === 'teacher' && !subjectId) return;
    try {
      const found = await api<Enrollment[] | { results?: Enrollment[] }>('/enrollment-requests/?page_size=100');
      setRequests(unwrap(found));
      if (role !== 'student') {
        const [classRows, candidateRows, enrolledRows] = await Promise.all([
          api<ApiClass[] | { results?: ApiClass[] }>('/classes/?page_size=100&status=active'),
          api<Candidate[]>(`/enrollment-requests/candidates/?mode=enroll${role === 'teacher' && subjectId ? `&subject=${subjectId}` : ''}`),
          api<Candidate[]>(`/enrollment-requests/candidates/?mode=enrolled${role === 'teacher' && subjectId ? `&subject=${subjectId}` : ''}`),
        ]);
        setClasses(unwrap(classRows)); setCandidates(candidateRows); setEnrolledCandidates(enrolledRows);
      }
    } catch (foundError) { setError(foundError instanceof Error ? foundError.message : 'Unable to load enrollment records.'); }
  }, [role, subjectId]);
  useEffect(() => { void load(); }, [load]);
  const submit = async () => {
    setError(''); setSuccess('');
    try {
      await api('/enrollment-requests/', { method: 'POST', body: JSON.stringify(role === 'student' ? { class_code: classCode.trim() } : { student, academic_class: academicClass, subject: subjectId, decision_reason: role === 'admin' ? reason : '' }) });
      setSuccess(role === 'student' ? 'Your request is awaiting teacher or administrator approval.' : 'The learner is now enrolled.');
      setClassCode(''); setStudent(''); await load();
    } catch (foundError) { setError(foundError instanceof Error ? foundError.message : 'Unable to submit enrollment.'); }
  };
  const decide = async (row: Enrollment, decision: 'approved' | 'rejected') => {
    setError(''); setSuccess('');
    try {
      await api(`/enrollment-requests/${row.id}/decide/`, { method: 'POST', body: JSON.stringify({ decision, decision_reason: reason }) });
      setSuccess(`Enrollment request ${decision}.`); await load();
    } catch (foundError) { setError(foundError instanceof Error ? foundError.message : 'Unable to decide enrollment.'); }
  };
  const unenroll = async () => {
    setError(''); setSuccess('');
    try { const result = await api<{ detail: string }>('/enrollment-requests/unenroll/', { method: 'POST', body: JSON.stringify({ student: enrolledStudent, decision_reason: reason }) }); setSuccess(result.detail); setEnrolledStudent(''); await load(); }
    catch (foundError) { setError(foundError instanceof Error ? foundError.message : 'Unable to unenroll this learner.'); }
  };
  const availableClasses = classes.filter(item => role !== 'teacher' || !gradeLevel || item.grade_level === gradeLevel);
  const targetClass = selectedClass ?? classes.find(item => item.id === academicClass);
  const availableCandidates = candidates.filter(item => !targetClass || item.grade_level === targetClass.grade_level);
  const selectedCandidate = candidates.find(item => item.id === student) ?? null;
  const classRoster = enrolledCandidates.filter(item => !targetClass || item.academic_class === targetClass.id);
  const selectedEnrolledCandidate = enrolledCandidates.find(item => item.id === enrolledStudent) ?? null;
  return <Card sx={{ p: compact ? 2.5 : 3, mb: 3 }}><Typography variant="h2">ARAL enrollment</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{role === 'student' ? 'Enter the subject enrollment code shared by your ARAL teacher. Enrollment requires approval.' : role === 'teacher' ? `Search Grade ${gradeLevel ?? ''} learners to enroll in ${targetClass?.label ?? 'the selected teaching class'}.` : 'Choose a target class, then search learners grouped by Grade 11 and Grade 12. Use an override only when the assigned teacher is unavailable.'}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}{success && <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}<Stack gap={1.5} sx={{ mt: 2 }}>
    {role === 'student' ? <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><TextField size="small" label="Subject enrollment code" value={classCode} onChange={event => setClassCode(event.target.value.toUpperCase())} inputProps={{ maxLength: 48 }} fullWidth /><Button variant="contained" disabled={!classCode.trim()} onClick={() => void submit()}>Request enrollment</Button></Stack> : <>{role === 'admin' && <TextField select size="small" label="Enroll into ARAL class" value={academicClass} onChange={event => { setAcademicClass(Number(event.target.value)); setStudent(''); setEnrolledStudent(''); }}>{availableClasses.map(item => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>}<Autocomplete size="small" options={availableCandidates} value={selectedCandidate} groupBy={role === 'admin' && !targetClass ? item => `Grade ${item.grade_level}` : undefined} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={item => `${item.name} · ${item.email}`} onChange={(_, value) => setStudent(value?.id ?? '')} renderOption={(props, option) => <Box component="li" {...props} key={option.id}><Box><Typography variant="body2">{option.name}</Typography><Typography variant="caption" color="text.secondary">{option.email} · {option.class_label}</Typography></Box></Box>} renderInput={params => <TextField {...params} label="Search unassigned learner" helperText={!targetClass ? 'Choose a target class first.' : !availableCandidates.length ? `No Grade ${targetClass.grade_level} learners are available.` : `${availableCandidates.length} learner${availableCandidates.length === 1 ? '' : 's'} available for ${targetClass.label}.`} InputProps={{ ...params.InputProps, startAdornment: <><SearchOutlined color="action" sx={{ mr: .5 }} />{params.InputProps.startAdornment}</> }} />} disabled={role === 'teacher' && !targetClass} />{role === 'admin' && <TextField multiline minRows={4} fullWidth label="Override reason" value={reason} onChange={event => setReason(event.target.value)} required />}<Box><Button variant="contained" disabled={!student || !academicClass || (role === 'admin' && !reason.trim())} onClick={() => void submit()}>{role === 'admin' ? 'Apply administrator override' : 'Enroll learner'}</Button></Box>{targetClass && <><Divider /><Typography variant="body2" fontWeight={700}>Remove from {targetClass.label}</Typography><Typography variant="caption" color="text.secondary">Unenroll the learner first, then use the unassigned-learner search above if they need another class.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><Autocomplete size="small" sx={{ flex: 1 }} options={classRoster} value={selectedEnrolledCandidate} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={item => `${item.name} · ${item.email}`} onChange={(_, value) => setEnrolledStudent(value?.id ?? '')} renderInput={params => <TextField {...params} label="Search current class roster" InputProps={{ ...params.InputProps, startAdornment: <><SearchOutlined color="action" sx={{ mr: .5 }} />{params.InputProps.startAdornment}</> }} />} /><Button color="warning" variant="outlined" disabled={!enrolledStudent || (role === 'admin' && !reason.trim())} onClick={() => void unenroll()}>Unenroll</Button></Stack></>}</>}
    {role === 'teacher' && requests.some(row => row.status === 'pending') && <TextField multiline minRows={2} size="small" label="Decision reason (required when rejecting)" value={reason} onChange={event => setReason(event.target.value)} />}
    {requests.length > 0 && <><Divider /><Typography variant="body2" fontWeight={700}>Enrollment history and requests</Typography>{requests.slice(0, compact ? 4 : 8).map(row => <Box key={row.id} sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1, py: .5 }}><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={650}>{role === 'student' ? `${row.class_label}${row.subject_name ? ` · ${row.subject_name}` : ''}` : `${row.student_name} · ${row.class_label}${row.subject_name ? ` · ${row.subject_name}` : ''}`}</Typography><Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{row.status} · {row.source.replace('_', ' ')} · {new Date(row.created_at).toLocaleDateString()}</Typography></Box>{row.status === 'pending' && role !== 'student' && <Stack direction="row" gap={1}><Button size="small" onClick={() => void decide(row, 'approved')}>Approve</Button><Button size="small" color="error" onClick={() => void decide(row, 'rejected')}>Reject</Button></Stack>}</Box>)}</>}
  </Stack></Card>;
}
