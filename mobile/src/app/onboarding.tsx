import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/constants/tokens';

type Declaration = { policy_version: string; declaration_text: string; privacy_contact_email: string };

export default function Onboarding() {
  const { user, signOut, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (user?.privacy_acknowledgment_required && !user.must_change_password) api<Declaration>('/auth/privacy-acknowledgment/').then(setDeclaration).catch(reason => setError(reason.message)); }, [user]);
  if (!user) return <Redirect href="/login" />;
  if (!user.must_change_password && !user.privacy_acknowledgment_required) return <Redirect href="/(tabs)" />;
  const changePassword = async () => {
    Keyboard.dismiss();
    setBusy(true); setError('');
    try { await api('/auth/change-password/', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) }); await signOut(); router.replace('/login'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to change password.'); }
    finally { setBusy(false); }
  };
  const acknowledge = async () => {
    Keyboard.dismiss();
    setBusy(true); setError('');
    try { await api('/auth/privacy-acknowledgment/', { method: 'POST', body: JSON.stringify({ accepted: true }) }); await refreshUser(); router.replace('/(tabs)'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to record acknowledgment.'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><View style={styles.card}><Text style={styles.title}>{user.must_change_password ? 'Choose a new password' : 'Privacy declaration'}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}{user.must_change_password ? <><Text style={styles.description}>Your temporary password must be replaced before you can access TALA-AI.</Text><Text style={styles.label}>Current password</Text><TextInput style={styles.input} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} /><Text style={styles.label}>New password</Text><TextInput style={styles.input} secureTextEntry value={newPassword} onChangeText={setNewPassword} /><Pressable style={[styles.button, (busy || !currentPassword || newPassword.length < 8) && styles.disabled]} disabled={busy || !currentPassword || newPassword.length < 8} onPress={() => void changePassword()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Update password</Text>}</Pressable></> : !declaration ? <ActivityIndicator color={colors.primary} /> : <><Text style={styles.version}>Policy {declaration.policy_version}</Text><Text style={styles.declaration}>{declaration.declaration_text}</Text>{declaration.privacy_contact_email ? <Text style={styles.description}>Privacy contact: {declaration.privacy_contact_email}</Text> : null}<Pressable style={styles.checkRow} onPress={() => setAccepted(value => !value)}><View style={[styles.checkbox, accepted && styles.checked]}><Text style={styles.checkmark}>{accepted ? '✓' : ''}</Text></View><Text style={styles.checkLabel}>I have read and acknowledge this declaration.</Text></Pressable><Pressable style={[styles.button, (busy || !accepted) && styles.disabled]} disabled={busy || !accepted} onPress={() => void acknowledge()}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue to TALA-AI</Text>}</Pressable></>}<Pressable onPress={() => void signOut().then(() => router.replace('/login'))}><Text style={styles.signOut}>Sign out</Text></Pressable></View></ScrollView>;
}

const styles = StyleSheet.create({ screen: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.background }, card: { backgroundColor: colors.surface, borderRadius: 14, padding: 22, borderWidth: 1, borderColor: colors.border, gap: 14 }, title: { fontSize: 24, fontWeight: '800', color: colors.text }, description: { color: colors.secondaryText, lineHeight: 20 }, version: { color: colors.secondaryText, fontWeight: '600' }, declaration: { color: colors.text, lineHeight: 23, backgroundColor: colors.background, padding: 16, borderRadius: 10 }, label: { color: colors.text, fontWeight: '700', marginTop: 4 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 12, color: colors.text }, button: { minHeight: 48, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, buttonText: { color: '#fff', fontWeight: '800' }, disabled: { opacity: .5 }, error: { color: '#9f1d20', backgroundColor: '#fdecec', padding: 12, borderRadius: 8 }, checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.primary, borderColor: colors.primary }, checkmark: { color: '#fff', fontWeight: '900' }, checkLabel: { flex: 1, color: colors.text }, signOut: { textAlign: 'center', color: colors.secondaryText, padding: 8 } });
