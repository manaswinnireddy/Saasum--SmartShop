const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../db');
const { sellerAuthRequired, sellerApprovedRequired } = require('../middleware/auth');

const router = express.Router();
router.use(sellerAuthRequired);

// GET /api/seller/products — list only this seller's own products (any status, even out of stock)
// Does not require approval — a pending seller can still see their draft list (likely empty).
router.get('/', (req, res) => {
  const products = query(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.seller_id = ? AND p.is_deleted = 0
    ORDER BY p.created_at DESC
  `, [req.seller.id]);
  res.json({ products: products.map(p => ({ ...p, is_prime: !!p.is_prime })) });
});

// POST /api/seller/products — add a new product (approved sellers only)
router.post('/', sellerApprovedRequired, (req, res) => {
  const { name, brand, category_id, description,
        price, mrp, stock, is_prime, badge } = req.body;

  if (!name || price == null || mrp == null) {
    return res.status(400).json({ error: 'name, price, and mrp are required' });
  }
  if (Number(price) <= 0 || Number(mrp) <= 0) {
    return res.status(400).json({ error: 'price and mrp must be positive numbers' });
  }
  if (Number(price) > Number(mrp)) {
    return res.status(400).json({ error: 'price cannot be greater than mrp' });
  }
  const category = get(
  'SELECT slug FROM categories WHERE id = ?',
  [category_id]
);

let emoji = '📦';

if (category) {
  const emojiMap = {
    electronics: '📱',
    smartphones: '📱',
    laptops: '💻',
    audio: '🎧',
    wearables: '⌚',
    fashion: '👗',
    'home-kitchen': '🏠',
    'beauty-health': '💄',
    sports: '⚽',
    books: '📚',
    grocery: '🛒',
    toys: '🧸'
  };

  emoji = emojiMap[category.slug] || '📦';
}

  if (category_id) {
    const cat = get('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (!cat) return res.status(400).json({ error: 'Invalid category_id' });
  }

  const id = 'P' + uuidv4().slice(0, 8).toUpperCase();
  run(`INSERT INTO products
       (id, name, brand, category_id, seller_id, description, emoji, price, mrp, stock, is_prime, badge)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, brand || null, category_id || null, req.seller.id, description || null,
     emoji , Number(price), Number(mrp), stock != null ? Number(stock) : 100,
     is_prime ? 1 : 0, badge || null]);

  const product = get('SELECT * FROM products WHERE id = ?', [id]);
  res.status(201).json({ product: { ...product, is_prime: !!product.is_prime } });
});

// PUT /api/seller/products/:id — edit own product (approved sellers only)
router.put('/:id', sellerApprovedRequired, (req, res) => {
  const product = get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.seller_id !== req.seller.id) {
    return res.status(403).json({ error: 'You can only edit your own products' });
  }

  const { name, brand, category_id, description,emoji,
        price, mrp, stock, is_prime, badge } = req.body;

  const newPrice = price != null ? Number(price) : product.price;
  const newMrp = mrp != null ? Number(mrp) : product.mrp;
  if (newPrice <= 0 || newMrp <= 0) return res.status(400).json({ error: 'price and mrp must be positive numbers' });
  if (newPrice > newMrp) return res.status(400).json({ error: 'price cannot be greater than mrp' });

  if (category_id) {
    const cat = get('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (!cat) return res.status(400).json({ error: 'Invalid category_id' });
  }

  run(`UPDATE products SET
        name = COALESCE(?, name), brand = COALESCE(?, brand), category_id = COALESCE(?, category_id),
        description = COALESCE(?, description), emoji = COALESCE(?, emoji),
        price = ?, mrp = ?, stock = COALESCE(?, stock),
        is_prime = COALESCE(?, is_prime), badge = ?
       WHERE id = ?`,
    [name || null, brand || null, category_id || null, description || null, emoji || null,
     newPrice, newMrp, stock != null ? Number(stock) : null,
     is_prime != null ? (is_prime ? 1 : 0) : null, badge !== undefined ? badge : product.badge,
     req.params.id]);

  const updated = get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  res.json({ product: { ...updated, is_prime: !!updated.is_prime } });
});

// PUT /api/seller/products/:id/stock — quick stock-only update (handy for restocking)
router.put('/:id/stock', sellerApprovedRequired, (req, res) => {
  const { stock } = req.body;
  if (stock == null || Number(stock) < 0) return res.status(400).json({ error: 'stock must be a non-negative number' });

  const product = get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.seller_id !== req.seller.id) {
    return res.status(403).json({ error: 'You can only update your own products' });
  }

  run('UPDATE products SET stock = ? WHERE id = ?', [Number(stock), req.params.id]);
  res.json({ success: true, stock: Number(stock) });
});

// DELETE /api/seller/products/:id — soft delete (keeps order history intact)
router.delete('/:id', sellerApprovedRequired, (req, res) => {
  const product = get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.seller_id !== req.seller.id) {
    return res.status(403).json({ error: 'You can only remove your own products' });
  }

  run('UPDATE products SET is_deleted = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
