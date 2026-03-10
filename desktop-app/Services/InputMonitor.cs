using FlowShield.Desktop.Interfaces;
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace FlowShield.Desktop.Services
{
    public class InputMonitor : IDisposable, IInputMonitor
    {
        private IntPtr _keyboardHookId = IntPtr.Zero;
        private IntPtr _mouseHookId = IntPtr.Zero;
        private LowLevelKeyboardProc? _keyboardProc;
        private LowLevelMouseProc? _mouseProc;

        private DateTime _lastInputTime = DateTime.Now;
        private int _keystrokeCount = 0;
        private int _mouseClickCount = 0;
        private int _mouseMovementCount = 0;

        private readonly object _lockObject = new object();
        private System.Threading.Timer? _resetTimer;

        public event EventHandler<InputActivityEventArgs>? ActivityDetected;

        // Idle threshold in seconds (default: 5 minutes)
        public int IdleThresholdSeconds { get; set; } = 300;

        public InputMonitor()
        {
            // Reset counters every minute
            _resetTimer = new Timer(ResetCounters, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1));
        }

        public void Start()
        {
            _keyboardProc = KeyboardHookCallback;
            _mouseProc = MouseHookCallback;

            _keyboardHookId = SetKeyboardHook(_keyboardProc);
            _mouseHookId = SetMouseHook(_mouseProc);
        }

        public void Stop()
        {
            if (_keyboardHookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_keyboardHookId);
                _keyboardHookId = IntPtr.Zero;
            }

            if (_mouseHookId != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_mouseHookId);
                _mouseHookId = IntPtr.Zero;
            }
        }

        public bool IsIdle()
        {
            var idleTime = GetIdleTimeSeconds();
            return idleTime >= IdleThresholdSeconds;
        }

        public int GetIdleTimeSeconds()
        {
            lock (_lockObject)
            {
                return (int)(DateTime.Now - _lastInputTime).TotalSeconds;
            }
        }

        public InputActivityStats GetActivityStats()
        {
            lock (_lockObject)
            {
                return new InputActivityStats
                {
                    KeystrokeCount = _keystrokeCount,
                    MouseClickCount = _mouseClickCount,
                    MouseMovementCount = _mouseMovementCount,
                    LastInputTime = _lastInputTime,
                    IdleTimeSeconds = GetIdleTimeSeconds()
                };
            }
        }

        private void ResetCounters(object? state)
        {
            lock (_lockObject)
            {
                _keystrokeCount = 0;
                _mouseClickCount = 0;
                _mouseMovementCount = 0;
            }
        }

        private void RecordInput(InputType type)
        {
            lock (_lockObject)
            {
                _lastInputTime = DateTime.Now;

                switch (type)
                {
                    case InputType.Keystroke:
                        _keystrokeCount++;
                        break;
                    case InputType.MouseClick:
                        _mouseClickCount++;
                        break;
                    case InputType.MouseMove:
                        _mouseMovementCount++;
                        break;
                }

                ActivityDetected?.Invoke(this, new InputActivityEventArgs
                {
                    Type = type,
                    Timestamp = _lastInputTime,
                    IsIdle = false
                });
            }
        }

        // Keyboard Hook
        private IntPtr SetKeyboardHook(LowLevelKeyboardProc proc)
        {
            using var curProcess = Process.GetCurrentProcess();
            using var curModule = curProcess.MainModule;
            if (curModule != null)
            {
                return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
            return IntPtr.Zero;
        }

        private IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && wParam == (IntPtr)WM_KEYDOWN)
            {
                RecordInput(InputType.Keystroke);
            }
            return CallNextHookEx(_keyboardHookId, nCode, wParam, lParam);
        }

        // Mouse Hook
        private IntPtr SetMouseHook(LowLevelMouseProc proc)
        {
            using var curProcess = Process.GetCurrentProcess();
            using var curModule = curProcess.MainModule;
            if (curModule != null)
            {
                return SetWindowsHookEx(WH_MOUSE_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
            return IntPtr.Zero;
        }

        private IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                if (wParam == (IntPtr)WM_LBUTTONDOWN || wParam == (IntPtr)WM_RBUTTONDOWN || wParam == (IntPtr)WM_MBUTTONDOWN)
                {
                    RecordInput(InputType.MouseClick);
                }
                else if (wParam == (IntPtr)WM_MOUSEMOVE)
                {
                    // Only record mouse movement occasionally to avoid excessive events
                    if (_mouseMovementCount % 100 == 0)
                    {
                        RecordInput(InputType.MouseMove);
                    }
                }
            }
            return CallNextHookEx(_mouseHookId, nCode, wParam, lParam);
        }

        public void Dispose()
        {
            Stop();
            _resetTimer?.Dispose();
        }

        // Windows API constants and delegates
        private const int WH_KEYBOARD_LL = 13;
        private const int WH_MOUSE_LL = 14;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_MBUTTONDOWN = 0x0207;
        private const int WM_MOUSEMOVE = 0x0200;

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
        private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
    }

    public enum InputType
    {
        Keystroke,
        MouseClick,
        MouseMove
    }

    public class InputActivityEventArgs : EventArgs
    {
        public InputType Type { get; set; }
        public DateTime Timestamp { get; set; }
        public bool IsIdle { get; set; }
    }

    public class InputActivityStats
    {
        public int KeystrokeCount { get; set; }
        public int MouseClickCount { get; set; }
        public int MouseMovementCount { get; set; }
        public DateTime LastInputTime { get; set; }
        public int IdleTimeSeconds { get; set; }

        public int GetActivityLevel()
        {
            // Calculate activity level 0-100 based on input frequency
            // High activity = lots of keystrokes and clicks
            var totalInput = KeystrokeCount + (MouseClickCount * 2); // Weight clicks more

            if (totalInput > 500) return 100;
            if (totalInput > 300) return 80;
            if (totalInput > 150) return 60;
            if (totalInput > 50) return 40;
            if (totalInput > 10) return 20;
            return 10;
        }
    }
}
