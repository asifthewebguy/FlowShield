using System;
using System.Windows.Forms;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class LoginForm : Form
    {
        private readonly ApiClient _apiClient;
        private readonly SyncService _syncService;
        private readonly DatabaseService _dbService;
        private TextBox? _emailTextBox;
        private TextBox? _passwordTextBox;
        private CheckBox? _rememberMeCheckbox;
        private Button? _loginButton;
        private Button? _cancelButton;
        private Label? _statusLabel;

        public LoginForm(ApiClient apiClient, SyncService syncService, DatabaseService dbService)
        {
            _apiClient = apiClient;
            _syncService = syncService;
            _dbService = dbService;
            InitializeComponents();
        }

        private void InitializeComponents()
        {
            Text = "FlowShield Login";
            Width = 400;
            Height = 360; // Increased height for checkbox
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;

            // Title
            var titleLabel = new Label
            {
                Text = "Sign in to FlowShield",
                Font = new System.Drawing.Font("Segoe UI", 14, System.Drawing.FontStyle.Bold),
                AutoSize = true,
                Location = new System.Drawing.Point(20, 20)
            };
            Controls.Add(titleLabel);

            // Email
            var emailLabel = new Label
            {
                Text = "Email:",
                Location = new System.Drawing.Point(20, 60),
                AutoSize = true
            };
            Controls.Add(emailLabel);

            _emailTextBox = new TextBox
            {
                Location = new System.Drawing.Point(20, 85),
                Width = 340,
                PlaceholderText = "your@email.com"
            };
            
            // Pre-fill email if saved
            var savedEmail = _dbService.GetSetting("UserEmail");
            if (!string.IsNullOrEmpty(savedEmail))
            {
                _emailTextBox.Text = savedEmail;
            }
            
            Controls.Add(_emailTextBox);

            // Password
            var passwordLabel = new Label
            {
                Text = "Password:",
                Location = new System.Drawing.Point(20, 115),
                AutoSize = true
            };
            Controls.Add(passwordLabel);

            _passwordTextBox = new TextBox
            {
                Location = new System.Drawing.Point(20, 140),
                Width = 340,
                UseSystemPasswordChar = true
            };
            _passwordTextBox.KeyPress += (s, e) =>
            {
                if (e.KeyChar == (char)Keys.Enter)
                {
                    LoginButton_Click(s, e);
                    e.Handled = true;
                }
            };
            Controls.Add(_passwordTextBox);

            // Status Label
            _statusLabel = new Label
            {
                Location = new System.Drawing.Point(20, 175),
                Width = 340,
                ForeColor = System.Drawing.Color.Red,
                Text = ""
            };
            Controls.Add(_statusLabel);

            // Remember Me Checkbox
            _rememberMeCheckbox = new CheckBox
            {
                Text = "Remember me for 30 days",
                Location = new System.Drawing.Point(20, 205),
                AutoSize = true
            };
            Controls.Add(_rememberMeCheckbox);

            // Login Button
            _loginButton = new Button
            {
                Text = "Login",
                Location = new System.Drawing.Point(180, 240),
                Width = 85,
                Height = 30
            };
            _loginButton.Click += LoginButton_Click;
            Controls.Add(_loginButton);

            // Cancel Button
            _cancelButton = new Button
            {
                Text = "Cancel",
                Location = new System.Drawing.Point(275, 240),
                Width = 85,
                Height = 30
            };
            _cancelButton.Click += (s, e) => { DialogResult = DialogResult.Cancel; Close(); };
            Controls.Add(_cancelButton);

            AcceptButton = _loginButton;
            CancelButton = _cancelButton;
        }

        private async void LoginButton_Click(object? sender, EventArgs e)
        {
            if (_emailTextBox == null || _passwordTextBox == null ||
                _loginButton == null || _statusLabel == null)
                return;

            var email = _emailTextBox.Text.Trim();
            var password = _passwordTextBox.Text;

            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
            {
                _statusLabel.Text = "Please enter email and password";
                return;
            }

            _loginButton.Enabled = false;
            _loginButton.Text = "Logging in...";
            _statusLabel.Text = "";

            try
            {
                var rememberMe = _rememberMeCheckbox?.Checked ?? false;
                var success = await _apiClient.LoginAsync(email, password, rememberMe);

                if (success)
                {
                    _syncService.Start();
                    DialogResult = DialogResult.OK;
                    Close();
                }
                else
                {
                    _statusLabel.Text = "Invalid email or password";
                    _loginButton.Enabled = true;
                    _loginButton.Text = "Login";
                }
            }
            catch (Exception ex)
            {
                _statusLabel.Text = $"Error: {ex.Message}";
                _loginButton.Enabled = true;
                _loginButton.Text = "Login";
            }
        }
    }
}
