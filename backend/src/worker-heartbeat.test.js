import assert from 'node:assert/strict';
import test from 'node:test';
import { recordHeartbeat } from './worker-heartbeat.js';

test('recordHeartbeat stores the timestamp for the worker health check', async () => {
  const checkedAt = new Date('2026-11-12T12:00:00.000Z');
  let storedHeartbeat;
  const database = {
    workerHeartbeat: {
      upsert: async ({ create, update }) => {
        storedHeartbeat = create;
        return { ...update };
      },
    },
  };

  await recordHeartbeat(database, checkedAt);

  assert.deepEqual(storedHeartbeat, { id: 1, checkedAt });
});
