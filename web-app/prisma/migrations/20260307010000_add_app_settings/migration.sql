-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default settings
INSERT INTO "app_settings" ("key", "value", "updatedAt") VALUES
  ('payment.lemonsqueezy.enabled', 'false', NOW()),
  ('payment.bkash.enabled',        'false', NOW()),
  ('email.welcome.enabled',        'true',  NOW()),
  ('email.welcome.subject',        '"Welcome to FlowShield!"', NOW()),
  ('email.welcome.body',           '"<h1>Welcome to FlowShield, {{name}}!</h1><p>Start your first focus session today.</p><p><a href=\"{{appUrl}}/dashboard\">Go to Dashboard →</a></p>"', NOW()),
  ('email.verification.enabled',   'true',  NOW()),
  ('email.verification.subject',   '"Verify your email - FlowShield"', NOW()),
  ('email.digest.enabled',         'true',  NOW()),
  ('email.digest.subject',         '"Your FlowShield Weekly Summary"', NOW()),
  ('email.digest.body',            '"<h1>Hi {{name}}!</h1><p>Sessions this week: {{sessionCount}}</p><p>Total focus time: {{totalTime}}</p><p><a href=\"{{appUrl}}/analytics\">View full analytics →</a></p>"', NOW());
