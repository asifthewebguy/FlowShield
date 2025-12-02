# FlowShield Windows Installer

This document explains how to build the Windows installer for FlowShield desktop application.

## Prerequisites

1. **Inno Setup 6.0 or later**
   - Download from: https://jrsoftware.org/isdl.php
   - Install with default options
   - Free and open source

2. **.NET 8.0 SDK**
   - Already installed (for building the app)

3. **FlowShield built in Release mode**
   - The installer script expects files in `bin\Release\net8.0-windows\`

## Building the Installer

### Step 1: Build the Application

```bash
cd desktop-app
dotnet build --configuration Release
```

### Step 2: Create installer directory

```bash
mkdir installer
```

### Step 3: Compile the Installer

**Option A: Using Inno Setup GUI**
1. Open `FlowShield-Setup.iss` in Inno Setup
2. Click `Build` → `Compile`
3. Installer will be created in `installer\FlowShield-Setup-v1.0.0.exe`

**Option B: Using Command Line**
```bash
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" FlowShield-Setup.iss
```

## Installer Features

### What Gets Installed:
- ✅ FlowShield.exe (main application)
- ✅ All required .NET DLLs and dependencies
- ✅ Application icon (logo.ico)
- ✅ Configuration files
- ✅ README and LICENSE

### Installation Options:
- ✅ Desktop shortcut (optional)
- ✅ Start with Windows (optional, checked by default)
- ✅ Start menu shortcuts
- ✅ Uninstaller

### Smart Features:
- ✅ Checks for .NET 8.0 Runtime before installation
- ✅ Offers to download .NET if missing
- ✅ Asks about keeping user data during uninstall
- ✅ Requires admin privileges (for hosts file modification)
- ✅ Supports Windows 10 version 1809 or later

## Installer Output

**File**: `installer\FlowShield-Setup-v1.0.0.exe`
**Size**: ~100 MB (includes all dependencies)
**Compression**: LZMA2 (solid compression for smaller size)

## User Installation Process

1. Run `FlowShield-Setup-v1.0.0.exe`
2. Click through the wizard
3. Choose installation location (default: `C:\Program Files\FlowShield`)
4. Select optional features (desktop icon, startup)
5. Install
6. Launch FlowShield

## Uninstallation

Users can uninstall via:
- Windows Settings → Apps → FlowShield → Uninstall
- Start Menu → FlowShield → Uninstall
- Control Panel → Programs and Features

**Data Preservation:**
- Uninstaller asks if user wants to keep their data
- Data location: `%LOCALAPPDATA%\FlowShield`
- Includes: database, settings, logs

## Distribution

Once built, you can distribute `FlowShield-Setup-v1.0.0.exe`:
- ✅ Upload to GitHub Releases
- ✅ Host on your website
- ✅ Share directly with users

**No installation of Inno Setup required for end users!**

## Customization

To customize the installer:

1. **Change App Info**: Edit `#define` variables at the top of `FlowShield-Setup.iss`
2. **Modify UI**: Change `WizardStyle` or add custom pages
3. **Add Files**: Add more `Source:` entries in `[Files]` section
4. **Change Icon**: Replace `SetupIconFile=logo.ico`

## Troubleshooting

**Error: "Cannot find bin\Release\net8.0-windows\FlowShield.exe"**
- Run `dotnet build --configuration Release` first

**Error: "Inno Setup not found"**
- Install Inno Setup from https://jrsoftware.org/isdl.php
- Add to PATH or use full path to ISCC.exe

**Installer too large?**
- The .NET dependencies make it ~100MB
- This is normal for self-contained .NET apps
- Alternative: Create framework-dependent build (smaller but requires .NET installed)

## Next Steps

After creating the installer:
1. Test installation on a clean Windows machine
2. Upload to GitHub Releases
3. Update README with download link
4. Create installation guide for users
