import { Resend } from 'resend';
import { logger } from './logger';

const resendApiKey = process.env.RESEND_API_KEY;
const explicitMockMode = process.env.EMAIL_MODE === 'mock';
const isMockMode = explicitMockMode || !resendApiKey;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

let prodConfigChecked = false;

/**
 * Verify the email config at first send-time rather than module load. We
 * deliberately don't throw at import time because Next.js evaluates server
 * modules during `next build` to collect route metadata, and a missing key
 * during build would tank deploys for unrelated reasons. Catching the
 * misconfiguration here means the first email attempt fails loudly, which
 * is what we want.
 */
function assertProductionEmailConfig() {
    if (prodConfigChecked) return;
    prodConfigChecked = true;
    if (process.env.NODE_ENV !== 'production') return;
    if (!resendApiKey && !explicitMockMode) {
        throw new Error(
            'RESEND_API_KEY is required in production. Set EMAIL_MODE=mock if you really want to bypass email sending.'
        );
    }
    if (explicitMockMode) {
        logger.warn('EMAIL_MODE=mock is set in production — no emails will actually be sent.');
    }
}

if (isMockMode && !explicitMockMode && process.env.NODE_ENV !== 'production') {
    logger.warn(
        'RESEND_API_KEY is not set — falling back to mock mode (emails will not be sent). ' +
        'Set RESEND_API_KEY for real sending or EMAIL_MODE=mock to silence this warning.'
    );
}

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
    try {
        assertProductionEmailConfig();
        if (isMockMode) {
            logger.info('================================================================');
            logger.info(`[MOCK EMAIL SERVICE]`);
            logger.info(`To: ${to}`);
            logger.info(`Subject: ${subject}`);
            logger.info(`Body:`);
            logger.info(html);
            logger.info('================================================================');
            return true;
        }

        if (!resend) {
            logger.error('Email service is not configured');
            return false;
        }

        const { data, error } = await resend.emails.send({
            from: 'FlowShield <info@flowshield.app>', // Update this with your verified domain in production
            to: [to],
            subject,
            html,
        });

        if (error) {
            logger.error('Failed to send email:', error);
            return false;
        }

        logger.info(`Email sent successfully to ${to}, ID: ${data?.id}`);
        return true;
    } catch (error) {
        logger.error('Error sending email:', error);
        return false;
    }
}
