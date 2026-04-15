# Financial Advisor

A personal financial planning web application for two-person households. Covers retirement planning, investment strategy, expense tracking with AI analysis, and market intelligence.

## Features

### 1. Two-Person Retirement Planning
- **Person 1**: Pre-tax 401K + After-tax 401K (mega backdoor Roth) + Traditional IRA
- **Person 2**: Pre-tax 401K + Traditional IRA only
- Salary growth modeling — enter expected salary at different ages
- Low-income / startup year support — P1 loses employer match during these periods
- Roth conversion recommendations based on marginal tax rate per year
- **Monthly** expense breakdown (housing, childcare, car, healthcare, travel, etc.)
- Configurable 401K annual return assumption (default 7%)
- Year-by-year table with contributions, Roth decisions, and cumulative savings
- Projected retirement savings and monthly income (4% withdrawal rule)
- Save/load all form inputs to browser localStorage

### 2. Investable Cash Projection
- Shows investable cash each year after taxes, expenses, and retirement contributions
- User-configurable split between ETFs and savings account (e.g. 70/30)
- **Savings cap** — set a max savings balance; overflow redirects to ETFs automatically
- Separate annual return assumptions for ETFs (default 10%) and savings (default 4.5%)
- Year-by-year compounding projection through retirement age

### 3. Investment Strategy
- Personalized asset allocation (stocks / ETFs / gold) based on age and risk tolerance
- Per-period dollar amounts for chosen frequency (daily/weekly/monthly)
- 10 recommended individual stocks with YTD, 1Y, 3Y, 5Y, 10Y annualized returns
- 6 recommended ETFs and gold funds with historical returns
- Reasoning for each pick

### 4. Daily Digest
- 20 macro news items with source links and sentiment indicators
- Watchlist updates grouped by sector (big tech, semiconductors, software, consumer, quantum, ETFs, gold, crypto)
- 5 notable investor opinions with source links
- 57 tickers pre-loaded in `watchlist.json`
- Add/remove tickers from the UI

### 5. Expense Analyzer (AI-Powered)
- **Upload credit card bills** (CSV/TXT) — parsed and categorized by Amazon Bedrock (Claude)
- **Manual expense entry** with date, description, amount, category, and source (credit card / checking / savings / cash)
- 16 spending categories: Grocery, Dining, Shopping, Transportation, Entertainment, Subscriptions, Healthcare, Utilities, Travel, Education, Insurance, Gas, Home, Personal Care, Gifts, Other
- **AI analysis** provides:
  - Overall spending assessment
  - Category-by-category cost-saving suggestions with estimated savings
  - Spending alerts for concerning patterns
  - Recommended monthly budget by category
- Falls back to rule-based CSV parsing and basic suggestions if Bedrock is unavailable

### 6. Value Investing Opportunities
- Undervalued stock picks prioritized from user's watchlist
- Metrics: P/E, dividend yield, revenue growth, distance from peak, YTD/1Y return, analyst target
- Top 5 reasons to invest for each pick
- Star rating + text feedback to iterate on recommendations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML / CSS / JavaScript |
| AI | Amazon Bedrock (Claude 3 Sonnet) |
| File Upload | Multer |
| Data | In-memory + `watchlist.json` |
| Persistence | Browser localStorage (retirement form inputs) |

## Project Structure

```
FinancialAdvisor/
├── server.js                  # Express API server + Bedrock integration
├── package.json
├── .gitignore
├── public/
│   ├── index.html             # Single-page app with 6 tabs
│   ├── style.css              # Dark theme responsive styles
│   ├── app.js                 # Client-side logic
│   └── watchlist.json         # Persisted watchlist (57 tickers)
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/retirement/calculate` | Two-person retirement plan (monthly expenses × 12) |
| POST | `/api/investable/project` | Project investable cash growth with savings cap |
| POST | `/api/investment/allocation` | Investment allocation with stock/ETF recommendations |
| GET | `/api/watchlist` | Get current watchlist |
| POST | `/api/watchlist` | Add ticker to watchlist |
| DELETE | `/api/watchlist/:symbol` | Remove ticker from watchlist |
| GET | `/api/digest` | Generate daily digest |
| GET | `/api/opportunities` | Get value investing opportunities |
| POST | `/api/opportunities/:id/feedback` | Submit feedback on a pick |
| POST | `/api/expenses/add` | Add a manual expense |
| GET | `/api/expenses` | Get all expenses |
| DELETE | `/api/expenses/:id` | Delete an expense |
| POST | `/api/expenses/upload` | Upload and parse a credit card bill (Bedrock AI) |
| POST | `/api/expenses/analyze` | AI spending analysis with savings suggestions |

## Setup & Run

```bash
cd FinancialAdvisor
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

### AWS Bedrock Setup (Optional)

The Expense Analyzer uses Amazon Bedrock for AI-powered bill parsing and spending analysis. To enable it:

1. Configure AWS credentials (`~/.aws/credentials` or environment variables)
2. Ensure access to `anthropic.claude-3-sonnet-20240229-v1:0` in your Bedrock region
3. Set region if not us-west-2: `AWS_REGION=us-east-1 npm start`

Without Bedrock credentials, the app still works — file uploads fall back to basic CSV parsing with rule-based categorization.

## Retirement Calculation Details

### Tax Brackets
Uses 2024 federal income tax brackets for Single and Married Filing Jointly.

### Contribution Limits (2024/2025)
- Pre-tax 401K: $23,500 (under 50) / $30,500 (50+)
- Total annual 401K: $70,000
- IRA: $7,000 (under 50) / $8,000 (50+)

### Roth Conversion Logic
- **After-tax 401K → Roth**: Recommended when marginal rate < 32%
- **IRA → Roth**: Recommended when marginal rate ≤ 24%
- Low-income/startup years flagged as ideal Roth conversion windows

### Employer Match
- Person 1: Configurable; **no match during startup years**
- Person 2: Configurable; match continues during all years

### Expense Handling
- Users enter **monthly** expenses in the retirement form
- Server multiplies by 12 for annual calculations
- Investable cash = after-tax income − annual expenses − retirement contributions

### Investable Cash Savings Cap
- Users set a max savings account balance (e.g. $100,000)
- Once cumulative savings reaches the cap, new contributions redirect to ETFs
- Prevents over-allocation to low-yield savings

## Watchlist Sectors

| Sector | Example Tickers |
|--------|----------------|
| Big Tech | AAPL, MSFT, GOOGL, AMZN, META |
| Semiconductor | NVDA, TSM, AMD, AVGO, INTC, QCOM, ARM |
| Software | CRM, ADBE, NOW, SNOW, PLTR, SHOP, UBER, RDDT, RBLX, HOOD |
| Consumer | NFLX, DIS, TSLA, NKE, SBUX, COST, WMT, ABNB, DASH, SPOT |
| Quantum | IONQ, RGTI, QBTS |
| ETFs | VOO, QQQ, VTI, SCHD, VGT, ARKK, SPY, TLT, USO, XLE, FUTY |
| Gold | GLD, IAU |
| Crypto | BTC-USD, COIN |

## Limitations

- Market data (prices, returns, news) is simulated — not connected to live APIs
- Tax calculations are simplified (federal only, no state tax, no FICA)
- Expense data resets on server restart (in-memory storage)
- No authentication or multi-user support
- Bedrock AI requires AWS credentials and model access

## Future Enhancements

- Connect to real market data APIs (Yahoo Finance, Alpha Vantage)
- Add state tax calculations
- Persist expenses to database or file
- Daily digest email/notification delivery
- ML-based value opportunity scoring from user feedback
- Historical portfolio backtesting
- PDF export for retirement plan
- Multi-user support with authentication
- PDF credit card bill parsing (OCR)

## Disclaimer

⚠️ This tool provides educational guidance only — not professional financial advice. Consult a licensed financial advisor for personalized decisions.
