import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATA_PATH auf Railway auf /data setzen (Volume-Pfad)
const DATA_DIR = process.env.DATA_PATH ?? __dirname;
const FILE = path.join(DATA_DIR, 'backups.json');

function init() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf-8');
  } catch (e) {
    console.error('[storage] init fehlgeschlagen:', e.message);
  }
}

export function saveBackup(id, data) {
  try {
    init();
    const all = loadAll();
    all[id] = data;
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (e) {
    console.error('[storage] saveBackup fehlgeschlagen:', e.message);
    throw e;
  }
}

export function getBackup(id) {
  return loadAll()[id] ?? null;
}

export function deleteBackup(id) {
  try {
    init();
    const all = loadAll();
    delete all[id];
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (e) {
    console.error('[storage] deleteBackup fehlgeschlagen:', e.message);
    throw e;
  }
}

export function listBackups() {
  try {
    return Object.entries(loadAll()).map(([id, b]) => ({
      id,
      name:         b.serverName ?? null,
      createdAt:    b.createdAt ?? null,
      channelCount: b.channels?.length ?? 0,
      roleCount:    b.roles?.length ?? 0,
      msgCount:     b.channels?.reduce((s, c) => s + (c.messages?.length ?? 0), 0) ?? 0,
    }));
  } catch (e) {
    console.error('[storage] listBackups fehlgeschlagen:', e.message);
    return [];
  }
}

function loadAll() {
  init();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
  catch { return {}; }
}
