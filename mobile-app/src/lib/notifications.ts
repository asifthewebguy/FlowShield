import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FlowShield',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0ea5e9',
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Register token with our API
  try {
    await api.registerPushToken(token);
  } catch {
    console.warn('Failed to register push token with API');
  }

  return token;
}

export async function scheduleSessionReminder(minutesBefore: number, sessionEndTime: Date) {
  const triggerTime = new Date(sessionEndTime.getTime() - minutesBefore * 60 * 1000);
  const secondsUntilTrigger = Math.max(1, (triggerTime.getTime() - Date.now()) / 1000);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Focus Session',
      body: `${minutesBefore} minutes remaining in your session!`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.round(secondsUntilTrigger),
    },
  });
}

export async function scheduleSessionComplete() {
  // Immediate notification — used when timer hits zero while app is backgrounded
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Session Complete!',
      body: 'Great work! Time for a well-deserved break.',
      sound: true,
    },
    trigger: null, // immediate
  });
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
