import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function Metric({ label, value, detail, icon }: { label: string; value: string | number; detail?: string; icon?: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0, py: .5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>{icon}<Typography variant="body2" fontWeight={600}>{label}</Typography></Box>
      <Typography sx={{ mt: .75, fontSize: 24, fontWeight: 680, letterSpacing: '-.02em' }}>{value}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Box>
  );
}
