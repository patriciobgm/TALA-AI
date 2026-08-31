import { useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { colors, radius, spacing } from '@/constants/tokens';

type Message = { role: 'student' | 'tala'; text: string };
const actions = [{ label: 'Explain', value: 'explain' }, { label: 'Hint', value: 'hint' }, { label: 'Simpler', value: 'simplify' }, { label: 'Check me', value: 'check' }];

export default function LearningQuizTalaScreen() {
  const params = useLocalSearchParams<{ assignmentId: string; questionId?: string; title?: string; prompt?: string; selectedAnswer?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Message[]>([{ role: 'tala', text: `I can explain the concept behind this learning-quiz question or give a hint. I will not reveal the answer.\n\n${params.prompt ?? ''}` }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async (action = 'explain', supplied?: string) => {
    const message = (supplied ?? draft).trim(); if (!message) return;
    setDraft(''); setBusy(true); setMessages(current => [...current, { role: 'student', text: message }]);
    try { const result = await api<{ answer: string }>(`/tutor/learning-assignments/${Number(params.assignmentId)}/messages/`, { method: 'POST', body: JSON.stringify({ message, action, question_id: Number(params.questionId) || undefined, selected_answer: params.selectedAnswer || undefined }) }); setMessages(current => [...current, { role: 'tala', text: result.answer }]); }
    catch { setMessages(current => [...current, { role: 'tala', text: 'Ask TALA is unavailable right now. Continue reviewing the material and try again later.' }]); }
    finally { setBusy(false); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); }
  };
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}><View style={styles.context}><Text style={styles.label}>Learning quiz</Text><Text numberOfLines={1} style={styles.title}>{params.title}</Text></View><ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>{messages.map((item, index) => <View key={index} style={[styles.bubble, item.role === 'student' ? styles.student : styles.tala]}><Text style={item.role === 'student' ? styles.studentText : styles.talaText}>{item.text}</Text></View>)}{busy && <View style={[styles.bubble, styles.tala, styles.thinking]}><ActivityIndicator color={colors.primary} /><Text style={styles.talaText}>Reviewing the approved material…</Text></View>}</ScrollView><View style={styles.actions}>{actions.map(item => <Pressable key={item.value} disabled={busy} onPress={() => void ask(item.value, item.label)} style={styles.action}><Text style={styles.actionText}>{item.label}</Text></Pressable>)}</View><View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} multiline placeholder="Ask for help with this question" style={styles.input} /><Pressable disabled={busy || !draft.trim()} onPress={() => void ask()} style={[styles.send, (busy || !draft.trim()) && styles.disabled]}><Text style={styles.sendText}>Send</Text></Pressable></View></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, context: { padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }, label: { color: colors.secondaryText, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, title: { color: colors.text, fontWeight: '700', marginTop: spacing.xs }, messages: { padding: spacing.lg }, bubble: { maxWidth: '88%', padding: spacing.md, borderRadius: radius.panel, marginBottom: spacing.sm }, tala: { alignSelf: 'flex-start', backgroundColor: '#e9eef1' }, student: { alignSelf: 'flex-end', backgroundColor: colors.primary }, talaText: { color: colors.text, lineHeight: 20 }, studentText: { color: '#fff', lineHeight: 20 }, thinking: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, actions: { flexDirection: 'row', gap: spacing.xs, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }, action: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.control, padding: spacing.sm }, actionText: { color: colors.primary, fontSize: 12, fontWeight: '700' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface }, input: { flex: 1, minHeight: 46, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, padding: spacing.md, color: colors.text }, send: { minHeight: 46, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.control, backgroundColor: colors.primary }, sendText: { color: '#fff', fontWeight: '700' }, disabled: { opacity: .45 } });
