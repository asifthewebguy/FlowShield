import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

function getPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date();

  if (period === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { start, end };
  }

  if (period === "all") {
    return { start: new Date("2020-01-01"), end: now };
  }

  // default: month (current calendar month)
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now };
}

export async function GET(request: NextRequest) {
  const userId = getUserIdFromToken(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "month";
  const { start, end } = getPeriodRange(period);

  try {
    const projects = await prisma.project.findMany({
      where: { userId },
      include: {
        sessions: {
          where: {
            completed: true,
            startTime: { gte: start, lte: end },
          },
          select: { actualDuration: true },
        },
      },
    });

    let totalEarned = 0;
    let totalHours = 0;
    let projectCount = 0;

    const projectData = projects.map((p) => {
      const hourlyRate = p.hourlyRate ? Number(p.hourlyRate) : null;
      const budget = p.budget ? Number(p.budget) : null;
      const plannedHours = p.plannedHours ?? null;

      const rawMinutes = p.sessions.reduce(
        (sum, s) => sum + (s.actualDuration ?? 0),
        0
      );
      const actualHours = Math.round((rawMinutes / 60) * 10) / 10;

      const earned =
        hourlyRate !== null
          ? Math.round(actualHours * hourlyRate * 100) / 100
          : null;

      const budgetPercent =
        earned !== null && budget !== null
          ? Math.round((earned / budget) * 100)
          : null;

      const isOverBudget =
        earned !== null && budget !== null && earned > budget;

      const isOverHours =
        plannedHours !== null && actualHours > plannedHours;

      if (actualHours > 0) {
        projectCount += 1;
        totalHours += actualHours;
        if (earned !== null) totalEarned += earned;
      }

      return {
        id: p.id,
        name: p.name,
        color: p.color,
        hourlyRate,
        budget,
        plannedHours,
        actualHours,
        earned,
        budgetPercent,
        isOverBudget,
        isOverHours,
      };
    });

    totalHours = Math.round(totalHours * 10) / 10;
    totalEarned = Math.round(totalEarned * 100) / 100;

    return NextResponse.json({
      summary: {
        totalEarned,
        totalHours,
        projectCount,
      },
      projects: projectData,
    });
  } catch (error) {
    logger.error("Failed to fetch project cost analysis", { error, userId });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
