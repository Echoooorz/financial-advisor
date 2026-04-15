// --- Tab Navigation ---
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// --- Save / Load Retirement Data ---
const STORAGE_KEY = 'financialAdvisor_retirement';

function saveRetirementData() {
  const data = {
    // Simple fields
    age: document.getElementById('age').value,
    retirementAge: document.getElementById('retirementAge').value,
    filingStatus: document.getElementById('filingStatus').value,
    returnRate: document.getElementById('returnRate').value,
    currentSavingsP1: document.getElementById('currentSavingsP1').value,
    employerMatchP1: document.getElementById('employerMatchP1').value,
    employerMatchLimitP1: document.getElementById('employerMatchLimitP1').value,
    currentSavingsP2: document.getElementById('currentSavingsP2').value,
    employerMatchP2: document.getElementById('employerMatchP2').value,
    employerMatchLimitP2: document.getElementById('employerMatchLimitP2').value,
    // Dynamic salary rows
    salaryP1: [],
    salaryP2: [],
    lowIncome: [],
    expenses: {}
  };

  document.querySelectorAll('.sal-age-p1').forEach((el, i) => {
    data.salaryP1.push({ age: el.value, amount: document.querySelectorAll('.sal-amt-p1')[i].value });
  });
  document.querySelectorAll('.sal-age-p2').forEach((el, i) => {
    data.salaryP2.push({ age: el.value, amount: document.querySelectorAll('.sal-amt-p2')[i].value });
  });
  document.querySelectorAll('.low-from').forEach((el, i) => {
    data.lowIncome.push({
      from: el.value,
      to: document.querySelectorAll('.low-to')[i].value,
      salP1: document.querySelectorAll('.low-sal-p1')[i].value,
      salP2: document.querySelectorAll('.low-sal-p2')[i].value
    });
  });
  document.querySelectorAll('.expense').forEach(el => {
    data.expenses[el.dataset.key] = el.value;
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  showSaveConfirmation();
}

function showSaveConfirmation() {
  const btn = document.getElementById('saveBtn');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = '✓ Saved';
  btn.style.borderColor = 'var(--green)';
  btn.style.color = 'var(--green)';
  setTimeout(() => { btn.textContent = orig; btn.style.borderColor = ''; btn.style.color = ''; }, 2000);
}

function loadRetirementData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);

    // Simple fields
    const fields = ['age', 'retirementAge', 'filingStatus', 'returnRate',
      'currentSavingsP1', 'employerMatchP1', 'employerMatchLimitP1',
      'currentSavingsP2', 'employerMatchP2', 'employerMatchLimitP2'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] != null && data[id] !== '') el.value = data[id];
    });

    // Salary P1
    if (data.salaryP1 && data.salaryP1.length) {
      const container = document.getElementById('salaryEntriesP1');
      container.innerHTML = '';
      data.salaryP1.forEach(row => {
        const div = document.createElement('div');
        div.className = 'inline-row';
        div.innerHTML = `<label>Age</label><input type="number" class="sal-age-p1" value="${row.age}"><label>$</label><input type="number" class="sal-amt-p1" value="${row.amount}" step="1000">`;
        container.appendChild(div);
      });
    }

    // Salary P2
    if (data.salaryP2 && data.salaryP2.length) {
      const container = document.getElementById('salaryEntriesP2');
      container.innerHTML = '';
      data.salaryP2.forEach(row => {
        const div = document.createElement('div');
        div.className = 'inline-row';
        div.innerHTML = `<label>Age</label><input type="number" class="sal-age-p2" value="${row.age}"><label>$</label><input type="number" class="sal-amt-p2" value="${row.amount}" step="1000">`;
        container.appendChild(div);
      });
    }

    // Low income
    if (data.lowIncome && data.lowIncome.length) {
      const container = document.getElementById('lowIncomeEntries');
      container.innerHTML = '';
      data.lowIncome.forEach(row => {
        const div = document.createElement('div');
        div.className = 'inline-row';
        div.innerHTML = `<label>From age</label><input type="number" class="low-from" value="${row.from}">
          <label>To age</label><input type="number" class="low-to" value="${row.to}">
          <label>P1 $</label><input type="number" class="low-sal-p1" value="${row.salP1}" step="1000">
          <label>P2 $</label><input type="number" class="low-sal-p2" value="${row.salP2}" step="1000">`;
        container.appendChild(div);
      });
    }

    // Expenses
    if (data.expenses) {
      document.querySelectorAll('.expense').forEach(el => {
        if (data.expenses[el.dataset.key] != null) el.value = data.expenses[el.dataset.key];
      });
    }
  } catch (e) {
    console.warn('Failed to load saved retirement data:', e);
  }
}

// --- Dynamic Rows ---
function addSalaryRow(person) {
  const container = document.getElementById('salaryEntries' + person);
  const div = document.createElement('div');
  div.className = 'inline-row';
  const cls = person.toLowerCase();
  div.innerHTML = `<label>Age</label><input type="number" class="sal-age-${cls}" value="45"><label>$</label><input type="number" class="sal-amt-${cls}" value="300000" step="1000">`;
  container.appendChild(div);
}

function addLowIncomeRow() {
  const container = document.getElementById('lowIncomeEntries');
  const div = document.createElement('div');
  div.className = 'inline-row';
  div.innerHTML = `<label>From age</label><input type="number" class="low-from" value="40">
    <label>To age</label><input type="number" class="low-to" value="42">
    <label>P1 $</label><input type="number" class="low-sal-p1" value="50000" step="1000">
    <label>P2 $</label><input type="number" class="low-sal-p2" value="120000" step="1000">`;
  container.appendChild(div);
}

// --- Retirement Calculator ---
let lastYearlyPlan = null;

document.getElementById('retirementForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const salaryScheduleP1 = [];
  document.querySelectorAll('.sal-age-p1').forEach((el, i) => {
    salaryScheduleP1.push({ fromAge: +el.value, salary: +document.querySelectorAll('.sal-amt-p1')[i].value });
  });
  const salaryScheduleP2 = [];
  document.querySelectorAll('.sal-age-p2').forEach((el, i) => {
    salaryScheduleP2.push({ fromAge: +el.value, salary: +document.querySelectorAll('.sal-amt-p2')[i].value });
  });

  const lowIncomeYears = [];
  document.querySelectorAll('.low-from').forEach((el, i) => {
    lowIncomeYears.push({
      fromAge: +el.value,
      toAge: +document.querySelectorAll('.low-to')[i].value,
      salaryP1: +document.querySelectorAll('.low-sal-p1')[i].value,
      salaryP2: +document.querySelectorAll('.low-sal-p2')[i].value
    });
  });

  const expenses = {};
  document.querySelectorAll('.expense').forEach(el => { expenses[el.dataset.key] = +el.value; });

  const data = {
    age: +document.getElementById('age').value,
    retirementAge: +document.getElementById('retirementAge').value,
    filingStatus: document.getElementById('filingStatus').value,
    currentSavingsP1: +document.getElementById('currentSavingsP1').value,
    currentSavingsP2: +document.getElementById('currentSavingsP2').value,
    employerMatchP1: +document.getElementById('employerMatchP1').value,
    employerMatchLimitP1: +document.getElementById('employerMatchLimitP1').value,
    employerMatchP2: +document.getElementById('employerMatchP2').value,
    employerMatchLimitP2: +document.getElementById('employerMatchLimitP2').value,
    salaryScheduleP1, salaryScheduleP2, lowIncomeYears, expenses,
    returnRate: +document.getElementById('returnRate').value
  };

  const res = await fetch('/api/retirement/calculate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const result = await res.json();
  lastYearlyPlan = result.yearlyPlan;
  saveRetirementData();
  renderRetirementResults(result);
});

function fmt(n) { return '$' + Math.round(n).toLocaleString(); }

function renderRetirementResults(data) {
  const container = document.getElementById('retirementResults');
  const { summary: s, yearlyPlan } = data;

  let html = `
    <div class="summary-grid">
      <div class="summary-card"><div class="label">Years to Retirement</div><div class="value">${s.yearsToRetirement}</div></div>
      <div class="summary-card"><div class="label">401K Annual Return</div><div class="value blue">${s.annualReturnRate || document.getElementById('returnRate').value + '%'}</div></div>
      <div class="summary-card"><div class="label">P1 Projected</div><div class="value green">${fmt(s.projectedSavingsP1)}</div></div>
      <div class="summary-card"><div class="label">P2 Projected</div><div class="value green">${fmt(s.projectedSavingsP2)}</div></div>
      <div class="summary-card"><div class="label">Combined Savings</div><div class="value green">${fmt(s.projectedSavingsTotal)}</div></div>
      <div class="summary-card"><div class="label">Monthly Retirement Income</div><div class="value blue">${fmt(s.monthlyRetirementIncome)}</div></div>
      <div class="summary-card"><div class="label">Monthly Expenses</div><div class="value yellow">${fmt(s.totalAnnualExpenses / 12)}/mo</div></div>
    </div>`;

  const y0 = yearlyPlan[0];
  html += `
    <div class="two-col" style="margin-bottom:1rem;">
      <div class="rec-card">
        <h3>👤 Person 1 — Year 1 Recommendations</h3>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.75rem;">Pre-tax 401K + After-tax 401K + IRA · Marginal rate: ${y0.margRateP1}</p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;">
          <div><div style="font-size:0.78rem;color:var(--text-muted);">Pre-tax 401K</div><div class="rec-amount">${fmt(y0.p1PreTax)}</div></div>
          <div><div style="font-size:0.78rem;color:var(--text-muted);">After-tax 401K</div><div class="rec-amount">${fmt(y0.p1AfterTax)}</div></div>
          <div><div style="font-size:0.78rem;color:var(--text-muted);">IRA</div><div class="rec-amount">${fmt(y0.p1Ira)}</div></div>
          <div><div style="font-size:0.78rem;color:var(--text-muted);">Employer Match</div><div class="rec-amount">${fmt(y0.p1Match)}</div></div>
        </div>
        <div style="margin-top:0.5rem;">
          <span class="rec-badge ${y0.p1AfterTaxRoth ? 'roth' : 'caution'}">After-tax → ${y0.p1AfterTaxRoth ? 'Roth ✓' : 'Keep Traditional'}</span>
          <span class="rec-badge ${y0.p1IraRoth ? 'roth' : 'traditional'}">IRA → ${y0.p1IraRoth ? 'Roth ✓' : 'Traditional'}</span>
        </div>
      </div>
      <div class="rec-card">
        <h3>👤 Person 2 — Year 1 Recommendations</h3>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.75rem;">Pre-tax 401K + IRA only · Marginal rate: ${y0.margRateP2}</p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;">
          <div><div style="font-size:0.78rem;color:var(--text-muted);">Pre-tax 401K</div><div class="rec-amount">${fmt(y0.p2PreTax)}</div></div>
          <div><div style="font-size:0.78rem;color:var(--text-muted);">IRA</div><div class="rec-amount">${fmt(y0.p2Ira)}</div></div>
          <div><div style="font-size:0.78rem;color:var(--text-muted);">Employer Match</div><div class="rec-amount">${fmt(y0.p2Match)}</div></div>
        </div>
        <div style="margin-top:0.5rem;">
          <span class="rec-badge ${y0.p2IraRoth ? 'roth' : 'traditional'}">IRA → ${y0.p2IraRoth ? 'Roth ✓' : 'Traditional'}</span>
        </div>
      </div>
    </div>`;

  // Year-by-year table
  html += `
    <div class="rec-card">
      <h3>📊 Year-by-Year Plan (${s.annualReturnRate || document.getElementById('returnRate').value + '%'} annual return assumed)</h3>
      <div class="year-table-wrap">
        <table class="year-table">
          <thead><tr>
            <th>Age</th>
            <th>P1 Salary</th><th>P1 PreTax</th><th>P1 AfterTax</th><th>P1 IRA</th><th>P1 Match</th><th>P1 Cumul.</th>
            <th>P2 Salary</th><th>P2 PreTax</th><th>P2 IRA</th><th>P2 Match</th><th>P2 Cumul.</th>
            <th>Combined</th><th>Investable</th>
          </tr></thead>
          <tbody>
            ${yearlyPlan.map(y => `
              <tr class="${y.isLowIncomeYear ? 'low-income' : ''}">
                <td>${y.age}${y.isLowIncomeYear ? ' ⚡' : ''}</td>
                <td>${fmt(y.salaryP1)}</td><td>${fmt(y.p1PreTax)}</td><td>${fmt(y.p1AfterTax)}</td><td>${fmt(y.p1Ira)}</td>
                <td>${y.p1Match > 0 ? fmt(y.p1Match) : '<span style="color:var(--red)">$0</span>'}</td>
                <td style="color:var(--green)">${fmt(y.p1Cumulative)}</td>
                <td>${fmt(y.salaryP2)}</td><td>${fmt(y.p2PreTax)}</td><td>${fmt(y.p2Ira)}</td><td>${fmt(y.p2Match)}</td>
                <td style="color:var(--green)">${fmt(y.p2Cumulative)}</td>
                <td style="color:var(--accent);font-weight:600">${fmt(y.combinedCumulative)}</td>
                <td style="color:${y.investableOutside > 0 ? 'var(--green)' : 'var(--red)'}">${fmt(y.investableOutside)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.5rem;">⚡ = Startup year — P1 has no employer match. Roth conversions are especially valuable in low-income years.</p>
    </div>`;

  container.innerHTML = html;
  container.hidden = false;
}

// --- Investable Cash Projection ---
async function projectInvestable() {
  if (!lastYearlyPlan) {
    document.getElementById('investableNote').textContent = '⚠️ Please run the Retirement Calculator first.';
    document.getElementById('investableNote').style.color = 'var(--red)';
    return;
  }

  const data = {
    yearlyPlan: lastYearlyPlan,
    etfPercent: +document.getElementById('etfPercent').value,
    savingsPercent: +document.getElementById('savingsPercent').value,
    etfReturn: +document.getElementById('etfReturn').value,
    savingsReturn: +document.getElementById('savingsReturn').value,
    savingsCap: +document.getElementById('savingsCap').value || 0
  };

  const res = await fetch('/api/investable/project', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const result = await res.json();
  renderInvestableResults(result);
}

function renderInvestableResults(data) {
  const container = document.getElementById('investableResults');
  const { summary: s, projection } = data;

  let html = `
    <div class="summary-grid">
      <div class="summary-card"><div class="label">ETF Allocation</div><div class="value blue">${s.etfPercent}% @ ${s.etfReturn}/yr</div></div>
      <div class="summary-card"><div class="label">Savings Allocation</div><div class="value yellow">${s.savingsPercent}% @ ${s.savingsReturn}/yr</div></div>
      <div class="summary-card"><div class="label">Savings Cap</div><div class="value">${s.savingsCap ? fmt(s.savingsCap) : 'No cap'}</div></div>
      <div class="summary-card"><div class="label">Total in ETFs at Retirement</div><div class="value green">${fmt(s.totalETF)}</div></div>
      <div class="summary-card"><div class="label">Total in Savings at Retirement</div><div class="value green">${fmt(s.totalSavings)}</div></div>
      <div class="summary-card"><div class="label">Grand Total (Non-Retirement)</div><div class="value green" style="font-size:1.6rem;">${fmt(s.grandTotal)}</div></div>
    </div>

    <div class="rec-card">
      <h3>📊 Year-by-Year Investment & Savings Growth</h3>
      <div class="year-table-wrap">
        <table class="year-table">
          <thead><tr>
            <th>Age</th><th>Investable Cash</th><th>→ ETFs</th><th>→ Savings</th><th>Cumul. ETFs</th><th>Cumul. Savings</th><th>Total</th>
          </tr></thead>
          <tbody>
            ${projection.map(p => `
              <tr>
                <td>${p.age}</td>
                <td>${fmt(p.investable)}</td>
                <td>${fmt(p.toETF)}</td>
                <td>${fmt(p.toSavings)}</td>
                <td style="color:var(--blue)">${fmt(p.cumETF)}</td>
                <td style="color:var(--yellow)">${fmt(p.cumSavings)}</td>
                <td style="color:var(--green);font-weight:600">${fmt(p.cumTotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  container.innerHTML = html;
  container.hidden = false;
  document.getElementById('investableNote').textContent = '';
}

// --- Investment Allocation ---
document.getElementById('investmentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    age: +document.getElementById('invAge').value,
    riskTolerance: document.getElementById('riskTolerance').value,
    investmentAmount: +document.getElementById('investmentAmount').value,
    investmentFrequency: document.getElementById('investmentFrequency').value
  };
  const res = await fetch('/api/investment/allocation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  renderInvestmentResults(await res.json());
});

function renderInvestmentResults(data) {
  const container = document.getElementById('investmentResults');
  const { allocation, frequency, annualTotal, perPeriodTotal, recommendedStocks, recommendedETFs } = data;
  const colors = { stocks: 'var(--accent)', etfs: 'var(--blue)', gold: 'var(--yellow)' };
  const icons = { stocks: '📈', etfs: '📊', gold: '🥇' };
  function retClass(v) { return v >= 0 ? 'positive' : 'negative'; }
  function retFmt(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

  let html = `
    <div class="card" style="margin-bottom:1rem;">
      <p style="color:var(--text-muted);font-size:0.9rem;">Investing <strong style="color:var(--green);">$${perPeriodTotal}</strong> per ${frequency} · <strong>$${annualTotal.toLocaleString()}</strong>/year</p>
      <div class="allocation-bar">
        ${Object.entries(allocation).map(([k, v]) => `<div class="alloc-${k}" style="width:${v.percent}%">${v.percent}%</div>`).join('')}
      </div>
    </div>
    <div class="alloc-detail">
      ${Object.entries(allocation).map(([k, v]) => `
        <div class="alloc-item">
          <div class="asset-name">${icons[k]} ${k.charAt(0).toUpperCase() + k.slice(1)}</div>
          <div class="asset-pct" style="color:${colors[k]}">${v.percent}%</div>
          <div class="asset-amount">$${v.perPeriod} / ${frequency}</div>
        </div>
      `).join('')}
    </div>
    <div class="rec-card" style="margin-top:1.5rem;">
      <h3>📈 Recommended Stocks</h3>
      <div class="year-table-wrap"><table class="returns-table">
        <thead><tr><th>Symbol</th><th>Name</th><th>YTD</th><th>1Y</th><th>3Y</th><th>5Y</th><th>10Y</th><th>Why</th></tr></thead>
        <tbody>${recommendedStocks.map(s => `<tr>
          <td><strong>${s.symbol}</strong></td><td>${s.name}</td>
          <td class="${retClass(s.ytd)}">${retFmt(s.ytd)}</td><td class="${retClass(s.y1)}">${retFmt(s.y1)}</td>
          <td class="${retClass(s.y3)}">${retFmt(s.y3)}</td><td class="${retClass(s.y5)}">${retFmt(s.y5)}</td>
          <td class="${retClass(s.y10)}">${retFmt(s.y10)}</td><td class="reason-cell">${s.reason}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="rec-card">
      <h3>📊 Recommended ETFs & Gold</h3>
      <div class="year-table-wrap"><table class="returns-table">
        <thead><tr><th>Symbol</th><th>Name</th><th>YTD</th><th>1Y</th><th>3Y</th><th>5Y</th><th>10Y</th><th>Why</th></tr></thead>
        <tbody>${recommendedETFs.map(s => `<tr>
          <td><strong>${s.symbol}</strong></td><td>${s.name}</td>
          <td class="${retClass(s.ytd)}">${retFmt(s.ytd)}</td><td class="${retClass(s.y1)}">${retFmt(s.y1)}</td>
          <td class="${retClass(s.y3)}">${retFmt(s.y3)}</td><td class="${retClass(s.y5)}">${retFmt(s.y5)}</td>
          <td class="${retClass(s.y10)}">${retFmt(s.y10)}</td><td class="reason-cell">${s.reason}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  container.innerHTML = html;
  container.hidden = false;
}

// --- Watchlist ---
async function loadWatchlist() {
  const res = await fetch('/api/watchlist');
  renderWatchlist(await res.json());
}
function renderWatchlist(items) {
  const c = document.getElementById('watchlistItems');
  if (!items.length) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No items.</p>'; return; }
  c.innerHTML = items.map(i => `<div class="watchlist-tag"><span>${i.symbol}</span><span class="sector-badge">${i.sector}</span><span class="remove" onclick="removeFromWatchlist('${i.symbol}')">×</span></div>`).join('');
}
async function addToWatchlist() {
  const symbol = document.getElementById('watchlistSymbol').value.trim();
  const name = document.getElementById('watchlistName').value.trim();
  if (!symbol) return;
  const res = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, name, type: document.getElementById('watchlistType').value, sector: document.getElementById('watchlistSector').value }) });
  renderWatchlist(await res.json());
  document.getElementById('watchlistSymbol').value = '';
  document.getElementById('watchlistName').value = '';
}
async function removeFromWatchlist(symbol) {
  renderWatchlist(await (await fetch(`/api/watchlist/${symbol}`, { method: 'DELETE' })).json());
}

// --- Digest ---
async function loadDigest() {
  const digest = await (await fetch('/api/digest')).json();
  const container = document.getElementById('digestResults');
  const sectors = {};
  digest.watchlistUpdates.forEach(w => { const s = w.sector || 'other'; if (!sectors[s]) sectors[s] = []; sectors[s].push(w); });
  const sectorLabels = { 'big-tech': '🏢 Big Tech', 'semiconductor': '🔬 Semiconductors', 'software': '💻 Software', 'consumer': '🛍️ Consumer', 'quantum': '⚛️ Quantum', 'etf': '📊 ETFs', 'gold': '🥇 Gold', 'crypto': '₿ Crypto', 'other': '📌 Other' };

  let html = `<div class="digest-section"><h3>🌍 Macro News (${digest.macroNews.length})</h3>
    ${digest.macroNews.map(n => `<div class="news-item"><div class="news-title"><a href="${n.link}" target="_blank">${n.title}</a></div><div class="news-meta">${n.source} · <span class="sentiment-${n.sentiment}">${n.sentiment}</span></div></div>`).join('')}</div>`;
  html += `<div class="digest-section"><h3>📋 Watchlist (${digest.watchlistUpdates.length})</h3>`;
  for (const [sec, items] of Object.entries(sectors)) {
    html += `<div class="sector-group"><h4>${sectorLabels[sec] || sec}</h4>`;
    items.forEach(w => { const p = parseFloat(w.priceChange); html += `<div class="news-item"><div class="news-title"><strong>${w.symbol}</strong> ${w.name} <span style="color:${p >= 0 ? 'var(--green)' : 'var(--red)'}">${p >= 0 ? '+' : ''}${w.priceChange}%</span> <span style="color:var(--text-muted);font-size:0.78rem;">Vol: ${w.volume}</span></div><div class="news-meta">${w.keyNews} · Analyst: ${w.analystRating}</div></div>`; });
    html += `</div>`;
  }
  html += `</div>`;
  html += `<div class="digest-section"><h3>🧠 Investor Opinions (${digest.investorOpinions.length})</h3>
    ${digest.investorOpinions.map(o => `<div class="news-item"><div class="news-title"><strong>${o.investor}</strong></div><div style="color:var(--text-muted);font-size:0.88rem;margin-top:0.25rem;">${o.opinion}</div><div class="news-meta"><a href="${o.link}" target="_blank">${o.source}</a></div></div>`).join('')}</div>`;
  container.innerHTML = html;
  container.hidden = false;
}

// --- Opportunities ---
async function loadOpportunities() {
  const data = await (await fetch('/api/opportunities')).json();
  const container = document.getElementById('opportunitiesResults');
  container.innerHTML = data.opportunities.map(opp => `
    <div class="opp-card ${opp.inWatchlist ? 'in-watchlist' : ''}" id="opp-${opp.id}">
      <div class="opp-header">
        <div><div class="opp-symbol">${opp.symbol} ${opp.inWatchlist ? '<span class="opp-wl-badge">In Watchlist</span>' : ''}</div><div class="opp-name">${opp.name}</div></div>
        <div><div class="opp-upside">↑ ${opp.upside}</div><div class="opp-price-info">$${opp.currentPrice} → $${opp.fairValue}</div><div class="opp-price-info">Analyst: $${opp.analystTarget}</div></div>
      </div>
      <div class="opp-metrics">
        <div class="metric"><span>P/E:</span> <strong>${opp.peRatio > 0 ? opp.peRatio : 'N/A'}</strong></div>
        <div class="metric"><span>Div:</span> <strong>${opp.dividendYield}</strong></div>
        <div class="metric"><span>Rev Growth:</span> <strong style="color:${opp.revenueGrowth >= 0 ? 'var(--green)' : 'var(--red)'}">${opp.revenueGrowth >= 0 ? '+' : ''}${opp.revenueGrowth}%</strong></div>
        <div class="metric"><span>From Peak (${opp.peakDate}):</span> <strong style="color:var(--red)">${opp.fromPeak}</strong></div>
        <div class="metric"><span>YTD:</span> <strong style="color:${opp.ytdReturn >= 0 ? 'var(--green)' : 'var(--red)'}">${opp.ytdReturn >= 0 ? '+' : ''}${opp.ytdReturn}%</strong></div>
        <div class="metric"><span>1Y:</span> <strong style="color:${opp.y1Return >= 0 ? 'var(--green)' : 'var(--red)'}">${opp.y1Return >= 0 ? '+' : ''}${opp.y1Return}%</strong></div>
      </div>
      <div class="opp-reasons"><h4>Top Reasons to Invest</h4><ul>${opp.reasons.map(r => `<li>${r}</li>`).join('')}</ul></div>
      <div class="feedback-row">
        <div class="star-rating" id="stars-${opp.id}">${[1,2,3,4,5].map(i => `<button onclick="setRating('${opp.id}',${i})">★</button>`).join('')}</div>
        <input type="text" id="comment-${opp.id}" placeholder="Feedback...">
        <button class="btn-secondary" onclick="submitFeedback('${opp.id}')">Send</button>
      </div>
    </div>
  `).join('');
  container.hidden = false;
}

const ratings = {};
function setRating(id, r) { ratings[id] = r; document.querySelectorAll(`#stars-${id} button`).forEach((s, i) => s.classList.toggle('active', i < r)); }
async function submitFeedback(id) {
  await fetch(`/api/opportunities/${id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: ratings[id] || 0, comment: document.getElementById(`comment-${id}`).value }) });
  const btn = document.querySelector(`#opp-${id} .feedback-row .btn-secondary`);
  btn.textContent = '✓ Sent'; btn.style.borderColor = 'var(--green)'; btn.style.color = 'var(--green)';
  setTimeout(() => { btn.textContent = 'Send'; btn.style.borderColor = ''; btn.style.color = ''; }, 2000);
}

loadWatchlist();
loadRetirementData();
loadExpenses();

// --- Expense Analyzer ---
async function loadExpenses() {
  const expenses = await (await fetch('/api/expenses')).json();
  renderExpenseList(expenses);
}

function renderExpenseList(expenses) {
  const container = document.getElementById('expenseList');
  if (!expenses.length) { container.hidden = true; return; }

  const byCategory = {};
  let total = 0;
  expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; total += e.amount; });
  const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  let html = `
    <div class="rec-card">
      <h3>📊 Expense Summary — ${expenses.length} transactions · ${fmt(total)} total</h3>
      <div class="alloc-detail" style="margin-bottom:1rem;">
        ${cats.map(([cat, amt]) => `
          <div class="alloc-item">
            <div class="asset-name">${cat}</div>
            <div class="asset-pct" style="color:var(--accent)">${((amt/total)*100).toFixed(1)}%</div>
            <div class="asset-amount">${fmt(amt)}</div>
          </div>
        `).join('')}
      </div>
      <div class="year-table-wrap">
        <table class="year-table">
          <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Source</th><th></th></tr></thead>
          <tbody>
            ${expenses.slice().reverse().map(e => `
              <tr>
                <td>${e.date}</td><td>${e.description}</td>
                <td style="color:var(--red)">${fmt(e.amount)}</td>
                <td><span class="rec-badge caution">${e.category}</span></td>
                <td style="color:var(--text-muted)">${e.source}</td>
                <td><span class="remove" onclick="deleteExpense('${e.id}')" style="cursor:pointer;color:var(--red);">×</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  container.innerHTML = html;
  container.hidden = false;
}

async function addManualExpense() {
  const date = document.getElementById('manualDate').value || new Date().toISOString().split('T')[0];
  const description = document.getElementById('manualDesc').value.trim();
  const amount = +document.getElementById('manualAmount').value;
  const category = document.getElementById('manualCategory').value;
  const source = document.getElementById('manualSource').value;

  if (!description || !amount) return;

  await fetch('/api/expenses/add', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, description, amount, category, source })
  });
  document.getElementById('manualDesc').value = '';
  document.getElementById('manualAmount').value = '';
  loadExpenses();
}

async function deleteExpense(id) {
  await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
  loadExpenses();
}

async function uploadExpenseFile() {
  const fileInput = document.getElementById('expenseFile');
  const status = document.getElementById('uploadStatus');
  if (!fileInput.files.length) { status.textContent = 'Please select a file.'; return; }

  status.textContent = '⏳ Uploading and analyzing...';
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch('/api/expenses/upload', { method: 'POST', body: formData });
    const result = await res.json();

    if (result.success) {
      status.innerHTML = `✅ Added ${result.transactionsAdded} transactions from <strong>${result.fileName}</strong>`;
      status.style.color = 'var(--green)';
      loadExpenses();

      // Show upload summary if available
      if (result.summary) {
        const container = document.getElementById('analysisResults');
        let html = `<div class="rec-card"><h3>📄 Upload Summary — ${result.fileName}</h3>`;
        html += `<p style="color:var(--text-muted);">Total: ${fmt(result.summary.totalSpend)} · Top category: ${result.summary.topCategory}</p>`;
        if (result.summary.suggestions) {
          html += `<div class="opp-reasons"><h4>💡 Suggestions</h4><ul>${result.summary.suggestions.map(s => `<li>${s}</li>`).join('')}</ul></div>`;
        }
        if (result.note) html += `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.5rem;">${result.note}</p>`;
        html += `</div>`;
        container.innerHTML = html;
        container.hidden = false;
      }
    } else {
      status.textContent = '❌ ' + (result.error || 'Upload failed');
      status.style.color = 'var(--red)';
    }
  } catch (err) {
    status.textContent = '❌ Error: ' + err.message;
    status.style.color = 'var(--red)';
  }
}

async function analyzeExpenses() {
  const container = document.getElementById('analysisResults');
  container.innerHTML = '<div class="rec-card"><p>⏳ Running AI analysis...</p></div>';
  container.hidden = false;

  try {
    const res = await fetch('/api/expenses/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();

    if (data.error) { container.innerHTML = `<div class="rec-card"><p style="color:var(--red);">${data.error}</p></div>`; return; }

    let html = `
      <div class="rec-card">
        <h3>🤖 AI Spending Analysis</h3>
        <p style="color:var(--text-muted);margin-bottom:1rem;">${data.transactionCount} transactions · ${fmt(data.total)} total</p>`;

    if (data.analysis) {
      const a = data.analysis;
      if (a.overallAssessment) html += `<p style="margin-bottom:1rem;">${a.overallAssessment}</p>`;

      if (a.suggestions && a.suggestions.length) {
        html += `<div class="opp-reasons"><h4>💡 Cost-Saving Suggestions</h4><ul>`;
        a.suggestions.forEach(s => {
          html += `<li><strong>${s.category}:</strong> ${s.suggestion}`;
          if (s.potentialSavings) html += ` <span style="color:var(--green);">(save ${s.potentialSavings})</span>`;
          html += `</li>`;
        });
        html += `</ul></div>`;
      }

      if (a.alerts && a.alerts.length) {
        html += `<div style="margin-top:1rem;padding:0.75rem;background:rgba(248,113,113,0.1);border-radius:8px;">`;
        html += `<strong style="color:var(--red);">⚠️ Alerts</strong><ul style="margin-top:0.5rem;">`;
        a.alerts.forEach(al => html += `<li style="color:var(--text-muted);font-size:0.88rem;">${al}</li>`);
        html += `</ul></div>`;
      }

      if (a.monthlyBudgetRecommendation) {
        html += `<div style="margin-top:1rem;"><h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">Recommended Monthly Budget</h4>`;
        html += `<div class="alloc-detail">`;
        Object.entries(a.monthlyBudgetRecommendation).forEach(([cat, amt]) => {
          html += `<div class="alloc-item"><div class="asset-name">${cat}</div><div class="asset-amount">${fmt(amt)}/mo</div></div>`;
        });
        html += `</div></div>`;
      }
    }

    // Category breakdown
    html += `<div style="margin-top:1.5rem;"><h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">Spending by Category</h4>`;
    html += `<div class="alloc-detail">`;
    data.categoryBreakdown.forEach(c => {
      html += `<div class="alloc-item"><div class="asset-name">${c.category}</div><div class="asset-pct" style="color:var(--accent)">${c.percent}</div><div class="asset-amount">${fmt(c.amount)}</div></div>`;
    });
    html += `</div></div>`;

    if (data.note) html += `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:1rem;">${data.note}</p>`;
    html += `</div>`;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div class="rec-card"><p style="color:var(--red);">Error: ${err.message}</p></div>`;
  }
}
