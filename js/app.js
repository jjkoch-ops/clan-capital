/* Clan Capital — application UI
   Renders six areas (Overview, Income & spending, Budget, Investments, Debt, Import & settings)
   from one state object kept in the browser. Every screen respects the member filter. */
(function () {
  'use strict';
  var HS = window.HS;
  var fmtR = HS.fmtR;

  // ---------- State ----------
  var S = HS.load();
  if (!S || !S.version) { S = HS.buildSample(new Date()); HS.save(S); }
  if (S.isSample && !S.goals) { S = HS.buildSample(new Date()); HS.save(S); } // refresh old sample data
  S.learned = S.learned || {};
  S.goals = S.goals || [];
  if (S.isSample && !S.incomePlan) { S = HS.buildSample(new Date()); HS.save(S); }
  S.incomePlan = S.incomePlan || [];
  S.settings = S.settings || { tfsaAnnualLimit: 36000, tfsaLifetimeLimit: 500000 };
  if (S.settings.inflation == null) S.settings.inflation = 5;

  var TODAY = new Date();
  var THIS_MONTH = TODAY.getFullYear() + '-' + String(TODAY.getMonth() + 1).padStart(2, '0');
  var UI = { tab: 'overview', member: 'all', month: THIS_MONTH, q: '', cat: '', showTransfers: false, applySimilar: true, extra: 2000, method: 'avalanche', growthMonths: 12, growthView: 'together', openFunds: {}, goalChart: null, goalType: 'short', pendingBank: null, pendingHoldings: null, confirm: null };
  try {
    var saved = JSON.parse(localStorage.getItem('clancapital.ui') || '{}');
    if (saved.tab) UI.tab = saved.tab;
    if (saved.member) UI.member = saved.member;
  } catch (e) { /* storage unavailable */ }
  var hash = (location.hash || '').slice(1);
  if (['overview', 'money', 'budget', 'investments', 'goals', 'debt', 'data'].indexOf(hash) >= 0) UI.tab = hash;

  function persist() { HS.save(S); }
  function persistUI() { try { localStorage.setItem('clancapital.ui', JSON.stringify({ tab: UI.tab, member: UI.member })); } catch (e) { /* ignore */ } }

  // ---------- Helpers ----------
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function sum(arr, f) { return arr.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function pct(n) { return isFinite(n) ? Math.round(n * 100) + '%' : '–'; }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function memberName(id) {
    if (id === 'all') return 'Whole family';
    if (id === 'joint') return 'Joint';
    var m = S.members.find(function (x) { return x.id === id; });
    return m ? m.name : 'Unknown';
  }
  function memberColor(id) {
    if (id === 'joint' || id === 'all') return 'var(--series-3)';
    var i = S.members.findIndex(function (x) { return x.id === id; });
    return ['var(--series-1)', 'var(--series-2)', 'var(--series-4)'][i % 3];
  }
  function owners() { return S.members.map(function (m) { return m.id; }).concat('joint'); }
  function inScope(owner) { return UI.member === 'all' || owner === UI.member; }
  function scopeLabel() { return UI.member === 'all' ? 'the whole family' : memberName(UI.member); }

  function kindOf(cat) { return (HS.CAT_BY_ID[cat] || { kind: 'spend' }).kind; }
  function entriesIn(month) {
    return S.entries.filter(function (e) { return inScope(e.member) && (!month || e.date.slice(0, 7) === month); });
  }
  function totalsFor(month) {
    var t = { income: 0, spend: 0, save: 0, byCat: {} };
    entriesIn(month).forEach(function (e) {
      var k = kindOf(e.category);
      if (k === 'transfer') return;
      if (k === 'income') t.income += e.amount;
      else if (k === 'save') t.save -= e.amount;
      else t.spend -= e.amount;
      if (k !== 'income') t.byCat[e.category] = (t.byCat[e.category] || 0) - e.amount;
    });
    return t;
  }
  function fullMonthsBack(n) {
    var out = [];
    for (var i = n; i >= 1; i--) out.push(HS.addMonths(THIS_MONTH, -i));
    return out;
  }
  function avgIncome(n) {
    var ms = fullMonthsBack(n).filter(function (m) { return entriesIn(m).length; });
    if (!ms.length) return 0;
    return sum(ms, function (m) { return totalsFor(m).income; }) / ms.length;
  }

  function holdingsInScope() { return S.holdings.filter(function (h) { return inScope(h.member); }); }
  function debtsInScope() { return S.debts.filter(function (d) { return inScope(d.member); }); }
  function netWorthNow() {
    var a = sum(holdingsInScope(), function (h) { return +h.value || 0; });
    var l = sum(debtsInScope(), function (d) { return +d.balance || 0; });
    return { assets: a, liabilities: l, net: a - l };
  }
  function snapValue(snap) {
    var keys = UI.member === 'all' ? Object.keys(snap.byMember) : [UI.member];
    var a = 0, l = 0;
    keys.forEach(function (k) { var v = snap.byMember[k]; if (v) { a += v.assets; l += v.liabilities; } });
    return { assets: a, liabilities: l, net: a - l };
  }

  function memberOptions(selected, includeAll) {
    var ids = (includeAll ? ['all'] : []).concat(owners());
    return ids.map(function (id) { return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' + esc(memberName(id)) + '</option>'; }).join('');
  }
  function categoryOptions(selected, kinds) {
    var groups = { income: 'Income', spend: 'Spending', save: 'Saving', transfer: 'Ignore' };
    var html = '';
    Object.keys(groups).forEach(function (k) {
      if (kinds && kinds.indexOf(k) < 0) return;
      html += '<optgroup label="' + groups[k] + '">' + HS.CATEGORIES.filter(function (c) { return c.kind === k; }).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    return html;
  }
  function listOptions(list, selected) {
    return list.map(function (x) { return '<option' + (x === selected ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
  }
  function monthNav(id) {
    return '<div class="month-nav" data-monthnav="' + id + '"><button type="button" data-step="-1" aria-label="Previous month">‹</button><span class="m">' +
      HS.monthLabel(UI.month, true) + '</span><button type="button" data-step="1" aria-label="Next month"' + (UI.month >= THIS_MONTH ? ' disabled' : '') + '>›</button></div>';
  }
  function legendItem(color, text, box) { return '<span><i class="' + (box ? 'box' : '') + '" style="background:' + color + '"></i>' + esc(text) + '</span>'; }

  // ---------- Charts ----------
  var charts = [];
  function clearCharts() { charts.forEach(function (c) { c.destroy(); }); charts = []; }
  function baseChartOptions(extra) {
    var ink2 = cssVar('--ink-2'), line = cssVar('--line');
    var o = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar('--surface'), titleColor: cssVar('--ink'), bodyColor: cssVar('--ink'), borderColor: line, borderWidth: 1,
          padding: 10, boxPadding: 4, usePointStyle: true,
          callbacks: { label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + fmtR(ctx.parsed.y); } }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: line }, ticks: { color: ink2, font: { size: 11 } } },
        y: { grid: { color: line }, border: { display: false }, ticks: { color: ink2, font: { size: 11 }, callback: function (v) { return fmtR(v, { compact: true }); } } }
      }
    };
    return Object.assign(o, extra || {});
  }
  function makeChart(id, config) {
    var el = document.getElementById(id);
    if (!el || !window.Chart) return;
    charts.push(new Chart(el, config));
  }

  // ---------- Shell ----------
  function renderShell() {
    $('#household-name').textContent = S.household.name;
    var ids = ['all'].concat(S.members.map(function (m) { return m.id; })).concat('joint');
    $('#member-filter').innerHTML = ids.map(function (id) {
      return '<button class="chip" data-member="' + id + '" aria-pressed="' + (UI.member === id) + '">' +
        (id === 'all' ? '' : '<span class="dot" style="background:' + memberColor(id) + '"></span>') + esc(id === 'all' ? 'Family' : memberName(id)) + '</button>';
    }).join('');
    document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', t.dataset.tab === UI.tab); });
    $('#sample-banner').innerHTML = S.isSample
      ? '<div class="banner"><span><strong>You are viewing a sample household.</strong> The Mokoena family is fictional. Import your own statements or start empty under Import &amp; settings.</span><button class="btn secondary" data-goto="data">Use my own data</button></div>'
      : '';
  }

  function render() {
    clearCharts();
    renderShell();
    var v = $('#view');
    var fn = { overview: viewOverview, money: viewMoney, budget: viewBudget, investments: viewInvestments, goals: viewGoals, debt: viewDebt, data: viewData }[UI.tab];
    v.innerHTML = fn();
    if (fn.after) fn.after();
  }

  // ---------- Overview ----------
  function viewOverview() {
    var nw = netWorthNow();
    var snaps = S.snapshots.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    var yearAgo = snaps.find(function (s) { return s.month === HS.addMonths(THIS_MONTH, -12); }) || snaps[0];
    var change = yearAgo ? nw.net - snapValue(yearAgo).net : null;
    var months = fullMonthsBack(3).filter(function (m) { return entriesIn(m).length; });
    var inc = sum(months, function (m) { return totalsFor(m).income; });
    var spd = sum(months, function (m) { return totalsFor(m).spend; });
    var savingsRate = inc ? (inc - spd) / inc : NaN;
    var instal = sum(debtsInScope(), function (d) { return +d.instalment || 0; });
    var avgInc = months.length ? inc / months.length : 0;
    var dti = avgInc ? instal / avgInc : NaN;
    var dtiStatus = dti < 0.3 ? 'good' : dti < 0.45 ? 'warn' : 'bad';

    var last = HS.addMonths(THIS_MONTH, -1);
    var lt = totalsFor(last);
    var cats = Object.keys(lt.byCat).filter(function (c) { return kindOf(c) === 'spend' && lt.byCat[c] > 0; }).sort(function (a, b) { return lt.byCat[b] - lt.byCat[a]; });
    var maxCat = cats.length ? lt.byCat[cats[0]] : 1;

    var html = '<div class="view-head"><div><span class="eyebrow">Overview · ' + esc(scopeLabel()) + '</span><h2>Where the family stands</h2></div></div>';
    html += '<div class="kpis">' +
      '<div class="kpi hero"><span class="eyebrow">Net worth</span><span class="value">' + fmtR(nw.net) + '</span><span class="sub">' +
      (change != null ? '<span class="' + (change >= 0 ? 'delta-up' : 'delta-down') + '">' + (change >= 0 ? '▲ ' : '▼ ') + fmtR(Math.abs(change)) + '</span> since ' + HS.monthLabel(yearAgo.month, true) : 'Record a snapshot to track change') + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Monthly income</span><span class="value">' + fmtR(avgInc) + '</span><span class="sub">Average of the last ' + months.length + ' full months</span></div>' +
      '<div class="kpi"><span class="eyebrow">Savings rate</span><span class="value">' + pct(savingsRate) + '</span><span class="sub">Income left after spending, incl. investing</span></div>' +
      '<div class="kpi"><span class="eyebrow">Debt repayments</span><span class="value">' + pct(dti) + '</span><span class="sub"><span class="pill ' + dtiStatus + '">' + (dtiStatus === 'good' ? 'Healthy' : dtiStatus === 'warn' ? 'Stretched' : 'High') + '</span> of income goes to debt</span></div>' +
      '</div>';

    html += '<div class="grid-2">' +
      '<section class="panel"><header><h3>Net worth over time</h3><span class="muted small">Assets ' + fmtR(nw.assets, { compact: true }) + ' · Debt ' + fmtR(nw.liabilities, { compact: true }) + '</span></header><div class="chart-box"><canvas id="c-networth" aria-label="Net worth by month"></canvas></div></section>' +
      '<section class="panel"><header><h3>Income vs spending</h3><span class="muted small">Last 6 full months</span></header><div class="chart-box"><canvas id="c-flow" aria-label="Income, spending and investing by month"></canvas></div>' +
      '<div class="legend">' + legendItem('var(--series-1)', 'Income', true) + legendItem('var(--series-2)', 'Spending', true) + legendItem('var(--series-3)', 'Investing', true) + '</div></section>' +
      '</div>';

    html += '<div class="grid-2"><section class="panel"><header><h3>Spending by category</h3><span class="muted small">' + HS.monthLabel(last, true) + ' · ' + fmtR(lt.spend) + '</span></header>' +
      (cats.length ? '<div class="barlist">' + cats.slice(0, 8).map(function (c) {
        return '<div class="barrow"><span class="label">' + esc(HS.CAT_BY_ID[c].name) + '</span><span class="amt">' + fmtR(lt.byCat[c]) + '</span><div class="track"><div class="fill" style="width:' + (lt.byCat[c] / maxCat * 100).toFixed(1) + '%"></div></div></div>';
      }).join('') + '</div>' : '<div class="empty">No spending recorded for ' + HS.monthLabel(last, true) + '.</div>') +
      '</section><section class="panel"><header><h3>What to look at</h3></header>' + insights() + '</section></div>';
    return html;
  }
  viewOverview.after = function () {
    var snaps = S.snapshots.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    var labels = snaps.map(function (s) { return HS.monthLabel(s.month); }).concat('Now');
    var data = snaps.map(function (s) { return snapValue(s).net; }).concat(netWorthNow().net);
    var acc = cssVar('--accent');
    makeChart('c-networth', {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Net worth', data: data, borderColor: acc, backgroundColor: acc + '22', fill: true, borderWidth: 2, tension: 0.25, pointRadius: function (c) { return c.dataIndex === data.length - 1 ? 5 : 0; }, pointBackgroundColor: acc, pointHoverRadius: 5 }] },
      options: baseChartOptions()
    });
    var ms = fullMonthsBack(6);
    var t = ms.map(totalsFor);
    var bar = function (label, key, color) { return { label: label, data: t.map(function (x) { return Math.round(x[key]); }), backgroundColor: cssVar(color), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }; };
    makeChart('c-flow', {
      type: 'bar',
      data: { labels: ms.map(function (m) { return HS.monthLabel(m); }), datasets: [bar('Income', 'income', '--series-1'), bar('Spending', 'spend', '--series-2'), bar('Investing', 'save', '--series-3')] },
      options: baseChartOptions()
    });
  };

  function insights() {
    var items = [];
    var ms = fullMonthsBack(6);
    var fees = sum(ms, function (m) { return totalsFor(m).byCat.fees || 0; });
    if (fees > 0) items.push(['warn', 'R', 'Bank fees and overdraft interest cost <strong>' + fmtR(fees) + '</strong> over 6 months. A cheaper account or clearing the overdraft keeps that.']);
    var debts = debtsInScope();
    if (debts.length > 1) {
      var c = HS.comparePayoff(debts, UI.extra);
      var saved = c.minimumOnly.totalInterest - c.avalanche.totalInterest;
      if (saved > 0 && c.avalanche.months) items.push(['good', '↓', 'Paying an extra ' + fmtR(UI.extra) + ' a month on debt saves about <strong>' + fmtR(saved) + '</strong> in interest and makes you debt-free ' + Math.round((c.minimumOnly.months - c.avalanche.months) / 12 * 10) / 10 + ' years sooner. <a href="#debt" data-goto="debt">See the plan</a>']);
    }
    var cash = sum(holdingsInScope().filter(function (h) { return h.type === 'Cash & money market'; }), function (h) { return +h.value || 0; });
    var avgSpend = sum(fullMonthsBack(3), function (m) { return totalsFor(m).spend; }) / 3;
    if (avgSpend > 0) {
      var cover = cash / avgSpend;
      items.push([cover >= 3 ? 'good' : 'warn', '!', 'The emergency fund covers <strong>' + (Math.round(cover * 10) / 10) + ' months</strong> of spending. Three to six months is the usual target.']);
    }
    var tfsa = holdingsInScope().filter(function (h) { return h.type === 'TFSA'; });
    if (tfsa.length) {
      var room = sum(tfsa, function (h) { return Math.max(0, S.settings.tfsaAnnualLimit - (+h.taxYearContrib || 0)); });
      if (room > 0) items.push(['good', '%', 'There is <strong>' + fmtR(room) + '</strong> of tax-free savings room left before the tax year ends in February.']);
    }
    var gb = goalsInScope().map(function (g) { return { g: g, p: goalProjection(g) }; }).filter(function (x) { return x.p.status === 'behind'; });
    if (gb.length) items.push(['warn', '◎', gb.length + ' goal' + (gb.length > 1 ? 's are' : ' is') + ' behind: ' + gb.map(function (x) { return esc(x.g.name); }).join(', ') + '. <a href="#goals" data-goto="goals">Review goals</a>']);
    var bud = budgetRows(THIS_MONTH);
    var over = bud.rows.filter(function (r) { return r.spent > r.amount; });
    if (over.length) items.push(['bad', '×', over.length + ' budget ' + (over.length === 1 ? 'line is' : 'lines are') + ' already over this month: ' + over.map(function (r) { return esc(HS.CAT_BY_ID[r.category].name); }).join(', ') + '. <a href="#budget" data-goto="budget">Open budget</a>']);
    if (!items.length) return '<div class="empty">Add income, spending, investments and debt to see suggestions here.</div>';
    return '<ul class="insights">' + items.map(function (i) {
      return '<li><span class="ic pill ' + i[0] + '">' + i[1] + '</span><span>' + i[2] + '</span></li>';
    }).join('') + '</ul>';
  }

  // ---------- Income & spending ----------
  function viewMoney() {
    var t = totalsFor(UI.month);
    var list = entriesIn(UI.month).filter(function (e) {
      if (!UI.showTransfers && kindOf(e.category) === 'transfer') return false;
      if (UI.cat && e.category !== UI.cat) return false;
      if (UI.q && (e.description + ' ' + HS.CAT_BY_ID[e.category].name).toLowerCase().indexOf(UI.q.toLowerCase()) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

    var html = '<div class="view-head"><div><span class="eyebrow">Income &amp; spending · ' + esc(scopeLabel()) + '</span><h2>Money in and out</h2></div>' + monthNav('money') + '</div>';
    html += '<div class="kpis">' +
      '<div class="kpi"><span class="eyebrow">Income</span><span class="value">' + fmtR(t.income) + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Spending</span><span class="value">' + fmtR(t.spend) + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Invested</span><span class="value">' + fmtR(t.save) + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Left over</span><span class="value ' + (t.income - t.spend - t.save >= 0 ? 'delta-up' : 'delta-down') + '">' + fmtR(t.income - t.spend - t.save) + '</span></div></div>';

    html += '<div class="grid-2">' + bankImportPanel();
    html += '<section class="panel"><header><h3>Add a monthly total</h3><span class="muted small">No statement needed</span></header><p class="small muted" style="margin-bottom:12px">Use this for cash income, rent received or any figure you know.</p>' +
      '<form id="manual-form" class="form-row">' +
      '<div class="field narrow"><label for="mf-type">Type</label><select id="mf-type"><option value="spend">Money out</option><option value="income">Money in</option></select></div>' +
      '<div class="field"><label for="mf-cat">Category</label><select id="mf-cat">' + categoryOptions('groceries', ['spend', 'save']) + '</select></div>' +
      '<div class="field"><label for="mf-member">Whose</label><select id="mf-member">' + memberOptions(UI.member === 'all' ? 'joint' : UI.member) + '</select></div>' +
      '<div class="field narrow"><label for="mf-month">Month</label><input id="mf-month" type="month" value="' + UI.month + '" max="' + THIS_MONTH + '"></div>' +
      '<div class="field narrow"><label for="mf-amount">Amount (R)</label><input id="mf-amount" type="number" min="0" step="0.01" required placeholder="0"></div>' +
      '<div class="field wide"><label for="mf-note">Note</label><input id="mf-note" type="text" placeholder="e.g. Cash spent at market"></div>' +
      '<button class="btn" type="submit">Add total</button></form></section></div>';

    html += '<section class="panel"><header><h3>Transactions · ' + HS.monthLabel(UI.month, true) + '</h3><span class="muted small">' + list.length + ' shown</span></header>' +
      '<div class="form-row" style="margin-bottom:12px">' +
      '<div class="field wide"><label for="f-q">Search</label><input id="f-q" type="search" value="' + esc(UI.q) + '" placeholder="Description or category"></div>' +
      '<div class="field"><label for="f-cat">Category</label><select id="f-cat"><option value="">All categories</option>' + categoryOptions(UI.cat) + '</select></div>' +
      '<label class="check"><input type="checkbox" id="f-transfers"' + (UI.showTransfers ? ' checked' : '') + '> Show transfers</label>' +
      '<label class="check"><input type="checkbox" id="f-similar"' + (UI.applySimilar ? ' checked' : '') + '> Category changes apply to similar transactions</label></div>';
    if (!list.length) {
      html += '<div class="empty"><span>No transactions for ' + HS.monthLabel(UI.month, true) + '.</span><button class="btn secondary" data-goto="data">Import a bank statement</button></div>';
    } else {
      html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Whose</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
        list.map(function (e) {
          var tr = kindOf(e.category) === 'transfer';
          return '<tr class="' + (tr ? 'is-transfer' : '') + '" data-entry="' + e.id + '"><td class="num">' + e.date.slice(8) + ' ' + HS.monthLabel(e.date.slice(0, 7)).split(' ')[0] + '</td>' +
            '<td class="desc" title="' + esc(e.description) + '">' + esc(HS.cleanDescription(e.description)) + (e.source === 'manual' ? ' <span class="pill neutral">Manual</span>' : '') + '</td>' +
            '<td><select data-field="member" aria-label="Whose">' + memberOptions(e.member) + '</select></td>' +
            '<td><select data-field="category" aria-label="Category">' + categoryOptions(e.category) + '</select></td>' +
            '<td class="num ' + (e.amount > 0 ? 'pos' : '') + '">' + fmtR(e.amount, { cents: true }) + '</td>' +
            '<td><button class="btn ghost" data-del-entry="' + e.id + '" aria-label="Delete">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</section>';
    return html;
  }

  // ---------- Budget ----------
  function budgetRows(month) {
    var lines = S.budgets.filter(function (b) { return UI.member === 'all' || b.member === UI.member || b.member === 'all'; });
    var es = S.entries.filter(function (e) { return e.date.slice(0, 7) === month; });
    var rows = lines.map(function (b) {
      var spent = -sum(es.filter(function (e) {
        if (e.category !== b.category) return false;
        if (b.member === 'all') return UI.member === 'all' || e.member === UI.member;
        return e.member === b.member;
      }), function (e) { return e.amount; });
      return { id: b.id, category: b.category, member: b.member, amount: +b.amount, spent: Math.max(0, spent) };
    });
    var budgeted = {};
    lines.forEach(function (b) { budgeted[b.category] = true; });
    var unbudgeted = {};
    es.forEach(function (e) {
      var k = kindOf(e.category);
      if ((k === 'spend' || k === 'save') && !budgeted[e.category] && inScope(e.member)) unbudgeted[e.category] = (unbudgeted[e.category] || 0) - e.amount;
    });
    return { rows: rows, unbudgeted: unbudgeted };
  }
  function statusOf(spent, amount, month) {
    var share = amount ? spent / amount : (spent > 0 ? 2 : 0);
    var expected = 1;
    if (month === THIS_MONTH) {
      var days = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
      expected = TODAY.getDate() / days;
    }
    if (share > 1.005) return { cls: 'bad', label: 'Over by ' + fmtR(spent - amount) };
    if (share >= 0.97) return { cls: 'good', label: 'Fully used' };
    if (share > Math.max(0.9, expected + 0.15)) return { cls: 'warn', label: 'Close to limit' };
    return { cls: 'good', label: 'On track' };
  }
  function incomeRows(month) {
    var lines = S.incomePlan.filter(function (l) { return inScope(l.member); });
    var es = S.entries.filter(function (e) { return e.date.slice(0, 7) === month && kindOf(e.category) === 'income'; });
    // Spread received income across matching lines (same category and person) in order
    var pool = {};
    es.forEach(function (e) { var k = e.category + '|' + e.member; pool[k] = (pool[k] || 0) + e.amount; });
    return lines.map(function (l) {
      var k = l.category + '|' + l.member;
      var got = Math.max(0, Math.min(pool[k] || 0, +l.amount || 0));
      pool[k] = (pool[k] || 0) - got;
      return { id: l.id, label: l.label, category: l.category, member: l.member, amount: +l.amount || 0, received: got };
    });
  }
  function viewBudget() {
    var b = budgetRows(UI.month);
    var inc = incomeRows(UI.month);
    var expected = sum(inc, function (r) { return r.amount; });
    var received = sum(inc, function (r) { return r.received; });
    var totalB = sum(b.rows, function (r) { return r.amount; });
    var totalS = sum(b.rows, function (r) { return r.spent; });
    var unbT = sum(Object.keys(b.unbudgeted), function (k) { return b.unbudgeted[k]; });
    var isNow = UI.month === THIS_MONTH;
    var daysLeft = isNow ? new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate() - TODAY.getDate() : 0;

    var html = '<div class="view-head"><div><span class="eyebrow">Budget · ' + esc(scopeLabel()) + '</span><h2>Monthly budget</h2></div>' + monthNav('budget') + '</div>';
    var unalloc = expected - totalB;
    html += '<div class="kpis">' +
      '<div class="kpi"><span class="eyebrow">Expected income</span><span class="value">' + fmtR(expected) + '</span><span class="sub">' + fmtR(received) + ' received so far</span></div>' +
      '<div class="kpi"><span class="eyebrow">Budgeted</span><span class="value">' + fmtR(totalB) + '</span><span class="sub">' + pct(expected ? totalB / expected : NaN) + ' of expected income</span></div>' +
      '<div class="kpi"><span class="eyebrow">' + (unalloc >= 0 ? 'Not yet allocated' : 'Over-allocated') + '</span><span class="value ' + (unalloc >= 0 ? 'delta-up' : 'delta-down') + '">' + fmtR(Math.abs(unalloc)) + '</span><span class="sub">' + (unalloc >= 0 ? 'Give this a job: savings, a goal or debt' : 'Budget is more than expected income') + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Left to spend</span><span class="value ' + (totalB - totalS >= 0 ? '' : 'delta-down') + '">' + fmtR(totalB - totalS) + '</span><span class="sub">' + fmtR(totalS) + ' spent · ' + (isNow ? daysLeft + ' days left' : 'month closed') + '</span></div></div>';

    html += '<section class="panel"><header><h3>Expected income · ' + HS.monthLabel(UI.month, true) + '</h3><span class="muted small">What you plan to earn each month, before it arrives</span></header>';
    if (inc.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Source</th><th>Whose</th><th class="num">Expected</th><th class="num">Received</th><th>Status</th><th></th></tr></thead><tbody>' +
        inc.map(function (r) {
          var st = r.received >= r.amount - 0.5 ? ['good', '✓ Received'] : r.received > 0 ? ['warn', '! ' + pct(r.received / r.amount) + ' received'] : ['neutral', isNow ? 'Waiting' : 'Not received'];
          return '<tr data-income="' + r.id + '"><td>' + esc(r.label || HS.CAT_BY_ID[r.category].name) + '<div class="small muted">' + esc(HS.CAT_BY_ID[r.category].name) + '</div></td><td><span class="dot" style="background:' + memberColor(r.member) + '"></span> ' + esc(memberName(r.member)) + '</td>' +
            '<td class="num"><input type="number" min="0" step="100" value="' + r.amount + '" data-field="amount" aria-label="Expected amount"></td><td class="num">' + fmtR(r.received) + '</td>' +
            '<td><span class="pill ' + st[0] + '">' + st[1] + '</span></td><td><button class="btn ghost" data-del-income="' + r.id + '" aria-label="Remove">✕</button></td></tr>';
        }).join('') + '</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">' + fmtR(expected) + '</td><td class="num">' + fmtR(received) + '</td><td colspan="2"></td></tr></tfoot></table></div>';
    } else html += '<div class="empty">Add the income you expect each month, like salaries, rent received or a side business.</div>';
    html += '<form id="income-form" class="form-row" style="margin-top:14px">' +
      '<div class="field wide"><label for="if-label">Source</label><input id="if-label" placeholder="e.g. Salary (net)" required></div>' +
      '<div class="field"><label for="if-cat">Category</label><select id="if-cat">' + categoryOptions('salary', ['income']) + '</select></div>' +
      '<div class="field"><label for="if-member">Whose</label><select id="if-member">' + memberOptions(UI.member === 'all' ? (S.members[0] ? S.members[0].id : 'joint') : UI.member) + '</select></div>' +
      '<div class="field narrow"><label for="if-amount">Per month (R)</label><input id="if-amount" type="number" min="0" step="100" required></div>' +
      '<button class="btn" type="submit">Add income</button></form></section>';

    html += '<section class="panel"><header><h3>Spending budget · ' + HS.monthLabel(UI.month, true) + '</h3><span class="muted small">' + (unbT > 0 ? fmtR(unbT) + ' spent outside the budget. ' : '') + 'Budgets repeat every month. Change an amount and it applies to all months.</span></header>';
    if (!b.rows.length) html += '<div class="empty">No budget lines yet. Add one below.</div>';
    else {
      html += '<div class="table-wrap"><table><thead><tr><th>Category</th><th>For</th><th class="num">Budget</th><th class="num">Spent</th><th class="num">Left</th><th style="min-width:160px">Progress</th><th></th></tr></thead><tbody>' +
        b.rows.sort(function (x, y) { return y.spent / (y.amount || 1) - x.spent / (x.amount || 1); }).map(function (r) {
          var st = statusOf(r.spent, r.amount, UI.month);
          var w = Math.min(100, r.amount ? r.spent / r.amount * 100 : 100);
          var shareNote = r.member === 'all' && UI.member !== 'all' ? '<div class="small muted">' + esc(memberName(UI.member)) + '\'s share of family budget</div>' : '';
          return '<tr data-budget="' + r.id + '"><td>' + esc(HS.CAT_BY_ID[r.category].name) + shareNote + '</td><td><span class="dot" style="background:' + memberColor(r.member) + '"></span> ' + esc(memberName(r.member)) + '</td>' +
            '<td class="num"><input type="number" min="0" step="50" value="' + r.amount + '" data-field="amount" aria-label="Budget amount"></td>' +
            '<td class="num">' + fmtR(r.spent) + '</td><td class="num ' + (r.amount - r.spent < 0 ? 'delta-down' : '') + '">' + fmtR(r.amount - r.spent) + '</td>' +
            '<td><div class="track" style="margin-bottom:4px"><div class="fill ' + st.cls + '" style="width:' + w.toFixed(1) + '%"></div></div><span class="pill ' + st.cls + '">' + (st.cls === 'good' ? '✓ ' : st.cls === 'warn' ? '! ' : '× ') + st.label + '</span></td>' +
            '<td><button class="btn ghost" data-del-budget="' + r.id + '" aria-label="Remove budget line">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var unb = Object.keys(b.unbudgeted).filter(function (k) { return b.unbudgeted[k] > 0; });
    if (unb.length) {
      html += '<h3 style="margin:18px 0 8px">Spending without a budget</h3><div class="table-wrap"><table><tbody>' + unb.map(function (k) {
        return '<tr><td>' + esc(HS.CAT_BY_ID[k].name) + '</td><td class="num">' + fmtR(b.unbudgeted[k]) + '</td><td style="text-align:right"><button class="btn secondary" data-quick-budget="' + k + '" data-amount="' + Math.ceil(b.unbudgeted[k] / 100) * 100 + '">Budget ' + fmtR(Math.ceil(b.unbudgeted[k] / 100) * 100) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    html += '</section>';

    html += '<div class="grid-2"><section class="panel"><header><h3>Add a budget line</h3></header><form id="budget-form" class="form-row">' +
      '<div class="field"><label for="bf-cat">Category</label><select id="bf-cat">' + categoryOptions('groceries', ['spend', 'save']) + '</select></div>' +
      '<div class="field"><label for="bf-member">For</label><select id="bf-member">' + memberOptions(UI.member, true) + '</select></div>' +
      '<div class="field narrow"><label for="bf-amount">Per month (R)</label><input id="bf-amount" type="number" min="0" step="50" required></div>' +
      '<button class="btn" type="submit">Add</button></form><p class="small muted" style="margin-top:10px">"Whole family" lines count everyone\'s spending in that category. A line for one person counts only their spending.</p></section>';

    var hist = fullMonthsBack(6);
    var prev = UI.month;
    html += '<section class="panel"><header><h3>Last 6 months</h3><span class="muted small">Budget lines in view</span></header><div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">Budget</th><th class="num">Spent</th><th>Result</th></tr></thead><tbody>' +
      hist.map(function (m) {
        var r = budgetRows(m).rows;
        var tb = sum(r, function (x) { return x.amount; }), ts = sum(r, function (x) { return x.spent; });
        var over = r.filter(function (x) { return x.spent > x.amount; }).length;
        var cls = ts > tb ? 'bad' : over ? 'warn' : 'good';
        return '<tr><td>' + HS.monthLabel(m, true) + '</td><td class="num">' + fmtR(tb) + '</td><td class="num">' + fmtR(ts) + '</td><td><span class="pill ' + cls + '">' + (ts > tb ? '× Over budget' : over ? '! ' + over + ' line' + (over > 1 ? 's' : '') + ' over' : '✓ Within budget') + '</span></td></tr>';
      }).join('') + '</tbody></table></div></section></div>';
    UI.month = prev;
    return html;
  }

  // ---------- Investments ----------
  function viewInvestments() {
    var hs = holdingsInScope();
    var total = sum(hs, function (h) { return +h.value || 0; });
    var exProp = sum(hs.filter(function (h) { return h.type !== 'Property'; }), function (h) { return +h.value || 0; });
    var monthly = sum(hs, function (h) { return +h.monthly || 0; });
    var retire = sum(hs.filter(function (h) { return h.type === 'Retirement annuity' || h.type === 'Pension / provident fund'; }), function (h) { return +h.value || 0; });
    var byClass = {};
    hs.forEach(function (h) { classSplit(h).forEach(function (c) { byClass[c.assetClass] = (byClass[c.assetClass] || 0) + c.value; }); });
    var classes = Object.keys(byClass).sort(function (a, b) { return byClass[b] - byClass[a]; });
    var ty = HS.taxYearStart(TODAY.toISOString().slice(0, 10));

    var html = '<div class="view-head"><div><span class="eyebrow">Investments · ' + esc(scopeLabel()) + '</span><h2>What the family owns</h2></div></div>';
    html += '<div class="kpis">' +
      '<div class="kpi hero"><span class="eyebrow">Total assets</span><span class="value">' + fmtR(total) + '</span><span class="sub">' + hs.length + ' holdings</span></div>' +
      '<div class="kpi"><span class="eyebrow">Invested excl. property</span><span class="value">' + fmtR(exProp) + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Retirement savings</span><span class="value">' + fmtR(retire) + '</span><span class="sub">RA, pension and provident funds</span></div>' +
      '<div class="kpi"><span class="eyebrow">Monthly contributions</span><span class="value">' + fmtR(monthly) + '</span></div></div>';

    html += '<div class="grid-2"><section class="panel"><header><h3>Asset allocation</h3><span class="muted small">Share of total assets</span></header>' +
      (classes.length ? '<div class="barlist">' + classes.map(function (c) {
        return '<div class="barrow"><span class="label">' + esc(c) + '</span><span class="amt">' + fmtR(byClass[c], { compact: true }) + ' · ' + pct(byClass[c] / total) + '</span><div class="track"><div class="fill" style="width:' + (byClass[c] / total * 100).toFixed(1) + '%"></div></div></div>';
      }).join('') + '</div>' : '<div class="empty">No holdings yet.</div>') + '</section>';

    var tfsa = hs.filter(function (h) { return h.type === 'TFSA'; });
    html += '<section class="panel"><header><h3>Tax-free savings (TFSA)</h3><span class="muted small">Tax year ' + ty + '/' + String(ty + 1).slice(2) + ' · 1 Mar – end Feb</span></header>';
    if (!tfsa.length) html += '<div class="empty">No TFSA holdings in view. Add one with type "TFSA" to track your contribution limits.</div>';
    else html += '<div class="barlist">' + tfsa.map(function (h) {
      var y = +h.taxYearContrib || 0, l = +h.lifetimeContrib || 0;
      var ya = S.settings.tfsaAnnualLimit, la = S.settings.tfsaLifetimeLimit;
      return '<div style="display:grid;gap:8px" data-holding="' + h.id + '"><strong>' + esc(h.name) + ' <span class="muted small">· ' + esc(memberName(h.member)) + '</span></strong>' +
        '<div class="barrow"><span class="label">This tax year</span><span class="amt">' + fmtR(y) + ' of ' + fmtR(ya) + '</span><div class="track"><div class="fill ' + (y > ya ? 'bad' : 'good') + '" style="width:' + Math.min(100, y / ya * 100).toFixed(1) + '%"></div></div></div>' +
        '<div class="barrow"><span class="label">Lifetime</span><span class="amt">' + fmtR(l) + ' of ' + fmtR(la) + '</span><div class="track"><div class="fill ' + (l > la ? 'bad' : 'good') + '" style="width:' + Math.min(100, l / la * 100).toFixed(1) + '%"></div></div></div>' +
        '<div class="form-row"><div class="field"><label>Contributed this tax year</label><input type="number" min="0" step="100" data-field="taxYearContrib" value="' + y + '"></div><div class="field"><label>Contributed in total</label><input type="number" min="0" step="100" data-field="lifetimeContrib" value="' + l + '"></div></div>' +
        (y > ya ? '<span class="pill bad">× Over the annual limit. SARS charges 40% tax on the excess.</span>' : '') + '</div>';
    }).join('') + '</div><p class="small muted" style="margin-top:10px">Limits are set under Import &amp; settings. Check the current figures on the SARS website.</p>';
    html += '</section></div>';

    html += growthPanel(hs);
    html += '<section class="panel"><header><h3>Holdings</h3><span class="muted small">Update values whenever you get a statement</span></header>';
    if (hs.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Holding</th><th>Provider</th><th>Type</th><th>Asset class</th><th>Owner</th><th class="num">Value</th><th class="num">Monthly</th><th></th></tr></thead><tbody>' +
        hs.slice().sort(function (a, b) { return b.value - a.value; }).map(holdingRow).join('') + '</tbody><tfoot><tr><td colspan="5">Total</td><td class="num">' + fmtR(total) + '</td><td class="num">' + fmtR(monthly) + '</td><td></td></tr></tfoot></table></div>';
    }
    html += '<form id="holding-form" class="form-row" style="margin-top:16px">' +
      '<div class="field wide"><label for="hf-name">Holding</label><input id="hf-name" required placeholder="e.g. Satrix Top 40 ETF"></div>' +
      '<div class="field"><label for="hf-provider">Provider</label><input id="hf-provider" placeholder="e.g. EasyEquities"></div>' +
      '<div class="field"><label for="hf-type">Type</label><select id="hf-type">' + listOptions(HS.HOLDING_TYPES, 'Unit trust') + '</select></div>' +
      '<div class="field"><label for="hf-class">Asset class</label><select id="hf-class">' + listOptions(HS.ASSET_CLASSES, 'Local equity') + '</select></div>' +
      '<div class="field"><label for="hf-member">Owner</label><select id="hf-member">' + memberOptions(UI.member === 'all' ? 'joint' : UI.member) + '</select></div>' +
      '<div class="field narrow"><label for="hf-value">Value (R)</label><input id="hf-value" type="number" min="0" step="100" required></div>' +
      '<button class="btn" type="submit">Add holding</button></form>' +
      '<p class="small muted" style="margin-top:10px">Have a statement from your platform? <a href="#data" data-goto="data">Import an investment sheet</a>.</p></section>';
    return html;
  }

  viewInvestments.after = function () {
    var hs = growthHoldings(holdingsInScope()).filter(function (h) { return h.history && h.history.length > 1; });
    if (!hs.length) return;
    var months = growthMonths(hs);
    if (UI.growthView === 'types') {
      var types = growthTypes();
      makeChart('c-growth', {
        type: 'line',
        data: { labels: months.map(function (m) { return HS.monthLabel(m); }), datasets: types.map(function (t, i) {
          var c = cssVar('--series-' + (i % 8 + 1));
          return { label: t, data: months.map(function (m) { return Math.round(sum(hs.filter(function (h) { return h.type === t; }), function (h) { return valueAt(h, m); })); }), borderColor: c, backgroundColor: c, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 };
        }) },
        options: baseChartOptions()
      });
      return;
    }
    var value = months.map(function (m) { return Math.round(sum(hs, function (h) { return valueAt(h, m); })); });
    var paidIn = [];
    var running = value[0];
    months.forEach(function (m, i) {
      if (i > 0) running += sum(hs, function (h) { var e = h.history.find(function (x) { return x.month === m; }); return e ? (+e.contrib || 0) : 0; });
      paidIn.push(Math.round(running));
    });
    var acc = cssVar('--accent');
    makeChart('c-growth', {
      type: 'line',
      data: { labels: months.map(function (m) { return HS.monthLabel(m); }), datasets: [
        { label: 'Portfolio value', data: value, borderColor: acc, backgroundColor: acc + '22', fill: '+1', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
        { label: 'Value + money added', data: paidIn, borderColor: cssVar('--ink-3'), borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0 }
      ] },
      options: baseChartOptions()
    });
  };

  // ---------- Holdings with several funds ----------
  function hasFunds(h) { return h.funds && h.funds.length; }
  function classSplit(h) {
    if (hasFunds(h)) return h.funds.map(function (f) { return { assetClass: f.assetClass, value: +f.value || 0 }; });
    return [{ assetClass: h.assetClass, value: +h.value || 0 }];
  }
  function syncFunds(h) {
    if (!hasFunds(h)) return;
    h.value = sum(h.funds, function (f) { return +f.value || 0; });
    h.assetClass = 'Mixed';
    touchHistory(h);
  }
  function holdingRow(h) {
    var multi = hasFunds(h), open = UI.openFunds[h.id];
    var row = '<tr data-holding="' + h.id + '"><td>' + esc(h.name) +
      (h.type === 'Property' ? '' : '<div><button type="button" class="linkish" data-toggle-funds="' + h.id + '" aria-expanded="' + !!open + '">' + (open ? '▾ ' : '▸ ') + (multi ? h.funds.length + ' funds' : 'Split into funds') + '</button></div>') + '</td>' +
      '<td>' + esc(h.provider) + '</td><td><select data-field="type">' + listOptions(HS.HOLDING_TYPES, h.type) + '</select></td>' +
      '<td>' + (multi ? '<span class="muted">Mixed · see funds</span>' : '<select data-field="assetClass">' + listOptions(HS.ASSET_CLASSES, h.assetClass) + '</select>') + '</td>' +
      '<td><select data-field="member">' + memberOptions(h.member) + '</select></td>' +
      '<td class="num">' + (multi ? '<strong>' + fmtR(h.value) + '</strong>' : '<input type="number" min="0" step="100" data-field="value" value="' + h.value + '">') + '</td>' +
      '<td class="num"><input type="number" min="0" step="50" data-field="monthly" value="' + (h.monthly || 0) + '"></td>' +
      '<td><button class="btn ghost" data-del-holding="' + h.id + '" aria-label="Remove">✕</button></td></tr>';
    if (!open) return row;
    var funds = h.funds || [];
    row += '<tr class="fund-row"><td colspan="8"><div class="fund-box"><p class="small muted">' + (multi ? 'The account value is the total of its funds. Update each fund from your statement.' : 'Add each fund in this account. Once you add funds, the account value becomes their total.') + '</p>' +
      (funds.length ? '<table><thead><tr><th>Fund</th><th>Asset class</th><th class="num">Value</th><th class="num">Share</th><th></th></tr></thead><tbody>' +
        funds.map(function (f) {
          return '<tr data-fund="' + f.id + '" data-parent="' + h.id + '"><td><input data-ffield="name" value="' + esc(f.name) + '" aria-label="Fund name"></td><td><select data-ffield="assetClass">' + listOptions(HS.ASSET_CLASSES, f.assetClass) + '</select></td>' +
            '<td class="num"><input type="number" min="0" step="100" data-ffield="value" value="' + f.value + '"></td><td class="num">' + pct(h.value ? f.value / h.value : NaN) + '</td>' +
            '<td><button class="btn ghost" data-del-fund="' + f.id + '" data-parent="' + h.id + '" aria-label="Remove fund">✕</button></td></tr>';
        }).join('') + '</tbody></table>' : '') +
      '<div class="form-row" style="margin-top:10px"><div class="field wide"><label for="fn-' + h.id + '">Fund</label><input id="fn-' + h.id + '" placeholder="e.g. Allan Gray Equity Fund"></div>' +
      '<div class="field"><label for="fc-' + h.id + '">Asset class</label><select id="fc-' + h.id + '">' + listOptions(HS.ASSET_CLASSES, HS.guessAssetClass(h.name) === 'Other' ? 'Local equity' : HS.guessAssetClass(h.name)) + '</select></div>' +
      '<div class="field narrow"><label for="fv-' + h.id + '">Value (R)</label><input id="fv-' + h.id + '" type="number" min="0" step="100"></div>' +
      '<button type="button" class="btn secondary" data-add-fund="' + h.id + '">Add fund</button></div></div></td></tr>';
    return row;
  }

  // ---------- Growth tracker ----------
  function valueAt(h, month) {
    var hist = (h.history || []).filter(function (x) { return x.month <= month; });
    return hist.length ? hist[hist.length - 1].value : 0;
  }
  function growthMonths(hs) {
    var last = THIS_MONTH;
    var hasNow = hs.some(function (h) { return h.history.some(function (x) { return x.month === THIS_MONTH; }); });
    if (!hasNow) last = HS.addMonths(THIS_MONTH, -1);
    var out = [];
    for (var i = UI.growthMonths; i >= 0; i--) out.push(HS.addMonths(last, -i));
    return out;
  }
  function touchHistory(h) {
    h.history = (h.history || []).filter(function (x) { return x.month !== THIS_MONTH; });
    h.history.push({ month: THIS_MONTH, value: +h.value || 0, contrib: +h.monthly || 0 });
  }
  function growthTypes() {
    var seen = {};
    holdingsInScope().forEach(function (h) { if (h.type !== 'Property' && h.history && h.history.length > 1) seen[h.type] = true; });
    return HS.HOLDING_TYPES.filter(function (t) { return seen[t]; });
  }
  // Which holdings the growth panel covers: everything except property, or one type
  function growthHoldings(hs) {
    var v = UI.growthView;
    if (v !== 'together' && v !== 'types') return hs.filter(function (h) { return h.type === v; });
    return hs.filter(function (h) { return h.type !== 'Property'; });
  }
  function growthPanel(allHs) {
    var types = growthTypes();
    if (UI.growthView !== 'together' && UI.growthView !== 'types' && types.indexOf(UI.growthView) < 0) UI.growthView = 'together';
    var hs = growthHoldings(allHs);
    var list = hs.filter(function (h) { return h.history && h.history.length > 1; });
    var rows = list.map(function (h) { return { h: h, g: HS.holdingGrowth(h.history, UI.growthMonths) }; }).filter(function (r) { return r.g; });
    var fin = rows.filter(function (r) { return r.h.type !== 'Property'; });
    var gain = sum(fin, function (r) { return r.g.gain; }), added = sum(fin, function (r) { return r.g.added; });
    var start = sum(fin, function (r) { return r.g.start; });
    var pctAll = start + added / 2 > 0 ? gain / (start + added / 2) : NaN;
    var seg = '<div class="seg" role="group" aria-label="Period">' + [3, 6, 12].map(function (m) { return '<button type="button" data-growth="' + m + '" aria-pressed="' + (UI.growthMonths === m) + '">' + m + ' months</button>'; }).join('') + '</div>';
    var views = [['together', 'All together'], ['types', 'Compare types']].concat(types.map(function (t) { return [t, t]; }));
    var viewRow = '<div class="btn-row" role="group" aria-label="Show" style="margin-bottom:14px">' + views.map(function (v) {
      return '<button type="button" class="chip" data-gview="' + esc(v[0]) + '" aria-pressed="' + (UI.growthView === v[0]) + '">' + esc(v[1]) + '</button>';
    }).join('') + '</div>';
    var html = '<section class="panel"><header><h3>Growth tracker</h3>' + seg + '</header>' + viewRow;
    if (!rows.length) return html + '<div class="empty">Growth appears once a holding has values for two or more months. Update values monthly, or import a statement each month.</div></section>';
    html += '<div class="grid-2"><div><div class="stat-list" style="margin-bottom:12px">' +
      '<div><span class="muted">Market growth' + (UI.growthView === 'together' || UI.growthView === 'types' ? ', excl. property' : ' · ' + esc(UI.growthView)) + '</span><strong class="num ' + (gain >= 0 ? 'delta-up' : 'delta-down') + '">' + (gain >= 0 ? '+' : '') + fmtR(gain) + '</strong></div>' +
      '<div><span class="muted">Money added</span><span class="num">' + fmtR(added) + '</span></div>' +
      '<div><span class="muted">Return over the period</span><span class="num ' + (pctAll >= 0 ? 'delta-up' : 'delta-down') + '">' + (isFinite(pctAll) ? (pctAll * 100).toFixed(1) + '%' : '–') + '</span></div></div>' +
      '<div class="chart-box"><canvas id="c-growth" aria-label="Portfolio value compared with money added"></canvas></div><div class="legend">' +
      (UI.growthView === 'types'
        ? types.map(function (t, i) { return legendItem('var(--series-' + (i % 8 + 1) + ')', t); }).join('')
        : legendItem('var(--accent)', 'Value') + legendItem('var(--ink-3)', 'Starting value + money added')) + '</div>' +
      '<p class="small muted" style="margin-top:8px">' + (UI.growthView === 'types' ? 'Each line is the total value of one investment type.' : 'The shaded gap between the lines is growth from the market rather than from your own contributions.') + '</p></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Holding</th><th class="num">Added</th><th class="num">Growth</th><th class="num">Return</th></tr></thead><tbody>' +
      rows.sort(function (a, b) { return (b.g.pct || 0) - (a.g.pct || 0); }).map(function (r) {
        var p = r.g.pct;
        return '<tr><td>' + esc(r.h.name) + '<div class="small muted">' + fmtR(r.g.start, { compact: true }) + ' → ' + fmtR(r.g.end, { compact: true }) + '</div></td><td class="num">' + fmtR(r.g.added) + '</td>' +
          '<td class="num ' + (r.g.gain >= 0 ? 'delta-up' : 'delta-down') + '">' + (r.g.gain >= 0 ? '+' : '') + fmtR(r.g.gain) + '</td>' +
          '<td class="num">' + (p == null ? '–' : '<span class="pill ' + (p >= 0 ? 'good' : 'bad') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p * 100).toFixed(1) + '%</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html + '</section>';
  }

  // ---------- Goals ----------
  function goalsInScope() { return S.goals.filter(function (g) { return inScope(g.member); }); }
  function goalCurrent(g) {
    if (g.links && g.links.length) return sum(S.holdings.filter(function (h) { return g.links.indexOf(h.id) >= 0; }), function (h) { return +h.value || 0; });
    return +g.current || 0;
  }
  function avgSpendFor(member) {
    var ms = fullMonthsBack(3);
    var es = S.entries.filter(function (e) { return member === 'joint' || member === 'all' || e.member === member; });
    var tot = 0, used = 0;
    ms.forEach(function (m) {
      var t = 0, any = false;
      es.forEach(function (e) { if (e.date.slice(0, 7) === m && kindOf(e.category) === 'spend') { t -= e.amount; any = true; } });
      if (any) { tot += t; used++; }
    });
    return used ? tot / used : 0;
  }
  function goalProjection(g) {
    return HS.projectGoal(g, { current: goalCurrent(g), thisMonth: THIS_MONTH, inflation: S.settings.inflation, avgSpend: avgSpendFor(g.member) });
  }
  var STATUS = {
    reached: { cls: 'good', icon: '✓', label: 'Reached' },
    'on-track': { cls: 'good', icon: '✓', label: 'On track' },
    close: { cls: 'warn', icon: '!', label: 'Nearly on track' },
    behind: { cls: 'bad', icon: '×', label: 'Behind' }
  };
  function viewGoals() {
    var gs = goalsInScope();
    var ps = gs.map(function (g) { return { g: g, p: goalProjection(g) }; });
    if (!UI.goalChart || !gs.some(function (g) { return g.id === UI.goalChart; })) UI.goalChart = gs.length ? gs[0].id : null;
    var onTrack = ps.filter(function (x) { return x.p.status === 'on-track' || x.p.status === 'reached'; }).length;
    var monthly = sum(gs, function (g) { return +g.monthly || 0; });
    var gap = sum(ps, function (x) { return Math.max(0, x.p.required - (+x.g.monthly || 0)); });

    var html = '<div class="view-head"><div><span class="eyebrow">Goals · ' + esc(scopeLabel()) + '</span><h2>What the family is saving for</h2></div></div>';
    html += '<div class="kpis">' +
      '<div class="kpi"><span class="eyebrow">Goals</span><span class="value">' + gs.length + '</span><span class="sub">' + onTrack + ' on track</span></div>' +
      '<div class="kpi"><span class="eyebrow">Saved towards goals</span><span class="value">' + fmtR(sum(ps, function (x) { return x.p.current; })) + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Contributing</span><span class="value">' + fmtR(monthly) + '</span><span class="sub">per month</span></div>' +
      '<div class="kpi"><span class="eyebrow">Monthly gap</span><span class="value ' + (gap > 0 ? 'delta-down' : 'delta-up') + '">' + fmtR(gap) + '</span><span class="sub">Extra needed to put every goal on track</span></div></div>';

    ['emergency', 'retirement', 'short', 'long'].forEach(function (type) {
      var list = ps.filter(function (x) { return x.g.type === type; });
      if (!list.length) return;
      html += '<section class="panel"><header><h3>' + HS.GOAL_TYPES[type].name + '</h3><span class="muted small">' + HS.GOAL_TYPES[type].hint + '</span></header><div class="goal-list">' +
        list.map(function (x) { return goalCard(x.g, x.p); }).join('') + '</div></section>';
    });
    if (!gs.length) html += '<section class="panel"><div class="empty">No goals yet. Start with an emergency fund: most planners suggest three to six months of spending.</div></section>';

    if (gs.length) {
      html += '<section class="panel"><header><h3>Projection</h3><div class="field" style="flex:0 1 260px"><select id="goal-chart" aria-label="Goal to chart">' +
        gs.map(function (g) { return '<option value="' + g.id + '"' + (g.id === UI.goalChart ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select></div></header>' +
        '<div class="chart-box tall"><canvas id="c-goal" aria-label="Goal projection"></canvas></div><div class="legend">' +
        legendItem('var(--accent)', 'At current contributions') + legendItem('var(--series-1)', 'At the amount needed') + legendItem('var(--gold)', 'Target') + '</div></section>';
    }

    // Add goal form
    var hs = holdingsInScope().filter(function (h) { return h.type !== 'Property'; });
    var t = UI.goalType;
    html += '<section class="panel"><header><h3>Add a goal</h3></header><form id="goal-form" style="display:grid;gap:12px">' +
      '<div class="seg" role="group" aria-label="Goal type">' + Object.keys(HS.GOAL_TYPES).map(function (k) { return '<button type="button" data-goaltype="' + k + '" aria-pressed="' + (t === k) + '">' + HS.GOAL_TYPES[k].name + '</button>'; }).join('') + '</div>' +
      '<div class="form-row">' +
      '<div class="field wide"><label for="gf-name">Goal</label><input id="gf-name" required value="' + (t === 'emergency' ? 'Emergency fund' : t === 'retirement' ? 'Retirement' : '') + '" placeholder="' + (t === 'short' ? 'e.g. Family holiday' : 'e.g. Kids\' education') + '"></div>' +
      '<div class="field"><label for="gf-member">For</label><select id="gf-member">' + memberOptions(UI.member === 'all' ? 'joint' : UI.member) + '</select></div>' +
      (t === 'emergency'
        ? '<div class="field narrow"><label for="gf-cover">Months of spending</label><input id="gf-cover" type="number" min="1" max="24" value="3"></div>'
        : '<div class="field"><label for="gf-target">Target (R)</label><input id="gf-target" type="number" min="0" step="1000" required></div>') +
      '<div class="field narrow"><label for="gf-date">Target date</label><input id="gf-date" type="month" min="' + THIS_MONTH + '" value="' + HS.addMonths(THIS_MONTH, t === 'short' ? 24 : t === 'emergency' ? 24 : t === 'retirement' ? 300 : 120) + '" required></div>' +
      '<div class="field narrow"><label for="gf-monthly">Monthly (R)</label><input id="gf-monthly" type="number" min="0" step="100" value="0"></div>' +
      '<div class="field narrow"><label for="gf-return">Return % a year</label><input id="gf-return" type="number" min="0" max="25" step="0.5" value="' + (t === 'short' || t === 'emergency' ? 7 : 10) + '"></div>' +
      '</div><div class="form-row">' +
      '<div class="field narrow"><label for="gf-current">Already saved (R)</label><input id="gf-current" type="number" min="0" step="100" value="0"></div>' +
      (t === 'emergency' ? '' : '<label class="check"><input type="checkbox" id="gf-today"' + (t === 'short' ? '' : ' checked') + '> Target is in today\'s money (grow it by ' + S.settings.inflation + '% inflation)</label>') +
      '</div>' +
      (hs.length ? '<div><span class="small muted" style="font-weight:600">Or link holdings that count towards it (replaces "already saved")</span><div class="btn-row" style="margin-top:6px">' +
        hs.map(function (h) { return '<label class="check chip"><input type="checkbox" name="gf-link" value="' + h.id + '"> ' + esc(h.name) + '</label>'; }).join('') + '</div></div>' : '') +
      '<div><button class="btn" type="submit">Add goal</button></div></form></section>';
    return html;
  }
  function goalCard(g, p) {
    var st = STATUS[p.status];
    var msg = p.status === 'reached' ? 'Target reached.'
      : p.status === 'on-track' ? 'On track to reach ' + fmtR(p.target) + (p.reachIn != null ? ' by ' + HS.monthLabel(HS.addMonths(THIS_MONTH, p.reachIn), true) : '') + '.'
      : 'Save ' + fmtR(p.required) + ' a month (' + fmtR(p.required - (+g.monthly || 0)) + ' more) to reach it on time.';
    var linked = (g.links || []).map(function (id) { var h = S.holdings.find(function (x) { return x.id === id; }); return h ? h.name : null; }).filter(Boolean);
    var hs = S.holdings.filter(function (h) { return h.type !== 'Property' && (inScope(h.member) || (g.links || []).indexOf(h.id) >= 0); });
    return '<article class="goal" data-goal="' + g.id + '">' +
      '<div class="goal-head"><div style="min-width:0"><strong>' + esc(g.name) + '</strong><div class="small muted"><span class="dot" style="background:' + memberColor(g.member) + '"></span> ' + esc(memberName(g.member)) + ' · by ' + HS.monthLabel(g.targetDate, true) + ' (' + fmtMonths(p.months) + ')</div></div>' +
      '<span class="pill ' + st.cls + '">' + st.icon + ' ' + st.label + '</span></div>' +
      '<div class="barrow"><span class="label num">' + fmtR(p.current) + '</span><span class="amt">' + pct(p.progress) + ' of ' + fmtR(p.target) + '</span><div class="track"><div class="fill ' + st.cls + '" style="width:' + (p.progress * 100).toFixed(1) + '%"></div></div></div>' +
      '<div class="goal-figs">' +
      '<div><span class="eyebrow">Projected</span><span class="num">' + fmtR(p.projected) + '</span></div>' +
      '<div><span class="eyebrow">Monthly now</span><span class="num">' + fmtR(+g.monthly || 0) + '</span></div>' +
      '<div><span class="eyebrow">Monthly needed</span><span class="num">' + fmtR(p.required) + '</span></div>' +
      '</div>' +
      '<p class="small">' + msg + (g.todayMoney && g.type !== 'emergency' ? ' <span class="muted">Target is ' + fmtR(p.baseTarget) + ' in today\'s money.</span>' : '') + (g.type === 'emergency' ? ' <span class="muted">' + (g.monthsCover || 3) + ' months × ' + fmtR(p.baseTarget / (g.monthsCover || 3)) + ' average spending.</span>' : '') + '</p>' +
      (linked.length ? '<p class="small muted">Counts: ' + linked.map(esc).join(', ') + '</p>' : '') +
      '<details><summary class="small">Edit goal</summary><div class="form-row" style="margin-top:10px">' +
      (g.type === 'emergency'
        ? '<div class="field narrow"><label>Months of spending</label><input type="number" min="1" max="24" data-gfield="monthsCover" value="' + (g.monthsCover || 3) + '"></div>'
        : '<div class="field"><label>Target (R)</label><input type="number" min="0" step="1000" data-gfield="target" value="' + (+g.target || 0) + '"></div>') +
      '<div class="field narrow"><label>Target date</label><input type="month" data-gfield="targetDate" value="' + g.targetDate + '"></div>' +
      '<div class="field narrow"><label>Monthly (R)</label><input type="number" min="0" step="100" data-gfield="monthly" value="' + (+g.monthly || 0) + '"></div>' +
      '<div class="field narrow"><label>Return %</label><input type="number" min="0" max="25" step="0.5" data-gfield="returnPct" value="' + (+g.returnPct || 0) + '"></div>' +
      (linked.length ? '' : '<div class="field narrow"><label>Saved so far (R)</label><input type="number" min="0" step="100" data-gfield="current" value="' + (+g.current || 0) + '"></div>') +
      '</div><div class="btn-row" style="margin-top:8px">' + hs.map(function (h) { return '<label class="check chip"><input type="checkbox" data-glink="' + h.id + '"' + ((g.links || []).indexOf(h.id) >= 0 ? ' checked' : '') + '> ' + esc(h.name) + '</label>'; }).join('') + '</div>' +
      '<div class="btn-row" style="margin-top:8px">' + (g.type !== 'emergency' ? '<label class="check"><input type="checkbox" data-gfield="todayMoney"' + (g.todayMoney ? ' checked' : '') + '> Target in today\'s money</label>' : '') +
      '<button type="button" class="btn ghost" data-del-goal="' + g.id + '">Delete goal</button></div></details></article>';
  }
  viewGoals.after = function () {
    var g = S.goals.find(function (x) { return x.id === UI.goalChart; });
    if (!g) return;
    var p = goalProjection(g);
    var labels = p.series.map(function (x) { return HS.monthLabel(HS.addMonths(THIS_MONTH, x.m)); });
    var acc = cssVar('--accent');
    var behind = p.required > (+g.monthly || 0);
    var sets = [
      { label: 'At current contributions', data: p.series.map(function (x) { return Math.round(x.value); }), borderColor: acc, backgroundColor: acc + '22', fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
      { label: 'Target', data: p.series.map(function () { return Math.round(p.target); }), borderColor: cssVar('--gold'), borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, fill: false }
    ];
    if (behind) sets.splice(1, 0, { label: 'At the amount needed', data: p.series.map(function (x) { return Math.round(x.path); }), borderColor: cssVar('--series-1'), borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.2 });
    makeChart('c-goal', { type: 'line', data: { labels: labels, datasets: sets }, options: baseChartOptions({ scales: Object.assign(baseChartOptions().scales, { x: { grid: { display: false }, border: { color: cssVar('--line') }, ticks: { color: cssVar('--ink-2'), maxTicksLimit: 8, font: { size: 11 } } } }) }) });
  };

  // ---------- Debt ----------
  function viewDebt() {
    var ds = debtsInScope();
    var total = sum(ds, function (d) { return +d.balance || 0; });
    var instal = sum(ds, function (d) { return +d.instalment || 0; });
    var wRate = total ? sum(ds, function (d) { return d.balance * d.rate; }) / total : 0;
    var monthlyInterest = sum(ds, function (d) { return d.balance * d.rate / 1200; });

    var html = '<div class="view-head"><div><span class="eyebrow">Debt · ' + esc(scopeLabel()) + '</span><h2>What the family owes</h2></div></div>';
    html += '<div class="kpis">' +
      '<div class="kpi"><span class="eyebrow">Total debt</span><span class="value">' + fmtR(total) + '</span><span class="sub">' + ds.length + ' accounts</span></div>' +
      '<div class="kpi"><span class="eyebrow">Monthly instalments</span><span class="value">' + fmtR(instal) + '</span></div>' +
      '<div class="kpi"><span class="eyebrow">Average interest rate</span><span class="value">' + wRate.toFixed(2) + '%</span><span class="sub">Weighted by balance</span></div>' +
      '<div class="kpi"><span class="eyebrow">Interest this month</span><span class="value delta-down">' + fmtR(monthlyInterest) + '</span><span class="sub">Approximate</span></div></div>';

    html += '<section class="panel"><header><h3>Accounts</h3><span class="muted small">Update balances from your latest statements</span></header>';
    if (ds.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Owner</th><th class="num">Balance</th><th class="num">Rate %</th><th class="num">Instalment</th><th class="num">Paid off in</th><th></th></tr></thead><tbody>' +
        ds.slice().sort(function (a, b) { return b.rate - a.rate; }).map(function (d) {
          var sim = HS.simulatePayoff([d], 'avalanche', 0);
          return '<tr data-debt="' + d.id + '"><td>' + esc(d.name) + '<div class="small muted">' + esc(d.lender || '') + '</div></td><td><select data-field="type">' + listOptions(HS.DEBT_TYPES, d.type) + '</select></td>' +
            '<td><select data-field="member">' + memberOptions(d.member) + '</select></td>' +
            '<td class="num"><input type="number" min="0" step="100" data-field="balance" value="' + d.balance + '"></td>' +
            '<td class="num"><input type="number" min="0" step="0.25" data-field="rate" value="' + d.rate + '" style="width:80px"></td>' +
            '<td class="num"><input type="number" min="0" step="50" data-field="instalment" value="' + d.instalment + '"></td>' +
            '<td class="num">' + (sim.months ? fmtMonths(sim.months) : '<span class="pill bad">× Never</span>') + '</td>' +
            '<td><button class="btn ghost" data-del-debt="' + d.id + '" aria-label="Remove">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '<form id="debt-form" class="form-row" style="margin-top:16px">' +
      '<div class="field wide"><label for="df-name">Account</label><input id="df-name" required placeholder="e.g. Woolworths credit card"></div>' +
      '<div class="field"><label for="df-type">Type</label><select id="df-type">' + listOptions(HS.DEBT_TYPES, 'Credit card') + '</select></div>' +
      '<div class="field"><label for="df-member">Owner</label><select id="df-member">' + memberOptions(UI.member === 'all' ? 'joint' : UI.member) + '</select></div>' +
      '<div class="field narrow"><label for="df-balance">Balance (R)</label><input id="df-balance" type="number" min="0" required></div>' +
      '<div class="field narrow"><label for="df-rate">Rate %</label><input id="df-rate" type="number" min="0" step="0.25" required></div>' +
      '<div class="field narrow"><label for="df-inst">Instalment (R)</label><input id="df-inst" type="number" min="0" required></div>' +
      '<button class="btn" type="submit">Add debt</button></form></section>';

    if (ds.length) {
      var c = HS.comparePayoff(ds, UI.extra);
      var pick = c[UI.method];
      var col = function (title, r, isPick) {
        var saved = c.minimumOnly.totalInterest - r.totalInterest;
        return '<div class="panel" style="box-shadow:none;' + (isPick ? 'border-color:var(--accent);border-width:2px' : '') + '"><span class="eyebrow">' + title + '</span>' +
          '<div class="stat-list" style="margin-top:8px"><div><span class="muted">Debt-free</span><strong class="num">' + (r.months ? HS.monthLabel(HS.addMonths(THIS_MONTH, r.months), true) : 'Never') + '</strong></div>' +
          '<div><span class="muted">Time</span><span class="num">' + (r.months ? fmtMonths(r.months) : '–') + '</span></div>' +
          '<div><span class="muted">Total interest</span><span class="num">' + fmtR(r.totalInterest) + '</span></div>' +
          '<div><span class="muted">Interest saved</span><span class="num ' + (saved > 0 ? 'delta-up' : '') + '">' + (saved > 0 ? fmtR(saved) : '–') + '</span></div></div></div>';
      };
      html += '<section class="panel"><header><h3>Payoff planner</h3><span class="muted small">Pay every minimum, then put the extra on one target debt at a time</span></header>' +
        '<div class="form-row" style="margin-bottom:16px"><div class="field narrow"><label for="pl-extra">Extra per month (R)</label><input id="pl-extra" type="number" min="0" step="250" value="' + UI.extra + '"></div>' +
        '<div class="field"><span>Method</span><div class="seg" role="group" aria-label="Method"><button type="button" data-method="avalanche" aria-pressed="' + (UI.method === 'avalanche') + '">Avalanche · highest rate first</button><button type="button" data-method="snowball" aria-pressed="' + (UI.method === 'snowball') + '">Snowball · smallest balance first</button></div></div></div>' +
        '<div class="grid-3">' + col('Minimums only', c.minimumOnly, false) + col('Snowball', c.snowball, UI.method === 'snowball') + col('Avalanche', c.avalanche, UI.method === 'avalanche') + '</div>' +
        '<div class="grid-2" style="margin-top:16px"><div><div class="chart-box tall"><canvas id="c-payoff" aria-label="Total debt balance over time"></canvas></div><div class="legend">' +
        legendItem('var(--ink-3)', 'Minimums only') + legendItem('var(--series-2)', 'Snowball') + legendItem('var(--series-1)', 'Avalanche') + '</div></div>' +
        '<div><h3 style="margin-bottom:10px">Payoff order · ' + (UI.method === 'avalanche' ? 'Avalanche' : 'Snowball') + '</h3><ol class="stat-list" style="padding-left:18px;margin:0">' +
        pick.order.map(function (o) { return '<li><div style="display:flex;justify-content:space-between;gap:12px"><span>' + esc(o.name) + '</span><span class="num muted">' + HS.monthLabel(HS.addMonths(THIS_MONTH, o.month), true) + '</span></div></li>'; }).join('') +
        '</ol><p class="small muted" style="margin-top:12px">Avalanche saves the most interest. Snowball clears small accounts sooner, which many families find easier to stick to.</p></div></div></section>';
    }
    return html;
  }
  viewDebt.after = function () {
    var ds = debtsInScope();
    if (!ds.length) return;
    var c = HS.comparePayoff(ds, UI.extra);
    var len = Math.max(c.minimumOnly.timeline.length, c.snowball.timeline.length, c.avalanche.timeline.length);
    var labels = [];
    for (var i = 0; i < len; i++) labels.push(HS.monthLabel(HS.addMonths(THIS_MONTH, i)));
    var ds2 = function (label, r, color, dash) {
      var picked = label.toLowerCase() === UI.method;
      return { label: label, data: r.timeline.map(Math.round), borderColor: color, backgroundColor: color, borderWidth: picked ? 3 : 1.5, order: picked ? 0 : 1, pointRadius: 0, pointHoverRadius: 4, borderDash: dash || [], tension: 0.1 };
    };
    makeChart('c-payoff', {
      type: 'line',
      data: { labels: labels, datasets: [ds2('Minimums only', c.minimumOnly, cssVar('--ink-3'), [4, 4]), ds2('Snowball', c.snowball, cssVar('--series-2')), ds2('Avalanche', c.avalanche, cssVar('--series-1'))] },
      options: baseChartOptions({ scales: Object.assign(baseChartOptions().scales, { x: Object.assign(baseChartOptions().scales.x, { ticks: { color: cssVar('--ink-2'), maxTicksLimit: 8, font: { size: 11 } } }) }) })
    });
  };
  function fmtMonths(m) {
    var y = Math.floor(m / 12), r = m % 12;
    return (y ? y + ' yr ' : '') + (r ? r + ' mo' : (y ? '' : '0 mo'));
  }

  // ---------- Import & settings ----------
  function bankImportPanel() {
    var html = '<section class="panel"><header><h3>Upload bank statement (CSV)</h3><span class="muted small">FNB tested · others detected automatically</span></header>';
    if (!UI.pendingBank) {
      html += '<div class="form-row" style="margin-bottom:12px"><div class="field"><label for="imp-member">Whose account is this?</label><select id="imp-member">' + memberOptions(UI.member === 'all' ? (S.members[0] ? S.members[0].id : 'joint') : UI.member) + '</select></div></div>' +
        '<label class="dropzone" id="drop-bank" for="file-bank"><strong>Drop a CSV file here</strong><span class="muted small">or click to choose. In online banking, download your transaction history as CSV.</span></label>' +
        '<input type="file" id="file-bank" accept=".csv,.txt,text/csv" hidden>';
    } else {
      var p = UI.pendingBank;
      var counts = {};
      p.rows.forEach(function (r) { if (!r.dup) counts[r.category] = (counts[r.category] || 0) + 1; });
      var fresh = p.rows.filter(function (r) { return !r.dup; });
      var dates = p.rows.map(function (r) { return r.date; }).sort();
      html += '<div class="stat-list"><div><span class="muted">Bank</span><strong>' + esc(p.bank) + ' ' + esc(p.account) + '</strong></div>' +
        '<div><span class="muted">Period</span><span class="num">' + (dates.length ? dates[0] + ' → ' + dates[dates.length - 1] : '–') + '</span></div>' +
        '<div><span class="muted">New transactions</span><strong class="num">' + fresh.length + '</strong></div>' +
        '<div><span class="muted">Already imported (skipped)</span><span class="num">' + (p.rows.length - fresh.length) + '</span></div>' +
        '<div><span class="muted">Owner</span><span>' + esc(memberName(p.member)) + '</span></div></div>' +
        '<h3 style="margin:14px 0 8px">Sorted into</h3><div class="btn-row">' + Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) { return '<span class="pill neutral">' + esc(HS.CAT_BY_ID[k].name) + ' · ' + counts[k] + '</span>'; }).join('') + '</div>' +
        '<div class="table-wrap" style="margin-top:12px;max-height:260px;overflow:auto"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>' +
        fresh.slice(0, 40).map(function (r) { return '<tr><td class="num">' + r.date + '</td><td class="desc">' + esc(HS.cleanDescription(r.description)) + '</td><td>' + esc(HS.CAT_BY_ID[r.category].name) + '</td><td class="num ' + (r.amount > 0 ? 'pos' : '') + '">' + fmtR(r.amount, { cents: true }) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="small muted" style="margin:8px 0 12px">You can change any category after importing. The app remembers your changes for next time.</p>' +
        '<div class="btn-row"><button class="btn" data-action="confirm-bank"' + (fresh.length ? '' : ' disabled') + '>Import ' + fresh.length + ' transactions</button><button class="btn secondary" data-action="cancel-bank">Cancel</button></div>';
    }
    return html + '</section>';
  }

  function viewData() {
    var html = '<div class="view-head"><div><span class="eyebrow">Import &amp; settings</span><h2>Bring in your figures</h2></div></div>';

    // Bank statement
    html += '<div class="grid-2">' + bankImportPanel();

    // Investment sheet
    html += '<section class="panel"><header><h3>Investment sheet</h3><span class="muted small">CSV or Excel</span></header>';
    if (!UI.pendingHoldings) {
      html += '<div class="form-row" style="margin-bottom:12px"><div class="field"><label for="imp-h-member">Owner (if the sheet has no owner column)</label><select id="imp-h-member">' + memberOptions(UI.member === 'all' ? 'joint' : UI.member) + '</select></div></div>' +
        '<label class="dropzone" id="drop-hold" for="file-hold"><strong>Drop a sheet here</strong><span class="muted small">One row per fund or holding, with a name column and a value column. Add an Account column to group several funds into one account. Provider, type, asset class, owner and monthly contribution are optional.</span></label>' +
        '<input type="file" id="file-hold" accept=".csv,.xlsx,.xls,.txt" hidden>';
    } else {
      var hp = UI.pendingHoldings;
      html += '<div class="table-wrap" style="max-height:300px;overflow:auto"><table><thead><tr><th>Holding</th><th>Type</th><th>Owner</th><th class="num">Value</th><th>Action</th></tr></thead><tbody>' +
        hp.map(function (h) { return '<tr><td>' + esc(h.name) + '<div class="small muted">' + esc(h.provider) + (h.funds ? ' · ' + h.funds.length + ' funds' : '') + '</div></td><td>' + esc(h.type) + '</td><td>' + esc(memberName(h.member)) + '</td><td class="num">' + fmtR(h.value) + '</td><td>' + (h.existing ? '<span class="pill neutral">Update value</span>' : '<span class="pill good">New</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="btn-row" style="margin-top:12px"><button class="btn" data-action="confirm-hold">Import ' + hp.length + ' holdings</button><button class="btn secondary" data-action="cancel-hold">Cancel</button></div>';
    }
    html += '</section></div>';

    // Net worth snapshot + members + settings
    var nwAll = (function () { var keep = UI.member; UI.member = 'all'; var v = netWorthNow(); UI.member = keep; return v; })();
    var has = S.snapshots.some(function (s) { return s.month === THIS_MONTH; });
    html += '<div class="grid-2"><section class="panel"><header><h3>Net worth history</h3><span class="muted small">' + S.snapshots.length + ' months saved</span></header>' +
      '<p class="muted" style="margin-bottom:12px">Save a snapshot once a month, after updating investment values and debt balances. The Overview chart is built from these.</p>' +
      '<div class="stat-list" style="margin-bottom:12px"><div><span class="muted">Family net worth today</span><strong class="num">' + fmtR(nwAll.net) + '</strong></div></div>' +
      '<button class="btn" data-action="snapshot">' + (has ? 'Update ' : 'Save ') + HS.monthLabel(THIS_MONTH, true) + ' snapshot</button></section>';

    html += '<section class="panel"><header><h3>Family members</h3></header><div style="display:grid;gap:8px">' +
      S.members.map(function (m) {
        return '<div class="form-row" data-member-row="' + m.id + '"><span class="dot" style="background:' + memberColor(m.id) + ';margin-bottom:12px"></span><div class="field"><input aria-label="Name" data-field="name" value="' + esc(m.name) + '"></div>' +
          (S.members.length > 1 ? '<button class="btn ghost" data-del-member="' + m.id + '">Remove</button>' : '') + '</div>';
      }).join('') + '</div>' +
      '<form id="member-form" class="form-row" style="margin-top:12px"><div class="field"><label for="mem-name">Add a member</label><input id="mem-name" placeholder="Name" required></div><button class="btn secondary" type="submit">Add</button></form>' +
      '<p class="small muted" style="margin-top:10px">Shared accounts belong to "Joint". Removing a member moves their records to Joint.</p></section></div>';

    html += '<div class="grid-2"><section class="panel"><header><h3>Settings</h3></header><div class="form-row">' +
      '<div class="field wide"><label for="set-name">Household name</label><input id="set-name" value="' + esc(S.household.name) + '"></div>' +
      '<div class="field"><label for="set-tfsa">TFSA annual limit (R)</label><input id="set-tfsa" type="number" min="0" step="1000" value="' + S.settings.tfsaAnnualLimit + '"></div>' +
      '<div class="field"><label for="set-tfsa-l">TFSA lifetime limit (R)</label><input id="set-tfsa-l" type="number" min="0" step="1000" value="' + S.settings.tfsaLifetimeLimit + '"></div>' +
      '<div class="field narrow"><label for="set-infl">Inflation % (for goals)</label><input id="set-infl" type="number" min="0" max="20" step="0.5" value="' + S.settings.inflation + '"></div></div>' +
      '<p class="small muted" style="margin-top:10px">Check the current TFSA limits on the SARS website each tax year.</p></section>';

    html += '<section class="panel"><header><h3>Your data</h3></header><p class="muted" style="margin-bottom:12px">Everything is stored in this browser only. Save a backup file to move to another device.</p>' +
      '<div class="btn-row"><button class="btn secondary" data-action="export">Save backup file</button><label class="btn secondary" for="file-restore">Restore backup</label><input type="file" id="file-restore" accept=".json,application/json" hidden></div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn secondary" data-action="ask-sample">Load sample family</button><button class="btn danger" data-action="ask-empty">Start with an empty household</button></div>' +
      (UI.confirm ? '<div class="confirm" style="margin-top:12px"><span>' + (UI.confirm === 'empty' ? 'This deletes all data in this browser.' : 'This replaces your data with the sample family.') + ' Continue?</span><button class="btn danger" data-action="do-' + UI.confirm + '">Yes, continue</button><button class="btn secondary" data-action="cancel-confirm">Cancel</button></div>' : '') +
      '</section></div>';
    return html;
  }
  viewMoney.after = function () { wireDrop('drop-bank', 'file-bank', handleBankFile); };
  viewData.after = function () {
    wireDrop('drop-bank', 'file-bank', handleBankFile);
    wireDrop('drop-hold', 'file-hold', handleHoldingsFile);
  };

  function wireDrop(zoneId, inputId, handler) {
    var z = document.getElementById(zoneId), inp = document.getElementById(inputId);
    if (!z || !inp) return;
    inp.addEventListener('change', function () { if (inp.files[0]) handler(inp.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); }); });
    z.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) handler(f); });
  }

  function handleBankFile(file) {
    if (/\.pdf$/i.test(file.name)) { toast('PDF statements are not supported yet. Download the CSV version from online banking.'); return; }
    var member = ($('#imp-member') || {}).value || 'joint';
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var res = HS.parseBankCSV(reader.result);
        var seen = {};
        S.entries.forEach(function (e) { seen[e.date + '|' + e.amount + '|' + HS.cleanDescription(e.description)] = true; });
        res.rows.forEach(function (r) {
          r.category = HS.categorise(r.description, r.amount, S.learned);
          r.dup = !!seen[r.date + '|' + r.amount + '|' + HS.cleanDescription(r.description)];
        });
        UI.pendingBank = { bank: res.bank, account: res.account, rows: res.rows, member: member, file: file.name };
        render();
      } catch (err) { toast(err.message); }
    };
    reader.readAsText(file);
  }

  function handleHoldingsFile(file) {
    var member = ($('#imp-h-member') || {}).value || 'joint';
    var reader = new FileReader();
    var isExcel = /\.xlsx?$/i.test(file.name);
    reader.onload = function () {
      try {
        var rows;
        if (isExcel) {
          if (!window.XLSX) throw new Error('The Excel reader did not load. Save the sheet as CSV and try again.');
          var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
        } else rows = HS.toRows(reader.result);
        var list = HS.parseHoldingsTable(rows);
        if (!list.length) throw new Error('No holdings with a value were found in that sheet.');
        list.forEach(function (h) {
          var named = S.members.find(function (m) { return h.memberName && m.name.toLowerCase() === h.memberName.toLowerCase(); });
          h.member = named ? named.id : (/joint|family/i.test(h.memberName) ? 'joint' : member);
          h.existing = S.holdings.find(function (x) { return x.name.toLowerCase() === h.name.toLowerCase() && (x.provider || '').toLowerCase() === (h.provider || '').toLowerCase(); });
        });
        // Rows that share an account/portfolio become one holding with several funds
        var grouped = [], byAcc = {};
        list.forEach(function (h) {
          if (!h.account) { grouped.push(h); return; }
          var key = (h.provider + '|' + h.account).toLowerCase();
          if (!byAcc[key]) {
            byAcc[key] = { name: h.account, provider: h.provider, type: h.type, assetClass: 'Mixed', member: h.member, monthly: 0, value: 0, funds: [] };
            grouped.push(byAcc[key]);
          }
          var g = byAcc[key];
          g.funds.push({ id: HS.uid(), name: h.name, assetClass: h.assetClass, value: h.value });
          g.value += h.value; g.monthly += h.monthly || 0;
          if (g.type === 'Other' && h.type !== 'Other') g.type = h.type;
        });
        grouped.forEach(function (h) {
          h.existing = S.holdings.find(function (x) { return x.name.toLowerCase() === h.name.toLowerCase() && (x.provider || '').toLowerCase() === (h.provider || '').toLowerCase(); });
        });
        UI.pendingHoldings = grouped;
        render();
      } catch (err) { toast(err.message); }
    };
    if (isExcel) reader.readAsArrayBuffer(file); else reader.readAsText(file);
  }

  function recordSnapshot() {
    var by = {};
    owners().forEach(function (id) {
      by[id] = {
        assets: sum(S.holdings.filter(function (h) { return h.member === id; }), function (h) { return +h.value || 0; }),
        liabilities: sum(S.debts.filter(function (d) { return d.member === id; }), function (d) { return +d.balance || 0; })
      };
    });
    S.snapshots = S.snapshots.filter(function (s) { return s.month !== THIS_MONTH; });
    S.snapshots.push({ month: THIS_MONTH, byMember: by });
  }

  function emptyState() {
    return { version: 1, isSample: false, household: { name: 'My family' }, members: [{ id: 'm1', name: 'Partner 1', color: 1 }, { id: 'm2', name: 'Partner 2', color: 2 }], entries: [], budgets: [], holdings: [], debts: [], snapshots: [], goals: [], incomePlan: [], learned: {}, settings: { tfsaAnnualLimit: 36000, tfsaLifetimeLimit: 500000, inflation: 5 } };
  }

  // ---------- Events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a, label');
    if (!t) return;
    var d = t.dataset;
    if (d.tab) { UI.tab = d.tab; UI.confirm = null; persistUI(); render(); window.scrollTo(0, 0); return; }
    if (d.goto) { e.preventDefault(); UI.tab = d.goto; persistUI(); render(); window.scrollTo(0, 0); return; }
    if (d.member && t.classList.contains('chip')) { UI.member = d.member; persistUI(); render(); return; }
    if (d.step) { var nm = HS.addMonths(UI.month, +d.step); if (nm <= THIS_MONTH) { UI.month = nm; render(); } return; }
    if (d.method) { UI.method = d.method; render(); return; }
    if (d.growth) { UI.growthMonths = +d.growth; render(); return; }
    if (d.goaltype) { UI.goalType = d.goaltype; render(); return; }
    if (d.delGoal) { S.goals = S.goals.filter(function (x) { return x.id !== d.delGoal; }); persist(); render(); toast('Goal deleted'); return; }
    if (d.delEntry) { S.entries = S.entries.filter(function (x) { return x.id !== d.delEntry; }); persist(); render(); toast('Transaction deleted'); return; }
    if (d.toggleFunds) { UI.openFunds[d.toggleFunds] = !UI.openFunds[d.toggleFunds]; render(); return; }
    if (d.addFund) {
      var ph = S.holdings.find(function (x) { return x.id === d.addFund; });
      var fname = ($('#fn-' + d.addFund).value || '').trim(), fval = +$('#fv-' + d.addFund).value || 0;
      if (!ph || !fname) { toast('Enter a fund name'); return; }
      ph.funds = ph.funds || [];
      ph.funds.push({ id: HS.uid(), name: fname, assetClass: $('#fc-' + d.addFund).value, value: fval });
      syncFunds(ph); persist(); render(); toast('Fund added'); return;
    }
    if (d.delFund) {
      var ph2 = S.holdings.find(function (x) { return x.id === d.parent; });
      if (ph2) {
        ph2.funds = ph2.funds.filter(function (f) { return f.id !== d.delFund; });
        if (ph2.funds.length) syncFunds(ph2); else { delete ph2.funds; ph2.assetClass = 'Other'; }
        persist(); render();
      }
      return;
    }
    if (d.gview) { UI.growthView = d.gview; render(); return; }
    if (d.delIncome) { S.incomePlan = S.incomePlan.filter(function (x) { return x.id !== d.delIncome; }); persist(); render(); return; }
    if (d.delBudget) { S.budgets = S.budgets.filter(function (x) { return x.id !== d.delBudget; }); persist(); render(); return; }
    if (d.delHolding) { S.holdings = S.holdings.filter(function (x) { return x.id !== d.delHolding; }); persist(); render(); return; }
    if (d.delDebt) { S.debts = S.debts.filter(function (x) { return x.id !== d.delDebt; }); persist(); render(); return; }
    if (d.quickBudget) { S.budgets.push({ id: HS.uid(), category: d.quickBudget, member: UI.member, amount: +d.amount }); persist(); render(); toast('Budget line added'); return; }
    if (d.delMember) {
      var id = d.delMember;
      ['entries', 'holdings', 'debts'].forEach(function (k) { S[k].forEach(function (x) { if (x.member === id) x.member = 'joint'; }); });
      S.budgets.forEach(function (b) { if (b.member === id) b.member = 'all'; });
      S.members = S.members.filter(function (m) { return m.id !== id; });
      if (UI.member === id) UI.member = 'all';
      persist(); render(); return;
    }
    switch (d.action) {
      case 'confirm-bank':
        var p = UI.pendingBank, n = 0;
        p.rows.forEach(function (r) { if (!r.dup) { n++; S.entries.push({ id: HS.uid(), date: r.date, amount: r.amount, description: r.description, category: r.category, member: p.member, source: 'import', account: p.bank + ' ' + p.account }); } });
        UI.pendingBank = null; S.isSample = false; persist();
        var months = p.rows.map(function (r) { return r.date.slice(0, 7); }).sort();
        if (months.length) UI.month = months[months.length - 1];
        UI.tab = 'money'; persistUI(); render(); toast(n + ' transactions imported'); break;
      case 'cancel-bank': UI.pendingBank = null; render(); break;
      case 'confirm-hold':
        UI.pendingHoldings.forEach(function (h) {
          if (h.existing) { h.existing.value = h.value; if (h.monthly) h.existing.monthly = h.monthly; if (h.funds) { h.existing.funds = h.funds; h.existing.assetClass = 'Mixed'; } touchHistory(h.existing); }
          else { var nh = { id: HS.uid(), name: h.name, provider: h.provider, type: h.type, assetClass: h.assetClass, member: h.member, value: h.value, monthly: h.monthly || 0 }; if (h.funds) nh.funds = h.funds; touchHistory(nh); S.holdings.push(nh); }
        });
        UI.pendingHoldings = null; S.isSample = false; persist(); UI.tab = 'investments'; persistUI(); render(); toast('Holdings imported'); break;
      case 'cancel-hold': UI.pendingHoldings = null; render(); break;
      case 'snapshot': recordSnapshot(); persist(); render(); toast('Net worth snapshot saved'); break;
      case 'export':
        try {
          var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clan-capital-backup-' + TODAY.toISOString().slice(0, 10) + '.json';
          document.body.appendChild(a); a.click(); a.remove();
          toast('Backup file saved');
        } catch (err) { toast('This browser blocked the download.'); }
        break;
      case 'ask-sample': UI.confirm = 'sample'; render(); break;
      case 'ask-empty': UI.confirm = 'empty'; render(); break;
      case 'cancel-confirm': UI.confirm = null; render(); break;
      case 'do-sample': S = HS.buildSample(new Date()); persist(); UI.confirm = null; UI.member = 'all'; render(); toast('Sample family loaded'); break;
      case 'do-empty': S = emptyState(); persist(); UI.confirm = null; UI.member = 'all'; render(); toast('Started an empty household'); break;
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    var row;
    if ((row = el.closest('[data-entry]')) && el.dataset.field) {
      var en = S.entries.find(function (x) { return x.id === row.dataset.entry; });
      if (!en) return;
      if (el.dataset.field === 'category' && UI.applySimilar) {
        var key = HS.ruleKey(en.description);
        var n = 0;
        S.entries.forEach(function (x) { if (x.source !== 'manual' && HS.ruleKey(x.description) === key) { x.category = el.value; n++; } });
        S.learned[key] = { category: el.value };
        en.category = el.value;
        toast(n > 1 ? 'Updated ' + n + ' similar transactions. Future imports will match.' : 'Category saved. Future imports will match.');
      } else en[el.dataset.field] = el.value;
      persist(); render(); return;
    }
    if ((row = el.closest('[data-income]')) && el.dataset.field) {
      var il = S.incomePlan.find(function (x) { return x.id === row.dataset.income; });
      if (il) { il.amount = Math.max(0, +el.value || 0); persist(); render(); }
      return;
    }
    if ((row = el.closest('[data-budget]')) && el.dataset.field) {
      var b = S.budgets.find(function (x) { return x.id === row.dataset.budget; });
      if (b) { b.amount = Math.max(0, +el.value || 0); persist(); render(); }
      return;
    }
    if ((row = el.closest('[data-fund]')) && el.dataset.ffield) {
      var fh = S.holdings.find(function (x) { return x.id === row.dataset.parent; });
      var fd = fh && fh.funds.find(function (x) { return x.id === row.dataset.fund; });
      if (fd) { fd[el.dataset.ffield] = el.type === 'number' ? (+el.value || 0) : el.value; syncFunds(fh); persist(); render(); }
      return;
    }
    if ((row = el.closest('[data-holding]')) && el.dataset.field) {
      var h = S.holdings.find(function (x) { return x.id === row.dataset.holding; });
      if (h) {
        h[el.dataset.field] = el.type === 'number' ? (+el.value || 0) : el.value;
        if (el.dataset.field === 'value' || el.dataset.field === 'monthly') touchHistory(h);
        persist(); render();
      }
      return;
    }
    if ((row = el.closest('[data-goal]')) && (el.dataset.gfield || el.dataset.glink)) {
      var g = S.goals.find(function (x) { return x.id === row.dataset.goal; });
      if (!g) return;
      if (el.dataset.glink) {
        g.links = (g.links || []).filter(function (id) { return id !== el.dataset.glink; });
        if (el.checked) g.links.push(el.dataset.glink);
      } else if (el.type === 'checkbox') g[el.dataset.gfield] = el.checked;
      else g[el.dataset.gfield] = el.type === 'number' ? (+el.value || 0) : el.value;
      persist(); render();
      var open = document.querySelector('[data-goal="' + g.id + '"] details'); if (open) open.open = true;
      return;
    }
    if ((row = el.closest('[data-debt]')) && el.dataset.field) {
      var dd = S.debts.find(function (x) { return x.id === row.dataset.debt; });
      if (dd) { dd[el.dataset.field] = el.type === 'number' ? (+el.value || 0) : el.value; persist(); render(); }
      return;
    }
    if ((row = el.closest('[data-member-row]'))) {
      var m = S.members.find(function (x) { return x.id === row.dataset.memberRow; });
      if (m && el.value.trim()) { m.name = el.value.trim(); persist(); render(); }
      return;
    }
    switch (el.id) {
      case 'f-cat': UI.cat = el.value; render(); break;
      case 'f-transfers': UI.showTransfers = el.checked; render(); break;
      case 'f-similar': UI.applySimilar = el.checked; break;
      case 'mf-type': $('#mf-cat').innerHTML = el.value === 'income' ? categoryOptions('other-income', ['income']) : categoryOptions('groceries', ['spend', 'save']); break;
      case 'goal-chart': UI.goalChart = el.value; render(); break;
      case 'set-infl': S.settings.inflation = +el.value || 0; persist(); break;
      case 'pl-extra': UI.extra = Math.max(0, +el.value || 0); render(); break;
      case 'set-name': S.household.name = el.value.trim() || 'My family'; persist(); renderShell(); break;
      case 'set-tfsa': S.settings.tfsaAnnualLimit = +el.value || 0; persist(); break;
      case 'set-tfsa-l': S.settings.tfsaLifetimeLimit = +el.value || 0; persist(); break;
      case 'file-restore':
        var f = el.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try { var data = JSON.parse(r.result); if (!data.version || !data.entries) throw new Error(); S = data; persist(); render(); toast('Backup restored'); }
          catch (err) { toast('That file is not a Clan Capital backup.'); }
        };
        r.readAsText(f); break;
    }
  });

  var qTimer;
  document.addEventListener('input', function (e) {
    if (e.target.id === 'f-q') {
      clearTimeout(qTimer);
      var pos = e.target.selectionStart;
      UI.q = e.target.value;
      qTimer = setTimeout(function () { render(); var q = $('#f-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250);
    }
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'manual-form') {
      var amt = +$('#mf-amount').value;
      if (!amt) return;
      var isIn = $('#mf-type').value === 'income';
      var month = $('#mf-month').value || UI.month;
      var cat = $('#mf-cat').value;
      S.entries.push({ id: HS.uid(), date: month + '-01', amount: isIn ? Math.abs(amt) : -Math.abs(amt), description: $('#mf-note').value.trim() || HS.CAT_BY_ID[cat].name + ' (monthly total)', category: cat, member: $('#mf-member').value, source: 'manual' });
      UI.month = month; persist(); render(); toast('Monthly total added');
    } else if (f.id === 'income-form') {
      S.incomePlan.push({ id: HS.uid(), label: $('#if-label').value.trim(), category: $('#if-cat').value, member: $('#if-member').value, amount: +$('#if-amount').value || 0 });
      persist(); render(); toast('Expected income added');
    } else if (f.id === 'budget-form') {
      S.budgets.push({ id: HS.uid(), category: $('#bf-cat').value, member: $('#bf-member').value, amount: +$('#bf-amount').value || 0 });
      persist(); render(); toast('Budget line added');
    } else if (f.id === 'holding-form') {
      var nh2 = { id: HS.uid(), name: $('#hf-name').value.trim(), provider: $('#hf-provider').value.trim(), type: $('#hf-type').value, assetClass: $('#hf-class').value, member: $('#hf-member').value, value: +$('#hf-value').value || 0, monthly: 0 };
      touchHistory(nh2); S.holdings.push(nh2);
      persist(); render(); toast('Holding added');
    } else if (f.id === 'debt-form') {
      S.debts.push({ id: HS.uid(), name: $('#df-name').value.trim(), lender: '', type: $('#df-type').value, member: $('#df-member').value, balance: +$('#df-balance').value || 0, rate: +$('#df-rate').value || 0, instalment: +$('#df-inst').value || 0 });
      persist(); render(); toast('Debt added');
    } else if (f.id === 'goal-form') {
      var links = Array.prototype.slice.call(f.querySelectorAll('input[name="gf-link"]:checked')).map(function (x) { return x.value; });
      var t = UI.goalType;
      S.goals.push({
        id: HS.uid(), name: $('#gf-name').value.trim() || HS.GOAL_TYPES[t].name, type: t, member: $('#gf-member').value,
        target: t === 'emergency' ? 0 : (+$('#gf-target').value || 0), monthsCover: t === 'emergency' ? (+$('#gf-cover').value || 3) : null,
        targetDate: $('#gf-date').value || HS.addMonths(THIS_MONTH, 24), monthly: +$('#gf-monthly').value || 0, returnPct: +$('#gf-return').value || 0,
        current: +$('#gf-current').value || 0, links: links, todayMoney: t === 'emergency' ? false : !!($('#gf-today') && $('#gf-today').checked)
      });
      persist(); render(); toast('Goal added');
    } else if (f.id === 'member-form') {
      var name = $('#mem-name').value.trim();
      if (name) { S.members.push({ id: 'm' + HS.uid(), name: name }); persist(); render(); toast(name + ' added'); }
    }
  });

  // Redraw charts when the viewer switches light/dark
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) { /* older browsers */ }

  render();
})();
