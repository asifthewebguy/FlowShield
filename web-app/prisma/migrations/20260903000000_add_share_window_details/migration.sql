-- Add per-user privacy switch: when false, window titles and URLs are
-- redacted before storage (desktop strips on upload, server strips on receipt).
ALTER TABLE "user_preferences" ADD COLUMN "shareWindowDetails" BOOLEAN NOT NULL DEFAULT true;
