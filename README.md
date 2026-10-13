# Clan Capital

A family wealth tracker: income, spending, monthly budget, investments, goals and debt, for the whole household and for each family member.

**Live demo:** https://jjkoch-ops.github.io/clan-capital/

Built for the Stellenbosch University MBA Wealth Creation group assignment.

## What it does
- **Overview** – net worth over time, income vs spending, savings rate, debt-to-income, suggestions
- **Income & spending** – import bank statements (CSV) or add monthly totals by hand; transactions are categorised automatically and the app learns your corrections
- **Budget** – expected monthly income, spending budgets per category (family or per person), actual vs budget
- **Investments** – holdings and multi-fund accounts, asset allocation, TFSA limits, growth tracker (market growth vs money added)
- **Goals** – emergency fund, retirement, short- and long-term goals with projections and the monthly amount needed
- **Debt** – all accounts, payoff time, and a snowball vs avalanche payoff planner

## Privacy
Everything runs in the browser. Data is stored only on the user's device (localStorage) and is never uploaded. The demo opens with a fictional sample family.

## Try the imports
`sample-files/` contains a fictional FNB-format bank statement and an investment sheet with a multi-fund account.

## Technology
Plain HTML, CSS and JavaScript (no build step). Chart.js for charts, SheetJS for Excel files.
