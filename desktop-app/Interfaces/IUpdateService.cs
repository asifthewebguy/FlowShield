using System.Threading.Tasks;
using FlowShield.Desktop.Services;

namespace FlowShield.Desktop.Interfaces;

public interface IUpdateService
{
    string CurrentVersion { get; }
    Task<UpdateInfo?> CheckForUpdateAsync();
    Task CheckAndPromptAsync();
}
