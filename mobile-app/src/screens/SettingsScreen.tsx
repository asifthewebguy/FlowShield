import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { colors, spacing, fontSize } from '../lib/theme';

export default function SettingsScreen() {
  const [sessionReminders, setSessionReminders] = useState(true);
  const [completionAlerts, setCompletionAlerts] = useState(true);

  const handleNotificationToggle = async (
    key: 'reminders' | 'completion',
    value: boolean
  ) => {
    if (value) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in Settings to receive reminders.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
    }
    if (key === 'reminders') setSessionReminders(value);
    if (key === 'completion') setCompletionAlerts(value);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Notifications */}
      <Text style={styles.sectionHeader}>Notifications</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Session Reminders</Text>
            <Text style={styles.settingDesc}>
              Get notified 5 minutes before your session ends
            </Text>
          </View>
          <Switch
            value={sessionReminders}
            onValueChange={(v) => handleNotificationToggle('reminders', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Completion Alerts</Text>
            <Text style={styles.settingDesc}>
              Get notified when your focus session is complete
            </Text>
          </View>
          <Switch
            value={completionAlerts}
            onValueChange={(v) => handleNotificationToggle('completion', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Focus preferences */}
      <Text style={styles.sectionHeader}>Focus</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Track Phone Usage</Text>
            <Text style={styles.settingDesc}>
              Record when you leave FlowShield during sessions
            </Text>
          </View>
          <Switch
            value={true}
            disabled
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
        <TouchableOpacity
          style={[styles.settingRow, { borderBottomWidth: 0 }]}
          onPress={() =>
            Alert.alert(
              'Default Duration',
              'Change your default session duration on the Focus Timer screen.'
            )
          }
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Default Duration</Text>
            <Text style={styles.settingDesc}>Set in Focus Timer screen</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.sectionHeader}>About</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => Linking.openURL('https://flowshield.app/privacy')}
        >
          <Text style={styles.settingTitle}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.settingRow, { borderBottomWidth: 0 }]}
          onPress={() => Linking.openURL('https://flowshield.app')}
        >
          <Text style={styles.settingTitle}>FlowShield Website</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>FlowShield v1.9.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingInfo: { flex: 1, paddingRight: spacing.md },
  settingTitle: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  settingDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
  },
  footer: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
