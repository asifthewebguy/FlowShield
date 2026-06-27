import sanitizeHtml from 'sanitize-html';
import { prisma } from './prisma';
import { buildWelcomeEmail } from './email-templates';

// Typed structure for all app settings
export interface AppSettings {
  payment: {
    lemonsqueezy: { enabled: boolean };
    bkash: { enabled: boolean };
  };
  email: {
    welcome: { enabled: boolean; subject: string; body: string };
    verification: { enabled: boolean; subject: string };
    digest: { enabled: boolean; subject: string; body: string };
  };
}

const DEFAULTS: AppSettings = {
  payment: {
    lemonsqueezy: { enabled: false },
    bkash: { enabled: false },
  },
  email: {
    welcome: {
      enabled: true,
      subject: 'Welcome to FlowShield!',
      body: buildWelcomeEmail({ name: '{{name}}', appUrl: '{{appUrl}}' }),
    },
    verification: {
      enabled: true,
      subject: 'Verify your email - FlowShield',
    },
    digest: {
      enabled: true,
      subject: 'Your FlowShield Weekly Summary',
      body: '<h1>Hi {{name}}!</h1><p>Sessions this week: {{sessionCount}}</p><p>Total focus time: {{totalTime}}</p><p><a href="{{appUrl}}/analytics">View full analytics →</a></p>',
    },
  },
};

// Email-safe sanitize-html allowlist. Used when persisting admin-controlled
// email body fields so that stored HTML is clean before it ever reaches users.
const EMAIL_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'p', 'a', 'b', 'i', 'strong', 'em',
    'ul', 'ol', 'li', 'br', 'span', 'div', 'img', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    'a': ['href'],
    'img': ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
  },
};

// HTML-escape a plain-text value before interpolating it into an HTML template.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalise a plain-text string for use as an email subject.
 * Strips CR/LF (SMTP header injection) and any angle-bracket tags (stray markup).
 */
function plainText(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/<[^>]*>/g, '');
}

/**
 * Load all app settings from the DB, falling back to defaults for missing keys.
 */
export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));

  return {
    payment: {
      lemonsqueezy: {
        enabled: (map['payment.lemonsqueezy.enabled'] as boolean) ?? DEFAULTS.payment.lemonsqueezy.enabled,
      },
      bkash: {
        enabled: (map['payment.bkash.enabled'] as boolean) ?? DEFAULTS.payment.bkash.enabled,
      },
    },
    email: {
      welcome: {
        enabled: (map['email.welcome.enabled'] as boolean) ?? DEFAULTS.email.welcome.enabled,
        subject: (map['email.welcome.subject'] as string) ?? DEFAULTS.email.welcome.subject,
        body: (map['email.welcome.body'] as string) ?? DEFAULTS.email.welcome.body,
      },
      verification: {
        enabled: (map['email.verification.enabled'] as boolean) ?? DEFAULTS.email.verification.enabled,
        subject: (map['email.verification.subject'] as string) ?? DEFAULTS.email.verification.subject,
      },
      digest: {
        enabled: (map['email.digest.enabled'] as boolean) ?? DEFAULTS.email.digest.enabled,
        subject: (map['email.digest.subject'] as string) ?? DEFAULTS.email.digest.subject,
        body: (map['email.digest.body'] as string) ?? DEFAULTS.email.digest.body,
      },
    },
  };
}

/**
 * Save a flat map of key→value pairs to the DB (upsert).
 * Email body fields are sanitized with an email-safe allowlist before persistence
 * so admin-controlled HTML never reaches users unsanitized.
 */
export async function saveSettings(
  updates: Record<string, unknown>,
  updatedBy: string
): Promise<void> {
  const sanitized = Object.fromEntries(
    Object.entries(updates).map(([key, value]) => {
      if (
        (key === 'email.welcome.body' || key === 'email.digest.body') &&
        typeof value === 'string'
      ) {
        return [key, sanitizeHtml(value, EMAIL_SANITIZE_OPTIONS)];
      }
      if (
        (key === 'email.welcome.subject' || key === 'email.verification.subject' || key === 'email.digest.subject') &&
        typeof value === 'string'
      ) {
        return [key, plainText(value)];
      }
      return [key, value];
    })
  );

  await Promise.all(
    Object.entries(sanitized).map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: value as never, updatedBy },
        create: { key, value: value as never, updatedBy },
      })
    )
  );
}

/**
 * Apply template variables to an email body string.
 * Replaces {{name}}, {{appUrl}}, etc.
 * Variable VALUES are HTML-escaped to prevent injection from user-controlled data.
 */
export function applyTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replaceAll(`{{${k}}}`, escapeHtml(v)),
    template
  );
}

/**
 * Apply template variables to a plain-text string (e.g. email subjects).
 * Unlike applyTemplate, values are NOT HTML-escaped so subjects render correctly.
 */
export function applyTemplatePlain(
  template: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replaceAll(`{{${k}}}`, v),
    template
  );
}
