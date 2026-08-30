import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Image, Text, type ColorValue } from 'react-native';
import { useAuth } from '@/lib/auth';
import { registerPushDevice } from '@/lib/push';
import { colors } from '@/constants/tokens';
import { StudentScopeProvider } from '@/lib/student-scope';
import { StudentSubjectSwitcher } from '@/components/StudentSubjectSwitcher';

const icon = (name: SymbolViewProps['name'], fallback: string, color: ColorValue, focused: boolean) => <SymbolView name={name} fallback={<Text style={{ color, fontSize: 16, fontWeight: '700' }}>{fallback}</Text>} tintColor={color} size={22} weight={focused ? 'semibold' : 'regular'} />;

export default function StudentTabs() {
  const { user } = useAuth();
  useEffect(() => { if (user) void registerPushDevice().catch(error => console.warn('Push registration failed. The rest of the app remains available.', error)); }, [user]);
  if (!user) return <Redirect href="/login" />;
  return <StudentScopeProvider><Tabs screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerShadowVisible: false, headerTitleStyle: { color: colors.text, fontWeight: '700' }, headerLeft: () => <Image source={require('../../../assets/images/school_logo.png')} accessibilityLabel="Talavera Senior High School" style={{ width: 30, height: 30, resizeMode: 'contain', marginLeft: 16 }} />, headerRight: () => <StudentSubjectSwitcher />, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.secondaryText, tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 }, tabBarItemStyle: { paddingTop: 7, paddingBottom: 5 }, tabBarStyle: { minHeight: 68, borderTopColor: colors.border, backgroundColor: colors.surface }, tabBarHideOnKeyboard: true }}><Tabs.Screen name="index" options={{ title: 'My Progress', tabBarLabel: 'Progress', tabBarAccessibilityLabel: 'My progress', tabBarIcon: ({ color, focused }) => icon('chart.bar', 'P', color, focused) }} /><Tabs.Screen name="recovery" options={{ title: 'Recovery Plan', tabBarLabel: 'Recovery', tabBarAccessibilityLabel: 'Recovery plan', tabBarIcon: ({ color, focused }) => icon('book.closed', 'R', color, focused) }} /><Tabs.Screen name="materials" options={{ title: 'Learning Materials', tabBarLabel: 'Materials', tabBarAccessibilityLabel: 'Assigned learning materials', tabBarIcon: ({ color, focused }) => icon('books.vertical', 'M', color, focused) }} /><Tabs.Screen name="assessments" options={{ title: 'Assessments', tabBarLabel: 'Assessments', tabBarAccessibilityLabel: 'Assessments', tabBarIcon: ({ color, focused }) => icon('checklist', 'A', color, focused) }} /><Tabs.Screen name="notifications" options={{ title: 'Notifications', tabBarLabel: 'Updates', tabBarAccessibilityLabel: 'Notifications and updates', tabBarIcon: ({ color, focused }) => icon('bell', 'N', color, focused) }} /></Tabs></StudentScopeProvider>;
}
