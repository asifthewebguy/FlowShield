# FlowShield Desktop App

Windows desktop application for automatic activity tracking and productivity monitoring.

## Features

- **Automatic Activity Tracking**: Tracks active window titles and application usage
- **Process Monitoring**: Records which applications you're using and for how long
- **Idle Time Detection**: Detects when you're idle (no keyboard/mouse activity) and pauses tracking
- **Activity Level Tracking**: Measures keyboard and mouse activity intensity (0-100 scale)
- **Smart Categorization**: Automatically categorizes activities (Development, Communication, Entertainment, etc.)
- **Offline-First**: Stores activity logs locally in SQLite database
- **Cloud Sync**: Syncs activity data with FlowShield web app when online
- **System Tray Integration**: Runs quietly in the background with system tray icon
- **Privacy Focused**: Only tracks app names and activity counts - no actual keystrokes or mouse coordinates recorded

## Requirements

- Windows 10/11 (x64)
- .NET 8.0 Runtime
- FlowShield web app running (for cloud sync)

## Installation

### Option 1: Build from Source

1. Install .NET 8.0 SDK from [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download)

2. Clone the repository:
```bash
cd desktop-app
```

3. Restore dependencies:
```bash
dotnet restore
```

4. Build the application:
```bash
dotnet build -c Release
```

5. Run the application:
```bash
dotnet run
```

### Option 2: Publish Standalone Executable

Create a standalone executable that doesn't require .NET runtime:

```bash
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The executable will be in `bin/Release/net8.0-windows/win-x64/publish/FlowShield.exe`

## First Time Setup

1. Launch FlowShield Desktop
2. Click the system tray icon (bottom-right near clock)
3. Select "Login" from the context menu
4. Enter your FlowShield account credentials
5. Activity tracking will start automatically

## Usage

### System Tray Menu

Right-click the FlowShield icon in the system tray to access:

- **Status**: Shows if tracking is active or paused
- **Pause/Resume Tracking**: Toggle activity tracking on/off
- **Sync Now**: Manually trigger sync with cloud
- **Today's Stats**: View today's activity summary
- **Settings**: Configure tracking intervals and preferences
- **Login/Logout**: Manage authentication
- **Exit**: Close the application

### Tracking Behavior

The app tracks:
- **Window Title**: Title of the active window
- **Process Name**: Name of the running application
- **Duration**: How long each window was active
- **Activity Level**: Intensity of keyboard/mouse activity (0-100)
- **Category**: Auto-categorized activity type
- **Idle Time**: Automatically pauses tracking when idle (no input for 5 minutes by default)

Tracked every **5 seconds** by default (configurable in settings).

**Privacy Note**: Only counts keystrokes and mouse clicks/movements - no actual keys pressed or coordinates are recorded.

### Data Sync

- Syncs to cloud every **5 minutes** by default
- Works offline - syncs when connection is restored
- Only syncs when logged in with valid credentials
- All data encrypted in transit (HTTPS)

### Settings

Configure these options in Settings:

- **API Server URL**: Web app address (default: http://localhost:3000)
- **Tracking Interval**: How often to check active window (1-60 seconds)
- **Sync Interval**: How often to sync with cloud (1-60 minutes)
- **Idle Threshold**: Minutes of no input before considered idle (1-30 minutes)
- **Track Input Activity**: Enable/disable keyboard and mouse activity tracking
- **Start with Windows**: Launch automatically on Windows startup
- **Show Notifications**: Display sync and status notifications

## Project Structure

```
desktop-app/
├── Models/
│   ├── ActivityLog.cs       # Activity log data model
│   └── AppSettings.cs       # Application settings model
├── Services/
│   ├── ActivityTracker.cs   # Windows API activity tracking
│   ├── DatabaseService.cs   # SQLite database operations
│   ├── ApiClient.cs         # HTTP client for web app API
│   └── SyncService.cs       # Background sync service
├── UI/
│   ├── TrayApplication.cs   # System tray application
│   ├── LoginForm.cs         # Login dialog
│   └── SettingsForm.cs      # Settings dialog
├── Program.cs               # Application entry point
└── FlowShield.Desktop.csproj # Project file
```

## Activity Categories

Activities are automatically categorized:

- **Development**: IDEs, code editors (VS Code, Visual Studio, etc.)
- **Communication**: Email, chat apps (Outlook, Slack, Teams, Discord)
- **Entertainment**: Media streaming (YouTube, Netflix, Spotify)
- **Social**: Social media (Facebook, Twitter, LinkedIn, Reddit)
- **Productivity**: Office apps (Excel, Word, PowerPoint, Notion)
- **Browsing**: General web browsing
- **Unknown**: Uncategorized applications

## Database

Local SQLite database stored at:
```
%LOCALAPPDATA%\FlowShield\flowshield.db
```

Contains:
- **ActivityLogs**: All tracked activities with timestamps
- **Settings**: User preferences and configuration

## API Integration

Communicates with FlowShield web app via REST API:

- `POST /api/auth/login` - Authenticate user
- `POST /api/activity/sync` - Sync activity logs
- `GET /api/sessions/active` - Get current active session

Requires JWT authentication token.

## Privacy & Security

- All activity data stored locally first
- Only syncs to cloud when explicitly logged in
- Credentials never stored in plaintext
- Uses JWT tokens for authentication
- HTTPS for all API communication
- **Input Tracking Privacy**:
  - Only counts keystrokes and mouse events (not actual content)
  - No keystroke logging - we never see what you type
  - No mouse coordinate tracking - just movement/click counts
  - Used solely for idle detection and activity level calculation
  - Can be disabled in settings if preferred
- No telemetry or tracking by FlowShield itself

## Troubleshooting

### App won't start
- Ensure .NET 8.0 Runtime is installed
- Check Windows Event Viewer for errors
- Run from command line to see error messages

### Tracking not working
- Check system tray icon shows "Tracking Active"
- Verify permissions - app needs access to read window titles
- Try pause/resume from tray menu

### Sync failing
- Verify web app is running at configured URL
- Check login credentials are valid
- Ensure network connectivity
- Check "Today's Stats" to see unsynced count

### Database issues
- Delete database file (will lose local data): `%LOCALAPPDATA%\FlowShield\flowshield.db`
- Restart application to recreate database

## Building for Distribution

Create installer or standalone package:

### Single-File Executable
```bash
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=true
```

### Framework-Dependent (smaller size, requires .NET runtime)
```bash
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true
```

## Development

### Running in Debug Mode
```bash
dotnet run
```

### Running Tests (when available)
```bash
dotnet test
```

### Code Style
- Follow C# coding conventions
- Use nullable reference types
- Add XML documentation to public APIs

## Roadmap

- [x] Idle time detection
- [x] Activity level tracking based on input
- [ ] Screenshot capture (opt-in)
- [ ] Website URL extraction for browsers
- [ ] Custom activity rules and filters
- [ ] Productivity insights and reports
- [ ] Break reminders
- [ ] Focus mode integration
- [ ] Multi-monitor support
- [ ] Installer (MSI/EXE)
- [ ] Auto-update functionality

## License

MIT License - See main repository LICENSE file

## Support

For issues or questions:
- Check main [FlowShield README](../README.md)
- Review [Web App Setup Guide](../web-app/SETUP_GUIDE.md)
- Check troubleshooting section above
