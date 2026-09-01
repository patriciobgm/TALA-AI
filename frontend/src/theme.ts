import { createTheme } from '@mui/material/styles';

const buildTheme = (primary: { main: string; dark: string; light: string }, background: string, radius: number) => createTheme({
  palette: {
    mode: 'light', primary,
    success: { main: '#237a57', light: '#eaf5ef' }, warning: { main: '#a15c0b', light: '#fff4df' },
    error: { main: '#b42318', light: '#fff0ee' }, info: { main: '#2563a6', light: '#eef5fc' },
    background: { default: background, paper: '#ffffff' }, text: { primary: '#17212b', secondary: '#5b6875', disabled: '#8a96a3' }, divider: '#dce2e8',
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

export const theme = buildTheme({ main: '#174b7a', dark: '#11385d', light: '#e8f1f8' }, '#f5f7f9', 8);
export const roleThemes = {
  student: buildTheme({ main: '#16756f', dark: '#0d514d', light: '#e3f4f1' }, '#f3f8f6', 14),
  teacher: buildTheme({ main: '#315aa8', dark: '#213f7d', light: '#e9effb' }, '#f4f6fb', 10),
  admin: buildTheme({ main: '#33485f', dark: '#1f3042', light: '#e8edf2' }, '#f3f5f7', 6),
};
