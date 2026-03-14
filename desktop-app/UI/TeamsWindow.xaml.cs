using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class TeamRowViewModel
    {
        public string Name { get; set; } = "";
        public string RoleText { get; set; } = "";
        public Brush RoleBadgeBackground { get; set; } = Brushes.Transparent;
        public Brush RoleBadgeForeground { get; set; } = Brushes.White;
        public Brush RowBackground { get; set; } = new SolidColorBrush(Color.FromArgb(0x0F, 0xFF, 0xFF, 0xFF));
        public string MemberText { get; set; } = "";
        public string InviteCodeText { get; set; } = "";
        public Visibility InviteCodeVisibility { get; set; } = Visibility.Collapsed;

        public static TeamRowViewModel From(TeamModel team)
        {
            var isOwner = string.Equals(team.MyRole, "OWNER", StringComparison.OrdinalIgnoreCase);

            return new TeamRowViewModel
            {
                Name = team.Name,
                RoleText = isOwner ? "OWNER" : "MEMBER",
                RoleBadgeBackground = isOwner
                    ? new SolidColorBrush(Color.FromArgb(0x20, 0x3B, 0x82, 0xF6))
                    : new SolidColorBrush(Color.FromArgb(0x18, 0xFF, 0xFF, 0xFF)),
                RoleBadgeForeground = isOwner
                    ? new SolidColorBrush(Color.FromRgb(0x93, 0xC5, 0xFD))
                    : new SolidColorBrush(Color.FromRgb(0x9C, 0xA3, 0xAF)),
                RowBackground = new SolidColorBrush(Color.FromArgb(0x0F, 0xFF, 0xFF, 0xFF)),
                MemberText = team.MemberCount == 1 ? "1 member" : $"{team.MemberCount} members",
                InviteCodeText = isOwner ? $"Invite code: {team.InviteCode}" : "",
                InviteCodeVisibility = isOwner ? Visibility.Visible : Visibility.Collapsed,
            };
        }
    }

    public partial class TeamsWindow : Window
    {
        private readonly ApiClient _apiClient;

        public TeamsWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);
            _ = LoadTeamsAsync();
        }

        private async System.Threading.Tasks.Task LoadTeamsAsync()
        {
            LoadingText.Visibility = Visibility.Visible;
            EmptyText.Visibility   = Visibility.Collapsed;
            TeamsList.ItemsSource  = null;

            var teams = await _apiClient.GetTeamsAsync();

            LoadingText.Visibility = Visibility.Collapsed;

            if (teams == null || teams.Count == 0)
            {
                EmptyText.Visibility = Visibility.Visible;
                return;
            }

            var rows = new List<TeamRowViewModel>();
            foreach (var t in teams)
                rows.Add(TeamRowViewModel.From(t));

            TeamsList.ItemsSource = rows;
        }

        private async void CreateButton_Click(object sender, RoutedEventArgs e)
            => await CreateTeamAsync();

        private async void CreateNameBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && !e.IsRepeat)
            {
                e.Handled = true;
                await CreateTeamAsync();
            }
        }

        private async System.Threading.Tasks.Task CreateTeamAsync()
        {
            var name = CreateNameBox.Text.Trim();
            if (string.IsNullOrEmpty(name)) return;

            SetBusy(true);
            HideCreateStatus();

            try
            {
                var team = await _apiClient.CreateTeamAsync(name);
                if (team != null)
                {
                    CreateNameBox.Text = "";
                    await LoadTeamsAsync();
                }
            }
            catch (InvalidOperationException ex)
            {
                ShowCreateStatus(ex.Message, isError: true);
            }
            catch (Exception ex)
            {
                ShowCreateStatus($"Failed to create team: {ex.Message}", isError: true);
            }
            finally
            {
                SetBusy(false);
            }
        }

        private async void JoinButton_Click(object sender, RoutedEventArgs e)
            => await JoinTeamAsync();

        private async void InviteCodeBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && !e.IsRepeat)
            {
                e.Handled = true;
                await JoinTeamAsync();
            }
        }

        private async System.Threading.Tasks.Task JoinTeamAsync()
        {
            var code = InviteCodeBox.Text.Trim();
            if (string.IsNullOrEmpty(code)) return;

            SetBusy(true);
            HideJoinStatus();

            try
            {
                var team = await _apiClient.JoinTeamAsync(code);
                if (team != null)
                {
                    InviteCodeBox.Text = "";
                    ShowJoinStatus($"Joined \"{team.Name}\"!", isError: false);
                    await LoadTeamsAsync();
                }
            }
            catch (InvalidOperationException ex)
            {
                ShowJoinStatus(ex.Message, isError: true);
            }
            catch (Exception ex)
            {
                ShowJoinStatus($"Failed to join team: {ex.Message}", isError: true);
            }
            finally
            {
                SetBusy(false);
            }
        }

        private void SetBusy(bool busy)
        {
            CreateBtn.IsEnabled = !busy;
            JoinBtn.IsEnabled   = !busy;
        }

        private void ShowCreateStatus(string msg, bool isError)
        {
            CreateStatusText.Text       = msg;
            CreateStatusText.Foreground = isError
                ? System.Windows.Media.Brushes.Salmon
                : System.Windows.Media.Brushes.MediumSpringGreen;
            CreateStatusText.Visibility = Visibility.Visible;
        }

        private void HideCreateStatus() =>
            CreateStatusText.Visibility = Visibility.Collapsed;

        private void ShowJoinStatus(string msg, bool isError)
        {
            JoinStatusText.Text       = msg;
            JoinStatusText.Foreground = isError
                ? System.Windows.Media.Brushes.Salmon
                : System.Windows.Media.Brushes.MediumSpringGreen;
            JoinStatusText.Visibility = Visibility.Visible;
        }

        private void HideJoinStatus() =>
            JoinStatusText.Visibility = Visibility.Collapsed;

        private void CloseButton_Click(object sender, RoutedEventArgs e) => Hide();

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
