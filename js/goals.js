/* Clan Capital — goals and growth calculations
   Goal projection uses monthly compounding:
     future value = today's value × (1 + r)^n + monthly × ((1 + r)^n − 1) / r
   A target "in today's money" is grown by inflation to the target date first. */
(function (root) {
  'use strict';

  var GOAL_TYPES = {
    emergency: { name: 'Emergency fund', hint: 'Months of spending kept in cash' },
    retirement: { name: 'Retirement', hint: 'RA, pension, provident and other retirement savings' },
    short: { name: 'Short-term', hint: 'Under 3 years: holiday, car deposit, appliances' },
    long: { name: 'Long-term', hint: 'Over 3 years: education, house deposit, a farm' }
  };

  function monthsBetween(from, to) {
    var a = from.split('-'), b = to.split('-');
    return (+b[0] - +a[0]) * 12 + (+b[1] - +a[1]);
  }

  function fv(pv, pmt, r, n) {
    if (n <= 0) return pv;
    if (r === 0) return pv + pmt * n;
    var g = Math.pow(1 + r, n);
    return pv * g + pmt * (g - 1) / r;
  }

  function requiredMonthly(pv, target, r, n) {
    if (n <= 0) return Math.max(0, target - pv);
    if (r === 0) return Math.max(0, (target - pv) / n);
    var g = Math.pow(1 + r, n);
    return Math.max(0, (target - pv * g) * r / (g - 1));
  }

  // ctx: { current, thisMonth, inflation (%), avgSpend }
  function project(goal, ctx) {
    var n = Math.max(0, monthsBetween(ctx.thisMonth, goal.targetDate || ctx.thisMonth));
    var r = (+goal.returnPct || 0) / 100 / 12;
    var infl = (+ctx.inflation || 0) / 100;
    var baseTarget = goal.type === 'emergency' ? (+goal.monthsCover || 3) * (ctx.avgSpend || 0) : +goal.target || 0;
    var target = goal.todayMoney ? baseTarget * Math.pow(1 + infl, n / 12) : baseTarget;
    var pv = +ctx.current || 0;
    var pmt = +goal.monthly || 0;
    var projected = fv(pv, pmt, r, n);
    var need = requiredMonthly(pv, target, r, n);
    var status = pv >= target ? 'reached' : projected >= target ? 'on-track' : projected >= target * 0.85 ? 'close' : 'behind';
    // Months until reached at current pace (cap 60 years)
    var reachIn = null;
    if (pv >= target) reachIn = 0;
    else {
      var v = pv;
      for (var k = 1; k <= 720; k++) { v = v * (1 + r) + pmt; if (v >= target) { reachIn = k; break; } }
    }
    var series = [];
    var step = Math.max(1, Math.ceil(n / 60));
    for (var m = 0; m <= n; m += step) series.push({ m: m, value: fv(pv, pmt, r, m), path: fv(pv, need > pmt ? need : pmt, r, m) });
    if (series.length && series[series.length - 1].m !== n) series.push({ m: n, value: fv(pv, pmt, r, n), path: fv(pv, need > pmt ? need : pmt, r, n) });
    return {
      months: n, target: target, baseTarget: baseTarget, current: pv, projected: projected, required: need,
      shortfall: Math.max(0, target - projected), progress: target ? Math.min(1, pv / target) : 0,
      status: status, reachIn: reachIn, series: series
    };
  }

  // Growth of one holding over its stored history.
  // Market growth = change in value − money added.
  function growth(history, monthsBack) {
    if (!history || history.length < 2) return null;
    var h = history.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    var end = h[h.length - 1];
    var startIdx = Math.max(0, h.length - 1 - monthsBack);
    var start = h[startIdx];
    var added = 0;
    for (var i = startIdx + 1; i < h.length; i++) added += +h[i].contrib || 0;
    var gain = end.value - start.value - added;
    var base = start.value + added / 2; // simple Dietz approximation
    return { start: start.value, end: end.value, added: added, gain: gain, pct: base > 0 ? gain / base : null, months: h.length - 1 - startIdx, from: start.month, to: end.month };
  }

  var api = { GOAL_TYPES: GOAL_TYPES, monthsBetween: monthsBetween, fv: fv, requiredMonthly: requiredMonthly, projectGoal: project, holdingGrowth: growth };
  root.HS = Object.assign(root.HS || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
