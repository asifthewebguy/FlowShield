-- CreateTable
CREATE TABLE "category_rules" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchField" TEXT NOT NULL DEFAULT 'processName',
    "category" TEXT NOT NULL,
    "isProductive" BOOLEAN NOT NULL DEFAULT false,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_rules_userId_idx" ON "category_rules"("userId");

-- CreateIndex
CREATE INDEX "category_rules_isGlobal_priority_idx" ON "category_rules"("isGlobal", "priority");

-- AddForeignKey
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default global rules
INSERT INTO "category_rules" ("id", "keyword", "matchField", "category", "isProductive", "isGlobal", "priority", "updatedAt") VALUES
-- Development tools (high priority)
(gen_random_uuid(), 'code', 'processName', 'Development', true, true, 100, NOW()),
(gen_random_uuid(), 'studio', 'processName', 'Development', true, true, 100, NOW()),
(gen_random_uuid(), 'rider', 'processName', 'Development', true, true, 100, NOW()),
(gen_random_uuid(), 'eclipse', 'processName', 'Development', true, true, 100, NOW()),
(gen_random_uuid(), 'intellij', 'processName', 'Development', true, true, 100, NOW()),
(gen_random_uuid(), 'webstorm', 'processName', 'Development', true, true, 100, NOW()),
(gen_random_uuid(), 'github', 'windowTitle', 'Development', true, true, 90, NOW()),
(gen_random_uuid(), 'stackoverflow', 'windowTitle', 'Development', true, true, 90, NOW()),
(gen_random_uuid(), 'docs.', 'windowTitle', 'Development', true, true, 80, NOW()),
(gen_random_uuid(), 'documentation', 'windowTitle', 'Development', true, true, 80, NOW()),
-- Work / Productivity tools
(gen_random_uuid(), 'excel', 'processName', 'Work', true, true, 100, NOW()),
(gen_random_uuid(), 'word', 'processName', 'Work', true, true, 100, NOW()),
(gen_random_uuid(), 'powerpoint', 'processName', 'Work', true, true, 100, NOW()),
(gen_random_uuid(), 'powerpnt', 'processName', 'Work', true, true, 100, NOW()),
(gen_random_uuid(), 'notion', 'processName', 'Work', true, true, 100, NOW()),
(gen_random_uuid(), 'onenote', 'processName', 'Work', true, true, 100, NOW()),
(gen_random_uuid(), 'evernote', 'processName', 'Work', true, true, 100, NOW()),
-- Communication
(gen_random_uuid(), 'slack', 'processName', 'Communication', false, true, 100, NOW()),
(gen_random_uuid(), 'teams', 'processName', 'Communication', false, true, 100, NOW()),
(gen_random_uuid(), 'discord', 'processName', 'Communication', false, true, 100, NOW()),
(gen_random_uuid(), 'outlook', 'processName', 'Communication', false, true, 100, NOW()),
(gen_random_uuid(), 'thunderbird', 'processName', 'Communication', false, true, 100, NOW()),
(gen_random_uuid(), 'gmail', 'windowTitle', 'Communication', false, true, 90, NOW()),
-- Entertainment
(gen_random_uuid(), 'youtube', 'windowTitle', 'Entertainment', false, true, 90, NOW()),
(gen_random_uuid(), 'netflix', 'windowTitle', 'Entertainment', false, true, 90, NOW()),
(gen_random_uuid(), 'twitch', 'windowTitle', 'Entertainment', false, true, 90, NOW()),
(gen_random_uuid(), 'spotify', 'processName', 'Entertainment', false, true, 100, NOW()),
-- Social Media
(gen_random_uuid(), 'facebook', 'windowTitle', 'Social Media', false, true, 90, NOW()),
(gen_random_uuid(), 'twitter', 'windowTitle', 'Social Media', false, true, 90, NOW()),
(gen_random_uuid(), 'instagram', 'windowTitle', 'Social Media', false, true, 90, NOW()),
(gen_random_uuid(), 'linkedin', 'windowTitle', 'Social Media', false, true, 90, NOW()),
(gen_random_uuid(), 'reddit', 'windowTitle', 'Social Media', false, true, 90, NOW()),
(gen_random_uuid(), 'tiktok', 'windowTitle', 'Social Media', false, true, 90, NOW()),
-- Creative
(gen_random_uuid(), 'photoshop', 'processName', 'Creative', true, true, 100, NOW()),
(gen_random_uuid(), 'illustrator', 'processName', 'Creative', true, true, 100, NOW()),
(gen_random_uuid(), 'figma', 'processName', 'Creative', true, true, 100, NOW()),
(gen_random_uuid(), 'figma', 'windowTitle', 'Creative', true, true, 90, NOW()),
(gen_random_uuid(), 'blender', 'processName', 'Creative', true, true, 100, NOW()),
-- Study
(gen_random_uuid(), 'anki', 'processName', 'Study', true, true, 100, NOW()),
(gen_random_uuid(), 'coursera', 'windowTitle', 'Study', true, true, 90, NOW()),
(gen_random_uuid(), 'udemy', 'windowTitle', 'Study', true, true, 90, NOW()),
(gen_random_uuid(), 'khan academy', 'windowTitle', 'Study', true, true, 90, NOW()),
-- Browsers (low priority — catch-all for unmatched browser activity)
(gen_random_uuid(), 'chrome', 'processName', 'Browsing', false, true, 10, NOW()),
(gen_random_uuid(), 'firefox', 'processName', 'Browsing', false, true, 10, NOW()),
(gen_random_uuid(), 'msedge', 'processName', 'Browsing', false, true, 10, NOW()),
(gen_random_uuid(), 'brave', 'processName', 'Browsing', false, true, 10, NOW());
