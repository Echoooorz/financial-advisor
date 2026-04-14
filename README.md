# Financial Advisor

A personal financial planning web application that provides guidance on retirement planning, investment strategy, and market intelligence for a two-person household.

## Features

### 1. Two-Person Retirement Planning
- **Person 1**: Pre-tax 401K + After-tax 401K (mega backdoor Roth) + Traditional IRA
- **Person 2**: Pre-tax 401K + Traditional IRA only
- Salary growth modeling — enter expected salary at different ages
- Low-income / startup year support — P1 loses employer match during these periods
- Roth conversion recommendations based on marginal tax rate per year
- Full annual expense breakdown (housing, childcare, car, healthcare, travel, etc.)
- Configurable 401K annual return assumption
- Year-by-year table showing contributions, Roth decisions, and cumulative savings
- Projected retirement savings and monthly income (4% withdrawal rule)
- Save/load form inputs to browser localStorage

### 2. Investable Cash Projection
- Shows how much cash remains each year after taxes, expenses, and retirement contributions
- User-configurable split between ETFs and savings account (e.g. 70/30)
- Separate annual return assumptions for ETFs and savings
- Year-by-year compounding projection through retirement age
- Grand total of non-retirement investments at retirement

### 3. Investment Strategy
- Personalized asset allocation (stocks / ETFs / gold) based on age and risk tolerance
- Per-period dollar amounts for chosen investment frequency (daily/weekly/monthly)
- 10 recommended individual stocks with YTD, 1Y, 3Y, 5Y, 10Y annualized returns
- 6 recommended ETFs and gold funds with historical returns
- Reasoning for each pick

### 4. Daily Digest
- 20 macro news items with source links and sentiment indicators
- Watchlist updates grouped by sector (big tech, semiconductors, software, consumer, quantum, ETFs, gold, crypto)
- 5 notable investor opinions with source links
- Watchlist managed via `watchlist.json` — 57 tickers pre-loaded
- Add/remove tickers from the UI

### 5. Value Investing Opportunities
- Undervalued stock picks prioritized from user's watchlist
- Metrics: P/E ratio, dividend yield, revenue growth, distance from peak price, YTD/1Y return, analyst target price
- Top 5 reasons to invest for each pick
- Star rating + text feedback system to iterate on recommendations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Data | In-memory + `watchlist.json` file |
| Persistence | Browser localStorage (retirement form inputs) |

## Project Structure

```
FinancialAdvisor/
├── server.js                  # Express API server
├── package.json
├── public/
│   ├── index.html             # Single-page app with 5 tabs
│   ├── style.css              # Dark theme responsive styles
│   ├── app.js                 # Client-side logic
│   └── watchlist.json         # Persisted watchlist (57 tickers)
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/retirement/calculate` | Two-person retirement plan calculation |
| POST | `/api/investment/allocation` | Investment allocation with stock/ETF recommendations |
| POST | `/api/investable/project` | Project investable cash growth (ETF vs savings) |
| GET | `/api/watchlist` | Get current watchlist |
| POST | `/api/watchlist` | Add ticker to watchlist |
| DELETE | `/api/watchlist/:symbol` | Remove ticker from watchlist |
| GET | `/api/digest` | Generate daily digest |
| GET | `/api/opportunities` | Get value investing opportunities |
| POST | `/api/opportunities/:id/feedback` | Submit feedback on a pick |

## Setup & Run

```bash
cd FinancialAdvisor
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Retirement Calculation Details

### Tax Brackets
Uses 2024 federal income tax brackets for both Single and Married Filing Jointly.

### Contribution Limits (2024/2025)
- Pre-tax 401K: $23,500 (under 50) / $30,500 (50+)
- Total annual 401K: $70,000
- IRA: $7,000 (under 50) / $8,000 (50+)

### Roth Conversion Logic
- **After-tax 401K → Roth**: Recommended when marginal rate < 32%
- **IRA → Roth**: Recommended when marginal rate ≤ 24%
- Low-income/startup years are flagged as ideal Roth conversion windows

### Employer Match
- Person 1: Configurable match % and limit; **no match during startup years**
- Person 2: Configurable match % and limit; match continues during all years

### Projections
- Cumulative savings compound at user-specified annual return (default 7%)
- Monthly retirement income uses the 4% safe withdrawal rate
- Investable cash = after-tax income − expenses − retirement contributions

## Watchlist Sectors

| Sector | Example Tickers |
|--------|----------------|
| Big Tech | AAPL, MSFT, GOOGL, AMZN, META |
| Semiconductor | NVDA, TSM, AMD, AVGO, INTC, QCOM, ARM |
| Software | CRM, ADBE, NOW, SNOW, PLTR, SHOP, UBER, RDDT, RBLX |
| Consumer | NFLX, DIS, TSLA, NKE, SBUX, COST, WMT, ABNB, DASH, SPOT |
| Quantum | IONQ, RGTI, QBTS |
| ETFs | VOO, QQQ, VTI, SCHD, VGT, ARKK, SPY, TLT, USO, XLE, FUTY |
| Gold | GLD, IAU |
| Crypto | BTC-USD, COIN |

## Limitations

- Market data (prices, returns, news) is simulated — not connected to live APIs
- Tax calculations are simplified (federal only, no state tax, no FICA details)
- No authentication or multi-user support
- Data resets on server restart (except watchlist and localStorage)

## Future Enhancements

- Connect to real market data APIs (Yahoo Finance, Alpha Vantage, etc.)
- Add state tax calculations
- Implement actual daily digest email/notification delivery
- Machine learning for value opportunity scoring based on user feedback
- Historical portfolio backtesting
- Export retirement plan to PDF
- Multi-user support with database persistence

## Disclaimer

⚠️ This tool provides educational guidance only — not professional financial advice. Consult a licensed financial advisor for personalized decisions.
