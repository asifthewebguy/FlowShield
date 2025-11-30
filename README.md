# FlowShield

AI-Powered Productivity & Focus Management Platform

## Overview

FlowShield is a comprehensive productivity platform designed to help knowledge workers, developers, and students build better focus habits through structured work sessions, intelligent activity tracking, and actionable analytics.

![FlowShield Logo](image-resources/logo.jpg)

## Project Status

### ✅ Completed: Web Application MVP

The web application has been built with the following features:

#### Core Features
- ✅ **User Authentication** - Secure signup/login with JWT
- ✅ **Onboarding Flow** - 4-step quiz to personalize experience
- ✅ **User Profile Management** - Comprehensive profile page with settings
- ✅ **Focus Session Manager** - Start/pause/end timed focus sessions
- ✅ **Real-time Timer** - Countdown timer with progress tracking
- ✅ **Session History** - View today's completed sessions
- ✅ **Dashboard** - Real-time stats and session management
- ✅ **Analytics Dashboard** - Weekly/monthly charts with Recharts
- ✅ **Productivity Scoring** - Intelligent 0-100 scoring algorithm
- ✅ **Peak Time Detection** - AI-powered peak productivity time analysis
- ✅ **Data Export** - Export session data as CSV or JSON
- ✅ **Dark Mode** - System-wide dark mode with toggle in profile
- ✅ **Timezone Support** - 60+ timezones across all continents
- ✅ **Responsive Design** - Works on desktop, tablet, and mobile

#### Tech Stack
- **Frontend**: Next.js 15, React 18, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes, JWT Authentication
- **Database**: PostgreSQL with Prisma ORM
- **Charts**: Recharts for data visualization
- **Deployment Ready**: Vercel, Docker, or traditional hosting

## Quick Start

### Web Application

```bash
cd web-app
npm install
cp .env.example .env
# Edit .env with your database URL
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

See [web-app/SETUP_GUIDE.md](web-app/SETUP_GUIDE.md) for detailed setup instructions.

### Desktop Application (Windows)

```bash
cd desktop-app
dotnet restore
dotnet build -c Release
dotnet run
```

The app will run in your system tray. Right-click the icon to login and configure.

See [desktop-app/SETUP_GUIDE.md](desktop-app/SETUP_GUIDE.md) for detailed setup instructions.

## Project Structure

```
FlowShield/
├── web-app/              # ✅ Next.js web application (COMPLETED)
│   ├── src/
│   │   ├── app/          # App router pages and API routes
│   │   ├── components/   # React components
│   │   ├── lib/          # Utilities and database client
│   │   └── types/        # TypeScript type definitions
│   ├── prisma/           # Database schema
│   ├── public/           # Static assets (favicon, logo)
│   ├── README.md         # Web app documentation
│   └── SETUP_GUIDE.md    # Setup instructions
├── desktop-app/          # ✅ Windows desktop app (COMPLETED)
│   ├── Models/           # Data models
│   ├── Services/         # Activity tracking and sync services
│   ├── UI/               # System tray and forms
│   ├── logo.ico          # Application icon
│   ├── README.md         # Desktop app documentation
│   └── SETUP_GUIDE.md    # Setup instructions
├── image-resources/      # ✅ Brand assets
│   ├── logo.ico          # Icon file (3.7KB)
│   └── logo.jpg          # Logo image (65KB)
├── browser-extension/    # 🚧 Chrome/Firefox extension (TODO)
├── mobile-app/           # 🚧 Android app (TODO)
├── dev-docs/             # Product documentation
├── assets/               # Brand and marketing assets
└── PRD.md                # Product Requirements Document

```

## What's Built

### 1. Authentication System
- Email/password signup with validation
- Secure login with JWT tokens
- Password requirements (8+ chars, uppercase, number)
- Protected routes and API endpoints

### 2. Onboarding Experience
- **Step 1**: When do you work best? (Morning/Evening/Flexible)
- **Step 2**: Preferred focus duration (15-90 minutes)
- **Step 3**: Primary distractions (Social media, Email, etc.)
- **Step 4**: Work environment (Home/Office/Hybrid)

### 3. Focus Session Manager
- Three session types: Work, Study, Creative
- Preset durations: 25, 45, 60, 90 minutes
- Real-time countdown timer
- Visual progress bar
- Session completion tracking

### 4. Dashboard
- Today's focus time and sessions count
- Session history with timestamps
- Quick stats sidebar
- Responsive layout

### 5. User Profile Management
- **Personal Information**:
  - Full name and email management
  - Comprehensive timezone selection (60+ timezones)
  - Organized by continent: North America, South America, Europe, Africa, Asia, Australia & Pacific
- **Work Preferences**:
  - Work style preference (Morning/Evening/Flexible)
  - Preferred focus session duration (15-90 minutes with slider)
  - Primary distractions tracking (Social Media, Email, Messaging, etc.)
  - Work environment selection (Home/Office/Hybrid)
- **Appearance Settings**:
  - Dark mode toggle with instant preview
  - Persistent theme across all pages
  - Synced to database for cross-device consistency

### 6. Analytics Dashboard
- **Period Selection**: Toggle between last 7 days or 30 days
- **Summary Cards**: Total sessions, completion rate, focus time, productivity score
- **Peak Time Detection**: AI-powered analysis showing your most productive hours
- **Interactive Charts**:
  - Daily Focus Time (Bar Chart) - Hours spent in focus per day
  - Productivity Score Trend (Line Chart) - Track your productivity over time
  - Sessions Completed (Bar Chart) - Number of completed sessions per day
- **Data Export**: Download your session data as CSV or JSON files

### 7. Productivity Scoring Algorithm
FlowShield uses an intelligent scoring system (0-100) that evaluates:
- **Completion Rate** (40 points): Whether you finish your sessions
- **Duration Match** (30 points): How closely actual time matches planned time
  - Perfect: 90-110% of planned duration
  - Good: 70-130% of planned duration
  - OK: 50-150% of planned duration
- **Session Length** (30 points): Bonus for deep work sessions
  - 90+ minutes: Deep work session (30 points)
  - 45-90 minutes: Good length (20 points)
  - 25-45 minutes: Standard Pomodoro (15 points)
  - <25 minutes: Short session (5 points)

**Score Levels:**
- 80-100: Excellent - Outstanding focus!
- 60-79: Good - On the right track
- 40-59: Fair - Room for improvement
- 0-39: Needs Work - Let's build better habits

### 8. Peak Time Detection
The AI-powered peak time detection analyzes your sessions by hour of day to identify when you're most productive. It:
- Groups all sessions by start hour (0-23)
- Calculates productivity scores for each hour
- Identifies your highest-performing time periods
- Displays results as Morning/Afternoon/Evening/Night with specific hours
- Helps you schedule important work during peak productivity times

### 9. Desktop Activity Tracking (Windows)
The Windows desktop application provides automatic activity monitoring:
- **Automatic Tracking**: Monitors active window and application usage every 5 seconds
- **Idle Detection**: Automatically pauses tracking when no keyboard/mouse activity detected (5 min default)
- **Activity Level**: Measures work intensity (0-100) based on keyboard and mouse activity
- **Smart Categorization**: Automatically categorizes activities:
  - Development (VS Code, Visual Studio, IDEs)
  - Communication (Slack, Teams, Email)
  - Entertainment (YouTube, Netflix, Spotify)
  - Social Media (Facebook, Twitter, LinkedIn)
  - Productivity (Office apps, Notion)
  - Browsing (General web browsing)
- **Offline-First**: Stores all data locally in SQLite database
- **Cloud Sync**: Syncs with web app every 5 minutes when online
- **System Tray Integration**: Runs quietly in background with custom FlowShield icon
- **Privacy Focused**: Only tracks app names and activity counts - no actual keystrokes or mouse coordinates
- **Manual Controls**: Pause/resume tracking anytime
- **Configurable Settings**: Adjust idle threshold, tracking intervals, and privacy options
- **Today's Stats**: View daily activity summary
- **Custom Branding**: Uses FlowShield logo in system tray and application window
- **Smart Notifications**: Real-time alerts for tracking events, sync status, idle detection, and productivity milestones

## Next Steps: Roadmap

### Phase 2: Analytics & Insights
- [x] Weekly/Monthly analytics dashboard
- [x] Productivity score calculation
- [x] Peak productivity time detection
- [x] Data export (CSV/JSON)
- [ ] Distraction analysis
- [ ] Goal tracking system
- [ ] Break reminder system
- [ ] Productivity trends and patterns
- [ ] Weekly/monthly email reports

### Phase 3: Cross-Platform Integration
- [x] Windows desktop app for activity tracking
- [ ] Browser extension for tab monitoring
- [ ] Android mobile app
- [x] Real-time sync across devices

### Phase 4: Advanced Features
- [ ] AI-powered productivity insights
- [ ] Smart website blocking
- [ ] Team collaboration features
- [ ] Productivity coach recommendations

## Documentation

- [Product Requirements Document](PRD.md) - Complete product specification
- [Web App README](web-app/README.md) - Technical documentation
- [Web App Setup Guide](web-app/SETUP_GUIDE.md) - Installation instructions
- [Desktop App README](desktop-app/README.md) - Desktop app documentation
- [Desktop App Setup Guide](desktop-app/SETUP_GUIDE.md) - Desktop installation instructions
- [Brand Guidelines](assets/brand-guidelines/FlowShield_Brand_Guidelines.md)

## Development

### Web App
```bash
cd web-app
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run linter
npx prisma studio    # Open database GUI
```

### Desktop App
```bash
cd desktop-app
dotnet run           # Start in development mode
dotnet build         # Build project
dotnet publish       # Create release executable
```

## Database Schema

- **users** - User accounts and authentication
- **user_preferences** - Settings and onboarding data
- **sessions** - Focus session records
- **activity_logs** - Activity tracking data from desktop app
- **goals** - User productivity goals
- **daily_stats** - Aggregated daily statistics

## Environment Setup

Required environment variables:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/flowshield"
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

## Contributing

This is an active project under development. The web MVP is complete and ready for testing.

### Current Focus
1. ✅ Web application MVP - **DONE**
2. ✅ Analytics dashboard - **DONE**
3. ✅ Productivity scoring - **DONE**
4. ✅ Peak time detection - **DONE**
5. ✅ Data export feature - **DONE**
6. ✅ Desktop app for Windows - **DONE**
7. 📋 Goal tracking system - **Next**
8. 🌐 Browser extension - Planned

## Features Breakdown

### Implemented ✅

**Web Application:**
- User registration and authentication
- Comprehensive profile management page
  - Personal information (name, email, timezone)
  - Work preferences (work style, duration, distractions, environment)
  - Dark mode toggle with instant preview
  - 60+ timezones organized by continent
- Onboarding quiz (4-step personalization)
- Focus session creation and management
- Session timer with countdown
- Today's session history
- Real-time statistics (focus time, sessions count)
- Analytics dashboard with interactive charts
- Weekly/monthly views with period toggle
- Productivity scoring algorithm (0-100 scale)
- Peak productivity time detection
- Data export (CSV and JSON formats)
- System-wide dark mode with database persistence
- Responsive design
- RESTful API
- PostgreSQL database with Prisma

**Desktop Application (Windows):**
- Automatic window and process tracking
- Keyboard and mouse activity monitoring for idle detection
- Activity level calculation (0-100 scale based on input intensity)
- Smart idle detection (pauses tracking after 5 minutes of inactivity)
- Smart activity categorization (Development, Communication, Entertainment, etc.)
- Local SQLite database for offline storage
- Cloud sync with web app (every 5 minutes)
- System tray integration with custom FlowShield logo and notifications
- Login/authentication with web app
- Pause/resume tracking controls
- Today's stats viewer
- Configurable tracking and sync intervals
- Configurable idle threshold (1-30 minutes)
- Start with Windows option
- Privacy-focused (only tracks window titles, process names, and activity counts - no keylogging)
- Custom application icon and branding
- Real-time event notifications:
  - Tracking start/stop/pause alerts
  - Idle detection and activity resume notifications
  - Sync progress and status updates
  - Login/logout confirmations
  - High productivity congratulations (≥80 activity level)
  - Configurable notification preferences

### Planned 📋
**Short-term (Next Phase):**
- Goal setting and tracking system
- Break reminder notifications
- Distraction pattern analysis
- Productivity trends over time
- Weekly/monthly summary email reports
- Session tags and categorization
- Custom focus duration presets
- Pomodoro technique integration

**Long-term (Future Phases):**
- Activity insights dashboard (using desktop app data)
- Browser extension for tab monitoring and website blocking
- Android mobile app
- Team collaboration features
- AI-powered productivity coaching
- Integration with calendar apps (Google Calendar, Outlook)
- Slack/Discord integrations
- Public API for third-party integrations
- Screenshot capture (opt-in)
- Website URL extraction from browsers
- Custom activity rules and filters

## Branding

FlowShield uses a custom logo and icon across all applications:
- **Logo Image**: `image-resources/logo.jpg` (65KB) - Used in web app and marketing materials
- **Icon File**: `image-resources/logo.ico` (3.7KB) - Used in desktop app and browser favicon
- **Web App**: Favicon displayed in browser tabs
- **Desktop App**: Custom icon in system tray, taskbar, and window title bar

## License

MIT

## Support

For issues, questions, or contributions, please check:
- [Web App Documentation](web-app/README.md)
- [Setup Guide](web-app/SETUP_GUIDE.md)
- [Product Requirements](PRD.md)
