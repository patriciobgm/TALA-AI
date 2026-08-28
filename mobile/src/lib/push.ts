import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }) });

export async function registerPushDevice() {
  if (!Device.isDevice) return { status: 'physical_device_required' } as const;
  if (Constants.appOwnership === 'expo') return { status: 'development_build_required' } as const;
  const permission = await Notifications.getPermissionsAsync();
  const finalPermission = permission.status === 'granted' ? permission : await Notifications.requestPermissionsAsync();
  if (finalPermission.status !== 'granted') return { status: 'permission_denied' } as const;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('reminders', { name: 'Recovery reminders', importance: Notifications.AndroidImportance.DEFAULT });
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { status: 'project_not_configured' } as const;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api('/devices/', { method: 'POST', body: JSON.stringify({ platform: Platform.OS, push_token: token, is_active: true }) });
  return { status: 'registered' } as const;
}
