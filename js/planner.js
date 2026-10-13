/* Clan Capital — debt payoff planner
   Simulates paying off all debts month by month with the snowball or avalanche method.
   Snowball: smallest balance first (quick wins). Avalanche: highest interest rate first (least interest). */
(function (root) {
  'use strict';

  function simulate(debts, method, extra, maxMonths) {
    maxMonths = maxMonths || 600;
    var list = debts
      .filter(function (d) { return d.balance > 0; })
      .map(function (d) { return { id: d.id, name: d.name, balance: +d.balance, rate: +d.rate || 0, min: +d.instalment || 0 }; });
    var budget = list.reduce(function (s, d) { return s + d.min; }, 0) + (+extra || 0);
    var order = function () {
      var open = list.filter(function (d) { return d.balance > 0.005; });
      open.sort(method === 'avalanche'
        ? function (a, b) { return b.rate - a.rate || a.balance - b.balance; }
        : function (a, b) { return a.balance - b.balance || b.rate - a.rate; });
      return open;
    };
    var totalInterest = 0, month = 0, timeline = [list.reduce(function (s, d) { return s + d.balance; }, 0)];
    var paidOff = {};
    var stuck = false;

    while (month < maxMonths) {
      var open = order();
      if (!open.length) break;
      month++;
      // 1. Interest accrues
      open.forEach(function (d) {
        var i = d.balance * d.rate / 100 / 12;
        d.balance += i; totalInterest += i;
      });
      // 2. Pay minimums, then throw everything left at the target debt
      var cash = budget;
      open.forEach(function (d) {
        var p = Math.min(d.min, d.balance, cash);
        d.balance -= p; cash -= p;
      });
      for (var k = 0; k < open.length && cash > 0.005; k++) {
        var p2 = Math.min(open[k].balance, cash);
        open[k].balance -= p2; cash -= p2;
      }
      open.forEach(function (d) { if (d.balance <= 0.005 && !paidOff[d.id]) { d.balance = 0; paidOff[d.id] = month; } });
      var total = list.reduce(function (s, d) { return s + Math.max(0, d.balance); }, 0);
      timeline.push(total);
      if (month > 24 && total >= timeline[month - 24]) { stuck = true; break; }
    }
    return {
      method: method,
      months: stuck ? null : month,
      totalInterest: totalInterest,
      monthlyBudget: budget,
      timeline: timeline,
      order: debts.filter(function (d) { return paidOff[d.id]; })
        .map(function (d) { return { id: d.id, name: d.name, month: paidOff[d.id] }; })
        .sort(function (a, b) { return a.month - b.month; }),
      stuck: stuck
    };
  }

  function compare(debts, extra) {
    return {
      minimumOnly: simulate(debts, 'avalanche', 0),
      snowball: simulate(debts, 'snowball', extra),
      avalanche: simulate(debts, 'avalanche', extra)
    };
  }

  root.HS = root.HS || {};
  root.HS.simulatePayoff = simulate;
  root.HS.comparePayoff = compare;
  if (typeof module !== 'undefined' && module.exports) module.exports = { simulate: simulate, compare: compare };
})(typeof window !== 'undefined' ? window : globalThis);
