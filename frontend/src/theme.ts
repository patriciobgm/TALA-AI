import { createTheme } from '@mui/material/styles';

const buildTheme = (primary: { main: string; dark: string; light: string }, background: string, radius: number) => createTheme({
  palette: {
    mode: 'light', primary,
    success: { main: '#10B981', light: '#ECFDF5' }, warning: { main: '#F59E0B', light: '#FFFBEB' },
    error: { main: '#b42318', light: '#fff0ee' }, info: { main: '#2563EB', light: '#EFF6FF' },
    background: { default: background, paper: '#FFFFFF' }, text: { primary: '#1E293B', secondary: '#64748B', disabled: '#94A3B8' }, divider: '#CBD5E1',
  },
  shape: { borderRadius: radius },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: '1.75rem', lineHeight: 1.25, fontWeight: 650, letterSpacing: '-0.02em' }, h2: { fontSize: '1.25rem', lineHeight: 1.35, fontWeight: 650, letterSpacing: '-0.01em' }, h3: { fontSize: '1rem', lineHeight: 1.4, fontWeight: 650 },
    body1: { fontSize: '0.875rem', lineHeight: 1.55 }, body2: { fontSize: '0.8125rem', lineHeight: 1.5 }, button: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' }, caption: { fontSize: '0.75rem', lineHeight: 1.45 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 38, boxShadow: 'none', borderRadius: Math.max(7, radius - 1) }, contained: { '&:hover': { boxShadow: 'none' } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: { boxShadow: 'none', border: '1px solid #dce2e8' } } },
    MuiOutlinedInput: { styleOverrides: { root: { background: '#fff' } } },
    MuiTableCell: { styleOverrides: { head: { color: '#5b6875', fontSize: '0.75rem', fontWeight: 650, background: '#f8f9fb', borderColor: '#e5e9ed' }, root: { borderColor: '#e5e9ed' } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

export const theme = buildTheme({ main: '#2563EB', dark: '#1D4ED8', light: '#EFF6FF' }, '#F1F5F9', 8);
export const roleThemes = {
  student: buildTheme({ main: '#2563EB', dark: '#1D4ED8', light: '#EFF6FF' }, '#F1F5F9', 14),
  teacher: buildTheme({ main: '#2563EB', dark: '#1D4ED8', light: '#EFF6FF' }, '#F1F5F9', 10),
  admin: buildTheme({ main: '#2563EB', dark: '#1D4ED8', light: '#EFF6FF' }, '#F1F5F9', 6),
};
