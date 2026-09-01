import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Dashboard } from '@/lib/types';
import { colors, radius, spacing } from '@/constants/tokens';
import { useStudentScope } from '@/lib/student-scope';

export default function ProgressScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const scope = useStudentScope();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    if (!scope.selectedSubjectId) return;
    setData(null);
    api<Dashboard>(`/dashboard/student/?subject=${scope.selectedSubjectId}`).then(setData).catch(reason => setError(reason.message));
  }, [scope.selectedSubjectId]));

  if (!scope.loading && !scope.selectedSubjectId) return <View style={styles.center}><Text style={styles.empty}>You are not enrolled in an ARAL subject yet.</Text><Pressable style={styles.emptyAction} onPress={() => router.push('/(tabs)/enrollment')}><Text style={styles.emptyActionText}>Open subject enrollment</Text></Pressable></View>;
  if (!data && !error) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  const active = data?.plans.find(plan => plan.status === 'active');
  const activityCount = active?.activities.length ?? 0;
  const completed = active?.activities.filter(item => item.completed_at).length ?? 0;
  const progress = activityCount ? Math.round(completed / activityCount * 100) : 0;
  const pending = data?.pending_diagnostic;
  const latest = data?.attempts.at(-1);
  const pendingReview = latest?.grading_status === 'pending_review';
  const allMastered = Boolean(latest?.competency_results?.length) && latest!.competency_results!.every(item => item.status === 'mastered');
  const needsMaterials = Boolean(pending?.remaining_prerequisites);
  const recoveryTitle = active?.competency_title ?? (needsMaterials ? 'Learning materials come first' : pending ? 'Diagnostic ready' : pendingReview ? 'Assessment under review' : allMastered ? 'You are currently on track' : 'No recovery activities right now');
  const recoveryText = active ? `${completed} of ${activityCount} activities completed` : needsMaterials ? `Complete ${pending!.remaining_prerequisites} required material${pending!.remaining_prerequisites === 1 ? '' : 's'} before your diagnostic.` : pending ? 'Take your diagnostic. A recovery plan is created only when additional support is needed.' : pendingReview ? 'Your teacher is reviewing your assessment before support is determined.' : allMastered ? 'Your latest results do not require remediation.' : 'Your teacher will assign support when it is needed.';

  return <SafeAreaView edges={['bottom']} style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.headingRow}><View><Text style={styles.eyebrow}>{user?.class_name ?? 'Student'}</Text><Text style={styles.title}>Hello, {user?.name.split(' ')[0]}</Text></View><Pressable onPress={() => router.push('/(tabs)/profile')}><Text style={styles.link}>Profile</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.summary}><Text style={styles.summaryLabel}>Current learning support</Text><Text style={styles.summaryTitle}>{recoveryTitle}</Text><Text style={styles.summaryText}>{recoveryText}</Text>{active && <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>}{(active || pending || latest) && <Pressable style={styles.primaryButton} onPress={() => router.push(active ? '/(tabs)/recovery' : needsMaterials ? '/(tabs)/materials' : '/(tabs)/assessments')}><Text style={styles.primaryButtonText}>{active ? 'Continue recovery plan' : needsMaterials ? 'Open learning materials' : 'View assessments'}</Text></Pressable>}</View>
    <View style={styles.metrics}><View style={styles.metric}><Text style={styles.metricValue}>{data?.mastered ?? 0}</Text><Text style={styles.metricLabel}>Competencies mastered</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{data?.total_competencies ?? 0}</Text><Text style={styles.metricLabel}>Competencies assigned</Text></View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Recent assessment results</Text>{data?.attempts.length ? data.attempts.slice(-3).reverse().map(attempt => <View key={attempt.id} style={styles.row}><View><Text style={styles.rowTitle}>Submitted assessment</Text><Text style={styles.meta}>{new Date(attempt.submitted_at).toLocaleDateString()}</Text></View><Text style={styles.score}>{Math.round(Number(attempt.score))}%</Text></View>) : <Text style={styles.empty}>No submitted assessments yet.</Text>}</View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background, padding: spacing.xl }, content: { padding: spacing.lg, gap: spacing.xl },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: colors.secondaryText, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }, title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: spacing.xs }, link: { color: colors.primary, fontWeight: '700' },
  summary: { backgroundColor: colors.primary, borderRadius: radius.panel, padding: spacing.xl }, summaryLabel: { color: '#d7efec', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }, summaryTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: spacing.sm }, summaryText: { color: '#e6f5f3', lineHeight: 20, marginTop: spacing.sm }, progressTrack: { height: 7, backgroundColor: '#46938e', borderRadius: 4, overflow: 'hidden', marginTop: spacing.lg }, progressFill: { height: '100%', backgroundColor: '#fff' },
  primaryButton: { backgroundColor: '#fff', minHeight: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg }, primaryButtonText: { color: colors.primary, fontWeight: '700' }, emptyAction: { minHeight: 46, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.control }, emptyActionText: { color: '#fff', fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: spacing.md }, metric: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel, padding: spacing.lg }, metricValue: { color: colors.text, fontSize: 24, fontWeight: '800' }, metricLabel: { color: colors.secondaryText, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, row: { minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border }, rowTitle: { color: colors.text, fontWeight: '600' }, meta: { color: colors.secondaryText, fontSize: 12, marginTop: spacing.xs }, score: { color: colors.text, fontWeight: '800', fontSize: 17 }, empty: { color: colors.secondaryText, padding: spacing.xl, textAlign: 'center' }, error: { color: colors.error, backgroundColor: '#fef3f2', padding: spacing.md, borderRadius: radius.control },
});
