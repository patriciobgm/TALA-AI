import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/constants/tokens';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  return <Redirect href={!user ? '/login' : user.must_change_password || user.privacy_acknowledgment_required ? '/onboarding' : '/(tabs)'} />;
}
