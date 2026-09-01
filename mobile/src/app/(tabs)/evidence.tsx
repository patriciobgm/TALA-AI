import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import type { Plan } from '@/lib/types';
import { useStudentScope } from '@/lib/student-scope';
import { colors, radius, spacing } from '@/constants/tokens';

type Evidence = {
  student: { name: string; section: string };
  materials: { id: number; title: string; resource_type: string; completed_at: string | null; quiz_score: string | null }[];
  attempts: { id: number; assessment: string; kind: 'pre' | 'post' | 'remedial'; score: string; submitted_at: string; competency_results: { competency: string; score: string; status: string }[]; incorrect_questions: { id: number; prompt: string; competency: string }[] }[];
  plans: Plan[];
  ai_evidence: { id: number; grounding_status: string; sources: { resource_id?: number; title: string; resource_type?: string }[] }[];
  generated_at: string;
};
const kindLabel = { pre: 'Diagnostic', post: 'Mastery', remedial: 'Remedial' };

export default function EvidenceScreen() {
  const scope = useStudentScope();
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { if (!scope.selectedSubjectId) return; setError(''); api<Evidence>(`/tutor/evidence/?subject=${scope.selectedSubjectId}`).then(setData).catch(reason => setError(reason.message)); }, [scope.selectedSubjectId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!data && !error) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  const sourceMap = new Map<string, { title: string; type: string }>();
  data!.ai_evidence.flatMap(item => item.sources).forEach(source => sourceMap.set(String(source.resource_id ?? source.title), { title: source.title, type: source.resource_type ?? 'Learning material' }));
  const grounded = data!.ai_evidence.filter(item => item.grounding_status === 'grounded').length;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.hero}><Text style={styles.kicker}>Learning Support Record</Text><Text style={styles.title}>{data!.student.name}</Text><Text style={styles.heroText}>{data!.student.section} · Updated {new Date(data!.generated_at).toLocaleString()}</Text></View>
    <Section number="1" title="Assigned learning materials" description="Completion status and learning-quiz results.">{data!.materials.length ? data!.materials.map(item => <Row key={item.id} title={item.title} detail={`${item.resource_type} · ${item.completed_at ? 'Completed' : 'Assigned'} · ${item.quiz_score === null ? 'No quiz result' : `${Math.round(Number(item.quiz_score))}% quiz`}`} />) : <Empty text="No assigned learning materials are recorded for this subject." />}</Section>
    <Section number="2" title="Assessment results" description="Diagnostic, mastery, remedial, and competency results.">{data!.attempts.length ? data!.attempts.map(attempt => <View key={attempt.id} style={styles.block}><View style={styles.scoreRow}><View style={styles.flex}><Text style={styles.rowTitle}>{kindLabel[attempt.kind]} · {attempt.assessment}</Text><Text style={styles.meta}>{new Date(attempt.submitted_at).toLocaleString()}</Text></View><Text style={styles.score}>{Math.round(Number(attempt.score))}%</Text></View>{attempt.competency_results.map(item => <Text key={item.competency} style={styles.detail}>• {item.competency}: {Math.round(Number(item.score))}% · {item.status}</Text>)}{attempt.incorrect_questions.length > 0 && <View style={styles.missed}><Text style={styles.missedTitle}>Questions that require follow-up</Text>{attempt.incorrect_questions.map(item => <Text key={item.id} style={styles.detail}>• {item.prompt} ({item.competency})</Text>)}</View>}</View>) : <Empty text="No submitted assessments are recorded for this subject." />}</Section>
    <Section number="3" title="Recovery-plan decisions" description="Why each activity was selected.">{data!.plans.length ? data!.plans.map(plan => <View key={plan.id} style={styles.block}><Text style={styles.rowTitle}>{plan.competency_title}</Text><Text style={styles.meta}>Baseline {Math.round(Number(plan.baseline_score))}% · {plan.status}</Text>{plan.activities.map((activity, index) => <Text key={activity.id} style={styles.detail}>{index + 1}. {activity.title} · {activity.completed_at ? 'Completed' : 'Pending'}</Text>)}</View>) : <Empty text="No recovery plan was required or generated." />}</Section>
    <Section number="4" title="How TALA supported you" description="Shows which approved learning materials supported TALA's responses.">{data!.ai_evidence.length ? <><Text style={styles.grounded}>{grounded} of {data!.ai_evidence.length} recorded responses used approved lesson materials.</Text>{[...sourceMap.values()].map(source => <Row key={`${source.type}:${source.title}`} title={source.title} detail={source.type} />)}</> : <Empty text="No TALA learning-support responses are recorded for this subject yet." />}</Section>
  </ScrollView>;
}

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) { return <View style={styles.card}><Text style={styles.sectionTitle}>{number}. {title}</Text><Text style={styles.sectionDescription}>{description}</Text>{children}</View>; }
function Row({ title, detail }: { title: string; detail: string }) { return <View style={styles.row}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.meta}>{detail}</Text></View>; }
function Empty({ text }: { text: string }) { return <Text style={styles.empty}>{text}</Text>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background }, hero: { padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.panel }, kicker: { color: '#d7efec', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, title: { color: '#fff', fontSize: 23, fontWeight: '800' }, heroText: { color: '#e6f5f3', lineHeight: 20 }, card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel }, sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' }, sectionDescription: { color: colors.secondaryText, lineHeight: 19 }, row: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, block: { paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }, rowTitle: { color: colors.text, fontWeight: '700', lineHeight: 20 }, meta: { color: colors.secondaryText, fontSize: 12, lineHeight: 18, marginTop: spacing.xs, textTransform: 'capitalize' }, detail: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 }, scoreRow: { flexDirection: 'row', gap: spacing.md }, flex: { flex: 1 }, score: { color: colors.primary, fontSize: 22, fontWeight: '800' }, missed: { padding: spacing.md, gap: spacing.xs, backgroundColor: '#fff8eb', borderRadius: radius.control }, missedTitle: { color: colors.warning, fontWeight: '800', fontSize: 12 }, grounded: { color: colors.success, backgroundColor: '#edf8f2', padding: spacing.md, borderRadius: radius.control, lineHeight: 19 }, empty: { color: colors.secondaryText, paddingVertical: spacing.md }, error: { color: colors.error, backgroundColor: '#fef3f2', padding: spacing.md, borderRadius: radius.control } });
