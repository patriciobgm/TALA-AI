import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { colors, radius, spacing } from '@/constants/tokens';

type Enrollment = { id: number; class_label: string; subject_name: string | null; status: string; source: string; created_at: string };
const unwrap = (value: Enrollment[] | { results?: Enrollment[] }) => Array.isArray(value) ? value : value.results ?? [];

export default function EnrollmentScreen() {
  const [code, setCode] = useState('');
  const [requests, setRequests] = useState<Enrollment[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<Enrollment[] | { results?: Enrollment[] }>('/enrollment-requests/?page_size=100').then(value => setRequests(unwrap(value))).catch(reason => setError(reason.message)); }, []);
  useFocusEffect(load);
  const submit = async () => {
    Keyboard.dismiss(); setError(''); setMessage('');
    try {
      await api('/enrollment-requests/', { method: 'POST', body: JSON.stringify({ class_code: code.trim() }) });
      setCode(''); setMessage('Your request is awaiting teacher or administrator approval.'); load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit enrollment request.'); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.intro}><Text style={styles.title}>Enroll in an ARAL subject</Text><Text style={styles.description}>Enter the subject enrollment code shared by your teacher. Enrollment is managed across all subjects.</Text></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.success}>{message}</Text> : null}
    <View style={styles.card}><Text style={styles.label}>Subject enrollment code</Text><TextInput autoCapitalize="characters" autoCorrect={false} maxLength={48} placeholder="Example: MIL-D429DBED" placeholderTextColor={colors.secondaryText} style={styles.input} value={code} onChangeText={value => setCode(value.toUpperCase())} /><Pressable disabled={!code.trim()} style={[styles.button, !code.trim() && styles.disabled]} onPress={() => void submit()}><Text style={styles.buttonText}>Request enrollment</Text></Pressable></View>
    <View style={styles.card}><Text style={styles.sectionTitle}>Enrollment history and requests</Text>{requests === null && !error ? <ActivityIndicator color={colors.primary} /> : requests?.length ? requests.map(item => <View key={item.id} style={styles.request}><View style={styles.requestText}><Text style={styles.requestTitle}>{item.subject_name ?? 'Subject'} · {item.class_label}</Text><Text style={styles.meta}>{item.source.replace('_', ' ')} · {new Date(item.created_at).toLocaleDateString()}</Text></View><Text style={styles.status}>{item.status}</Text></View>) : <Text style={styles.empty}>No enrollment requests yet.</Text>}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }, intro: { gap: spacing.sm }, title: { color: colors.text, fontSize: 24, fontWeight: '800' }, description: { color: colors.secondaryText, lineHeight: 21 }, card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, label: { color: colors.text, fontSize: 13, fontWeight: '700' }, input: { minHeight: 48, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, fontSize: 16 }, button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.control }, buttonText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: .45 }, request: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, requestText: { flex: 1 }, requestTitle: { color: colors.text, fontWeight: '700' }, meta: { color: colors.secondaryText, fontSize: 12, marginTop: spacing.xs, textTransform: 'capitalize' }, status: { color: colors.primary, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, empty: { color: colors.secondaryText, paddingVertical: spacing.md }, error: { color: colors.error, backgroundColor: '#fef3f2', padding: spacing.md, borderRadius: radius.control }, success: { color: colors.success, backgroundColor: '#edf8f2', padding: spacing.md, borderRadius: radius.control } });
