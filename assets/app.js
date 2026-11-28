(function () {
  var C = window.CFG || {};
  var API = C.api;
  var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;

  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  }
  function track(type) {
    if (dnt || !API) return;
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (ref === location.hostname) ref = '';
    post('/e', { trade: C.slug, type: type, ref: type === 'view' ? ref : '' }).catch(function () {});
  }
  track('view');

  // ---- forms ----
  function wire(formId, msgId, path, build, okText) {
    var f = document.getElementById(formId);
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById(msgId);
      var body = build(f);
      if (!body) { msg.textContent = 'Please complete the form (and tick the box for the kit).'; return; }
      msg.textContent = 'Sending...';
      post(path, body).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
        if (x.r.ok) {
          f.reset();
          if (formId === 'optin-form') {
            msg.innerHTML = 'Thanks. Here is your kit: <a href="' + kitUrl() + '" target="_blank" rel="noopener">open the Contract Rescue Kit</a>.';
          } else { msg.textContent = okText; }
        } else {
          msg.textContent = x.j && x.j.error === 'invalid email' ? 'That email does not look right.' : 'Something went wrong. Please try again later.';
        }
      }).catch(function () { msg.textContent = 'Could not send. Please try again later.'; });
    });
  }
  function kitUrl() { return C.hub ? 'rescue-kit/' : '../rescue-kit/'; }
  wire('optin-form', 'optin-msg', '/optin', function (f) {
    var d = new FormData(f);
    var email = (d.get('email') || '').trim();
    if (!email || !f.querySelector('[name=consent]').checked) return null;
    return { trade: C.slug, email: email, consent: true, source: 'kit', website: d.get('website') || '' };
  });
  wire('fb-form', 'fb-msg', '/feedback', function (f) {
    var d = new FormData(f);
    var m = (d.get('message') || '').trim();
    return m.length < 3 ? null : { trade: C.slug, message: m, website: d.get('website') || '' };
  }, 'Thank you. This goes straight into what gets built next.');

  var dl = document.getElementById('dl');
  if (dl) dl.addEventListener('click', function () { track('download'); });

  if (!C.defaults || typeof evaluate !== 'function') return;

  // ---- calculator ----
  var pct = { burdenPct: 1, overheadPct: 1, targetMarginPct: 1 };
  var fields = Object.keys(C.defaults);
  fields.forEach(function (f) {
    var el = document.getElementById(f);
    if (el) el.value = pct[f] ? +(C.defaults[f] * 100).toFixed(2) : C.defaults[f];
  });
  var usd = function (n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var P = function (n) { return (n * 100).toFixed(1) + '%'; };
  var MSG = {
    GOOD: ['Take it', 'Meets your margin target at this price.'],
    NEGOTIATE: ['Negotiate', 'Profitable on paper but below your target margin.'],
    PASS: ['Pass at this price', 'You lose money after overhead, or the price is zero.'],
  };
  function read() {
    var o = {};
    fields.forEach(function (f) {
      var el = document.getElementById(f);
      var raw = el ? el.value : '';
      o[f] = raw === '' ? NaN : (pct[f] ? Number(raw) / 100 : Number(raw));
    });
    if (C.mode === 'job') { delete o.visitsPerWeek; o.visitsPerMonth = 1; }
    return o;
  }
  var engaged = false;
  function render() {
    var r = evaluate(read());
    var out = document.getElementById('out');
    if (!r.ok) { out.textContent = ''; var p = document.createElement('p'); p.className = 'err'; p.textContent = r.errors.join(' | '); out.appendChild(p); return; }
    var m = MSG[r.verdict], per = C.period, rows;
    var money = [
      ['Labor hours ' + per, r.laborHours.toFixed(1)],
      ['Labor cost (with burden)', usd(r.laborCost)],
      ['Supplies, equipment, travel', usd(r.suppliesCost + r.equipmentCost + r.travelCost)],
      ['Direct cost', usd(r.directCost)],
      ['Overhead at your price', usd(r.overheadAtQuote)],
      ['Profit ' + per, usd(r.profit)],
      ['Net margin', P(r.margin)],
      ['Revenue per labor hour', usd(r.revenuePerLaborHour)],
      ['Break-even price (walk-away floor)', usd(r.breakEven)],
      ['Price that hits your target margin', usd(r.targetPrice)],
    ];
    rows = money.map(function (x) { return '<tr><td>' + x[0] + '</td><td>' + x[1] + '</td></tr>'; }).join('');
    var sens = r.sensitivity.map(function (s) { return '<tr><td>If it takes ' + (s.overrun * 100).toFixed(0) + '% more hours</td><td>' + usd(s.profit) + ' (' + P(s.margin) + ')</td></tr>'; }).join('');
    out.innerHTML = '<div class="verdict v-' + r.verdict + '">' + m[0] + '<small>' + m[1] + '</small></div><table><tbody>' + rows + '</tbody></table><h2 class="gap">Hours creep</h2><table><tbody>' + sens + '</tbody></table>';
  }
  document.querySelectorAll('input[type=number]').forEach(function (i) {
    i.addEventListener('input', function () { if (!engaged) { engaged = true; track('engage'); } render(); });
  });
  var kit = document.getElementById('kit');
  if (kit) kit.addEventListener('focusin', function once() { track('cta_click'); kit.removeEventListener('focusin', once); });
  render();
})();
