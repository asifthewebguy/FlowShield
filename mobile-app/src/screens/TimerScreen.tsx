import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
} from 'react-native';
import { colors, spacing, fontSize } from '../lib/theme';
import { api, Session } from '../lib/api';
import { startUsageTracking, stopUsageTracking } from '../lib/usageTracker';

type SessionType = 'WORK' | 'STUDY' | 'CREATIVE';
type TimerState = 'idle' | 'running' | 'paused' | 'break';

const DURATIONS = [15, 25, 45, 60];

export default function TimerScreen() {
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [sessionType, setSessionType] = useState<SessionType>('WORK');
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [session, setSession] = useState<Session | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (timerState === 'running' || timerState === 'break') {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearTimer();
            if (timerState === 'running') {
              handleSessionComplete();
            } else {
              setTimerState('idle');
            }
            Vibration.vibrate([0, 500, 200, 500]);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [timerState]);

  const handleStart = async () => {
    try {
      const s = await api.startSession(plannedMinutes, sessionType);
      setSession(s);
      setSecondsLeft(plannedMinutes * 60);
      startTimeRef.current = new Date();
      startUsageTracking(s.id);
      setTimerState('running');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handlePause = () => {
    setTimerState('paused');
  };

  const handleResume = () => {
    setTimerState('running');
  };

  const handleSessionComplete = async () => {
    if (!session) return;
    stopUsageTracking();
    try {
      await api.endSession(session.id, plannedMinutes);
      // Suggest break for sessions >= 15 min
      if (plannedMinutes >= 15) {
        const brkMin = plannedMinutes >= 45 ? 15 : plannedMinutes >= 25 ? 10 : 5;
        setBreakMinutes(brkMin);
        setSecondsLeft(brkMin * 60);
        setTimerState('break');
      } else {
        setTimerState('idle');
      }
    } catch {
      setTimerState('idle');
    }
    setSession(null);
  };

  const handleCancel = () => {
    Alert.alert('Cancel Session', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          clearTimer();
          stopUsageTracking();
          if (session) {
            try {
              await api.cancelSession(session.id);
            } catch { /* ignore */ }
          }
          setSession(null);
          setTimerState('idle');
          setSecondsLeft(plannedMinutes * 60);
        },
      },
    ]);
  };

  const handleSkipBreak = () => {
    clearTimer();
    setTimerState('idle');
    setSecondsLeft(plannedMinutes * 60);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = timerState === 'break'
    ? 1 - secondsLeft / (breakMinutes * 60)
    : timerState !== 'idle'
    ? 1 - secondsLeft / (plannedMinutes * 60)
    : 0;

  const typeLabels: Record<SessionType, string> = {
    WORK: 'Work',
    STUDY: 'Study',
    CREATIVE: 'Creative',
  };

  return (
    <View style={styles.container}>
      {/* Session type selector (only when idle) */}
      {timerState === 'idle' && (
        <View style={styles.typeRow}>
          {(['WORK', 'STUDY', 'CREATIVE'] as SessionType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, sessionType === t && styles.typeBtnActive]}
              onPress={() => setSessionType(t)}
            >
              <Text style={[styles.typeText, sessionType === t && styles.typeTextActive]}>
                {typeLabels[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Timer display */}
      <View style={styles.timerContainer}>
        {/* Circular progress */}
        <View style={styles.timerRing}>
          <View style={[styles.timerRingFill, { transform: [{ rotate: `${progress * 360}deg` }] }]} />
          <View style={styles.timerInner}>
            <Text style={styles.timerText}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </Text>
            {timerState === 'break' ? (
              <Text style={styles.timerLabel}>Break Time</Text>
            ) : timerState !== 'idle' ? (
              <Text style={styles.timerLabel}>{typeLabels[sessionType]} Session</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Duration selector (only when idle) */}
      {timerState === 'idle' && (
        <View style={styles.durationRow}>
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.durBtn, plannedMinutes === d && styles.durBtnActive]}
              onPress={() => {
                setPlannedMinutes(d);
                setSecondsLeft(d * 60);
              }}
            >
              <Text style={[styles.durText, plannedMinutes === d && styles.durTextActive]}>
                {d}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        {timerState === 'idle' && (
          <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
            <Text style={styles.startBtnText}>Start Focus</Text>
          </TouchableOpacity>
        )}

        {timerState === 'running' && (
          <View style={styles.runningActions}>
            <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
              <Text style={styles.actionBtnText}>Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {timerState === 'paused' && (
          <View style={styles.runningActions}>
            <TouchableOpacity style={styles.startBtn} onPress={handleResume}>
              <Text style={styles.startBtnText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {timerState === 'break' && (
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkipBreak}>
            <Text style={styles.actionBtnText}>Skip Break</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  typeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  typeTextActive: { color: '#fff' },
  timerContainer: {
    marginBottom: spacing.xl,
  },
  timerRing: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 6,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  timerRingFill: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 6,
    borderColor: colors.primary,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  timerInner: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: fontSize.timer,
    fontWeight: '200',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  durationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  durBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  durBtnActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  durText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  durTextActive: { color: '#fff' },
  actions: {
    width: '100%',
    alignItems: 'center',
  },
  startBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl * 2,
    paddingVertical: spacing.md,
    borderRadius: 30,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startBtnText: { color: '#fff', fontSize: fontSize.lg, fontWeight: '700' },
  runningActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pauseBtn: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 30,
  },
  cancelBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  cancelBtnText: { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
  actionBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: '700' },
  skipBtn: {
    backgroundColor: colors.textSecondary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 30,
  },
});
