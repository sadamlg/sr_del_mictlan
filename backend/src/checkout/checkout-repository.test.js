import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckoutRepository } from './checkout-repository.js';

const snapshot = {
  productId: '11111111-1111-4111-8111-111111111111',
  slug: 'mezcal-reposado',
  name: 'Mezcal Reposado',
  imageKey: 'catalog/mezcal-reposado/front.webp',
  quantity: 2,
  cartItemVersion: '11111111-1111-4111-8111-111111111114',
  unitPriceCents: 12345,
  lineTotalCents: 24690,
};

function orderState(overrides = {}) {
  return {
    id: 'order-1',
    accountId: 'account-1',
    status: 'PENDING',
    currency: 'MXN',
    subtotalCents: 24690,
    totalCents: 24690,
    stripeCheckoutSessionId: 'cs_test_1',
    stripePaymentIntentId: null,
    items: [snapshot],
    ...overrides,
  };
}

function createDatabase({ order = orderState() } = {}) {
  const calls = [];
  const state = { order };
  const database = {
    async $transaction(callback) { return callback(database); },
    accountCartItem: {
      async findMany(query) { calls.push(['cart.findMany', query]); return []; },
      async deleteMany(query) { calls.push(['cart.deleteMany', query]); return { count: 1 }; },
    },
    account: {
      async updateMany(query) { calls.push(['account.updateMany', query]); return { count: 1 }; },
    },
    emailJob: {
      async create(query) { calls.push(['emailJob.create', query]); return query.data; },
    },
    order: {
      async create(query) { calls.push(['order.create', query]); return { id: 'order-1' }; },
      async findUnique(query) { calls.push(['order.findUnique', query]); return state.order; },
      async findFirst(query) {
        calls.push(['order.findFirst', query]);
        return state.order.accountId === query.where.accountId &&
          state.order.stripeCheckoutSessionId === query.where.stripeCheckoutSessionId
          ? { status: state.order.status }
          : null;
      },
      async updateMany(query) {
        calls.push(['order.updateMany', query]);
        const statusFilter = query.where.status;
        const statusMatches = statusFilter === undefined ||
          (typeof statusFilter === 'string' && state.order.status === statusFilter) ||
          (Array.isArray(statusFilter.in) && statusFilter.in.includes(state.order.status));
        const matches = state.order.id === query.where.id &&
          statusMatches &&
          (!query.where.OR || query.where.OR.some((candidate) =>
            candidate.stripeCheckoutSessionId === null || candidate.stripeCheckoutSessionId === state.order.stripeCheckoutSessionId));
        if (matches) state.order = { ...state.order, ...query.data };
        return { count: matches ? 1 : 0 };
      },
      async findMany(query) { calls.push(['order.findMany', query]); return []; },
    },
  };
  return { calls, database, state };
}

test('checkout cart read is scoped to the account and takes current product status and price from PostgreSQL', async () => {
  let received;
  const database = {
    accountCartItem: { async findMany(query) {
      received = query;
      return [{
        productId: snapshot.productId,
        quantity: 2,
        version: snapshot.cartItemVersion,
        product: { slug: snapshot.slug, name: snapshot.name, active: true, priceCents: 20000, imageKey: snapshot.imageKey },
      }];
    } },
  };
  const repository = createCheckoutRepository(database);

  const items = await repository.getAccountCartForCheckout('account-1');

  assert.deepEqual(received.where, { accountId: 'account-1' });
  assert.deepEqual(received.select.product.select, { slug: true, name: true, active: true, priceCents: true, imageKey: true });
  assert.deepEqual(items, [{
    productId: snapshot.productId,
    quantity: 2,
    version: snapshot.cartItemVersion,
    slug: snapshot.slug,
    name: snapshot.name,
    imageKey: snapshot.imageKey,
    active: true,
    priceCents: 20000,
  }]);
});

test('pending order persists only server-computed price snapshots and cart item versions', async () => {
  const { calls, database } = createDatabase();
  const repository = createCheckoutRepository(database);

  await repository.createPendingOrder({
    accountId: 'account-1',
    currency: 'MXN',
    subtotalCents: 24690,
    totalCents: 24690,
    items: [snapshot],
    createdAt: new Date('2026-10-28T18:01:00.000Z'),
  });

  const create = calls.find(([name]) => name === 'order.create')[1];
  assert.equal(create.data.accountId, 'account-1');
  assert.equal(create.data.status, 'PENDING');
  assert.equal(create.data.totalCents, 24690);
  assert.deepEqual(create.data.items.create, [{
    productId: snapshot.productId,
    slug: snapshot.slug,
    name: snapshot.name,
    quantity: 2,
    cartItemVersion: snapshot.cartItemVersion,
    unitPriceCents: 12345,
    lineTotalCents: 24690,
  }]);
});

test('paid webhook verifies amount, currency and session, then atomically updates and clears unchanged cart rows', async () => {
  const { calls, database, state } = createDatabase();
  const repository = createCheckoutRepository(database);

  const result = await repository.confirmPaidOrder({
    orderId: 'order-1',
    sessionId: 'cs_test_1',
    paymentIntentId: 'pi_test_1',
    customerId: 'cus_test_1',
    amountTotal: 24690,
    currency: 'MXN',
    paidAt: new Date('2026-10-28T18:02:00.000Z'),
  });

  assert.equal(result.updated, true);
  assert.equal(state.order.status, 'PAID');
  assert.equal(state.order.stripePaymentIntentId, 'pi_test_1');
  assert.ok(calls.some(([name, query]) => name === 'cart.deleteMany' && query.where.version === snapshot.cartItemVersion));
  assert.ok(calls.some(([name, query]) => name === 'account.updateMany' && query.data.stripeCustomerId === 'cus_test_1'));
  assert.deepEqual(calls.find(([name]) => name === 'emailJob.create'), ['emailJob.create', { data: {
    accountId: 'account-1', orderId: 'order-1', type: 'PURCHASE_CONFIRMATION',
  } }]);
});

test('paid webhook rejects amount, currency or session mismatches without changing the order', async () => {
  for (const overrides of [
    { amountTotal: 1, currency: 'MXN', sessionId: 'cs_test_1' },
    { amountTotal: 24690, currency: 'USD', sessionId: 'cs_test_1' },
    { amountTotal: 24690, currency: 'MXN', sessionId: 'cs_test_other' },
  ]) {
    const { calls, database, state } = createDatabase();
    const repository = createCheckoutRepository(database);

    await assert.rejects(repository.confirmPaidOrder({
      orderId: 'order-1',
      paymentIntentId: null,
      customerId: null,
      amountTotal: 24690,
      currency: 'MXN',
      sessionId: 'cs_test_1',
      paidAt: new Date(),
      ...overrides,
    }));

    assert.equal(state.order.status, 'PENDING');
    assert.equal(calls.some(([name]) => name === 'order.updateMany' || name === 'cart.deleteMany'), false);
  }
});

test('duplicate paid webhooks are idempotent and do not clear the cart twice', async () => {
  const { calls, database } = createDatabase();
  const repository = createCheckoutRepository(database);
  const input = {
    orderId: 'order-1',
    sessionId: 'cs_test_1',
    paymentIntentId: null,
    customerId: null,
    amountTotal: 24690,
    currency: 'MXN',
    paidAt: new Date(),
  };

  assert.equal((await repository.confirmPaidOrder(input)).updated, true);
  assert.equal((await repository.confirmPaidOrder(input)).updated, false);
  assert.equal(calls.filter(([name]) => name === 'cart.deleteMany').length, 1);
  assert.equal(calls.filter(([name]) => name === 'emailJob.create').length, 1);
});

test('order history query is limited to paid orders owned by the account', async () => {
  let received;
  const repository = createCheckoutRepository({ order: { async findMany(query) { received = query; return []; } } });

  await repository.listPaidOrders('account-1');

  assert.deepEqual(received.where, { accountId: 'account-1', status: 'PAID' });
  assert.deepEqual(received.orderBy, [{ paidAt: 'desc' }, { id: 'desc' }]);
  assert.ok(received.select.items);
});

test('checkout return status is looked up by both Stripe session and account owner', async () => {
  const { calls, database } = createDatabase({ order: orderState({ status: 'PAID' }) });
  const repository = createCheckoutRepository(database);

  assert.equal(await repository.getCheckoutSessionStatus('account-1', 'cs_test_1'), 'PAID');
  assert.equal(await repository.getCheckoutSessionStatus('other-account', 'cs_test_1'), null);
  assert.deepEqual(calls.filter(([name]) => name === 'order.findFirst').map(([, query]) => query.where), [
    { accountId: 'account-1', stripeCheckoutSessionId: 'cs_test_1' },
    { accountId: 'other-account', stripeCheckoutSessionId: 'cs_test_1' },
  ]);
});

test('reorder adds only currently active order products and uses the owner-scoped paid snapshot', async () => {
  const calls = [];
  const database = {
    async $transaction(callback) { return callback(database); },
    async $queryRaw(strings, ...values) {
      calls.push(['receipt', strings.join('?'), values]);
      return [{ transfer_id: values[1] }];
    },
    async $executeRaw(strings, ...values) { calls.push(['cart.upsert', strings.join('?'), values]); return 1; },
    order: {
      async findFirst(query) {
        calls.push(['order.findFirst', query]);
        return { items: [
          { slug: 'mezcal-reposado', quantity: 2 },
          { slug: 'mezcal-agotado', quantity: 1 },
        ] };
      },
    },
    product: {
      async findMany(query) {
        calls.push(['product.findMany', query]);
        return [{ id: snapshot.productId, slug: 'mezcal-reposado' }];
      },
    },
  };
  const repository = createCheckoutRepository(database);

  const result = await repository.reorderPaidOrder({
    accountId: 'account-1',
    orderId: 'order-1',
    transferId: '22222222-2222-4222-8222-222222222222',
  });

  assert.deepEqual(result, { applied: true, unavailableSlugs: ['mezcal-agotado'] });
  assert.deepEqual(calls.find(([name]) => name === 'order.findFirst')[1].where, { id: 'order-1', accountId: 'account-1', status: 'PAID' });
  assert.deepEqual(calls.find(([name]) => name === 'product.findMany')[1].where, {
    slug: { in: ['mezcal-reposado', 'mezcal-agotado'] }, active: true, priceCents: { gt: 0 },
  });
  assert.equal(calls.filter(([name, query]) => name === 'cart.upsert' && query.includes('INSERT INTO "account_cart_items"')).length, 1);
  const receiptUpdate = calls.find(([name, query]) => name === 'cart.upsert' && query.includes('UPDATE "account_cart_merges"'));
  assert.deepEqual(receiptUpdate[2][0], ['mezcal-agotado']);
  assert.match(calls.find(([name]) => name === 'cart.upsert')[1], /gen_random_uuid/);
});

test('reorder transfer receipt replays unavailable products without applying the cart update twice', async () => {
  let cartWrites = 0;
  const database = {
    async $transaction(callback) { return callback(database); },
    async $queryRaw(strings) {
      if (strings.join('?').includes('INSERT INTO "account_cart_merges"')) return [];
      return [{ unavailable_slugs: ['mezcal-agotado'] }];
    },
    async $executeRaw() { cartWrites += 1; },
    order: { async findFirst() { return { items: [{ slug: 'mezcal-reposado', quantity: 2 }] }; } },
    product: { async findMany() { return [{ id: snapshot.productId, slug: 'mezcal-reposado' }]; } },
  };
  const repository = createCheckoutRepository(database);

  const result = await repository.reorderPaidOrder({
    accountId: 'account-1', orderId: 'order-1', transferId: '22222222-2222-4222-8222-222222222222',
  });

  assert.deepEqual(result, { applied: false, unavailableSlugs: ['mezcal-agotado'] });
  assert.equal(cartWrites, 0);
});

test('reorder cannot find another account order or a pending order', async () => {
  let receiptWrites = 0;
  const database = {
    async $transaction(callback) { return callback(database); },
    async $queryRaw() { receiptWrites += 1; return [{ transfer_id: 'transfer' }]; },
    async $executeRaw() {},
    order: { async findFirst() { return null; } },
  };
  const repository = createCheckoutRepository(database);

  assert.equal(await repository.reorderPaidOrder({ accountId: 'other-account', orderId: 'order-1', transferId: 'transfer' }), null);
  assert.equal(receiptWrites, 0);
});
