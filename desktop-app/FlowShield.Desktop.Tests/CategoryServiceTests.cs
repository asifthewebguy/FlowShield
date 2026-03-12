using System.Collections.Generic;
using FlowShield.Desktop.Models;
using FlowShield.Desktop.Services;
using FluentAssertions;
using Xunit;

namespace FlowShield.Desktop.Tests
{
    public class CategoryServiceTests
    {
        private static CategoryService WithRules(params CategoryRuleModel[] rules) =>
            new CategoryService(new List<CategoryRuleModel>(rules));

        private static CategoryService Empty() => new CategoryService(new List<CategoryRuleModel>());

        [Fact]
        public void CategorizeActivity_MatchesProcessNameRule()
        {
            var svc = WithRules(new CategoryRuleModel { Keyword = "figma", MatchField = "processName", Category = "Creative", Priority = 100 });
            svc.CategorizeActivity("figma", "Untitled").Should().Be(ActivityCategory.Creative);
        }

        [Fact]
        public void CategorizeActivity_MatchesWindowTitleRule()
        {
            var svc = WithRules(new CategoryRuleModel { Keyword = "coursera", MatchField = "windowTitle", Category = "Study", Priority = 100 });
            svc.CategorizeActivity("chrome", "Python Course - Coursera").Should().Be(ActivityCategory.Study);
        }

        [Fact]
        public void CategorizeActivity_HigherPriorityRuleWins()
        {
            var svc = WithRules(
                new CategoryRuleModel { Keyword = "slack", MatchField = "processName", Category = "Communication", Priority = 100 },
                new CategoryRuleModel { Keyword = "slack", MatchField = "processName", Category = "Work", Priority = 200 }
            );
            svc.CategorizeActivity("slack", "General").Should().Be(ActivityCategory.Work);
        }

        [Fact]
        public void CategorizeActivity_FallsBackToHardcodedWhenNoRules()
        {
            Empty().CategorizeActivity("code", "Program.cs - Visual Studio Code").Should().Be(ActivityCategory.Development);
        }

        [Fact]
        public void CategorizeActivity_HardcodedFallback_Browser_YouTube_IsEntertainment()
        {
            Empty().CategorizeActivity("chrome", "YouTube - Google Chrome").Should().Be(ActivityCategory.Entertainment);
        }

        [Fact]
        public void CategorizeActivity_HardcodedFallback_Browser_Twitter_IsSocial()
        {
            Empty().CategorizeActivity("chrome", "Twitter / X").Should().Be(ActivityCategory.Social);
        }

        [Fact]
        public void NormalizeCategory_Productivity_ReturnsWork()
        {
            CategoryService.NormalizeCategory(ActivityCategory.Productivity).Should().Be("Work");
        }

        [Fact]
        public void NormalizeCategory_Social_ReturnsSocialMedia()
        {
            CategoryService.NormalizeCategory(ActivityCategory.Social).Should().Be("Social Media");
        }

        [Fact]
        public void NormalizeCategory_Work_ReturnsWork()
        {
            CategoryService.NormalizeCategory(ActivityCategory.Work).Should().Be("Work");
        }

        [Fact]
        public void NormalizeCategory_Creative_ReturnsCreative()
        {
            CategoryService.NormalizeCategory(ActivityCategory.Creative).Should().Be("Creative");
        }
    }
}
