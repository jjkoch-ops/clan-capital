/* Clan Capital — core data layer
   Categories, storage, formatting, auto-categorisation and file importers.
   Plain JavaScript, no build step. Works in the browser (window.HS) and in Node (for tests). */
(function (root) {
  'use strict';

  // ---------- Categories ----------
  // kind: income | spend | save | transfer (transfers are ignored in totals)
  var CATEGORIES = [
    { id: 'salary', name: 'Salary', kind: 'income' },
    { id: 'business', name: 'Business & commission', kind: 'income' },
    { id: 'interest', name: 'Interest & dividends', kind: 'income' },
    { id: 'other-income', name: 'Other income', kind: 'income' },
    { id: 'housing', name: 'Housing (rent / bond)', kind: 'spend' },
    { id: 'utilities', name: 'Electricity, water & rates', kind: 'spend' },
    { id: 'groceries', name: 'Groceries', kind: 'spend' },
    { id: 'eating-out', name: 'Eating out & takeaways', kind: 'spend' },
    { id: 'transport', name: 'Fuel & transport', kind: 'spend' },
    { id: 'insurance', name: 'Insurance', kind: 'spend' },
    { id: 'medical', name: 'Medical & pharmacy', kind: 'spend' },
    { id: 'phone', name: 'Phone & internet', kind: 'spend' },
    { id: 'subscriptions', name: 'Subscriptions', kind: 'spend' },
    { id: 'education', name: 'School & childcare', kind: 'spend' },
    { id: 'debt', name: 'Debt repayments', kind: 'spend' },
    { id: 'fees', name: 'Bank fees & interest', kind: 'spend' },
    { id: 'giving', name: 'Giving & tithes', kind: 'spend' },
    { id: 'shopping', name: 'Shopping & personal', kind: 'spend' },
    { id: 'other-spend', name: 'Other spending', kind: 'spend' },
    { id: 'investing', name: 'Investing & saving', kind: 'save' },
    { id: 'transfer', name: 'Transfer between own accounts', kind: 'transfer' }
  ];
  var CAT_BY_ID = {};
  CATEGORIES.forEach(function (c) { CAT_BY_ID[c.id] = c; });

  var HOLDING_TYPES = ['TFSA', 'Retirement annuity', 'Pension / provident fund', 'Unit trust', 'Shares / ETFs', 'Property', 'Cash & money market', 'Crypto', 'Other'];
  var ASSET_CLASSES = ['Local equity', 'Offshore equity', 'Balanced / multi-asset', 'Bonds', 'Property', 'Cash', 'Other'];
  var DEBT_TYPES = ['Home loan', 'Vehicle finance', 'Credit card', 'Store card', 'Personal loan', 'Overdraft', 'Student loan', 'Other'];

  // ---------- Auto-categorisation rules (South African banks) ----------
  // Order matters: first match wins. Tested against a real FNB export.
  var RULES = [
    { re: /TRANSFER (FROM|TO)|^DTC$|INTER.?ACCOUNT|OWN ACC|^FK$|FNB OB PMT\s+FK/i, cat: 'transfer' },
    { re: /SALARY|SALARIS|WAGES|PAYROLL/i, cat: 'salary', sign: 1 },
    { re: /COMMISSION|DIVIDEND PAYMENT|INVOICE|SALES|CONSULT|FREELANCE/i, cat: 'business', sign: 1 },
    { re: /INTEREST REBATE|CREDIT INTEREST|INT CAPITALISED|DIVIDEND/i, cat: 'interest', sign: 1 },
    { re: /^#|SERVICE FEE|ACCOUNT FEE|BANK CHARGE|INT ON DEBIT|ADJUST OF DR INT|DEBIT INTEREST|ADMIN FEE/i, cat: 'fees' },
    { re: /FNBCC|DEBICHECK|WESBANK|MFC |VEHICLE FIN|HOME LOAN|BOND REPAY|CREDIT CARD|EDGARS|TFG|JET |MR PRICE ACC|LEWIS|AFRICAN BANK|CAPITEC LOAN|DIRECTAXIS/i, cat: 'debt' },
    { re: /\bETF\b|EASYEQUITIES|SATRIX|ALLAN GRAY|CORONATION|10X|SYGNIA|INVESTMENT|UNIT TRUST|TAX FREE|TFSA/i, cat: 'investing' },
    { re: /LIBERTY|OLD MUTUAL|DISCOVERY LIFE|DISCOVERY INS|SANLAM|MOMENTUM|HOLLARD|OUTSURANCE|SANTAM|KING PRICE|MIWAY|BUDGET INS|1LIFE|CLIENTELE|ASSUPOL|INSURANCE|FUNERAL/i, cat: 'insurance' },
    { re: /DISCOVERY HEALTH|BESTMED|BONITAS|MEDSHIELD|DISCHEM|DIS-CHEM|CLICKS|PHARM|SPECTACLE|OPTOM|DOCTOR|DR |DENTIST|HOSPITAL|NETCARE|MEDICLINIC|LIFE HEALTHCARE|PATHCARE|LANCET/i, cat: 'medical' },
    { re: /UBER EATS|DL\*UBER EATS|MR ?D|NANDO|WIMPY|SPUR|STEERS|KFC|MCD|MCDONALD|DEBONAIRS|ROMAN|OCEAN BASKET|MUGG|VIDA|SEATTLE|STARBUCKS|RESTAURANT|CAFE|COFFEE|PIZZA|TRIBECA|BURGER/i, cat: 'eating-out' },
    { re: /ENGEN|SHELL|BP |SASOL|TOTAL|CALTEX|ASTRON|\bUBER\b|BOLT|GAUTRAIN|E-?TOLL|SANRAL|PARKING|TAXI|TYRE|SERVICE CENTRE|AIRLINK|FLYSAFAIR|LIFT AIR|AVIS|EUROPCAR/i, cat: 'transport' },
    { re: /CHECKERS|WOOLWORTHS|PICK N PAY|PNP|SPAR|SHOPRITE|FOOD LOVER|USAVE|BOXER|OK FOODS|MAKRO|FRUIT & VEG/i, cat: 'groceries' },
    { re: /VODACOM|MTN|TELKOM|CELL C|SUPERSONIC|RAIN |AFRIHOST|WEBAFRICA|VUMATEL|OPENSERVE|COOL IDEAS|FIBRE/i, cat: 'phone' },
    { re: /NETFLIX|SPOTIFY|SHOWMAX|DSTV|MULTICHOICE|APPLE\.COM|GOOGLE|YOUTUBE|DISNEY|AMAZON PRIME|ANTHROPIC|OPENAI|MICROSOFT|ADOBE|VIRGIN ACTIVE|PLANET FITNESS|GYM/i, cat: 'subscriptions' },
    { re: /RENT|BOND|LEVY|BODY CORP|HOA /i, cat: 'housing' },
    { re: /POWERTIME|PREPAID ELEC|ELECTRICITY|ESKOM|TSHWANE|CITY OF|JOBURG|MUNICIPAL|RATES|WATER/i, cat: 'utilities' },
    { re: /SCHOOL|CRECHE|DAYCARE|NURSERY|AFTERCARE|UNIVERSITY|COLLEGE|TUITION|SATS/i, cat: 'education' },
    { re: /CHURCH|TITHE|OFFERING|DONATION|NPC|NPO|CHARITY/i, cat: 'giving' },
    { re: /TAKEALOT|AMAZON|SUPERBALIST|MR PRICE|PEP |ACKERMANS|WOOLIES|TRUWORTHS|FOSCHINI|CLICKS|POSTNET|BUILDERS|LEROY|INCREDIBLE|GAME |DION|HIFI|ZARA|H&M/i, cat: 'shopping' }
  ];

  function cleanDescription(desc) {
    return String(desc || '')
      .replace(/\s+\d{6}\*{2,}\d{4}\s*$/, '')   // trailing masked card number
      .replace(/\s+\d{4,6}\*+\d{3,4}.*$/, '')     // SnapScan-style masked numbers
      .replace(/^PURCH\s+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Learned rules (from the user's own corrections) are checked first.
  function categorise(description, amount, learned) {
    var d = String(description || '');
    var key = ruleKey(d);
    if (learned && learned[key]) return learned[key].category;
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r.sign && Math.sign(amount) !== r.sign) continue;
      if (r.re.test(d)) return r.cat;
    }
    return amount >= 0 ? 'other-income' : 'other-spend';
  }

  // Normalised key so "PURCH ENGEN ZAMBESI 400738******4004" and later visits share one learned rule
  function ruleKey(description) {
    return cleanDescription(description).toUpperCase().replace(/[0-9*#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  // ---------- Dates & numbers ----------
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDate(s, fallbackYear) {
    if (s instanceof Date && !isNaN(s)) return s.getFullYear() + '-' + pad(s.getMonth() + 1) + '-' + pad(s.getDate());
    s = String(s || '').trim().replace(/^"|"$/g, '');
    var m;
    if ((m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]); // SA: day first
    if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-]?(\d{4})?/))) {
      var mo = MONTHS[m[2].toLowerCase()];
      var y = m[3] || fallbackYear;
      if (mo && y) return y + '-' + pad(mo) + '-' + pad(+m[1]);
    }
    // Excel serial date
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var d = new Date(Math.round((parseFloat(s) - 25569) * 86400000));
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    return null;
  }

  function parseAmount(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').trim().replace(/^"|"$/g, '');
    if (!s) return NaN;
    var neg = /^-|^\(.*\)$|\bDR\b|-$/i.test(s);
    var cleaned = s.replace(/R|ZAR|CR|DR|\s|\(|\)/gi, '');
    // "1 234,56" or "1.234,56" (comma decimal) vs "1,234.56"
    if (/,\d{2}$/.test(cleaned) && !/\.\d{2}$/.test(cleaned)) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    else cleaned = cleaned.replace(/,/g, '');
    cleaned = cleaned.replace(/-/g, '');
    var n = parseFloat(cleaned);
    if (isNaN(n)) return NaN;
    return neg ? -n : n;
  }

  function monthOf(date) { return String(date).slice(0, 7); }

  function fmtR(n, opts) {
    opts = opts || {};
    var neg = n < 0;
    var v = Math.abs(n);
    var s;
    if (opts.compact && v >= 1e6) s = (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'm';
    else if (opts.compact && v >= 1e4) s = Math.round(v / 1e3) + 'k';
    else s = v.toFixed(opts.cents ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + 'R' + (opts.compact ? '' : ' ') + s;
  }

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthLabel(ym, long) {
    var p = ym.split('-');
    return MONTH_NAMES[+p[1] - 1] + (long ? ' ' + p[0] : " '" + p[0].slice(2));
  }
  function addMonths(ym, n) {
    var p = ym.split('-');
    var t = (+p[0]) * 12 + (+p[1] - 1) + n;
    return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
  }
  // SA tax year: 1 March to end February. Returns the start year.
  function taxYearStart(date) {
    var y = +String(date).slice(0, 4), m = +String(date).slice(5, 7);
    return m >= 3 ? y : y - 1;
  }

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  // ---------- CSV ----------
  function splitCSVLine(line, delim) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  function toRows(text) {
    text = String(text).replace(/^﻿/, '');
    var lines = text.split(/\r\n|\n|\r/);
    var sample = lines.slice(0, 30).join('\n');
    var delim = (sample.split(';').length > sample.split(',').length) ? ';' : (sample.split('\t').length > sample.split(',').length ? '\t' : ',');
    return lines.filter(function (l) { return l.trim() !== ''; }).map(function (l) { return splitCSVLine(l, delim); });
  }

  // Find the header row and which column is which. Works for FNB and most other bank exports.
  function detectBankColumns(rows) {
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var h = rows[i].map(function (c) { return String(c).toLowerCase().replace(/[^a-z ]/g, '').trim(); });
      var date = h.findIndex(function (c) { return /^(transaction |posting |value )?date$|^date/.test(c); });
      if (date < 0) continue;
      var amount = h.findIndex(function (c) { return /^amount|^value$|^transaction amount|^bedrag/.test(c); });
      var debit = h.findIndex(function (c) { return /^debit|money out|^withdrawal/.test(c); });
      var credit = h.findIndex(function (c) { return /^credit|money in|^deposit/.test(c); });
      var desc = h.findIndex(function (c) { return /desc|narrat|details|reference|beskrywing|transaction$|particulars|memo|payee/.test(c); });
      var balance = h.findIndex(function (c) { return /^balance|^saldo/.test(c); });
      if (amount < 0 && (debit < 0 || credit < 0)) continue;
      return { headerRow: i, date: date, amount: amount, debit: debit, credit: credit, desc: desc, balance: balance };
    }
    return null;
  }

  // Returns { bank, account, rows:[{date, amount, description, balance}], skipped, closingBalance }
  function parseBankCSV(text, opts) {
    opts = opts || {};
    var rows = toRows(text);
    var cols = opts.columns || detectBankColumns(rows);
    if (!cols) throw new Error('No header row found. The file needs a Date column and an Amount (or Debit and Credit) column.');

    var preamble = rows.slice(0, cols.headerRow).map(function (r) { return r.join(' '); }).join(' ');
    var bank = /fnb|first national/i.test(preamble) || /ACCOUNT TRANSACTION HISTORY/i.test(preamble) ? 'FNB'
      : /standard bank/i.test(preamble) ? 'Standard Bank' : /absa/i.test(preamble) ? 'Absa'
      : /nedbank/i.test(preamble) ? 'Nedbank' : /capitec/i.test(preamble) ? 'Capitec' : 'Bank';
    var accMatch = preamble.match(/Account:?\s*(\d{6,})/i);
    var account = accMatch ? '••' + accMatch[1].slice(-4) : '';
    var balMatch = preamble.match(/Balance:?\s*(-?[\d.]+)/i);

    var out = [], skipped = 0;
    var fallbackYear = opts.year || new Date().getFullYear();
    for (var i = cols.headerRow + 1; i < rows.length; i++) {
      var r = rows[i];
      var date = parseDate(r[cols.date], fallbackYear);
      var amount;
      if (cols.amount >= 0) amount = parseAmount(r[cols.amount]);
      else {
        var dr = parseAmount(r[cols.debit]), cr = parseAmount(r[cols.credit]);
        amount = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(dr) ? 0 : Math.abs(dr));
      }
      var description = cols.desc >= 0 ? r[cols.desc] : r.filter(function (_, k) { return k !== cols.date && k !== cols.amount && k !== cols.balance; }).join(' ');
      if (!date || isNaN(amount) || amount === 0) { skipped++; continue; }
      out.push({ date: date, amount: Math.round(amount * 100) / 100, description: String(description || '').trim(), balance: cols.balance >= 0 ? parseAmount(r[cols.balance]) : null });
    }
    return { bank: bank, account: account, rows: out, skipped: skipped, closingBalance: balMatch ? parseFloat(balMatch[1]) : null };
  }

  // Investment sheet: one row per holding. Flexible column names.
  function parseHoldingsTable(rows) {
    var map = null, i;
    for (i = 0; i < Math.min(rows.length, 30); i++) {
      var h = rows[i].map(function (c) { return String(c == null ? '' : c).toLowerCase().trim(); });
      var name = h.findIndex(function (c) { return /^(fund|holding|instrument|investment|product|name|description|security|share)/.test(c); });
      var value = h.findIndex(function (c) { return /market value|current value|^value|closing value|balance|amount|total/.test(c); });
      if (name >= 0 && value >= 0) {
        map = {
          row: i, name: name, value: value,
          provider: h.findIndex(function (c) { return /provider|platform|manager|institution|company/.test(c); }),
          type: h.findIndex(function (c) { return /^type|account type|wrapper|product type/.test(c); }),
          assetClass: h.findIndex(function (c) { return /asset class|class|category|sector/.test(c); }),
          member: h.findIndex(function (c) { return /owner|member|investor|holder/.test(c); }),
          account: h.findIndex(function (c) { return /^(account|portfolio|plan|policy|investment account)( name| number| no\.?)?$/.test(c); }),
          monthly: h.findIndex(function (c) { return /monthly|debit order|contribution/.test(c); })
        };
        break;
      }
    }
    if (!map) throw new Error('No header row found. The sheet needs a fund/holding name column and a value column.');
    var out = [];
    for (i = map.row + 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r[map.name]) continue;
      var v = parseAmount(r[map.value]);
      if (isNaN(v)) continue;
      var get = function (k) { return map[k] >= 0 && r[map[k]] != null ? String(r[map[k]]).trim() : ''; };
      out.push({
        name: String(r[map.name]).trim(), value: v, provider: get('provider'),
        type: guessHoldingType(get('type') + ' ' + r[map.name]),
        assetClass: guessAssetClass(get('assetClass') + ' ' + r[map.name]),
        memberName: get('member'), account: get('account'), monthly: map.monthly >= 0 ? (parseAmount(r[map.monthly]) || 0) : 0
      });
    }
    return out;
  }

  function guessHoldingType(s) {
    s = s.toLowerCase();
    if (/tfsa|tax.?free/.test(s)) return 'TFSA';
    if (/\bra\b|retirement annuity/.test(s)) return 'Retirement annuity';
    if (/pension|provident|preservation/.test(s)) return 'Pension / provident fund';
    if (/property|house|home|flat|erf/.test(s)) return 'Property';
    if (/money market|cash|savings|notice|fixed deposit/.test(s)) return 'Cash & money market';
    if (/crypto|bitcoin|btc|eth/.test(s)) return 'Crypto';
    if (/etf|share|equit(y|ies) account|stock/.test(s)) return 'Shares / ETFs';
    if (/fund|unit trust/.test(s)) return 'Unit trust';
    return 'Other';
  }
  function guessAssetClass(s) {
    s = s.toLowerCase();
    if (/global|offshore|world|s&p|msci|nasdaq|international|usd/.test(s)) return 'Offshore equity';
    if (/balanced|multi.?asset|prudential|flexible|stable/.test(s)) return 'Balanced / multi-asset';
    if (/bond|income|gilt|fixed/.test(s)) return 'Bonds';
    if (/property|reit|house|home/.test(s)) return 'Property';
    if (/money market|cash|savings/.test(s)) return 'Cash';
    if (/equity|top ?40|swix|share|etf|capped/.test(s)) return 'Local equity';
    return 'Other';
  }

  // ---------- Storage (browser only; every call guarded) ----------
  var KEY = 'clancapital.v1';
  var OLD_KEY = 'huishou.v1'; // earlier working name; data is carried over
  function load() {
    try {
      var s = root.localStorage && (root.localStorage.getItem(KEY) || root.localStorage.getItem(OLD_KEY));
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }
  function save(state) {
    try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  function clear() { try { root.localStorage && root.localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  var api = {
    CATEGORIES: CATEGORIES, CAT_BY_ID: CAT_BY_ID, HOLDING_TYPES: HOLDING_TYPES, ASSET_CLASSES: ASSET_CLASSES, DEBT_TYPES: DEBT_TYPES,
    categorise: categorise, ruleKey: ruleKey, cleanDescription: cleanDescription,
    parseDate: parseDate, parseAmount: parseAmount, monthOf: monthOf, monthLabel: monthLabel, addMonths: addMonths, taxYearStart: taxYearStart,
    fmtR: fmtR, uid: uid, toRows: toRows, detectBankColumns: detectBankColumns, parseBankCSV: parseBankCSV,
    parseHoldingsTable: parseHoldingsTable, guessHoldingType: guessHoldingType, guessAssetClass: guessAssetClass,
    load: load, save: save, clear: clear
  };
  root.HS = Object.assign(root.HS || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
