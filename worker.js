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

function firstYear(segs) { return (segs[0]?.startTime || '2026').slice(0, 4); }
function lastYear(segs) { return (segs[segs.length - 1]?.endTime || '2026').slice(0, 4); }
// Gesetzliche Feiertage Italien + Pfingstmontag (Südtirol)
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}
function holidays(y0, y1) {
  const out = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (const md of ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26']) out.push(`${y}-${md}`);
    const e = easter(y); out.push(addDays(e, 1), addDays(e, 50));
  }
  return out;
}

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
  if (opts.holidays !== false) for (const d of holidays(+firstYear(segs), +lastYear(segs))) free.add(d);
  const isFree = day => free.has(day);
  const near = p => dist(p, home) < 2 || (work && dist(p, work) < 1.5);

  // --- Fahrten & Arbeitstouren ---
  // Eine Arbeitstour beginnt, wenn man an einem Arbeitstag von der Firma wegfährt
  // (oder ohne Firma morgens direkt von daheim zur Baustelle / am Vorabend weit weg ins Hotel)
  // und endet bei Ankunft in der Firma bzw. daheim. Weg daheim <-> Firma zählt nie.
  const nearHome = p => dist(p, home) < 2;
  const nearWork = p => !!work && dist(p, work) < 1.5;
  const where = p => nearHome(p) ? 'H' : nearWork(p) ? 'F' : 'X';
  const workday = d => isWeekday(d) && !isFree(d);
  const acts = [];
  const kmMonth = {}, kmWorkMonth = {}, kmDay = {}, kmWorkDay = {}, modeKm = {};
  let kmCar = 0, kmWork = 0, firstDay = null, lastDay = null;
  let lastCat = null;
  const segsSorted = segs.slice().sort((x, y) => x.startTime < y.startTime ? -1 : 1);
  for (const s of segsSorted) {
    const d = dayOf(s.startTime);
    if (s.visit) { const vp = ll(s.visit.topCandidate?.placeLocation?.latLng); if (vp && !isNaN(vp[0])) lastCat = where(vp); }
    if (!firstDay || d < firstDay) firstDay = d;
    const e = dayOf(s.endTime); if (!lastDay || e > lastDay) lastDay = e;
    const a = s.activity; if (!a) continue;
    const type = a.topCandidate?.type || 'UNKNOWN';
    const km = (+a.distanceMeters || 0) / 1000;
    modeKm[type] = (modeKm[type] || 0) + km;
    const p1 = ll(a.start?.latLng), p2 = ll(a.end?.latLng);
    if (!p1 || !p2 || isNaN(p1[0]) || isNaN(p2[0])) continue;
    const a0 = where(p1) !== 'X' ? where(p1) : (lastCat || 'X');
    acts.push({ st: s.startTime, en: s.endTime, d, km, car: type === CAR, p1, p2, a: a0, b: where(p2) });
    lastCat = where(p2);
    if (type === CAR) { kmCar += km; kmMonth[d.slice(0, 7)] = (kmMonth[d.slice(0, 7)] || 0) + km; kmDay[d] = (kmDay[d] || 0) + km; }
  }
  acts.sort((x, y) => x.st < y.st ? -1 : 1);
  // Übernachtungsort je Nacht (für "fährt am Vorabend ins Hotel")
  const sleepAway = new Set();
  for (const v of visits) {
    if (dist(v.p, home) < 40) continue;
    let d = dayOf(v.st);
    for (let i = 0; i < 30 && d <= dayOf(v.en); i++, d = addDays(d, 1)) {
      if (d + 'T03:00' >= v.st.slice(0, 16) && d + 'T03:00' <= v.en.slice(0, 16)) sleepAway.add(addDays(d, -1));
    }
  }
  const workWins = [], counted = new Set();
  let tour = null; // Startzeit der laufenden Tour
  const tripsDay = {};
  for (const t of acts) {
    const m = minOf(t.st);
    // Wer daheim oder in der Firma war, ist nicht mehr auf Tour
    if (tour && (t.a === 'H' || t.a === 'F')) tour = null;
    // Tour beginnt
    if (!tour) {
      if (workday(t.d) && t.a === 'F' && t.b === 'X' && (m < 870 || dist(t.p2, home) > 20)) tour = t.st;
      else if (workday(t.d) && t.a === 'H' && t.b === 'X' && m < 660 && !(tripsDay[t.d] || []).some(x => x.b === 'F')) tour = t.st;
      else if (t.a === 'H' && t.b === 'X' && sleepAway.has(t.d) && workday(addDays(t.d, 1)) && dist(t.p2, home) > 40) tour = t.st;
      else if (workday(t.d) && t.a === 'X' && m < 660 && sleepAway.has(addDays(t.d, -1))) tour = t.st; // Tag beginnt auswärts (Hotel)
    }
    (tripsDay[t.d] ||= []).push(t);
    const counts = !!tour && !(t.a !== 'X' && t.b !== 'X') && !isFree(t.d);
    if (counts && t.car) {
      kmWork += t.km; const mo = t.d.slice(0, 7);
      kmWorkMonth[mo] = (kmWorkMonth[mo] || 0) + t.km; kmWorkDay[t.d] = (kmWorkDay[t.d] || 0) + t.km;
    }
    if (counts) { workWins.push([t.st, t.en]); counted.add(t.st); }
    // Tour endet bei Ankunft in Firma oder daheim
    if (tour && (t.b === 'F' || t.b === 'H')) tour = null;
    if (tour && isFree(t.d)) tour = null;
  }
  // Zeitfenster, in denen man "in der Arbeit" ist (inkl. Aufenthalte zwischen den Fahrten)
  const spans = [];
  { let cur = null;
    for (const t of acts) {
      const inW = counted.has(t.st);
      if (inW) { if (!cur) cur = [t.st, t.en]; else cur[1] = t.en; if (t.b !== 'X') { spans.push(cur); cur = null; } }
    }
    if (cur) spans.push(cur);
  }
  const starts = spans.map(w => w[0]);
  function inWork(t) {
    let lo = 0, hi = starts.length - 1, i = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
    return i >= 0 && t <= spans[i][1];
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
    for (const pt of s.timelinePath || []) {
      const p = ll(pt.point);
      add(p, pt.time, inWork(pt.time) && p && dist(p, home) > 2 ? 1 : 0, 1);
      pushDay(pt.time, p);
    }
    if (s.visit) {
      const p = ll(s.visit.topCandidate?.placeLocation?.latLng);
      add(p, s.startTime, inWork(s.startTime) && p && !near(p) ? 1 : 0, 3);
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
    // Arbeitsnacht = Nacht mitten in einer Arbeitstour
    const workN = ns.filter(n => inWork(n + 'T23:30') && !isFree(n));
    return { lat: c.p[0], lon: c.p[1], nights: ns, work: workN.length };
  }).sort((a, b) => b.nights.length - a.nights.length);

  // --- Einsatzorte: Aufenthalte Mo–Fr 6–20 Uhr, auswärts ---
  const siteItems = [];
  for (const v of visits) {
    const d = dayOf(v.st);
    if (isFree(d) || near(v.p) || dist(v.p, home) < 3 || !inWork(v.st)) continue;
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
      kmCar, kmWork, kmMonth, kmWorkMonth, kmWorkDay, modeKm,
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
