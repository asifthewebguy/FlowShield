using System;
using System.Linq;
using System.Windows.Forms;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class SettingsForm : Form
    {
        private readonly DatabaseService _dbService;
        private readonly ApiClient _apiClient;
        private readonly NotificationService _notificationService;
        private TextBox? _apiUrlTextBox;
        private NumericUpDown? _trackingIntervalInput;
        private NumericUpDown? _syncIntervalInput;
        private CheckBox? _startWithWindowsCheckBox;
        private CheckBox? _showNotificationsCheckBox;

        // Cloud preferences controls
        private NumericUpDown? _preferredDurationInput;
        private ComboBox? _workStyleCombo;
        private CheckBox? _breakRemindersCheckBox;
        private CheckBox? _soundEnabledCheckBox;
        private Label? _cloudStatusLabel;
        private TextBox? _customAppsTextBox;

        public SettingsForm(DatabaseService dbService, ApiClient apiClient, NotificationService notificationService)
        {
            _dbService = dbService;
            _apiClient = apiClient;
            _notificationService = notificationService;
            InitializeComponents();
            LoadSettings();
        }

        private void InitializeComponents()
        {
            Text = "FlowShield Settings";
            Width = 500;
            Height = 840;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            // Title
            var titleLabel = new Label
            {
                Text = "Settings",
                Font = new System.Drawing.Font("Segoe UI", 14, System.Drawing.FontStyle.Bold),
                AutoSize = true,
                Location = new System.Drawing.Point(20, 20)
            };
            Controls.Add(titleLabel);

            // API URL
            var apiUrlLabel = new Label
            {
                Text = "API Server URL:",
                Location = new System.Drawing.Point(20, 60),
                AutoSize = true
            };
            Controls.Add(apiUrlLabel);

            _apiUrlTextBox = new TextBox
            {
                Location = new System.Drawing.Point(20, 85),
                Width = 440,
                Text = "https://flowshield.app",
                ReadOnly = true
            };
            Controls.Add(_apiUrlTextBox);

            // Tracking Interval
            var trackingLabel = new Label
            {
                Text = "Activity Tracking Interval (seconds):",
                Location = new System.Drawing.Point(20, 120),
                AutoSize = true
            };
            Controls.Add(trackingLabel);

            _trackingIntervalInput = new NumericUpDown
            {
                Location = new System.Drawing.Point(20, 145),
                Width = 100,
                Minimum = 1,
                Maximum = 60,
                Value = 5
            };
            Controls.Add(_trackingIntervalInput);

            // Sync Interval
            var syncLabel = new Label
            {
                Text = "Sync Interval (minutes):",
                Location = new System.Drawing.Point(20, 180),
                AutoSize = true
            };
            Controls.Add(syncLabel);

            _syncIntervalInput = new NumericUpDown
            {
                Location = new System.Drawing.Point(20, 205),
                Width = 100,
                Minimum = 1,
                Maximum = 60,
                Value = 5
            };
            Controls.Add(_syncIntervalInput);

            // Idle Threshold
            var idleLabel = new Label
            {
                Text = "Idle Threshold (minutes):",
                Location = new System.Drawing.Point(20, 240),
                AutoSize = true
            };
            Controls.Add(idleLabel);

            var idleIntervalInput = new NumericUpDown
            {
                Location = new System.Drawing.Point(20, 265),
                Width = 100,
                Minimum = 1,
                Maximum = 30,
                Value = 5
            };
            Controls.Add(idleIntervalInput);

            // Track Input Activity
            var trackInputCheckBox = new CheckBox
            {
                Text = "Track keyboard/mouse activity (for idle detection)",
                Location = new System.Drawing.Point(20, 300),
                Width = 440,
                Checked = true
            };
            Controls.Add(trackInputCheckBox);

            // Start with Windows
            _startWithWindowsCheckBox = new CheckBox
            {
                Text = "Start with Windows",
                Location = new System.Drawing.Point(20, 330),
                AutoSize = true,
                Checked = true
            };
            Controls.Add(_startWithWindowsCheckBox);

            // Show Notifications
            _showNotificationsCheckBox = new CheckBox
            {
                Text = "Show notifications",
                Location = new System.Drawing.Point(20, 360),
                AutoSize = true,
                Checked = true
            };
            Controls.Add(_showNotificationsCheckBox);

            // Privacy Notice
            var privacyLabel = new Label
            {
                Text = "Privacy Note: We only track which applications are active.\nNo actual keystrokes or mouse coordinates are recorded.",
                Location = new System.Drawing.Point(20, 390),
                Width = 440,
                Height = 40,
                ForeColor = System.Drawing.Color.Gray
            };
            Controls.Add(privacyLabel);

            // ── Cloud Preferences separator ──────────────────────────────────────
            var cloudSep = new Label
            {
                Text = "──────  Cloud Preferences  ──────",
                Location = new System.Drawing.Point(20, 448),
                Width = 440,
                Height = 18,
                ForeColor = System.Drawing.Color.FromArgb(100, 200, 200, 200),
                Font = new System.Drawing.Font("Segoe UI", 9)
            };
            Controls.Add(cloudSep);

            // Preferred Duration
            var prefDurLabel = new Label
            {
                Text = "Preferred Session Duration (minutes):",
                Location = new System.Drawing.Point(20, 474),
                AutoSize = true
            };
            Controls.Add(prefDurLabel);

            _preferredDurationInput = new NumericUpDown
            {
                Location = new System.Drawing.Point(20, 499),
                Width = 100,
                Minimum = 5,
                Maximum = 240,
                Value = 25
            };
            Controls.Add(_preferredDurationInput);

            // Work Style
            var workStyleLabel = new Label
            {
                Text = "Work Style:",
                Location = new System.Drawing.Point(140, 474),
                AutoSize = true
            };
            Controls.Add(workStyleLabel);

            _workStyleCombo = new ComboBox
            {
                Location = new System.Drawing.Point(140, 499),
                Width = 160,
                DropDownStyle = ComboBoxStyle.DropDownList
            };
            _workStyleCombo.Items.AddRange(new object[] { "focused", "balanced", "flexible" });
            _workStyleCombo.SelectedIndex = 0;
            Controls.Add(_workStyleCombo);

            // Break Reminders
            _breakRemindersCheckBox = new CheckBox
            {
                Text = "Break reminders",
                Location = new System.Drawing.Point(20, 538),
                AutoSize = true,
                Checked = true
            };
            Controls.Add(_breakRemindersCheckBox);

            // Sound Enabled
            _soundEnabledCheckBox = new CheckBox
            {
                Text = "Sound enabled",
                Location = new System.Drawing.Point(160, 538),
                AutoSize = true,
                Checked = true
            };
            Controls.Add(_soundEnabledCheckBox);

            // Cloud status label
            _cloudStatusLabel = new Label
            {
                Text = "",
                Location = new System.Drawing.Point(20, 568),
                Width = 440,
                Height = 20,
                ForeColor = System.Drawing.Color.LightGreen
            };
            Controls.Add(_cloudStatusLabel);

            // ── Custom Blocked Apps separator ─────────────────────────────────────
            var appsSep = new Label
            {
                Text = "──────  Custom Blocked Apps  ──────",
                Location = new System.Drawing.Point(20, 598),
                Width = 440,
                Height = 18,
                ForeColor = System.Drawing.Color.FromArgb(100, 200, 200, 200),
                Font = new System.Drawing.Font("Segoe UI", 9)
            };
            Controls.Add(appsSep);

            var appsHintLabel = new Label
            {
                Text = "Process names to block during focus sessions (one per line, no .exe):",
                Location = new System.Drawing.Point(20, 622),
                Width = 440,
                AutoSize = true,
                ForeColor = System.Drawing.Color.Gray
            };
            Controls.Add(appsHintLabel);

            _customAppsTextBox = new TextBox
            {
                Location = new System.Drawing.Point(20, 645),
                Width = 440,
                Height = 80,
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                AcceptsReturn = true
            };
            Controls.Add(_customAppsTextBox);

            // Save Button
            var saveButton = new Button
            {
                Text = "Save",
                Location = new System.Drawing.Point(285, 738),
                Width = 85,
                Height = 30
            };
            saveButton.Click += SaveButton_Click;
            Controls.Add(saveButton);

            // Cancel Button
            var cancelButton = new Button
            {
                Text = "Cancel",
                Location = new System.Drawing.Point(380, 738),
                Width = 85,
                Height = 30
            };
            cancelButton.Click += (s, e) => Close();
            Controls.Add(cancelButton);
        }

        private void LoadSettings()
        {
            if (_apiUrlTextBox != null)
            {
                var apiUrl = _dbService.GetSetting("ApiBaseUrl");
                // Auto-migrate localhost to production
                if (string.IsNullOrEmpty(apiUrl) || apiUrl == "http://localhost:3000")
                {
                    apiUrl = "https://flowshield.app";
                    _dbService.SaveSetting("ApiBaseUrl", apiUrl);
                }
                _apiUrlTextBox.Text = apiUrl;
            }

            if (_trackingIntervalInput != null)
            {
                var trackingInterval = _dbService.GetSetting("TrackingIntervalSeconds");
                if (int.TryParse(trackingInterval, out int interval))
                    _trackingIntervalInput.Value = interval;
            }

            if (_syncIntervalInput != null)
            {
                var syncInterval = _dbService.GetSetting("SyncIntervalMinutes");
                if (int.TryParse(syncInterval, out int interval))
                    _syncIntervalInput.Value = interval;
            }

            if (_startWithWindowsCheckBox != null)
            {
                var startWithWindows = _dbService.GetSetting("StartWithWindows");
                if (bool.TryParse(startWithWindows, out bool start))
                    _startWithWindowsCheckBox.Checked = start;
            }

            if (_showNotificationsCheckBox != null)
            {
                var showNotifications = _dbService.GetSetting("ShowNotifications");
                if (bool.TryParse(showNotifications, out bool show))
                    _showNotificationsCheckBox.Checked = show;
            }

            // Load custom blocked apps
            if (_customAppsTextBox != null)
            {
                var customApps = _dbService.GetSetting("CustomBlockedApps") ?? "";
                _customAppsTextBox.Text = customApps.Replace(",", "\r\n");
            }

            // Load cloud preferences asynchronously
            _ = LoadCloudPreferencesAsync();
        }

        private async System.Threading.Tasks.Task LoadCloudPreferencesAsync()
        {
            try
            {
                var prefs = await _apiClient.GetUserPreferencesAsync();
                if (prefs == null) return;

                if (_preferredDurationInput != null && prefs.PreferredDuration > 0)
                    _preferredDurationInput.Value = Math.Max(5, Math.Min(240, prefs.PreferredDuration));

                if (_workStyleCombo != null && !string.IsNullOrEmpty(prefs.WorkStyle))
                {
                    var idx = _workStyleCombo.Items.IndexOf(prefs.WorkStyle.ToLower());
                    if (idx >= 0) _workStyleCombo.SelectedIndex = idx;
                }

                if (_breakRemindersCheckBox != null)
                    _breakRemindersCheckBox.Checked = prefs.BreakReminders;

                if (_soundEnabledCheckBox != null)
                    _soundEnabledCheckBox.Checked = prefs.SoundEnabled;
            }
            catch { /* cloud prefs are optional — silently ignore */ }
        }

        private async System.Threading.Tasks.Task SaveCloudPreferencesAsync()
        {
            try
            {
                var update = new Services.PreferencesUpdate
                {
                    PreferredDuration = _preferredDurationInput != null
                        ? (int)_preferredDurationInput.Value : null,
                    WorkStyle = _workStyleCombo?.SelectedItem?.ToString(),
                    BreakReminders = _breakRemindersCheckBox?.Checked,
                    SoundEnabled   = _soundEnabledCheckBox?.Checked,
                };

                var result = await _apiClient.UpdatePreferencesAsync(update);
                if (_cloudStatusLabel != null)
                {
                    _cloudStatusLabel.Text      = result != null ? "Cloud preferences synced." : "Could not sync cloud preferences.";
                    _cloudStatusLabel.ForeColor  = result != null
                        ? System.Drawing.Color.LightGreen
                        : System.Drawing.Color.OrangeRed;
                }
            }
            catch { /* silently ignore cloud failures */ }
        }

        private void SaveButton_Click(object? sender, EventArgs e)
        {
            if (_apiUrlTextBox != null)
                _dbService.SaveSetting("ApiBaseUrl", _apiUrlTextBox.Text);

            if (_trackingIntervalInput != null)
                _dbService.SaveSetting("TrackingIntervalSeconds", _trackingIntervalInput.Value.ToString());

            if (_syncIntervalInput != null)
                _dbService.SaveSetting("SyncIntervalMinutes", _syncIntervalInput.Value.ToString());

            if (_startWithWindowsCheckBox != null)
                _dbService.SaveSetting("StartWithWindows", _startWithWindowsCheckBox.Checked.ToString());

            if (_showNotificationsCheckBox != null)
            {
                var show = _showNotificationsCheckBox.Checked;
                _dbService.SaveSetting("ShowNotifications", show.ToString());
                _notificationService.SetEnabled(show);
            }

            // Save custom blocked apps (stored as comma-separated process names)
            if (_customAppsTextBox != null)
            {
                var apps = _customAppsTextBox.Text
                    .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(a => a.Trim().ToLowerInvariant())
                    .Where(a => a.Length > 0);
                _dbService.SaveSetting("CustomBlockedApps", string.Join(",", apps));
            }

            // Save cloud preferences
            _ = SaveCloudPreferencesAsync();

            MessageBox.Show(
                "Settings saved successfully!",
                "Settings Saved",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );

            Close();
        }
    }
}
