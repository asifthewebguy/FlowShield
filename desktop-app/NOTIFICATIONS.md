# FlowShield Desktop App - Notification System

## Overview

The FlowShield desktop application includes a comprehensive event notification system that keeps users informed about tracking status, sync operations, and productivity milestones in real-time.

## Architecture

### NotificationService

Centralized notification service that manages all app notifications through the Windows system tray.

**Location**: `Services/NotificationService.cs`

**Key Features**:
- Centralized notification management
- User-configurable notification preferences
- Multiple notification types (Info, Warning, Error, Success)
- Graceful fallback when notifications are disabled

### Event System

The notification system is built on a robust event architecture:

1. **ActivityTracker Events**:
   - `TrackingStarted` - Tracking begins
   - `TrackingStopped` - Tracking ends
   - `IdleStateChanged` - User goes idle or becomes active
   - `ActivityLogged` - Activity recorded to database

2. **SyncService Events**:
   - `SyncStarted` - Cloud sync initiated
   - `SyncCompleted` - Sync finished successfully
   - `SyncFailed` - Sync encountered an error

## Notification Types

### Tracking Events

**Tracking Started**
- **Trigger**: User starts activity tracking or app launches
- **Message**: "Activity tracking is now active"
- **Icon**: Info

**Tracking Paused**
- **Trigger**: User manually pauses tracking
- **Message**: "Activity tracking has been paused"
- **Icon**: Info

### Idle Detection

**Idle Detected**
- **Trigger**: No keyboard/mouse input for configured threshold (default 5 minutes)
- **Message**: "No activity for X minutes. Tracking paused."
- **Icon**: Info
- **Behavior**: Tracking automatically pauses to avoid logging inactive time

**Activity Resumed**
- **Trigger**: User input detected after idle period
- **Message**: "User activity detected. Tracking resumed."
- **Icon**: Success
- **Behavior**: Tracking automatically resumes

### Sync Operations

**Sync Started**
- **Trigger**: Sync operation begins (automatic or manual)
- **Message**: "Syncing activity data to cloud..."
- **Icon**: Info
- **Display**: Only shown if there are unsynced activities

**Sync Completed**
- **Trigger**: Sync operation succeeds
- **Message**: "Successfully synced X activities" or "Synced X activities, Y remaining"
- **Icon**: Success (if all synced) or Warning (if some remaining)

**Sync Failed**
- **Trigger**: Sync operation encounters an error
- **Message**: "Failed to sync: [error message]"
- **Icon**: Error
- **Behavior**: Activities remain local for retry on next sync

### Authentication

**Login Success**
- **Trigger**: User successfully authenticates
- **Message**: "Successfully connected to FlowShield"
- **Icon**: Success

**Login Failed**
- **Trigger**: Authentication fails
- **Message**: [Error message from server]
- **Icon**: Error

**Logout**
- **Trigger**: User logs out
- **Message**: "You have been logged out"
- **Icon**: Info

### Productivity Milestones

**High Productivity**
- **Trigger**: Activity level reaches ≥80 on 0-100 scale
- **Message**: "Great work! You're having a highly productive session!"
- **Icon**: Success
- **Frequency**: Once per high-activity period to avoid spam

**Daily Summary** (Future Feature)
- **Trigger**: End of day or user request
- **Message**: "Today: X sessions, Y hours of activity"
- **Icon**: Info

## Configuration

### User Settings

Notifications can be controlled via Settings dialog:

```csharp
public bool ShowNotifications { get; set; } = true;
```

**Location**: Settings → Show Notifications checkbox

**Default**: Enabled

**Behavior**: When disabled, all notifications are suppressed system-wide

### Notification Preferences

Stored in SQLite database in `Settings` table:

```sql
INSERT INTO Settings (Key, Value) VALUES ('ShowNotifications', 'true');
```

## Implementation Details

### Event Subscription

All events are subscribed in `TrayApplication.cs`:

```csharp
private void SubscribeToEvents()
{
    // Activity Tracker events
    _activityTracker.TrackingStarted += OnTrackingStarted;
    _activityTracker.TrackingStopped += OnTrackingStopped;
    _activityTracker.IdleStateChanged += OnIdleStateChanged;
    _activityTracker.ActivityLogged += OnActivityLogged;

    // Sync Service events
    _syncService.SyncStarted += OnSyncStarted;
    _syncService.SyncCompleted += OnSyncCompleted;
    _syncService.SyncFailed += OnSyncFailed;
}
```

### Event Args

**SyncEventArgs**:
```csharp
public class SyncEventArgs : EventArgs
{
    public bool Success { get; set; }
    public DateTime Timestamp { get; set; }
    public int RemainingUnsyncedCount { get; set; }
    public int SyncedCount { get; set; }
    public string? ErrorMessage { get; set; }
}
```

**IdleStateChangedEventArgs**:
```csharp
public class IdleStateChangedEventArgs : EventArgs
{
    public bool IsIdle { get; set; }
    public int IdleMinutes { get; set; }
}
```

**ActivityLoggedEventArgs**:
```csharp
public class ActivityLoggedEventArgs : EventArgs
{
    public ActivityLog Log { get; set; }
    public int ActivityLevel { get; set; }
}
```

### Notification Display

Uses Windows balloon tip notifications via `NotifyIcon`:

```csharp
_notifyIcon.BalloonTipTitle = title;
_notifyIcon.BalloonTipText = message;
_notifyIcon.BalloonTipIcon = icon; // Info, Warning, Error
_notifyIcon.ShowBalloonTip(3000); // 3 second display
```

## Best Practices

### Avoiding Notification Spam

1. **Throttling**: High productivity notifications only trigger once per productive period
2. **Conditional Display**: Sync started notification only shows if activities exist
3. **User Control**: All notifications can be disabled in settings

### Error Handling

All notification calls are wrapped in try-catch to prevent crashes:

```csharp
try
{
    // Try to load custom icon from logo.ico file
    var iconPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.ico");
    if (System.IO.File.Exists(iconPath))
    {
        return new Icon(iconPath);
    }
}
catch (Exception)
{
    // Fall back to system icon if loading fails
}
```

### Thread Safety

Events may fire from background threads (timers, async operations). All UI updates are marshaled to the UI thread:

```csharp
if (_notifyIcon.InvokeRequired)
{
    _notifyIcon.Invoke(new Action(() => ShowNotification(title, message, icon)));
}
else
{
    ShowNotification(title, message, icon);
}
```

## Future Enhancements

### Planned Features

- [ ] **Notification History**: View past notifications in a log
- [ ] **Custom Sounds**: Different sounds for different notification types
- [ ] **Notification Scheduling**: Quiet hours (e.g., no notifications 9pm-9am)
- [ ] **Priority Levels**: Critical vs. informational notifications
- [ ] **Rich Notifications**: Actionable notifications with buttons
- [ ] **Daily Digest**: Scheduled summary notifications
- [ ] **Break Reminders**: Periodic reminders to take breaks
- [ ] **Goal Progress**: Notifications when goals are achieved

### Advanced Options

- **Per-Event Toggle**: Enable/disable specific notification types
- **Frequency Control**: Configure how often notifications appear
- **Notification Center**: Windows 10/11 notification center integration
- **Do Not Disturb**: Auto-detect when user is in focus mode or presenting

## Troubleshooting

### Notifications Not Appearing

1. **Check Settings**: Ensure "Show Notifications" is enabled in Settings dialog
2. **Windows Settings**: Verify Windows notification settings allow FlowShield notifications
3. **Focus Assist**: Windows Focus Assist may suppress notifications
4. **System Tray**: Ensure FlowShield icon is visible in system tray

### Too Many Notifications

1. **Disable Notifications**: Turn off in Settings → Show Notifications
2. **Future**: Per-notification-type controls will allow fine-grained control

### Notification Timing

- Notifications appear immediately when events occur
- Balloon tips auto-dismiss after 3 seconds
- Click notification to interact (currently opens Today's Stats on double-click)

## Performance Impact

**Minimal overhead**:
- Event system: Negligible CPU usage
- Notification display: <1ms per notification
- No background polling
- Events only fire when state changes occur

## Privacy

**No data collection**:
- Notifications are local-only
- No notification content sent to servers
- No tracking of notification interactions
- Respects user privacy settings

## Summary

The FlowShield notification system provides users with timely, relevant updates about their productivity tracking without being intrusive. The event-driven architecture ensures notifications are accurate, performant, and respectful of user preferences.
