const { readStore, writeStore, addActivity, getNextId } = require('./lib/store');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const store = readStore();

  if (req.method === 'GET') {
    res.status(200).json(store.products || []);
    return;
  }

  if (req.method === 'POST') {
    try {
      const input = await parseBody(req);
      const name = (input.name || '').trim();

      if (!name) {
        res.status(400).json({ message: 'Product name is required.' });
        return;
      }

      const product = {
        id: getNextId(store.products || []),
        name,
        category: input.category || 'General',
        qty: Number(input.qty) || 0,
        threshold: Number(input.threshold) || 0,
        price: Number(input.price) || 0
      };

      store.products = [...(store.products || []), product];
      addActivity(store, 'add', `Produit ajoute: ${product.name}`, `${product.category}, stock initial ${product.qty} u.`);
      writeStore(store);

      res.status(201).json(product);
      return;
    } catch (error) {
      res.status(400).json({ message: error.message || 'Invalid request.' });
      return;
    }
  }

  if (req.method === 'PUT') {
    try {
      const input = await parseBody(req);
      const productId = Number(req.url.split('/').pop());
      const product = (store.products || []).find((item) => item.id === productId);

      if (!product) {
        res.status(404).end();
        return;
      }

      const name = (input.name || '').trim();
      if (!name) {
        res.status(400).json({ message: 'Product name is required.' });
        return;
      }

      product.name = name;
      product.category = input.category || product.category;
      product.qty = Number(input.qty) || product.qty;
      product.threshold = Number(input.threshold) || product.threshold;
      product.price = Number(input.price) || product.price;

      addActivity(store, 'update', `Produit modifie: ${product.name}`, `${product.category}, stock ${product.qty} u.`);
      writeStore(store);

      res.status(200).json(product);
      return;
    } catch (error) {
      res.status(400).json({ message: error.message || 'Invalid request.' });
      return;
    }
  }

  if (req.method === 'DELETE') {
    const productId = Number(req.url.split('/').pop());
    const index = (store.products || []).findIndex((item) => item.id === productId);

    if (index === -1) {
      res.status(404).end();
      return;
    }

    const [removed] = store.products.splice(index, 1);
    addActivity(store, 'delete', `Produit supprime: ${removed.name}`, `${removed.category}, ancien stock ${removed.qty} u.`);
    writeStore(store);

    res.status(204).end();
    return;
  }

  res.status(405).end();
};
