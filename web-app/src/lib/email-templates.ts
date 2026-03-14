const DESKTOP_DOWNLOAD_URL = 'https://github.com/asifthewebguy/FlowShield/releases/latest';
const CHROME_EXTENSION_URL = 'https://chrome.google.com/webstore/detail/flowshield';

export function buildWelcomeEmail({ name, appUrl }: { name: string; appUrl: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Welcome to FlowShield</title>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F172A">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;border:1px solid #1E293B;">

          <!-- Header -->
          <tr>
            <td bgcolor="#0EA5E9"
                style="background-color:#0EA5E9;padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:22px;vertical-align:middle;">&#9889;</span>
                    <span style="font-size:20px;font-weight:700;color:#ffffff;vertical-align:middle;margin-left:8px;letter-spacing:-0.3px;">FlowShield</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td bgcolor="#1E293B"
                style="background-color:#1E293B;padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:26px;font-weight:700;color:#F1F5F9;line-height:1.3;">
                Hey ${name === '{{name}}' ? name : name}, welcome aboard &#128075;
              </p>
              <p style="margin:0;font-size:16px;color:#94A3B8;line-height:1.6;">
                You&rsquo;ve just unlocked a smarter way to work. FlowShield helps you stay focused,
                block distractions, and understand where your time actually goes.
              </p>
            </td>
          </tr>

          <!-- Features -->
          <tr>
            <td bgcolor="#1E293B"
                style="background-color:#1E293B;padding:0 40px 32px;">

              <!-- Feature 1 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#0F172A;border-radius:10px;margin-bottom:10px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:22px;vertical-align:top;padding-right:14px;line-height:1;">&#127919;</td>
                        <td>
                          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#F1F5F9;">Deep Focus Sessions</p>
                          <p style="margin:0;font-size:13px;color:#64748B;line-height:1.5;">
                            Start timed work, study, or creative sessions — synced across all your devices.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#0F172A;border-radius:10px;margin-bottom:10px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:22px;vertical-align:top;padding-right:14px;line-height:1;">&#128202;</td>
                        <td>
                          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#F1F5F9;">Activity Analytics</p>
                          <p style="margin:0;font-size:13px;color:#64748B;line-height:1.5;">
                            See exactly where your time goes with automatic app tracking and weekly reports.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background-color:#0F172A;border-radius:10px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:22px;vertical-align:top;padding-right:14px;line-height:1;">&#128737;&#65039;</td>
                        <td>
                          <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#F1F5F9;">Distraction Blocking</p>
                          <p style="margin:0;font-size:13px;color:#64748B;line-height:1.5;">
                            Block distracting sites and apps automatically when a focus session is running.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Primary CTA -->
          <tr>
            <td bgcolor="#1E293B"
                style="background-color:#1E293B;padding:0 40px 40px;text-align:center;">
              <a href="${appUrl}/dashboard"
                 style="display:inline-block;background-color:#0EA5E9;color:#ffffff;text-decoration:none;
                        font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;
                        letter-spacing:0.2px;">
                Start Your First Session &rarr;
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td bgcolor="#1E293B" style="background-color:#1E293B;padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #334155;padding-bottom:28px;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Download section -->
          <tr>
            <td bgcolor="#1E293B"
                style="background-color:#1E293B;padding:0 40px 40px;text-align:center;">
              <p style="margin:0 0 20px;font-size:13px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">
                Get the full experience
              </p>
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="padding-right:10px;">
                    <a href="${DESKTOP_DOWNLOAD_URL}"
                       style="display:inline-block;background-color:#0F172A;color:#CBD5E1;text-decoration:none;
                              font-size:13px;font-weight:600;padding:11px 22px;border-radius:8px;
                              border:1px solid #334155;">
                      &#11015;&#65039; Desktop App
                    </a>
                  </td>
                  <td>
                    <a href="${CHROME_EXTENSION_URL}"
                       style="display:inline-block;background-color:#0F172A;color:#CBD5E1;text-decoration:none;
                              font-size:13px;font-weight:600;padding:11px 22px;border-radius:8px;
                              border:1px solid #334155;">
                      &#129513; Chrome Extension
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#0F172A"
                style="background-color:#0F172A;padding:24px 40px;border-top:1px solid #1E293B;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#334155;">
                <a href="${appUrl}" style="color:#0EA5E9;text-decoration:none;font-weight:600;">flowshield.app</a>
                &nbsp;&middot;&nbsp;
                <a href="${appUrl}/dashboard" style="color:#475569;text-decoration:none;">Dashboard</a>
                &nbsp;&middot;&nbsp;
                <a href="${appUrl}/settings" style="color:#475569;text-decoration:none;">Settings</a>
              </p>
              <p style="margin:0;font-size:11px;color:#1E293B;">
                &copy; 2025 FlowShield. You&rsquo;re receiving this because you created an account.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}
