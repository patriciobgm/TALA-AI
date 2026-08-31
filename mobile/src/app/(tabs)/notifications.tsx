import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/types';
import { colors, radius, spacing } from '@/constants/tokens';

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api<AppNotification[] | { results?: AppNotification[] }>('/notifications/').then(result => setItems(Array.isArray(result) ? result : result.results ?? [])).catch(reason => setError(reason.message)); }, []);
  useFocusEffect(load);
  if (!items && !error) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  const open = async (item: AppNotification) => {
    if (!item.is_read) {
      await api(`/notifications/${item.id}/read/`, { method: 'POST' });
      setItems(current => current?.map(found => found.id === item.id ? { ...found, is_read: true } : found) ?? []);
    }
    if (item.action_url.includes('materials')) router.push('/(tabs)/materials');
    else if (item.action_url.includes('assessment')) router.push('/(tabs)/assessments');
    else if (item.action_url.includes('recovery') || item.action_url.includes('resource')) router.push('/(tabs)/recovery');
  };
  const markAll = async () => { await api('/notifications/read-all/', { method: 'POST' }); setItems(current => current?.map(item => ({ ...item, is_read: true })) ?? []); };
  const dismiss = async (id: number) => { await api(`/notifications/${id}/dismiss/`, { method: 'DELETE' }); setItems(current => current?.filter(item => item.id !== id) ?? []); };
  const clearRead = async () => { const read = items?.filter(item => item.is_read) ?? []; await Promise.all(read.map(item => api(`/notifications/${item.id}/dismiss/`, { method: 'DELETE' }))); setItems(current => current?.filter(item => !item.is_read) ?? []); };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><View style={styles.heading}><Text style={styles.description}>Assigned work, progress updates, and activity reminders.</Text><View style={styles.headingActions}><Pressable disabled={!items?.some(item => !item.is_read)} onPress={markAll}><Text style={styles.link}>Mark all read</Text></Pressable><Pressable disabled={!items?.some(item => item.is_read)} onPress={clearRead}><Text style={styles.link}>Clear read</Text></Pressable></View></View>{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.list}>{items?.map(item => <Pressable key={item.id} onPress={() => void open(item)} style={({ pressed }) => [styles.row, !item.is_read && styles.unread, pressed && styles.pressed]}><View style={[styles.dot, item.is_read && styles.readDot]} /><View style={styles.rowText}><Text style={[styles.title, !item.is_read && styles.unreadTitle]}>{item.title}</Text><Text style={styles.message}>{item.message}</Text><Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${item.title}`} hitSlop={10} onPress={event => { event.stopPropagation(); void dismiss(item.id); }} style={styles.dismiss}><Text style={styles.dismissText}>×</Text></Pressable></Pressable>)}</View>{!items?.length && <Text style={styles.empty}>No notifications yet.</Text>}</ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xl }, headingActions: { alignItems: 'flex-end', gap: spacing.sm }, description: { flex: 1, color: colors.secondaryText, lineHeight: 20 }, link: { color: colors.primary, fontWeight: '700' }, list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel, overflow: 'hidden' }, row: { flexDirection: 'row', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, unread: { backgroundColor: colors.primarySoft }, pressed: { opacity: .75 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6, marginRight: spacing.md }, readDot: { backgroundColor: 'transparent' }, rowText: { flex: 1 }, dismiss: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 }, dismissText: { color: colors.secondaryText, fontSize: 24 }, title: { color: colors.text, fontWeight: '600' }, unreadTitle: { fontWeight: '800' }, message: { color: colors.secondaryText, lineHeight: 19, marginTop: spacing.xs }, meta: { color: colors.secondaryText, fontSize: 11, marginTop: spacing.sm }, empty: { color: colors.secondaryText, textAlign: 'center', marginTop: spacing.xl }, error: { color: colors.error, marginBottom: spacing.lg } });
