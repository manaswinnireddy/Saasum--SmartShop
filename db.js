const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'saasum.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing DB from disk if present
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    migrate(); // bring older saasum.db files up to date with new columns/tables
  } else {
    db = new SQL.Database();
    initSchema();
    seedData();
    persist();
  }

  return db;
}

// Adds new columns/tables to a pre-existing saasum.db without losing data.
// Safe to run every boot — each step checks before applying.
function migrate() {
  let changed = false;

  const tableExists = (name) => {
    const rows = query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]);
    return rows.length > 0;
  };
  const columnExists = (table, column) => {
    const rows = query(`PRAGMA table_info(${table})`);
    return rows.some(r => r.name === column);
  };

  // New tables that might not exist on an older DB
  if (!tableExists('admins')) {
    db.run(`CREATE TABLE admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
    const adminPasswordHash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT OR IGNORE INTO admins (id,name,email,password) VALUES (?,?,?,?)',
      ['admin-001', 'Site Admin', 'admin@saasum.com', adminPasswordHash]);
    changed = true;
  }

  // New columns on existing tables
  if (tableExists('sellers') && !columnExists('sellers', 'rejection_reason')) {
    db.run(`ALTER TABLE sellers ADD COLUMN rejection_reason TEXT;`);
    changed = true;
  }
  if (tableExists('sellers') && !columnExists('sellers', 'reviewed_at')) {
    db.run(`ALTER TABLE sellers ADD COLUMN reviewed_at TEXT;`);
    changed = true;
  }
  if (tableExists('products') && !columnExists('products', 'is_deleted')) {
    db.run(`ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0;`);
    changed = true;
  }
  if (tableExists('order_items') && !columnExists('order_items', 'seller_id')) {
    db.run(`ALTER TABLE order_items ADD COLUMN seller_id TEXT REFERENCES sellers(id);`);
    // backfill seller_id on existing order_items from their product's seller
    db.run(`UPDATE order_items SET seller_id = (
      SELECT seller_id FROM products WHERE products.id = order_items.product_id
    ) WHERE seller_id IS NULL;`);
    changed = true;
  }
  if (tableExists('order_items') && !columnExists('order_items', 'item_status')) {
    db.run(`ALTER TABLE order_items ADD COLUMN item_status TEXT DEFAULT 'pending';`);
    changed = true;
  }

  if (changed) persist();
}

function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      is_prime INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT,
      line1 TEXT NOT NULL,
      line2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      emoji TEXT,
      parent_id INTEGER REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS sellers (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      status TEXT DEFAULT 'pending',
      rejection_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      category_id INTEGER REFERENCES categories(id),
      seller_id TEXT REFERENCES sellers(id),
      description TEXT,
      emoji TEXT,
      price REAL NOT NULL,
      mrp REAL NOT NULL,
      stock INTEGER DEFAULT 100,
      rating REAL DEFAULT 4.0,
      review_count INTEGER DEFAULT 0,
      is_prime INTEGER DEFAULT 0,
      badge TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT REFERENCES products(id),
      url TEXT,
      is_primary INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cart (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      address_id TEXT REFERENCES addresses(id),
      status TEXT DEFAULT 'pending',
      total REAL NOT NULL,
      payment_method TEXT DEFAULT 'COD',
      payment_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT REFERENCES orders(id),
      product_id TEXT REFERENCES products(id),
      seller_id TEXT REFERENCES sellers(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      item_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT REFERENCES products(id),
      user_id TEXT REFERENCES users(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      title TEXT,
      body TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS flash_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT REFERENCES products(id),
      deal_price REAL NOT NULL,
      expires_at TEXT NOT NULL,
      claimed_pct INTEGER DEFAULT 0
    );
  `);
}

function seedData() {
  // Categories
  const cats = [
    [1,'Electronics','electronics','📱',null],
    [2,'Fashion','fashion','👗',null],
    [3,'Home & Kitchen','home-kitchen','🏠',null],
    [4,'Beauty & Health','beauty-health','💄',null],
    [5,'Sports & Fitness','sports','⚽',null],
    [6,'Books','books','📚',null],
    [7,'Grocery','grocery','🛒',null],
    [8,'Toys & Games','toys','🧸',null],
    [9,'Smartphones','smartphones','📱',1],
    [10,'Laptops','laptops','💻',1],
    [11,'Audio','audio','🎧',1],
    [12,'Wearables','wearables','⌚',1],
  ];
  const catStmt = db.prepare('INSERT OR IGNORE INTO categories (id,name,slug,emoji,parent_id) VALUES (?,?,?,?,?)');
  cats.forEach(c => catStmt.run(c));
  catStmt.free();

  // Products
  const products = [
    ['P001','Samsung Galaxy S24 Ultra 5G 256GB','Samsung',9,'Top-of-the-line flagship smartphone with 200MP camera, S Pen, and 5000mAh battery.','📱',79999,99999,50,4.8,12405,1,'best'],
    ['P002','Sony WH-1000XM5 Noise Cancelling Headphones','Sony',11,'Industry-leading noise cancellation with 30hr battery life and multipoint connection.','🎧',24990,34990,80,4.7,8762,1,'deal'],
    ['P003','Nike Air Max 270 Running Shoes','Nike',2,'Lightweight running shoes with Max Air unit for all-day comfort and style.','👟',5995,9995,200,4.5,3201,0,'new'],
    ['P004','Apple Watch Series 9 GPS 45mm','Apple',12,'Advanced health sensors, crash detection, and always-on Retina display.','⌚',38900,44900,35,4.9,21043,1,'best'],
    ['P005','HP Pavilion 15 Laptop Intel i7 16GB 512GB','HP',10,'Powerful everyday laptop with Full HD display, backlit keyboard, and fast charging.','💻',59990,79999,25,4.6,5672,1,'deal'],
    ['P006','Sony PlayStation 5 DualSense Controller','Sony',8,'Haptic feedback, adaptive triggers, and built-in microphone for next-gen gaming.','🎮',6990,8490,90,4.8,9311,0,'best'],
    ['P007','Canon EOS R50 Mirrorless Camera 24.2MP','Canon',1,'Compact mirrorless camera with eye-tracking AF, 4K video, and vari-angle touchscreen.','📷',54999,69990,15,4.7,2189,1,'new'],
    ['P008','IKEA SÖDERHAMN Sectional Sofa 3 Seat','IKEA',3,'Stylish modular sofa with washable covers and adjustable seat depth.','🛋️',34999,49999,10,4.4,1834,0,'deal'],
    ['P009','Lakme 9 to 5 Foundation SPF 25','Lakme',4,'Matte finish foundation with sun protection, available in 15 shades.','🧴',349,599,500,4.3,6720,0,'deal'],
    ['P010','Atomic Habits by James Clear Hardcover','Penguin',6,'The #1 bestselling guide to building good habits and breaking bad ones.','📚',599,999,300,4.9,45120,1,'best'],
    ['P011','Whirlpool 1.5 Ton 5 Star Inverter AC','Whirlpool',3,'Energy-efficient split AC with 6th Sense Technology and auto-clean feature.','❄️',32999,45999,20,4.5,7823,1,'deal'],
    ['P012','Prestige Svachh 5L Pressure Cooker','Prestige',3,'Alpha base technology, 5-litre capacity, and dishwasher-safe inner lid.','🍲',1799,2999,150,4.6,11432,0,'new'],
    ['P013','Adidas Ultraboost 22 Running Shoes','Adidas',5,'Responsive BOOST midsole and Primeknit upper for the ultimate run feel.','👟',8999,14999,60,4.7,4521,1,'best'],
    ['P014','Himalaya Purifying Neem Face Wash 150ml','Himalaya',4,'Gentle daily cleanser with neem and turmeric for clear, healthy skin.','🌿',149,199,1000,4.4,28930,0,null],
    ['P015','Lego Technic Bugatti Bolide 905pcs','Lego',8,'Advanced Technic model with authentic Bugatti W16 engine and aerodynamic body.','🏎️',6999,9999,30,4.8,3241,0,'new'],
  ];

  const pStmt = db.prepare(`INSERT OR IGNORE INTO products 
    (id,name,brand,category_id,description,emoji,price,mrp,stock,rating,review_count,is_prime,badge) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  products.forEach(p => pStmt.run(p));
  pStmt.free();

  // Flash Deals
  const deals = [
    ['P001', 69999, new Date(Date.now() + 2*3600000).toISOString(), 78],
    ['P002', 18999, new Date(Date.now() + 1*3600000).toISOString(), 55],
    ['P005', 49990, new Date(Date.now() + 3*3600000).toISOString(), 91],
    ['P011', 27999, new Date(Date.now() + 4*3600000).toISOString(), 64],
  ];
  const dStmt = db.prepare('INSERT OR IGNORE INTO flash_deals (product_id,deal_price,expires_at,claimed_pct) VALUES (?,?,?,?)');
  deals.forEach(d => dStmt.run(d));
  dStmt.free();

  // Default admin account (used to approve/reject sellers)
  // ⚠️ Change this password after first login in a real deployment.
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const adminStmt = db.prepare('INSERT OR IGNORE INTO admins (id,name,email,password) VALUES (?,?,?,?)');
  adminStmt.run(['admin-001', 'Site Admin', 'admin@saasum.com', adminPasswordHash]);
  adminStmt.free();
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

module.exports = { getDb, query, run, get, persist };