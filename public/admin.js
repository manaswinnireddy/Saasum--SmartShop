// ── Saasum Admin panel logic ──
const API = '/api';
let state = {
  token: localStorage.getItem('saasum_admin_token') || null,
  currentTab: 'pending',
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

function showScreen(name) {
  document.getElementById('gateScreen').style.display = name === 'gate' ? 'flex' : 'none';
  document.getElementById('dashScreen').style.display = name === 'dash' ? 'block' : 'none';
}

document.getElementById('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('gateError');
  errEl.style.display = 'none';
  try {
    const data = await api('/admin/login', {
      method: 'POST',
      body: { email: document.getElementById('gateEmail').value, password: document.getElementById('gatePassword').value }
    });
    state.token = data.token;
    localStorage.setItem('saasum_admin_token', data.token);
    showScreen('dash');
    loadSellers('pending');
  } catch (err) { errEl.textContent = err.message; errEl.style.display = 'block'; }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  state.token = null;
  localStorage.removeItem('saasum_admin_token');
  showScreen('gate');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadSellers(btn.dataset.status);
  });
});

async function loadSellers(status) {
  state.currentTab = status;
  const list = document.getElementById('sellerList');
  list.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const { sellers } = await api('/admin/sellers' + (status ? `?status=${status}` : ''));
    if (sellers.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="emoji">📭</div>No sellers in this category.</div>`;
      return;
    }
    list.innerHTML = sellers.map(s => `
      <div class="seller-card">
        <div class="seller-info">
          <div class="biz">${s.business_name}<span class="pill pill-${s.status}">${s.status}</span></div>
          <div class="meta">${s.contact_name || 'No contact name'} · ${s.email} · ${s.phone || 'No phone'}</div>
          <div class="meta">Registered ${new Date(s.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
          ${s.rejection_reason ? `<div class="meta">Reason: "${s.rejection_reason}"</div>` : ''}
        </div>
        <div class="seller-actions">
          ${s.status !== 'approved' ? `<button class="btn-approve" onclick="approveSeller('${s.id}')">Approve</button>` : ''}
          ${s.status !== 'rejected' ? `<button class="btn-reject" onclick="rejectSeller('${s.id}')">Reject</button>` : ''}
          ${s.status === 'approved' ? `<button class="btn-suspend" onclick="suspendSeller('${s.id}')">Suspend</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

window.approveSeller = async function (id) {
  try { await api(`/admin/sellers/${id}/approve`, { method: 'PUT' }); loadSellers(state.currentTab); }
  catch (e) { alert(e.message); }
};
window.rejectSeller = async function (id) {
  const reason = prompt('Reason for rejection (shown to the seller):', 'Does not meet our marketplace requirements');
  if (reason === null) return;
  try { await api(`/admin/sellers/${id}/reject`, { method: 'PUT', body: { reason } }); loadSellers(state.currentTab); }
  catch (e) { alert(e.message); }
};
window.suspendSeller = async function (id) {
  const reason = prompt('Reason for suspension (shown to the seller):', 'Policy violation');
  if (reason === null) return;
  try { await api(`/admin/sellers/${id}/suspend`, { method: 'PUT', body: { reason } }); loadSellers(state.currentTab); }
  catch (e) { alert(e.message); }
};

// ── Init ──
if (state.token) { showScreen('dash'); loadSellers('pending'); }
else { showScreen('gate'); }
