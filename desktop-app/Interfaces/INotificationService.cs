using System.Windows.Forms;

namespace FlowShield.Desktop.Interfaces;

public interface INotificationService
{
    void SetEnabled(bool enabled);
    void ShowNotification(string title, string message, ToolTipIcon icon = ToolTipIcon.Info);
    void ShowInfo(string title, string message);
    void ShowWarning(string title, string message);
    void ShowError(string title, string message);
    void ShowSuccess(string title, string message);
    void NotifyTrackingStarted();
    void NotifyTrackingPaused();
    void NotifySyncStarted();
    void NotifySyncCompleted(int count, int remaining);
    void NotifySyncFailed(string error);
    void NotifyIdleDetected(int idleMinutes);
    void NotifyActivityResumed();
    void NotifyLoginSuccess();
    void NotifyLoginFailed(string error);
    void NotifyLogout();
    void NotifyDailySummary(int sessions, double hours);
    void NotifyHighProductivity();
    void NotifyLowActivity(int minutes);
}
