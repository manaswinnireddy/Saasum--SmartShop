# Saasum SmartShop 🛒

A full-stack e-commerce web app — real frontend, real backend API, and a real
(persisted) SQLite database. Everything below is wired together and tested
end-to-end; nothing is mocked.

## What's included

- **Frontend** (`public/index.html`) — the storefront UI: hero slider, category
  grid, search, flash deals with live countdowns, product grid, cart drawer,
  checkout, login/register, order history, and wishlist. Plain HTML/CSS/JS,
  no build step.
- **Backend** (`server.js` + `routes/`) — Express REST API for auth, products,
  cart, orders, addresses, wishlist, and reviews.
- **Database** (`db.js`) — SQLite via `sql.js`, stored in a single file
  (`saasum.db`) that's created and seeded automatically the first time you run
  the server, then persisted to disk after every write.

## Features

- Email/password registration & login (JWT-based sessions, passwords hashed
  with bcrypt)
- Live product catalog with search, category filters, and sorting
- Flash deals with real countdown timers pulled from the database
- Cart that's actually saved server-side per user (survives refresh/relogin)
- Address book + checkout flow that creates a real order, decrements stock,
  and clears the cart
- Order history with cancel/refund (restores stock)
- Wishlist (heart icon) backed by the database
- Product ratings/reviews support in the API (ready for a reviews UI if you
  want to extend it)
- **Seller accounts** — vendors register at `/seller.html`, get reviewed by
  an admin, and once approved can add/edit/remove their own products and
  manage stock from a dedicated dashboard
- **Seller order fulfillment** — sellers see every order containing their
  products (with customer name, phone, and delivery address) and can move
  each line item through pending → confirmed → shipped → delivered
- **Admin approval queue** — a separate admin login at `/admin.html` to
  approve, reject, or suspend seller accounts before they can sell

## Who can do what

| Role | Signs in at | Can do |
|---|---|---|
| **Customer** | `/` (Sign in) | Browse, cart, checkout, review, wishlist |
| **Seller** | `/seller.html` | Register store, manage own products & stock, view/fulfill own orders — only once an admin approves the account |
| **Admin** | `/admin.html` | Approve / reject / suspend seller accounts |

### Seller approval flow
1. A vendor registers at `/seller.html` → account is created with `status = 'pending'`.
2. They can log in immediately and will see a "pending review" screen, but
   cannot list products or see orders yet.
3. An admin logs in at `/admin.html`, reviews the seller's details, and
   clicks **Approve** (or **Reject** with a reason).
4. Once approved, the seller's next dashboard refresh unlocks the **Products**
   and **Orders** tabs.

A default admin account is seeded automatically the first time the database
is created:
```
Email:    admin@saasum.com
Password: admin123
```
⚠️ **Change this password** before deploying anywhere real — there's no
"create another admin" UI yet, so for now treat `/api/admin/login` +
this seed account as the way in, and rotate the password via the database
or by hashing a new one with bcrypt if you extend the API.


## Requirements

- [Node.js](https://nodejs.org) 18 or newer (includes npm)

## Setup & Run

```bash
cd saasum-smartshop
npm install
npm start
```

Then open **http://localhost:3000** in your browser. That's it — frontend and
backend are served from the same Express app, so there's no separate
frontend server and no CORS issues.

The first time you start the server it will create `saasum.db` and seed it
with sample categories, products, and flash deals. On every later start it
reuses that same file, so accounts, carts, and orders persist across
restarts. Delete `saasum.db` any time to reset to a clean, freshly-seeded
database.

To use a different port or JWT secret, edit `.env`:

```
PORT=3000
JWT_SECRET=change-me-to-something-random
```

## Project structure

```
saasum-smartshop/
├── server.js              Express app entry point
├── db.js                  SQLite setup, schema, seed data, migrations, query helpers
├── package.json
├── .env                   PORT and JWT_SECRET
├── middleware/
│   └── auth.js              JWT auth middleware (customer / seller / admin)
├── routes/
│   ├── auth.js              customer register, login, profile, change password
│   ├── products.js          list/search/filter, featured, flash deals, categories
│   ├── cart.js               get/add/update/remove cart items
│   ├── orders.js              place order, list/view orders, cancel
│   ├── user.js                 addresses, wishlist, reviews
│   ├── sellerAuth.js          seller register, login, profile
│   ├── sellerProducts.js      seller's own product CRUD + stock updates
│   ├── sellerOrders.js         seller order visibility + fulfillment status
│   └── admin.js                 admin login + seller approve/reject/suspend
└── public/
    ├── index.html          the customer storefront
    ├── app.js                storefront frontend logic
    ├── seller.html          seller dashboard (register/login gate + product & order management)
    ├── seller.js              seller dashboard frontend logic
    ├── admin.html            admin seller-approval panel
    └── admin.js                admin panel frontend logic
```

## API reference

Full machine-readable list is also available live at `GET /api`.

**Auth**
- `POST /api/auth/register` — `{ name, email, password, phone? }`
- `POST /api/auth/login` — `{ email, password }`
- `GET /api/auth/me` *(auth)*
- `PUT /api/auth/me` *(auth)* — `{ name, phone }`
- `POST /api/auth/change-password` *(auth)*

**Products**
- `GET /api/products` — filters: `category, search, min_price, max_price, sort, order, badge, prime, page, limit`
- `GET /api/products/featured`
- `GET /api/products/flash-deals`
- `GET /api/products/meta/categories`
- `GET /api/products/:id`

**Cart** *(all auth)*
- `GET /api/cart`
- `POST /api/cart` — `{ product_id, quantity? }`
- `PUT /api/cart/:id` — `{ quantity }`
- `DELETE /api/cart/:id`
- `DELETE /api/cart`

**Orders** *(all auth)*
- `GET /api/orders`
- `POST /api/orders` — `{ address_id, payment_method? }`
- `GET /api/orders/:id`
- `PUT /api/orders/:id/cancel`

**User** *(all auth)*
- `GET /api/user/addresses`
- `POST /api/user/addresses`
- `DELETE /api/user/addresses/:id`
- `GET /api/user/wishlist`
- `POST /api/user/wishlist` — `{ product_id }` (toggles)
- `DELETE /api/user/wishlist/:id`
- `POST /api/user/reviews` — `{ product_id, rating, title?, body? }`

**Seller auth**
- `POST /api/seller/auth/register` — `{ business_name, contact_name?, email, password, phone? }` (starts `pending`)
- `POST /api/seller/auth/login` — `{ email, password }`
- `GET /api/seller/auth/me` *(seller auth)*
- `PUT /api/seller/auth/me` *(seller auth)* — `{ business_name?, contact_name?, phone? }`

**Seller products** *(seller auth; add/edit/remove require `approved` status)*
- `GET /api/seller/products` — list own products
- `POST /api/seller/products` — `{ name, price, mrp, brand?, category_id?, description?, emoji?, stock?, is_prime?, badge? }`
- `PUT /api/seller/products/:id` — edit own product
- `PUT /api/seller/products/:id/stock` — `{ stock }`
- `DELETE /api/seller/products/:id` — soft-delete (keeps order history intact)

**Seller orders** *(seller auth, must be `approved`)*
- `GET /api/seller/orders` — optional `?status=pending|confirmed|shipped|delivered|cancelled`; returns customer name/phone/address per item
- `GET /api/seller/orders/stats` — counts by status + total revenue
- `PUT /api/seller/orders/:itemId/status` — `{ status }`, updates one line item only

**Admin**
- `POST /api/admin/login` — `{ email, password }`
- `GET /api/admin/sellers` *(admin auth)* — optional `?status=pending`
- `GET /api/admin/sellers/:id` *(admin auth)*
- `PUT /api/admin/sellers/:id/approve` *(admin auth)*
- `PUT /api/admin/sellers/:id/reject` *(admin auth)* — `{ reason? }`
- `PUT /api/admin/sellers/:id/suspend` *(admin auth)* — `{ reason? }`

## Notes & next steps

- Authentication uses JWTs stored in the browser's `localStorage` — fine for
  local/dev use; for production you'd want HTTPS, shorter token lifetimes,
  and refresh tokens.
- `sql.js` is a WebAssembly build of SQLite — great for a self-contained demo
  with zero native-binary headaches, but for heavier production traffic
  you'd likely swap in `better-sqlite3` or Postgres using the same `db.js`
  interface (`query`, `run`, `get`).
- Payment is simulated (the `payment_method` is recorded but no real payment
  gateway is integrated). Wiring in Razorpay/Stripe would slot into
  `routes/orders.js`.
- A product detail page, a dedicated reviews UI, and order tracking are all
  supported by the API already (`GET /api/products/:id` returns reviews +
  rating breakdown) but don't yet have a frontend screen — straightforward
  to add if you want them.
