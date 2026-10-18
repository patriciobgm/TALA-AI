import { useState } from 'react';
import { Alert, Box, Button, IconButton, InputAdornment, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ArrowBack, CheckCircleOutline, Visibility, VisibilityOff } from '@mui/icons-material';
import { ApiError } from '../api/client';
import { getRegistrationOptions, registerTeacher, requestPasswordReset, resetPassword, type RegistrationOptions } from '../api/auth';

type RegistrationMode = 'learner' | 'teacher' | null;

export function LoginPage({ onLogin }: { onLogin: (email: string, password: string, otp?: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registrationOptions, setRegistrationOptions] = useState<RegistrationOptions | null>(null);
  const [registration, setRegistration] = useState({
    name: '',
    lrn: '',
    cluster: '' as number | '',
    grade_level: 11,
    section: '' as number | '',
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLocaleLowerCase();
    if (!normalizedEmail.includes('@') || (!forgot && password.length < 8)) {
      setError(forgot ? 'Enter a valid email.' : 'Enter a valid email and a password with at least 8 characters.');
      return;
    }
    if (registrationMode && (!registration.name.trim() || !registration.cluster || (registrationMode === 'learner' && (!/^\d{12}$/.test(registration.lrn) || !registration.section)))) {
      setError(registrationMode === 'learner' ? 'Complete your name, 12-digit LRN, cluster, grade level, and section.' : 'Complete your name and cluster.');
      return;
    }
    setEmail(normalizedEmail);
    setError('');
    setSubmitting(true);
    try {
      if (forgot) {
        const result = await requestPasswordReset(normalizedEmail);
        setSuccess(result.detail);
      } else if (registrationMode === 'teacher') {
        const result = await registerTeacher({
          email: normalizedEmail,
          password,
          name: registration.name.trim(),
          cluster: Number(registration.cluster),
        });
        setSuccess(result.detail);
      } else await onLogin(normalizedEmail, password, otp.trim());
    } catch (reason) {
      const data = reason instanceof ApiError ? (reason.data as { code?: string | string[] }) : null;
      if (data && (data.code === 'mfa_required' || data.code?.[0] === 'mfa_required')) {
        setNeedsMfa(true);
        setError('Enter the code from your authenticator app or a recovery code.');
      } else setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };
  const returnToSignIn = () => {
    setForgot(false);
    setRegistrationMode(null);
    setNeedsMfa(false);
    setOtp('');
    setError('');
    setSuccess('');
  };
  const beginRegistration = (mode: Exclude<RegistrationMode, null>) => {
    setRegistrationMode(mode);
    setForgot(false);
    setError('');
    setSuccess('');
    if (!registrationOptions)
      getRegistrationOptions()
        .then(setRegistrationOptions)
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load registration options.'));
  };
  const availableSections = registrationOptions?.sections.filter((item) => item.grade_level === registration.grade_level && (!item.cluster || item.cluster === registration.cluster)) ?? [];
  const isRegistering = registrationMode !== null;
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#F1F5F9',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        component="header"
        sx={{
          height: 68,
          px: { xs: 2.5, sm: 4 },
          display: 'flex',
          alignItems: 'center',
          bgcolor: '#0F766E',
          color: '#FFFFFF',
          '& .MuiTypography-root': { color: 'inherit' },
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
          <Box component="img" src="/tala.png" alt="TALA-AI" sx={{ width: 42, height: 42, objectFit: 'contain' }} />
          <Box>
            <Typography fontWeight={800} lineHeight={1.1}>
              TALA-AI
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Talavera Senior High School
            </Typography>
          </Box>
        </Box>
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          width: '100%',
          maxWidth: 1080,
          mx: 'auto',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 440px' },
          alignItems: 'center',
          gap: { md: 7 },
          px: { xs: 2.5, sm: 4 },
          py: { xs: 4, sm: 7 },
        }}
      >
        <Box sx={{ display: { xs: 'none', md: 'block' }, pr: 4 }}>
          <Box component="img" src="/tala.png" alt="Ask TALA" sx={{ width: 82, height: 82, objectFit: 'contain', mb: 2 }} />
          <Typography variant="h1" sx={{ maxWidth: 520, fontSize: 38, lineHeight: 1.15 }}>
            Focused learning support for every SHS learner.
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 540, fontSize: 17 }}>
            Access assigned learning materials, assessments, recovery activities, and teacher-guided support in one secure school workspace.
          </Typography>
          <Stack gap={1.25} sx={{ mt: 3 }}>
            {['Learning materials before diagnostics', 'Competency-based recovery plans', 'Ask TALA guidance when learners need help'].map((item) => (
              <Box key={item} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <CheckCircleOutline color="success" fontSize="small" />
                <Typography variant="body2" fontWeight={650}>
                  {item}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Box
          sx={{
            width: '100%',
            bgcolor: '#fff',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            p: { xs: 3, sm: 4 },
            boxShadow: '0 18px 50px rgba(28, 43, 54, 0.08)',
          }}
        >
          {(forgot || isRegistering || needsMfa) && (
            <Button size="small" startIcon={<ArrowBack />} onClick={returnToSignIn} sx={{ mb: 2, ml: -1 }}>
              Back to sign in
            </Button>
          )}
          <Typography variant="h1">{forgot ? 'Reset your password' : registrationMode === 'learner' ? 'Create learner account' : registrationMode === 'teacher' ? 'Create teacher account' : needsMfa ? 'Verify your identity' : 'Sign in'}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {forgot ? 'We will send a single-use reset link to your email.' : registrationMode === 'learner' ? 'Register with your LRN and school placement. Subject enrollment is verified separately using a teacher-provided code.' : registrationMode === 'teacher' ? 'Choose your teaching cluster. An administrator will review your account before you can sign in.' : needsMfa ? `Enter the verification code for ${email}.` : 'Continue to your TALA-AI learning workspace.'}
          </Typography>
          {error && (
            <Alert severity="error" role="alert" sx={{ mt: 3 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" role="status" sx={{ mt: 3 }}>
              {success}
            </Alert>
          )}
          {!success && (
            <Box component="form" onSubmit={submit} noValidate sx={{ mt: 3 }}>
              <Stack gap={2}>
                {isRegistering && (
                  <TextField
                    label="Complete name"
                    value={registration.name}
                    onChange={(event) =>
                      setRegistration((value) => ({
                        ...value,
                        name: event.target.value,
                      }))
                    }
                    autoComplete="name"
                    required
                    autoFocus
                  />
                )}
                {registrationMode === 'learner' && (
                  <TextField
                    label="LRN"
                    value={registration.lrn}
                    onChange={(event) =>
                      setRegistration((value) => ({
                        ...value,
                        lrn: event.target.value.replace(/\D/g, '').slice(0, 12),
                      }))
                    }
                    inputProps={{ inputMode: 'numeric', maxLength: 12 }}
                    helperText="Enter the 12-digit Learner Reference Number issued by DepEd."
                    required
                  />
                )}
                <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputProps={{ autoCapitalize: 'none', spellCheck: false }} required autoFocus={!needsMfa && !isRegistering} disabled={needsMfa} />
                {!forgot && (
                  <TextField
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                    required
                    disabled={needsMfa}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} edge="end" onClick={() => setShowPassword((value) => !value)} disabled={needsMfa}>
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
                {isRegistering && (
                  <TextField
                    select
                    label="Cluster"
                    value={registration.cluster}
                    onChange={(event) =>
                      setRegistration((value) => ({
                        ...value,
                        cluster: Number(event.target.value),
                        section: '',
                      }))
                    }
                    required
                  >
                    {registrationOptions?.clusters.map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {registrationMode === 'learner' && (
                  <>
                    <TextField
                      select
                      label="Grade level"
                      value={registration.grade_level}
                      onChange={(event) =>
                        setRegistration((value) => ({
                          ...value,
                          grade_level: Number(event.target.value),
                          section: '',
                        }))
                      }
                      required
                    >
                      {(registrationOptions?.grade_levels ?? [11, 12]).map((item) => (
                        <MenuItem key={item} value={item}>
                          Grade {item}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Section"
                      value={registration.section}
                      onChange={(event) =>
                        setRegistration((value) => ({
                          ...value,
                          section: Number(event.target.value),
                        }))
                      }
                      required
                      disabled={!registration.cluster}
                    >
                      {availableSections.map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                          {item.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </>
                )}
                {needsMfa && (
                  <TextField
                    label="Verification or recovery code"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    autoComplete="one-time-code"
                    inputProps={{
                      inputMode: 'numeric',
                      autoCapitalize: 'none',
                    }}
                    helperText="Use the six-digit authenticator code or one of your recovery codes."
                    required
                    autoFocus
                  />
                )}
                <Button variant="contained" type="submit" size="large" loading={submitting}>
                  {forgot ? 'Send reset link' : registrationMode === 'learner' ? 'Create account' : registrationMode === 'teacher' ? 'Submit for approval' : needsMfa ? 'Verify and sign in' : 'Sign in'}
                </Button>
                {!forgot && !isRegistering && !needsMfa && (
                  <>
                    <Button
                      onClick={() => {
                        setForgot(true);
                        setError('');
                        setSuccess('');
                      }}
                    >
                      Forgot password?
                    </Button>
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                      <Button fullWidth variant="contained" component="a" href="/diagnostic" sx={{ minHeight: 48, px: 1.5, textAlign: 'center', lineHeight: 1.25, justifyContent: 'center' }}>
                        Take diagnostic assessment
                      </Button>
                      <Button fullWidth variant="outlined" onClick={() => beginRegistration('teacher')} sx={{ minHeight: 48, px: 1.5, textAlign: 'center', lineHeight: 1.25, justifyContent: 'center' }}>
                        Create teacher account
                      </Button>
                    </Stack>
                  </>
                )}
              </Stack>
            </Box>
          )}
          {success && (
            <Button fullWidth variant="outlined" startIcon={<ArrowBack />} onClick={returnToSignIn} sx={{ mt: 2 }}>
              Return to sign in
            </Button>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>
            If you cannot access your email, contact your school administrator.
          </Typography>
        </Box>
      </Box>
      <Box component="footer" sx={{ px: 2.5, py: 2.5, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Authorized school users only
        </Typography>
      </Box>
    </Box>
  );
}

export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8 || password !== confirm) {
      setError('Use at least eight characters and make sure both passwords match.');
      return;
    }
    try {
      const result = await resetPassword(params.get('uid') ?? '', params.get('token') ?? '', password);
      setSuccess(result.detail);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reset the password.');
    }
  };
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'grid',
        placeItems: 'center',
        p: 2,
      }}
    >
      <Box
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: 440,
          bgcolor: '#fff',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 4,
        }}
      >
        <Typography variant="h1">Choose a new password</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          This link can be used once.
        </Typography>
        <Stack gap={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && (
            <Alert severity="success">
              {success} <Link href="/">Return to sign in</Link>
            </Alert>
          )}
          <TextField label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
          <TextField label="Confirm new password" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
          <Button type="submit" variant="contained" disabled={Boolean(success)}>
            Update password
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
