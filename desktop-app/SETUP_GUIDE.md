# FlowShield Desktop App - Setup Guide

Complete guide to setting up and running the FlowShield Windows desktop application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Methods](#installation-methods)
3. [First-Time Configuration](#first-time-configuration)
4. [Troubleshooting](#troubleshooting)
5. [Advanced Configuration](#advanced-configuration)

## Prerequisites

### Required

- **Windows 10 or 11** (64-bit)
- **FlowShield Web App** running and accessible
  - Either locally at `http://localhost:3000`
  - Or deployed to a server (e.g., `https://flowshield.yourdomain.com`)
- **FlowShield Account** - Create one through the web app

### Optional

- **.NET 8.0 SDK** (only for building from source)
- **Visual Studio 2022** or **VS Code** (for development)

## Installation Methods

### Method 1: Download Pre-built Executable (Recommended)

*Coming soon - Pre-built releases will be available on GitHub Releases*

1. Download `FlowShield.exe` from the latest release
2. Move to desired location (e.g., `C:\Program Files\FlowShield\`)
3. Run `FlowShield.exe`
4. Icon will appear in system tray

### Method 2: Build from Source

#### Step 1: Install .NET 8.0 SDK

1. Download from [https://dotnet.microsoft.com/download/dotnet/8.0](https://dotnet.microsoft.com/download/dotnet/8.0)
2. Run installer and follow prompts
3. Verify installation:
```bash
dotnet --version
```
Should output: `8.0.x`

#### Step 2: Clone and Build

```bash
# Navigate to desktop app directory
cd FlowShield/desktop-app

# Restore NuGet packages
dotnet restore

# Build the project
dotnet build -c Release

# Run the application
dotnet run -c Release
```

#### Step 3: Create Standalone Executable (Optional)

To create a single-file executable that doesn't need .NET runtime:

```bash
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=true
```

Output location:
```
bin\Release\net8.0-windows\win-x64\publish\FlowShield.exe
```

## First-Time Configuration

### Step 1: Launch Application

1. Run `FlowShield.exe`
2. Look for the FlowShield icon in the system tray (bottom-right, near the clock)
   - You may need to click the "Show hidden icons" arrow (^)

### Step 2: Login to Your Account

1. Right-click the FlowShield system tray icon
2. Select **"Login"**
3. Enter your credentials:
   - **Email**: Your FlowShield account email
   - **Password**: Your FlowShield account password
4. Click **"Login"**

If login is successful:
- You'll see "Successfully connected to FlowShield" notification
- Activity tracking will start automatically
- Data will sync every 5 minutes

### Step 3: Verify Tracking

1. Right-click the system tray icon
2. Select **"Today's Stats"**
3. You should see:
   - Total Time tracked
   - Number of Activity Logs
   - Unique Apps used

### Step 4: Configure Settings (Optional)

1. Right-click the system tray icon
2. Select **"Settings"**
3. Configure options:

| Setting | Default | Description |
|---------|---------|-------------|
| API Server URL | `http://localhost:3000` | Web app address |
| Tracking Interval | 5 seconds | How often to check active window |
| Sync Interval | 5 minutes | How often to sync with cloud |
| Start with Windows | ✓ Enabled | Auto-launch on Windows startup |
| Show Notifications | ✓ Enabled | Display sync/status notifications |

4. Click **"Save"**
5. Restart FlowShield for changes to take effect

## Troubleshooting

### Application Won't Start

#### Check .NET Runtime
```bash
dotnet --version
```

If not found, install .NET 8.0 Runtime:
- Download: [https://dotnet.microsoft.com/download/dotnet/8.0](https://dotnet.microsoft.com/download/dotnet/8.0)
- Select **.NET Runtime** (not SDK)
- Install and restart

#### Run from Command Line
```bash
cd path\to\FlowShield\desktop-app
dotnet run
```

Check console for error messages.

#### Check Windows Event Viewer
1. Open Event Viewer
2. Navigate to: Windows Logs → Application
3. Look for errors from "FlowShield" or ".NET Runtime"

### Login Fails

#### Verify Web App is Running
```bash
# If running locally
curl http://localhost:3000
```

Should return the web app homepage.

#### Check API URL in Settings
1. Right-click tray icon → Settings
2. Verify "API Server URL" matches your web app:
   - Local: `http://localhost:3000`
   - Remote: `https://your-domain.com`
3. No trailing slash!

#### Verify Credentials
- Email and password must match your web app account
- Test login through web app first: `http://localhost:3000/auth/login`

#### Check Network
```bash
# Test connection to web app
curl -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}"
```

Should return JSON with token.

### Tracking Not Working

#### Verify Tracking is Active
1. Right-click tray icon
2. Check status shows: **"✓ Tracking Active"**
3. If not, select **"Resume Tracking"**

#### Check Database
Database location:
```
%LOCALAPPDATA%\FlowShield\flowshield.db
```

Open in DB Browser for SQLite to verify logs are being created.

#### Permissions
FlowShield needs permission to:
- Read active window titles
- Access process information

If blocked by antivirus:
1. Add exception for FlowShield.exe
2. Or temporarily disable to test

### Sync Not Working

#### Check Login Status
- Right-click tray icon
- If menu shows "Login", you're not authenticated
- Log in first

#### Manual Sync
1. Right-click tray icon
2. Select **"Sync Now"**
3. Check for error notifications

#### View Unsynced Count
1. Right-click tray icon → Today's Stats
2. If "Activity Logs" count is high but web app shows nothing:
   - Sync is failing
   - Check web app logs

#### Check Web App API
Verify activity sync endpoint exists:
```bash
curl -X POST http://localhost:3000/api/activity/sync ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"activities\":[]}"
```

Should return: `{"message":"Activities synced successfully","count":0}`

### High CPU/Memory Usage

#### Adjust Tracking Interval
1. Settings → Tracking Interval
2. Increase from 5 seconds to 10 or 15 seconds
3. Save and restart

#### Database Cleanup
If database grows too large:

```sql
-- Open flowshield.db in DB Browser for SQLite
-- Delete old synced records
DELETE FROM ActivityLogs WHERE IsSynced = 1 AND Timestamp < date('now', '-30 days');

-- Vacuum to reclaim space
VACUUM;
```

### System Tray Icon Missing

1. Check Task Manager → FlowShield.exe is running
2. Click "Show hidden icons" arrow (^) in system tray
3. Drag FlowShield icon to main tray area
4. Windows will remember this preference

## Advanced Configuration

### Running on Windows Startup

#### Auto-Start (Recommended)
Set in app:
1. Settings → Start with Windows → ✓
2. Save

This creates a registry entry:
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
FlowShield = "C:\path\to\FlowShield.exe"
```

#### Manual (Task Scheduler)
1. Open Task Scheduler
2. Create Basic Task
3. Name: "FlowShield Auto Start"
4. Trigger: At log on
5. Action: Start a program
6. Program: `C:\path\to\FlowShield.exe`
7. Finish

### Using with Remote Web App

If web app is deployed:

1. Settings → API Server URL
2. Enter full URL: `https://flowshield.yourdomain.com`
3. Ensure HTTPS is configured on server
4. Save and restart

### Multiple Users (Same PC)

Each Windows user gets their own:
- Database: `%LOCALAPPDATA%\FlowShield\flowshield.db`
- Settings
- Auth token

To use:
1. Create separate FlowShield accounts for each user
2. Each user logs in with their own credentials
3. Data syncs to their respective accounts

### Custom Icon

Replace default icon:
1. Create `icon.ico` file
2. Place in FlowShield directory
3. Update `.csproj`:
```xml
<ApplicationIcon>icon.ico</ApplicationIcon>
```
4. Rebuild

### Developer Mode

Run with debug logging:
```bash
# Set environment variable
set FLOWSHIELD_DEBUG=true

# Run application
dotnet run
```

Logs output to console.

### Database Backup

Backup your local activity data:

```bash
# Stop FlowShield first

# Copy database
copy "%LOCALAPPDATA%\FlowShield\flowshield.db" "C:\Backups\flowshield-backup.db"

# Restart FlowShield
```

### Clean Install

To completely reset:

1. Exit FlowShield
2. Delete database:
```bash
del "%LOCALAPPDATA%\FlowShield\flowshield.db"
```
3. Clear registry entry (if using auto-start):
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
Delete "FlowShield" entry
```
4. Restart FlowShield
5. Login again

## Security Best Practices

### Credentials
- Never share your auth token
- Use strong passwords
- Change password if compromised

### Network
- Use HTTPS for remote web app
- Don't expose web app to public internet without authentication
- Consider VPN for accessing remote instances

### Privacy
- All data stored locally first
- Only syncs when explicitly logged in
- Can pause tracking anytime
- Review what's tracked in Today's Stats

## Getting Help

### Log Files
Check:
- Windows Event Viewer (Application logs)
- Console output (if running via `dotnet run`)

### Support Resources
- [Main README](../README.md)
- [Web App Setup Guide](../web-app/SETUP_GUIDE.md)
- [GitHub Issues](https://github.com/your-repo/FlowShield/issues)

### Common Questions

**Q: Does FlowShield track keyboard/mouse input?**
A: No, only active window titles and process names.

**Q: Can I see what's being tracked?**
A: Yes, via "Today's Stats" or by opening the SQLite database.

**Q: Does it work offline?**
A: Yes, stores locally and syncs when connection restored.

**Q: Can I delete tracked data?**
A: Yes, delete from database manually or clear entire DB.

**Q: Is my data private?**
A: Yes, stored locally. Only syncs to your own FlowShield account.

## Next Steps

- [Configure web app preferences](../web-app/README.md)
- [View analytics dashboard](http://localhost:3000/analytics)
- [Set productivity goals](http://localhost:3000/goals)
- [Install browser extension](../browser-extension/README.md) *(coming soon)*
