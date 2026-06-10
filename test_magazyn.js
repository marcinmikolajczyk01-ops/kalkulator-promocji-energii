// Harness testów akceptacyjnych magazyn_SPEC.md.
// Ładuje PRAWDZIWY <script> z symulator_promocji_NEXBE.html w shimie DOM i wywołuje compute().
// Nie modyfikuje pliku HTML — telemetrię wstrzykuje tylko w kopii skryptu w pamięci.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'symulator_promocji_NEXBE.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('nie znaleziono <script>');
let script = m[1];

// Telemetria: tuż przed sekcją "hour chart" zrzuć wewnętrzne liczby do globalThis.__out
script = script.replace('  // hour chart (na imporcie netto)',
  'globalThis.__out={cost,kostModel,kostReal,kostPromo,costBase,costBaseNB,batSavings,batDisch,' +
  'baseVol,baseVolNB,winHrs,negHrs,annualVol,pvAutoTotal,pvProdTotal,wartoscEksportu,meanRdn,' +
  'batChgGrid,batChgPv,extraVol,totalVol,pvExportWin,pvExportTotal,realExportWin,realExportAnnual,' +
  'realImportAnnual,exportMismatchCredit,wartoscEksportuReal,korektaEff,costMismatch};\n  // hour chart (na imporcie netto)');
// Eksponuj compute/state po definicji
script += '\nglobalThis.__compute=compute;globalThis.__state=state;';

// --- shim DOM ---
const els = {};
function mkClassList() {
  const s = new Set();
  return { add: n => s.add(n), remove: n => s.delete(n),
    toggle: (n, f) => { if (f === undefined) f = !s.has(n); f ? s.add(n) : s.delete(n); return f; },
    contains: n => s.has(n) };
}
function mkStyle() { return new Proxy({}, { get: () => '', set: () => true }); }
function mkEl(id) {
  return { id, value: '', checked: false, textContent: '', innerHTML: '',
    className: '', dataset: {}, style: mkStyle(), classList: mkClassList(),
    appendChild() {}, querySelector() { return mkEl('q'); },
    addEventListener() {}, set oninput(f) {}, set onchange(f) {}, set onclick(f) {} };
}
function getEl(id) { return els[id] || (els[id] = mkEl(id)); }
const document = {
  getElementById: getEl,
  querySelector: () => mkEl('qs'),
  querySelectorAll: () => [],
  createElement: () => mkEl('new'),
};
const sandbox = { document, window: {}, console, Math, Date, Set, Map, Array, JSON, Object,
  Number, parseInt, parseFloat, isNaN, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox);

const state = sandbox.__state;
const allM = [1,2,3,4,5,6,7,8,9,10,11,12];

// Ustaw kontrolki + okno, wywołaj compute, zwróć telemetrię
function run(opts) {
  const o = Object.assign({ prof:'real', kwh:2504, rdnAdj:0, kb:60, handl:35, bat:0, cyc:1,
    cust:1, margin:3000, shift:0, pvKwp:0, pvExport:false, pvExportFee:0, pvMismatch:15,
    batHappy:false, dt:'all', months:allM, hStart:1, hEnd:24 }, opts);
  for (const id of ['kwh','rdnAdj','kb','handl','bat','cyc','cust','margin','shift','pvKwp','pvExportFee','pvMismatch'])
    getEl(id).value = String(o[id]);
  getEl('pvExport').checked = o.pvExport;
  getEl('batHappy').checked = o.batHappy;
  state.prof = o.prof; state.dt = o.dt; state.months = new Set(o.months);
  state.hStart = o.hStart; state.hEnd = o.hEnd;
  sandbox.__compute();
  return Object.assign({}, sandbox.__out);
}

const z = x => (Math.round(x)).toLocaleString('pl-PL') + ' zł';
const pass = b => b ? 'PASS ✓' : 'FAIL ✗';
let allPass = true;
function check(b){ if(!b) allPass = false; return pass(b); }

console.log('=== Testy akceptacyjne magazyn (profil REALNY, dane godzinowe) ===\n');

// T1: Okno = cały rok, magazyn ON-standard (happy OFF), bez PV → koszt MA SPAŚĆ vs brak magazynu
{
  const base = run({ bat:0 });
  const mag  = run({ bat:10, cyc:1 });
  console.log('T1  Cały rok, standard, bez PV — magazyn obniża koszt');
  console.log('    bez magazynu kostReal =', z(base.kostReal));
  console.log('    magazyn 10 kWh kostReal =', z(mag.kostReal), '| batSavings =', z(mag.batSavings),
              '| rozładowano', mag.batDisch.toFixed(0), 'kWh');
  console.log('    =>', check(mag.kostReal < base.kostReal - 0.01), '\n');
}

// T2: To samo + PV → koszt spada bardziej
{
  const pvNoBat = run({ bat:0, pvKwp:5 });
  const pvBat   = run({ bat:10, cyc:1, pvKwp:5 });
  console.log('T2  Cały rok, standard, z PV 5 kWp — magazyn obniża koszt (PV+tania energia)');
  console.log('    PV bez magazynu kostReal =', z(pvNoBat.kostReal));
  console.log('    PV + magazyn   kostReal =', z(pvBat.kostReal), '| batSavings =', z(pvBat.batSavings),
              '| ład. z PV', pvBat.batChgPv.toFixed(0), 'kWh');
  console.log('    =>', check(pvBat.kostReal < pvNoBat.kostReal - 0.01), '\n');
}

// T3: Happy-hours ON przy oknie z cenami DODATNIMI (wieczór 18-21) → koszt ROŚNIE vs OFF
{
  const win = { dt:'all', months:allM, hStart:18, hEnd:21 };
  const off = run(Object.assign({ bat:10, cyc:1, batHappy:false }, win));
  const on  = run(Object.assign({ bat:10, cyc:1, batHappy:true  }, win));
  console.log('T3  Okno 18–21 (drogie, dodatnie ceny) — happy-hours ON podnosi koszt vs OFF');
  console.log('    OFF (standard) kostReal =', z(off.kostReal));
  console.log('    ON  (happy)    kostReal =', z(on.kostReal));
  console.log('    =>', check(on.kostReal > off.kostReal + 0.01), '\n');
}

// T4: Happy-hours ON przy oknie z cenami UJEMNYMI (czerwcowe weekendowe południa) → koszt nie rośnie / spada.
// W oknie ujemnym ładowanie w oknie dorzuca import o ujemnym p_h => NEXBE nie traci, a wręcz zarabia.
// Kluczowy kontrast z T3: ekspozycja ON−OFF jest znikoma (nie wybucha jak przy cenach dodatnich).
{
  const win = { dt:'wknd', months:[6], hStart:11, hEnd:16 };   // czerwiec: ~61% godzin ujemnych
  const nb  = run(Object.assign({ bat:0 }, win));
  const off = run(Object.assign({ bat:10, cyc:1, batHappy:false }, win));
  const on  = run(Object.assign({ bat:10, cyc:1, batHappy:true  }, win));
  console.log('T4  Okno czerwcowe weekendowe 11–16 (ceny ujemne) — happy-hours ON nie podnosi kosztu');
  console.log('    bez magazynu   kostReal =', z(nb.kostReal),  '| meanRdn =', nb.meanRdn.toFixed(0));
  console.log('    OFF (standard) kostReal =', z(off.kostReal));
  console.log('    ON  (happy)    kostReal =', z(on.kostReal), '| ekspozycja ON−OFF =', z(on.kostReal-off.kostReal),
              '(w T3 było +1622 zł)');
  // Spec: koszt nie rośnie / spada — vs brak magazynu ON jest niżej (NEXBE zarabia), a ekspozycja vs OFF jest znikoma.
  console.log('    =>', check(on.kostReal <= nb.kostReal + 0.5 && (on.kostReal - off.kostReal) < 5), '\n');
}

// T5: Magazyn nie oddaje więcej niż realny deficyt dnia (skrajnie duży magazyn)
{
  const huge = run({ bat:100000, cyc:10, pvKwp:0 });          // ogromna pojemność
  const annualDeficit = huge.annualVol;                       // bez PV deficyt=zużycie
  console.log('T5  Skrajnie duży magazyn nie oddaje więcej niż realny deficyt dnia');
  console.log('    roczne zużycie/deficyt =', huge.annualVol.toFixed(0), 'kWh');
  console.log('    rozładowano łącznie    =', huge.batDisch.toFixed(0), 'kWh');
  console.log('    =>', check(huge.batDisch <= annualDeficit + 1), '\n');
}

// T6: REGRESJA — tryb standardowy (happy OFF) NIGDY nie podnosi kosztu NEXBE,
// niezależnie od okna i eksportu (zgłoszony błąd: tanie okno + eksport ON podnosiło koszt).
{
  const windows = [
    ['cały rok',        { dt:'all',  months:allM, hStart:1,  hEnd:24 }],
    ['weekend 11–16',   { dt:'wknd', months:allM, hStart:11, hEnd:16 }],
    ['codziennie 11–16',{ dt:'all',  months:allM, hStart:11, hEnd:16 }],
    ['wieczór 18–21',   { dt:'all',  months:allM, hStart:18, hEnd:21 }],
    ['wakacje 6–7',     { dt:'all',  months:[6,7], hStart:1, hEnd:24 }],
  ];
  console.log('T6  Standard (happy OFF) nie podnosi kosztu NEXBE — OBA profile, każde okno / eksport');
  let worst = -Infinity, worstNm = '';
  for (const prof of ['real', 'slp'])
    for (const exp of [false, true])
      for (const pv of [0, 5])
        for (const [nm, w] of windows) {
          const base = { prof, kwh:2500, pvKwp:pv, pvExport:exp };
          const nb  = run(Object.assign({}, base, { bat:0 }, w));
          const off = run(Object.assign({}, base, { bat:10, cyc:1, batHappy:false }, w));
          const d = off.kostReal - nb.kostReal;          // >0 = magazyn POGORSZYŁ pozycję NEXBE
          if (d > worst) { worst = d; worstNm = `${prof}, ${nm}, PV ${pv}, eksport ${exp?'ON':'OFF'}`; }
        }
  console.log('    najgorsza delta (mag − bez mag) =', z(worst), '@', worstNm);
  console.log('    =>', check(worst <= 0.5), '\n');   // dopuszczalny szum zaokrągleń
}

// T7: G11 — magazyn obniża koszt (cały rok, z PV i bez), tak jak dla profilu realnego
{
  const winAll = { prof:'slp', kwh:2500, dt:'all', months:allM, hStart:1, hEnd:24 };
  const nb  = run(Object.assign({}, winAll, { pvKwp:0, bat:0 }));
  const off = run(Object.assign({}, winAll, { pvKwp:0, bat:10, cyc:1 }));
  const nbP = run(Object.assign({}, winAll, { pvKwp:5, bat:0 }));
  const offP= run(Object.assign({}, winAll, { pvKwp:5, bat:10, cyc:1 }));
  console.log('T7  Profil G11 (doba reprezentacyjna) — magazyn obniża koszt');
  console.log('    bez PV: bez mag', z(nb.kostReal), '→ mag', z(off.kostReal), '| Δ', z(off.kostReal-nb.kostReal));
  console.log('    PV 5kWp: bez mag', z(nbP.kostReal), '→ mag', z(offP.kostReal), '| Δ', z(offP.kostReal-nbP.kostReal));
  console.log('    =>', check(off.kostReal < nb.kostReal - 0.5 && offP.kostReal < nbP.kostReal - 0.5), '\n');
}

// T8: Eksport rozliczany TYLKO w oknie promocji (nie dla całego roku).
{
  const pv = { pvKwp:5, pvExport:true, pvExportFee:25, bat:0 };
  const yr  = run(Object.assign({}, pv, { dt:'all',  months:allM, hStart:1,  hEnd:24 })); // cały rok
  const eve = run(Object.assign({}, pv, { dt:'all',  months:allM, hStart:18, hEnd:21 })); // wieczór — brak nadwyżki PV
  const mid = run(Object.assign({}, pv, { dt:'all',  months:allM, hStart:11, hEnd:16 })); // południe — nadwyżka PV
  console.log('T8  Eksport liczony w oknie, nie dla całego roku');
  console.log('    eksport roczny (KPI, całość) =', yr.pvExportTotal.toFixed(0), 'kWh');
  console.log('    okno cały rok  : eksport w oknie', yr.pvExportWin.toFixed(0), 'kWh | wartość', z(yr.wartoscEksportu));
  console.log('    okno wieczór   : eksport w oknie', eve.pvExportWin.toFixed(0), 'kWh | wartość', z(eve.wartoscEksportu));
  console.log('    okno południe  : eksport w oknie', mid.pvExportWin.toFixed(0), 'kWh | wartość', z(mid.wartoscEksportu));
  // cały rok = pełny eksport; wieczór ≈ 0 (brak nadwyżki PV w oknie); południe pomiędzy
  console.log('    =>', check(
    Math.abs(yr.pvExportWin - yr.pvExportTotal) < 1 &&        // okno=rok ⇒ eksport w oknie = roczny
    eve.pvExportWin < 0.1 * yr.pvExportTotal &&               // wieczór: znikomy eksport w oknie
    mid.pvExportWin > eve.pvExportWin &&                      // południe > wieczór
    mid.pvExportWin < yr.pvExportTotal                        // ale mniej niż roczny
  ), '\n');
}

// T9: Korekta autokonsumpcji wpływa NA OBA — koszt NEXBE i eksport (domknięcie energetyczne).
// Wcześniej eksport stał w miejscu mimo zmiany korekty (delta_export=0).
{
  const base = { prof:'real', pvKwp:5, pvExport:true, pvExportFee:25, bat:0,
                 dt:'all', months:allM, hStart:1, hEnd:24 };
  const lo = run(Object.assign({}, base, { pvMismatch:0  }));   // bez korekty
  const hi = run(Object.assign({}, base, { pvMismatch:30 }));   // duża korekta
  console.log('T9  Korekta autokonsumpcji wpływa na koszt I na eksport');
  console.log('    korekta 0% : kostReal', z(lo.kostReal), '| eksport w oknie', lo.realExportWin.toFixed(0), 'kWh | kredyt', z(lo.wartoscEksportuReal));
  console.log('    korekta 30%: kostReal', z(hi.kostReal), '| eksport w oknie', hi.realExportWin.toFixed(0), 'kWh | kredyt', z(hi.wartoscEksportuReal));
  console.log('    eksport reaguje (Δ kWh) =', (hi.realExportWin-lo.realExportWin).toFixed(0),
              '| dodatkowy kredyt eksportu =', z(hi.exportMismatchCredit));
  console.log('    =>', check(
    hi.realExportWin > lo.realExportWin + 1 &&      // eksport rośnie z korektą (urealnienie)
    hi.exportMismatchCredit > 1 &&                  // jest kredyt eksportu z niedopasowania
    hi.kostReal > lo.kostReal + 1                   // koszt też się zmienia (netto wyższy = ostrożniej)
  ), '\n');
}

console.log(allPass ? '>>> WSZYSTKIE TESTY PRZESZŁY ✓' : '>>> SĄ BŁĘDY ✗');
process.exit(allPass ? 0 : 1);
