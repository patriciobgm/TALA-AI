import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/constants/tokens';

export default function RootLayout() {
  return <AuthProvider><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}><Stack.Screen name="index" options={{ headerShown: false }} /><Stack.Screen name="login" options={{ headerShown: false }} /><Stack.Screen name="forgot-password" options={{ title: 'Password reset' }} /><Stack.Screen name="(tabs)" options={{ headerShown: false }} /><Stack.Screen name="activity/[id]" options={{ title: 'Recovery activity', headerBackTitle: 'Plan' }} /><Stack.Screen name="chat/[planId]" options={{ title: 'Ask TALA', headerBackTitle: 'Activity' }} /><Stack.Screen name="assessment/[id]" options={{ title: 'Assessment', headerBackTitle: 'Assessments' }} /></Stack></AuthProvider>;
}
