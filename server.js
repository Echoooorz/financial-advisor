const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload config
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Bedrock client (uses default AWS credentials)
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

const userData = { feedback: [], expenses: [] };

function getWatchlist() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'watchlist.json'), 'utf8')).watchlist;
}

// --- Retirement Planning API (Two People) ---

app.post('/api/retirement/calculate', (req, res) => {
  const {
    age, retirementAge, filingStatus,
    currentSavingsP1, currentSavingsP2,
    employerMatchP1, employerMatchLimitP1,
    employerMatchP2, employerMatchLimitP2,
    salaryScheduleP1, salaryScheduleP2,
    expenses, lowIncomeYears, returnRate
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

  // Expenses are now MONTHLY — multiply by 12 for annual
  const totalAnnualExpenses = Object.values(exp).reduce((s, v) => s + (Number(v) || 0), 0) * 12;

  const yearlyPlan = [];
  let cumP1 = Number(currentSavingsP1) || 0;
  let cumP2 = Number(currentSavingsP2) || 0;

  for (let y = age; y < retirementAge; y++) {
    const isOver50 = y >= 50;
    const preTax401kLimit = isOver50 ? 30500 : 23500;
    const totalAnnual401kLimit = 70000;
    const iraLimit = isOver50 ? 8000 : 7000;

    const lowYear = lowYears.find(l => y >= l.fromAge && y <= l.toAge);

    // Person 1
    let salaryP1 = 0;
    if (lowYear) {
      salaryP1 = Number(lowYear.salaryP1) || 0;
    } else {
      for (let i = schedP1.length - 1; i >= 0; i--) {
        if (y >= schedP1[i].fromAge) { salaryP1 = schedP1[i].salary; break; }
      }
    }
    const margRateP1 = getMarginalRate(salaryP1, getFederalBrackets(filingStatus));
    const p1PreTax = Math.min(preTax401kLimit, salaryP1 > 0 ? salaryP1 * 0.15 : 0);
    const p1Match = lowYear ? 0 : Math.min(salaryP1 * (emP1 / 100), salaryP1 * (emlP1 / 100));
    const p1AfterTaxSpace = Math.max(0, totalAnnual401kLimit - p1PreTax - p1Match);
    const p1TotalContrib = p1PreTax + p1AfterTaxSpace + iraLimit;
    cumP1 = (cumP1 + p1TotalContrib + p1Match) * (1 + annualReturn);

    // Person 2
    let salaryP2 = 0;
    if (lowYear) {
      salaryP2 = Number(lowYear.salaryP2) || 0;
    } else {
      for (let i = schedP2.length - 1; i >= 0; i--) {
        if (y >= schedP2[i].fromAge) { salaryP2 = schedP2[i].salary; break; }
      }
    }
    const margRateP2 = getMarginalRate(salaryP2, getFederalBrackets(filingStatus));
    const p2PreTax = Math.min(preTax401kLimit, salaryP2 > 0 ? salaryP2 * 0.15 : 0);
    const p2Match = Math.min(salaryP2 * (emP2 / 100), salaryP2 * (emlP2 / 100));
    const p2TotalContrib = p2PreTax + iraLimit;
    cumP2 = (cumP2 + p2TotalContrib + p2Match) * (1 + annualReturn);

    const combinedSalary = salaryP1 + salaryP2;
    const effectiveRate = getEffectiveRate(combinedSalary, getFederalBrackets(filingStatus));
    const afterTaxIncome = combinedSalary - (combinedSalary * effectiveRate) - totalAnnualExpenses;
    const investableOutside = Math.max(0, afterTaxIncome - (p1TotalContrib + p2TotalContrib));

    yearlyPlan.push({
      age: y, isLowIncomeYear: !!lowYear,
      salaryP1, margRateP1: (margRateP1 * 100).toFixed(1) + '%',
      p1PreTax: Math.round(p1PreTax), p1AfterTax: Math.round(p1AfterTaxSpace),
      p1AfterTaxRoth: margRateP1 < 0.32, p1Ira: iraLimit, p1IraRoth: margRateP1 <= 0.24,
      p1Match: Math.round(p1Match), p1Total: Math.round(p1TotalContrib + p1Match),
      p1Cumulative: Math.round(cumP1),
      salaryP2, margRateP2: (margRateP2 * 100).toFixed(1) + '%',
      p2PreTax: Math.round(p2PreTax), p2Ira: iraLimit, p2IraRoth: margRateP2 <= 0.24,
      p2Match: Math.round(p2Match), p2Total: Math.round(p2TotalContrib + p2Match),
      p2Cumulative: Math.round(cumP2),
      combinedSalary, combinedRetirement: Math.round(p1TotalContrib + p1Match + p2TotalContrib + p2Match),
      combinedCumulative: Math.round(cumP1 + cumP2),
      totalExpenses: Math.round(totalAnnualExpenses),
      investableOutside: Math.round(investableOutside)
    });
  }

  const finalSavings = cumP1 + cumP2;
  res.json({
    summary: {
      yearsToRetirement: retirementAge - age,
      projectedSavingsP1: Math.round(cumP1),
      projectedSavingsP2: Math.round(cumP2),
      projectedSavingsTotal: Math.round(finalSavings),
      monthlyRetirementIncome: Math.round((finalSavings * 0.04) / 12),
      totalAnnualExpenses: Math.round(totalAnnualExpenses),
      annualReturnRate: (annualReturn * 100).toFixed(1) + '%'
    },
    yearlyPlan
  });
});

// --- Investable Cash Projection (with savings cap) ---

app.post('/api/investable/project', (req, res) => {
  const { yearlyPlan, etfPercent, savingsPercent, etfReturn, savingsReturn, savingsCap } = req.body;

  const etfRate = (Number(etfReturn) || 10) / 100;
  const savRate = (Number(savingsReturn) || 4.5) / 100;
  const etfPct = (Number(etfPercent) || 70) / 100;
  const savPct = (Number(savingsPercent) || 30) / 100;
  const maxSavings = Number(savingsCap) || Infinity;

  let cumETF = 0;
  let cumSavings = 0;
  const projection = [];

  for (const y of yearlyPlan) {
    const investable = Number(y.investableOutside) || 0;
    let toSavings = investable * savPct;
    // Cap: if cumulative savings + this year's contribution exceeds cap, redirect overflow to ETFs
    if (maxSavings < Infinity && (cumSavings + toSavings) > maxSavings) {
      toSavings = Math.max(0, maxSavings - cumSavings);
    }
    const toETF = investable - toSavings;

    cumETF = (cumETF + toETF) * (1 + etfRate);
    cumSavings = (cumSavings + toSavings) * (1 + savRate);

    projection.push({
      age: y.age, investable,
      toETF: Math.round(toETF), toSavings: Math.round(toSavings),
      cumETF: Math.round(cumETF), cumSavings: Math.round(cumSavings),
      cumTotal: Math.round(cumETF + cumSavings)
    });
  }

  res.json({
    summary: {
      totalETF: Math.round(cumETF), totalSavings: Math.round(cumSavings),
      grandTotal: Math.round(cumETF + cumSavings),
      etfReturn: (etfRate * 100).toFixed(1) + '%', savingsReturn: (savRate * 100).toFixed(1) + '%',
      etfPercent: Math.round(etfPct * 100), savingsPercent: Math.round(savPct * 100),
      savingsCap: maxSavings < Infinity ? maxSavings : null
    },
    projection
  });
});

// --- Expense Analyzer ---

// Manual expense entry
app.post('/api/expenses/add', (req, res) => {
  const { date, description, amount, category, source } = req.body;
  const expense = {
    id: 'exp-' + Date.now(),
    date: date || new Date().toISOString().split('T')[0],
    description: description || 'Unknown',
    amount: Number(amount) || 0,
    category: category || 'Other',
    source: source || 'manual'
  };
  userData.expenses.push(expense);
  res.json({ success: true, expense, total: userData.expenses.length });
});

app.get('/api/expenses', (req, res) => {
  res.json(userData.expenses);
});

app.delete('/api/expenses/:id', (req, res) => {
  userData.expenses = userData.expenses.filter(e => e.id !== req.params.id);
  res.json({ success: true, total: userData.expenses.length });
});

// Upload credit card bill and parse with Bedrock
app.post('/api/expenses/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileContent = req.file.buffer.toString('utf8');
  const fileName = req.file.originalname;

  try {
    const prompt = `You are a financial expense analyzer. Parse the following credit card or bank statement and extract each transaction.

For each transaction, return a JSON array of objects with these fields:
- date: the transaction date (YYYY-MM-DD format)
- description: merchant/description
- amount: the dollar amount (positive number)
- category: one of these categories: Grocery, Dining, Shopping, Transportation, Entertainment, Subscriptions, Healthcare, Utilities, Travel, Education, Insurance, Gas, Home, Personal Care, Gifts, Other

Also provide a brief "summary" object with:
- totalSpend: total amount
- topCategory: highest spending category
- suggestions: array of 3-5 specific cost-saving suggestions based on the spending patterns

Return ONLY valid JSON in this format:
{
  "transactions": [...],
  "summary": { "totalSpend": number, "topCategory": string, "suggestions": [...] }
}

File name: ${fileName}
Content:
${fileContent.substring(0, 15000)}`;

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const aiText = responseBody.content[0].text;

    // Extract JSON from response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Add parsed transactions to expenses
    if (parsed.transactions) {
      parsed.transactions.forEach(t => {
        userData.expenses.push({
          id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          date: t.date, description: t.description,
          amount: Number(t.amount) || 0, category: t.category || 'Other',
          source: fileName
        });
      });
    }

    res.json({
      success: true,
      fileName,
      transactionsAdded: parsed.transactions ? parsed.transactions.length : 0,
      summary: parsed.summary,
      transactions: parsed.transactions
    });
  } catch (err) {
    console.error('Bedrock error:', err.message);
    // Fallback: try basic CSV parsing
    const lines = fileContent.split('\n').filter(l => l.trim());
    const transactions = [];
    for (const line of lines.slice(1)) { // skip header
      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      if (parts.length >= 3) {
        const amount = parseFloat(parts.find(p => /^\d+\.?\d*$/.test(p)) || '0');
        if (amount > 0) {
          const expense = {
            id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            date: parts[0] || new Date().toISOString().split('T')[0],
            description: parts[1] || 'Unknown',
            amount, category: categorizeExpense(parts[1] || ''),
            source: fileName
          };
          userData.expenses.push(expense);
          transactions.push(expense);
        }
      }
    }
    res.json({
      success: true, fileName, transactionsAdded: transactions.length,
      summary: {
        totalSpend: transactions.reduce((s, t) => s + t.amount, 0),
        topCategory: getMostFrequent(transactions.map(t => t.category)),
        suggestions: [
          'AI analysis unavailable — review your largest transactions for savings opportunities.',
          'Consider tracking subscriptions and canceling unused ones.',
          'Compare prices on recurring purchases like groceries and gas.'
        ]
      },
      transactions,
      note: 'Used basic CSV parsing (Bedrock unavailable: ' + err.message + ')'
    });
  }
});

// Analyze expenses with Bedrock
app.post('/api/expenses/analyze', async (req, res) => {
  const expenses = userData.expenses;
  if (expenses.length === 0) return res.json({ error: 'No expenses to analyze' });

  // Build category summary
  const byCategory = {};
  let total = 0;
  expenses.forEach(e => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    total += e.amount;
  });

  const categoryBreakdown = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => ({ category: cat, amount: Math.round(amt), percent: ((amt / total) * 100).toFixed(1) + '%' }));

  try {
    const prompt = `You are a personal finance advisor. Analyze this spending data and provide actionable cost-saving suggestions.

Total spending: $${total.toFixed(2)}
Number of transactions: ${expenses.length}

Spending by category:
${categoryBreakdown.map(c => `- ${c.category}: $${c.amount} (${c.percent})`).join('\n')}

Top 10 largest transactions:
${expenses.sort((a, b) => b.amount - a.amount).slice(0, 10).map(e => `- $${e.amount.toFixed(2)} - ${e.description} (${e.category})`).join('\n')}

Provide your response as JSON:
{
  "overallAssessment": "brief 2-sentence assessment",
  "suggestions": [
    { "category": "category name", "suggestion": "specific actionable advice", "potentialSavings": "$X/month" }
  ],
  "alerts": ["any concerning patterns"],
  "monthlyBudgetRecommendation": { "category": amount, ... }
}`;

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const aiText = responseBody.content[0].text;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    res.json({ total: Math.round(total), categoryBreakdown, analysis, transactionCount: expenses.length });
  } catch (err) {
    console.error('Bedrock analysis error:', err.message);
    res.json({
      total: Math.round(total), categoryBreakdown, transactionCount: expenses.length,
      analysis: {
        overallAssessment: 'AI analysis unavailable. Review your category breakdown below for spending patterns.',
        suggestions: categoryBreakdown.slice(0, 5).map(c => ({
          category: c.category, suggestion: `Your ${c.category} spending is ${c.percent} of total. Review for potential savings.`,
          potentialSavings: '$' + Math.round(c.amount * 0.1) + '/month'
        })),
        alerts: total > 5000 ? ['Monthly spending exceeds $5,000 — review discretionary categories.'] : [],
        monthlyBudgetRecommendation: null
      },
      note: 'Bedrock unavailable: ' + err.message
    });
  }
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
    { symbol: 'TSLA', name: 'Tesla', ytd: -5.2, y1: 8.4, y3: -2.1, y5: 45.2, y10: 38.5, reason: 'Energy storage + FSD optionality, near-term margin pressure' },
    { symbol: 'META', name: 'Meta Platforms', ytd: 14.2, y1: 35.6, y3: 22.8, y5: 18.9, y10: 16.2, reason: 'Reels monetization + Reality Labs long-term bet' },
    { symbol: 'COST', name: 'Costco', ytd: 9.1, y1: 28.4, y3: 18.2, y5: 22.6, y10: 17.8, reason: 'Membership model, consistent comps growth' },
    { symbol: 'AVGO', name: 'Broadcom', ytd: 18.7, y1: 65.2, y3: 35.4, y5: 38.1, y10: 32.5, reason: 'AI networking chips + VMware acquisition synergies' },
    { symbol: 'CRM', name: 'Salesforce', ytd: 5.4, y1: 12.8, y3: 8.6, y5: 14.2, y10: 16.8, reason: 'AI-powered CRM leader, improving margins' }
  ];
  const recommendedETFs = [
    { symbol: 'VOO', name: 'Vanguard S&P 500', ytd: 9.8, y1: 18.2, y3: 10.5, y5: 14.8, y10: 12.6, reason: 'Core US large-cap, 0.03% expense ratio' },
    { symbol: 'QQQ', name: 'Invesco Nasdaq 100', ytd: 14.2, y1: 25.6, y3: 12.8, y5: 19.2, y10: 17.8, reason: 'Tech-heavy growth, AI leaders' },
    { symbol: 'VTI', name: 'Vanguard Total Market', ytd: 8.5, y1: 16.8, y3: 9.8, y5: 13.6, y10: 11.9, reason: 'Broadest US market exposure' },
    { symbol: 'SCHD', name: 'Schwab Dividend Equity', ytd: 4.2, y1: 8.5, y3: 6.2, y5: 10.8, y10: 11.2, reason: 'Quality dividends, lower volatility, 3.5% yield' },
    { symbol: 'VGT', name: 'Vanguard Info Tech', ytd: 15.8, y1: 28.4, y3: 14.2, y5: 22.5, y10: 20.1, reason: 'Pure tech sector, low expense ratio' },
    { symbol: 'GLD', name: 'SPDR Gold Shares', ytd: 12.5, y1: 18.2, y3: 8.4, y5: 10.2, y10: 7.8, reason: 'Inflation hedge, central bank buying' }
  ];

  res.json({
    allocation: {
      stocks: { percent: stockPct, perPeriod: Math.round(perPeriod * stockPct / 100) },
      etfs: { percent: etfPct, perPeriod: Math.round(perPeriod * etfPct / 100) },
      gold: { percent: goldPct, perPeriod: Math.round(perPeriod * goldPct / 100) }
    },
    frequency: investmentFrequency, annualTotal: investmentAmount,
    perPeriodTotal: Math.round(perPeriod), recommendedStocks, recommendedETFs
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

// --- Digest & Opportunities ---
app.get('/api/digest', (req, res) => { res.json(generateDailyDigest(getWatchlist())); });
app.get('/api/opportunities', (req, res) => { res.json(generateValueOpportunities(getWatchlist())); });
app.post('/api/opportunities/:id/feedback', (req, res) => {
  userData.feedback.push({ opportunityId: req.params.id, ...req.body, timestamp: new Date().toISOString() });
  res.json({ success: true });
});

// --- Helpers ---
function getFederalBrackets(status) {
  if (status === 'married') {
    return [{ min: 0, max: 23200, rate: 0.10 },{ min: 23200, max: 94300, rate: 0.12 },{ min: 94300, max: 201050, rate: 0.22 },{ min: 201050, max: 383900, rate: 0.24 },{ min: 383900, max: 487450, rate: 0.32 },{ min: 487450, max: 731200, rate: 0.35 },{ min: 731200, max: Infinity, rate: 0.37 }];
  }
  return [{ min: 0, max: 11600, rate: 0.10 },{ min: 11600, max: 47150, rate: 0.12 },{ min: 47150, max: 100525, rate: 0.22 },{ min: 100525, max: 191950, rate: 0.24 },{ min: 191950, max: 243725, rate: 0.32 },{ min: 243725, max: 609350, rate: 0.35 },{ min: 609350, max: Infinity, rate: 0.37 }];
}
function getMarginalRate(income, brackets) {
  for (let i = brackets.length - 1; i >= 0; i--) { if (income > brackets[i].min) return brackets[i].rate; }
  return 0.10;
}
function getEffectiveRate(income, brackets) {
  let tax = 0;
  for (const b of brackets) { if (income <= b.min) break; tax += (Math.min(income, b.max) - b.min) * b.rate; }
  return income > 0 ? tax / income : 0;
}
function categorizeExpense(desc) {
  const d = desc.toLowerCase();
  if (/grocery|safeway|trader|whole foods|costco|walmart|kroger|target/i.test(d)) return 'Grocery';
  if (/restaurant|doordash|uber eats|grubhub|mcdonald|starbucks|chipotle/i.test(d)) return 'Dining';
  if (/amazon|ebay|etsy|shop|store|mall/i.test(d)) return 'Shopping';
  if (/gas|shell|chevron|exxon|bp|fuel/i.test(d)) return 'Gas';
  if (/uber|lyft|transit|parking|toll/i.test(d)) return 'Transportation';
  if (/netflix|spotify|hulu|disney|hbo|youtube|apple tv/i.test(d)) return 'Subscriptions';
  if (/doctor|pharmacy|cvs|walgreens|hospital|dental|medical/i.test(d)) return 'Healthcare';
  if (/electric|water|internet|comcast|att|verizon|tmobile|pg&e/i.test(d)) return 'Utilities';
  if (/hotel|airline|flight|airbnb|travel|booking/i.test(d)) return 'Travel';
  if (/insurance|geico|state farm|allstate/i.test(d)) return 'Insurance';
  return 'Other';
}
function getMostFrequent(arr) {
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
}

function generateDailyDigest(watchlist) {
  const macroNews = [
    { title: 'Fed signals potential rate hold through Q3 2026', source: 'Reuters', link: 'https://www.reuters.com/markets/', sentiment: 'neutral' },
    { title: 'US GDP growth revised up to 2.8% for Q1 2026', source: 'Bloomberg', link: 'https://www.bloomberg.com/markets', sentiment: 'positive' },
    { title: 'Treasury yields dip to 4.1% as inflation expectations ease', source: 'WSJ', link: 'https://www.wsj.com/economy', sentiment: 'positive' },
    { title: 'China stimulus package boosts global commodity prices', source: 'FT', link: 'https://www.ft.com/markets', sentiment: 'positive' },
    { title: 'ECB cuts rates by 25bps, signals more easing', source: 'Reuters', link: 'https://www.reuters.com/business/', sentiment: 'positive' },
    { title: 'US unemployment holds steady at 3.8%', source: 'CNBC', link: 'https://www.cnbc.com/economy/', sentiment: 'positive' },
    { title: 'Oil prices drop 3% on OPEC+ production outlook', source: 'Bloomberg', link: 'https://www.bloomberg.com/energy', sentiment: 'negative' },
    { title: 'US housing starts fall 5% as mortgage rates stay elevated', source: 'WSJ', link: 'https://www.wsj.com/real-estate', sentiment: 'negative' },
    { title: 'AI infrastructure spending to reach $500B globally in 2026', source: 'Goldman Sachs', link: 'https://www.goldmansachs.com/insights/', sentiment: 'positive' },
    { title: 'Consumer confidence rises to 108.5, highest in 2 years', source: 'Conference Board', link: 'https://www.conference-board.org/', sentiment: 'positive' },
    { title: 'Bitcoin surpasses $95,000 as institutional adoption accelerates', source: 'CoinDesk', link: 'https://www.coindesk.com/', sentiment: 'positive' },
    { title: 'Global semiconductor sales hit record $680B', source: 'SIA', link: 'https://www.semiconductors.org/', sentiment: 'positive' },
    { title: 'US trade deficit widens to $78B', source: 'Reuters', link: 'https://www.reuters.com/markets/', sentiment: 'negative' },
    { title: '78% of S&P 500 companies beat earnings estimates', source: 'FactSet', link: 'https://www.factset.com/', sentiment: 'positive' },
    { title: 'Japan raises interest rates for first time in 18 months', source: 'Nikkei', link: 'https://asia.nikkei.com/', sentiment: 'neutral' },
    { title: 'US manufacturing PMI expands to 52.4', source: 'ISM', link: 'https://www.ismworld.org/', sentiment: 'positive' },
    { title: 'Gold hits all-time high above $2,800/oz', source: 'Kitco', link: 'https://www.kitco.com/', sentiment: 'positive' },
    { title: 'Student loan payments impact consumer spending', source: 'CNBC', link: 'https://www.cnbc.com/personal-finance/', sentiment: 'negative' },
    { title: 'Quantum computing stocks surge on Google breakthrough', source: 'TechCrunch', link: 'https://techcrunch.com/', sentiment: 'positive' },
    { title: 'US national debt surpasses $37 trillion', source: 'CBO', link: 'https://www.cbo.gov/', sentiment: 'negative' }
  ];
  const newsMap = {
    'AAPL':'Apple Vision Pro 2 drives services revenue to record','MSFT':'Copilot reaches 100M enterprise users','GOOGL':'Gemini 3.0 boosts Cloud growth to 32%',
    'AMZN':'AWS margins expand to 38%','META':'AI assistant reaches 1B users','NVDA':'Blackwell Ultra ships, data center revenue up 80%',
    'TSM':'Arizona fab begins 3nm production','AMD':'MI400 AI accelerator gains traction','AVGO':'VMware integration ahead of schedule',
    'INTC':'18A process on track, $8B CHIPS Act funding','QCOM':'Snapdragon X Elite dominates AI PC market','ARM':'Arm servers reach 25% cloud share',
    'CRM':'Einstein AI drives 20% deal size increase','ADBE':'Firefly generates 10B images','NOW':'AI agents automate 40% of IT workflows',
    'SNOW':'Product revenue accelerates to 35% growth','PLTR':'AIP wins $500M defense contract','SHOP':'Checkout processes $300B GMV',
    'NFLX':'Ad tier reaches 80M subscribers','DIS':'Streaming turns profitable','TSLA':'FSD v13 approved in EU',
    'NKE':'Direct sales recover with innovation cycle','SBUX':'China same-store sales up 8%','COST':'Membership renewal at 93.5%',
    'PG':'Organic sales growth at 5%','KO':'Zero-sugar drives 7% revenue growth','IONQ':'Achieves 35 algorithmic qubits',
    'RGTI':'84-qubit system shows 99.5% fidelity','QBTS':'Quantum optimization 1000x faster','VOO':'S&P 500 up 12% YTD',
    'QQQ':'Nasdaq 100 up 16% YTD','VTI':'Total market up 10% YTD','SCHD':'Dividend stocks see renewed interest',
    'VGT':'Tech ETF benefits from AI capex','ARKK':'Rebounds 25% YTD','SPY':'ETF inflows hit record $50B',
    'GLD':'Gold ETF holdings rise','IAU':'Inflows amid uncertainty','BTC-USD':'ETF inflows surpass $80B cumulative'
  };
  const watchlistUpdates = watchlist.map(item => ({
    symbol: item.symbol, name: item.name, sector: item.sector,
    priceChange: (Math.random() * 8 - 3).toFixed(2), volume: (Math.random() * 50 + 5).toFixed(1) + 'M',
    keyNews: newsMap[item.symbol] || `${item.symbol} trading near 52-week levels`,
    analystRating: ['Strong Buy','Buy','Hold','Outperform'][Math.floor(Math.random() * 4)]
  }));
  const investorOpinions = [
    { investor: 'Warren Buffett', opinion: 'Record $325B cash position, trimming Apple.', source: 'Berkshire Q1 Filing', link: 'https://www.berkshirehathaway.com/' },
    { investor: 'Cathie Wood', opinion: 'Doubling down on AI and autonomous tech.', source: 'ARK Big Ideas 2026', link: 'https://ark-invest.com/big-ideas-2026' },
    { investor: 'Ray Dalio', opinion: 'Recommends 15% gold, warns of wealth transfer.', source: 'Bridgewater Observations', link: 'https://www.bridgewater.com/' },
    { investor: 'Howard Marks', opinion: 'Market priced for perfection, favors credit.', source: 'Oaktree Memo', link: 'https://www.oaktreecapital.com/insights' },
    { investor: 'Stanley Druckenmiller', opinion: 'Bullish on NVDA and AVGO for AI infra.', source: 'Duquesne 13F', link: 'https://www.sec.gov/cgi-bin/browse-edgar' }
  ];
  return { date: new Date().toISOString().split('T')[0], macroNews, watchlistUpdates, investorOpinions };
}

function generateValueOpportunities(watchlist) {
  const opps = [
    { id:'opp-intc',symbol:'INTC',name:'Intel',currentPrice:28.5,fairValue:42,peakPrice:68.5,peakDate:'Apr 2021',revenueGrowth:-8.2,ytdReturn:-12.5,y1Return:-18.2,analystTarget:38,dividendYield:'1.4%',peRatio:22.5,reasons:['18A process promising yields','CHIPS Act $8B+ funding','AI PC cycle recovery','Gaudi 3 gaining traction','$10B cost restructuring'] },
    { id:'opp-dis',symbol:'DIS',name:'Walt Disney',currentPrice:98.5,fairValue:135,peakPrice:201.9,peakDate:'Mar 2021',revenueGrowth:4.5,ytdReturn:5.2,y1Return:-2.8,analystTarget:125,dividendYield:'0.9%',peRatio:18.2,reasons:['Streaming profitable','Parks at record revenue','ESPN streaming launch','Unmatched content library','50% below ATH'] },
    { id:'opp-nke',symbol:'NKE',name:'Nike',currentPrice:72.8,fairValue:105,peakPrice:179.1,peakDate:'Nov 2021',revenueGrowth:-2.1,ytdReturn:-8.5,y1Return:-22.4,analystTarget:95,dividendYield:'1.8%',peRatio:24.5,reasons:['New CEO driving innovation','#1 global athletic brand','China recovery upside','Inventory normalizing','22yr dividend aristocrat'] },
    { id:'opp-adbe',symbol:'ADBE',name:'Adobe',currentPrice:420,fairValue:560,peakPrice:699.5,peakDate:'Nov 2021',revenueGrowth:11.2,ytdReturn:-5.8,y1Return:2.4,analystTarget:520,dividendYield:'0%',peRatio:28.5,reasons:['Firefly AI driving upsells','Digital Experience growing 12%+','110%+ net retention','40% below ATH','35%+ FCF margins'] },
    { id:'opp-snow',symbol:'SNOW',name:'Snowflake',currentPrice:165,fairValue:220,peakPrice:405,peakDate:'Nov 2021',revenueGrowth:28.5,ytdReturn:8.2,y1Return:15.6,analystTarget:200,dividendYield:'0%',peRatio:-1,reasons:['Revenue reaccelerating to 35%+','Cortex AI driving deal sizes','127% net retention','Data sharing network effects','New CEO margin focus'] },
    { id:'opp-googl',symbol:'GOOGL',name:'Alphabet',currentPrice:168,fairValue:210,peakPrice:191.75,peakDate:'Feb 2025',revenueGrowth:14.8,ytdReturn:6.8,y1Return:15.2,analystTarget:200,dividendYield:'0.5%',peRatio:22.1,reasons:['Search + AI maintaining 90%+ share','Cloud growing 28%','YouTube approaching $50B','Waymo scaling to 5+ cities','$70B buyback + dividend'] },
    { id:'opp-amzn',symbol:'AMZN',name:'Amazon',currentPrice:192,fairValue:240,peakPrice:201.2,peakDate:'Feb 2025',revenueGrowth:12.5,ytdReturn:10.5,y1Return:25.8,analystTarget:230,dividendYield:'0%',peRatio:35.2,reasons:['AWS margins at 38%','Retail profitability record','Ads growing 25%+','Project Kuiper launch','Same-day delivery moat'] },
    { id:'opp-crm',symbol:'CRM',name:'Salesforce',currentPrice:265,fairValue:340,peakPrice:311.5,peakDate:'Feb 2024',revenueGrowth:9.2,ytdReturn:5.4,y1Return:12.8,analystTarget:310,dividendYield:'0.6%',peRatio:30.5,reasons:['Einstein AI 20% deal size lift','33%+ operating margins','Data Cloud + MuleSoft moat','Dividend + buyback','Agentforce platform'] }
  ];
  const wlSet = new Set(watchlist.map(w => w.symbol));
  opps.sort((a, b) => {
    const d = (wlSet.has(a.symbol) ? 0 : 1) - (wlSet.has(b.symbol) ? 0 : 1);
    return d || ((b.fairValue-b.currentPrice)/b.currentPrice) - ((a.fairValue-a.currentPrice)/a.currentPrice);
  });
  return {
    generatedAt: new Date().toISOString(),
    opportunities: opps.map(o => ({ ...o,
      upside: ((o.fairValue-o.currentPrice)/o.currentPrice*100).toFixed(1)+'%',
      fromPeak: (((o.currentPrice-o.peakPrice)/o.peakPrice)*100).toFixed(1)+'%',
      inWatchlist: wlSet.has(o.symbol)
    }))
  };
}

app.listen(PORT, () => { console.log(`Financial Advisor running at http://localhost:${PORT}`); });
