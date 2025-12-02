# FlowShield Web App - Netlify Deployment Guide

This guide will walk you through deploying the FlowShield web application to Netlify.

## Prerequisites

1. **GitHub Account** (you already have this)
2. **Netlify Account** (free) - Sign up at https://netlify.com
3. **PostgreSQL Database** (production)
4. **Domain**: flowshield.app (you already have this)

## Step 1: Set Up Production Database

You'll need a PostgreSQL database for production. Recommended options:

### Option A: Neon (Recommended - Free Tier Available)
- Website: https://neon.tech
- Free tier: 0.5 GB storage, generous compute
- Serverless PostgreSQL optimized for Next.js
- Steps:
  1. Sign up at neon.tech
  2. Create a new project called "flowshield"
  3. Copy the connection string (starts with `postgresql://`)
  4. Save it for Step 3

### Option B: Supabase (Alternative)
- Website: https://supabase.com
- Free tier: 500 MB database, 2 GB bandwidth
- Includes authentication features
- Steps:
  1. Sign up at supabase.com
  2. Create new project
  3. Go to Settings → Database
  4. Copy connection string (Connection pooling mode recommended)

### Option C: Railway
- Website: https://railway.app
- $5/month credit on free tier
- Simple PostgreSQL deployment

## Step 2: Deploy to Netlify

### 2.1 Sign Up & Connect GitHub

1. Go to https://netlify.com and click "Sign up"
2. Choose "Sign up with GitHub"
3. Authorize Netlify to access your repositories

### 2.2 Import FlowShield Repository

1. Click "Add new site" → "Import an existing project"
2. Choose "Deploy with GitHub"
3. Select the `FlowShield` repository
4. Choose the branch: `main`

### 2.3 Configure Build Settings

Netlify should auto-detect Next.js. Verify these settings:

- **Base directory**: `web-app`
- **Build command**: `prisma generate && npm run build`
- **Publish directory**: `web-app/.next`
- **Node version**: 20

### 2.4 Add Environment Variables

Click "Show advanced" → "New variable" and add:

| Variable | Value | Example |
|----------|-------|---------|
| `DATABASE_URL` | Your PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `NEXTAUTH_SECRET` | Generate a random 32+ character string | Use: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your production URL | `https://flowshield.app` |

**To generate NEXTAUTH_SECRET:**
```bash
# On Windows (Git Bash or WSL)
openssl rand -base64 32

# Or use this online: https://generate-secret.vercel.app/32
```

### 2.5 Deploy

1. Click "Deploy site"
2. Wait 3-5 minutes for the build to complete
3. You'll get a temporary URL like `https://random-name-123.netlify.app`

## Step 3: Run Database Migrations

After first deployment, you need to set up the database schema:

### Option A: Use Netlify CLI (Recommended)

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Login and link your site:
   ```bash
   cd web-app
   netlify login
   netlify link
   ```

3. Run Prisma migrations:
   ```bash
   netlify env:import .env.production  # If you have a local .env.production file
   npx prisma migrate deploy
   ```

### Option B: Run Locally with Production Database

1. Create `.env.production` locally with your production DATABASE_URL
2. Run:
   ```bash
   cd web-app
   DATABASE_URL="your-production-db-url" npx prisma migrate deploy
   ```

## Step 4: Configure Custom Domain (flowshield.app)

### 4.1 Add Domain in Netlify

1. In your Netlify site dashboard, go to "Domain settings"
2. Click "Add custom domain"
3. Enter `flowshield.app`
4. Netlify will provide DNS configuration

### 4.2 Update Domain DNS Settings

Go to your domain registrar (where you bought flowshield.app) and add these DNS records:

**For Apex Domain (flowshield.app):**
- Type: `A`
- Name: `@`
- Value: `75.2.60.5` (Netlify's load balancer)

**For WWW Subdomain:**
- Type: `CNAME`
- Name: `www`
- Value: `your-site-name.netlify.app`

**Note:** DNS propagation can take 24-48 hours, but often completes within an hour.

### 4.3 Enable HTTPS

1. Once DNS is configured, Netlify will automatically provision an SSL certificate
2. Enable "Force HTTPS" in Domain settings
3. Your site will be available at `https://flowshield.app`

## Step 5: Update Environment Variable

After domain is configured:

1. Go to Netlify → Site settings → Environment variables
2. Update `NEXTAUTH_URL` from the temporary URL to `https://flowshield.app`
3. Trigger a new deploy: Deploys → Trigger deploy → Deploy site

## Step 6: Verify Deployment

Test these features:

- ✅ Visit https://flowshield.app
- ✅ Sign up for a new account
- ✅ Log in
- ✅ Complete onboarding flow
- ✅ Check that dashboard loads

## Troubleshooting

### Build Fails with "Prisma Client not generated"
- Ensure build command includes `prisma generate`
- Check that `@prisma/client` and `prisma` are in dependencies

### Database Connection Issues
- Verify `DATABASE_URL` is correctly set in environment variables
- Check database allows connections from Netlify IPs (usually anywhere for cloud DBs)
- For Neon: Make sure you're using the pooled connection string

### "NEXTAUTH_URL mismatch" Error
- Ensure `NEXTAUTH_URL` matches your actual domain
- Clear browser cookies and try again

### 404 on Page Refresh
- The `netlify.toml` file should handle this
- Verify the redirect rule is in place

## Production Checklist

Before going live:

- [ ] Database migrations completed
- [ ] Environment variables set correctly
- [ ] Custom domain configured with SSL
- [ ] Test user registration and login
- [ ] Test desktop app connection to production API
- [ ] Update desktop app default API URL to `https://flowshield.app`
- [ ] Monitor Netlify build logs for errors

## Monitoring & Analytics

Netlify provides:
- **Analytics**: Site settings → Analytics
- **Build logs**: Deploys → [deployment] → Deploy log
- **Function logs**: Functions → Function log

## Costs

**Netlify Free Tier Includes:**
- 100 GB bandwidth/month
- 300 build minutes/month
- Unlimited sites
- **Commercial use allowed** ✅

You should be well within these limits for the MVP launch.

## Next Steps

After deployment:
1. Update desktop app's `ApiClient.cs` default URL to `https://flowshield.app`
2. Rebuild the desktop app installer
3. Create GitHub release with updated installer
4. Launch! 🚀
