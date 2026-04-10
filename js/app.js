// ══════════════════════════════════════════
// SUPABASE CONFIG — shared across all pages
// ══════════════════════════════════════════
const SUPABASE_URL = 'https://gvhllermyanyncfugjpf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2aGxsZXJteWFueW5jZnVnanBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTc0MTMsImV4cCI6MjA4OTg3MzQxM30.1c_C9nxI9uaBFy0093VhTiDFMtTt6orW3O3TvpwSNR0';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ══════════════════════════════════════════
// SHARED STATE
// ══════════════════════════════════════════
let currentUser = null;
let currentProfile = null;
let currentRole = null;
let currentChatConversationId = null;
let currentChatPeerId = null;
let chatRealtimeSub = null;
let editingCropId = null;
let cropImgFile = null;

// ══════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════
function fmtPhone(p) {
  if (!p) return '—';
  const clean = p.replace(/^\+?256/, '').replace(/\s/g,'');
  return '+256 ' + clean;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-UG', { year:'numeric', month:'long', day:'numeric' });
}

function val(v) { return v && v.trim() !== '' ? v.trim() : null; }

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
  return fmtDate(ts);
}

let toastTimer;
function showToast(msg, isError=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError?' error':'');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function setLoading(btnId, on, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spinner"></span> Please wait…' : originalText;
}

function previewAvatar(previewId, fileId) {
  const file = document.getElementById(fileId).files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const p = document.getElementById(previewId);
    p.innerHTML = `<img src="${e.target.result}" alt="avatar">`;
  };
  reader.readAsDataURL(file);
}

function previewCropImg() {
  const file = document.getElementById('crop-img-file').files[0];
  if (!file) return;
  cropImgFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const p = document.getElementById('crop-img-preview');
    p.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">`;
  };
  reader.readAsDataURL(file);
}

async function uploadFile(bucket, path, file) {
  const { data, error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
 if (error) {
  console.error('Upload error:', error.message);
  throw error;
}

  const { data: { publicUrl } } = sb.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  if (cur === 'light') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme','light');
  localStorage.setItem('ff-theme', document.documentElement.getAttribute('data-theme')||'dark');
}

function applyTheme() {
  if (localStorage.getItem('ff-theme') === 'light') document.documentElement.setAttribute('data-theme','light');
}

// ══════════════════════════════════════════
// LOAD PROFILE — redirects to correct dash
// ══════════════════════════════════════════
async function loadProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) {
    currentProfile = data;
    currentRole = data.role;
    if (currentRole === 'buyer') window.location.href = '../pages/buyer-dashboard.html';
    else if (currentRole === 'farmer') window.location.href = '../pages/farmer-dashboard.html';
    else if (currentRole === 'admin') window.location.href = '../pages/admin-dashboard.html';
  }
}

// ══════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════
function showModal(icon, title, text, btnText, onConfirm) {
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent = text;
  const btn = document.getElementById('modal-confirm-btn');
  btn.textContent = btnText;
  btn.onclick = onConfirm;
  document.getElementById('confirm-modal').classList.add('open');
}
function closeModal() { document.getElementById('confirm-modal').classList.remove('open'); }

// ══════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════
async function openChatWithFarmer(farmerId, farmerName, farmerLoc, cropName) {
  let { data: conv } = await sb.from('conversations').select('*').eq('buyer_id', currentUser.id).eq('farmer_id', farmerId).single();
  if (!conv) {
    const firstMsg = `Hi ${farmerName}! I'm interested in your ${cropName}. Is it still available?`;
    const { data: newConv } = await sb.from('conversations').insert({
      buyer_id: currentUser.id,
      farmer_id: farmerId,
      last_message: firstMsg,
      unread_buyer: false,
      unread_farmer: true,
      updated_at: new Date().toISOString()
    }).select().single();
    conv = newConv;
    if (conv) {
      await sb.from('messages').insert({ conversation_id: conv.id, sender_id: currentUser.id, content: firstMsg, created_at: new Date().toISOString() });
    }
  }
  if (conv) openConversation(conv.id, farmerId, farmerName, farmerLoc, '');
}

async function openConversation(convId, peerId, peerName, peerLoc, peerAvatar) {
  currentChatConversationId = convId;
  currentChatPeerId = peerId;
  const pav = document.getElementById('chat-peer-avatar');
  pav.innerHTML = peerAvatar ? `<img src="${peerAvatar}" style="width:100%;height:100%;object-fit:cover;">` : (peerName[0]||'?');
  document.getElementById('chat-peer-name').textContent = peerName;
  document.getElementById('chat-peer-sub').textContent = peerLoc ? '📍 ' + peerLoc : '';
  document.getElementById('chat-overlay').classList.add('open');
  document.getElementById('chat-messages').innerHTML = '<div class="chat-empty">Loading…</div>';
  await loadChatMessages(convId);
  subscribeToChat(convId);
  if (currentRole === 'buyer') sb.from('conversations').update({ unread_buyer: false }).eq('id', convId).then(()=>{});
  if (currentRole === 'farmer') sb.from('conversations').update({ unread_farmer: false }).eq('id', convId).then(()=>{});
}

async function loadChatMessages(convId) {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  const { data } = await sb.from('messages').select('*').eq('conversation_id', convId).order('created_at');
  if (!data || !data.length) { el.innerHTML = '<div class="chat-empty">No messages yet. Say hello! 👋</div>'; return; }
  el.innerHTML = data.map(m => {
    const mine = m.sender_id === currentUser.id;
    return `<div class="chat-msg ${mine?'outgoing':'incoming'}">${escHtml(m.content)}<div class="chat-msg-time">${timeAgo(m.created_at)}</div></div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function subscribeToChat(convId) {
  if (chatRealtimeSub) chatRealtimeSub.unsubscribe();
  chatRealtimeSub = sb.channel('chat-' + convId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${convId}` }, payload => {
      const el = document.getElementById('chat-messages');
      if (!el) return;
      const m = payload.new;
      if (m.sender_id === currentUser.id) return;
      el.querySelectorAll('.chat-empty').forEach(e => e.remove());
      el.innerHTML += `<div class="chat-msg incoming">${escHtml(m.content)}<div class="chat-msg-time">just now</div></div>`;
      el.scrollTop = el.scrollHeight;
    }).subscribe();
}

async function sendMsg() {
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text || !currentChatConversationId) return;
  inp.value = '';
  const el = document.getElementById('chat-messages');
  el.querySelectorAll('.chat-empty').forEach(e => e.remove());
  el.innerHTML += `<div class="chat-msg outgoing">${escHtml(text)}<div class="chat-msg-time">just now</div></div>`;
  el.scrollTop = el.scrollHeight;
  await sb.from('messages').insert({ conversation_id: currentChatConversationId, sender_id: currentUser.id, content: text, created_at: new Date().toISOString() });
  const isForFarmer = currentRole === 'buyer';
  await sb.from('conversations').update({
    last_message: text,
    updated_at: new Date().toISOString(),
    ...(isForFarmer ? { unread_farmer: true } : { unread_buyer: true })
  }).eq('id', currentChatConversationId);
}

function closeChatOverlay(e) {
  if (e.target === document.getElementById('chat-overlay')) document.getElementById('chat-overlay').classList.remove('open');
}

// ══════════════════════════════════════════
// PROFILE & SETTINGS RENDERERS
// ══════════════════════════════════════════
function renderProfile(role) {
  const p = currentProfile || {};
  const initials = (p.name||'U').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const avi = p.avatar_url ? `<img src="${p.avatar_url}" alt="${p.name}">` : initials;
  const fileId = role + '-profile-photo';
  const fields = [
    { icon:'👤', label:'Full Name', value: p.name },
    { icon:'📱', label:'Phone Number', value: fmtPhone(p.phone) },
    { icon:'📍', label:'Location', value: p.location },
    { icon:'🎭', label:'Role', value: role === 'farmer' ? '🌱 Verified Farmer' : '🛒 Verified Buyer' },
    { icon:'📅', label:'Member Since', value: fmtDate(p.created_at) },
    { icon:'🔵', label:'Account Status', value: p.status ? p.status.charAt(0).toUpperCase() + p.status.slice(1) : 'Active' },
    { icon:'⭐', label:'Rating', value: '4.8 / 5.0' },
  ];
  return `<div class="profile-card">
    <div class="profile-avatar-big" onclick="document.getElementById('${fileId}').click()">${avi}</div>
    <input type="file" id="${fileId}" accept="image/*" style="display:none" onchange="updateProfilePhoto('${role}','${fileId}')">
    <div class="profile-name">${p.name || 'User'}</div>
    <div class="profile-role">${role==='farmer'?'🌱 Verified Farmer':'🛒 Verified Buyer'}</div>
    <div class="profile-change-photo" onclick="document.getElementById('${fileId}').click()">📷 Change photo</div>
    ${fields.map(f => `<div class="profile-field"><span class="profile-field-icon">${f.icon}</span><div class="profile-field-content"><div class="profile-field-label">${f.label}</div><div class="profile-field-value ${!f.value?'empty':''}">${f.value || '—'}</div></div></div>`).join('')}
  </div>`;
}

async function updateProfilePhoto(role, fileId) {
  const file = document.getElementById(fileId).files[0];
  if (!file) return;
  try {
    const url = await uploadFile('avatars', `${role}s/${currentUser.id}`, file);
    await sb.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
    currentProfile.avatar_url = url;
    setTopUser(role);
    if (role === 'buyer') buyerView('profile', null);
    else farmerView('profile', null);
    showToast('Photo updated! 📷');
  } catch(e) { showToast('Upload failed', true); }
}

function renderSettings(role) {
  const p = currentProfile || {};
  return `
  <div class="settings-section">
    <div class="settings-heading">Account Info</div>
    <div class="settings-item"><span class="settings-label">👤 Name</span><span style="font-size:14px;color:var(--text-dim)">${p.name||'—'}</span></div>
    <div class="settings-item"><span class="settings-label">📱 Phone</span><span style="font-size:14px;color:var(--text-dim)">${fmtPhone(p.phone)}</span></div>
    <div class="settings-item"><span class="settings-label">📍 Location</span><span style="font-size:14px;color:var(--text-dim)">${p.location||'—'}</span></div>
    <div class="settings-item"><span class="settings-label">📅 Joined</span><span style="font-size:14px;color:var(--text-dim)">${fmtDate(p.created_at)}</span></div>
  </div>
  <div class="settings-section">
    <div class="settings-heading">Appearance</div>
    <div class="settings-item"><span class="settings-label">🌙 Dark / Light Mode</span><div class="toggle-track" onclick="toggleTheme()" style="cursor:pointer"><div class="toggle-thumb"></div></div></div>
  </div>
  <div class="settings-section">
    <div class="settings-heading">Danger Zone</div>
    <div class="settings-item"><span class="settings-label" style="color:#ff6b6b">🗑️ Delete Account</span><button class="danger-btn" onclick="showDeleteAccount()">Delete</button></div>
  </div>`;
}

function setTopUser(role) {
  const p = currentProfile || {};
  const initials = (p.name||'U').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const av = document.getElementById(role+'-avatar');
  if (av) av.innerHTML = p.avatar_url ? `<img src="${p.avatar_url}" alt="${p.name}">` : initials;
  const firstName = (p.name || role).split(' ')[0];
  const nameEl = document.getElementById(role+'-display-name');
  if (nameEl) nameEl.textContent = firstName;
}

async function showLogout(role) {
  showModal('🚪','Log Out','Are you sure you want to log out?','Log Out', async () => {
    closeModal();
    await sb.auth.signOut();
    if (chatRealtimeSub) { chatRealtimeSub.unsubscribe(); chatRealtimeSub = null; }
    window.location.href = '../index.html';
    showToast('Logged out. Come back soon! 👋');
  });
}

async function showDeleteAccount() {
  showModal('🗑️','Delete Account','This will permanently delete your account and all data.','Delete Account', async () => {
    closeModal();
    await sb.from('profiles').delete().eq('id', currentUser.id);
    await sb.auth.signOut();
    window.location.href = '../index.html';
  });
}
