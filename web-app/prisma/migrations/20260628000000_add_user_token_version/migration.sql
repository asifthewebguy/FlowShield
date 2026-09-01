-- Add tokenVersion for JWT revocation. Existing rows default to 0;
-- tokens minted before this column carry no `tv` claim, treated as 0, so
-- they remain valid until expiry. Incrementing this column (on password
-- change/reset) invalidates all prior tokens for that user.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
