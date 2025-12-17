<div align="center">

# FlowShield Web App

### AI-Powered Productivity & Focus Management Platform

[![Next.js](https://img.shields.io/badge/next.js-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=flat&logo=Prisma&logoColor=white)](https://www.prisma.io/)

[Features](#features-implemented) •
[Getting Started](#getting-started) •
[Project Structure](#project-structure) •
[API](#api-endpoints)

</div>

---

## 🌟 Features Implemented

### Core Features (MVP)
- 🔐 **User Authentication** - Signup, Login, JWT with Email Verification
- 🎓 **Onboarding Flow** - Personalized setup via quiz
- ⏱️ **Focus Session Manager** - Timer with Work/Study/Creative modes
- 📊 **Dashboard** - Real-time statistics & activity tracking
- 📂 **Project Organization** - Create & manage work projects
- 🎯 **Daily Goals** - Set and track your daily focus targets
- 📅 **Session History** - Comprehensive daily view
- 🌙 **Dark Mode** - Full system-wide support

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: JWT & NextAuth
- **State**: Zustand & React Hooks

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Database Setup**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000)

### 🧪 Running Tests (End-to-End)

FlowShield uses **Playwright** for robust End-to-End testing.

```bash
# Install browsers
npx playwright install

# Run tests
npx playwright test

# View Report
npx playwright show-report
```

---

## 📂 Project Structure

```bash
web-app/
├── src/
│   ├── app/              # ⚡ App Directory
│   │   ├── api/          # 🔌 API Routes
│   │   ├── auth/         # 🔐 Auth Pages
│   │   ├── dashboard/    # 📊 Dashboard Pages
│   │   └── onboarding/   # 🎓 Onboarding Flow
│   ├── components/       # 🧩 Reusable Components
│   ├── lib/              # 🛠️ Utilities (Prisma, Auth)
│   └── types/            # 📝 TypeScript Definitions
├── prisma/               # 🗄️ Database Schema
└── e2e/                  # 🤖 Playwright Tests
```

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/verify` - Verify email
- `POST /api/auth/login` - Authenticate user

### User Management
- `GET /api/user/profile` - Retrieve profile
- `PUT /api/user/profile` - Update preferences

### Session Management
- `POST /api/sessions` - Start session
- `GET /api/sessions` - List sessions
- `PATCH /api/sessions/[id]` - Update status
- `DELETE /api/sessions/[id]` - Remove session

---

## 🔮 Future Roadmap

- **AI Insights**: Deeper productivity analysis.
- **Smart Blocking**: Browser extension integration.
- **Team Features**: Collaborative goals.
- **Mobile App**: iOS & Android support.

---

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License.
