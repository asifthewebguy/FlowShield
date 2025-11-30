# FlowShield Desktop App - Website Blocking

## Overview

FlowShield's website blocking feature helps you stay focused by blocking distracting websites based on your preferences configured in the web app. The feature uses the Windows hosts file to redirect blocked websites to localhost, effectively preventing access during focus sessions.

## How It Works

### 1. User Preference Integration

The desktop app fetches your "Primary Distractions" from your web app profile:
- Social Media (Facebook, Twitter, Instagram, etc.)
- Video Streaming (YouTube, Netflix, Twitch, etc.)
- Email (Gmail, Outlook, Yahoo Mail, etc.)
- Messaging (Discord, Slack, WhatsApp Web, etc.)
- News Sites (CNN, BBC, Reddit, etc.)
- Shopping (Amazon, eBay, Walmart, etc.)

### 2. Hosts File Modification

When you enable website blocking, FlowShield modifies the Windows hosts file located at:
```
C:\Windows\System32\drivers\etc\hosts
```

Blocked domains are redirected to `127.0.0.1` (localhost), making them inaccessible.

**Example hosts file entry:**
```
127.0.0.1 facebook.com # FlowShield Block
127.0.0.1 www.facebook.com # FlowShield Block
127.0.0.1 youtube.com # FlowShield Block
```

### 3. DNS Cache Flushing

After modifying the hosts file, FlowShield automatically flushes the DNS cache using `ipconfig /flushdns` to ensure changes take effect immediately.

## Requirements

### Administrator Privileges

**Website blocking requires FlowShield to run as Administrator** because:
- The hosts file is a protected system file
- Only administrators can modify it
- This is a Windows security requirement

### How to Run as Administrator

**Option 1: Right-click the executable**
1. Navigate to `desktop-app\bin\Release\net8.0-windows\`
2. Right-click `FlowShield.exe`
3. Select "Run as administrator"

**Option 2: Set permanent administrator mode**
1. Right-click `FlowShield.exe`
2. Select "Properties"
3. Go to "Compatibility" tab
4. Check "Run this program as an administrator"
5. Click "OK"

## Usage

### Enabling Website Blocking

1. **Open FlowShield** (right-click system tray icon)
2. **Click "Block Distracting Sites"** in the context menu
3. If not running as admin, you'll see a warning message
4. Review the list of websites to be blocked
5. Click **Yes** to confirm

**Notification:** You'll receive a success notification showing how many websites are now blocked.

### Disabling Website Blocking

1. **Open FlowShield** (right-click system tray icon)
2. **Click "✓ Block Distracting Sites"** (checkmark indicates it's enabled)
3. Blocking will be disabled immediately

**Notification:** You'll receive a confirmation that websites are now accessible.

### Checking Block Status

The context menu shows:
- **"Block Distracting Sites"** - Blocking is OFF
- **"✓ Block Distracting Sites"** - Blocking is ON (checkmark visible)

## Blocked Websites by Category

### Social Media
- facebook.com, www.facebook.com, m.facebook.com
- twitter.com, x.com
- instagram.com
- linkedin.com
- reddit.com
- tiktok.com
- snapchat.com
- pinterest.com

### Video Streaming
- youtube.com, www.youtube.com, m.youtube.com
- netflix.com
- hulu.com
- twitch.tv
- vimeo.com

### Email
- gmail.com, mail.google.com
- outlook.com, outlook.live.com
- yahoo.com, mail.yahoo.com
- protonmail.com

### Messaging
- messenger.com
- web.whatsapp.com
- web.telegram.org
- discord.com
- slack.com, app.slack.com

### News Sites
- news.google.com
- cnn.com
- bbc.com
- reddit.com
- buzzfeed.com

### Shopping
- amazon.com
- ebay.com
- aliexpress.com
- walmart.com
- target.com

## Configuration

### Setting Your Distractions

1. **Log in to FlowShield web app** at http://localhost:3000
2. Go to **Profile** page
3. Scroll to **Work Preferences** section
4. Select your **Primary Distractions** (e.g., "Social Media", "Video Streaming")
5. Click **Update Profile**
6. **Restart FlowShield desktop app** or wait for automatic preference sync

### Automatic Preference Loading

FlowShield automatically:
- Fetches your preferences on startup (if authenticated)
- Configures blocked domains based on your selections
- Restores blocking state if it was enabled before closing

### Persistence

Website blocking state is saved in the local database:
- **Setting Key:** `WebsiteBlockingEnabled`
- **Values:** `"true"` or `"false"`
- **Location:** `%LOCALAPPDATA%\FlowShield\flowshield.db`

If you had blocking enabled when you closed FlowShield, it will automatically re-enable on next startup (if running as admin).

## Automatic Cleanup

### On App Exit

FlowShield automatically **disables website blocking** when you exit the app:
- Removes all FlowShield entries from hosts file
- Flushes DNS cache
- Ensures you regain full internet access

This prevents accidentally leaving websites blocked indefinitely.

### Manual Cleanup (If Needed)

If FlowShield crashes or doesn't clean up properly:

1. **Open Notepad as Administrator**
2. **Open file:** `C:\Windows\System32\drivers\etc\hosts`
3. **Remove lines** containing `# FlowShield Block`
4. **Save** the file
5. **Open Command Prompt as Administrator**
6. **Run:** `ipconfig /flushdns`

## Troubleshooting

### "Administrator Required" Error

**Problem:** Click "Block Distracting Sites" shows "Administrator privileges required"

**Solution:** Close FlowShield and restart it as Administrator (right-click → Run as administrator)

### "No Distractions Configured" Error

**Problem:** No websites are being blocked

**Solution:**
1. Log in to the web app
2. Update your Primary Distractions in Profile page
3. Restart FlowShield desktop app
4. Try enabling blocking again

### Websites Still Accessible After Blocking

**Problem:** Blocked websites still load in browser

**Solutions:**
1. **Clear browser cache and cookies**
2. **Restart your browser** completely
3. **Check hosts file** - Open `C:\Windows\System32\drivers\etc\hosts` and verify entries exist
4. **Flush DNS manually:**
   ```
   ipconfig /flushdns
   ```
5. **Try incognito/private mode** - Some browsers cache DNS aggressively

### Website Blocking Not Re-enabling on Startup

**Problem:** Had blocking enabled, but it's off after restart

**Possible Causes:**
- Not running as Administrator
- User preferences changed in web app (removed all distractions)
- Database setting corrupted

**Solution:**
1. Ensure running as Administrator
2. Manually re-enable from context menu
3. Check if any distractions are selected in web app profile

### Hosts File Permission Denied

**Problem:** Error modifying hosts file even as Administrator

**Solution:**
1. **Check antivirus** - Some antivirus software protects the hosts file
2. **Temporarily disable antivirus** protection for hosts file
3. **Check file permissions:**
   - Right-click hosts file → Properties → Security
   - Ensure Administrators group has Full Control

## Security & Privacy

### Safe Modifications

- FlowShield only adds/removes its own entries (marked with `# FlowShield Block`)
- Existing hosts file entries are preserved
- No data is sent to external servers
- All modifications are local to your machine

### Administrator Risks

Running as Administrator gives FlowShield permission to:
- Modify the hosts file
- Execute `ipconfig /flushdns` command

**FlowShield does NOT:**
- Modify any other system files
- Install drivers or services
- Access your browsing history
- Send blocked website lists anywhere

### Hosts File Backup

Before using website blocking for the first time, consider backing up your hosts file:

1. Navigate to `C:\Windows\System32\drivers\etc\`
2. Copy `hosts` file to `hosts.backup`
3. If anything goes wrong, restore from backup

## Technical Details

### Architecture

**WebsiteBlocker Service** (`Services/WebsiteBlocker.cs`):
- Manages hosts file modifications
- Maps distraction types to domain lists
- Checks administrator privileges
- Flushes DNS cache

**TrayApplication Integration**:
- Fetches user preferences via API
- Provides UI controls in context menu
- Persists blocking state to database
- Auto-disables on app exit

### API Integration

**Endpoint:** `GET /api/user/preferences`

**Response:**
```json
{
  "preferences": {
    "primaryDistractions": ["Social Media", "Video Streaming"],
    "workStyle": "Morning",
    "preferredDuration": 45
  }
}
```

**Desktop App Usage:**
```csharp
var preferences = await _apiClient.GetUserPreferencesAsync();
_websiteBlocker.SetBlockedDistractions(preferences.PrimaryDistractions);
_websiteBlocker.EnableBlocking();
```

### Hosts File Format

```
# FlowShield - Website Blocking (Added 2025-01-15 14:30)
127.0.0.1 facebook.com # FlowShield Block
127.0.0.1 www.facebook.com # FlowShield Block
127.0.0.1 instagram.com # FlowShield Block
```

### DNS Cache Flush

```csharp
var process = new System.Diagnostics.Process
{
    StartInfo = new System.Diagnostics.ProcessStartInfo
    {
        FileName = "ipconfig",
        Arguments = "/flushdns",
        UseShellExecute = false,
        CreateNoWindow = true
    }
};
process.Start();
process.WaitForExit();
```

## Future Enhancements

### Planned Features

- [ ] **Custom domain blocking** - Add your own websites to block list
- [ ] **Time-based blocking** - Block only during work hours
- [ ] **Break mode** - Temporarily disable blocking during breaks
- [ ] **Whitelist** - Allow specific domains even in blocked categories
- [ ] **Scheduled blocking** - Automatically enable/disable at set times
- [ ] **Focus session integration** - Auto-enable during active focus sessions
- [ ] **Block reporting** - Track how many times you attempted to access blocked sites
- [ ] **Browser extension sync** - More sophisticated blocking via browser extension

### Advanced Options

- **Partial blocking** - Block only specific social media features (e.g., Facebook feed but not Messenger)
- **Soft blocking** - Show warning page instead of complete block
- **Productivity-based blocking** - Automatically adjust blocking based on productivity score
- **Team sync** - Share blocking lists with team members

## Best Practices

### For Maximum Focus

1. **Enable blocking before starting work session**
2. **Set your distractions honestly** in the web app
3. **Run as Administrator** for the feature to work
4. **Don't disable impulsively** - Give yourself time to refocus first

### For Flexibility

1. **Review your distraction list monthly** - Preferences change
2. **Use focused blocking** - Only block categories you struggle with
3. **Schedule breaks** - Disable blocking during designated break times
4. **Combine with website blockers** - Use browser extensions for additional protection

### For Safety

1. **Keep a hosts file backup** before first use
2. **Test with one category first** before blocking everything
3. **Verify blocking disabled on exit** to avoid permanent blocks
4. **Check antivirus compatibility** if you encounter issues

## Support

### Common Questions

**Q: Can I add custom websites to block?**
A: Not yet, but this is planned for a future update. Currently, only predefined categories are supported.

**Q: Does this work on macOS or Linux?**
A: No, this is Windows-only. The feature modifies the Windows hosts file.

**Q: Will this block websites in all browsers?**
A: Yes, hosts file blocking works system-wide for all browsers and applications.

**Q: Can I temporarily disable blocking without unchecking the option?**
A: Currently, no. You must toggle the feature off/on. Break mode is planned for the future.

**Q: Is this more effective than browser extensions?**
A: Hosts file blocking is harder to bypass than browser extensions, but browser extensions offer more granular control.

### Get Help

- **Documentation:** [Desktop App README](README.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **GitHub Issues:** https://github.com/anthropics/flowshield/issues

## Summary

FlowShield's website blocking feature is a powerful tool for maintaining focus by eliminating digital distractions. By integrating with your web app preferences and using system-level hosts file blocking, it provides effective, tamper-resistant website blocking that helps you stay on task during your most productive hours.

**Key Takeaways:**
- Requires Administrator privileges
- Blocks websites based on your web app preferences
- Automatically disables on app exit
- Works across all browsers
- Safe and reversible
