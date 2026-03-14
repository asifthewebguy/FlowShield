using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.UI
{
    public class ProjectRowViewModel
    {
        public string Name { get; set; } = "";
        public Brush ColorBrush { get; set; } = Brushes.SteelBlue;
        public string SessionCountText { get; set; } = "";

        public static ProjectRowViewModel From(ProjectModel p)
        {
            Brush brush;
            try { brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(p.Color)); }
            catch { brush = new SolidColorBrush(Color.FromRgb(0x3B, 0x82, 0xF6)); }

            return new ProjectRowViewModel
            {
                Name             = p.Name,
                ColorBrush       = brush,
                SessionCountText = p.SessionCount == 1 ? "1 session" : $"{p.SessionCount} sessions",
            };
        }
    }

    public partial class ProjectsWindow : Window
    {
        private readonly ApiClient _apiClient;
        private string _selectedColor = "#3b82f6";

        // Color swatch borders for selection tracking
        private readonly List<Border> _swatches = new();

        public ProjectsWindow(ApiClient apiClient)
        {
            InitializeComponent();
            _apiClient = apiClient;
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);

            // Collect swatches after XAML tree is built
            _swatches.AddRange(new[] { Color1, Color2, Color3, Color4, Color5, Color6 });

            _ = LoadProjectsAsync();
        }

        private async System.Threading.Tasks.Task LoadProjectsAsync()
        {
            RefreshBtn.IsEnabled = false;
            try
            {
                var projects = await _apiClient.GetProjectsAsync();
                RenderProjects(projects);
            }
            finally
            {
                RefreshBtn.IsEnabled = true;
            }
        }

        private void RenderProjects(List<ProjectModel>? projects)
        {
            if (projects == null || projects.Count == 0)
            {
                ProjectsList.ItemsSource = null;
                EmptyText.Visibility = Visibility.Visible;
                return;
            }

            EmptyText.Visibility = Visibility.Collapsed;
            var rows = new List<ProjectRowViewModel>();
            foreach (var p in projects)
                rows.Add(ProjectRowViewModel.From(p));

            ProjectsList.ItemsSource = rows;
        }

        private void ColorSwatch_Click(object sender, MouseButtonEventArgs e)
        {
            if (sender is not Border swatch) return;
            _selectedColor = swatch.Tag?.ToString() ?? "#3b82f6";

            // Highlight selected, clear others
            foreach (var s in _swatches)
                s.BorderBrush = Brushes.Transparent;

            swatch.BorderBrush = Brushes.White;
        }

        private async void CreateProject_Click(object sender, RoutedEventArgs e)
        {
            var name = ProjectNameBox.Text.Trim();
            if (string.IsNullOrEmpty(name))
            {
                ShowStatus("Project name cannot be empty.", isError: true);
                return;
            }

            CreateBtn.IsEnabled = false;
            ProjectStatusText.Visibility = Visibility.Collapsed;
            try
            {
                var project = await _apiClient.CreateProjectAsync(name, _selectedColor);
                if (project != null)
                {
                    ProjectNameBox.Text = "";
                    ShowStatus($"Project \"{project.Name}\" created!", isError: false);
                    await LoadProjectsAsync();
                }
            }
            catch (InvalidOperationException ex)
            {
                ShowStatus(ex.Message, isError: true);
            }
            catch (Exception ex)
            {
                ShowStatus($"Failed: {ex.Message}", isError: true);
            }
            finally
            {
                CreateBtn.IsEnabled = true;
            }
        }

        private void ShowStatus(string message, bool isError)
        {
            ProjectStatusText.Text       = message;
            ProjectStatusText.Foreground = isError ? Brushes.Salmon : Brushes.MediumSpringGreen;
            ProjectStatusText.Visibility = Visibility.Visible;
        }

        private void RefreshButton_Click(object sender, RoutedEventArgs e)
            => _ = LoadProjectsAsync();

        private void CloseButton_Click(object sender, RoutedEventArgs e)
            => Hide();

        private void DragWindow(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
