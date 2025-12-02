# FlowShield v1.0.0 - Initial Release 🎉

We're excited to announce the first official release of FlowShield - your personal focus and productivity tracking companion!

## 🌟 What is FlowShield?

FlowShield helps you understand and improve your focus by tracking your computer activity, providing insights, and blocking distractions when you need to concentrate.

## ✨ Features

### 📊 Activity Tracking
- **Automatic tracking** of applications and websites you use
- **Detailed analytics** showing your productivity patterns
- **Session management** to track focused work periods
- **Daily statistics** with insights and recommendations

### 🎯 Focus Sessions
- Start timed focus sessions with customizable durations
- Track productivity scores based on your activity
- View session history and completed sessions
- Pomodoro-style time management support

### 🚫 Distraction Blocking
- **Website blocking** feature to block distracting sites during focus time
- Modify Windows hosts file to enforce blocking at system level
- Easy enable/disable from system tray
- Supports blocking social media, news, videos, games, and more

### 📈 Analytics & Insights
- **AI-powered activity analysis** (coming soon)
- View top applications and websites by usage time
- Track focus time trends over days and weeks
- Identify your peak productivity hours

### 👤 User Preferences
- **Personalized onboarding** to set your work style and distractions
- **Dark mode** support for comfortable viewing
- **Timezone** configuration
- Customizable focus duration preferences

### 🔗 Multi-Device Sync
- **Cloud sync** across multiple devices
- View all connected devices in your profile
- Automatic activity synchronization
- Secure authentication with JWT tokens

### 🖥️ Desktop App Features
- **System tray integration** - runs quietly in the background
- **Automatic startup** option
- **Real-time activity tracking** with configurable intervals
- **Secure data storage** using SQLite
- **Notifications** for important events

## 📦 What's Included

- **Windows Desktop App** (FlowShield-Setup-v1.0.0.exe)
  - Requirements: Windows 10/11 (version 1809+)
  - Requires .NET 8.0 Desktop Runtime (auto-prompted if missing)
  - Size: 56 MB

- **Web Dashboard** available at [https://flowshield.app](https://flowshield.app)
  - Access from any device
  - View analytics and manage settings
  - Responsive design for mobile and desktop

## 🚀 Getting Started

### Installation

1. **Download** FlowShield-Setup-v1.0.0.exe from this release
2. **Run** the installer as Administrator (required for website blocking)
3. **Follow** the installation wizard
4. **Launch** FlowShield from the desktop shortcut or Start menu

### First-Time Setup

1. **Create an account** at [https://flowshield.app](https://flowshield.app)
2. **Complete onboarding** to personalize your experience
3. **Launch the desktop app** and it will appear in your system tray
4. **Right-click the tray icon** to:
   - Start a focus session
   - Enable website blocking
   - Configure settings
   - View status

### Website Blocking Setup

To use website blocking:
1. Launch the FlowShield desktop app
2. Right-click the system tray icon
3. Select "Block Distracting Sites"
4. Confirm the action
5. Your selected distractions will be blocked at the system level

## 🔒 Security & Privacy

- **Your data is yours** - all activity data is stored securely
- **Encrypted connections** - all communication uses HTTPS
- **Secure authentication** - JWT tokens with 1-hour expiration
- **Local storage** - activity tracked locally before sync
- **No tracking** - we don't sell or share your data

## 🐛 Known Issues

- None reported yet! Please report any issues you encounter.

## 📝 Technical Details

### Web App
- **Framework**: Next.js 15 with App Router
- **Database**: PostgreSQL (Neon)
- **Hosting**: Netlify with global CDN
- **Authentication**: NextAuth with JWT

### Desktop App
- **Framework**: .NET 8.0 Windows Forms
- **Database**: SQLite for local storage
- **Activity Tracking**: Process monitoring and window title tracking
- **Website Blocking**: Windows hosts file modification

## 🙏 Credits

FlowShield v1.0.0 was built with:
- Next.js, React, TypeScript
- .NET 8.0, C#
- PostgreSQL, Prisma ORM
- Tailwind CSS, Recharts
- And many other amazing open-source libraries

## 📞 Support

- **Documentation**: See [README.md](https://github.com/asifthewebguy/FlowShield)
- **Issues**: [GitHub Issues](https://github.com/asifthewebguy/FlowShield/issues)
- **Website**: [https://flowshield.app](https://flowshield.app)

## 🔄 What's Next?

We're working on exciting features for future releases:
- Mobile apps (iOS & Android)
- AI-powered productivity insights
- Team collaboration features
- Advanced analytics and reports
- Custom blocking rules
- Integration with calendar apps

Thank you for using FlowShield! 🚀

---

**Full Changelog**: https://github.com/asifthewebguy/FlowShield/commits/v1.0.0
