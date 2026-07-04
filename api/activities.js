const { readStore, writeStore } = require('./lib/store');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const store = readStore();

  if (req.method === 'GET') {
    res.status(200).json(store.activities || []);
    return;
  }

  if (req.method === 'DELETE') {
    store.activities = [];
    writeStore(store);
    res.status(204).end();
    return;
  }

  res.status(405).end();
};
