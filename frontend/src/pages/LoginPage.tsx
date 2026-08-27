import { useState } from 'react';
import { Alert, Box, Button, Card, Stack, TextField, Typography } from '@mui/material';

export function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('teacher@tala.edu.ph');
  const [password, setPassword] = useState('demo-password');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.includes('@') || password.length < 8) { setError('Enter a valid email and a password with at least 8 characters.'); return; }
    setError(''); setSubmitting(true);
    try { await onLogin(email, password); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in.'); } finally { setSubmitting(false); }
  };
  return <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, 44%) 1fr' }, bgcolor: '#fff' }}>
    <Box sx={{ display: 'flex', flexDirection: 'column', px: { xs: 3, sm: 6, lg: 10 }, py: 4 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}><Box sx={{ width: 34, height: 34, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: '#fff', borderRadius: 1, fontWeight: 800 }}>T</Box><Box><Typography fontWeight={750}>TALA-AI</Typography><Typography variant="caption" color="text.secondary">Academic Recovery</Typography></Box></Box>
      <Box sx={{ width: '100%', maxWidth: 420, my: 'auto', py: 6 }}><Typography variant="h1">Sign in to TALA-AI</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Access your academic recovery workspace.</Typography>
        {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
        <Box component="form" onSubmit={submit} noValidate sx={{ mt: 3 }}><Stack gap={2}><TextField label="School email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required autoFocus /><TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /><Button variant="contained" type="submit" size="large" loading={submitting}>Sign in</Button></Stack></Box>
        <Card sx={{ mt: 3, p: 2, bgcolor: '#f8fafb' }}><Typography variant="body2" fontWeight={650}>Development access</Typography><Typography variant="caption" color="text.secondary">Seeded accounts: teacher@tala.edu.ph, student@tala.edu.ph, or admin@tala.edu.ph · password: demo-password.</Typography></Card>
      </Box><Typography variant="caption" color="text.secondary">Talavera Senior High School · Authorized users only</Typography>
    </Box>
    <Box sx={{ display: { xs: 'none', md: 'flex' }, bgcolor: '#163f64', color: '#fff', p: { md: 6, lg: 10 }, alignItems: 'flex-end' }}><Box sx={{ maxWidth: 620, mb: 6 }}><Typography sx={{ fontSize: 30, lineHeight: 1.3, fontWeight: 650, letterSpacing: '-.02em' }}>A structured path from learning gaps to competency mastery.</Typography><Typography sx={{ mt: 2, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>TALA-AI helps learners complete focused recovery plans while giving teachers clear, actionable progress information.</Typography></Box></Box>
  </Box>;
}
