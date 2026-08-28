import { useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@/constants/tokens';
import { api } from '@/lib/api';

type Message = { role: 'student' | 'tala'; text: string };

export default function TalaChatScreen() {
  const params = useLocalSearchParams<{ planId: string; activityId?: string; title?: string }>();
  const planId = Number(params.planId);
  const activityId = Number(params.activityId);
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Message[]>([{ role: 'tala', text: `I can help explain ${params.title || 'this activity'} or give you a hint.` }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!draft.trim() || !planId) return;
    const message = draft.trim(); setDraft(''); setBusy(true); setMessages(current => [...current, { role: 'student', text: message }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    try { const result = await api<{ answer: string }>(`/tutor/plans/${planId}/messages/`, { method: 'POST', body: JSON.stringify({ message, action: 'explain', activity_id: activityId || undefined }) }); setMessages(current => [...current, { role: 'tala', text: result.answer }]); }
    catch { setMessages(current => [...current, { role: 'tala', text: 'TALA is unavailable right now. You can continue the activity and try again later.' }]); }
    finally { setBusy(false); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); }
  };
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}><View style={styles.context}><Text style={styles.contextLabel}>Activity context</Text><Text numberOfLines={1} style={styles.contextTitle}>{params.title || 'Recovery activity'}</Text></View><ScrollView ref={scrollRef} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">{messages.map((item, index) => <View key={index} style={[styles.bubble, item.role === 'student' ? styles.studentBubble : styles.talaBubble]}><Text style={item.role === 'student' ? styles.studentText : styles.talaText}>{item.text}</Text></View>)}{busy && <View style={[styles.bubble, styles.talaBubble, styles.thinking]}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.talaText}>TALA is preparing a response…</Text></View>}</ScrollView><View style={styles.composer}><TextInput style={styles.input} value={draft} onChangeText={setDraft} multiline placeholder="Ask about this activity" returnKeyType="send" blurOnSubmit={false} onSubmitEditing={() => void ask()} /><Pressable style={[styles.send, (busy || !draft.trim()) && styles.disabled]} disabled={busy || !draft.trim()} onPress={ask}><Text style={styles.sendText}>Send</Text></Pressable></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, context: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }, contextLabel: { color: colors.secondaryText, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, contextTitle: { color: colors.text, fontWeight: '700', marginTop: spacing.xs }, messages: { padding: spacing.lg, paddingBottom: spacing.xl }, bubble: { maxWidth: '86%', borderRadius: radius.panel, padding: spacing.md, marginBottom: spacing.sm }, talaBubble: { alignSelf: 'flex-start', backgroundColor: '#e9eef1' }, studentBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary }, talaText: { color: colors.text, lineHeight: 20 }, studentText: { color: '#fff', lineHeight: 20 }, thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }, input: { flex: 1, minHeight: 46, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, backgroundColor: '#fff' }, send: { minHeight: 46, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.primary }, sendText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: .5 } });
