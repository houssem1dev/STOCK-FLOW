const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'stock-flow-data.json');

function ensureStoreDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  ensureStoreDir();

  if (!fs.existsSync(DATA_FILE)) {
    const initial = { products: [], activities: [] };
    writeStore(initial);
    return initial;
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    const initial = { products: [], activities: [] };
    writeStore(initial);
    return initial;
  }
}

function writeStore(store) {
  ensureStoreDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function getNextId(items) {
  if (!items || items.length === 0) return 1;
  return Math.max(...items.map((item) => item.id)) + 1;
}

function addActivity(store, type, title, detail) {
  const activity = {
    id: getNextId(store.activities || []),
    type,
    title,
    detail,
    createdAt: new Date().toISOString()
  };

  store.activities = [activity, ...(store.activities || [])].slice(0, 40);
  return activity;
}

module.exports = {
  readStore,
  writeStore,
  getNextId,
  addActivity
};
