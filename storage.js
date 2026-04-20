import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('[FEHLER] MONGODB_URI fehlt! Bitte auf Railway setzen.');
  process.exit(1);
}

let client;
let db;

async function connect() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('discord_backup_bot');
    console.log('[DB] Verbunden mit MongoDB Atlas.');
  }
  return db.collection('backups');
}

export async function saveBackup(id, data) {
  const col = await connect();
  await col.updateOne(
    { _id: id },
    { $set: { _id: id, ...data } },
    { upsert: true }
  );
}

export async function getBackup(id) {
  const col = await connect();
  return await col.findOne({ _id: id });
}

export async function listBackups() {
  const col = await connect();
  const all = await col.find({}, {
    projection: { serverName: 1, createdAt: 1, channels: 1, roles: 1 }
  }).toArray();
  return all.map(b => ({
    id:           b._id,
    name:         b.serverName,
    createdAt:    b.createdAt,
    channelCount: b.channels?.length ?? 0,
    roleCount:    b.roles?.length ?? 0,
    msgCount:     b.channels?.reduce((s, c) => s + (c.messages?.length ?? 0), 0) ?? 0,
  }));
}
