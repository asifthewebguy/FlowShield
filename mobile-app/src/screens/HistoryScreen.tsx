import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { colors, spacing, fontSize } from '../lib/theme';
import { api, Session } from '../lib/api';

const typeIcons: Record<string, string> = {
  WORK: '💼',
  STUDY: '📚',
  CREATIVE: '🎨',
};

function SessionCard({ session }: { session: Session }) {
  const start = new Date(session.startTime);
  const dateStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timeStr = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const duration = session.actualDuration || session.plannedDuration;

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.icon}>{typeIcons[session.sessionType] || '⏱️'}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>
            {session.sessionType.charAt(0) + session.sessionType.slice(1).toLowerCase()} Session
          </Text>
          <Text style={styles.cardMeta}>
            {dateStr} at {timeStr}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.duration}>{duration}m</Text>
          <View style={[
            styles.badge,
            session.completed ? styles.badgeSuccess : styles.badgeDanger,
          ]}>
            <Text style={styles.badgeText}>
              {session.completed ? 'Done' : 'Cancelled'}
            </Text>
          </View>
        </View>
      </View>

      {session.productivityScore != null && (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Productivity</Text>
          <View style={styles.scoreBar}>
            <View
              style={[
                styles.scoreFill,
                {
                  width: `${session.productivityScore}%`,
                  backgroundColor:
                    session.productivityScore >= 70 ? colors.success :
                    session.productivityScore >= 40 ? colors.warning : colors.danger,
                },
              ]}
            />
          </View>
          <Text style={styles.scoreValue}>{session.productivityScore}</Text>
        </View>
      )}
    </View>
  );
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api.getSessions(50);
      setSessions(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  }, [fetchSessions]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Loading sessions...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={sessions.length === 0 ? styles.center : styles.list}
      data={sessions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SessionCard session={item} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⏱️</Text>
          <Text style={styles.emptyText}>No sessions yet</Text>
          <Text style={styles.emptyHint}>Start a focus session from the Timer tab!</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: { fontSize: 28, marginRight: spacing.sm },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  cardMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  duration: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  badge: {
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeSuccess: { backgroundColor: '#d1fae5' },
  badgeDanger: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scoreLabel: { fontSize: fontSize.xs, color: colors.textSecondary, width: 80 },
  scoreBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreValue: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text, width: 24, textAlign: 'right' },
  empty: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary, fontWeight: '600' },
  emptyHint: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
});
