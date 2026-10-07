// Coordinated Trading Terminal Logic - EMA 15/50 Crossover Testing Strategy
const API_BASE = window.location.origin.includes('5000') 
  ? window.location.origin + '/api/v1' 
  : (window.location.hostname === 'localhost' ? 'http://localhost:5000/api/v1' : '/api/v1');

let currentUser = JSON.parse(localStorage.getItem('user_profile') || 'null') || {
  id: 'usr_default',
  email: 'trader@apexsignals.io',
  role: 'USER',
  tier: 'PRO'
};

let currentStrategy = 'EMA_CROSS_15_50';
let activePair = 'EUR/USD';
let activeSymbol = 'FX:EURUSD';
let activeTimeframe = '5'; // 5M Primary Timeframe

// The Single Active Strategy Specification
const STRATEGIES = {
  EMA_CROSS_15_50: {
    name: '15 EMA (Yellow) × 50 EMA (Blue) Crossover Strategy',
    badge: 'EMA 15 (Yellow) + EMA 50 (Blue)',
    timeframe: '5M',
    candlesDuration: 4, // 4 candlesticks
    minDuration: 15,    // 15 Minutes trade duration on 5M timeframe
    studies: [
      'MAExp@tv-basicstudies',
      'MASimple@tv-basicstudies'
    ],
    // Overrides: EMA 15 in Yellow (#facc15), EMA 50 in Blue (#2563eb)
    studiesOverrides: {
      "moving average exponential.length": 15,
      "moving average exponential.plot.color": "#facc15",
      "moving average exponential.plot.linewidth": 2,
      "moving average.length": 50,
      "moving average.plot.color": "#2563eb",
      "moving average.plot.linewidth": 3
    },
    desc: '• <strong>Indicator 1</strong>: <span style="color:#60a5fa; font-weight:700;">EMA 50 (Close) - Colour: BLUE</span><br>' +
          '• <strong>Indicator 2</strong>: <span style="color:#facc15; font-weight:700;">EMA 15 (Close) - Colour: YELLOW</span><br>' +
          '• <strong>BUY Entry</strong>: 15 EMA (Yellow) crosses <strong style="color:var(--call-green);">ABOVE</strong> 50 EMA (Blue).<br>' +
          '• <strong>SELL Entry</strong>: 15 EMA (Yellow) crosses <strong style="color:var(--put-red);">BELOW</strong> 50 EMA (Blue).<br>' +
          '• <strong>Trade Duration</strong>: <strong style="color:#fff;">4 Candlesticks (15-Minute Duration on 5M timeframe)</strong>.'
  }
};

// Initial High-Probability Signals for EMA 15/50 Crossover (4 Candlesticks / 15-Minute Expiry)
let signalsData = [
  {
    id: 'sig_101',
    pair: 'EUR/USD',
    direction: 'BUY',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Crossover',
    timeframe: '5M',
    expiry: 15, // 15 Min duration (4 candles)
    entry_price: 1.08542,
    confidence: 92,
    timestamp: new Date().toLocaleTimeString(),
    journal: null
  },
  {
    id: 'sig_102',
    pair: 'GBP/USD',
    direction: 'SELL',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Crossover',
    timeframe: '5M',
    expiry: 15,
    entry_price: 1.29815,
    confidence: 88,
    timestamp: new Date(Date.now() - 15 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: true,
      won: true,
      followedRules: true,
      feedback: 'Waited for 15 EMA to close below 50 EMA on 5M candle; entered 15-minute trade (4 candles), clean win.'
    }
  },
  {
    id: 'sig_103',
    pair: 'USD/JPY',
    direction: 'BUY',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Crossover',
    timeframe: '5M',
    expiry: 15,
    entry_price: 151.420,
    confidence: 84,
    timestamp: new Date(Date.now() - 30 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Skipped trade: missed the initial crossover bar.'
    }
  },
  {
    id: 'sig_104',
    pair: 'BTC/USDT',
    direction: 'SELL',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Crossover',
    timeframe: '5M',
    expiry: 15,
    entry_price: 64510.00,
    confidence: 90,
    timestamp: new Date(Date.now() - 45 * 60000).toLocaleTimeString(),
    journal: {
      tookTrade: true,
      won: false,
      followedRules: false,
      feedback: 'Failed rule: selected 5-minute expiry instead of the 4 candlesticks (15-minute) duration.'
    }
  }
];

let currentJournalingSignal = null;
let journalTempData = {};

// Synthesizer Audio Chime
function playSignalChime(isBuy = true) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isBuy ? 587.33 : 440.00, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isBuy ? 880 : 330, ctx.currentTime + 0.35);

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

// RUNTIME ENGINE: Configures Chart with EMA 15 (Yellow) and EMA 50 (Blue) Indicators directly rendered on screen
let tvWidgetInstance = null;

function updateChartRuntime() {
  const container = document.getElementById('tradingview_chart_container');
  if (!container) return;

  // Clear previous instance
  container.innerHTML = '';

  // Configured Technical Indicators for TradingView Library:
  // 1. EMA 15 (Yellow)
  // 2. EMA 50 (Blue)
  const studiesList = [
    {
      id: "MAExp@tv-basicstudies",
      version: 60,
      inputs: {
        length: 15,
        source: "close"
      }
    },
    {
      id: "MASimple@tv-basicstudies",
      version: 60,
      inputs: {
        length: 50,
        source: "close"
      }
    }
  ];

  const studiesOverrides = {
    // 15 EMA - Yellow line (#facc15)
    "moving average exponential.plot.color": "#facc15",
    "moving average exponential.plot.linewidth": 2,
    "moving average exponential.ma.color": "#facc15",
    "moving average exponential.ma.linewidth": 2,
    
    // 50 EMA - Blue line (#2563eb)
    "moving average.plot.color": "#2563eb",
    "moving average.plot.linewidth": 3,
    "moving average.ma.color": "#2563eb",
    "moving average.ma.linewidth": 3
  };

  if (typeof TradingView !== 'undefined' && TradingView.widget) {
    try {
      tvWidgetInstance = new TradingView.widget({
        autosize: true,
        symbol: activeSymbol,
        interval: activeTimeframe,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1", // Candlesticks
        locale: "en",
        toolbar_bg: "#0b0f19",
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: false,
        container_id: "tradingview_chart_container",
        studies: studiesList,
        studies_overrides: studiesOverrides,
        overrides: {
          "paneProperties.background": "#0b0f19",
          "paneProperties.vertGridProperties.color": "#1e293b",
          "paneProperties.horzGridProperties.color": "#1e293b",
          "symbolWatermarkProperties.transparency": 90,
          "scalesProperties.textColor": "#94a3b8"
        }
      });
    } catch(err) {
      console.warn('TradingView constructor fallback:', err);
      renderIframeFallback(container, studiesList, studiesOverrides);
    }
  } else {
    renderIframeFallback(container, studiesList, studiesOverrides);
  }

  // Update badge UI
  const pairBadge = document.getElementById('active-pair-badge');
  if (pairBadge) pairBadge.innerText = `${activePair} • ${activeTimeframe}M`;

  const indBadge = document.getElementById('active-indicators-badge');
  if (indBadge) indBadge.innerText = 'EMA 15 (Yellow) + EMA 50 (Blue)';
}

function renderIframeFallback(container, studiesList, studiesOverrides) {
  const studiesParam = encodeURIComponent(JSON.stringify(["MAExp@tv-basicstudies", "MASimple@tv-basicstudies"]));
  const overridesParam = encodeURIComponent(JSON.stringify(studiesOverrides));

  container.innerHTML = `
    <iframe src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_7918a&symbol=${encodeURIComponent(activeSymbol)}&interval=${activeTimeframe}&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=0b0f19&studies=${studiesParam}&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=${overridesParam}&locale=en&utm_source=localhost"
            style="width: 100%; height: 100%; border: none;">
    </iframe>
  `;
}

// Strategy Selector Callback
function onStrategyChange(strategyKey) {
  currentStrategy = strategyKey;
  const strat = STRATEGIES[strategyKey];
  if (strat) {
    document.getElementById('strategy-description').innerHTML = strat.desc;
    updateChartRuntime();
    showToast(`Strategy Loaded: ${strat.name}`, 'success');
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
  showToast(`Market Tracker loaded: ${pairName} (${activeTimeframe}M)`, 'info');
}

// Timeframe Switcher (5M Primary, 15M, 30M)
function switchTimeframe(tf) {
  activeTimeframe = tf;
  document.getElementById('tf-5').classList.toggle('active', tf === '5');
  document.getElementById('tf-15').classList.toggle('active', tf === '15');
  document.getElementById('tf-30').classList.toggle('active', tf === '30');
  updateChartRuntime();
  showToast(`Timeframe set to ${tf}M candle chart`, 'info');
}

// RENDER SIGNALS IN SIGNAL BOX (First = Blue, Others = Gray)
function renderSignals() {
  const listEl = document.getElementById('signal-box-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  signalsData.forEach((sig, index) => {
    const isCurrent = index === 0;
    const isBuy = sig.direction === 'BUY' || sig.direction === 'CALL';
    const card = document.createElement('div');
    card.className = `signal-item ${isCurrent ? 'current' : 'historical'}`;

    const statusLabel = isCurrent 
      ? `<span class="signal-status-label">CURRENT ACTIVE</span>` 
      : `<span class="signal-status-label">PAST ${sig.timeframe || '5M'}</span>`;

    const journalButtonText = sig.journal ? '✓ Journaled' : '📝 Record in Journal';
    const journalBtnStyle = sig.journal 
      ? 'background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;' 
      : 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid #3b82f6;';

    const directionBadge = isBuy 
      ? `<span class="badge-call">BUY (15 EMA &gt; 50 EMA)</span>` 
      : `<span class="badge-put">SELL (15 EMA &lt; 50 EMA)</span>`;

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong class="signal-pair-text" style="font-size: 1.05rem;">${sig.pair}</strong>
            ${directionBadge}
            <span style="font-size: 0.72rem; background: #1e293b; color: #94a3b8; padding: 0.15rem 0.45rem; border-radius: 3px; font-weight: 700;">TF: ${sig.timeframe || '5M'}</span>
            ${statusLabel}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem;">
            Entry: <strong style="color: #fff;">${sig.entry_price}</strong> | Trade Duration: <strong style="color: #60a5fa;">4 Candlesticks (${sig.expiry} Min)</strong> | Conf: <strong>${sig.confidence}%</strong>
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

// SIMULATE NEW EMA 15/50 CROSSOVER SIGNAL
function triggerSimulatedSignal() {
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USDT', 'AUD/USD'];
  const directions = ['BUY', 'SELL'];
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
  const confidence = Math.floor(88 + Math.random() * 8);

  const strat = STRATEGIES[currentStrategy] || STRATEGIES['EMA_CROSS_15_50'];

  const newSignal = {
    id: 'sig_' + Math.floor(Math.random() * 10000),
    pair: selectedPair,
    direction: selectedDirection,
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Crossover',
    timeframe: `${activeTimeframe}M`,
    expiry: 15, // 4 candles on 5M = 15 minute duration
    entry_price: selectedPrice,
    confidence: confidence,
    timestamp: new Date().toLocaleTimeString(),
    journal: null
  };

  // Add to front (becomes CURRENT in Blue, all others become Gray)
  signalsData.unshift(newSignal);
  renderSignals();
  renderJournalTable();
  playSignalChime(selectedDirection === 'BUY');

  const crossDetail = selectedDirection === 'BUY' ? '15 EMA crossed ABOVE 50 EMA' : '15 EMA crossed BELOW 50 EMA';
  showToast(`🚨 ${selectedPair} ${selectedDirection} Signal! (${crossDetail} • 15M Duration)`, 'success');
}

// TRADE JOURNAL QUESTION WORKFLOW
function openJournalForSignal(signalId) {
  const signal = signalsData.find(s => s.id === signalId);
  if (!signal) return;
  currentJournalingSignal = signal;
  journalTempData = {};

  document.getElementById('modal-signal-info').innerText = `${signal.pair} ${signal.direction} [${signal.timeframe || '5M'}] @ ${signal.entry_price} (${signal.timestamp})`;

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
      feedback: 'Trade won (ITM) using 4 candlestick (15-minute) duration.'
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
      feedback: 'Disciplined execution: followed 15 EMA / 50 EMA crossover and 4 candlestick (15-minute) duration strictly.'
    });
  } else {
    document.getElementById('journal-q3').classList.remove('active');
    document.getElementById('journal-q4').classList.add('active');
  }
}

// Question 4: Save honest feedback input
function submitFeedbackReason() {
  const reason = document.getElementById('feedback-reason-input').value.trim();
  const feedback = reason || 'Trader did not adhere to the 4 candlestick (15-minute) duration or crossover rule.';

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

    const isBuy = sig.direction === 'BUY' || sig.direction === 'CALL';
    const directionBadge = isBuy 
      ? `<span class="badge-call">BUY</span>` 
      : `<span class="badge-put">SELL</span>`;

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
      <td><strong>${sig.pair}</strong> ${directionBadge}</td>
      <td style="font-size: 0.8rem; color: #94a3b8;">[${sig.timeframe || '5M'}] 15 EMA × 50 EMA Cross</td>
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

  // Load the single active EMA 15/50 crossover strategy
  document.getElementById('strategy-description').innerHTML = STRATEGIES['EMA_CROSS_15_50'].desc;
  updateChartRuntime();
});
