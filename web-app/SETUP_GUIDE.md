# FlowShield Web App - Quick Setup Guide

## Prerequisites

1. **Node.js** (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify: `node --version`

2. **PostgreSQL** (v14 or higher)
   - **Option A - Local Installation**:
     - Windows: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
     - Mac: `brew install postgresql`
     - Linux: `sudo apt-get install postgresql`

   - **Option B - Docker** (Recommended):
     ```bash
     docker run --name flowshield-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=flowshield -p 5432:5432 -d postgres:15
     ```

   - **Option C - Cloud** (Easiest):
     - Use [Supabase](https://supabase.com) (free tier available)
     - Use [Railway](https://railway.app) (free tier available)
     - Use [Neon](https://neon.tech) (free tier available)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd web-app
npm install
```

### 2. Configure Environment

Create a `.env` file in the `web-app` directory:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

**For local PostgreSQL:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowshield"
NEXTAUTH_SECRET="generate-a-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

**For Docker PostgreSQL:**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowshield"
NEXTAUTH_SECRET="generate-a-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

**For Supabase/Cloud:**
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT].supabase.co:5432/postgres"
NEXTAUTH_SECRET="generate-a-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

**Generate a secure secret:**
```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Or use any random string generator
```

### 3. Set Up Database

```bash
# Generate Prisma Client
npx prisma generate

# Create and run migrations
npx prisma migrate dev --name init
```

If successful, you should see:
```
✅ Your database is now in sync with your Prisma schema.
```

### 4. (Optional) Seed Test Data

You can test the database connection:
```bash
npx prisma studio
```

This opens a browser-based database viewer at `http://localhost:5555`

### 5. Start Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

## Testing the Application

### 1. Create an Account
- Go to http://localhost:3000
- Click "Get Started Free"
- Fill in your details
- Password must have:
  - At least 8 characters
  - 1 uppercase letter
  - 1 lowercase letter
  - 1 number

### 2. Complete Onboarding
Answer the 4 onboarding questions:
1. When do you work best? (Morning/Evening/Flexible)
2. Preferred focus duration (15-90 minutes)
3. What distracts you? (Select multiple)
4. Where do you work? (Home/Office/Hybrid)

### 3. Start a Focus Session
- Choose session type (Work/Study/Creative)
- Select duration (25/45/60/90 minutes)
- Click "Start Focus Session"
- Timer will count down
- You can pause or end the session early

### 4. View Your Progress
- See today's completed sessions
- Track total focus time
- Monitor sessions completed

## Common Issues & Solutions

### Issue: "Can't reach database server"
**Solution:**
- Verify PostgreSQL is running
- Check DATABASE_URL in `.env` is correct
- For Docker: `docker ps` to see if container is running
- Test connection: `npx prisma db pull`

### Issue: "Prisma Client not generated"
**Solution:**
```bash
npx prisma generate
```

### Issue: "Migration failed"
**Solution:**
```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Or create new database
npx prisma migrate dev --name init
```

### Issue: Port 3000 already in use
**Solution:**
```bash
# Kill process on port 3000 (Windows)
npx kill-port 3000

# Or run on different port
PORT=3001 npm run dev
```

### Issue: "Module not found" errors
**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Database Management

### View Database
```bash
npx prisma studio
```

### Reset Database (Delete all data)
```bash
npx prisma migrate reset
```

### Create New Migration
```bash
npx prisma migrate dev --name your_migration_name
```

### Sync Schema Without Migration
```bash
npx prisma db push
```

## Production Deployment

### Option 1: Vercel (Recommended)
1. Push code to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy automatically

### Option 2: Docker
```bash
# Build
docker build -t flowshield-web .

# Run
docker run -p 3000:3000 --env-file .env flowshield-web
```

### Option 3: Traditional Hosting
```bash
npm run build
npm start
```

## Next Steps

After successful setup:
1. ✅ Test signup and login
2. ✅ Complete onboarding
3. ✅ Start and complete a focus session
4. 📊 Build analytics dashboard (next phase)
5. 🎯 Add goal tracking (next phase)
6. 🔌 Integrate desktop app (future)

## Support

- Check [README.md](./README.md) for detailed documentation
- Review [PRD.md](../PRD.md) for full product specifications
- Open issues on GitHub for bugs

## Development Workflow

```bash
# Start dev server
npm run dev

# Run linter
npm run lint

# Build for production
npm run build

# Start production server
npm start

# Database commands
npx prisma studio          # Database GUI
npx prisma migrate dev     # Create migration
npx prisma generate        # Generate client
```

Happy coding! 🚀
