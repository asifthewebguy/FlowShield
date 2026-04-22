import { prisma } from './prisma';

export type ActivitySnapshot = {
  applicationName: string | null;
  processName: string | null;
  url: string | null;
  windowTitle: string | null;
  durationSeconds: number;
};

export type ProjectSnapshot = {
  id: string;
  name: string;
};

/**
 * Split a project name into keyword tokens for fuzzy matching against activity
 * metadata. Short tokens (< 3 chars) are dropped because they produce too many
 * spurious hits (e.g. "UI", "QA").
 */
export function tokenizeProjectName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s\-_/\\.,|:]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Score a single activity row against a set of project tokens. Fields most
 * likely to carry project branding (windowTitle, url) are weighted highest;
 * processName is weakest since many processes are generic ("chrome.exe").
 */
export function scoreActivity(log: ActivitySnapshot, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = (log.windowTitle ?? '').toLowerCase();
  const url = (log.url ?? '').toLowerCase();
  const app = (log.applicationName ?? '').toLowerCase();
  const proc = (log.processName ?? '').toLowerCase();

  let hits = 0;
  for (const t of tokens) {
    if (title.includes(t)) hits += 3;
    if (url.includes(t)) hits += 3;
    if (app.includes(t)) hits += 2;
    if (proc.includes(t)) hits += 1;
  }
  return hits;
}

/**
 * Given a session's activity log and a user's projects, return the project id
 * with the highest weighted token-match score. Ties go to the first project in
 * iteration order. Returns null only when there is zero matching signal
 * (no projects, no activity, or no project name tokens ever matched).
 */
export function classifyFromSnapshots(
  activities: ActivitySnapshot[],
  projects: ProjectSnapshot[],
): string | null {
  if (projects.length === 0 || activities.length === 0) return null;

  let bestId: string | null = null;
  let bestScore = 0;

  for (const project of projects) {
    const tokens = tokenizeProjectName(project.name);
    if (tokens.length === 0) continue;

    let score = 0;
    for (const log of activities) {
      const hits = scoreActivity(log, tokens);
      if (hits === 0) continue;
      // Weight by duration so a 30-min match dominates a 10-second blip.
      score += hits * Math.max(log.durationSeconds, 1);
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = project.id;
    }
  }

  return bestScore > 0 ? bestId : null;
}

/**
 * Server-side classifier: loads a session's activity and user's projects,
 * then returns the best-match project id (or null). Does not write to the DB.
 */
export async function classifySessionProject(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const [activities, projects] = await Promise.all([
    prisma.activityLog.findMany({
      where: { sessionId, userId },
      select: {
        applicationName: true,
        processName: true,
        url: true,
        windowTitle: true,
        durationSeconds: true,
      },
    }),
    prisma.project.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  return classifyFromSnapshots(activities, projects);
}
