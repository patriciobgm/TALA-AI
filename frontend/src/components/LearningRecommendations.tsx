import { Box, Button, Card, Divider, Stack, Typography } from '@mui/material';
import type { LearningRecommendation } from '../api/types';
import { StatusChip } from './StatusChip';

type Props = {
  recommendations: LearningRecommendation[];
  busyKey: string;
  onDecision: (recommendation: LearningRecommendation, decision: 'accepted' | 'dismissed') => void;
};

export function LearningRecommendations({ recommendations, busyKey, onDecision }: Props) {
  return <Card sx={{ mb: 3 }}>
    <Box sx={{ p: 2.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
      <Box>
        <Typography variant="overline" color="primary.main" fontWeight={800}>Evidence-ranked support</Typography>
        <Typography variant="h2">Recommended next materials</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5, maxWidth: 760 }}>Approved materials are ranked using the learner’s competency score, recent practice, material difficulty, and embedded checks. The teacher decides whether anything is assigned.</Typography>
      </Box>
      <StatusChip label={`${recommendations.length} available`} />
    </Box>
    <Divider />
    {recommendations.length ? <Stack divider={<Divider />}>{recommendations.slice(0, 6).map(item => {
      const key = `${item.plan}-${item.resource}`;
      return <Box key={key} sx={{ px: 2.5, py: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' }, gap: 2, alignItems: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography variant="body2" fontWeight={750}>{item.resource_title}</Typography><StatusChip label={item.confidence === 'limited' ? 'Limited evidence' : `${item.confidence} confidence`} /></Stack>
          <Typography variant="caption" color="text.secondary">{item.competency_title} · {item.resource_type.replaceAll('_', ' ')} · {item.difficulty}</Typography>
          <Typography variant="body2" sx={{ mt: 1, lineHeight: 1.6 }}>{item.reason}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .75 }}>Ranking score {Math.round(item.score)} · {item.signals.embedded_checks} embedded checks · {item.signals.algorithm_version}</Typography>
        </Box>
        <Stack direction="row" gap={1} justifyContent={{ lg: 'flex-end' }}>
          <Button size="small" disabled={Boolean(busyKey)} onClick={() => onDecision(item, 'dismissed')}>Not suitable</Button>
          <Button size="small" variant="outlined" disabled={Boolean(busyKey)} onClick={() => onDecision(item, 'accepted')}>{busyKey === key ? 'Adding…' : 'Add to plan'}</Button>
        </Stack>
      </Box>;
    })}</Stack> : <Box sx={{ p: 3 }}><Typography variant="body2" color="text.secondary">No additional approved materials are available for the learner’s active competency gaps.</Typography></Box>}
  </Card>;
}
