// Coordinated Trading Terminal Logic - EMA 15/50 Exact Crossover Engine
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
let activeTimeframe = '1'; // 1M Primary Entry Timeframe

// The Single Active Strategy Specification
const STRATEGIES = {
  EMA_CROSS_15_50: {
    name: '15 EMA (Yellow) × 50 EMA (Blue) Crossover Strategy',
    badge: 'EMA 15 (Yellow) + EMA 50 (Blue)',
    timeframe: '1M',
    minDuration: 15, // 15 Minutes trade duration
    studies: [
      {
        id: "MAExp@tv-basicstudies",
        version: 60,
        inputs: { length: 15, source: "close" }
      },
      {
        id: "MASimple@tv-basicstudies",
        version: 60,
        inputs: { length: 50, source: "close" }
      }
    ],
    // Overrides: EMA 15 Yellow (#FFEB3B), EMA 50 Blue (#2196F3)
    studiesOverrides: {
      "moving average exponential.plot.color": "#FFEB3B",
      "moving average exponential.plot.linewidth": 2,
      "moving average exponential.ma.color": "#FFEB3B",
      "moving average exponential.ma.linewidth": 2,
      "moving average exponential.color": "#FFEB3B",
      "moving average.plot.color": "#2196F3",
      "moving average.plot.linewidth": 3,
      "moving average.ma.color": "#2196F3",
      "moving average.ma.linewidth": 3,
      "moving average.color": "#2196F3"
    },
    desc: '• <strong>Primary Entry Timeframe</strong>: <span style="color:#60a5fa; font-weight:700;">1-Minute (1M)</span>.<br>' +
          '• <strong>Indicator 1</strong>: <span style="color:#2196F3; font-weight:700;">EMA 50 (Close) - Colour: BLUE</span><br>' +
          '• <strong>Indicator 2</strong>: <span style="color:#FFEB3B; font-weight:700;">EMA 15 (Close) - Colour: YELLOW</span><br>' +
          '• <strong>BUY Trigger</strong>: 15 EMA (Yellow) crosses <strong style="color:var(--call-green);">ABOVE</strong> 50 EMA (Blue) on 1M close.<br>' +
          '• <strong>SELL Trigger</strong>: 15 EMA (Yellow) crosses <strong style="color:var(--put-red);">BELOW</strong> 50 EMA (Blue) on 1M close.<br>' +
          '• <strong>Crossover Gate</strong>: Only printed ONCE at the instant crossover occurs. No repeat signals after crossover has already happened.<br>' +
          '• <strong>Trade Duration</strong>: <strong style="color:#fff;">15 Minutes</strong>.'
  }
};

// Initial Signals with explicit created_at epoch timestamps
let signalsData = [
  {
    id: 'sig_101',
    pair: 'EUR/USD',
    direction: 'BUY',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Fresh Crossover',
    timeframe: '1M',
    expiry: 15, // 15 Min duration
    entry_price: 1.08542,
    confidence: 93,
    createdAt: Date.now() - 60000, // 1 min ago (Fresh/Current Active)
    timestamp: new Date(Date.now() - 60000).toLocaleTimeString(),
    decision: null,
    journal: null
  },
  {
    id: 'sig_102',
    pair: 'GBP/USD',
    direction: 'SELL',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Fresh Crossover',
    timeframe: '1M',
    expiry: 15,
    entry_price: 1.29815,
    confidence: 88,
    createdAt: Date.now() - 7 * 60000, // 7 min ago (Running > 5 min)
    timestamp: new Date(Date.now() - 7 * 60000).toLocaleTimeString(),
    decision: 'TOOK_TRADE',
    journal: {
      tookTrade: true,
      won: true,
      followedRules: true,
      feedback: 'Waited for 15 EMA to close below 50 EMA on 1M candle; entered 15-minute duration trade, clean ITM win.'
    }
  },
  {
    id: 'sig_103',
    pair: 'USD/JPY',
    direction: 'BUY',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Fresh Crossover',
    timeframe: '1M',
    expiry: 15,
    entry_price: 151.420,
    confidence: 85,
    createdAt: Date.now() - 20 * 60000,
    timestamp: new Date(Date.now() - 20 * 60000).toLocaleTimeString(),
    decision: 'MISSED',
    journal: {
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Missed signal: was away from screen during the 1M crossover bar.'
    }
  },
  {
    id: 'sig_104',
    pair: 'BTC/USDT',
    direction: 'SELL',
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Fresh Crossover',
    timeframe: '1M',
    expiry: 15,
    entry_price: 64510.00,
    confidence: 91,
    createdAt: Date.now() - 32 * 60000,
    timestamp: new Date(Date.now() - 32 * 60000).toLocaleTimeString(),
    decision: 'TOOK_TRADE',
    journal: {
      tookTrade: true,
      won: false,
      followedRules: false,
      feedback: 'Failed rule: selected 1-minute expiry instead of the full 15-minute duration.'
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

  const strat = STRATEGIES[currentStrategy] || STRATEGIES['EMA_CROSS_15_50'];
  const studiesList = strat.studies;
  const studiesOverrides = strat.studiesOverrides;

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
      renderIframeFallback(container, studiesOverrides);
    }
  } else {
    renderIframeFallback(container, studiesOverrides);
  }

  // Update badge UI
  const pairBadge = document.getElementById('active-pair-badge');
  if (pairBadge) pairBadge.innerText = `${activePair} • ${activeTimeframe}M`;

  const indBadge = document.getElementById('active-indicators-badge');
  if (indBadge) indBadge.innerText = 'EMA 15 (Yellow) + EMA 50 (Blue)';

  // Update visual marker on chart
  updateChartSignalMarker();
}

// Visual Signal Marker / Sign on Chart
function updateChartSignalMarker() {
  const marker = document.getElementById('chart-signal-marker-badge');
  if (!marker) return;

  // Look for latest active signal matching current activePair
  const currentSignal = signalsData.find(s => s.pair === activePair);
  if (!currentSignal) {
    marker.style.display = 'none';
    return;
  }

  const ageMinutes = Math.floor((Date.now() - (currentSignal.createdAt || Date.now())) / 60000);
  const isBuy = currentSignal.direction === 'BUY' || currentSignal.direction === 'CALL';

  // Display marker sign on chart if signal is under 15 minutes old
  if (ageMinutes < 15) {
    marker.style.display = 'flex';
    marker.className = `chart-signal-marker ${isBuy ? 'buy' : 'sell'}`;
    const signArrow = isBuy ? '▲ BUY' : '▼ SELL';
    const crossLabel = isBuy ? '15 EMA (Yellow) > 50 EMA (Blue)' : '15 EMA (Yellow) < 50 EMA (Blue)';

    marker.innerHTML = `
      <span style="font-size: 0.95rem;">${signArrow}</span>
      <span>${currentSignal.pair} @ ${currentSignal.entry_price}</span>
      <span style="font-size: 0.7rem; opacity: 0.9; font-weight: 600;">[${crossLabel} • 15M Trade]</span>
    `;
  } else {
    marker.style.display = 'none';
  }
}

function renderIframeFallback(container, studiesOverrides) {
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

// Timeframe Switcher (1M Primary Entry, 5M, 15M)
function switchTimeframe(tf) {
  activeTimeframe = tf;
  const btn1 = document.getElementById('tf-1');
  const btn5 = document.getElementById('tf-5');
  const btn15 = document.getElementById('tf-15');
  if (btn1) btn1.classList.toggle('active', tf === '1');
  if (btn5) btn5.classList.toggle('active', tf === '5');
  if (btn15) btn15.classList.toggle('active', tf === '15');

  updateChartRuntime();
  showToast(`Entry Timeframe set to ${tf}M candle chart`, 'info');
}

// RENDER SIGNALS IN SIGNAL BOX
function renderSignals() {
  const listEl = document.getElementById('signal-box-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const now = Date.now();

  signalsData.forEach((sig, index) => {
    const isFirst = index === 0;
    const isBuy = sig.direction === 'BUY' || sig.direction === 'CALL';
    const ageMs = now - (sig.createdAt || now);
    const ageMinutes = Math.floor(ageMs / 60000);
    const isRunning = ageMinutes >= 5 && ageMinutes < (sig.expiry || 15);
    const isExpired = ageMinutes >= (sig.expiry || 15);

    const card = document.createElement('div');
    card.className = `signal-item ${isFirst ? 'current' : 'historical'}`;

    // Dynamic Status Label: Fresh Current vs Running vs Past
    let statusLabel = '';
    if (isFirst && !isRunning && !isExpired) {
      statusLabel = `<span class="signal-status-label">CURRENT ACTIVE</span>`;
    } else if (isRunning) {
      statusLabel = `<span class="signal-status-label running">⚡ RUNNING (${ageMinutes}m in)</span>`;
    } else {
      statusLabel = `<span class="signal-status-label">PAST ${sig.timeframe || '1M'}</span>`;
    }

    const directionBadge = isBuy 
      ? `<span class="badge-call">BUY (15 EMA &gt; 50 EMA)</span>` 
      : `<span class="badge-put">SELL (15 EMA &lt; 50 EMA)</span>`;

    // Interactive Action Buttons (Took Trade vs Missed Signal)
    let decisionControls = '';
    if (sig.decision === 'TOOK_TRADE') {
      decisionControls = `
        <div style="font-size: 0.75rem; color: var(--call-green); font-weight: 700; margin-top: 0.35rem;">
          ✓ Trade Executed
        </div>
      `;
    } else if (sig.decision === 'MISSED') {
      decisionControls = `
        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-top: 0.35rem;">
          ✕ Signal Missed
        </div>
      `;
    } else {
      decisionControls = `
        <div class="trade-action-btns">
          <button class="btn-action-take" onclick="handleSignalDecision('${sig.id}', true)">✓ Took Trade</button>
          <button class="btn-action-miss" onclick="handleSignalDecision('${sig.id}', false)">✕ Missed Signal</button>
        </div>
      `;
    }

    const journalButtonText = sig.journal ? '✓ Journaled' : '📝 Journal';
    const journalBtnStyle = sig.journal 
      ? 'background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;' 
      : 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid #3b82f6;';

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.85rem; width: 100%;">
        <div style="width: 100%;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong class="signal-pair-text" style="font-size: 1.05rem;">${sig.pair}</strong>
              ${directionBadge}
            </div>
            ${statusLabel}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem;">
            Entry: <strong style="color: #fff;">${sig.entry_price}</strong> | Duration: <strong style="color: #60a5fa;">${sig.expiry} Minutes</strong> | Conf: <strong>${sig.confidence}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem; flex-wrap: wrap; gap: 0.5rem;">
            <div style="font-size: 0.72rem; color: #64748b;">
              ${sig.timestamp} (${ageMinutes}m ago)
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${decisionControls}
              <button class="btn btn-sm" style="${journalBtnStyle} font-size: 0.72rem; padding: 0.25rem 0.55rem;" onclick="openJournalForSignal('${sig.id}')">
                ${journalButtonText}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    listEl.appendChild(card);
  });

  updateChartSignalMarker();
}

// User action directly from Signal Box: "Took Trade" or "Missed Signal"
function handleSignalDecision(signalId, tookTrade) {
  const signal = signalsData.find(s => s.id === signalId);
  if (!signal) return;

  if (tookTrade) {
    signal.decision = 'TOOK_TRADE';
    showToast(`Recorded: Took trade on ${signal.pair} (${signal.direction})`, 'success');
    openJournalForSignal(signalId);
  } else {
    signal.decision = 'MISSED';
    signal.journal = {
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Missed signal.'
    };
    showToast(`Marked ${signal.pair} as Missed Signal (Gray in Journal)`, 'info');
    renderSignals();
    renderJournalTable();
  }
}

// SIMULATE NEW EMA 15/50 CROSSOVER SIGNAL AT EXACT CROSSOVER INSTANT
function triggerSimulatedSignal() {
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USDT', 'AUD/USD'];
  const prices = {
    'EUR/USD': (1.08500 + Math.random() * 0.002).toFixed(5),
    'GBP/USD': (1.29800 + Math.random() * 0.002).toFixed(5),
    'USD/JPY': (151.300 + Math.random() * 0.4).toFixed(3),
    'BTC/USDT': (64200 + Math.random() * 500).toFixed(2),
    'AUD/USD': (0.67200 + Math.random() * 0.001).toFixed(5)
  };

  const selectedPair = pairs[Math.floor(Math.random() * pairs.length)];
  const selectedPrice = prices[selectedPair];
  const confidence = Math.floor(90 + Math.random() * 6);

  // STRICT CROSSOVER GATE: Determine opposite of last signal on this pair to prevent repeat signals after crossover
  const lastSignalOnPair = signalsData.find(s => s.pair === selectedPair);
  let selectedDirection = 'BUY';
  if (lastSignalOnPair && lastSignalOnPair.direction === 'BUY') {
    selectedDirection = 'SELL';
  } else if (lastSignalOnPair && lastSignalOnPair.direction === 'SELL') {
    selectedDirection = 'BUY';
  } else {
    selectedDirection = Math.random() > 0.5 ? 'BUY' : 'SELL';
  }

  const newSignal = {
    id: 'sig_' + Math.floor(Math.random() * 10000),
    pair: selectedPair,
    direction: selectedDirection,
    strategy: '15 EMA (Yellow) × 50 EMA (Blue) Fresh Crossover',
    timeframe: '1M',
    expiry: 15, // 15-minute duration
    entry_price: selectedPrice,
    confidence: confidence,
    createdAt: Date.now(),
    timestamp: new Date().toLocaleTimeString(),
    decision: null,
    journal: null
  };

  // Add to front (becomes CURRENT in Blue, all others become Gray / Running after 5 min)
  signalsData.unshift(newSignal);
  renderSignals();
  renderJournalTable();
  playSignalChime(selectedDirection === 'BUY');

  const crossDetail = selectedDirection === 'BUY' ? '15 EMA Yellow crossed ABOVE 50 EMA Blue' : '15 EMA Yellow crossed BELOW 50 EMA Blue';
  showToast(`🚨 ${selectedPair} ${selectedDirection} Fresh Crossover! (${crossDetail} • 15M Duration)`, 'success');
}

// TRADE JOURNAL QUESTION WORKFLOW
function openJournalForSignal(signalId) {
  const signal = signalsData.find(s => s.id === signalId);
  if (!signal) return;
  currentJournalingSignal = signal;
  journalTempData = {};

  document.getElementById('modal-signal-info').innerText = `${signal.pair} ${signal.direction} [${signal.timeframe || '1M'}] @ ${signal.entry_price} (${signal.timestamp})`;

  // If user already clicked "Took Trade" in signal box, pre-set Q1
  document.querySelectorAll('.journal-step').forEach(step => step.classList.remove('active'));

  if (signal.decision === 'TOOK_TRADE') {
    journalTempData.tookTrade = true;
    document.getElementById('journal-q2').classList.add('active');
  } else {
    document.getElementById('journal-q1').classList.add('active');
  }

  document.getElementById('feedback-reason-input').value = '';
  openModal('journal-modal');
}

// Question 1: Did you take a trade on the signal?
function handleJournalQ1(tookTrade) {
  journalTempData.tookTrade = tookTrade;

  if (!tookTrade) {
    if (currentJournalingSignal) currentJournalingSignal.decision = 'MISSED';
    finishJournalRecord({
      tookTrade: false,
      won: null,
      followedRules: null,
      feedback: 'Trade was skipped / missed.'
    });
  } else {
    if (currentJournalingSignal) currentJournalingSignal.decision = 'TOOK_TRADE';
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
      feedback: 'Trade won (ITM) on 15-minute duration.'
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
      feedback: 'Disciplined execution: followed 1M crossover and 15-minute duration strictly.'
    });
  } else {
    document.getElementById('journal-q3').classList.remove('active');
    document.getElementById('journal-q4').classList.add('active');
  }
}

// Question 4: Save honest feedback input
function submitFeedbackReason() {
  const reason = document.getElementById('feedback-reason-input').value.trim();
  const feedback = reason || 'Trader did not adhere to the 15-minute duration or entered late after the crossover.';

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
      showToast('Trade recorded as Missed (Marked Gray in Journal)', 'info');
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
        tradeTakenCell = '<span class="journal-badge badge-skipped">No (Missed)</span>';
        outcomeCell = '<span style="color: #94a3b8;">N/A (Missed)</span>';
        feedbackCell = `<em>${sig.journal.feedback || 'Missed signal'}</em>`;
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
      <td style="font-size: 0.8rem; color: #94a3b8;">[${sig.timeframe || '1M'}] 15 EMA × 50 EMA Cross</td>
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

  // Check every 30 seconds to update signal status (Current -> Running after 5 min)
  setInterval(() => {
    renderSignals();
  }, 30000);
});
