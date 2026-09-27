import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Card, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { SearchOutlined } from '@mui/icons-material';
import { api } from '../api/client';
import type { ApiClass } from '../api/types';

type Role = 'student' | 'teacher' | 'admin';
type Offering = {
  id: number;
  subject: number;
  subject_name: string;
  academic_class: number;
  class_label: string;
  teacher: number | null;
  teacher_name: string;
  school_year: string;
  term: string;
  enrollment_code: string;
  is_active: boolean;
  enrolled_count: number;
  enrollment_status?: string;
};
type Candidate = {
  id: number;
  name: string;
  email: string;
  grade_level: 11 | 12;
  class_label: string;
};
type Enrollment = {
  id: number;
  student: number;
  student_name: string;
  student_email: string;
  student_lrn: string;
  offering: number;
  subject: number;
  subject_name: string;
  class_label: string;
  teacher_name: string;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  source: string;
  decision_reason: string;
  created_at: string;
};
const unwrap = <T,>(value: T[] | { results?: T[] }) => (Array.isArray(value) ? value : (value.results ?? []));

export function EnrollmentPanel({ role, compact = false, subjectId, selectedClass }: { role: Role; compact?: boolean; subjectId?: number | null; gradeLevel?: number | null; selectedClass?: ApiClass | null }) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [requests, setRequests] = useState<Enrollment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [offeringId, setOfferingId] = useState<number | ''>('');
  const [student, setStudent] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selectedOffering = offerings.find((item) => item.id === offeringId) ?? null;
  const selectedCandidate = candidates.find((item) => item.id === student) ?? null;

  const load = useCallback(async () => {
    try {
      if (role === 'student') {
        const current = await api<Enrollment[] | { results?: Enrollment[] }>('/subject-enrollments/?page_size=100');
        setRequests(unwrap(current));
        return;
      }
      const query = subjectId ? `?page_size=100&subject=${subjectId}` : '?page_size=100';
      const [foundOfferings, current] = await Promise.all([api<Offering[] | { results?: Offering[] }>(`/subject-offerings/${query}`), api<Enrollment[] | { results?: Enrollment[] }>('/subject-enrollments/?page_size=100')]);
      const scoped = unwrap(foundOfferings).filter((item) => !selectedClass || item.academic_class === selectedClass.id);
      setOfferings(scoped);
      setRequests(unwrap(current));
      setOfferingId((currentId) => (scoped.some((item) => item.id === currentId) ? currentId : (scoped[0]?.id ?? '')));
    } catch (foundError) {
      setError(foundError instanceof Error ? foundError.message : 'Unable to load subject enrollment.');
    }
  }, [role, selectedClass, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (role === 'student' || !offeringId) {
      setCandidates([]);
      return;
    }
    api<Candidate[]>(`/subject-enrollments/candidates/?offering=${offeringId}`)
      .then(setCandidates)
      .catch((reasonValue) => setError(reasonValue.message));
  }, [offeringId, role, requests]);
  const offeringRequests = useMemo(() => requests.filter((item) => role === 'student' || !offeringId || item.offering === offeringId), [offeringId, requests, role]);

  const requestEnrollment = async () => {
    setError('');
    setSuccess('');
    try {
      await api('/subject-enrollments/', {
        method: 'POST',
        body: JSON.stringify({
          enrollment_code: enrollmentCode.trim().toUpperCase(),
        }),
      });
      setEnrollmentCode('');
      setSuccess('Your subject enrollment request was sent to the assigned teacher.');
      await load();
    } catch (foundError) {
      setError(foundError instanceof Error ? foundError.message : 'Unable to request enrollment.');
    }
  };
  const enrollLearner = async () => {
    if (!offeringId || !student) return;
    setError('');
    setSuccess('');
    try {
      await api('/subject-enrollments/', {
        method: 'POST',
        body: JSON.stringify({
          offering: offeringId,
          student,
          decision_reason: role === 'admin' ? reason : '',
        }),
      });
      setSuccess('The learner is enrolled in this subject.');
      setStudent('');
      await load();
    } catch (foundError) {
      setError(foundError instanceof Error ? foundError.message : 'Unable to enroll the learner.');
    }
  };
  const decide = async (row: Enrollment, decision: 'approved' | 'declined') => {
    setError('');
    setSuccess('');
    try {
      await api(`/subject-enrollments/${row.id}/decide/`, {
        method: 'POST',
        body: JSON.stringify({ decision, decision_reason: reason }),
      });
      setSuccess(`Enrollment request ${decision}.`);
      await load();
    } catch (foundError) {
      setError(foundError instanceof Error ? foundError.message : 'Unable to record this decision.');
    }
  };
  const withdraw = async (row: Enrollment) => {
    setError('');
    setSuccess('');
    try {
      await api(`/subject-enrollments/${row.id}/withdraw/`, {
        method: 'POST',
        body: JSON.stringify({ decision_reason: reason }),
      });
      setSuccess('The learner was withdrawn from this subject.');
      await load();
    } catch (foundError) {
      setError(foundError instanceof Error ? foundError.message : 'Unable to withdraw this enrollment.');
    }
  };

  if (role === 'student')
    return (
      <Stack gap={2}>
        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}
        <Card sx={{ p: { xs: 2.5, sm: 3 }, maxWidth: 620 }}>
          <Typography variant="h2">Enter subject enrollment code</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2 }}>
            Ask the subject teacher for the code. The system will confirm that the subject matches your registered cluster, grade level, and section.
          </Typography>
          <Stack
            component="form"
            direction={{ xs: 'column', sm: 'row' }}
            gap={1.25}
            onSubmit={(event) => {
              event.preventDefault();
              void requestEnrollment();
            }}
          >
            <TextField fullWidth label="Subject enrollment code" placeholder="Example: MIL-D429DBED" value={enrollmentCode} onChange={(event) => setEnrollmentCode(event.target.value.toUpperCase())} inputProps={{ maxLength: 20 }} required />
            <Button type="submit" variant="contained" disabled={!enrollmentCode.trim()} sx={{ minWidth: 160 }}>
              Request enrollment
            </Button>
          </Stack>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h3">My enrollment requests</Typography>
          {!requests.length ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
              No subject enrollment requests yet.
            </Typography>
          ) : (
            <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
              {requests.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    py: 1.25,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      {item.subject_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.teacher_name} · {new Date(item.created_at).toLocaleDateString()}
                      {item.decision_reason ? ` · ${item.decision_reason}` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" label={item.status === 'approved' ? 'Enrolled' : item.status === 'pending' ? 'Awaiting approval' : item.status} color={item.status === 'approved' ? 'success' : item.status === 'pending' ? 'warning' : 'default'} />
                </Box>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    );

  return (
    <Card sx={{ p: compact ? 2.5 : 3, mb: 3 }}>
      <Typography variant="h2">Subject enrollment</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {role === 'teacher' ? 'Enroll learners in the selected subject and section, or review learner requests.' : 'Manage subject enrollment when the assigned teacher is unavailable. Administrator actions require a reason.'}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      <Stack gap={2} sx={{ mt: 2 }}>
        {(role === 'admin' || offerings.length > 1) && (
          <TextField
            select
            size="small"
            label="Subject offering"
            value={offeringId}
            onChange={(event) => {
              setOfferingId(Number(event.target.value));
              setStudent('');
            }}
          >
            <MenuItem value="" disabled>
              Choose a subject offering
            </MenuItem>
            {offerings.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.subject_name} · {item.class_label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {selectedOffering && (
          <Alert severity="info" icon={false}>
            {selectedOffering.subject_name} · {selectedOffering.class_label} · Code <strong>{selectedOffering.enrollment_code}</strong>
          </Alert>
        )}
        <Autocomplete
          size="small"
          options={candidates}
          value={selectedCandidate}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          getOptionLabel={(item) => `${item.name} · ${item.email}`}
          onChange={(_, value) => setStudent(value?.id ?? '')}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.id}>
              <Box>
                <Typography variant="body2">{option.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.email} · {option.class_label}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search learner"
              helperText={!offeringId ? 'Choose a subject offering first.' : candidates.length ? `${candidates.length} eligible learner${candidates.length === 1 ? '' : 's'}` : 'No additional eligible learners.'}
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <>
                    <SearchOutlined color="action" sx={{ mr: 0.5 }} />
                    {params.InputProps.startAdornment}
                  </>
                ),
              }}
            />
          )}
          disabled={!offeringId}
        />
        {role === 'admin' && <TextField multiline minRows={3} label="Administrator override reason" value={reason} onChange={(event) => setReason(event.target.value)} required />}
        <Box>
          <Button variant="contained" disabled={!offeringId || !student || (role === 'admin' && !reason.trim())} onClick={() => void enrollLearner()}>
            {role === 'admin' ? 'Apply administrator override' : 'Enroll learner'}
          </Button>
        </Box>
        {offeringRequests.length > 0 && (
          <>
            <Divider />
            <Typography variant="h3">Enrollment records</Typography>
            {role === 'teacher' && offeringRequests.some((item) => item.status === 'pending') && <TextField multiline minRows={2} label="Decision reason (required when declining or withdrawing)" value={reason} onChange={(event) => setReason(event.target.value)} />}
            {offeringRequests.map((row) => (
              <Box
                key={row.id}
                sx={{
                  display: 'flex',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1,
                  py: 0.75,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {row.student_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    LRN {row.student_lrn || 'not recorded'} · {row.student_email} · {row.status} · {new Date(row.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
                {row.status === 'pending' && (
                  <Stack direction="row" gap={1}>
                    <Button size="small" onClick={() => void decide(row, 'approved')}>
                      Approve
                    </Button>
                    <Button size="small" color="error" disabled={!reason.trim()} onClick={() => void decide(row, 'declined')}>
                      Decline
                    </Button>
                  </Stack>
                )}
                {row.status === 'approved' && (
                  <Button size="small" color="warning" variant="outlined" disabled={!reason.trim()} onClick={() => void withdraw(row)}>
                    Withdraw
                  </Button>
                )}
              </Box>
            ))}
          </>
        )}
      </Stack>
    </Card>
  );
}
