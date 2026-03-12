using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using FlowShield.Desktop.Models;

namespace FlowShield.Desktop.Services
{
    public class CategoryRuleModel
    {
        public string Keyword { get; set; } = string.Empty;
        public string MatchField { get; set; } = "applicationName";
        public string Category { get; set; } = "Unknown";
        public int Priority { get; set; } = 100;
    }

    public class CategoryService
    {
        private readonly ApiClient _apiClient;
        private readonly DatabaseService _dbService;
        private List<CategoryRuleModel> _rules = new();

        private static readonly Dictionary<ActivityCategory, string> _normalizationMap = new()
        {
            { ActivityCategory.Productivity, "Work" },
            { ActivityCategory.Social, "Social Media" },
            { ActivityCategory.Development, "Development" },
            { ActivityCategory.Communication, "Communication" },
            { ActivityCategory.Entertainment, "Entertainment" },
            { ActivityCategory.Browsing, "Browsing" },
            { ActivityCategory.Work, "Work" },
            { ActivityCategory.Creative, "Creative" },
            { ActivityCategory.Study, "Study" },
            { ActivityCategory.Unknown, "Unknown" },
        };

        public CategoryService(ApiClient apiClient, DatabaseService dbService)
        {
            _apiClient = apiClient;
            _dbService = dbService;
        }

        /// <summary>Test-only constructor that injects rules directly.</summary>
        internal CategoryService(List<CategoryRuleModel> rules)
        {
            _apiClient = null!;
            _dbService = null!;
            _rules = rules;
        }

        public async Task LoadAsync()
        {
            _rules = _dbService.GetCachedCategoryRules();
            var lastSync = _dbService.GetLastCategoryRuleSync();
            if (lastSync == null || (DateTime.UtcNow - lastSync.Value).TotalHours > 24)
                await SyncRulesFromServerAsync();
        }

        public async Task SyncRulesFromServerAsync()
        {
            try
            {
                var rules = await _apiClient.GetCategoryRulesAsync();
                if (rules != null && rules.Count > 0)
                {
                    _rules = rules;
                    _dbService.SaveCategoryRules(rules);
                    _dbService.UpdateLastCategoryRuleSync(DateTime.UtcNow);
                }
            }
            catch { }
        }

        public ActivityCategory CategorizeActivity(string processName, string windowTitle)
        {
            var proc = processName.ToLower();
            var title = windowTitle.ToLower();

            foreach (var rule in _rules.OrderByDescending(r => r.Priority))
            {
                var haystack = rule.MatchField switch
                {
                    "processName" => proc,
                    "windowTitle" => title,
                    _ => proc + " " + title,
                };
                if (haystack.Contains(rule.Keyword.ToLower()))
                    return ParseCategory(rule.Category);
            }

            return FallbackCategorize(proc, title);
        }

        public static string NormalizeCategory(ActivityCategory category)
        {
            return _normalizationMap.TryGetValue(category, out var name) ? name : "Unknown";
        }

        private static ActivityCategory FallbackCategorize(string process, string title)
        {
            if (process.Contains("code") || process.Contains("studio") ||
                process.Contains("rider") || process.Contains("eclipse") ||
                title.Contains("visual studio") || title.Contains("vscode"))
                return ActivityCategory.Development;

            if (process.Contains("slack") || process.Contains("teams") ||
                process.Contains("discord") || process.Contains("outlook") ||
                process.Contains("thunderbird") || title.Contains("gmail"))
                return ActivityCategory.Communication;

            if (process.Contains("chrome") || process.Contains("firefox") ||
                process.Contains("edge") || process.Contains("brave"))
            {
                if (title.Contains("youtube") || title.Contains("netflix") ||
                    title.Contains("twitch") || title.Contains("spotify"))
                    return ActivityCategory.Entertainment;
                if (title.Contains("facebook") || title.Contains("twitter") ||
                    title.Contains("instagram") || title.Contains("linkedin") ||
                    title.Contains("reddit"))
                    return ActivityCategory.Social;
                if (title.Contains("github") || title.Contains("stackoverflow") ||
                    title.Contains("docs.") || title.Contains("documentation"))
                    return ActivityCategory.Development;
                return ActivityCategory.Browsing;
            }

            if (process.Contains("excel") || process.Contains("word") ||
                process.Contains("powerpoint") || process.Contains("notion") ||
                process.Contains("onenote") || process.Contains("evernote"))
                return ActivityCategory.Productivity;

            if (process.Contains("figma") || process.Contains("photoshop") ||
                process.Contains("illustrator") || process.Contains("canva") ||
                process.Contains("sketch") || title.Contains("figma"))
                return ActivityCategory.Creative;

            if (process.Contains("anki") || title.Contains("coursera") ||
                title.Contains("udemy") || title.Contains("khan academy") ||
                title.Contains("duolingo"))
                return ActivityCategory.Study;

            return ActivityCategory.Unknown;
        }

        private static ActivityCategory ParseCategory(string category) => category switch
        {
            "Development" => ActivityCategory.Development,
            "Work" => ActivityCategory.Work,
            "Communication" => ActivityCategory.Communication,
            "Entertainment" => ActivityCategory.Entertainment,
            "Social Media" => ActivityCategory.Social,
            "Browsing" => ActivityCategory.Browsing,
            "Creative" => ActivityCategory.Creative,
            "Study" => ActivityCategory.Study,
            _ => ActivityCategory.Unknown,
        };
    }
}
