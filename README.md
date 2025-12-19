<div align="center">

![FlowShield Logo](image-resources/logo.jpg)

# FlowShield

### AI-Powered Productivity & Focus Management Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Active-success.svg)]()
[![Next.js](https://img.shields.io/badge/next.js-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=flat&logo=Prisma&logoColor=white)](https://www.prisma.io/)

[Overview](#overview) •
[Features](#features-at-a-glance) •
[Quick Start](#quick-start) •
[Documentation](#documentation) •
[Roadmap](#project-roadmap)

</div>

---

## 🌟 Overview

**FlowShield** is a comprehensive productivity ecosystem designed to help knowledge workers, developers, and students build better focus habits. By combining structured work sessions with intelligent activity tracking and actionable analytics, FlowShield empowers users to reclaim their time and maximize deep work.

## 🚀 Features at a Glance

### ✅ Completed: Web Application MVP

The web application is live and packed with features to boost your productivity immediately:

#### Core Features
- 🔐 **User Authentication** - Secure signup/login with JWT & Email Verification
- 🎓 **Onboarding Flow** - 4-step personalization quiz
- 👤 **Profile Management** - Comprehensive settings & preferences
- ⏱️ **Focus Session Manager** - Customizable timer with Work/Study/Creative modes
- 📊 **Real-time Dashboard** - Live stats, session history, and progress tracking
- 📈 **Analytics Dashboard** - interactive charts (Weekly/Monthly views)
- 🧠 **Productivity Scoring** - Intelligent 0-100 daily score
- ⚡ **Peak Time Detection** - AI-powered analysis of your best hours
- 🌙 **Dark Mode** - Beautiful system-wide dark theme
- 🌍 **Timezone Support** - 60+ global timezones
- 📂 **Project Organization** - Create and manage projects
- 🎯 **Daily Goals** - Set and track focus targets

#### Tech Stack
- **Frontend**: Next.js 15, React 18, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes, JWT Auth
- **Database**: PostgreSQL with Prisma ORM
- **Visualization**: Recharts

### 🖥️ Desktop Application (Windows)
- **Automatic Tracking**: Monitors active window/app usage
- **Idle Detection**: Smart pause/resume based on activity
- **Cloud Sync**: Seamless synchronization with the web app
- **Deep Work Mode**: Block distractions during focus sessions
- **Privacy Focused**: Local-first architecture (SQLite)

---

## ⚡ Quick Start

### Web Application

1. **Clone & Install**
   ```bash
   cd web-app
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Update DATABASE_URL in .env
   ```

3. **Initialize Database**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000)

   👉 See [Setup Guide](web-app/SETUP_GUIDE.md) for full details.

### Desktop Application

1. **Build & Run**
   ```bash
   cd desktop-app
   dotnet restore
   dotnet run -c Release
   ```

   👉 See [Desktop Setup Guide](desktop-app/SETUP_GUIDE.md) for full details.

---

## 📂 Project Structure

```
FlowShield/
├── web-app/              # 🌐 Next.js Web App
│   ├── src/              # Source code
│   ├── prisma/           # Database schema
│   ├── e2e/              # Playwright tests
│   └── README.md         # Web specific docs
├── desktop-app/          # 💻 Windows Desktop App
│   ├── Models/           # Data definitions
│   ├── Services/         # Tracking logic
│   └── README.md         # Desktop docs
├── image-resources/      # 🎨 Brand Assets
├── dev-docs/             # 📚 Developer Documentation
└── PRD.md                # 📋 Product Requirements
```

---

## 🗺️ Project Roadmap

### Phase 2: Analytics & Insights (Current Focus)
- [x] Weekly/Monthly analytics dashboard
- [x] Productivity score calculation
- [x] Peak productivity time detection
- [x] Goal tracking system (Daily Goals)
- [ ] Distraction analysis & patterns
- [ ] Productivity trends

### Phase 3: Cross-Platform
- [x] Windows desktop app
- [ ] Browser extension
- [ ] Mobile app (iOS/Android)
- [x] Real-time sync

### Future Horizons
- **AI Insights**: Deeper, personalized productivity recommendations.
- **Smart Blocking**: Intelligent site blocking during focus sessions.
- **Team Features**: Collaborative goals and leaderboards.

---

## 📚 Documentation

- [Product Requirements (PRD)](PRD.md)
- [Web App Documentation](web-app/README.md)
- [Brand Guidelines](assets/brand-guidelines/FlowShield_Brand_Guidelines.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) (coming soon) for details.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
