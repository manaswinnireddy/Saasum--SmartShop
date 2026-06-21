const categoryEmojis = {
  electronics: '📱',
  smartphones: '📱',
  laptops: '💻',
  audio: '🎧',
  wearables: '⌚',
  fashion: '👗',
  'home-kitchen': '🏠',
  'beauty-health': '💄',
  sports: '⚽',
  books: '📚',
  grocery: '🛒',
  toys: '🧸'
};
// ── Saasum SmartShop storefront logic ──
const API = '/api';
let state = {
  token: localStorage.getItem('saasum_token') || null,
  user: JSON.parse(localStorage.getItem('saasum_user') || 'null'),
  categories: [],
  cart: { items: [], subtotal: 0 },
  wishlist: [],
  addresses: [],
  authMode: 'login', // 'login' | 'register'
};

// ── Helpers ──
function authHeaders() {
  return state.token ? { 'Authorization': `Bearer ${state.token}` } : {};
}
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
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}
function stars(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
function discountPct(price, mrp) {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

// ── Auth gating ──
function isLoggedIn() { return !!state.token && !!state.user; }
function requireAuth(action) {
  if (isLoggedIn()) { action(); return; }
  openAuthModal('login');
}
function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('saasum_token');
  localStorage.removeItem('saasum_user');
  renderAccountLabel();
  closeDrawer('accountDrawer', 'accountOverlay');
  toast('Signed out');
  refreshCart(); refreshWishlist();
}

// ── Header rendering ──
function renderAccountLabel() {
  document.getElementById('accountLabel').textContent = isLoggedIn() ? state.user.name.split(' ')[0] : 'Sign in';
}

// ── Categories ──
async function loadCategories() {
  const { categories } = await api('/products/meta/categories');
  state.categories = categories;
  const topLevel = categories.filter(c => !c.parent_id);

  document.querySelector('#catNav .container').innerHTML =
    `<button data-cat="" class="active">All</button>` +
    topLevel.map(c => `<button data-cat="${c.slug}">${c.emoji} ${c.name}</button>`).join('');

  document.getElementById('categoryGrid').innerHTML = topLevel.map(c => `
    <div class="cat-card" data-cat="${c.slug}">
      <div class="emoji">${c.emoji}</div>
      <div class="label">${c.name}</div>
    </div>
  `).join('');

  const sel = document.getElementById('categoryFilter');
  sel.innerHTML = '<option value="">All categories</option>' +
    categories.map(c => `<option value="${c.slug}">${c.parent_id ? '— ' : ''}${c.name}</option>`).join('');

  document.querySelectorAll('#catNav button, .cat-card').forEach(el => {
    el.addEventListener('click', () => {
      const cat = el.dataset.cat;
      document.getElementById('categoryFilter').value = cat;
      document.querySelectorAll('#catNav button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
      loadProducts();
      document.getElementById('catalogTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ── Flash deals ──
async function loadFlashDeals() {
  const { deals } = await api('/products/flash-deals');
  const grid = document.getElementById('flashGrid');
  if (deals.length === 0) {
    grid.innerHTML = `<div style="color:#C9C9DE; font-size:13px;">No flash deals running right now — check back soon.</div>`;
    return;
  }
  grid.innerHTML = deals.map(d => `
    <div class="deal-card">
      <span class="countdown-pill" data-expires="${d.expires_at}">--:--</span>
      <div class="img-area">
  ${categoryEmojis[p.category_slug] || '📦'}
</div>
      <div class="name">${d.name}</div>
      <div class="deal-price-row">
        <span class="deal-price">${money(d.deal_price)}</span>
        <span class="deal-mrp">${money(d.mrp)}</span>
      </div>
      <div class="claim-bar"><div class="claim-fill" style="width:${d.claimed_pct}%;"></div></div>
      <div class="claim-label">${d.claimed_pct}% claimed</div>
      <button class="add-cart-btn" style="margin-top:10px;" onclick="addToCart('${d.id}')">Add to cart</button>
    </div>
  `).join('');
  tickCountdowns();
}
function tickCountdowns() {
  document.querySelectorAll('.countdown-pill').forEach(pill => {
    const expires = new Date(pill.dataset.expires).getTime();
    const diff = expires - Date.now();
    if (diff <= 0) { pill.textContent = 'Ended'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    pill.textContent = `${h}h ${m}m ${s}s`;
  });
}
setInterval(tickCountdowns, 1000);

// ── Product catalog ──
function productCardHTML(p) {
  const badgeMap = { best: 'Best Seller', deal: "Today's Deal", new: 'New Arrival' };
  const isWishlisted = state.wishlist.some(w => w.id === p.id);
  return `
    <div class="product-card">
      <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${p.id}')">${isWishlisted ? '♥' : '♡'}</button>
      <div class="img-area">${p.emoji || '📦'}</div>
      ${p.badge ? `<span class="badge-pill badge-${p.badge}">${badgeMap[p.badge] || p.badge}</span>` : ''}
      <div class="brand">${p.brand || ''}</div>
      <div class="name">${p.name}</div>
      <div class="rating-row">
        <span class="stars">${stars(p.rating)}</span>
        <span class="review-count">${p.rating} (${(p.review_count || 0).toLocaleString('en-IN')})</span>
      </div>
      <div class="price-row">
        <span class="price">${money(p.price)}</span>
        <span class="mrp">${money(p.mrp)}</span>
        <span class="discount-pct">${discountPct(p.price, p.mrp)}% off</span>
      </div>
      ${p.is_prime ? `<div class="prime-tag">✓ Prime delivery</div>` : '<div style="height:18px;"></div>'}
      <button class="add-cart-btn" onclick="addToCart('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Out of stock' : 'Add to cart'}</button>
      ${p.seller_name ? `<div class="seller-tag">Sold by ${p.seller_name}</div>` : ''}
    </div>
  `;
}

let searchDebounce;
async function loadProducts() {
  const category = document.getElementById('categoryFilter').value;
  const [sort, order] = document.getElementById('sortFilter').value.split('-');
  const prime = document.getElementById('primeFilter').value;
  const search = document.getElementById('searchInput').value.trim();

  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);
  if (prime) params.set('prime', prime);
  if (search) params.set('search', search);
  params.set('limit', '20');

  document.getElementById('catalogTitle').textContent = search ? `Results for "${search}"` : (category ? state.categories.find(c => c.slug === category)?.name || 'Products' : 'Recommended for you');
  document.getElementById('catalogSub').textContent = search ? 'Matching products from across the catalog' : 'Based on what\'s trending right now';

  const { products } = await api('/products?' + params.toString());
  const grid = document.getElementById('productGrid');
  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="emoji">🔍</div>No products matched your search.</div>`;
    return;
  }
  grid.innerHTML = products.map(productCardHTML).join('');
}

document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadProducts, 350);
});
document.getElementById('searchBtn').addEventListener('click', loadProducts);
document.getElementById('categoryFilter').addEventListener('change', loadProducts);
document.getElementById('sortFilter').addEventListener('change', loadProducts);
document.getElementById('primeFilter').addEventListener('change', loadProducts);

// ── Cart ──
async function refreshCart() {
  if (!isLoggedIn()) { state.cart = { items: [], subtotal: 0 }; renderCartCount(); return; }
  try {
    const data = await api('/cart');
    state.cart = data;
  } catch { state.cart = { items: [], subtotal: 0 }; }
  renderCartCount();
}
function renderCartCount() {
  const count = state.cart.items.reduce((s, i) => s + i.quantity, 0);
  const el = document.getElementById('cartCount');
  el.textContent = count;
  el.style.display = count > 0 ? 'flex' : 'none';
}
window.addToCart = function (productId) {
  requireAuth(async () => {
    try {
      await api('/cart', { method: 'POST', body: { product_id: productId, quantity: 1 } });
      await refreshCart();
      toast('Added to cart');
    } catch (e) { toast(e.message); }
  });
};
function renderCartDrawer() {
  const body = document.getElementById('cartBody');
  const foot = document.getElementById('cartFoot');
  if (state.cart.items.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="emoji">🛒</div>Your cart is empty.</div>`;
    foot.innerHTML = '';
    return;
  }
  body.innerHTML = state.cart.items.map(i => `
    <div class="cart-item">
      <div class="img-area">${i.emoji || '📦'}</div>
      <div class="cart-item-info">
        <div class="name">${i.name}</div>
        <div class="price">${money(i.price)}</div>
        <div class="qty-control">
          <button onclick="updateCartQty('${i.id}', ${i.quantity - 1})">−</button>
          <span>${i.quantity}</span>
          <button onclick="updateCartQty('${i.id}', ${i.quantity + 1})">+</button>
        </div>
        <div class="remove-link" onclick="removeCartItem('${i.id}')">Remove</div>
      </div>
    </div>
  `).join('');
  foot.innerHTML = `
    <div class="subtotal-row"><span>Subtotal</span><span>${money(state.cart.subtotal)}</span></div>
    <button class="checkout-btn" onclick="openCheckout()">Proceed to checkout</button>
  `;
}
window.updateCartQty = async function (id, qty) {
  if (qty < 1) return removeCartItem(id);
  try { await api(`/cart/${id}`, { method: 'PUT', body: { quantity: qty } }); await refreshCart(); renderCartDrawer(); }
  catch (e) { toast(e.message); }
};
window.removeCartItem = async function (id) {
  try { await api(`/cart/${id}`, { method: 'DELETE' }); await refreshCart(); renderCartDrawer(); }
  catch (e) { toast(e.message); }
};

// ── Wishlist ──
async function refreshWishlist() {
  if (!isLoggedIn()) { state.wishlist = []; return; }
  try { const data = await api('/user/wishlist'); state.wishlist = data.items; } catch { state.wishlist = []; }
}
window.toggleWishlist = function (productId) {
  requireAuth(async () => {
    try {
      const { wishlisted } = await api('/user/wishlist', { method: 'POST', body: { product_id: productId } });
      await refreshWishlist();
      toast(wishlisted ? 'Added to wishlist' : 'Removed from wishlist');
      loadProducts();
      if (document.getElementById('wishlistDrawer').classList.contains('open')) renderWishlistDrawer();
    } catch (e) { toast(e.message); }
  });
};
function renderWishlistDrawer() {
  const body = document.getElementById('wishlistBody');
  if (state.wishlist.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="emoji">♡</div>Your wishlist is empty.</div>`;
    return;
  }
  body.innerHTML = state.wishlist.map(p => `
    <div class="cart-item">
      <div class="img-area">${p.emoji || '📦'}</div>
      <div class="cart-item-info">
        <div class="name">${p.name}</div>
        <div class="price">${money(p.price)}</div>
        <div class="qty-control">
          <button class="add-cart-btn" style="padding:6px 12px;" onclick="addToCart('${p.id}')">Add to cart</button>
        </div>
        <div class="remove-link" onclick="toggleWishlist('${p.id}'); setTimeout(renderWishlistDrawer, 300)">Remove</div>
      </div>
    </div>
  `).join('');
}

// ── Drawers (generic open/close) ──
function openDrawer(drawerId, overlayId) {
  document.getElementById(drawerId).classList.add('open');
  document.getElementById(overlayId).classList.add('open');
}
function closeDrawer(drawerId, overlayId) {
  document.getElementById(drawerId).classList.remove('open');
  document.getElementById(overlayId).classList.remove('open');
}
document.getElementById('cartBtn').addEventListener('click', () => { renderCartDrawer(); openDrawer('cartDrawer', 'cartOverlay'); });
document.getElementById('closeCart').addEventListener('click', () => closeDrawer('cartDrawer', 'cartOverlay'));
document.getElementById('cartOverlay').addEventListener('click', () => closeDrawer('cartDrawer', 'cartOverlay'));

document.getElementById('wishlistBtn').addEventListener('click', () => {
  requireAuth(() => { renderWishlistDrawer(); openDrawer('wishlistDrawer', 'wishlistOverlay'); });
});
document.getElementById('closeWishlist').addEventListener('click', () => closeDrawer('wishlistDrawer', 'wishlistOverlay'));
document.getElementById('wishlistOverlay').addEventListener('click', () => closeDrawer('wishlistDrawer', 'wishlistOverlay'));

document.getElementById('accountBtn').addEventListener('click', () => {
  if (!isLoggedIn()) { openAuthModal('login'); return; }
  renderAccountDrawer();
  openDrawer('accountDrawer', 'accountOverlay');
});
document.getElementById('closeAccount').addEventListener('click', () => closeDrawer('accountDrawer', 'accountOverlay'));
document.getElementById('accountOverlay').addEventListener('click', () => closeDrawer('accountDrawer', 'accountOverlay'));

// ── Account drawer (profile / addresses / orders) ──
async function renderAccountDrawer() {
  const body = document.getElementById('accountBody');
  body.innerHTML = `
    <div style="margin-bottom:20px;">
      <div style="font-weight:700; font-size:15px;">${state.user.name}</div>
      <div style="font-size:12.5px; color:var(--ink-soft);">${state.user.email}</div>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:20px;">
      <button class="action" style="background:var(--cream-deep); color:var(--ink); padding:8px 14px; border-radius:7px; font-size:12.5px;" id="tabOrders">My Orders</button>
      <button class="action" style="background:var(--cream-deep); color:var(--ink); padding:8px 14px; border-radius:7px; font-size:12.5px;" id="tabAddresses">Addresses</button>
      <button class="action" style="background:var(--red-bg); color:var(--red); padding:8px 14px; border-radius:7px; font-size:12.5px;" id="tabLogout">Sign out</button>
    </div>
    <div id="accountTabContent"></div>
  `;
  document.getElementById('tabOrders').onclick = renderOrdersTab;
  document.getElementById('tabAddresses').onclick = renderAddressesTab;
  document.getElementById('tabLogout').onclick = logout;
  renderOrdersTab();
}
async function renderOrdersTab() {
  const content = document.getElementById('accountTabContent');
  content.innerHTML = 'Loading...';
  const { orders } = await api('/orders');
  if (orders.length === 0) { content.innerHTML = `<div class="empty-state"><div class="emoji">📦</div>No orders yet.</div>`; return; }
  content.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-head">
        <span class="order-id">${o.id}</span>
        <span class="order-status status-${o.status}">${o.status}</span>
      </div>
      <div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:8px;">${new Date(o.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} · ${money(o.total)} · ${o.payment_method}</div>
      ${!['cancelled','delivered'].includes(o.status) ? `<button class="cancel-order-btn" onclick="cancelOrder('${o.id}')">Cancel order</button>` : ''}
    </div>
  `).join('');
}
window.cancelOrder = async function (id) {
  if (!confirm('Cancel this order?')) return;
  try { await api(`/orders/${id}/cancel`, { method: 'PUT' }); toast('Order cancelled'); renderOrdersTab(); }
  catch (e) { toast(e.message); }
};
async function renderAddressesTab() {
  const content = document.getElementById('accountTabContent');
  content.innerHTML = 'Loading...';
  const { addresses } = await api('/user/addresses');
  state.addresses = addresses;
  content.innerHTML = `
    <button class="modal-submit" style="margin-bottom:14px;" onclick="openAddressModal()">+ Add new address</button>
    ${addresses.length === 0 ? `<div class="empty-state"><div class="emoji">📍</div>No saved addresses.</div>` :
      addresses.map(a => `
        <div class="panel-row">
          <div>
            <div style="font-weight:700; font-size:13px;">${a.label || 'Address'} ${a.is_default ? '· Default' : ''}</div>
            <div style="font-size:12.5px; color:var(--ink-soft);">${a.line1}, ${a.line2 ? a.line2 + ', ' : ''}${a.city}, ${a.state} - ${a.pincode}</div>
          </div>
          <button class="remove-link" onclick="deleteAddress('${a.id}')">Delete</button>
        </div>
      `).join('')}
  `;
}
window.deleteAddress = async function (id) {
  try { await api(`/user/addresses/${id}`, { method: 'DELETE' }); renderAddressesTab(); }
  catch (e) { toast(e.message); }
};

// ── Auth modal ──
function openAuthModal(mode) {
  state.authMode = mode;
  document.getElementById('authError').style.display = 'none';
  document.getElementById('nameField').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('phoneField').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('authTitle').textContent = mode === 'register' ? 'Create an account' : 'Sign in';
  document.getElementById('authSub').textContent = mode === 'register' ? 'Join Saasum SmartShop in seconds' : 'Welcome back to Saasum SmartShop';
  document.getElementById('authSubmitBtn').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  document.getElementById('authSwitch').innerHTML = mode === 'register'
    ? `Already have an account? <a id="authSwitchLink">Sign in</a>`
    : `New here? <a id="authSwitchLink">Create an account</a>`;
  document.getElementById('authSwitchLink').onclick = () => openAuthModal(mode === 'register' ? 'login' : 'register');
  document.getElementById('authForm').reset();
  document.getElementById('authOverlay').classList.add('open');
}
document.getElementById('closeAuth').addEventListener('click', () => document.getElementById('authOverlay').classList.remove('open'));
document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  try {
    let data;
    if (state.authMode === 'register') {
      const name = document.getElementById('authName').value;
      const phone = document.getElementById('authPhone').value;
      data = await api('/auth/register', { method: 'POST', body: { name, email, password, phone } });
    } else {
      data = await api('/auth/login', { method: 'POST', body: { email, password } });
    }
    state.token = data.token; state.user = data.user;
    localStorage.setItem('saasum_token', data.token);
    localStorage.setItem('saasum_user', JSON.stringify(data.user));
    renderAccountLabel();
    document.getElementById('authOverlay').classList.remove('open');
    toast(`Welcome${state.authMode === 'register' ? '' : ' back'}, ${data.user.name.split(' ')[0]}!`);
    refreshCart(); refreshWishlist(); loadProducts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

// ── Address modal ──
function openAddressModal() { document.getElementById('addressOverlay').classList.add('open'); }
document.getElementById('closeAddress').addEventListener('click', () => document.getElementById('addressOverlay').classList.remove('open'));
document.getElementById('addressForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('addressError');
  errEl.style.display = 'none';
  try {
    await api('/user/addresses', {
      method: 'POST', body: {
        label: document.getElementById('addrLabel').value,
        line1: document.getElementById('addrLine1').value,
        line2: document.getElementById('addrLine2').value,
        city: document.getElementById('addrCity').value,
        state: document.getElementById('addrState').value,
        pincode: document.getElementById('addrPincode').value,
        is_default: true,
      }
    });
    document.getElementById('addressOverlay').classList.remove('open');
    document.getElementById('addressForm').reset();
    toast('Address saved');
    renderAddressesTab();
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
});

// ── Checkout ──
async function openCheckout() {
  if (state.cart.items.length === 0) return;
  const { addresses } = await api('/user/addresses');
  state.addresses = addresses;
  const sel = document.getElementById('checkoutAddress');
  if (addresses.length === 0) {
    sel.innerHTML = '<option value="">No saved address — add one first</option>';
  } else {
    sel.innerHTML = addresses.map(a => `<option value="${a.id}">${a.label || 'Address'} — ${a.line1}, ${a.city}</option>`).join('');
  }
  document.getElementById('checkoutTotal').textContent = money(state.cart.subtotal);
  document.getElementById('checkoutError').style.display = 'none';
  closeDrawer('cartDrawer', 'cartOverlay');
  document.getElementById('checkoutOverlay').classList.add('open');
}
document.getElementById('closeCheckout').addEventListener('click', () => document.getElementById('checkoutOverlay').classList.remove('open'));
document.getElementById('placeOrderBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('checkoutError');
  errEl.style.display = 'none';
  const address_id = document.getElementById('checkoutAddress').value;
  if (!address_id) { errEl.textContent = 'Please add a delivery address first.'; errEl.style.display = 'block'; return; }
  const payment_method = document.getElementById('checkoutPayment').value;
  try {
    const { order } = await api('/orders', { method: 'POST', body: { address_id, payment_method } });
    document.getElementById('checkoutOverlay').classList.remove('open');
    toast(`Order placed! ${order.id}`);
    refreshCart();
    loadProducts();
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
});

// ── Init ──
(async function init() {
  renderAccountLabel();
  await loadCategories();
  await loadFlashDeals();
  await refreshWishlist();
  await refreshCart();
  await loadProducts();
})();
