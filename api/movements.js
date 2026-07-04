const { readStore, writeStore, addActivity } = require('./lib/store');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
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

  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  try {
    const input = await parseBody(req);
    const store = readStore();
    const product = (store.products || []).find((item) => item.id === Number(input.productId));

    if (!product) {
      res.status(404).json({ message: 'Product not found.' });
      return;
    }

    if (Number(input.qty) <= 0 || (input.type !== 'in' && input.type !== 'out')) {
      res.status(400).json({ message: 'Movement type and quantity are invalid.' });
      return;
    }

    const movementQty = input.type === 'out' ? Math.min(product.qty, Number(input.qty)) : Number(input.qty);
    const newQty = input.type === 'out' ? product.qty - movementQty : product.qty + movementQty;
    product.qty = newQty;

    const title = input.type === 'out'
      ? `Sortie -${movementQty}: ${product.name}`
      : `Entree +${movementQty}: ${product.name}`;
    const detail = input.type === 'out'
      ? `Stock restant ${newQty} u.`
      : `Nouveau stock ${newQty} u.`;

    addActivity(store, input.type, title, detail);
    writeStore(store);

    res.status(200).json({ ...product });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Invalid request.' });
  }
};
