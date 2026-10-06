// Coordinated Trading Terminal Logic, Strategy Engine, and Trade Journal System
const API_BASE = window.location.origin.includes('5000') 
  ? window.location.origin + '/api/v1' 
  : (window.location.hostname === 'localhost' ? 'http://localhost:5000/api/v1' : '/api/v1');

let currentUser = JSON.parse(localStorage.getItem('user_profile') || 'null') || {
  id: 'usr_default',
  email: 'trader@apexsignals.io',
  role: 'USER',
  tier: 'PRO'
};

let currentStrategy = 'RSI_BB';
let activePair = 'EUR/USD';

// Strategy Catalog Definitions
const STRATEGIES = {
  RSI_BB: {
    name: 'Strategy A: RSI Extremes + Bollinger Bands (M5)',
    desc: '• <strong>Conditions</strong>: RSI < 25 (CALL) or RSI > 75 (PUT) at outer band touch.<br>• <strong>Filter</strong>: Automated high-impact news suppression enabled.'
  },
  EMA_TREND: {
    name: 'Strategy B: EMA 9/21 Dynamic Trend Pullback (M5)',
    desc: '• <strong>Conditions</strong>: Trend established on EMA 50; pullback touch of EMA 9 with rejection candle.<br>• <strong>Filter</strong>: Minimum 2-candle momentum confirmation.'
  },
  STOCH_DIVERGENCE: {
    name: 'Strategy C: Stochastic Momentum Divergence (M5)',
    desc: '• <strong>Conditions</strong>: Price makes higher high / lower low while Stochastic oscillator makes opposite movement.<br>• <strong>Filter</strong>: Overbought/oversold crossover confirmation.'
  },
  INSTITUTIONAL_SR: {
    name: 'Strategy D: Institutional Key Level S/R (M5)',
    desc: '• <strong>Conditions</strong>: Rejection wick at 4H horizontal support/resistance or round numbers (.000, .500).<br>• <strong>Filter</strong>: Minimum 3 touches on historical timeframe.'
  }
};

// Signals State (Current is [0], older are [1..n])
let signalsData = [
  {
    id: 'sig_101',
    pair: 'EUR/USD',
    direction: 'CALL',
    strategy: 'Strategy A: RSI Extremes + Bollinger Bands (M5)',
    expiry: 5,
    entry_price: 1.08542,
    confidence: 89,
    timestamp: new Date().toLocaleTimeString(),
    journal: null // not recorded yet
  },
  {
    id: 'sig_102',
    pair: 'GBP/USD',
    direction: 'PUT',
    strategy: 'Strategy A: RSI Extremes + Bollinger Bands (M5)',
    expiry: 5,
    entry_price: 1.29815,
    confidence: 84,
    timestamp: new Date(Date.now() - 6 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: true,
      won: true,
      followedRules: true,
      feedback: 'Entered smoothly at candle open, solid ITM win.'
    }
  },
  {
    id: 'sig_103',
    pair: 'USD/JPY',
    direction: 'CALL',
    strategy: 'Strategy B: EMA 9/21 Dynamic Trend Pullback (M5)',
    expiry: 5,
    entry_price: 151.420,
    confidence: 81,
    timestamp: new Date(Date.now() - 15 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Was away from screen when alert sounded.'
    }
  },
  {
    id: 'sig_104',
    pair: 'BTC/USDT',
    direction: 'PUT',
    strategy: 'Strategy A: RSI Extremes + Bollinger Bands (M5)',
    expiry: 5,
    entry_price: 64510.00,
    confidence: 88,
    timestamp: new Date(Date.now() - 25 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: true,
      won: false,
      followedRules: false,
      feedback: 'Entered 45 seconds late after price dropped 30 pips; chased the trade.'
    }
  }
];

// Active Journaling Workflow State
let currentJournalingSignal = null;
let journalTempData = {};

// Synthesizer Audio Chime
function playSignalChime(isCall = true) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isCall ? 587.33 : 440.00, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isCall ? 880 : 330, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch(e) {}
}

// Toast System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Navigation Tabs
function setupNavigation() {
  const tabTerminal = document.getElementById('nav-terminal');
  const tabJournal = document.getElementById('nav-journal');
  const viewTerminal = document.getElementById('view-terminal');
  const viewJournal = document.getElementById('view-journal');

  tabTerminal.onclick = () => {
    tabTerminal.classList.add('active');
    tabJournal.classList.remove('active');
    viewTerminal.classList.add('active');
    viewJournal.classList.remove('active');
  };

  tabJournal.onclick = () => {
    tabJournal.classList.add('active');
    tabTerminal.classList.remove('active');
    viewJournal.classList.add('active');
    viewTerminal.classList.remove('active');
    renderJournalTable();
  };
}

// Strategy Selector
function onStrategyChange(strategyKey) {
  currentStrategy = strategyKey;
  const strat = STRATEGIES[strategyKey];
  if (strat) {
    document.getElementById('strategy-description').innerHTML = strat.desc;
    showToast(`Active Strategy updated: ${strat.name}`, 'info');
  }
}

// Market Tracker Chart Switcher
function switchChartPair(pairName, tvSymbol) {
  activePair = pairName;
  document.querySelectorAll('.pair-tab').forEach(btn => {
    btn.classList.toggle('active', btn.innerText === pairName);
  });
  document.getElementById('active-pair-badge').innerText = `${pairName} • M5`;

  const widgetUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_7918a&symbol=${encodeURIComponent(tvSymbol)}&interval=5&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=localhost`;
  document.getElementById('tradingview-widget').src = widgetUrl;
  showToast(`Market Tracker loaded: ${pairName}`, 'info');
}

// RENDER SIGNALS IN SIGNAL BOX (First = Blue, Others = Gray)
function renderSignals() {
  const listEl = document.getElementById('signal-box-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  signalsData.forEach((sig, index) => {
    const isCurrent = index === 0;
    const isCall = sig.direction === 'CALL';
    const card = document.createElement('div');
    card.className = `signal-item ${isCurrent ? 'current' : 'historical'}`;

    const statusLabel = isCurrent 
      ? `<span class="signal-status-label">CURRENT ACTIVE</span>` 
      : `<span class="signal-status-label">PAST M5</span>`;

    const journalButtonText = sig.journal ? '✓ Journaled' : '📝 Record in Journal';
    const journalBtnStyle = sig.journal 
      ? 'background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;' 
      : 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid #3b82f6;';

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <strong class="signal-pair-text" style="font-size: 1.05rem;">${sig.pair}</strong>
            <span class="${isCall ? 'badge-call' : 'badge-put'}">${sig.direction}</span>
            ${statusLabel}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem;">
            Entry: <strong style="color: #fff;">${sig.entry_price}</strong> | Expiry: <strong>${sig.expiry}M</strong> | Conf: <strong>${sig.confidence}%</strong>
          </div>
          <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.2rem;">
            ${sig.strategy} • ${sig.timestamp}
          </div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem;">
        <button class="btn btn-sm" style="${journalBtnStyle} font-size: 0.75rem; padding: 0.3rem 0.6rem;" onclick="openJournalForSignal('${sig.id}')">
          ${journalButtonText}
        </button>
      </div>
    `;

    listEl.appendChild(card);
  });
}

// SIMULATE NEW SIGNAL PRINT (Pushes new signal to top in Blue, old ones turn Gray)
function triggerSimulatedSignal() {
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USDT', 'AUD/USD'];
  const directions = ['CALL', 'PUT'];
  const prices = {
    'EUR/USD': (1.08500 + Math.random() * 0.002).toFixed(5),
    'GBP/USD': (1.29800 + Math.random() * 0.002).toFixed(5),
    'USD/JPY': (151.300 + Math.random() * 0.4).toFixed(3),
    'BTC/USDT': (64200 + Math.random() * 500).toFixed(2),
    'AUD/USD': (0.67200 + Math.random() * 0.001).toFixed(5)
  };

  const selectedPair = pairs[Math.floor(Math.random() * pairs.length)];
  const selectedDirection = directions[Math.floor(Math.random() * directions.length)];
  const selectedPrice = prices[selectedPair];
  const confidence = Math.floor(82 + Math.random() * 12);

  const stratName = STRATEGIES[currentStrategy] ? STRATEGIES[currentStrategy].name : 'Active Strategy';

  const newSignal = {
    id: 'sig_' + Math.floor(Math.random() * 10000),
    pair: selectedPair,
    direction: selectedDirection,
    strategy: stratName,
    expiry: 5,
    entry_price: selectedPrice,
    confidence: confidence,
    timestamp: new Date().toLocaleTimeString(),
    journal: null
  };

  // Add to front (becomes CURRENT in Blue, all others become Gray)
  signalsData.unshift(newSignal);
  renderSignals();
  renderJournalTable();
  playSignalChime(selectedDirection === 'CALL');
  showToast(`🚨 New Signal Printed: ${selectedPair} ${selectedDirection} (Current: Blue)`, 'success');
}

// TRADE JOURNAL QUESTION WORKFLOW
function openJournalForSignal(signalId) {
  const signal = signalsData.find(s => s.id === signalId);
  if (!signal) return;
  currentJournalingSignal = signal;
  journalTempData = {};

  document.getElementById('modal-signal-info').innerText = `${signal.pair} ${signal.direction} @ ${signal.entry_price} (${signal.timestamp})`;

  // Reset steps to Question 1
  document.querySelectorAll('.journal-step').forEach(step => step.classList.remove('active'));
  document.getElementById('journal-q1').classList.add('active');
  document.getElementById('feedback-reason-input').value = '';

  openModal('journal-modal');
}

// Question 1: Did you take a trade on the signal?
function handleJournalQ1(tookTrade) {
  journalTempData.tookTrade = tookTrade;

  if (!tookTrade) {
    // If NO: turns to GRAY color on journal page
    finishJournalRecord({
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Trade was skipped.'
    });
  } else {
    // If YES: proceed to Question 2 (Did the trade win?)
    document.getElementById('journal-q1').classList.remove('active');
    document.getElementById('journal-q2').classList.add('active');
  }
}

// Question 2: Did the trade win?
function handleJournalQ2(won) {
  journalTempData.won = won;

  if (won) {
    // If YES: turns to GREEN
    finishJournalRecord({
      tookTrade: true,
      won: true,
      followedRules: true,
      feedback: 'Trade won (ITM) with positive outcome.'
    });
  } else {
    // If NO: proceed to Question 3 (Did you follow according to signal parameters?)
    document.getElementById('journal-q2').classList.remove('active');
    document.getElementById('journal-q3').classList.add('active');
  }
}

// Question 3: Did you follow according to parameters?
function handleJournalQ3(followedRules) {
  journalTempData.followedRules = followedRules;

  if (followedRules) {
    // If YES (loss, but followed rules 100%): leave it at GREEN (Disciplined execution)
    finishJournalRecord({
      tookTrade: true,
      won: false,
      followedRules: true,
      feedback: 'Disciplined execution: followed all signal parameters strictly.'
    });
  } else {
    // If NO: proceed to Question 4 (Input honest feedback -> turns to YELLOW)
    document.getElementById('journal-q3').classList.remove('active');
    document.getElementById('journal-q4').classList.add('active');
  }
}

// Question 4: Save honest feedback input
function submitFeedbackReason() {
  const reason = document.getElementById('feedback-reason-input').value.trim();
  const feedback = reason || 'Trader did not adhere to standard signal rules or parameters.';

  // If NO: turn to YELLOW with honest feedback box
  finishJournalRecord({
    tookTrade: true,
    won: false,
    followedRules: false,
    feedback: feedback
  });
}

function finishJournalRecord(journalData) {
  if (currentJournalingSignal) {
    currentJournalingSignal.journal = journalData;
    renderSignals();
    renderJournalTable();
    closeModal('journal-modal');

    if (!journalData.tookTrade) {
      showToast('Trade recorded as Skipped (Marked Gray in Journal)', 'info');
    } else if (journalData.won || journalData.followedRules) {
      showToast('Trade recorded as Disciplined Execution (Marked Green in Journal)', 'success');
    } else {
      showToast('Feedback logged: Rule deviation (Marked Yellow in Journal)', 'warning');
    }
  }
}

// RENDER JOURNAL TABLE WITH EXACT COLOR RULES
function renderJournalTable() {
  const tbody = document.getElementById('journal-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  signalsData.forEach(sig => {
    const row = document.createElement('tr');
    row.className = 'journal-row';

    let colorClass = '';
    let tradeTakenCell = '<span style="color: var(--text-muted);">Unrecorded</span>';
    let outcomeCell = '<span style="color: var(--text-muted);">-</span>';
    let feedbackCell = '<span style="color: var(--text-muted);">-</span>';

    if (sig.journal) {
      if (!sig.journal.tookTrade) {
        // Did you take trade? NO -> GRAY COLOR
        colorClass = 'status-gray';
        tradeTakenCell = '<span class="journal-badge badge-skipped">No (Skipped)</span>';
        outcomeCell = '<span style="color: #94a3b8;">N/A (Skipped)</span>';
        feedbackCell = `<em>${sig.journal.feedback || 'Skipped'}</em>`;
      } else if (sig.journal.won) {
        // Trade won? YES -> GREEN COLOR
        colorClass = 'status-green';
        tradeTakenCell = '<strong style="color: var(--call-green);">Yes</strong>';
        outcomeCell = '<span class="journal-badge badge-disciplined-win">Won (ITM) • Green</span>';
        feedbackCell = `<span style="color: #a7f3d0;">${sig.journal.feedback}</span>`;
      } else if (sig.journal.followedRules) {
        // Trade lost, but followed rules? YES -> GREEN COLOR
        colorClass = 'status-green';
        tradeTakenCell = '<strong style="color: var(--call-green);">Yes</strong>';
        outcomeCell = '<span class="journal-badge badge-disciplined-loss">Disciplined Loss • Green</span>';
        feedbackCell = `<span style="color: #a7f3d0;">Followed rules 100%</span>`;
      } else {
        // Trade lost AND did not follow rules? NO -> YELLOW COLOR with honest feedback
        colorClass = 'status-yellow';
        tradeTakenCell = '<strong style="color: var(--accent-gold);">Yes</strong>';
        outcomeCell = '<span class="journal-badge badge-deviated">Rule Deviation • Yellow</span>';
        feedbackCell = `<strong style="color: #fde68a;">Feedback:</strong> "${sig.journal.feedback}"`;
      }
    }

    row.className = `journal-row ${colorClass}`;

    row.innerHTML = `
      <td><strong>${sig.timestamp}</strong></td>
      <td><strong>${sig.pair}</strong> <span class="${sig.direction === 'CALL' ? 'badge-call' : 'badge-put'}">${sig.direction}</span></td>
      <td style="font-size: 0.8rem; color: #94a3b8;">${sig.strategy}</td>
      <td>${sig.entry_price}</td>
      <td>${tradeTakenCell}</td>
      <td>${outcomeCell}</td>
      <td style="max-width: 280px; font-size: 0.82rem;">${feedbackCell}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openJournalForSignal('${sig.id}')">
          ${sig.journal ? 'Edit' : 'Record'}
        </button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

// Modal Utility
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// Auth Handlers
function setupAuthHandlers() {
  const user = currentUser;
  if (user) {
    document.getElementById('nav-user-email').innerText = user.email || 'trader@apexsignals.io';
    document.getElementById('user-nav-section').style.display = 'flex';
    document.getElementById('auth-nav-buttons').style.display = 'none';
  }

  document.getElementById('btn-logout').onclick = () => {
    openModal('auth-modal');
  };

  document.getElementById('auth-form').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const name = document.getElementById('auth-name').value;
    currentUser = {
      id: 'usr_' + Math.random().toString(36).substring(7),
      email: email,
      full_name: name || 'Active Trader',
      role: 'USER',
      tier: 'PRO'
    };
    localStorage.setItem('user_profile', JSON.stringify(currentUser));
    document.getElementById('nav-user-email').innerText = email;
    closeModal('auth-modal');
    showToast(`Welcome ${email}! Entering terminal workspace.`, 'success');
  };
}

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAuthHandlers();
  renderSignals();
  renderJournalTable();

  // Strategy default description
  document.getElementById('strategy-description').innerHTML = STRATEGIES['RSI_BB'].desc;
});
