require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db');

const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the storefront (public/index.html) as the homepage
app.use(express.static(path.join(__dirname, 'public')));

// Request logger
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── ROUTES ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/user', require('./routes/user'));
app.use('/api/seller/auth', require('./routes/sellerAuth'));
app.use('/api/seller/products', require('./routes/sellerProducts'));
app.use('/api/seller/orders', require('./routes/sellerOrders'));
app.use('/api/admin', require('./routes/admin'));

// ── API INFO ──
app.get('/api', (req, res) => {
  res.json({
    name: 'Saasum SmartShop API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Create account',
        'POST /api/auth/login': 'Login',
        'GET /api/auth/me': 'Get profile (auth)',
        'PUT /api/auth/me': 'Update profile (auth)',
        'POST /api/auth/change-password': 'Change password (auth)'
      },
      products: {
        'GET /api/products': 'List products (filters: category, search, min_price, max_price, sort, badge, prime)',
        'GET /api/products/featured': 'Featured products',
        'GET /api/products/flash-deals': 'Flash deals',
        'GET /api/products/meta/categories': 'All categories',
        'GET /api/products/:id': 'Product detail + reviews'
      },
      cart: {
        'GET /api/cart': 'Get cart (auth)',
        'POST /api/cart': 'Add to cart (auth)',
        'PUT /api/cart/:id': 'Update quantity (auth)',
        'DELETE /api/cart/:id': 'Remove item (auth)',
        'DELETE /api/cart': 'Clear cart (auth)'
      },
      orders: {
        'GET /api/orders': 'List orders (auth)',
        'POST /api/orders': 'Place order from cart (auth)',
        'GET /api/orders/:id': 'Order detail (auth)',
        'PUT /api/orders/:id/cancel': 'Cancel order (auth)'
      },
      user: {
        'GET /api/user/addresses': 'List addresses (auth)',
        'POST /api/user/addresses': 'Add address (auth)',
        'DELETE /api/user/addresses/:id': 'Delete address (auth)',
        'GET /api/user/wishlist': 'Get wishlist (auth)',
        'POST /api/user/wishlist': 'Toggle wishlist item (auth)',
        'POST /api/user/reviews': 'Submit review (auth)'
      },
      seller_auth: {
        'POST /api/seller/auth/register': 'Create seller account (starts as pending)',
        'POST /api/seller/auth/login': 'Seller login',
        'GET /api/seller/auth/me': 'Get seller profile + approval status (seller auth)',
        'PUT /api/seller/auth/me': 'Update seller profile (seller auth)'
      },
      seller_products: {
        'GET /api/seller/products': 'List own products (seller auth)',
        'POST /api/seller/products': 'Add a product (seller auth, must be approved)',
        'PUT /api/seller/products/:id': 'Edit own product (seller auth, must be approved)',
        'PUT /api/seller/products/:id/stock': 'Quick stock update (seller auth, must be approved)',
        'DELETE /api/seller/products/:id': 'Remove own product (seller auth, must be approved)'
      },
      seller_orders: {
        'GET /api/seller/orders': 'View orders containing own products, with customer contact/address (seller auth, approved)',
        'GET /api/seller/orders/stats': 'Order counts + revenue summary (seller auth, approved)',
        'PUT /api/seller/orders/:itemId/status': 'Update fulfillment status for one item (seller auth, approved)'
      },
      admin: {
        'POST /api/admin/login': 'Admin login',
        'GET /api/admin/sellers': 'List sellers, optional ?status=pending (admin auth)',
        'GET /api/admin/sellers/:id': 'Seller detail (admin auth)',
        'PUT /api/admin/sellers/:id/approve': 'Approve a seller (admin auth)',
        'PUT /api/admin/sellers/:id/reject': 'Reject a seller (admin auth)',
        'PUT /api/admin/sellers/:id/suspend': 'Suspend a previously-approved seller (admin auth)'
      }
    }
  });
});

// ── 404 ──
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── ERROR ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── START ──
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Saasum SmartShop running at http://localhost:${PORT}`);
    console.log(`📖 API docs: http://localhost:${PORT}/api`);
    console.log(`🗃️  Database: SQLite (saasum.db)\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
