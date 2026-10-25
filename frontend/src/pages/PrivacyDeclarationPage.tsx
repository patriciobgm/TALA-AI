import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Checkbox, CircularProgress, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { api } from '../api/client';

type Declaration = { policy_version: string; declaration_text: string; privacy_contact_email: string; acknowledged: boolean; accepted_at: string | null };

export function PrivacyDeclarationPage({ onAccepted, onLogout }: { onAccepted: () => void; onLogout: () => void }) {
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<Declaration>('/auth/privacy-acknowledgment/').then(setDeclaration).catch(reason => setError(reason.message)); }, []);
  const submit = async () => {
    setBusy(true); setError('');
    try { await api('/auth/privacy-acknowledgment/', { method: 'POST', body: JSON.stringify({ accepted: true }) }); onAccepted(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to record your acknowledgment.'); }
    finally { setBusy(false); }
  };
  if (!declaration && !error) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}><Card sx={{ width: '100%', maxWidth: 760 }}><Box sx={{ p: { xs: 3, sm: 4 } }}><Stack gap={2.5}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Box component="img" src="/tala.png" alt="TALA-AI" sx={{ width: 48, height: 48, objectFit: 'contain' }} /><Box><Typography variant="h1">Data Privacy Consent</Typography><Typography variant="caption" color="text.secondary">TALA-AI privacy notice · Version {declaration?.policy_version}</Typography></Box></Box>{error && <Alert severity="error">{error}</Alert>}<Box><Typography variant="h3">Before you continue</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>TALA-AI uses your learning information to identify academic gaps, recommend support, and help authorized teachers monitor your recovery progress.</Typography></Box><Alert severity="info" icon={false}><Typography variant="body1" sx={{ lineHeight: 1.75 }}>{declaration?.declaration_text}</Typography></Alert><Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}><Typography component="li" variant="body2" sx={{ mb: .5 }}>Your records are used only for authorized school learning-support activities.</Typography><Typography component="li" variant="body2" sx={{ mb: .5 }}>Your assessment scoring and progression rules remain deterministic and teacher-supervised.</Typography><Typography component="li" variant="body2">You may request access or correction through your Account &amp; Security page.</Typography></Box>{declaration?.privacy_contact_email && <Typography variant="body2" color="text.secondary">School privacy contact: {declaration.privacy_contact_email}</Typography>}<Divider /><FormControlLabel sx={{ alignItems: 'flex-start' }} control={<Checkbox checked={accepted} onChange={event => setAccepted(event.target.checked)} />} label="I have read this notice and consent to the described collection and processing of my information for the ARAL learning-support program." /><Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="flex-end" gap={1}><Button onClick={onLogout}>Sign out</Button><Button variant="contained" disabled={!accepted || busy} onClick={() => void submit()}>{busy ? 'Recording consent…' : 'I Consent and Continue'}</Button></Stack></Stack></Box></Card></Box>;
}
