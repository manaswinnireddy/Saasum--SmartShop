const express = require('express');
const { query, run, get } = require('../db');
const { sellerAuthRequired, sellerApprovedRequired } = require('../middleware/auth');

const router = express.Router();
router.use(sellerAuthRequired, sellerApprovedRequired);

const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// GET /api/seller/orders — every order_item that contains one of this seller's products,
// grouped by order, with customer name/phone/address attached for fulfillment.
// Optional ?status=shipped to filter by item_status.
router.get('/', (req, res) => {
  const { status } = req.query;

  const where = ['oi.seller_id = ?'];
  const params = [req.seller.id];
  if (status) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    where.push('oi.item_status = ?');
    params.push(status);
  }

  const rows = query(`
    SELECT
      oi.id as item_id, oi.product_id, oi.quantity, oi.unit_price, oi.total_price, oi.item_status,
      p.name as product_name, p.emoji,
      o.id as order_id, o.status as order_status, o.payment_method, o.payment_status, o.created_at as order_date,
      u.name as customer_name, u.phone as customer_phone, u.email as customer_email,
      a.line1, a.line2, a.city, a.state, a.pincode, a.label as address_label
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    JOIN users u ON u.id = o.user_id
    LEFT JOIN addresses a ON a.id = o.address_id
    WHERE ${where.join(' AND ')}
    ORDER BY o.created_at DESC
  `, params);

  res.json({ items: rows });
});

// GET /api/seller/orders/stats — quick counts for the dashboard
router.get('/stats', (req, res) => {
  const counts = query(`
    SELECT item_status, COUNT(*) as count
    FROM order_items WHERE seller_id = ?
    GROUP BY item_status
  `, [req.seller.id]);

  const revenue = get(`
    SELECT COALESCE(SUM(total_price), 0) as total
    FROM order_items
    WHERE seller_id = ? AND item_status NOT IN ('cancelled')
  `, [req.seller.id]);

  res.json({ counts, total_revenue: revenue.total });
});

// PUT /api/seller/orders/:itemId/status — update fulfillment status for one line item.
// Sellers only control their own item's status, never the customer's whole order.
router.put('/:itemId/status', (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const item = get('SELECT * FROM order_items WHERE id = ?', [req.params.itemId]);
  if (!item) return res.status(404).json({ error: 'Order item not found' });
  if (item.seller_id !== req.seller.id) {
    return res.status(403).json({ error: 'You can only update items from your own orders' });
  }
  if (item.item_status === 'cancelled') {
    return res.status(400).json({ error: 'This item was cancelled and cannot be updated' });
  }

  run('UPDATE order_items SET item_status = ? WHERE id = ?', [status, req.params.itemId]);

  // If every item in the parent order now shares the same terminal status,
  // roll that status up to the order itself for the customer's order history.
  const order = get('SELECT * FROM orders WHERE id = ?', [item.order_id]);
  const siblingItems = query('SELECT item_status FROM order_items WHERE order_id = ?', [item.order_id]);
  const nonCancelled = siblingItems.filter(i => i.item_status !== 'cancelled');
  if (nonCancelled.length > 0 && nonCancelled.every(i => i.item_status === status)) {
    run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, item.order_id]);
  }

  res.json({ success: true, item_status: status });
});

module.exports = router;
