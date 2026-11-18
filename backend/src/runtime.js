export function createSerialTask(task, delayMs, onError = () => {}) {
  let stopped = false;
  let timer;
  let running;
  function run() {
    running = Promise.resolve().then(task).catch(onError).finally(() => {
      if (!stopped) timer = setTimeout(run, delayMs);
    });
  }
  run();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}

export function createShutdown(cleanup, { timeoutMs = 25_000, exit = (code) => process.exit(code) } = {}) {
  let stopping;
  return function stop() {
    if (stopping) return stopping;
    const timer = setTimeout(() => {
      console.error('[shutdown] drain deadline exceeded');
      exit(1);
    }, timeoutMs);
    stopping = Promise.resolve().then(cleanup).then(() => {
      clearTimeout(timer);
      exit(0);
    }, () => {
      clearTimeout(timer);
      console.error('[shutdown] cleanup failed');
      exit(1);
    });
    return stopping;
  };
}
