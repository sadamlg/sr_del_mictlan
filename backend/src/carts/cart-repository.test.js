import assert from 'node:assert/strict';
import test from 'node:test';
import { createCartRepository } from './cart-repository.js';

test('each account cart create or quantity update receives a fresh UUID version', async () => {
  const writes = [];
  const repository = createCartRepository({
    accountCartItem: { async upsert(input) { writes.push(input); return input; } },
  });

  await repository.setAccountCartItem({ accountId: 'account-1', productId: 'product-1', quantity: 1 });
  await repository.setAccountCartItem({ accountId: 'account-1', productId: 'product-1', quantity: 2 });

  const versions = writes.map((write) => write.create?.version ?? write.update?.version);
  assert.match(versions[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(versions[1], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(versions[0], versions[1]);
});

test('guest cart merge writes and replaces the version token atomically with each line', async () => {
  const executions = [];
  const transaction = {
    async $queryRaw() { return [{ transfer_id: 'transfer-1' }]; },
    product: { async findMany() { return [{ id: 'product-1', slug: 'mezcal' }]; } },
    async $executeRaw(strings) { executions.push(strings.join('')); return 1; },
  };
  const repository = createCartRepository({ async $transaction(callback) { return callback(transaction); } });

  assert.equal(await repository.mergeGuestCart('account-1', 'transfer-1', [{ slug: 'mezcal', quantity: 1 }]), true);
  assert.match(executions[0], /"version"/);
  assert.match(executions[0], /gen_random_uuid\(\)/);
});
