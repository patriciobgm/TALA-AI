import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/constants/tokens';
import { api } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    Keyboard.dismiss();
    setBusy(true); setError('');
    try { const result = await api<{ detail: string }>('/auth/password-reset/', { method: 'POST', body: JSON.stringify({ email: email.trim() }) }, false); setMessage(result.detail); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to request a reset link.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.layout}><View style={styles.card}><Text style={styles.title}>Reset your password</Text><Text style={styles.description}>Enter your school email. If it matches an active account, we’ll send a single-use reset link.</Text>{message ? <Text style={styles.success}>{message}</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={styles.label}>School email</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /><Pressable style={[styles.primary, (busy || !email.trim()) && styles.disabled]} disabled={busy || !email.trim()} onPress={submit}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send reset link</Text>}</Pressable><Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>Back to sign in</Text></Pressable></View></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, layout: { flex: 1, justifyContent: 'center', padding: spacing.xl }, card: { padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel }, title: { color: colors.text, fontSize: 24, fontWeight: '800' }, description: { color: colors.secondaryText, lineHeight: 20, marginTop: spacing.sm, marginBottom: spacing.xl }, label: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: spacing.lg, backgroundColor: '#fff', marginBottom: spacing.lg }, primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.primary }, primaryText: { color: '#fff', fontWeight: '700' }, back: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm }, backText: { color: colors.primary, fontWeight: '700' }, success: { color: colors.success, backgroundColor: '#edf8f2', padding: spacing.md, borderRadius: radius.control, marginBottom: spacing.lg }, error: { color: colors.error, backgroundColor: '#fef3f2', padding: spacing.md, borderRadius: radius.control, marginBottom: spacing.lg }, disabled: { opacity: .5 } });
