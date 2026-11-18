import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerialTask, createShutdown } from './runtime.js';

test('serial task drains a slow operation and does not start another after stop', async () => {
  let release;
  let calls = 0;
  const task = createSerialTask(() => {
    calls++;
    return new Promise((resolve) => { release = resolve; });
  }, 0);
  await Promise.resolve();
  let drained = false;
  const stopping = task.stop().then(() => { drained = true; });
  await Promise.resolve();
  assert.equal(drained, false);
  release();
  await stopping;
  assert.equal(calls, 1);
});

test('shutdown is idempotent and waits for cleanup', async () => {
  let calls = 0;
  const exits = [];
  const stop = createShutdown(async () => { calls++; }, { exit: (code) => exits.push(code) });
  await Promise.all([stop(), stop()]);
  assert.equal(calls, 1);
  assert.deepEqual(exits, [0]);
});

test('shutdown reports cleanup failure', async () => {
  const exits = [];
  await createShutdown(async () => { throw new Error('failure'); }, { exit: (code) => exits.push(code) })();
  assert.deepEqual(exits, [1]);
});
