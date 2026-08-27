import type { ReactNode } from 'react';
import { Box, Breadcrumbs, Typography } from '@mui/material';

export function PageHeader({ title, description, action, parent }: { title: string; description?: string; action?: ReactNode; parent?: string }) {
  return (
    <Box sx={{ mb: 3 }}>
      {parent && <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 1, '& .MuiTypography-root': { fontSize: 12 } }}><Typography color="text.secondary">{parent}</Typography><Typography color="text.primary">{title}</Typography></Breadcrumbs>}
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box><Typography variant="h1">{title}</Typography>{description && <Typography color="text.secondary" sx={{ mt: .5 }}>{description}</Typography>}</Box>
        {action}
      </Box>
    </Box>
  );
}
