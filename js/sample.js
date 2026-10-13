/* Clan Capital — fictional sample household for the demo.
   The Mokoena family is invented. No real person's data is included. */
(function (root) {
  'use strict';
  var HS = root.HS || (typeof require !== 'undefined' ? require('./core.js') : {});

  function seeded(seed) {
    return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  function build(today) {
    today = today || new Date();
    var rnd = seeded(20261012);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var thisMonth = today.getFullYear() + '-' + pad(today.getMonth() + 1);
    var dayToday = today.getDate();
    var members = [
      { id: 'm1', name: 'Thabo', color: 1 },
      { id: 'm2', name: 'Lerato', color: 2 }
    ];
    var entries = [];
    function add(month, day, amount, description, category, member) {
      if (month === thisMonth && day > dayToday) return;
      entries.push({ id: HS.uid(), date: month + '-' + pad(day), amount: amount, description: description, category: category, member: member, source: 'import', account: member === 'm2' ? 'Lerato cheque' : 'Thabo cheque' });
    }
    function jitter(base, pct) { return Math.round(base * (1 + (rnd() - 0.5) * 2 * pct) * 100) / 100; }

    for (var k = 6; k >= 0; k--) {
      var m = HS.addMonths(thisMonth, -k);
      // Income
      add(m, 25, 42500, 'ACME ENGINEERING SALARY', 'salary', 'm1');
      add(m, 25, 31800, 'GAUTENG DEPT OF EDUCATION SALARY', 'salary', 'm2');
      if (k % 2 === 0) add(m, 12, jitter(4200, 0.4), 'CRAFT MARKET SALES - LERATO', 'business', 'm2');
      add(m, 28, jitter(85, 0.2), 'CREDIT INTEREST', 'interest', 'joint');
      // Fixed debit orders
      add(m, 1, -14900, 'ABSA HOME LOAN 4410', 'debt', 'joint');
      add(m, 1, -7850, 'WESBANK VEHICLE FINANCE', 'debt', 'm1');
      add(m, 3, -1200, 'FNBCC DEBICHECK', 'debt', 'm1');
      add(m, 3, -450, 'EDGARS ACCOUNT PAYMENT', 'debt', 'm2');
      add(m, 4, -1650, 'AFRICAN BANK PERSONAL LOAN', 'debt', 'm2');
      add(m, 1, -2850, 'CITY OF TSHWANE RATES & WATER', 'utilities', 'joint');
      add(m, 2, -1680, 'OUTSURANCE HOME & CAR', 'insurance', 'joint');
      add(m, 2, -935, 'LIBERTY LIFE COVER', 'insurance', 'm1');
      add(m, 2, -620, 'OLD MUTUAL FUNERAL PLAN', 'insurance', 'm2');
      add(m, 1, -6240, 'DISCOVERY HEALTH MEDICAL AID', 'medical', 'joint');
      add(m, 5, -899, 'VUMATEL FIBRE', 'phone', 'joint');
      add(m, 6, -649, 'VODACOM CONTRACT', 'phone', 'm1');
      add(m, 6, -399, 'MTN CONTRACT', 'phone', 'm2');
      add(m, 7, -199, 'NETFLIX.COM', 'subscriptions', 'joint');
      add(m, 7, -479, 'VIRGIN ACTIVE', 'subscriptions', 'm2');
      add(m, 1, -4250, 'LITTLE ACORNS CRECHE', 'education', 'joint');
      add(m, 26, -3000, 'EASYEQUITIES TFSA', 'investing', 'm1');
      add(m, 26, -2500, 'ALLAN GRAY RETIREMENT ANNUITY', 'investing', 'm2');
      add(m, 26, -1000, 'ALLAN GRAY UNIT TRUSTS', 'investing', 'joint');
      add(m, 27, -2500, 'GRACE COMMUNITY CHURCH TITHE', 'giving', 'joint');
      // Variable spending
      for (var g = 0; g < 4; g++) add(m, 4 + g * 7, -jitter(1650, 0.3), ['CHECKERS HYPER MENLYN', 'PICK N PAY GARSFONTEIN', 'WOOLWORTHS BROOKLYN', 'SPAR MORELETA'][g], 'groceries', g % 2 ? 'm2' : 'm1');
      for (var f = 0; f < 3; f++) add(m, 3 + f * 9, -jitter(950, 0.25), ['ENGEN MENLYN', 'SHELL GARSFONTEIN', 'SASOL LYNNWOOD'][f], 'transport', f === 1 ? 'm2' : 'm1');
      add(m, 10, -jitter(1200, 0.5), 'PREPAID ELECTRICITY', 'utilities', 'joint');
      add(m, 13, -jitter(520, 0.4), 'UBER EATS', 'eating-out', 'm2');
      add(m, 20, -jitter(780, 0.4), 'SPUR MENLYN', 'eating-out', 'joint');
      add(m, 16, -jitter(640, 0.6), 'DIS-CHEM MENLYN', 'medical', 'm2');
      add(m, 18, -jitter(1100, 0.7), 'TAKEALOT.COM', 'shopping', k % 2 ? 'm1' : 'm2');
      add(m, 22, -jitter(400, 0.5), 'MR PRICE HOME', 'shopping', 'm2');
      add(m, 15, -jitter(260, 0.3), 'FNB MONTHLY ACCOUNT FEE', 'fees', 'joint');
      if (k === 2) add(m, 19, -4800, 'BRIDGESTONE TYRES', 'transport', 'm1');
      if (k === 4) add(m, 9, -3600, 'DR NAIDOO PAEDIATRICIAN', 'medical', 'joint');
      // Transfers that must not count
      add(m, 25, -10000, 'FNB APP TRANSFER TO SAVINGS', 'transfer', 'm1');
      add(m, 25, 10000, 'FNB APP TRANSFER FROM CHEQUE', 'transfer', 'm1');
    }

    // Manual totals example: rental income entered by hand
    for (var j = 6; j >= 1; j--) {
      var mm = HS.addMonths(thisMonth, -j);
      entries.push({ id: HS.uid(), date: mm + '-01', amount: 6500, description: 'Granny flat rent (monthly total)', category: 'other-income', member: 'joint', source: 'manual' });
    }

    var budgets = [
      { id: HS.uid(), category: 'housing', member: 'all', amount: 0 },
      { id: HS.uid(), category: 'groceries', member: 'all', amount: 6500 },
      { id: HS.uid(), category: 'eating-out', member: 'all', amount: 1200 },
      { id: HS.uid(), category: 'transport', member: 'm1', amount: 2400 },
      { id: HS.uid(), category: 'transport', member: 'm2', amount: 1000 },
      { id: HS.uid(), category: 'utilities', member: 'all', amount: 4200 },
      { id: HS.uid(), category: 'medical', member: 'all', amount: 7000 },
      { id: HS.uid(), category: 'shopping', member: 'all', amount: 1500 },
      { id: HS.uid(), category: 'subscriptions', member: 'all', amount: 700 },
      { id: HS.uid(), category: 'phone', member: 'all', amount: 2000 },
      { id: HS.uid(), category: 'insurance', member: 'all', amount: 3300 },
      { id: HS.uid(), category: 'education', member: 'all', amount: 4250 },
      { id: HS.uid(), category: 'giving', member: 'all', amount: 2500 },
      { id: HS.uid(), category: 'debt', member: 'all', amount: 26050 },
      { id: HS.uid(), category: 'fees', member: 'all', amount: 300 }
    ].filter(function (b) { return b.amount > 0; });

    var holdings = [
      { id: 'h-tfsa', name: 'Satrix MSCI World ETF', provider: 'EasyEquities', type: 'TFSA', assetClass: 'Offshore equity', member: 'm1', value: 142300, monthly: 3000, returnPct: 12.5, taxYearContrib: 24000, lifetimeContrib: 118000 },
      { id: 'h-ra', name: 'Allan Gray Balanced Fund', provider: 'Allan Gray', type: 'Retirement annuity', assetClass: 'Balanced / multi-asset', member: 'm2', value: 385600, monthly: 2500, returnPct: 10.2 },
      { id: 'h-gepf', name: 'Government Employees Pension Fund', provider: 'GEPF', type: 'Pension / provident fund', assetClass: 'Balanced / multi-asset', member: 'm2', value: 612000, monthly: 3400, returnPct: 9.5 },
      { id: 'h-ut', name: 'Allan Gray unit trust account', provider: 'Allan Gray', type: 'Unit trust', assetClass: 'Mixed', member: 'joint', value: 96400, monthly: 1000, returnPct: 10,
        funds: [
          { id: 'f1', name: 'Allan Gray Equity Fund', assetClass: 'Local equity', value: 32000, returnPct: 11.4 },
          { id: 'f2', name: 'Allan Gray Balanced Fund', assetClass: 'Balanced / multi-asset', value: 24000, returnPct: 10.1 },
          { id: 'f3', name: 'Orbis Global Equity Fund', assetClass: 'Offshore equity', value: 22000, returnPct: 13.2 },
          { id: 'f4', name: 'Allan Gray Bond Fund', assetClass: 'Bonds', value: 10400, returnPct: 8.6 },
          { id: 'f5', name: 'Allan Gray Money Market Fund', assetClass: 'Cash', value: 8000, returnPct: 7.6 }
        ] },
      { id: 'h-shares', name: 'Shares account', provider: 'EasyEquities', type: 'Shares / ETFs', assetClass: 'Local equity', member: 'm1', value: 48250, monthly: 0, returnPct: 11, lumpSums: [{ date: HS.addMonths(thisMonth, -4) + '-15', amount: 5000 }] },
      { id: 'h-cash', name: 'Emergency fund', provider: 'Capitec', type: 'Cash & money market', assetClass: 'Cash', member: 'joint', value: 38500, monthly: 0, returnPct: 7.5 },
      { id: 'h-home', name: 'Family home, Garsfontein', provider: 'Own valuation', type: 'Property', assetClass: 'Property', member: 'joint', value: 1850000, monthly: 0, returnPct: 5 }
    ];

    // Twelve months of value history per holding, for the growth tracker.
    // Monthly market return per asset class (rough long-run averages, with noise).
    var drift = { 'Mixed': 0.0075, 'Offshore equity': 0.009, 'Local equity': 0.008, 'Balanced / multi-asset': 0.0075, 'Cash': 0.006, 'Property': 0.004, 'Bonds': 0.007, 'Other': 0.005 };
    holdings.forEach(function (h) {
      // Money added in a month = monthly contribution + any lump sum dated that month
      var added = function (m) { return h.monthly + (h.lumpSums || []).filter(function (l) { return l.date.slice(0, 7) === m; }).reduce(function (a, l) { return a + l.amount; }, 0); };
      var m0 = HS.addMonths(thisMonth, -1);
      var v = h.value, hist = [{ month: m0, value: Math.round(v), contrib: added(m0) }];
      for (var i = 2; i <= 13; i++) {
        var g = drift[h.assetClass] + (h.assetClass === 'Cash' || h.assetClass === 'Property' ? 0 : (rnd() - 0.45) * 0.05);
        v = (v - hist[0].contrib) / (1 + g);
        var mi = HS.addMonths(thisMonth, -i);
        hist.unshift({ month: mi, value: Math.round(v), contrib: added(mi) });
      }
      h.history = hist;
    });

    var goals = [
      { id: HS.uid(), name: 'Emergency fund', type: 'emergency', member: 'joint', monthsCover: 3, links: ['h-cash'], current: 0, monthly: 2500, returnPct: 7, targetDate: HS.addMonths(thisMonth, 36), todayMoney: false },
      { id: HS.uid(), name: "Lerato's retirement", type: 'retirement', member: 'm2', target: 5500000, links: ['h-ra', 'h-gepf'], current: 0, monthly: 5900, returnPct: 10, targetDate: '2052-06', todayMoney: true },
      { id: HS.uid(), name: "Thabo's retirement", type: 'retirement', member: 'm1', target: 3000000, links: ['h-tfsa', 'h-shares'], current: 0, monthly: 3000, returnPct: 10, targetDate: '2049-03', todayMoney: true },
      { id: HS.uid(), name: 'Cape Town holiday', type: 'short', member: 'joint', target: 35000, links: [], current: 12500, monthly: 1500, returnPct: 7, targetDate: '2027-12', todayMoney: false },
      { id: HS.uid(), name: 'Kids\' university fund', type: 'long', member: 'joint', target: 450000, links: ['h-ut'], current: 0, monthly: 1000, returnPct: 10, targetDate: '2042-01', todayMoney: true },
      { id: HS.uid(), name: 'Next car deposit', type: 'short', member: 'm1', target: 60000, links: [], current: 8000, monthly: 1000, returnPct: 7, targetDate: '2029-06', todayMoney: false }
    ];

    var incomePlan = [
      { id: HS.uid(), category: 'salary', member: 'm1', amount: 42500, label: 'Salary (net)' },
      { id: HS.uid(), category: 'salary', member: 'm2', amount: 31800, label: 'Salary (net)' },
      { id: HS.uid(), category: 'business', member: 'm2', amount: 2000, label: 'Craft market sales' },
      { id: HS.uid(), category: 'other-income', member: 'joint', amount: 6500, label: 'Granny flat rent' }
    ];

    var debts = [
      { id: HS.uid(), name: 'Home loan', lender: 'Absa', type: 'Home loan', member: 'joint', balance: 1412000, rate: 11.25, instalment: 14900 },
      { id: HS.uid(), name: 'Toyota Corolla Cross', lender: 'WesBank', type: 'Vehicle finance', member: 'm1', balance: 262400, rate: 12.75, instalment: 7850 },
      { id: HS.uid(), name: 'FNB credit card', lender: 'FNB', type: 'Credit card', member: 'm1', balance: 9600, rate: 19.75, instalment: 1200 },
      { id: HS.uid(), name: 'Edgars store card', lender: 'Retail Credit', type: 'Store card', member: 'm2', balance: 14800, rate: 21, instalment: 450 },
      { id: HS.uid(), name: 'Personal loan', lender: 'African Bank', type: 'Personal loan', member: 'm2', balance: 42500, rate: 24.5, instalment: 1650 }
    ];

    // Twelve monthly net worth snapshots per member, ending last month
    var snapshots = [];
    var base = { m1: { a: 148000, l: 318000 }, m2: { a: 905000, l: 62000 }, joint: { a: 1890000, l: 1452000 } };
    var grow = { m1: { a: 0.012, l: -0.011 }, m2: { a: 0.009, l: -0.015 }, joint: { a: 0.0045, l: -0.0024 } };
    for (var s = 12; s >= 1; s--) {
      var month = HS.addMonths(thisMonth, -s);
      var step = 12 - s;
      var by = {};
      Object.keys(base).forEach(function (id) {
        var wobble = 1 + (rnd() - 0.5) * 0.02;
        by[id] = {
          assets: Math.round(base[id].a * Math.pow(1 + grow[id].a, step) * wobble),
          liabilities: Math.round(base[id].l * Math.pow(1 + grow[id].l, step))
        };
      });
      snapshots.push({ month: month, byMember: by });
    }

    return {
      version: 1,
      isSample: true,
      household: { name: 'Mokoena family' },
      members: members,
      entries: entries,
      budgets: budgets,
      holdings: holdings,
      debts: debts,
      snapshots: snapshots,
      learned: {},
      goals: goals,
      incomePlan: incomePlan,
      settings: { tfsaAnnualLimit: 36000, tfsaLifetimeLimit: 500000, inflation: 5 }
    };
  }

  root.HS = root.HS || {};
  root.HS.buildSample = build;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildSample: build };
})(typeof window !== 'undefined' ? window : globalThis);
