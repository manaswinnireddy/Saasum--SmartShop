const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// GET /api/orders
router.get('/', (req, res) => {
  const orders = query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({ orders });
});

// POST /api/orders  — places an order from the cart
router.post('/', (req, res) => {
  const { address_id, payment_method = 'COD' } = req.body;
  if (!address_id) return res.status(400).json({ error: 'address_id is required' });

  const address = get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [address_id, req.user.id]);
  if (!address) return res.status(404).json({ error: 'Address not found' });

  const cartItems = query(`
    SELECT cart.quantity, p.id as product_id, p.name, p.price, p.stock, p.seller_id
    FROM cart JOIN products p ON p.id = cart.product_id
    WHERE cart.user_id = ? AND p.is_deleted = 0
  `, [req.user.id]);

  if (cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  for (const item of cartItems) {
    if (item.stock < item.quantity) {
      return res.status(400).json({ error: `Not enough stock for ${item.name}` });
    }
  }

  const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const orderId = 'ORD' + uuidv4().slice(0, 10).toUpperCase();

  run('INSERT INTO orders (id, user_id, address_id, total, payment_method) VALUES (?,?,?,?,?)',
    [orderId, req.user.id, address_id, total, payment_method]);

  for (const item of cartItems) {
    run(`INSERT INTO order_items (id, order_id, product_id, seller_id, quantity, unit_price, total_price)
         VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), orderId, item.product_id, item.seller_id, item.quantity, item.price, item.price * item.quantity]);
    run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
  }

  run('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

  const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
  res.status(201).json({ order });
});

// GET /api/orders/:id
router.get('/:id', (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = query(`
    SELECT oi.*, p.name, p.emoji
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `, [req.params.id]);

  const address = get('SELECT * FROM addresses WHERE id = ?', [order.address_id]);

  res.json({ ...order, items, address });
});

// PUT /api/orders/:id/cancel
router.put('/:id/cancel', (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['cancelled', 'delivered'].includes(order.status)) {
    return res.status(400).json({ error: `Order already ${order.status}, cannot cancel` });
  }

  const items = query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
  for (const item of items) {
    run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
  }
  run("UPDATE order_items SET item_status = 'cancelled' WHERE order_id = ?", [req.params.id]);
  run("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [req.params.id]);

  res.json({ success: true });
});

module.exports = router;
