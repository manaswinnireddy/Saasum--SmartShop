const express = require('express');
const { query, get } = require('../db');

const router = express.Router();

function attachImages(products) {
  return products; // images table unused for now; emoji serves as the visual
}

// GET /api/products  — filters: category, search, min_price, max_price, sort, order, badge, prime, page, limit
router.get('/', (req, res) => {
  const {
    category, search, min_price, max_price,
    sort = 'created_at', order = 'desc',
    badge, prime, page = 1, limit = 20
  } = req.query;

  const where = ['p.is_deleted = 0'];
  const params = [];

  if (category) {
    where.push('(c.slug = ? OR c.id = ?)');
    params.push(category, category);
  }
  if (search) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (min_price) { where.push('p.price >= ?'); params.push(Number(min_price)); }
  if (max_price) { where.push('p.price <= ?'); params.push(Number(max_price)); }
  if (badge) { where.push('p.badge = ?'); params.push(badge); }
  if (prime === 'true' || prime === '1') { where.push('p.is_prime = 1'); }

  const sortCols = { price: 'p.price', rating: 'p.rating', name: 'p.name', created_at: 'p.created_at', popularity: 'p.review_count' };
  const sortCol = sortCols[sort] || 'p.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pg - 1) * lim;

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = get(`
    SELECT COUNT(*) as count FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ${whereSql}
  `, params).count;

  const rows = query(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           s.business_name as seller_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN sellers s ON p.seller_id = s.id
    ${whereSql}
    ORDER BY ${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `, [...params, lim, offset]);

  res.json({
    products: attachImages(rows).map(p => ({ ...p, is_prime: !!p.is_prime })),
    pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) }
  });
});

// GET /api/products/featured
router.get('/featured', (req, res) => {
  const rows = query(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_deleted = 0 AND p.badge IS NOT NULL
    ORDER BY p.review_count DESC
    LIMIT 12
  `);
  res.json({ products: rows.map(p => ({ ...p, is_prime: !!p.is_prime })) });
});

// GET /api/products/flash-deals
router.get('/flash-deals', (req, res) => {
  const rows = query(`
    SELECT f.id as deal_id, f.deal_price, f.expires_at, f.claimed_pct,
           p.*
    FROM flash_deals f
    JOIN products p ON p.id = f.product_id
    WHERE p.is_deleted = 0 AND f.expires_at > datetime('now')
    ORDER BY f.expires_at ASC
  `);
  res.json({ deals: rows.map(p => ({ ...p, is_prime: !!p.is_prime })) });
});

// GET /api/products/meta/categories
router.get('/meta/categories', (req, res) => {
  const rows = query('SELECT * FROM categories ORDER BY parent_id IS NULL DESC, name ASC');
  res.json({ categories: rows });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const product = get(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           s.business_name as seller_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN sellers s ON p.seller_id = s.id
    WHERE p.id = ? AND p.is_deleted = 0
  `, [req.params.id]);

  if (!product) return res.status(404).json({ error: 'Product not found' });

  const reviews = query(`
    SELECT r.*, u.name as user_name
    FROM reviews r JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC
  `, [req.params.id]);

  const ratingBreakdown = query(`
    SELECT rating, COUNT(*) as count FROM reviews WHERE product_id = ? GROUP BY rating
  `, [req.params.id]);

  res.json({
    ...product,
    is_prime: !!product.is_prime,
    reviews,
    rating_breakdown: ratingBreakdown
  });
});

module.exports = router;
