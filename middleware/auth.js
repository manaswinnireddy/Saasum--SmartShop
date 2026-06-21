const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Customer auth (role: 'user') ──
function authRequired(req, res, next) {
  const decoded = readToken(req);
  if (!decoded || decoded.role !== 'user') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = decoded;
  next();
}

function authOptional(req, res, next) {
  const decoded = readToken(req);
  if (decoded && decoded.role === 'user') req.user = decoded;
  next();
}

// ── Seller auth (role: 'seller') ──
function sellerAuthRequired(req, res, next) {
  const decoded = readToken(req);
  if (!decoded || decoded.role !== 'seller') {
    return res.status(401).json({ error: 'Seller authentication required' });
  }
  req.seller = decoded;
  next();
}

// Only lets approved sellers through. Use after sellerAuthRequired.
// Re-reads status from the DB rather than trusting the JWT claim, since a
// seller's approval status can change after their token was issued.
function sellerApprovedRequired(req, res, next) {
  const { get } = require('../db');
  const seller = get('SELECT status FROM sellers WHERE id = ?', [req.seller.id]);
  if (!seller || seller.status !== 'approved') {
    return res.status(403).json({
      error: 'Your seller account is not approved yet',
      status: seller ? seller.status : 'unknown'
    });
  }
  next();
}

// ── Admin auth (role: 'admin') ──
function adminAuthRequired(req, res, next) {
  const decoded = readToken(req);
  if (!decoded || decoded.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  req.admin = decoded;
  next();
}

module.exports = {
  signToken,
  authRequired,
  authOptional,
  sellerAuthRequired,
  sellerApprovedRequired,
  adminAuthRequired,
};
