import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.join(__dirname, '..', 'data');
const FILE       = path.join(DATA_DIR, 'backups.json');

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf-8');
}

export function loadAll() {
  init();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
  catch { return {}; }
}

export function saveBackup(id, data) {
  init();
  const all = loadAll();
  all[id] = data;
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2), 'utf-8');
}

export function getBackup(id) {
  return loadAll()[id] ?? null;
}

export function listBackups() {
  return Object.entries(loadAll()).map(([id, b]) => ({
    id,
    name:         b.serverName,
    createdAt:    b.createdAt,
    channelCount: b.channels?.length ?? 0,
    roleCount:    b.roles?.length ?? 0,
    msgCount:     b.channels?.reduce((s, c) => s + (c.messages?.length ?? 0), 0) ?? 0,
  }));
}
