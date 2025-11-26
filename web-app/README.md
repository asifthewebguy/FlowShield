# FlowShield Web App

AI-Powered Productivity & Focus Management Platform - Web Application

## Features Implemented

### Core Features (MVP)
- ✅ User Authentication (Signup, Login, JWT)
- ✅ Onboarding Flow with Quiz
- ✅ Focus Session Manager with Timer
- ✅ Session Management API
- ✅ Dashboard with Real-time Stats
- ✅ Today's Session History
- ✅ Dark Mode Support (via Tailwind)

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT
- **State Management**: React Hooks + Local Storage

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your database URL and secrets:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/flowshield"
NEXTAUTH_SECRET="your-secret-key-here"
```

3. Set up the database:
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
web-app/
├── src/
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── auth/         # Authentication endpoints
│   │   │   ├── sessions/     # Session management
│   │   │   └── user/         # User profile
│   │   ├── auth/             # Auth pages (login, signup)
│   │   ├── dashboard/        # Main dashboard
│   │   ├── onboarding/       # Onboarding flow
│   │   └── globals.css       # Global styles
│   ├── components/
│   │   └── dashboard/        # Dashboard components
│   │       └── FocusTimer.tsx
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client
│   │   └── auth.ts           # Auth utilities
│   └── types/
│       └── index.ts          # TypeScript types
├── prisma/
│   └── schema.prisma         # Database schema
├── public/                    # Static assets
└── package.json
```

## Database Schema

The application uses PostgreSQL with the following main tables:
- `users` - User accounts
- `user_preferences` - User settings and onboarding data
- `sessions` - Focus sessions
- `activity_logs` - Activity tracking data (for future desktop/browser extensions)
- `goals` - User goals
- `daily_stats` - Aggregated daily statistics

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/login` - Login and get JWT token

### User
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile/preferences

### Sessions
- `POST /api/sessions` - Start new focus session
- `GET /api/sessions` - Get user's sessions (with optional date filter)
- `PATCH /api/sessions/[id]` - Update session (end, complete, score)
- `DELETE /api/sessions/[id]` - Delete session

## User Flow

1. **Sign Up** → Create account at `/auth/signup`
2. **Login** → Sign in at `/auth/login`
3. **Onboarding** → Answer 4 questions about work style
4. **Dashboard** → Start focus sessions and track progress
5. **Session Flow**:
   - Select session type (Work, Study, Creative)
   - Choose duration (25, 45, 60, or 90 minutes)
   - Start session → Timer counts down
   - End session or let it complete automatically
   - View in today's session history

## Features to Build Next

### Phase 2 (Analytics & Advanced Features)
- [ ] Weekly/Monthly Analytics Dashboard
- [ ] Productivity Score Calculation
- [ ] Goal Setting and Tracking
- [ ] Break Reminder System
- [ ] Session Notes/Journal
- [ ] Export Data (CSV/JSON)

### Phase 3 (Integrations)
- [ ] Desktop App Integration
- [ ] Browser Extension Integration
- [ ] Mobile App API Support
- [ ] Activity Categorization Engine

### Phase 4 (Team Features)
- [ ] Team Dashboards
- [ ] Shared Goals
- [ ] Leaderboards

## Development

### Run Prisma Studio
```bash
npx prisma studio
```

### Create New Migration
```bash
npx prisma migrate dev --name your_migration_name
```

### Reset Database
```bash
npx prisma migrate reset
```

### Build for Production
```bash
npm run build
npm start
```

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Secret key for JWT signing

Optional:
- `GOOGLE_CLIENT_ID` - For Google OAuth (future)
- `GOOGLE_CLIENT_SECRET` - For Google OAuth (future)

## Contributing

This is an MVP build. Future enhancements include:
1. Analytics dashboard with charts (using Recharts)
2. Goal tracking system
3. Productivity insights engine
4. Desktop and browser extension integration
5. Mobile app support

## License

MIT
