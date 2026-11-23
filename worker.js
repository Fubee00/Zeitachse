// Analysiert einen Google-Maps-Zeitachsen-Export (Timeline.json vom Handy).
// Läuft komplett im Browser – die Datei verlässt das Gerät nicht.
let RAW = null;

const R = 6371;
const rad = d => d * Math.PI / 180;
function dist(a, b) {
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function ll(s) {
  if (!s) return null;
  const m = String(s).replace(/°/g, '').split(',');
  return [parseFloat(m[0]), parseFloat(m[1])];
}
// Lokale Zeitangaben direkt aus dem ISO-String lesen (Zeitzone wie im Export)
const dayOf = iso => iso.slice(0, 10);
const minOf = iso => (+iso.slice(11, 13)) * 60 + (+iso.slice(14, 16));
function weekday(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); } // 0 = So
const isWeekday = day => { const w = weekday(day); return w >= 1 && w <= 5; };
function addDays(day, n) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function normalize(json) {
  // Neues Handy-Format: { semanticSegments: [...] }
  if (json.semanticSegments) return { segs: json.semanticSegments, profile: json.userLocationProfile || {} };
  // iOS-Export: Array von Einträgen mit visit/activity/timelinePath
  if (Array.isArray(json)) {
    const segs = json.map(e => {
      const s = { startTime: e.startTime, endTime: e.endTime };
      if (e.visit) s.visit = { topCandidate: { semanticType: e.visit.topCandidate?.semanticType, placeLocation: { latLng: (e.visit.topCandidate?.placeLocation || '').replace('geo:', '') } } };
      if (e.activity) s.activity = { start: { latLng: (e.activity.start || '').replace('geo:', '') }, end: { latLng: (e.activity.end || '').replace('geo:', '') }, distanceMeters: +e.activity.distanceMeters || 0, topCandidate: { type: (e.activity.topCandidate?.type || '').toUpperCase().replace('IN PASSENGER VEHICLE', 'IN_PASSENGER_VEHICLE') } };
      if (e.timelinePath) s.timelinePath = e.timelinePath.map(p => ({ point: (p.point || '').replace('geo:', ''), time: addMinutes(e.startTime, +p.durationMinutesOffsetFromStartTime || 0) }));
      return s;
    });
    return { segs, profile: {} };
  }
  throw new Error('Unbekanntes Format');
}
function addMinutes(iso, m) {
  const off = iso.slice(19);
  const d = new Date(new Date(iso).getTime() + m * 60000 + tzMs(off));
  return d.toISOString().slice(0, 19) + off;
}
function tzMs(off) { const m = /([+-])(\d\d):?(\d\d)/.exec(off); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000 : 0; }

function cluster(items, r) {
  const cl = [];
  for (const it of items) {
    let c = null;
    for (const x of cl) if (dist(x.p, it.p) < r) { c = x; break; }
    if (c) c.items.push(it); else cl.push({ p: it.p, items: [it] });
  }
  return cl;
}

function analyse(opts) {
  const { segs, profile } = RAW;
  const CAR = 'IN_PASSENGER_VEHICLE';

  // --- Daheim ---
  let home = opts.home;
  if (!home) {
    const hp = (profile.frequentPlaces || []).find(p => p.label === 'HOME');
    if (hp) home = ll(hp.placeLocation);
  }
  const visits = [];
  for (const s of segs) {
    const v = s.visit; if (!v) continue;
    const p = ll(v.topCandidate?.placeLocation?.latLng); if (!p || isNaN(p[0])) continue;
    visits.push({ st: s.startTime, en: s.endTime, p, type: v.topCandidate.semanticType });
  }
  if (!home) {
    const hv = visits.filter(v => v.type === 'HOME');
    const cl = cluster((hv.length ? hv : visits).map(v => ({ p: v.p })), 0.3).sort((a, b) => b.items.length - a.items.length);
    home = cl[0]?.p || [46.5, 11.3];
  }

  // --- Firma: häufigster Wochentags-Halt morgens, nahe daheim ---
  let work = opts.work, workAuto = false;
  if (!work) {
    const cand = visits.filter(v => isWeekday(dayOf(v.st)) && minOf(v.st) >= 300 && minOf(v.st) <= 600 && dist(v.p, home) > 1 && dist(v.p, home) < 60)
      .map(v => ({ p: v.p, d: dayOf(v.st) }));
    const cl = cluster(cand, 0.6).map(c => ({ p: c.p, n: new Set(c.items.map(i => i.d)).size })).sort((a, b) => b.n - a.n);
    if (cl[0] && cl[0].n >= 10) { work = cl[0].p; workAuto = true; }
  }

  const free = new Set(opts.free || []);
  const isFree = day => free.has(day);
  const near = p => dist(p, home) < 2 || (work && dist(p, work) < 2);
  const isCommute = (a, b) => near(a) && near(b);

  // --- Fahrten ---
  const kmMonth = {}, kmWorkMonth = {}, kmDay = {}, modeKm = {}, workWins = [];
  let kmCar = 0, kmWork = 0, firstDay = null, lastDay = null;
  for (const s of segs) {
    const d = dayOf(s.startTime);
    if (!firstDay || d < firstDay) firstDay = d;
    const e = dayOf(s.endTime); if (!lastDay || e > lastDay) lastDay = e;
    const a = s.activity; if (!a) continue;
    const type = a.topCandidate?.type || 'UNKNOWN';
    const km = (+a.distanceMeters || 0) / 1000;
    modeKm[type] = (modeKm[type] || 0) + km;
    if (type !== CAR) continue;
    const m = d.slice(0, 7);
    kmCar += km; kmMonth[m] = (kmMonth[m] || 0) + km; kmDay[d] = (kmDay[d] || 0) + km;
    const p1 = ll(a.start?.latLng), p2 = ll(a.end?.latLng);
    if (isWeekday(d) && !isFree(d) && p1 && p2 && !isCommute(p1, p2)) {
      kmWork += km; kmWorkMonth[m] = (kmWorkMonth[m] || 0) + km;
      workWins.push([s.startTime, s.endTime]);
    }
  }
  workWins.sort((x, y) => x[0] < y[0] ? -1 : 1);
  const starts = workWins.map(w => w[0]);
  function inWork(t) {
    let lo = 0, hi = starts.length - 1, i = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
    return i >= 0 && t <= workWins[i][1];
  }

  // --- Heatmap-Raster (≈1 km), getrennt nach Monat und Arbeit/Freizeit ---
  const bins = new Map();
  const add = (p, t, kind, w) => {
    if (!p || isNaN(p[0])) return;
    const k = Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100) + ',' + t.slice(0, 7) + ',' + kind;
    bins.set(k, (bins.get(k) || 0) + w);
  };
  const days = {};
  const pushDay = (t, p) => { if (!p || isNaN(p[0])) return; (days[dayOf(t)] ||= []).push([t, p]); };
  for (const s of segs) {
    const d = dayOf(s.startTime), workday = isWeekday(d) && !isFree(d);
    for (const pt of s.timelinePath || []) {
      const p = ll(pt.point);
      add(p, pt.time, inWork(pt.time) && p && dist(p, home) > 2 ? 1 : 0, 1);
      pushDay(pt.time, p);
    }
    if (s.visit) {
      const p = ll(s.visit.topCandidate?.placeLocation?.latLng);
      add(p, s.startTime, workday && p && !near(p) ? 1 : 0, 3);
    }
    if (s.activity) {
      const k = inWork(s.startTime) ? 1 : 0;
      const p1 = ll(s.activity.start?.latLng), p2 = ll(s.activity.end?.latLng);
      add(p1, s.startTime, k && p1 && dist(p1, home) > 2 ? 1 : 0, 1);
      add(p2, s.endTime, k && p2 && dist(p2, home) > 2 ? 1 : 0, 1);
      pushDay(s.startTime, p1); pushDay(s.endTime, p2);
    }
  }
  const months = [...new Set([...bins.keys()].map(k => k.split(',')[2]))].sort();
  const mi = Object.fromEntries(months.map((m, i) => [m, i]));
  const heat = [];
  for (const [k, v] of bins) { const [a, b, m, kind] = k.split(','); heat.push(+a / 100, +b / 100, mi[m], +kind, v); }

  // --- Zeitleiste ---
  const tl = Object.keys(days).sort().map(d => {
    const pts = days[d].sort((x, y) => x[0] < y[0] ? -1 : 1), out = [];
    let last = null;
    for (const [t, p] of pts) { if (last && dist(last, p) < 0.3) continue; out.push(+p[0].toFixed(4), +p[1].toFixed(4), minOf(t)); last = p; }
    return [d, out, Math.round(kmDay[d] || 0)];
  });

  // --- Übernachtungen (Nacht > 40 km von daheim) ---
  const nights = new Map();
  for (const v of visits) {
    if (dist(v.p, home) < 40) continue;
    let d = dayOf(v.st);
    if (minOf(v.st) > 180) d = addDays(d, 1); // erste 03:00-Uhr nach Beginn
    while (d + 'T03:00' >= v.st.slice(0, 16) && d + 'T03:00' <= v.en.slice(0, 16)) {
      const night = addDays(d, -1);
      if (!nights.has(night)) nights.set(night, v.p);
      d = addDays(d, 1);
    }
  }
  const hotels = cluster([...nights].map(([n, p]) => ({ p, n })), 1.5).map(c => {
    const ns = c.items.map(i => i.n).sort();
    const workN = ns.filter(n => { const w = weekday(n); return (w === 0 || w <= 4) && !isFree(n) && !isFree(addDays(n, 1)); });
    return { lat: c.p[0], lon: c.p[1], nights: ns, work: workN.length };
  }).sort((a, b) => b.nights.length - a.nights.length);

  // --- Einsatzorte: Aufenthalte Mo–Fr 6–20 Uhr, auswärts ---
  const siteItems = [];
  for (const v of visits) {
    const d = dayOf(v.st);
    if (!isWeekday(d) || isFree(d) || near(v.p) || dist(v.p, home) < 3) continue;
    const a = Math.max(minOf(v.st), 360);
    const endSame = dayOf(v.en) === d ? minOf(v.en) : 1440;
    const b = Math.min(endSame, 1200);
    const h = (b - a) / 60;
    if (h > 0.25) siteItems.push({ p: v.p, d, h });
  }
  const sites = cluster(siteItems, 1.2).map(c => {
    const per = {};
    for (const i of c.items) per[i.d] = (per[i.d] || 0) + i.h;
    const hours = Object.values(per).reduce((x, y) => x + y, 0);
    return { lat: c.p[0], lon: c.p[1], hours, days: Object.entries(per).sort().map(([d, h]) => [d, +h.toFixed(2)]), kmWork: Math.round(dist(c.p, work || home)) };
  }).filter(s => s.hours >= 3).sort((a, b) => b.hours - a.hours);

  // --- Rekorde ---
  const rec = Object.entries(kmDay).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  return {
    home, work, workAuto, firstDay, lastDay, months, heat, tl, hotels, sites,
    stats: {
      kmCar, kmWork, kmMonth, kmWorkMonth, modeKm,
      nightsAway: nights.size, hotelNights: hotels.reduce((a, h) => a + h.work, 0),
      recordDay: rec[0], recordKm: rec[1], carDays: Object.keys(kmDay).length,
    },
  };
}

self.onmessage = async e => {
  const { cmd } = e.data;
  try {
    if (cmd === 'load') {
      postMessage({ status: 'Datei wird gelesen …' });
      const text = typeof e.data.file === 'string' ? e.data.file : await e.data.file.text();
      postMessage({ status: 'Wird ausgewertet …' });
      RAW = normalize(JSON.parse(text));
    }
    if (!RAW) return;
    postMessage({ result: analyse(e.data.opts || {}) });
  } catch (err) {
    postMessage({ error: String(err.message || err) });
  }
};
