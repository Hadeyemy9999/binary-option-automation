// Frontend State Management & API Integration
const API_BASE = window.location.origin.includes('5000') 
  ? window.location.origin + '/api/v1' 
  : 'http://localhost:5000/api/v1';

let currentUser = null;
let accessToken = localStorage.getItem('access_token') || null;
let refreshToken = localStorage.getItem('refresh_token') || null;
let socket = null;

// Sound Synthesizer (Zero external dependencies)
function playSignalChime(isCall = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isCall ? 587.33 : 440.00, ctx.currentTime); // D5 or A4
    osc.frequency.exponentialRampToValueAtTime(isCall ? 880 : 330, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.log('Audio notification suppressed:', e);
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Check Authentication Profile
async function checkAuth() {
  if (!accessToken) {
    updateAuthUI(null);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.data.user;
      updateAuthUI(currentUser);
    } else if (refreshToken) {
      await refreshAuthToken();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Auth verification error:', err);
  }
}

async function refreshAuthToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (res.ok) {
      const data = await res.json();
      accessToken = data.data.access_token;
      refreshToken = data.data.refresh_token;
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      await checkAuth();
    } else {
      logout();
    }
  } catch (err) {
    logout();
  }
}

function updateAuthUI(user) {
  const userSection = document.getElementById('user-nav-section');
  const authButtons = document.getElementById('auth-nav-buttons');
  const profileCard = document.getElementById('profile-status-card');

  if (user) {
    userSection.style.display = 'flex';
    authButtons.style.display = 'none';
    document.getElementById('nav-user-email').innerText = user.email;
    document.getElementById('user-badge-tier').innerText = user.tier || 'FREE';

    if (profileCard) {
      document.getElementById('profile-email').innerText = user.email;
      document.getElementById('profile-tier').innerText = user.tier || 'FREE';
      document.getElementById('profile-phone').innerText = user.phone_number || 'Not connected';
      document.getElementById('phone-status-badge').innerHTML = user.phone_verified 
        ? '<span style="color:#10b981;">✓ Verified (SMS Active)</span>' 
        : '<span style="color:#f59e0b;">Pending Verification</span>';
      
      document.getElementById('profile-telegram').innerText = user.telegram_chat_id 
        ? '✓ Connected' 
        : 'Not linked';
    }
  } else {
    userSection.style.display = 'none';
    authButtons.style.display = 'flex';
  }
}

function logout() {
  if (refreshToken) {
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }).catch(() => {});
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  accessToken = null;
  refreshToken = null;
  currentUser = null;
  updateAuthUI(null);
  showToast('Logged out successfully', 'info');
}

// WebSocket Live Signals Feed
function initSignalsWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = window.location.origin.includes('5000') 
    ? window.location.host 
    : 'localhost:5000';
  
  const wsUrl = `${wsProtocol}//${wsHost}/ws/signals`;
  
  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      document.getElementById('connection-status-dot').className = 'status-indicator';
      document.getElementById('connection-status-text').innerText = 'Engine Online';
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'NEW_SIGNAL') {
        prependSignal(data.signal);
        playSignalChime(data.signal.direction === 'CALL');
        showToast(`🚨 New Signal: ${data.signal.pair} ${data.signal.direction}`, 'success');
      }
    };

    socket.onclose = () => {
      document.getElementById('connection-status-dot').className = 'status-indicator offline';
      document.getElementById('connection-status-text').innerText = 'Reconnecting...';
      setTimeout(initSignalsWebSocket, 3000);
    };
  } catch (err) {
    console.warn('WebSocket connection not ready yet:', err);
  }
}

// Fetch historical & existing signals
async function loadSignals() {
  try {
    const res = await fetch(`${API_BASE}/signals?limit=25`);
    if (res.ok) {
      const json = await res.json();
      const listEl = document.getElementById('signals-list');
      listEl.innerHTML = '';

      if (json.data && json.data.length > 0) {
        json.data.forEach(sig => appendSignal(sig));
      } else {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No signals active. Market scanning engine is analyzing candles...
          </div>
        `;
      }
    }
  } catch (e) {
    console.error('Failed to load signals:', e);
  }
}

function createSignalElement(sig) {
  const div = document.createElement('div');
  div.className = 'signal-card';
  const isCall = sig.direction === 'CALL';
  
  let statusBadge = `<span class="badge-active">ACTIVE</span>`;
  if (sig.status === 'WIN') statusBadge = `<span class="badge-win">✅ WIN (+85%)</span>`;
  if (sig.status === 'LOSS') statusBadge = `<span class="badge-loss">❌ LOSS</span>`;

  div.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1rem;">
      <div class="signal-pair">
        <span>${sig.pair}</span>
        <span class="${isCall ? 'badge-call' : 'badge-put'}">${sig.direction}</span>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">
        Expiry: <strong>${sig.expiry_minutes || 5}M</strong> | Entry: <strong>${sig.entry_price}</strong>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 1rem;">
      <span style="font-size: 0.85rem; font-weight: 600;">Conf: ${sig.confidence || 85}%</span>
      ${statusBadge}
    </div>
  `;
  return div;
}

function prependSignal(sig) {
  const listEl = document.getElementById('signals-list');
  const card = createSignalElement(sig);
  listEl.prepend(card);
}

function appendSignal(sig) {
  const listEl = document.getElementById('signals-list');
  const card = createSignalElement(sig);
  listEl.appendChild(card);
}

// Modal Triggers
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Initialise event bindings on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadSignals();
  initSignalsWebSocket();

  // Auth Modal tabs
  document.getElementById('btn-open-login').onclick = () => openModal('auth-modal');
  document.getElementById('btn-open-register').onclick = () => openModal('auth-modal');
  document.getElementById('btn-logout').onclick = logout;

  // Phone & Telegram modals
  document.getElementById('btn-setup-sms').onclick = () => {
    if (!currentUser) return openModal('auth-modal');
    openModal('sms-modal');
  };
  document.getElementById('btn-setup-telegram').onclick = async () => {
    if (!currentUser) return openModal('auth-modal');
    try {
      const res = await fetch(`${API_BASE}/auth/telegram/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('telegram-link-url').href = data.data.deep_link;
        document.getElementById('telegram-link-text').innerText = data.data.deep_link;
        openModal('telegram-modal');
      }
    } catch (e) {
      showToast('Failed to generate Telegram link', 'error');
    }
  };

  // Form Submissions
  document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const isRegister = document.getElementById('auth-mode-toggle').checked;
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const fullName = document.getElementById('auth-name').value;

    const endpoint = isRegister ? `${API_BASE}/auth/register` : `${API_BASE}/auth/login`;
    const payload = isRegister ? { email, password, full_name: fullName } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        accessToken = json.data.tokens.access_token;
        refreshToken = json.data.tokens.refresh_token;
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        currentUser = json.data.user;
        updateAuthUI(currentUser);
        closeModal('auth-modal');
        showToast(isRegister ? 'Registration successful! Welcome.' : 'Logged in successfully.', 'success');
      } else {
        showToast(json.message || 'Authentication error', 'error');
      }
    } catch (err) {
      showToast('Network error while authenticating', 'error');
    }
  };

  // SMS OTP Request & Verification
  document.getElementById('sms-request-otp-btn').onclick = async () => {
    const phone = document.getElementById('sms-phone-input').value;
    try {
      const res = await fetch(`${API_BASE}/auth/phone/send-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ phone_number: phone })
      });
      const data = await res.json();
      if (data.success) {
        showToast('OTP sent! ' + (data.dev_otp ? `(Dev Code: ${data.dev_otp})` : ''), 'success');
        document.getElementById('sms-step-2').style.display = 'block';
      } else {
        showToast(data.message, 'error');
      }
    } catch (e) {
      showToast('Failed to send OTP', 'error');
    }
  };

  document.getElementById('sms-verify-otp-btn').onclick = async () => {
    const code = document.getElementById('sms-otp-input').value;
    try {
      const res = await fetch(`${API_BASE}/auth/phone/verify-otp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Phone verified! SMS alerts enabled.', 'success');
        closeModal('sms-modal');
        checkAuth();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e) {
      showToast('Verification failed', 'error');
    }
  };
});
