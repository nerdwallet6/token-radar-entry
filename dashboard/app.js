/* Token Radar dashboard — renders only from window.RADAR (data.js). No network, no fetch.
   Board = pre-token protocols ranked by impliedValue(); live rows are market values, kept apart. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    app.innerHTML = '<div class="error"><h1>Data not loaded</h1><p>window.RADAR is missing: data.js did not load or did not set the radar dataset. ' +
      'This page renders only from data.js, so with no dataset there is no board to show. ' +
      'Check that data.js sits beside the dashboard folder and loads before app.js.</p></div>';
    app.setAttribute('aria-busy', 'false');
    return;
  }
  var M = D.model || {};
  var rows = D.rows.slice();
  var live = (D.live || []).slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
  var S = { q: '', cat: 'all', chain: 'all', wl: false, sort: 'implied', dir: -1, sel: rows.length ? rows[0].slug : null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function usd(n) {
    if (n == null || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { return (n == null || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) { if (d == null) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function mult(n) { return (n == null || !isFinite(n)) ? 'n/a' : '×' + Number(n).toFixed(4); }
  function chainsOf(r) { return (r.chains && r.chains.length) ? r.chains : []; }

  /* The model, in one function: impliedValue() recomputes a row from the snapshot figures so the
     page and the board agree. base = TVL x base_multiple; growth is clamped, then weighted;
     maturity rises with age up to maturity_days; unknown age uses unknown_age_days. */
  function impliedValue(r) {
    var g = Math.min(M.growth_cap == null ? 120 : M.growth_cap, Math.max(M.growth_floor == null ? -60 : M.growth_floor, r.change_7d == null ? 0 : r.change_7d));
    var gm = 1 + (g / 100) * (M.growth_weight == null ? 0.5 : M.growth_weight);
    var a = r.age_days == null ? (M.unknown_age_days == null ? 365 : M.unknown_age_days) : r.age_days;
    var mm = (M.maturity_floor == null ? 0.6 : M.maturity_floor) +
      (Math.min(Math.max(a, 0), M.maturity_days == null ? 1095 : M.maturity_days) / (M.maturity_days == null ? 1095 : M.maturity_days)) *
      (M.maturity_range == null ? 0.4 : M.maturity_range);
    var base = r.tvl_usd * (M.base_multiple == null ? 0.25 : M.base_multiple);
    return { base: base, growthPct: g, growthMult: gm, maturityMult: mm, implied: Math.max(1, Math.round(base * gm * mm)) };
  }
  /* Extra multipliers the model worker may attach (e.g. category_multiplier): shown if present. */
  function extraMults(r) {
    var out = [];
    Object.keys(r).forEach(function (k) {
      if (/_multiplier$/.test(k) && k !== 'growth_multiplier' && k !== 'maturity_multiplier' && typeof r[k] === 'number') {
        out.push([k.replace(/_/g, ' '), r[k]]);
      }
    });
    return out;
  }

  /* Farm plan: the row's own farm_steps when the data carries them; otherwise derived from the
     row's own category, chains, TVL and age — never from a hardcoded list of names. */
  function farmSteps(r) {
    if (Array.isArray(r.farm_steps) && r.farm_steps.length >= 3) return r.farm_steps.slice();
    var chain = chainsOf(r)[0] || 'its main chain';
    var cap = r.tvl_usd >= 5e9 ? 250 : r.tvl_usd >= 1e9 ? 150 : r.tvl_usd >= 1e8 ? 100 : 50;
    var hold = r.age_days == null ? 30 : r.age_days < 180 ? 60 : r.age_days < 365 ? 45 : 30;
    var c = (r.category || '').toLowerCase(), act;
    if (/lend|cdp|collateral/.test(c)) act = 'Supply $' + cap + ' of USDC to ' + r.name + ' on ' + chain + ' and keep the position open.';
    else if (/dex|yield|leveraged farm/.test(c)) act = 'Provide $' + cap + ' of liquidity to ' + r.name + '’s main pool on ' + chain + ' and keep the position open.';
    else if (/bridge/.test(c)) act = 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + r.name + ' and use the bridged funds in its app.';
    else if (/stak|restak/.test(c)) act = 'Stake $' + cap + ' of the chain’s staking asset through ' + r.name + ' and keep the receipt.';
    else if (/perpetual|derivative/.test(c)) act = 'Deposit $' + cap + ' of USDC as margin on ' + r.name + ' and open one small hedge.';
    else if (/prediction/.test(c)) act = 'Fund $' + cap + ' and place one market position on ' + r.name + '.';
    else if (/curator|allocator/.test(c)) act = 'Deposit $' + cap + ' into a ' + r.name + ' vault on ' + chain + ' and keep the shares.';
    else if (/stable/.test(c)) act = 'Mint or deposit $' + cap + ' of the stable asset through ' + r.name + ' on ' + chain + '.';
    else if (/rwa/.test(c)) act = 'Mint $' + cap + ' of the protocol’s yield asset on ' + chain + ' and hold it.';
    else if (/insurance/.test(c)) act = 'Buy $' + cap + ' of cover from ' + r.name + ' on ' + chain + ' and keep the policy.';
    else act = 'Deposit $' + cap + ' of USDC into ' + r.name + ' on ' + chain + ' and keep the position open.';
    return [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [act, '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + cap + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol’s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes']
    ].map(function (s) { return s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.'; });
  }
  function splitStep(s) {
    var i = s.indexOf(' Cost: ');
    return i >= 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, ''];
  }

  function filtered() {
    var q = S.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (S.wl && !(r.tvl_usd >= (D.floor_usd || 0))) return false; /* watchlist = at/above the floor */
      if (S.cat !== 'all' && (r.category || 'Other') !== S.cat) return false;
      if (S.chain !== 'all' && chainsOf(r).indexOf(S.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, chainsOf(r).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var k = S.sort, d = S.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (k === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (k === 'growth') { av = a.change_7d == null ? -Infinity : a.change_7d; bv = b.change_7d == null ? -Infinity : b.change_7d; }
      else if (k === 'age') { av = a.age_days == null ? Infinity : a.age_days; bv = b.age_days == null ? Infinity : b.age_days; }
      else if (k === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -d; if (av > bv) return d;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function uniq(key, fn) {
    var set = {};
    rows.forEach(function (r) { (fn(r) || []).forEach(function (v) { set[v] = 1; }); });
    return Object.keys(set).sort();
  }
  var cats = uniq(0, function (r) { return [r.category || 'Other']; });
  var chainList = uniq(0, chainsOf);
  function opts(list, cur, allLabel) {
    return '<option value="all">' + allLabel + '</option>' + list.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  /* ---- shell (static parts built once) ---- */
  var floorM = D.floor_usd ? Math.round(D.floor_usd / 1e6) : 50;
  app.innerHTML =
    '<div class="wrap">' +
    '<header class="mast"><div class="brand"><span class="scope" aria-hidden="true"></span><div>' +
    '<h1>TOKEN <b>RADAR</b></h1><div class="tag">Pre-token protocols · ranked by implied value</div></div></div>' +
    '<div class="tag">Snapshot ' + esc(D.as_of || 'n/a') + '<br>Model ' + esc(D.model_version || 'n/a') + '</div></header>' +
    '<p class="lede">Every protocol here <b>records no token</b> in the snapshot — no market cap, no CoinGecko id, ' +
    'no symbol. The board ranks them by <b>implied value</b>: what a token would be worth if the protocol’s ' +
    'record stayed as it is. It is a model, not a price and not a prediction that a token will ever launch.</p>' +
    '<section class="stats" aria-label="Snapshot facts">' +
    '<div class="stat"><div class="k">Snapshot</div><div class="v">' + esc(D.as_of || 'n/a') + '</div><div class="s">DefiLlama protocol index</div></div>' +
    '<div class="stat"><div class="k">Watchlist</div><div class="v"><em>' + (D.watchlist_size != null ? D.watchlist_size : 'n/a') + '</em> protocols</div><div class="s">TVL ≥ $' + floorM + 'M floor</div></div>' +
    '<div class="stat"><div class="k">Board</div><div class="v">' + (D.board_size != null ? D.board_size : rows.length) + ' rows</div><div class="s">' + (D.early_size != null ? D.early_size : '') + ' early rows below the floor</div></div>' +
    '<div class="stat"><div class="k">Top implied value</div><div class="v">' + usd(rows[0] ? rows[0].implied_value_usd : null) + '</div><div class="s">' + esc(rows[0] ? rows[0].name : '') + '</div></div>' +
    '<div class="stat"><div class="k">Model</div><div class="v">' + esc(D.model_version || 'n/a') + '</div><div class="s">base × ' + (M.base_multiple != null ? M.base_multiple : 'n/a') + ' of TVL</div></div>' +
    '</section>' +
    '<div class="toolbar" role="search">' +
    '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Name, slug, category or chain" value=""></div>' +
    '<div class="field"><label for="cat">Category</label><select id="cat">' + opts(cats, 'all', 'All categories') + '</select></div>' +
    '<div class="field"><label for="chain">Chain</label><select id="chain">' + opts(chainList, 'all', 'All chains') + '</select></div>' +
    '<button class="toggle" id="wl" type="button" aria-pressed="false">Watchlist only · TVL ≥ $' + floorM + 'M</button>' +
    '<span class="count" id="count"></span></div>' +
    '<div class="layout"><section class="panel" aria-label="Ranked board"><div class="panel-head"><h2>Ranked board</h2>' +
    '<span class="hint">Click a row for its model and farm plan · click a header to sort</span></div>' +
    '<div class="tablewrap"><table><caption>Pre-token protocols, strongest implied value first.</caption>' +
    '<thead><tr id="heads"></tr></thead><tbody id="tbody"></tbody></table></div></section>' +
    '<aside class="panel detail" aria-label="Protocol detail" id="detail"></aside></div>' +
    '<div class="lower">' +
    '<section class="panel live" aria-label="Live tokens"><div class="panel-head"><h2>Already trading</h2>' +
    '<span class="live-tag">Market value, not a model</span></div>' +
    '<div class="tablewrap"><table><caption>These protocols already trade, so their market cap is a fact, not an implied value. They are set aside from the ranked board.</caption>' +
    '<thead><tr><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th></tr></thead>' +
    '<tbody>' + live.map(function (r) {
      return '<tr><td><span class="pname">' + esc(r.name) + '</span><br><span class="psub">' + esc(r.slug) + ' · ' + esc(r.category || 'Other') + '</span><br>' +
        chainsOf(r).slice(0, 3).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td><td class="num ' + (r.change_7d != null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num mcap">' + usd(r.mcap_usd) + '</td></tr>';
    }).join('') + '</tbody></table></div></section>' +
    '<section class="panel method" aria-label="Methodology"><div class="panel-head"><h2>How implied value is computed</h2></div><div class="body">' +
    '<div class="formula">impliedValue(row) = round( tvl_usd × ' + (M.base_multiple != null ? M.base_multiple : '?') +
    ' × (1 + clamp(change_7d, ' + (M.growth_floor != null ? M.growth_floor : '?') + ', ' + (M.growth_cap != null ? M.growth_cap : '?') +
    ') / 100 × ' + (M.growth_weight != null ? M.growth_weight : '?') + ') × (' + (M.maturity_floor != null ? M.maturity_floor : '?') +
    ' + min(age_days, ' + (M.maturity_days != null ? M.maturity_days : '?') + ') / ' + (M.maturity_days != null ? M.maturity_days : '?') +
    ' × ' + (M.maturity_range != null ? M.maturity_range : '?') + ') )</div>' +
    '<p><b>Base.</b> TVL × ' + (M.base_multiple != null ? M.base_multiple : 'the base multiple') + ' — the size of the protocol, in dollars, is the starting point. ' +
    '<b>Growth.</b> The seven-day TVL change, clamped to ' + (M.growth_floor != null ? M.growth_floor : '?') + '%…+' + (M.growth_cap != null ? M.growth_cap : '?') +
    '%, then weighted by ' + (M.growth_weight != null ? M.growth_weight : '?') + ': fast-growing TVL is worth more than flat TVL at the same size. ' +
    '<b>Maturity.</b> Age since first listing, up to ' + (M.maturity_days != null ? M.maturity_days : '?') + ' days, lifts the value from ' +
    (M.maturity_floor != null ? M.maturity_floor : '?') + ' toward ' + ((M.maturity_floor != null && M.maturity_range != null) ? (M.maturity_floor + M.maturity_range).toFixed(1) : '?') +
    ': a protocol that has run longer with no token has a longer record to price. An unlisted age uses ' + (M.unknown_age_days != null ? M.unknown_age_days : '?') + ' days.</p>' +
    '<div class="cards3"><div class="mini"><h3>One function, every row</h3><p>The same impliedValue() scores every protocol. No name is special-cased and no row is hand-picked; the detail panel recomputes each row and shows whether it matches the board.</p></div>' +
    '<div class="mini"><h3>“Records no token”</h3><p>That means DefiLlama records no market cap, CoinGecko id or symbol for the protocol. It is not proof there is none — a token may exist that its record does not carry.</p></div>' +
    '<div class="mini"><h3>What implied value is not</h3><p>It is the entry’s own claim, derived from this one snapshot. It is not a price, not a prediction of a launch, and not a promise of an airdrop. Farm plans are generic steps from each protocol’s own category, chains, TVL and age.</p></div></div>' +
    '</div></section></div>' +
    '<footer><span>Source: DefiLlama protocol snapshot, as of ' + esc(D.as_of || 'n/a') + ' · floor $' + floorM + 'M · model ' + esc(D.model_version || 'n/a') + '</span>' +
    '<span>Works offline — every value on this page comes from data.js; the page makes no network requests.</span></footer>' +
    '</div>';
  app.setAttribute('aria-busy', 'false');

  /* ---- sortable headers ---- */
  var COLS = [['rank', 'Rank'], ['name', 'Protocol'], ['tvl', 'TVL'], ['growth', '7d'], ['age', 'Age'], ['implied', 'Implied value']];
  var heads = document.getElementById('heads');
  heads.innerHTML = COLS.map(function (c) {
    return '<th scope="col"><button type="button" data-sort="' + c[0] + '">' + c[1] +
      (S.sort === c[0] ? '<span class="arrow" aria-hidden="true">' + (S.dir < 0 ? '▼' : '▲') + '</span>' : '') + '</button></th>';
  }).join('') + '<th scope="col">Chains</th>';
  heads.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sort]');
    if (!b) return;
    var k = b.getAttribute('data-sort');
    if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = (k === 'name') ? 1 : -1; }
    renderBoard();
  });

  function renderBoard() {
    var list = sorted(filtered());
    var max = (sorted(rows)[0] || {}).implied_value_usd || 1;
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' rows';
    heads.innerHTML = COLS.map(function (c) {
      return '<th scope="col"><button type="button" data-sort="' + c[0] + '">' + c[1] +
        (S.sort === c[0] ? '<span class="arrow" aria-hidden="true">' + (S.dir < 0 ? '▼' : '▲') + '</span>' : '') + '</button></th>';
    }).join('') + '<th scope="col">Chains</th>';
    var tb = document.getElementById('tbody');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="7"><div class="empty">No protocol matches that filter.<br>' +
        '<button type="button" id="clear">Clear filters</button></div></td></tr>';
      var cl = document.getElementById('clear');
      if (cl) cl.addEventListener('click', function () {
        S.q = ''; S.cat = 'all'; S.chain = 'all'; S.wl = false;
        document.getElementById('q').value = ''; document.getElementById('cat').value = 'all';
        document.getElementById('chain').value = 'all'; syncWl(); renderBoard();
      });
      return;
    }
    tb.innerHTML = list.map(function (r) {
      var g = r.change_7d == null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var w = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" tabindex="0" class="' + (S.sel === r.slug ? 'sel' : '') + '">' +
        '<td class="rank' + (r.rank <= 3 ? ' top' : '') + '">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span><br><span class="psub">' + esc(r.slug) + ' · ' + esc(r.category || 'Other') + '</span></td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num ' + g + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td><span class="num val">' + usd(r.implied_value_usd) + '</span> <span class="muted small">▂' + w + '%</span></td>' +
        '<td>' + chainsOf(r).slice(0, 2).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') +
        (chainsOf(r).length > 2 ? '<span class="chip">+' + (chainsOf(r).length - 2) + '</span>' : '') + '</td></tr>';
    }).join('');
  }

  function renderDetail() {
    var r = null;
    rows.forEach(function (x) { if (x.slug === S.sel) r = x; });
    var box = document.getElementById('detail');
    if (!r) { box.innerHTML = '<div class="body"><p class="muted">Select a row to see its model and farm plan.</p></div>'; return; }
    var v = impliedValue(r);
    var extra = extraMults(r);
    var steps = farmSteps(r);
    var match = v.implied === r.implied_value_usd;
    box.innerHTML =
      '<div class="panel-head"><h2>' + esc(r.name) + '</h2><span class="hint">Rank ' + r.rank + ' of ' + rows.length + '</span></div>' +
      '<div class="body"><p class="slug">' + esc(r.slug) + ' · ' + esc(r.category || 'Other') + ' · listed ' + esc(r.listed_at || 'unknown') + '</p>' +
      '<p style="margin-top:8px">' + chainsOf(r).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</p>' +
      '<dl class="kv">' +
      '<dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd class="' + (r.change_7d != null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</dd>' +
      '<dt>Age with no token</dt><dd>' + age(r.age_days) + '</dd>' +
      '<dt>Implied value</dt><dd class="big">' + usd(r.implied_value_usd) + '</dd></dl>' +
      '<div class="rule"><h3>Model breakdown — impliedValue()</h3><div class="eq">' +
      'base&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= TVL × ' + (M.base_multiple != null ? M.base_multiple : '?') + ' = <b>' + usd(v.base) + '</b><br>' +
      'growth&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= clamp(' + pct(r.change_7d) + ') → <b>' + mult(v.growthMult) + '</b><br>' +
      'maturity&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= age ' + age(r.age_days) + ' → <b>' + mult(v.maturityMult) + '</b>' +
      extra.map(function (e) { return '<br>' + esc(e[0]) + ' = <b>' + mult(e[1]) + '</b>'; }).join('') +
      '<br>implied&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= base × growth × maturity = <b class="tot">' + usd(v.implied) + '</b></div>' +
      '<p class="check">Recomputed here as <b>' + usd(v.implied) + '</b> — ' + (match ? 'matches the board’s ' + usd(r.implied_value_usd) + '.' : 'differs from the board’s ' + usd(r.implied_value_usd) + '; the data may be stale.') + '</p></div>' +
      '<div class="rule"><h3>Farm plan · ' + steps.length + ' steps</h3><ol class="steps">' +
      steps.map(function (s) { var p = splitStep(s); return '<li>' + esc(p[0]) + (p[1] ? '<span class="cost">' + esc(p[1]) + '</span>' : '') + '</li>'; }).join('') +
      '</ol></div></div>';
  }

  /* ---- events ---- */
  var qEl = document.getElementById('q'), catEl = document.getElementById('cat'), chainEl = document.getElementById('chain'), wlEl = document.getElementById('wl');
  function syncWl() { wlEl.setAttribute('aria-pressed', S.wl ? 'true' : 'false'); }
  qEl.addEventListener('input', function () { S.q = qEl.value; renderBoard(); });
  catEl.addEventListener('change', function () { S.cat = catEl.value; renderBoard(); });
  chainEl.addEventListener('change', function () { S.chain = chainEl.value; renderBoard(); });
  wlEl.addEventListener('click', function () { S.wl = !S.wl; syncWl(); renderBoard(); });
  document.getElementById('tbody').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) { S.sel = tr.getAttribute('data-slug'); renderBoard(); renderDetail(); }
  });
  document.getElementById('tbody').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-slug]')) {
      e.preventDefault(); S.sel = e.target.getAttribute('data-slug'); renderBoard(); renderDetail();
    }
  });

  renderBoard();
  renderDetail();
})();
