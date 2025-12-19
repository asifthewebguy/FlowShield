# Manual Testing Guide for FlowShield

This guide helps you verify the recently implemented **Session Control** and **Local Data Encryption** features.

## Prerequisites

- **Web App**: The app is live at `https://flowshield.app`.
- **Desktop App**: Needs to be built and run on your Windows machine.
- **Account**: You need a registered user account on `https://flowshield.app`.

## Step 1: Start the Desktop App (Client)

1. Open a new terminal in the `desktop-app` directory.
2. Build and run the app:
   ```powershell
   cd desktop-app
   dotnet run
   ```
3. The FlowShield icon (a small shield or default icon) should appear in your **System Tray** (bottom right of your taskbar, near the clock. You might need to click the `^` arrow to see it).

---

## Step 2: Test Session Control

1. **Login**:
   - Right-click the FlowShield tray icon.
   - Click **Login**.
   - Enter your credentials for `flowshield.app`.
   - *Verify*: You see a notification "Login Successful".

2. **Start a Session**:
   - Right-click the tray icon.
   - Hover over **Start Focus Session**.
   - Select **25 Minutes**.
   - *Verify*: 
     - You see a notification "Focus Session Started".
     - The icon context menu should update.

3. **Verify on Web Dashboard**:
   - Go to `https://flowshield.app/dashboard` in your browser.
   - *Verify*: The dashboard should show an **Active Session** card or indicator matching the session you just started (e.g., "Work Session - 25m").

## Step 3: Test Activity Linking & Sync

1. **Generate Activity**:
   - Use your computer normally for 1-2 minutes (switch between windows, type something).
   - This allows the `ActivityTracker` to generate logs linked to the current `SessionId`.

2. **Force Sync** (Optional):
   - The app syncs automatically every 5 minutes.
   - Triggering a sync manually isn't exposed in the menu yet, but you can restart the app to force a sync on exit/start, or simply wait.

3. **Verify Data**:
   - Check the **Activity Timeline** or **Reports** on the Web Dashboard.
   - Confirm that the activities logged during this time are associated with the session.

---

## Step 4: Verify Local Encryption

This is a passive verification to ensure the app continues to work with the new security layer.

1. **Locate Database**:
   - Navigate to `%LocalAppData%\FlowShield\` in File Explorer (usually `C:\Users\<YourUser>\AppData\Local\FlowShield\`).
   - Find `flowshield.db`.

2. **Verify Encryption**:
   - Try to open `flowshield.db` with a standard text editor (like Notepad).
   - *Result*: The content should be unreadable binary gibberish (ciphertext), not plain SQL text like "CREATE TABLE".
   - *Note*: If you try to open it with a standard SQLite browser without the password (`FlowShield-Secure-Local-Storage-Key-2024`), it will fail to open, confirming encryption is active.
