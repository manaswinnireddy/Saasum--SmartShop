// ── Saasum Seller Center logic ──
const API = '/api';
let state = {
  token: localStorage.getItem('saasum_seller_token') || null,
  seller: JSON.parse(localStorage.getItem('saasum_seller') || 'null'),
  mode: 'login', // 'login' | 'register'
  categories: [],
};

function authHeaders() { return state.token ? { 'Authorization': `Bearer ${state.token}` } : {}; }
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function money(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function saveSession(token, seller) {
  state.token = token; state.seller = seller;
  localStorage.setItem('saasum_seller_token', token);
  localStorage.setItem('saasum_seller', JSON.stringify(seller));
}
function clearSession() {
  state.token = null; state.seller = null;
  localStorage.removeItem('saasum_seller_token');
  localStorage.removeItem('saasum_seller');
}

// ── Screen switching ──
function showScreen(name) {
  document.getElementById('gateScreen').style.display = name === 'gate' ? 'flex' : 'none';
  document.getElementById('statusScreen').style.display = name === 'status' ? 'flex' : 'none';
  document.getElementById('dashScreen').style.display = name === 'dash' ? 'flex' : 'none';
}

// ── Gate (login/register) ──
function setGateMode(mode) {
  state.mode = mode;
  document.getElementById('gateError').style.display = 'none';
  document.getElementById('registerFields').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('gateSub').textContent = mode === 'register' ? 'Register your store to start selling' : 'Sign in to manage your store';
  document.getElementById('gateSubmitBtn').textContent = mode === 'register' ? 'Register store' : 'Sign in';
  document.getElementById('gateSwitch').innerHTML = mode === 'register'
    ? `Already registered? <a id="gateSwitchLink">Sign in</a>`
    : `New seller? <a id="gateSwitchLink">Register your store</a>`;
  document.getElementById('gateSwitchLink').onclick = () => setGateMode(mode === 'register' ? 'login' : 'register');
  document.getElementById('gateForm').reset();
}
document.getElementById('gateSwitchLink').onclick = () => setGateMode('register');

document.getElementById('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('gateError');
  errEl.style.display = 'none';
  const email = document.getElementById('gateEmail').value;
  const password = document.getElementById('gatePassword').value;
  try {
    if (state.mode === 'register') {
      const business_name = document.getElementById('regBusinessName').value;
      const contact_name = document.getElementById('regContactName').value;
      const phone = document.getElementById('regPhone').value;
      if (!business_name) { errEl.textContent = 'Business name is required.'; errEl.style.display = 'block'; return; }
      await api('/seller/auth/register', { method: 'POST', body: { business_name, contact_name, phone, email, password } });
      // After registering, log straight in so we can show the pending-review screen.
      const data = await api('/seller/auth/login', { method: 'POST', body: { email, password } });
      saveSession(data.token, data.seller);
    } else {
      const data = await api('/seller/auth/login', { method: 'POST', body: { email, password } });
      saveSession(data.token, data.seller);
    }
    route();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

// ── Status screen (pending / rejected / suspended) ──
function renderStatusScreen() {
  const s = state.seller;
  const map = {
    pending: { emoji: '⏳', pill: 'pill-pending', title: 'Your account is under review', msg: 'Thanks for registering! An admin needs to review and approve your store before you can list products and receive orders. This usually doesn\'t take long — check back soon.' },
    rejected: { emoji: '✕', pill: 'pill-cancelled', title: 'Your application was not approved', msg: s.rejection_reason ? `Reason given: "${s.rejection_reason}"` : 'Your seller application was not approved at this time.' },
    suspended: { emoji: '⚠', pill: 'pill-cancelled', title: 'Your store has been suspended', msg: s.rejection_reason ? `Reason: "${s.rejection_reason}"` : 'Your store access has been suspended. Contact support for details.' },
  };
  const info = map[s.status] || map.pending;
  document.getElementById('statusEmoji').textContent = info.emoji;
  document.getElementById('statusPillBig').textContent = s.status;
  document.getElementById('statusPillBig').className = 'status-pill-big pill ' + info.pill;
  document.getElementById('statusTitle').textContent = info.title;
  document.getElementById('statusMessage').textContent = info.msg;
}
document.getElementById('statusLogoutBtn').addEventListener('click', () => { clearSession(); route(); });
document.getElementById('dashLogoutBtn').addEventListener('click', () => { clearSession(); route(); });

// ── Routing: decide which screen to show based on session + seller status ──
async function route() {
  if (!state.token || !state.seller) { showScreen('gate'); setGateMode('login'); return; }
  // Re-fetch live profile in case status changed since last login
  try {
    const fresh = await api('/seller/auth/me');
    state.seller = { ...state.seller, ...fresh };
    localStorage.setItem('saasum_seller', JSON.stringify(state.seller));
  } catch {
    clearSession(); showScreen('gate'); setGateMode('login'); return;
  }
  if (state.seller.status === 'approved') {
    showScreen('dash');
    initDashboard();
  } else {
    showScreen('status');
    renderStatusScreen();
  }
}

// ── Dashboard ──
async function initDashboard() {
  document.getElementById('sidebarBizName').textContent = state.seller.business_name;
  document.getElementById('profileBusinessName').value = state.seller.business_name || '';
  document.getElementById('profileContactName').value = state.seller.contact_name || '';
  document.getElementById('profilePhone').value = state.seller.phone || '';
  document.getElementById('profileEmail').value = state.seller.email || '';
  await loadCategoriesForForm();
  await renderOverview();
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const page = btn.dataset.page;
    ['overview', 'products', 'orders', 'profile'].forEach(p => {
      document.getElementById('page-' + p).style.display = p === page ? 'block' : 'none';
    });
    if (page === 'overview') renderOverview();
    if (page === 'products') renderProducts();
    if (page === 'orders') renderOrders();
  });
});

async function loadCategoriesForForm() {
  const { categories } = await api('/products/meta/categories');
  state.categories = categories;
  document.getElementById('pCategory').innerHTML =
    '<option value="">No category</option>' +
    categories.map(c => `<option value="${c.id}">${c.parent_id ? '— ' : ''}${c.emoji} ${c.name}</option>`).join('');
}

// ── Overview ──
async function renderOverview() {
  const { counts, total_revenue } = await api('/seller/orders/stats');
  const countMap = Object.fromEntries(counts.map(c => [c.item_status, c.count]));
  const totalOrders = counts.reduce((s, c) => s + c.count, 0);

  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><div class="label">Total order items</div><div class="value">${totalOrders}</div></div>
    <div class="stat-card"><div class="label">Pending</div><div class="value">${countMap.pending || 0}</div></div>
    <div class="stat-card"><div class="label">Shipped</div><div class="value">${countMap.shipped || 0}</div></div>
    <div class="stat-card"><div class="label">Revenue (delivered+)</div><div class="value">${money(total_revenue)}</div></div>
  `;

  const { items } = await api('/seller/orders');
  const recent = items.slice(0, 6);
  const tbody = document.getElementById('recentOrdersBody');
  if (recent.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No orders yet. Once customers buy your products, they'll show up here.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(i => `
    <tr>
      <td>${i.order_id}</td>
      <td>${i.emoji || '📦'} ${i.product_name}</td>
      <td>${i.customer_name}</td>
      <td><span class="pill pill-${i.item_status}">${i.item_status}</span></td>
    </tr>
  `).join('');
}

// ── Products ──
async function renderProducts() {
  const { products } = await api('/seller/products');
  const tbody = document.getElementById('productsBody');
  if (products.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">You haven't listed any products yet. Click "+ Add product" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td>
        <div class="cell-product">
          <div class="prod-thumb">${p.emoji || '📦'}</div>
          <div class="meta"><div class="name">${p.name}</div><div class="brand">${p.brand || p.category_name || ''}</div></div>
        </div>
      </td>
      <td>${money(p.price)} <span style="color:var(--ink-soft); text-decoration:line-through; font-size:11.5px;">${money(p.mrp)}</span></td>
      <td>
        <input type="number" class="stock-input" value="${p.stock}" min="0" onchange="updateStock('${p.id}', this.value)">
      </td>
      <td>★ ${p.rating} (${p.review_count})</td>
      <td>${p.stock > 0 ? '<span class="pill pill-delivered">In stock</span>' : '<span class="pill pill-cancelled">Out of stock</span>'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" onclick="openEditProduct('${p.id}')">Edit</button>
          <button class="icon-btn" style="color:var(--red); border-color:var(--red-bg);" onclick="deleteProduct('${p.id}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');
}
window.updateStock = async function (id, value) {
  try { await api(`/seller/products/${id}/stock`, { method: 'PUT', body: { stock: Number(value) } }); }
  catch (e) { alert(e.message); renderProducts(); }
};
window.deleteProduct = async function (id) {
  if (!confirm('Remove this product from your store? Existing orders will keep their history.')) return;
  try { await api(`/seller/products/${id}`, { method: 'DELETE' }); renderProducts(); }
  catch (e) { alert(e.message); }
};

// ── Add/Edit product modal ──
function openProductModal() { document.getElementById('productModalOverlay').classList.add('open'); }
function closeProductModal() { document.getElementById('productModalOverlay').classList.remove('open'); }
document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
document.getElementById('openAddProductBtn').addEventListener('click', () => {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productModalTitle').textContent = 'Add product';
  document.getElementById('productSubmitBtn').textContent = 'Save product';
  document.getElementById('productError').style.display = 'none';
  openProductModal();
});
window.openEditProduct = async function (id) {
  const { products } = await api('/seller/products');
  const p = products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('productId').value = p.id;
  document.getElementById('pName').value = p.name;
  document.getElementById('pBrand').value = p.brand || '';
  document.getElementById('pEmoji').value = p.emoji || '';
  document.getElementById('pCategory').value = p.category_id || '';
  document.getElementById('pDescription').value = p.description || '';
  document.getElementById('pPrice').value = p.price;
  document.getElementById('pMrp').value = p.mrp;
  document.getElementById('pStock').value = p.stock;
  document.getElementById('pBadge').value = p.badge || '';
  document.getElementById('pPrime').checked = !!p.is_prime;
  document.getElementById('productModalTitle').textContent = 'Edit product';
  document.getElementById('productSubmitBtn').textContent = 'Update product';
  document.getElementById('productError').style.display = 'none';
  openProductModal();
};
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('productError');
  errEl.style.display = 'none';
  const id = document.getElementById('productId').value;
  const payload = {
    name: document.getElementById('pName').value,
    brand: document.getElementById('pBrand').value,
    category_id: document.getElementById('pCategory').value || null,
    description: document.getElementById('pDescription').value,
    emoji: document.getElementById('pEmoji').value || '📦',
    price: Number(document.getElementById('pPrice').value),
    mrp: Number(document.getElementById('pMrp').value),
    stock: Number(document.getElementById('pStock').value),
    badge: document.getElementById('pBadge').value || null,
    is_prime: document.getElementById('pPrime').checked,
  };
  try {
    if (id) await api(`/seller/products/${id}`, { method: 'PUT', body: payload });
    else await api('/seller/products', { method: 'POST', body: payload });
    closeProductModal();
    renderProducts();
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
});

// ── Orders ──
async function renderOrders() {
  const status = document.getElementById('orderStatusFilter').value;
  const { items } = await api('/seller/orders' + (status ? `?status=${status}` : ''));
  const tbody = document.getElementById('ordersBody');
  if (items.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No orders match this filter yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(i => `
    <tr>
      <td>${i.order_id}<div style="font-size:11px; color:var(--ink-soft);">${new Date(i.order_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</div></td>
      <td>${i.emoji || '📦'} ${i.product_name}</td>
      <td>${i.quantity}</td>
      <td>${money(i.total_price)}</td>
      <td class="customer-detail">
        <strong>${i.customer_name}</strong><br>
        ${i.customer_phone || 'No phone on file'}<br>
        ${i.line1 ? `${i.line1}, ${i.line2 ? i.line2 + ', ' : ''}${i.city}, ${i.state} - ${i.pincode}` : 'No address'}
      </td>
      <td>
        ${i.item_status === 'cancelled'
          ? `<span class="pill pill-cancelled">Cancelled</span>`
          : `<select class="status-select" onchange="updateItemStatus('${i.item_id}', this.value)">
              ${['pending','confirmed','shipped','delivered'].map(s => `<option value="${s}" ${s === i.item_status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>`}
      </td>
    </tr>
  `).join('');
}
document.getElementById('orderStatusFilter').addEventListener('change', renderOrders);
window.updateItemStatus = async function (itemId, status) {
  try { await api(`/seller/orders/${itemId}/status`, { method: 'PUT', body: { status } }); renderOrders(); }
  catch (e) { alert(e.message); renderOrders(); }
};

// ── Profile ──
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('profileError');
  const okEl = document.getElementById('profileSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  try {
    const updated = await api('/seller/auth/me', {
      method: 'PUT', body: {
        business_name: document.getElementById('profileBusinessName').value,
        contact_name: document.getElementById('profileContactName').value,
        phone: document.getElementById('profilePhone').value,
      }
    });
    state.seller = { ...state.seller, ...updated };
    localStorage.setItem('saasum_seller', JSON.stringify(state.seller));
    document.getElementById('sidebarBizName').textContent = state.seller.business_name;
    okEl.textContent = 'Saved!'; okEl.style.display = 'block';
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
});

// ── Init ──
route();
