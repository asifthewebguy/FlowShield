import type { Session } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { classifySessionProject } from '@/lib/project-classifier';

/**
 * If the session has no `projectId`, run the activity-based classifier and
 * persist the guessed project. Returns the (possibly updated) session.
 *
 * Used by both `PATCH /api/sessions/[id]` and `POST /api/sessions/[id]/auto-end`
 * so the auto-classification logic stays in one place.
 *
 * Errors are swallowed and logged — auto-classify is best-effort and must
 * never break the session-completion path.
 */
export async function autoClassifyIfNeeded(
  sessionId: string,
  userId: string,
  current: Session
): Promise<Session> {
  if (current.projectId) return current;

  try {
    const guessed = await classifySessionProject(sessionId, userId);
    if (guessed) {
      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: { projectId: guessed },
      });
      logger.info(`Session ${sessionId} auto-classified to project ${guessed}`);
      return updated;
    }
  } catch (err) {
    logger.warn('Project auto-classify failed', err);
  }
  return current;
}

/**
 * Compute a running weighted average. Returns `newScore` when there's no
 * prior data, otherwise the average across `oldCount + 1` data points.
 *
 * Used to update `DailyStats.avgProductivityScore` in a way that actually
 * reflects every completed session, not just the latest one (closes the
 * `// Simplified: just taking latest` TODO in the session PATCH route).
 */
export function nextWeightedAverage(
  oldAverage: number | null | undefined,
  oldCount: number,
  newScore: number
): number {
  if (!oldCount || oldAverage == null) return Math.round(newScore);
  return Math.round((oldAverage * oldCount + newScore) / (oldCount + 1));
}
