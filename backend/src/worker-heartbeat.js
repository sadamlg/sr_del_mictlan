export async function recordHeartbeat(database, checkedAt = new Date()) {
  return database.workerHeartbeat.upsert({
    where: { id: 1 },
    create: { id: 1, checkedAt },
    update: { checkedAt },
  });
}
