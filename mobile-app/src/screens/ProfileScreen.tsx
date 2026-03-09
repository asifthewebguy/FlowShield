import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { colors, spacing, fontSize } from '../lib/theme';
import { api, AnalyticsSummary } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [allTimeSummary, setAllTimeSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAllTime = useCallback(async () => {
    try {
      const data = await api.getAnalytics('month');
      setAllTimeSummary(data.summary);
    } catch {
      // Non-critical — silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllTime();
  }, [fetchAllTime]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '??';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.name || 'FlowShield User'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* This month stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>This Month</Text>
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : allTimeSummary ? (
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {allTimeSummary.totalSessions}
              </Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {allTimeSummary.completedSessions}
              </Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.warning }]}>
                {Math.floor(allTimeSummary.totalFocusMinutes / 60)}h
              </Text>
              <Text style={styles.statLabel}>Focus Time</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {allTimeSummary.completionRate}%
              </Text>
              <Text style={styles.statLabel}>Completion</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.loadingText}>No data available</Text>
        )}
      </View>

      {/* App info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>About</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>1.9.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Platform</Text>
          <Text style={styles.infoValue}>Mobile (Expo)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Sync</Text>
          <Text style={[styles.infoValue, { color: colors.success }]}>Connected</Text>
        </View>
      </View>

      {/* Danger zone */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: '#fff',
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  logoutBtn: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: spacing.sm,
  },
  logoutText: { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
});
