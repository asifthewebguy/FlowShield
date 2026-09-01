-- Add source field to activity_logs (desktop | browser | mobile)
ALTER TABLE "activity_logs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'desktop';
