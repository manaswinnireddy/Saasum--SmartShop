const express = require('express');
const bcrypt = require('bcryptjs');
const { query, run, get } = require('../db');
const { signToken, adminAuthRequired } = require('../middleware/auth');

const router = express.Router();

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const admin = get('SELECT * FROM admins WHERE email = ?', [email.toLowerCase()]);
    if (!admin) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ id: admin.id, role: 'admin', email: admin.email, name: admin.name });
    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

router.use(adminAuthRequired);

// GET /api/admin/sellers — list sellers, optionally filtered by ?status=pending
router.get('/sellers', (req, res) => {
  const { status } = req.query;
  const sellers = status
    ? query('SELECT id, business_name, contact_name, email, phone, status, rejection_reason, created_at, reviewed_at FROM sellers WHERE status = ? ORDER BY created_at DESC', [status])
    : query('SELECT id, business_name, contact_name, email, phone, status, rejection_reason, created_at, reviewed_at FROM sellers ORDER BY created_at DESC');
  res.json({ sellers });
});

// GET /api/admin/sellers/:id
router.get('/sellers/:id', (req, res) => {
  const seller = get('SELECT id, business_name, contact_name, email, phone, status, rejection_reason, created_at, reviewed_at FROM sellers WHERE id = ?', [req.params.id]);
  if (!seller) return res.status(404).json({ error: 'Seller not found' });

  const productCount = get('SELECT COUNT(*) as count FROM products WHERE seller_id = ? AND is_deleted = 0', [req.params.id]);
  res.json({ ...seller, product_count: productCount.count });
});

// PUT /api/admin/sellers/:id/approve
router.put('/sellers/:id/approve', (req, res) => {
  const seller = get('SELECT * FROM sellers WHERE id = ?', [req.params.id]);
  if (!seller) return res.status(404).json({ error: 'Seller not found' });

  run("UPDATE sellers SET status = 'approved', rejection_reason = NULL, reviewed_at = datetime('now') WHERE id = ?", [req.params.id]);
  res.json({ success: true, status: 'approved' });
});

// PUT /api/admin/sellers/:id/reject
router.put('/sellers/:id/reject', (req, res) => {
  const { reason } = req.body;
  const seller = get('SELECT * FROM sellers WHERE id = ?', [req.params.id]);
  if (!seller) return res.status(404).json({ error: 'Seller not found' });

  run("UPDATE sellers SET status = 'rejected', rejection_reason = ?, reviewed_at = datetime('now') WHERE id = ?",
    [reason || 'Not specified', req.params.id]);
  res.json({ success: true, status: 'rejected' });
});

// PUT /api/admin/sellers/:id/suspend — revoke a previously-approved seller (e.g. policy violation)
router.put('/sellers/:id/suspend', (req, res) => {
  const { reason } = req.body;
  const seller = get('SELECT * FROM sellers WHERE id = ?', [req.params.id]);
  if (!seller) return res.status(404).json({ error: 'Seller not found' });

  run("UPDATE sellers SET status = 'suspended', rejection_reason = ?, reviewed_at = datetime('now') WHERE id = ?",
    [reason || 'Not specified', req.params.id]);
  res.json({ success: true, status: 'suspended' });
});

module.exports = router;
