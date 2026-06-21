const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// ── Addresses ──
router.get('/addresses', (req, res) => {
  const addresses = query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC', [req.user.id]);
  res.json({ addresses: addresses.map(a => ({ ...a, is_default: !!a.is_default })) });
});

router.post('/addresses', (req, res) => {
  const { label, line1, line2, city, state, pincode, is_default } = req.body;
  if (!line1 || !city || !state || !pincode) {
    return res.status(400).json({ error: 'line1, city, state, and pincode are required' });
  }
  const id = uuidv4();
  if (is_default) {
    run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
  }
  run(`INSERT INTO addresses (id, user_id, label, line1, line2, city, state, pincode, is_default)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, label || null, line1, line2 || null, city, state, pincode, is_default ? 1 : 0]);
  res.status(201).json({ address: get('SELECT * FROM addresses WHERE id = ?', [id]) });
});

router.delete('/addresses/:id', (req, res) => {
  const addr = get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!addr) return res.status(404).json({ error: 'Address not found' });
  run('DELETE FROM addresses WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Wishlist ──
router.get('/wishlist', (req, res) => {
  const items = query(`
    SELECT w.id as wishlist_id, p.*
    FROM wishlist w JOIN products p ON p.id = w.product_id
    WHERE w.user_id = ? AND p.is_deleted = 0
    ORDER BY w.added_at DESC
  `, [req.user.id]);
  res.json({ items: items.map(i => ({ ...i, is_prime: !!i.is_prime })) });
});

// Toggles a product in/out of the wishlist
router.post('/wishlist', (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const existing = get('SELECT * FROM wishlist WHERE user_id = ? AND product_id = ?', [req.user.id, product_id]);
  if (existing) {
    run('DELETE FROM wishlist WHERE id = ?', [existing.id]);
    return res.json({ wishlisted: false });
  }
  run('INSERT INTO wishlist (id, user_id, product_id) VALUES (?,?,?)', [uuidv4(), req.user.id, product_id]);
  res.json({ wishlisted: true });
});

router.delete('/wishlist/:id', (req, res) => {
  const item = get('SELECT * FROM wishlist WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Wishlist item not found' });
  run('DELETE FROM wishlist WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Reviews ──
router.post('/reviews', (req, res) => {
  const { product_id, rating, title, body } = req.body;
  if (!product_id || !rating) return res.status(400).json({ error: 'product_id and rating are required' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be between 1 and 5' });

  const product = get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [product_id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const existing = get('SELECT * FROM reviews WHERE user_id = ? AND product_id = ?', [req.user.id, product_id]);
  if (existing) {
    run('UPDATE reviews SET rating = ?, title = ?, body = ? WHERE id = ?',
      [rating, title || null, body || null, existing.id]);
  } else {
    run('INSERT INTO reviews (id, product_id, user_id, rating, title, body) VALUES (?,?,?,?,?,?)',
      [uuidv4(), product_id, req.user.id, rating, title || null, body || null]);
  }

  const stats = get('SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE product_id = ?', [product_id]);
  run('UPDATE products SET rating = ?, review_count = ? WHERE id = ?',
    [Math.round(stats.avg_rating * 10) / 10, stats.count, product_id]);

  res.status(201).json({ success: true });
});

module.exports = router;
