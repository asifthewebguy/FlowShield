# FlowShield Desktop App - Troubleshooting Guide

## App Closes Immediately After Starting

If the FlowShield desktop app closes immediately after running `dotnet run`, follow these steps:

### 1. Run with Detailed Error Messages

The app now includes comprehensive error handling that will display error dialogs. When you run the app, watch for error message boxes that appear before the app closes.

### 2. Check for Common Issues

**Issue: "Could not load file or assembly"**
- **Solution**: Ensure all dependencies are installed
- Run: `dotnet restore` in the desktop-app directory

**Issue: Database initialization error**
- **Solution**: Check if the app data directory is writable
- Location: `%LOCALAPPDATA%\FlowShield\`
- Ensure the folder exists and you have write permissions

**Issue: Windows hooks failed to install**
- **Solution**: Run the application with administrator privileges
- Right-click on the executable and select "Run as administrator"

### 3. Run from Command Line to See Errors

Instead of using `dotnet run`, build and run the executable directly:

```bash
# Build the release version
dotnet build -c Release

# Navigate to the output directory
cd bin\Release\net8.0-windows

# Run the executable directly
.\FlowShield.exe
```

This will show any error message boxes that appear.

### 4. Check Event Viewer

If no error dialogs appear:

1. Open Windows Event Viewer
2. Navigate to: Windows Logs → Application
3. Look for errors from "FlowShield.Desktop" or ".NET Runtime"
4. Check the error details

### 5. Enable Debug Logging

Add a log file to capture startup issues. Create a file at `%LOCALAPPDATA%\FlowShield\debug.log`:

The app will automatically log errors to this location if it exists.

### 6. Verify .NET Runtime

Ensure .NET 8.0 Runtime is installed:

```bash
dotnet --list-runtimes
```

You should see: `Microsoft.WindowsDesktop.App 8.0.x`

If not, install from: https://dotnet.microsoft.com/download/dotnet/8.0

### 7. Test Individual Components

Create a minimal test to isolate the issue:

**Test Database**:
```csharp
var dbService = new DatabaseService();
dbService.Initialize();
Console.WriteLine("Database initialized successfully");
```

**Test Activity Tracker**:
```csharp
var tracker = new ActivityTracker(dbService);
tracker.Start();
Console.WriteLine("Activity tracker started");
```

### 8. Common Solutions

**Reset Application Data**:
- Delete: `%LOCALAPPDATA%\FlowShield\`
- This will remove all local data and settings
- The app will recreate the database on next run

**Check Antivirus**:
- Some antivirus software blocks low-level hooks
- Add FlowShield.exe to your antivirus exceptions
- Temporarily disable antivirus to test

**Windows Permissions**:
- The app requires permissions to monitor keyboard/mouse input
- Ensure you're not running in a restricted user account
- Try running as administrator

## Debugging Tips

### Enable Console Output

Modify Program.cs to show a console window:

```csharp
// At the top of Program.cs
[DllImport("kernel32.dll")]
static extern bool AllocConsole();

// In Main() method, before anything else:
AllocConsole();
Console.WriteLine("FlowShield starting...");
```

### Check Process Monitor

Use Process Monitor (procmon.exe) from Sysinternals:
1. Download from: https://learn.microsoft.com/en-us/sysinternals/downloads/procmon
2. Run Process Monitor
3. Filter by Process Name: "FlowShield.exe"
4. Look for file access errors or registry issues

### Verify Dependencies

Check that all required DLLs are present:
```bash
cd bin\Release\net8.0-windows
dir *.dll
```

You should see:
- FlowShield.dll
- Microsoft.Data.Sqlite.dll
- Newtonsoft.Json.dll
- SQLitePCLRaw.*.dll files

## Still Not Working?

If none of the above solutions work:

1. **Check the GitHub Issues**: https://github.com/anthropics/flowshield/issues
2. **Create a new issue** with:
   - Windows version
   - .NET version (`dotnet --version`)
   - Error message or Event Viewer details
   - Steps you've already tried

## Known Issues

### Issue: App runs but no system tray icon appears

**Symptoms**: App starts but no icon in system tray
**Solution**:
- Check if system tray icons are hidden in Windows settings
- Look for the icon in the "hidden icons" overflow area (click ^ in taskbar)

### Issue: "Access Denied" when setting hooks

**Symptoms**: Error message about keyboard/mouse hooks
**Solution**:
- Run as administrator
- Disable conflicting applications (other keyboard/mouse monitors)
- Check Windows Security settings

### Issue: High CPU usage

**Symptoms**: FlowShield.exe using excessive CPU
**Solution**:
- Increase tracking interval in Settings
- Disable input activity tracking temporarily
- Check for infinite loop in activity logging

## Debug Build vs Release Build

**Debug Build** (`dotnet run`):
- Includes debugging symbols
- May run slower
- Better error messages

**Release Build** (`dotnet build -c Release`):
- Optimized for performance
- Smaller executable
- Use for production

## Contact Support

For additional help:
- Email: support@flowshield.com
- Discord: https://discord.gg/flowshield
- Documentation: https://docs.flowshield.com
