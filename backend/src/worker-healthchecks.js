const pingIntervalMs = 60_000;
const pingTimeoutMs = 5_000;

export function createWorkerHealthchecks({ pingUrl, fetchImpl = fetch, logger = console, now = Date.now } = {}) {
  if (!pingUrl) return async () => false;

  let target;
  try {
    target = new URL(pingUrl);
  } catch {
    throw new TypeError('HEALTHCHECKS_WORKER_PING_URL debe ser una URL válida de Healthchecks.io.');
  }

  if (target.protocol !== 'https:' || target.hostname !== 'hc-ping.com' || target.username || target.password) {
    throw new TypeError('HEALTHCHECKS_WORKER_PING_URL debe usar HTTPS en Healthchecks.io (hc-ping.com).');
  }

  let lastAttemptAt;
  return async () => {
    const attemptedAt = now();
    if (lastAttemptAt !== undefined && attemptedAt - lastAttemptAt < pingIntervalMs) return false;
    lastAttemptAt = attemptedAt;

    try {
      const response = await fetchImpl(target, {
        method: 'GET',
        signal: AbortSignal.timeout(pingTimeoutMs),
      });
      if (!response.ok) {
        logger.warn('Healthchecks.io rechazó la señal periódica del Worker.', { status: response.status });
        return false;
      }
      return true;
    } catch (error) {
      logger.warn('No se pudo enviar la señal periódica del Worker a Healthchecks.io.', {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      return false;
    }
  };
}
