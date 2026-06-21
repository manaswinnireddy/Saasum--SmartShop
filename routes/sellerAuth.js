const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../db');
const { signToken, sellerAuthRequired } = require('../middleware/auth');

const router = express.Router();

// POST /api/seller/auth/register
// New sellers start in 'pending' status and cannot list products until an
// admin approves them via PUT /api/admin/sellers/:id/approve
router.post('/register', async (req, res) => {
  try {
    const { business_name, contact_name, email, password, phone } = req.body;
    if (!business_name || !email || !password) {
      return res.status(400).json({ error: 'business_name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = get('SELECT id FROM sellers WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'A seller account with this email already exists' });

    const id = 'S' + uuidv4().slice(0, 8);
    const hashed = await bcrypt.hash(password, 10);
    run(`INSERT INTO sellers (id, business_name, contact_name, email, password, phone, status)
         VALUES (?,?,?,?,?,?, 'pending')`,
      [id, business_name, contact_name || null, email.toLowerCase(), hashed, phone || null]);

    res.status(201).json({
      message: 'Registration received. An admin needs to approve your account before you can list products.',
      seller: { id, business_name, email: email.toLowerCase(), status: 'pending' }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

// POST /api/seller/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const seller = get('SELECT * FROM sellers WHERE email = ?', [email.toLowerCase()]);
    if (!seller) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, seller.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Sellers can log in even while pending/rejected so they can see their status,
    // but route-level checks block them from product/order actions until approved.
    const token = signToken({ id: seller.id, role: 'seller', email: seller.email, business_name: seller.business_name, status: seller.status });
    res.json({
      token,
      seller: {
        id: seller.id, business_name: seller.business_name, contact_name: seller.contact_name,
        email: seller.email, phone: seller.phone, status: seller.status,
        rejection_reason: seller.rejection_reason
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

// GET /api/seller/auth/me
router.get('/me', sellerAuthRequired, (req, res) => {
  const seller = get(`SELECT id, business_name, contact_name, email, phone, status, rejection_reason, created_at
                       FROM sellers WHERE id = ?`, [req.seller.id]);
  if (!seller) return res.status(404).json({ error: 'Seller not found' });
  res.json(seller);
});

// PUT /api/seller/auth/me
router.put('/me', sellerAuthRequired, (req, res) => {
  const { business_name, contact_name, phone } = req.body;
  run(`UPDATE sellers SET business_name = COALESCE(?, business_name),
       contact_name = COALESCE(?, contact_name), phone = COALESCE(?, phone) WHERE id = ?`,
    [business_name || null, contact_name || null, phone || null, req.seller.id]);
  const seller = get('SELECT id, business_name, contact_name, email, phone, status FROM sellers WHERE id = ?', [req.seller.id]);
  res.json(seller);
});

module.exports = router;
