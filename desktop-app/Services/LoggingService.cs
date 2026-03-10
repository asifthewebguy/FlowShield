using System;
using System.IO;
using Serilog;

namespace FlowShield.Desktop.Services
{
    public static class LoggingService
    {
        public static ILogger Logger { get; private set; } = Serilog.Core.Logger.None;

        /// <summary>
        /// Initializes Serilog with daily rolling file output.
        /// Log files are written to %LOCALAPPDATA%\FlowShield\logs\flowshield-.log
        /// </summary>
        public static void Initialize()
        {
            var logPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FlowShield",
                "logs",
                "flowshield-.log"
            );

            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Debug()
                .WriteTo.File(
                    logPath,
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7,
                    fileSizeLimitBytes: 10 * 1024 * 1024 // 10MB
                )
                .CreateLogger();

            Logger = Log.Logger;
            Logger.Information("FlowShield logging initialized");
        }

        /// <summary>
        /// Flushes and closes the Serilog logger.
        /// </summary>
        public static void Shutdown()
        {
            Logger.Information("FlowShield logging shutting down");
            Log.CloseAndFlush();
        }
    }
}
