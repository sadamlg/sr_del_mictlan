import { createOpaqueToken, hashToken } from '../accounts/crypto.js';
import { createAccountEmail } from './account-email.js';

const TOKEN_CONFIG = {
  ACCOUNT_CONFIRMATION: { purpose: 'ACCOUNT_CONFIRMATION', lifetimeMs: 24 * 60 * 60 * 1000 },
  EMAIL_CHANGE_CONFIRMATION: { purpose: 'EMAIL_CHANGE', lifetimeMs: 24 * 60 * 60 * 1000 },
  PASSWORD_RESET: { purpose: 'PASSWORD_RESET', lifetimeMs: 30 * 60 * 1000 },
};

function safeCode(value, fallback) {
  if (typeof value === 'string' && /^[A-Z0-9_-]{1,48}$/.test(value)) return value;
  return fallback;
}

export function createAccountEmailWorker({
  repository,
  transport,
  from,
  appBaseUrl,
  now = () => new Date(),
  tokenFactory = createOpaqueToken,
  hashTokenValue = hashToken,
  logger = console,
}) {
  return {
    async processNext() {
      const job = await repository.claimNextEmailJob(now());
      if (!job) return false;

      try {
        const config = TOKEN_CONFIG[job.type];
        if (!config) throw Object.assign(new Error('Unknown email job type.'), { code: 'EMAIL_JOB_TYPE_UNKNOWN' });
        const emailJob = await repository.getEmailJob(job.id);
        if (!emailJob?.account) {
          await repository.markEmailJobSent(job.id, now());
          return true;
        }

        const token = tokenFactory();
        const timestamp = now();
        const issued = await repository.issueEmailToken({
          accountId: emailJob.accountId,
          purpose: config.purpose,
          tokenHash: hashTokenValue(token),
          expiresAt: new Date(timestamp.getTime() + config.lifetimeMs),
          now: timestamp,
        });
        if (!issued || issued.alreadyDone || (job.type === 'EMAIL_CHANGE_CONFIRMATION' && !issued.account.pendingEmail)) {
          await repository.markEmailJobSent(job.id, now());
          return true;
        }

        const account = issued.account;
        const recipient = job.type === 'EMAIL_CHANGE_CONFIRMATION' ? account.pendingEmail : account.email;
        if (!recipient) {
          await repository.markEmailJobSent(job.id, now());
          return true;
        }
        const type = job.type;
        const message = createAccountEmail({
          type,
          account,
          token,
          continueToCheckout: type === 'ACCOUNT_CONFIRMATION' && emailJob.continueToCheckout === true,
          appBaseUrl,
        });
        await transport.sendMail({ from, to: recipient, ...message });
        await repository.markEmailJobSent(job.id, now());
        logger.info?.('[email-worker] account email sent', { jobId: job.id, type, attempts: job.attempts });
        return true;
      } catch (error) {
        const errorCode = safeCode(error?.code, safeCode(error?.name, 'EMAIL_DELIVERY_FAILED'));
        logger.error?.('[email-worker] account email delivery failed', {
          jobId: job.id, type: job.type, attempts: job.attempts, code: errorCode,
        });
        try {
          await repository.markEmailJobFailed({ id: job.id, attempts: job.attempts, errorCode, now: now() });
        } catch (markError) {
          logger.error?.('[email-worker] could not schedule retry', {
            type: job.type, code: safeCode(markError?.code, 'DATABASE_ERROR'),
          });
        }
        return false;
      }
    },
  };
}
