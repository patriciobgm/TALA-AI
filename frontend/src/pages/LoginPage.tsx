import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { ApiError } from '../api/client';
import { requestPasswordReset, resetPassword } from '../api/auth';

export function LoginPage({ onLogin }: { onLogin: (email: string, password: string, otp?: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [otp, setOtp] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.includes('@') || (!forgot && password.length < 8)) { setError(forgot ? 'Enter a valid school email.' : 'Enter a valid email and a password with at least 8 characters.'); return; }
    setError(''); setSubmitting(true);
    try {
      if (forgot) { const result = await requestPasswordReset(email); setSuccess(result.detail); }
      else await onLogin(email, password, otp);
    } catch (reason) {
      const data = reason instanceof ApiError ? reason.data as { code?: string | string[] } : null;
      if (data && (data.code === 'mfa_required' || data.code?.[0] === 'mfa_required')) { setNeedsMfa(true); setError('Enter the code from your authenticator app or a recovery code.'); }
      else setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally { setSubmitting(false); }
  };
  return <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f7', display: 'flex', flexDirection: 'column' }}>
    <Box component="header" sx={{ height: 68, px: { xs: 2.5, sm: 4 }, display: 'flex', alignItems: 'center', bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}><Box sx={{ width: 34, height: 34, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: '#fff', borderRadius: 1, fontWeight: 800 }}>T</Box><Box><Typography fontWeight={800} lineHeight={1.1}>TALA-AI</Typography><Typography variant="caption" color="text.secondary">Academic Recovery</Typography></Box></Box>
    </Box>
    <Box component="main" sx={{ flex: 1, display: 'grid', placeItems: 'center', px: 2.5, py: { xs: 5, sm: 8 } }}>
      <Box sx={{ width: '100%', maxWidth: 440, bgcolor: '#fff', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 3, sm: 4 } }}><Typography variant="h1">{forgot ? 'Reset your password' : 'Sign in'}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{forgot ? 'We will send a single-use reset link to your school email.' : 'Use your school-issued TALA account.'}</Typography>
        {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 3 }}>{success}</Alert>}
        <Box component="form" onSubmit={submit} noValidate sx={{ mt: 3 }}><Stack gap={2}><TextField label="School email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required autoFocus disabled={needsMfa} />{!forgot && <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required disabled={needsMfa} />}{needsMfa && <TextField label="Verification or recovery code" value={otp} onChange={event => setOtp(event.target.value)} autoComplete="one-time-code" required autoFocus /> }<Button variant="contained" type="submit" size="large" loading={submitting}>{forgot ? 'Send reset link' : needsMfa ? 'Verify and sign in' : 'Sign in'}</Button><Button onClick={() => { setForgot(value => !value); setError(''); setSuccess(''); setNeedsMfa(false); }}>{forgot ? 'Back to sign in' : 'Forgot password?'}</Button></Stack></Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>If your school email is unavailable, contact your administrator.</Typography>
      </Box>
    </Box>
    <Box component="footer" sx={{ px: 2.5, py: 2.5, textAlign: 'center' }}><Typography variant="caption" color="text.secondary">Authorized school users only</Typography></Box>
  </Box>;
}

export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 8 || password !== confirm) { setError('Use at least eight characters and make sure both passwords match.'); return; }
    try { const result = await resetPassword(params.get('uid') ?? '', params.get('token') ?? '', password); setSuccess(result.detail); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to reset the password.'); }
  };
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}><Box component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 440, bgcolor: '#fff', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 4 }}><Typography variant="h1">Choose a new password</Typography><Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>This link can be used once.</Typography><Stack gap={2}>{error && <Alert severity="error">{error}</Alert>}{success && <Alert severity="success">{success} <Link href="/">Return to sign in</Link></Alert>}<TextField label="New password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" required /><TextField label="Confirm new password" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" required /><Button type="submit" variant="contained" disabled={Boolean(success)}>Update password</Button></Stack></Box></Box>;
}
