const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const userData = { feedback: [] };

function getWatchlist() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'watchlist.json'), 'utf8'));
  return data.watchlist;
}

// --- Retirement Planning API (Two People) ---

app.post('/api/retirement/calculate', (req, res) => {
  const {
    age, retirementAge, filingStatus,
    currentSavingsP1, currentSavingsP2,
    employerMatchP1, employerMatchLimitP1,
    employerMatchP2, employerMatchLimitP2,
    salaryScheduleP1, salaryScheduleP2,
    expenses, lowIncomeYears,
    returnRate
  } = req.body;

  const schedP1 = (salaryScheduleP1 || []).sort((a, b) => a.fromAge - b.fromAge);
  const schedP2 = (salaryScheduleP2 || []).sort((a, b) => a.fromAge - b.fromAge);
  const lowYears = lowIncomeYears || [];
  const exp = expenses || {};
  const annualReturn = (Number(returnRate) || 7) / 100;

  const emP1 = Number(employerMatchP1) || 0;
  const emlP1 = Number(employerMatchLimitP1) || 0;
  const emP2 = Number(employerMatchP2) || 0;
  const emlP2 = Number(employerMatchLimitP2) || 0;

  const totalAnnualExpenses = Object.values(exp).reduce((s, v) => s + (Number(v) || 0), 0);

  const yearlyPlan = [];
  let cumP1 = Number(currentSavingsP1) || 0;
  let cumP2 = Number(currentSavingsP2) || 0;

  for (let y = age; y < retirementAge; y++) {
    const isOver50 = y >= 45;
    const preTax401kLimit = isOver50 ? 30500 : 23500;
    const totalAnnual401kLimit = 70000;
    const iraLimit = isOver50 ? 8000 : 7000;

    // Check if this is a low-income/startup year
    const lowYear = lowYears.find(l => y >= l.fromAge && y <= l.toAge);

    // --- Person 1: has pre-tax + after-tax 401K + IRA ---
    let salaryP1 = 0;
    if (lowYear) {
      salaryP1 = lowYear.salaryP1 != null ? lowYear.salaryP1 : 0;
    } else {
      for (let i = schedP1.length - 1; i >= 0; i--) {
        if (y >= schedP1[i].fromAge) { salaryP1 = schedP1[i].salary; break; }
      }
    }
    const bracketsP1 = getFederalBrackets(filingStatus);
    const margRateP1 = getMarginalRate(salaryP1, bracketsP1);

    const p1PreTax = Math.min(preTax401kLimit, salaryP1 > 0 ? salaryP1 * 0.15 : 0);
    // No employer match during startup years for P1
    const p1Match = lowYear ? 0 : Math.min(salaryP1 * (emP1 / 100), salaryP1 * (emlP1 / 100));
    const p1AfterTaxSpace = Math.max(0, totalAnnual401kLimit - p1PreTax - p1Match);
    const p1AfterTaxRoth = margRateP1 < 0.32;
    const p1IraRoth = margRateP1 <= 0.24;
    const p1TotalContrib = p1PreTax + p1AfterTaxSpace + iraLimit;

    cumP1 = (cumP1 + p1TotalContrib + p1Match) * (1 + annualReturn);

    // --- Person 2: has pre-tax 401K + IRA only (no after-tax 401K) ---
    let salaryP2 = 0;
    if (lowYear) {
      salaryP2 = lowYear.salaryP2 != null ? lowYear.salaryP2 : 0;
    } else {
      for (let i = schedP2.length - 1; i >= 0; i--) {
        if (y >= schedP2[i].fromAge) { salaryP2 = schedP2[i].salary; break; }
      }
    }
    const bracketsP2 = getFederalBrackets(filingStatus);
    const margRateP2 = getMarginalRate(salaryP2, bracketsP2);

    const p2PreTax = Math.min(preTax401kLimit, salaryP2 > 0 ? salaryP2 * 0.15 : 0);
    const p2Match = Math.min(salaryP2 * (emP2 / 100), salaryP2 * (emlP2 / 100));
    const p2IraRoth = margRateP2 <= 0.24;
    const p2TotalContrib = p2PreTax + iraLimit;

    cumP2 = (cumP2 + p2TotalContrib + p2Match) * (1 + annualReturn);

    // Combined
    const combinedSalary = salaryP1 + salaryP2;
    const combinedRetirement = p1TotalContrib + p1Match + p2TotalContrib + p2Match;
    const effectiveRate = getEffectiveRate(combinedSalary, getFederalBrackets(filingStatus));
    const afterTaxIncome = combinedSalary - (combinedSalary * effectiveRate) - totalAnnualExpenses;
    const investableOutside = Math.max(0, afterTaxIncome - (p1TotalContrib + p2TotalContrib));

    yearlyPlan.push({
      age: y,
      isLowIncomeYear: !!lowYear,
      // Person 1
      salaryP1, margRateP1: (margRateP1 * 100).toFixed(1) + '%',
      p1PreTax: Math.round(p1PreTax),
      p1AfterTax: Math.round(p1AfterTaxSpace),
      p1AfterTaxRoth: p1AfterTaxRoth,
      p1Ira: iraLimit, p1IraRoth: p1IraRoth,
      p1Match: Math.round(p1Match),
      p1Total: Math.round(p1TotalContrib + p1Match),
      p1Cumulative: Math.round(cumP1),
      // Person 2
      salaryP2, margRateP2: (margRateP2 * 100).toFixed(1) + '%',
      p2PreTax: Math.round(p2PreTax),
      p2Ira: iraLimit, p2IraRoth: p2IraRoth,
      p2Match: Math.round(p2Match),
      p2Total: Math.round(p2TotalContrib + p2Match),
      p2Cumulative: Math.round(cumP2),
      // Combined
      combinedSalary, combinedRetirement: Math.round(combinedRetirement),
      combinedCumulative: Math.round(cumP1 + cumP2),
      totalExpenses: Math.round(totalAnnualExpenses),
      investableOutside: Math.round(investableOutside)
    });
  }

  const finalSavings = cumP1 + cumP2;
  const monthlyRetirement = (finalSavings * 0.04) / 12;

  res.json({
    summary: {
      yearsToRetirement: retirementAge - age,
      projectedSavingsP1: Math.round(cumP1),
      projectedSavingsP2: Math.round(cumP2),
      projectedSavingsTotal: Math.round(finalSavings),
      monthlyRetirementIncome: Math.round(monthlyRetirement),
      totalAnnualExpenses: Math.round(totalAnnualExpenses),
      annualReturnRate: (annualReturn * 100).toFixed(1) + '%'
    },
    yearlyPlan
  });
});

// --- Investment Allocation API ---

app.post('/api/investment/allocation', (req, res) => {
  const { age, riskTolerance, investmentAmount, investmentFrequency } = req.body;

  const stockPct = Math.max(30, Math.min(85, 110 - age - (riskTolerance === 'conservative' ? 20 : riskTolerance === 'aggressive' ? -10 : 0)));
  const etfPct = Math.max(10, 100 - stockPct - 5);
  const goldPct = 5;

  const freqMap = { daily: 252, weekly: 52, biweekly: 26, monthly: 12 };
  const periods = freqMap[investmentFrequency] || 12;
  const perPeriod = investmentAmount / periods;

  const recommendedStocks = [
    { symbol: 'AAPL', name: 'Apple', ytd: 8.2, y1: 22.5, y3: 12.1, y5: 28.4, y10: 24.6, reason: 'Services revenue growing 15% YoY, strong buyback program' },
    { symbol: 'MSFT', name: 'Microsoft', ytd: 12.1, y1: 18.3, y3: 14.7, y5: 26.8, y10: 27.2, reason: 'Azure cloud + AI integration driving enterprise adoption' },
    { symbol: 'NVDA', name: 'NVIDIA', ytd: 45.3, y1: 120.5, y3: 68.2, y5: 72.1, y10: 55.8, reason: 'AI infrastructure leader, data center revenue surging' },
    { symbol: 'GOOGL', name: 'Alphabet', ytd: 6.8, y1: 15.2, y3: 10.5, y5: 22.1, y10: 19.8, reason: 'Search + Cloud + YouTube ads resilient, AI Gemini rollout' },
    { symbol: 'AMZN', name: 'Amazon', ytd: 10.5, y1: 25.8, y3: 8.2, y5: 18.6, y10: 22.4, reason: 'AWS margins expanding, retail profitability improving' },
    { symbol: 'TSLA', name: 'Tesla', ytd: -5.2, y1: 8.4, y3: -2.1, y5: 45.2, y10: 38.5, reason: 'Energy storage + FSD optionality, but near-term margin pressure' },
    { symbol: 'META', name: 'Meta Platforms', ytd: 14.2, y1: 35.6, y3: 22.8, y5: 18.9, y10: 16.2, reason: 'Reels monetization + Reality Labs long-term bet' },
    { symbol: 'COST', name: 'Costco', ytd: 9.1, y1: 28.4, y3: 18.2, y5: 22.6, y10: 17.8, reason: 'Membership model provides recurring revenue, consistent comps growth' },
    { symbol: 'AVGO', name: 'Broadcom', ytd: 18.7, y1: 65.2, y3: 35.4, y5: 38.1, y10: 32.5, reason: 'AI networking chips + VMware acquisition synergies' },
    { symbol: 'CRM', name: 'Salesforce', ytd: 5.4, y1: 12.8, y3: 8.6, y5: 14.2, y10: 16.8, reason: 'AI-powered CRM leader, improving margins and cash flow' }
  ];

  const recommendedETFs = [
    { symbol: 'VOO', name: 'Vanguard S&P 500', ytd: 9.8, y1: 18.2, y3: 10.5, y5: 14.8, y10: 12.6, reason: 'Core US large-cap exposure, ultra-low 0.03% expense ratio' },
    { symbol: 'QQQ', name: 'Invesco Nasdaq 100', ytd: 14.2, y1: 25.6, y3: 12.8, y5: 19.2, y10: 17.8, reason: 'Tech-heavy growth exposure, top holdings are AI leaders' },
    { symbol: 'VTI', name: 'Vanguard Total Market', ytd: 8.5, y1: 16.8, y3: 9.8, y5: 13.6, y10: 11.9, reason: 'Broadest US market exposure including small/mid caps' },
    { symbol: 'SCHD', name: 'Schwab Dividend Equity', ytd: 4.2, y1: 8.5, y3: 6.2, y5: 10.8, y10: 11.2, reason: 'Quality dividend stocks, lower volatility, 3.5% yield' },
    { symbol: 'VGT', name: 'Vanguard Info Tech', ytd: 15.8, y1: 28.4, y3: 14.2, y5: 22.5, y10: 20.1, reason: 'Pure tech sector play with low expense ratio' },
    { symbol: 'GLD', name: 'SPDR Gold Shares', ytd: 12.5, y1: 18.2, y3: 8.4, y5: 10.2, y10: 7.8, reason: 'Inflation hedge, central bank buying at record levels' }
  ];

  res.json({
    allocation: {
      stocks: { percent: stockPct, perPeriod: Math.round(perPeriod * stockPct / 100) },
      etfs: { percent: etfPct, perPeriod: Math.round(perPeriod * etfPct / 100) },
      gold: { percent: goldPct, perPeriod: Math.round(perPeriod * goldPct / 100) }
    },
    frequency: investmentFrequency,
    annualTotal: investmentAmount,
    perPeriodTotal: Math.round(perPeriod),
    recommendedStocks,
    recommendedETFs
  });
});

// --- Investable Cash Projection ---

app.post('/api/investable/project', (req, res) => {
  const { yearlyPlan, etfPercent, savingsPercent, etfReturn, savingsReturn, retirementAge } = req.body;

  const etfRate = (etfReturn || 10) / 100;
  const savRate = (savingsReturn || 4.5) / 100;
  const etfPct = (etfPercent || 70) / 100;
  const savPct = (savingsPercent || 30) / 100;

  let cumETF = 0;
  let cumSavings = 0;
  const projection = [];

  for (const y of yearlyPlan) {
    const investable = y.investableOutside;
    const toETF = investable * etfPct;
    const toSavings = investable * savPct;

    cumETF = (cumETF + toETF) * (1 + etfRate);
    cumSavings = (cumSavings + toSavings) * (1 + savRate);

    projection.push({
      age: y.age,
      investable,
      toETF: Math.round(toETF),
      toSavings: Math.round(toSavings),
      cumETF: Math.round(cumETF),
      cumSavings: Math.round(cumSavings),
      cumTotal: Math.round(cumETF + cumSavings)
    });
  }

  res.json({
    summary: {
      totalETF: Math.round(cumETF),
      totalSavings: Math.round(cumSavings),
      grandTotal: Math.round(cumETF + cumSavings),
      etfReturn: (etfRate * 100).toFixed(1) + '%',
      savingsReturn: (savRate * 100).toFixed(1) + '%',
      etfPercent: Math.round(etfPct * 100),
      savingsPercent: Math.round(savPct * 100)
    },
    projection
  });
});

// --- Watchlist API ---

app.get('/api/watchlist', (req, res) => { res.json(getWatchlist()); });

app.post('/api/watchlist', (req, res) => {
  const { symbol, name, type, sector } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });
  const filePath = path.join(__dirname, 'public', 'watchlist.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!data.watchlist.find(w => w.symbol === symbol.toUpperCase())) {
    data.watchlist.push({ symbol: symbol.toUpperCase(), name: name || symbol, type: type || 'stock', sector: sector || 'other' });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
  res.json(data.watchlist);
});

app.delete('/api/watchlist/:symbol', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'watchlist.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.watchlist = data.watchlist.filter(w => w.symbol !== req.params.symbol.toUpperCase());
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json(data.watchlist);
});

// --- Daily Digest ---
app.get('/api/digest', (req, res) => {
  res.json(generateDailyDigest(getWatchlist()));
});

// --- Value Opportunities ---
app.get('/api/opportunities', (req, res) => {
  res.json(generateValueOpportunities(getWatchlist()));
});

app.post('/api/opportunities/:id/feedback', (req, res) => {
  const { rating, comment } = req.body;
  userData.feedback.push({ opportunityId: req.params.id, rating, comment, timestamp: new Date().toISOString() });
  res.json({ success: true });
});

// --- Helpers ---

function getFederalBrackets(status) {
  if (status === 'married') {
    return [
      { min: 0, max: 23200, rate: 0.10 }, { min: 23200, max: 94300, rate: 0.12 },
      { min: 94300, max: 201050, rate: 0.22 }, { min: 201050, max: 383900, rate: 0.24 },
      { min: 383900, max: 487450, rate: 0.32 }, { min: 487450, max: 731200, rate: 0.35 },
      { min: 731200, max: Infinity, rate: 0.37 }
    ];
  }
  return [
    { min: 0, max: 11600, rate: 0.10 }, { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 }, { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 }, { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 }
  ];
}

function getMarginalRate(income, brackets) {
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (income > brackets[i].min) return brackets[i].rate;
  }
  return 0.10;
}

function getEffectiveRate(income, brackets) {
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    tax += (Math.min(income, b.max) - b.min) * b.rate;
  }
  return income > 0 ? tax / income : 0;
}

function generateDailyDigest(watchlist) {
  const macroNews = [
    { title: 'Fed signals potential rate hold through Q3 2026 amid cooling inflation', source: 'Reuters', link: 'https://www.reuters.com/markets/', sentiment: 'neutral' },
    { title: 'US GDP growth revised up to 2.8% for Q1 2026, beating expectations', source: 'Bloomberg', link: 'https://www.bloomberg.com/markets', sentiment: 'positive' },
    { title: 'Treasury yields dip to 4.1% as inflation expectations ease', source: 'WSJ', link: 'https://www.wsj.com/economy', sentiment: 'positive' },
    { title: 'China stimulus package boosts global commodity prices', source: 'Financial Times', link: 'https://www.ft.com/markets', sentiment: 'positive' },
    { title: 'European Central Bank cuts rates by 25bps, signals more easing', source: 'Reuters', link: 'https://www.reuters.com/business/', sentiment: 'positive' },
    { title: 'US unemployment holds steady at 3.8%, labor market resilient', source: 'CNBC', link: 'https://www.cnbc.com/economy/', sentiment: 'positive' },
    { title: 'Oil prices drop 3% on increased OPEC+ production outlook', source: 'Bloomberg', link: 'https://www.bloomberg.com/energy', sentiment: 'negative' },
    { title: 'US housing starts fall 5% as mortgage rates remain elevated', source: 'WSJ', link: 'https://www.wsj.com/real-estate', sentiment: 'negative' },
    { title: 'AI infrastructure spending projected to reach $500B globally in 2026', source: 'Goldman Sachs', link: 'https://www.goldmansachs.com/insights/', sentiment: 'positive' },
    { title: 'US consumer confidence index rises to 108.5, highest in 2 years', source: 'Conference Board', link: 'https://www.conference-board.org/', sentiment: 'positive' },
    { title: 'Bitcoin surpasses $95,000 as institutional adoption accelerates', source: 'CoinDesk', link: 'https://www.coindesk.com/', sentiment: 'positive' },
    { title: 'Global semiconductor sales hit record $680B in trailing 12 months', source: 'SIA', link: 'https://www.semiconductors.org/', sentiment: 'positive' },
    { title: 'US trade deficit widens to $78B amid strong import demand', source: 'Reuters', link: 'https://www.reuters.com/markets/', sentiment: 'negative' },
    { title: 'Corporate earnings season: 78% of S&P 500 companies beat estimates', source: 'FactSet', link: 'https://www.factset.com/', sentiment: 'positive' },
    { title: 'Japan raises interest rates for first time in 18 months', source: 'Nikkei', link: 'https://asia.nikkei.com/', sentiment: 'neutral' },
    { title: 'US manufacturing PMI expands to 52.4, signaling recovery', source: 'ISM', link: 'https://www.ismworld.org/', sentiment: 'positive' },
    { title: 'Gold hits new all-time high above $2,800/oz on geopolitical tensions', source: 'Kitco', link: 'https://www.kitco.com/', sentiment: 'positive' },
    { title: 'Student loan payment restart impacts consumer spending patterns', source: 'CNBC', link: 'https://www.cnbc.com/personal-finance/', sentiment: 'negative' },
    { title: 'Quantum computing stocks surge on Google breakthrough announcement', source: 'TechCrunch', link: 'https://techcrunch.com/', sentiment: 'positive' },
    { title: 'US national debt surpasses $37 trillion, CBO warns of fiscal risks', source: 'CBO', link: 'https://www.cbo.gov/', sentiment: 'negative' }
  ];

  const watchlistUpdates = watchlist.map(item => ({
    symbol: item.symbol, name: item.name, sector: item.sector,
    priceChange: (Math.random() * 8 - 3).toFixed(2),
    volume: (Math.random() * 50 + 5).toFixed(1) + 'M',
    keyNews: getNewsForSymbol(item.symbol),
    analystRating: ['Strong Buy', 'Buy', 'Hold', 'Outperform'][Math.floor(Math.random() * 4)]
  }));

  const investorOpinions = [
    { investor: 'Warren Buffett', opinion: 'Maintains record $325B cash position at Berkshire, signaling patience for better valuations. Continues trimming Apple stake.', source: 'Berkshire Hathaway Q1 2026 Filing', link: 'https://www.berkshirehathaway.com/' },
    { investor: 'Cathie Wood', opinion: 'Doubling down on AI, genomics, and autonomous tech. Believes TSLA will reach $2,600 by 2029 on robotaxi revenue.', source: 'ARK Invest Big Ideas 2026', link: 'https://ark-invest.com/big-ideas-2026' },
    { investor: 'Ray Dalio', opinion: 'Warns of "great wealth transfer" and recommends 15% gold allocation. Sees US-China tensions as primary market risk.', source: 'Bridgewater Daily Observations', link: 'https://www.bridgewater.com/' },
    { investor: 'Howard Marks', opinion: 'Current market reminds him of late 1990s — not a bubble yet, but "priced for perfection." Favors credit over equities.', source: 'Oaktree Capital Memo', link: 'https://www.oaktreecapital.com/insights' },
    { investor: 'Stanley Druckenmiller', opinion: 'Bullish on AI infrastructure plays, particularly NVDA and AVGO. Reduced exposure to consumer discretionary.', source: 'Duquesne Family Office 13F', link: 'https://www.sec.gov/cgi-bin/browse-edgar' }
  ];

  return { date: new Date().toISOString().split('T')[0], macroNews, watchlistUpdates, investorOpinions };
}

function getNewsForSymbol(symbol) {
  const newsMap = {
    'AAPL': 'Apple Vision Pro 2 launch drives services revenue to new record',
    'MSFT': 'Microsoft Copilot reaches 100M enterprise users, Azure AI revenue up 45%',
    'GOOGL': 'Google Gemini 3.0 launch boosts Cloud division growth to 32%',
    'AMZN': 'AWS launches next-gen Graviton chips, margins expand to 38%',
    'META': 'Meta AI assistant reaches 1B monthly users, Reels ad revenue surges',
    'NVDA': 'NVIDIA Blackwell Ultra ships to hyperscalers, data center revenue up 80%',
    'TSM': 'TSMC Arizona fab begins 3nm production, US revenue share grows to 15%',
    'AMD': 'AMD MI400 AI accelerator gains traction with cloud providers',
    'AVGO': 'Broadcom VMware integration ahead of schedule, raises guidance',
    'INTC': 'Intel 18A process node on track, secures $8B CHIPS Act funding',
    'QCOM': 'Qualcomm Snapdragon X Elite dominates AI PC market with 45% share',
    'ARM': 'Arm-based servers reach 25% cloud market share, royalty revenue surges',
    'CRM': 'Salesforce Einstein AI drives 20% increase in deal sizes',
    'ADBE': 'Adobe Firefly generates 10B images, Creative Cloud retention at all-time high',
    'NOW': 'ServiceNow AI agents automate 40% of IT workflows for enterprise clients',
    'SNOW': 'Snowflake product revenue accelerates to 35% growth on AI workloads',
    'PLTR': 'Palantir AIP platform wins $500M defense contract, commercial revenue up 50%',
    'SHOP': 'Shopify checkout processes $300B GMV, merchant solutions margin improves',
    'NFLX': 'Netflix ad tier reaches 80M subscribers, live sports driving engagement',
    'DIS': 'Disney streaming turns profitable, parks revenue hits record $10B quarter',
    'TSLA': 'Tesla FSD v13 approved in EU, energy storage deployments up 100% YoY',
    'NKE': 'Nike Direct sales recover with new product innovation cycle',
    'SBUX': 'Starbucks China recovery accelerates, same-store sales up 8%',
    'COST': 'Costco membership renewal rate hits 93.5%, e-commerce grows 22%',
    'PG': 'P&G pricing power holds, organic sales growth at 5% despite volume pressure',
    'KO': 'Coca-Cola zero-sugar portfolio drives 7% organic revenue growth',
    'IONQ': 'IonQ achieves 35 algorithmic qubits, signs deal with major pharma company',
    'RGTI': 'Rigetti 84-qubit Ankaa-3 system shows 99.5% two-qubit gate fidelity',
    'QBTS': 'D-Wave quantum optimization solves logistics problem 1000x faster than classical',
    'VOO': 'S&P 500 up 12% YTD, driven by AI and earnings growth',
    'QQQ': 'Nasdaq 100 outperforms on tech strength, up 16% YTD',
    'VTI': 'Broad market rally lifts small caps, total market up 10% YTD',
    'SCHD': 'Dividend stocks see renewed interest as rates stabilize',
    'VGT': 'Tech sector ETF benefits from AI capex cycle',
    'ARKK': 'ARK Innovation rebounds 25% YTD on TSLA and PLTR gains',
    'SPY': 'S&P 500 ETF inflows hit record $50B in Q1',
    'GLD': 'Gold ETF holdings rise as central banks continue buying',
    'IAU': 'Gold trust sees inflows amid geopolitical uncertainty',
    'BTC-USD': 'Bitcoin ETF inflows surpass $80B cumulative, institutional adoption grows'
  };
  return newsMap[symbol] || `${symbol} trading near 52-week levels with moderate volume`;
}

function generateValueOpportunities(watchlist) {
  const allOpportunities = [
    { id: 'opp-intc', symbol: 'INTC', name: 'Intel Corporation', currentPrice: 28.50, fairValue: 42.00, peakPrice: 68.50, peakDate: 'Apr 2021', revenueGrowth: -8.2, ytdReturn: -12.5, y1Return: -18.2, analystTarget: 38.00, dividendYield: '1.4%', peRatio: 22.5,
      reasons: ['18A process node showing promising yields, could recapture foundry market share', 'CHIPS Act $8B+ funding provides significant downside protection', 'AI PC cycle could drive client computing revenue recovery', 'Gaudi 3 AI accelerator gaining enterprise traction at lower price points', 'Massive cost restructuring targeting $10B in savings by 2027'] },
    { id: 'opp-dis', symbol: 'DIS', name: 'Walt Disney', currentPrice: 98.50, fairValue: 135.00, peakPrice: 201.90, peakDate: 'Mar 2021', revenueGrowth: 4.5, ytdReturn: 5.2, y1Return: -2.8, analystTarget: 125.00, dividendYield: '0.9%', peRatio: 18.2,
      reasons: ['Streaming now profitable — combined Disney+/Hulu margins turning positive', 'Parks & Experiences generating record revenue with pricing power', 'ESPN flagship streaming launch creates new growth vector', 'Content library is unmatched moat (Marvel, Star Wars, Pixar, Disney)', 'Trading at 50% below all-time high despite improving fundamentals'] },
    { id: 'opp-nke', symbol: 'NKE', name: 'Nike', currentPrice: 72.80, fairValue: 105.00, peakPrice: 179.10, peakDate: 'Nov 2021', revenueGrowth: -2.1, ytdReturn: -8.5, y1Return: -22.4, analystTarget: 95.00, dividendYield: '1.8%', peRatio: 24.5,
      reasons: ['New CEO driving product innovation reset and DTC channel optimization', 'Brand strength remains #1 globally in athletic footwear', 'China recovery provides significant upside as consumer spending rebounds', 'Inventory levels normalizing after 2 years of destocking', 'Dividend aristocrat with 22 consecutive years of increases'] },
    { id: 'opp-adbe', symbol: 'ADBE', name: 'Adobe', currentPrice: 420.00, fairValue: 560.00, peakPrice: 699.50, peakDate: 'Nov 2021', revenueGrowth: 11.2, ytdReturn: -5.8, y1Return: 2.4, analystTarget: 520.00, dividendYield: '0%', peRatio: 28.5,
      reasons: ['Firefly AI integration driving Creative Cloud upsells and retention', 'Digital Experience segment growing 12%+ with enterprise AI features', 'Net revenue retention rate above 110% shows strong customer lock-in', '40% below ATH despite consistent double-digit revenue growth', 'Free cash flow margins above 35% fund continued AI R&D investment'] },
    { id: 'opp-snow', symbol: 'SNOW', name: 'Snowflake', currentPrice: 165.00, fairValue: 220.00, peakPrice: 405.00, peakDate: 'Nov 2021', revenueGrowth: 28.5, ytdReturn: 8.2, y1Return: 15.6, analystTarget: 200.00, dividendYield: '0%', peRatio: -1,
      reasons: ['Product revenue reaccelerating to 35%+ growth on AI/ML workloads', 'Cortex AI features driving larger deal sizes and consumption', 'Net revenue retention rate of 127% shows strong expansion', 'Data sharing network effects create competitive moat', 'New CEO bringing enterprise sales discipline and margin focus'] },
    { id: 'opp-googl', symbol: 'GOOGL', name: 'Alphabet', currentPrice: 168.00, fairValue: 210.00, peakPrice: 191.75, peakDate: 'Feb 2025', revenueGrowth: 14.8, ytdReturn: 6.8, y1Return: 15.2, analystTarget: 200.00, dividendYield: '0.5%', peRatio: 22.1,
      reasons: ['Search + AI integration maintaining 90%+ market share despite competition', 'Google Cloud growing 28% with AI workloads as key driver', 'YouTube ad revenue approaching $50B annual run rate', 'Waymo autonomous driving reaching commercial scale in 5+ cities', 'Initiated dividend and $70B buyback signals capital return commitment'] },
    { id: 'opp-amzn', symbol: 'AMZN', name: 'Amazon', currentPrice: 192.00, fairValue: 240.00, peakPrice: 201.20, peakDate: 'Feb 2025', revenueGrowth: 12.5, ytdReturn: 10.5, y1Return: 25.8, analystTarget: 230.00, dividendYield: '0%', peRatio: 35.2,
      reasons: ['AWS margins expanding to 38% as AI services drive higher-value workloads', 'Retail profitability transformation — North America margins at record levels', 'Advertising business growing 25%+ becoming major profit center', 'Project Kuiper satellite internet launch creates new TAM', 'Same-day/next-day delivery network is an unassailable competitive moat'] },
    { id: 'opp-crm', symbol: 'CRM', name: 'Salesforce', currentPrice: 265.00, fairValue: 340.00, peakPrice: 311.50, peakDate: 'Feb 2024', revenueGrowth: 9.2, ytdReturn: 5.4, y1Return: 12.8, analystTarget: 310.00, dividendYield: '0.6%', peRatio: 30.5,
      reasons: ['Einstein AI Copilot driving 20% increase in average deal sizes', 'Operating margins expanding to 33%+ under disciplined cost management', 'Data Cloud + MuleSoft integration creates enterprise data platform moat', 'Initiated dividend and buyback program signals cash flow confidence', 'Agentforce platform positions CRM at center of enterprise AI adoption'] }
  ];

  const watchlistSymbols = new Set(watchlist.map(w => w.symbol));
  const sorted = allOpportunities.sort((a, b) => {
    const aIn = watchlistSymbols.has(a.symbol) ? 0 : 1;
    const bIn = watchlistSymbols.has(b.symbol) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return ((b.fairValue - b.currentPrice) / b.currentPrice) - ((a.fairValue - a.currentPrice) / a.currentPrice);
  });

  return {
    generatedAt: new Date().toISOString(),
    opportunities: sorted.map(o => ({
      ...o,
      upside: ((o.fairValue - o.currentPrice) / o.currentPrice * 100).toFixed(1) + '%',
      fromPeak: (((o.currentPrice - o.peakPrice) / o.peakPrice) * 100).toFixed(1) + '%',
      inWatchlist: watchlistSymbols.has(o.symbol)
    }))
  };
}

app.listen(PORT, () => {
  console.log(`Financial Advisor running at http://localhost:${PORT}`);
});
