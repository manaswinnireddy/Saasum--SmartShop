const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const id = 'U' + uuidv4().slice(0, 8);
    const hashed = await bcrypt.hash(password, 10);
    run('INSERT INTO users (id, name, email, password, phone) VALUES (?,?,?,?,?)',
      [id, name, email.toLowerCase(), hashed, phone || null]);

    const token = signToken({ id, role: 'user', email: email.toLowerCase(), name });
    res.status(201).json({ token, user: { id, name, email: email.toLowerCase(), phone } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ id: user.id, role: 'user', email: user.email, name: user.name });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, is_prime: !!user.is_prime } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authRequired, (req, res) => {
  const user = get('SELECT id, name, email, phone, is_prime, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ...user, is_prime: !!user.is_prime });
});

// PUT /api/auth/me
router.put('/me', authRequired, (req, res) => {
  const { name, phone } = req.body;
  run('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?',
    [name || null, phone || null, req.user.id]);
  const user = get('SELECT id, name, email, phone, is_prime FROM users WHERE id = ?', [req.user.id]);
  res.json({ ...user, is_prime: !!user.is_prime });
});

// POST /api/auth/change-password
router.post('/change-password', authRequired, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(new_password, 10);
    run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password', detail: err.message });
  }
});

module.exports = router;
