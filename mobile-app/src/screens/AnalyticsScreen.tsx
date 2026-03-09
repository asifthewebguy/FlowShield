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
import { api, DailyStat } from '../lib/api';

type Period = 'week' | 'month';

export default function AnalyticsScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [distractionMinutes, setDistractionMinutes] = useState<number | null>(null);
  const [distractionPct, setDistractionPct] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const analytics = await api.getAnalytics(period);
      setDailyStats(analytics.dailyStats || []);
      setDistractionMinutes(null);
      setDistractionPct(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Find max for bar chart scaling
  const maxMinutes = Math.max(...dailyStats.map((d) => d.totalMinutes), 1);

  const totalMinutes = dailyStats.reduce((sum, d) => sum + d.totalMinutes, 0);
  const avgScore =
    dailyStats.length > 0
      ? Math.round(dailyStats.reduce((sum, d) => sum + d.productivityScore, 0) / dailyStats.length)
      : 0;
  const activeDays = dailyStats.filter((d) => d.totalMinutes > 0).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Period selector */}
      <View style={styles.periodRow}>
        {(['week', 'month'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {p === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
          </Text>
          <Text style={styles.statLabel}>Total Focus</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>{avgScore || '-'}</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.warning }]}>{activeDays}</Text>
          <Text style={styles.statLabel}>Active Days</Text>
        </View>
      </View>

      {/* Bar chart — daily focus minutes */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Focus Time</Text>
        {dailyStats.length === 0 ? (
          <Text style={styles.emptyText}>No data yet</Text>
        ) : (
          <View style={styles.chartArea}>
            {dailyStats.map((d, i) => {
              const barHeight = Math.max(4, (d.totalMinutes / maxMinutes) * 100);
              const label = new Date(d.date).toLocaleDateString('en-US', {
                weekday: 'short',
              });
              return (
                <View key={i} style={styles.barGroup}>
                  <View style={styles.barWrapper}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor:
                            d.totalMinutes > 0 ? colors.primary : colors.border,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Productivity score bars */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Productivity by Day</Text>
        {dailyStats.filter((d) => d.productivityScore > 0).length === 0 ? (
          <Text style={styles.emptyText}>No sessions completed yet</Text>
        ) : (
          dailyStats
            .filter((d) => d.productivityScore > 0)
            .map((d, i) => {
              const label = new Date(d.date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              return (
                <View key={i} style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>{label}</Text>
                  <View style={styles.scoreBarTrack}>
                    <View
                      style={[
                        styles.scoreBarFill,
                        { width: `${d.productivityScore}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.scoreValue}>{d.productivityScore}</Text>
                </View>
              );
            })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  periodTextActive: { color: '#fff' },
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
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
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
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    paddingBottom: spacing.sm,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barWrapper: {
    width: '60%',
    height: 100,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  scoreLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    width: 70,
  },
  scoreBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  scoreValue: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: '600',
    width: 28,
    textAlign: 'right',
  },
});
