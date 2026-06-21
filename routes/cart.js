const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// GET /api/cart
router.get('/', (req, res) => {
  const items = query(`
    SELECT cart.id, cart.quantity, cart.added_at,
           p.id as product_id, p.name, p.emoji, p.price, p.mrp, p.stock, p.is_prime
    FROM cart
    JOIN products p ON p.id = cart.product_id
    WHERE cart.user_id = ? AND p.is_deleted = 0
    ORDER BY cart.added_at DESC
  `, [req.user.id]);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.json({ items: items.map(i => ({ ...i, is_prime: !!i.is_prime })), subtotal });
});

// POST /api/cart
router.post('/', (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const product = get('SELECT * FROM products WHERE id = ? AND is_deleted = 0', [product_id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.stock < quantity) return res.status(400).json({ error: 'Not enough stock available' });

  const existing = get('SELECT * FROM cart WHERE user_id = ? AND product_id = ?', [req.user.id, product_id]);
  if (existing) {
    run('UPDATE cart SET quantity = quantity + ? WHERE id = ?', [quantity, existing.id]);
  } else {
    run('INSERT INTO cart (id, user_id, product_id, quantity) VALUES (?,?,?,?)',
      [uuidv4(), req.user.id, product_id, quantity]);
  }
  res.status(201).json({ success: true });
});

// PUT /api/cart/:id
router.put('/:id', (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity < 1) return res.status(400).json({ error: 'quantity must be at least 1' });

  const item = get('SELECT * FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Cart item not found' });

  run('UPDATE cart SET quantity = ? WHERE id = ?', [quantity, req.params.id]);
  res.json({ success: true });
});

// DELETE /api/cart/:id
router.delete('/:id', (req, res) => {
  const item = get('SELECT * FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Cart item not found' });

  run('DELETE FROM cart WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// DELETE /api/cart
router.delete('/', (req, res) => {
  run('DELETE FROM cart WHERE user_id = ?', [req.user.id]);
  res.json({ success: true });
});

module.exports = router;
