; FlowShield Installer Script for Inno Setup
; Requires Inno Setup 6.0 or later
; Download from: https://jrsoftware.org/isdl.php

#define MyAppName "FlowShield"
#define MyAppVersion "2.3.0"
#define MyAppPublisher "FlowShield"
#define MyAppURL "https://github.com/asifthewebguy/FlowShield"
#define MyAppExeName "FlowShield.exe"
#define MyAppDescription "Focus and productivity tracking application"

[Setup]
; NOTE: The value of AppId uniquely identifies this application.
AppId={{8F9A7B2C-3D4E-5F6A-7B8C-9D0E1F2A3B4C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer
OutputBaseFilename=FlowShield-Setup-v{#MyAppVersion}
SetupIconFile=logo.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppDescription}
VersionInfoCopyright=Copyright (C) 2025 {#MyAppPublisher}
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Run FlowShield on Windows startup"; GroupDescription: "Startup Options:"

[Files]
; Main executable and dependencies
; Use published self-contained files (from 'publish' directory in root of cd)
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Documentation
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
; Run the application after installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[Code]
// Check if .NET 8.0 Desktop Runtime is installed
function IsDotNetInstalled: Boolean;
var
  ResultCode: Integer;
begin
  // Try to run dotnet --list-runtimes command
  Result := Exec('dotnet', '--list-runtimes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if Result then
  begin
    Result := (ResultCode = 0);
  end;
end;

function InitializeSetup: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  // Check for .NET 8.0 Runtime
  if not IsDotNetInstalled then
  begin
    if MsgBox('.NET 8.0 Desktop Runtime is required but not installed.' + #13#10 + #13#10 +
              'Would you like to download it now?' + #13#10 + #13#10 +
              'The installer will open your browser to the download page.',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://dotnet.microsoft.com/download/dotnet/8.0', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
    end;
    Result := False;
  end;
end;

function IsAppRunning: Boolean;
var
  ResultCode: Integer;
begin
  // Check if FlowShield.exe is running using tasklist
  Result := Exec('tasklist', '/FI "IMAGENAME eq FlowShield.exe" /NH', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := Result and (ResultCode = 0);
end;

function InitializeUninstall: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  // Always try to close FlowShield if it's running
  // Using taskkill which will succeed if running, or silently fail if not running
  Exec('taskkill', '/IM FlowShield.exe /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Wait a moment for the process to terminate
  Sleep(1500);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataPath: String;
begin
  // When uninstalling, ask if user wants to keep their data
  if CurUninstallStep = usUninstall then
  begin
    DataPath := ExpandConstant('{localappdata}\FlowShield');
    if DirExists(DataPath) then
    begin
      if MsgBox('Do you want to remove your FlowShield data (activity logs, settings, etc.)?' + #13#10 + #13#10 +
                'Location: ' + DataPath + #13#10 + #13#10 +
                'Click No to keep your data for future installations.',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      begin
        DelTree(DataPath, True, True, True);
      end;
    end;
  end;
end;
