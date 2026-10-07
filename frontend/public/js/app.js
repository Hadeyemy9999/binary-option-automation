// Coordinated Trading Terminal Logic, Runtime Indicator Engine, and Trade Journal System
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
let activeSymbol = 'FX:EURUSD';
let activeTimeframe = '15'; // 15M (Primary) or 30M (Macro)

// Strategy Definitions with Technical Indicators Configured for TradingView Runtime
const STRATEGIES = {
  RSI_BB: {
    name: 'Strategy 1: RSI Extremes (14) + Bollinger Bands Rejection',
    badge: 'Indicators: RSI + BB',
    timeframe: 'M15/M30',
    minDuration: 10,
    studies: [
      'RSI@tv-basicstudies',
      'BB@tv-basicstudies'
    ],
    desc: '• <strong>Timeframe Filter</strong>: 15-Minute or 30-Minute candle close only.<br>' +
          '• <strong>Indicators Configured</strong>: Relative Strength Index (RSI 14) + Bollinger Bands (20, 2).<br>' +
          '• <strong>Rules</strong>: Rejection wick at outer Bollinger Band with RSI &lt; 25 (CALL) or RSI &gt; 75 (PUT).<br>' +
          '• <strong>Trade Duration</strong>: Minimum 10 to 15 Minutes.'
  },
  EMA_TREND: {
    name: 'Strategy 2: Triple EMA Trend Flow (EMA 9, 21, 50 Pullback)',
    badge: 'Indicators: EMA 9/21/50',
    timeframe: 'M15/M30',
    minDuration: 12,
    studies: [
      'MASimple@tv-basicstudies',
      'MAExp@tv-basicstudies'
    ],
    desc: '• <strong>Timeframe Filter</strong>: 15-Minute trend alignment with 30-Minute bias.<br>' +
          '• <strong>Indicators Configured</strong>: Exponential Moving Averages (EMA 9, 21, 50).<br>' +
          '• <strong>Rules</strong>: Direction aligned with EMA 50 slope; entry on rejection touch of EMA 9 or 21.<br>' +
          '• <strong>Trade Duration</strong>: Minimum 10 to 15 Minutes.'
  },
  MACD_MOMENTUM: {
    name: 'Strategy 3: MACD Histogram Divergence + Volume Wave',
    badge: 'Indicators: MACD + Volume',
    timeframe: 'M15/M30',
    minDuration: 15,
    studies: [
      'MACD@tv-basicstudies',
      'Volume@tv-basicstudies'
    ],
    desc: '• <strong>Timeframe Filter</strong>: 15-Minute / 30-Minute structure confirmation.<br>' +
          '• <strong>Indicators Configured</strong>: MACD (12, 26, 9) + Volume Profile.<br>' +
          '• <strong>Rules</strong>: MACD histogram divergence against price swing highs/lows with declining seller/buyer volume.<br>' +
          '• <strong>Trade Duration</strong>: Minimum 15 Minutes.'
  },
  SUPER_TREND: {
    name: 'Strategy 4: SuperTrend Volatility Breakout & Cloud',
    badge: 'Indicators: SuperTrend + ATR',
    timeframe: 'M15/M30',
    minDuration: 10,
    studies: [
      'ATR@tv-basicstudies',
      'BB@tv-basicstudies'
    ],
    desc: '• <strong>Timeframe Filter</strong>: 15-Minute & 30-Minute volatility zones.<br>' +
          '• <strong>Indicators Configured</strong>: Average True Range (ATR 14) + Volatility Bands.<br>' +
          '• <strong>Rules</strong>: High-probability continuation after candle close outside key volatility band.<br>' +
          '• <strong>Trade Duration</strong>: Minimum 10 to 15 Minutes.'
  }
};

// Initial High-Quality Signals (Strictly M15 and M30, Minimum 10-15 Min Expiry)
let signalsData = [
  {
    id: 'sig_101',
    pair: 'EUR/USD',
    direction: 'CALL',
    strategy: 'Strategy 1: RSI Extremes (14) + Bollinger Bands Rejection',
    timeframe: '15M',
    expiry: 15, // 15 Min duration
    entry_price: 1.08542,
    confidence: 91,
    timestamp: new Date().toLocaleTimeString(),
    journal: null
  },
  {
    id: 'sig_102',
    pair: 'GBP/USD',
    direction: 'PUT',
    strategy: 'Strategy 1: RSI Extremes (14) + Bollinger Bands Rejection',
    timeframe: '15M',
    expiry: 15,
    entry_price: 1.29815,
    confidence: 86,
    timestamp: new Date(Date.now() - 18 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: true,
      won: true,
      followedRules: true,
      feedback: 'Waited for 15M candle to close above Bollinger Band, entered 15M trade, clean ITM win.'
    }
  },
  {
    id: 'sig_103',
    pair: 'USD/JPY',
    direction: 'CALL',
    strategy: 'Strategy 2: Triple EMA Trend Flow (EMA 9, 21, 50 Pullback)',
    timeframe: '30M',
    expiry: 15,
    entry_price: 151.420,
    confidence: 88,
    timestamp: new Date(Date.now() - 35 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Skipped trade due to upcoming high-impact news announcement.'
    }
  },
  {
    id: 'sig_104',
    pair: 'BTC/USDT',
    direction: 'PUT',
    strategy: 'Strategy 3: MACD Histogram Divergence + Volume Wave',
    timeframe: '15M',
    expiry: 10,
    entry_price: 64510.00,
    confidence: 89,
    timestamp: new Date(Date.now() - 52 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: true,
      won: false,
      followedRules: false,
      feedback: 'Failed discipline: entered 2 minutes before the 15M candle closed; got caught in spike.'
    }
  }
];

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

// RUNTIME ENGINE: Configures Chart with Selected Strategy Indicators
function updateChartRuntime() {
  const strat = STRATEGIES[currentStrategy] || STRATEGIES['RSI_BB'];
  const studiesParam = encodeURIComponent(JSON.stringify(strat.studies));

  const widgetUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_7918a` +
    `&symbol=${encodeURIComponent(activeSymbol)}` +
    `&interval=${activeTimeframe}` +
    `&hidesidetoolbar=1` +
    `&symboledit=1` +
    `&saveimage=0` +
    `&toolbarbg=f1f3f6` +
    `&studies=${studiesParam}` +
    `&theme=dark` +
    `&style=1` +
    `&timezone=Etc%2FUTC` +
    `&studies_overrides=%7B%7D` +
    `&overrides=%7B%7D` +
    `&enabled_features=%5B%5D` +
    `&disabled_features=%5B%5D` +
    `&locale=en` +
    `&utm_source=localhost`;

  const chartIframe = document.getElementById('tradingview-widget');
  if (chartIframe) {
    chartIframe.src = widgetUrl;
  }

  // Update badge UI
  const pairBadge = document.getElementById('active-pair-badge');
  if (pairBadge) pairBadge.innerText = `${activePair} • M${activeTimeframe}`;

  const indBadge = document.getElementById('active-indicators-badge');
  if (indBadge) indBadge.innerText = strat.badge;
}

// Strategy Selector Callback
function onStrategyChange(strategyKey) {
  currentStrategy = strategyKey;
  const strat = STRATEGIES[strategyKey];
  if (strat) {
    document.getElementById('strategy-description').innerHTML = strat.desc;
    updateChartRuntime();
    showToast(`Runtime Engine updated chart: ${strat.badge}`, 'success');
  }
}

// Currency Pair Switcher
function switchChartPair(pairName, tvSymbol) {
  activePair = pairName;
  activeSymbol = tvSymbol;
  document.querySelectorAll('.pair-tab').forEach(btn => {
    btn.classList.toggle('active', btn.innerText === pairName);
  });
  updateChartRuntime();
  showToast(`Market Tracker loaded: ${pairName} (M${activeTimeframe})`, 'info');
}

// High-Timeframe Switcher (15M / 30M)
function switchTimeframe(tf) {
  activeTimeframe = tf;
  document.getElementById('tf-15').classList.toggle('active', tf === '15');
  document.getElementById('tf-30').classList.toggle('active', tf === '30');
  updateChartRuntime();
  showToast(`Timeframe switched to ${tf}M candle view`, 'info');
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
      : `<span class="signal-status-label">PAST ${sig.timeframe || '15M'}</span>`;

    const journalButtonText = sig.journal ? '✓ Journaled' : '📝 Record in Journal';
    const journalBtnStyle = sig.journal 
      ? 'background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;' 
      : 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid #3b82f6;';

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong class="signal-pair-text" style="font-size: 1.05rem;">${sig.pair}</strong>
            <span class="${isCall ? 'badge-call' : 'badge-put'}">${sig.direction}</span>
            <span style="font-size: 0.72rem; background: #1e293b; color: #94a3b8; padding: 0.15rem 0.45rem; border-radius: 3px; font-weight: 700;">TF: ${sig.timeframe || '15M'}</span>
            ${statusLabel}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem;">
            Entry: <strong style="color: #fff;">${sig.entry_price}</strong> | Trade Duration: <strong style="color: #60a5fa;">${sig.expiry} Min</strong> | Conf: <strong>${sig.confidence}%</strong>
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

// SIMULATE NEW HIGH-TIMEFRAME QUALITY SIGNAL
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
  const confidence = Math.floor(86 + Math.random() * 10); // High confidence

  const strat = STRATEGIES[currentStrategy] || STRATEGIES['RSI_BB'];
  const tradeDuration = strat.minDuration || 15; // Minimum 10 to 15 min duration

  const newSignal = {
    id: 'sig_' + Math.floor(Math.random() * 10000),
    pair: selectedPair,
    direction: selectedDirection,
    strategy: strat.name,
    timeframe: `${activeTimeframe}M`,
    expiry: tradeDuration,
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
  showToast(`🚨 High-Quality Signal: ${selectedPair} ${selectedDirection} (TF: ${activeTimeframe}M, Min Duration: ${tradeDuration}m)`, 'success');
}

// TRADE JOURNAL QUESTION WORKFLOW
function openJournalForSignal(signalId) {
  const signal = signalsData.find(s => s.id === signalId);
  if (!signal) return;
  currentJournalingSignal = signal;
  journalTempData = {};

  document.getElementById('modal-signal-info').innerText = `${signal.pair} ${signal.direction} [${signal.timeframe || '15M'}] @ ${signal.entry_price} (${signal.timestamp})`;

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
    finishJournalRecord({
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Trade was skipped.'
    });
  } else {
    document.getElementById('journal-q1').classList.remove('active');
    document.getElementById('journal-q2').classList.add('active');
  }
}

// Question 2: Did the trade win?
function handleJournalQ2(won) {
  journalTempData.won = won;

  if (won) {
    finishJournalRecord({
      tookTrade: true,
      won: true,
      followedRules: true,
      feedback: 'Trade won (ITM) on higher timeframe duration.'
    });
  } else {
    document.getElementById('journal-q2').classList.remove('active');
    document.getElementById('journal-q3').classList.add('active');
  }
}

// Question 3: Did you follow according to parameters?
function handleJournalQ3(followedRules) {
  journalTempData.followedRules = followedRules;

  if (followedRules) {
    finishJournalRecord({
      tookTrade: true,
      won: false,
      followedRules: true,
      feedback: 'Disciplined execution: followed 15M/30M rule and min 10-15M duration strictly.'
    });
  } else {
    document.getElementById('journal-q3').classList.remove('active');
    document.getElementById('journal-q4').classList.add('active');
  }
}

// Question 4: Save honest feedback input
function submitFeedbackReason() {
  const reason = document.getElementById('feedback-reason-input').value.trim();
  const feedback = reason || 'Trader did not adhere to minimum trade duration or higher timeframe rules.';

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
        colorClass = 'status-gray';
        tradeTakenCell = '<span class="journal-badge badge-skipped">No (Skipped)</span>';
        outcomeCell = '<span style="color: #94a3b8;">N/A (Skipped)</span>';
        feedbackCell = `<em>${sig.journal.feedback || 'Skipped'}</em>`;
      } else if (sig.journal.won) {
        colorClass = 'status-green';
        tradeTakenCell = '<strong style="color: var(--call-green);">Yes</strong>';
        outcomeCell = '<span class="journal-badge badge-disciplined-win">Won (ITM) • Green</span>';
        feedbackCell = `<span style="color: #a7f3d0;">${sig.journal.feedback}</span>`;
      } else if (sig.journal.followedRules) {
        colorClass = 'status-green';
        tradeTakenCell = '<strong style="color: var(--call-green);">Yes</strong>';
        outcomeCell = '<span class="journal-badge badge-disciplined-loss">Disciplined Loss • Green</span>';
        feedbackCell = `<span style="color: #a7f3d0;">Followed rules 100%</span>`;
      } else {
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
      <td style="font-size: 0.8rem; color: #94a3b8;">[${sig.timeframe || '15M'}] ${sig.strategy}</td>
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
    showToast(`Welcome ${email}! Entering institutional workspace.`, 'success');
  };
}

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAuthHandlers();
  renderSignals();
  renderJournalTable();

  // Load initial Strategy 1 with configured indicators
  document.getElementById('strategy-description').innerHTML = STRATEGIES['RSI_BB'].desc;
  updateChartRuntime();
});
