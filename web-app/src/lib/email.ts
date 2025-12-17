import { Resend } from 'resend';
import { logger } from './logger';

const resendApiKey = process.env.RESEND_API_KEY;
const isMockMode = !resendApiKey || process.env.EMAIL_MODE === 'mock';

if (!isMockMode && !resendApiKey) {
    logger.warn('RESEND_API_KEY is not set. Email sending will be disabled or fallback to mock mode if EMAIL_MODE=mock is set explicitly.');
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
    try {
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
            from: 'FlowShield <onboarding@resend.dev>', // Update this with your verified domain in production
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
