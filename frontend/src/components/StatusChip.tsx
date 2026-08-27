import { Chip } from '@mui/material';

type Props = { label: string; size?: 'small' | 'medium' };

export function StatusChip({ label, size = 'small' }: Props) {
  const normalized = label.toLowerCase();
  const color = normalized.includes('master') || normalized === 'on track' || normalized === 'active'
    ? { bg: '#eaf5ef', fg: '#17633f', border: '#bfdfcd' }
    : normalized.includes('intervention') || normalized.includes('remediation')
      ? { bg: '#fff0ee', fg: '#9d251b', border: '#f2c6c1' }
      : normalized.includes('monitor') || normalized.includes('developing') || normalized.includes('pending')
        ? { bg: '#fff4df', fg: '#84500f', border: '#edd4a7' }
        : { bg: '#eef3f7', fg: '#4d5d6c', border: '#d6dee6' };

  return <Chip label={label} size={size} sx={{ height: 24, borderRadius: 1, bgcolor: color.bg, color: color.fg, border: `1px solid ${color.border}`, fontWeight: 650, '& .MuiChip-label': { px: 1 } }} />;
}
