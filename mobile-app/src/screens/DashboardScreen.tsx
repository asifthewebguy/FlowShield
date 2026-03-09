import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, fontSize } from '../lib/theme';
import { api, AnalyticsSummary } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [peakTime, setPeakTime] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getAnalytics('week');
      setSummary(data.summary);
      setPeakTime(data.peakTimes?.peakPeriod || '');
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const focusHours = summary ? Math.floor(summary.totalFocusMinutes / 60) : 0;
  const focusMins = summary ? summary.totalFocusMinutes % 60 : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <View>
          <Text style={styles.hello}>Hello, {user?.name || 'there'}!</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats Grid */}
      <Text style={styles.sectionTitle}>This Week</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{summary?.totalSessions ?? '-'}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {summary?.completedSessions ?? '-'}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {focusHours}h {focusMins}m
          </Text>
          <Text style={styles.statLabel}>Focus Time</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.warning }]}>
            {summary?.averageProductivityScore ?? '-'}
          </Text>
          <Text style={styles.statLabel}>Productivity</Text>
        </View>
      </View>

      {/* Completion Rate */}
      {summary && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Completion Rate</Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(summary.completionRate, 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>{summary.completionRate}%</Text>
        </View>
      )}

      {/* Peak Time */}
      {peakTime ? (
        <View style={[styles.card, styles.peakCard]}>
          <Text style={styles.peakLabel}>Peak Productivity Time</Text>
          <Text style={styles.peakValue}>{peakTime}</Text>
          <Text style={styles.peakHint}>Schedule important work during this time!</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  greeting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  hello: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  date: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  logoutBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  logoutText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    width: '48%',
    flexGrow: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  peakCard: {
    backgroundColor: colors.primary,
  },
  peakLabel: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)' },
  peakValue: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: '#fff',
    marginVertical: spacing.xs,
  },
  peakHint: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.7)' },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  retryText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.sm },
});
