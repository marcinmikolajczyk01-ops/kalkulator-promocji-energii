# Magazyn energii — logika dyspozycji dobowej (spec dla Claude Code)

Dotyczy `symulator_promocji_NEXBE.html`. Zastępuje wcześniejszy `magazyn_fix_SPEC.md`
(był szkicem na dobie reprezentacyjnej). Liczymy na danych godzinowych HOURLY, per dzień `d`.

## Dane
`dane_godzinowe.json` (zaktualizowany) ma teraz pole `d` (indeks dnia 0..363):
`HOURLY = { d:[], mo:[], wk:[], h:[], rdn:[], cons:[], pvk:[] }`. Grupuj po `d` = jeden dzień.

## Parametry (kontrolki)
- Pojemność magazynu `C` [kWh] (suwak/pole), cykle/dobę `cyc` (domyślnie 1), sprawność `ETA=0.90`.
- Brak limitu mocy.
- Checkbox **„Ładowanie w happy hours dozwolone"** (domyślnie OFF = wymagane standardowe zarządzanie).
- happy hours = aktualnie zdefiniowane okno promocji (te same kontrolki dni/godzin/miesięcy).

## Wielkości godzinowe (po PV, przed magazynem)
```
deficit_h = max(0, cons_h - pv_h)        // realny pobór do pokrycia (sieć lub magazyn)
surplus_h = max(0, pv_h - cons_h)        // nadwyżka PV
p_h       = rdn_h + rdnAdj + KB + handlowa   // krańcowy koszt zakupu [zł/MWh]
inWin_h   = godzina w oknie promocji?
```

## Dyspozycja DOBOWA (dla każdego dnia d) — merytoryczna kolejność
```
thr  = C * cyc                  // maks. energia oddana z magazynu na dobę [kWh]
Dload = Σ_h deficit_h           // realny deficyt dnia
D    = min(thr, Dload)          // ROZŁADOWANIE: nie więcej niż realny deficyt (warunek p.5)
Chg  = D / ETA                  // ile trzeba naładować (straty)
```

### Gdzie ROZŁADOWAĆ D (priorytet zależny od trybu)
- OFF (standard): pokrywaj deficyt w godzinach o NAJWYŻSZYM p_h (minimalizacja kosztu zakupu).
- ON (happy hours): pokrywaj najpierw deficyt POZA oknem (klient unika płacenia), potem po p_h.
Alokuj D malejąco wg priorytetu, zmniejszając deficit_h w wybranych godzinach.

### Skąd NAŁADOWAĆ Chg (kolejność źródeł)
1. Najpierw nadwyżka PV: `pv_used = min(Chg, Σ surplus_h)` (autokonsumpcja).
   - eksport OFF → koszt 0; eksport ON → pomniejsza kredyt eksportu o `pv_used*(rdn-oplata)/1000`.
2. Reszta z sieci `grid_chg = Chg - pv_used`, w godzinach wg priorytetu:
   - OFF (standard): godziny o NAJNIŻSZYM p_h (arbitraż ekonomiczny; ładuj tylko jeśli to
     obniża koszt, tj. wartość wypartego deficytu > koszt ładowania ze stratami).
   - ON (happy hours): najpierw godziny W OKNIE (dla klienta darmowe), potem najtańsze po p_h.
   Dolewaj grid_chg do importu w tych godzinach.

## Koszt NEXBE (to, za co płaci = import w oknie)
Po dyspozycji policz dla każdej godziny wynikowy import z sieci:
```
grid_h = deficit_po_rozładowaniu_h + grid_charge_h
koszt_promo = Σ_{h ∈ okno} grid_h * p_h / 1000
```
(Uwaga interpretacyjna: w trybie ON ładowanie w oknie podnosi import w oknie = ekspozycja NEXBE,
a korzyść z rozładowania trafia do klienta poza oknem. W trybie OFF magazyn zwykle obniża koszt,
bo ładuje tanio / z PV i wypiera drogie godziny.)

## Sprzężenie z wskaźnikiem niedopasowania (v2)
Magazyn pochłania chwilowe piki, więc po włączeniu magazynu zmniejsz korektę niedopasowania
wg tłumika z `wskaznik_niedopasowania_SPEC_v2.md` (tlumik = min(1, (C*cyc)/średni_dobowy_import)).

## Założenia / uproszczenia (komentarz w kodzie)
- Model dobowy, merytoryczna kolejność (merit order), pojedynczy cykl/dobę przy cyc=1; nie
  wymusza ścisłej sekwencji SoC w obrębie doby (ładowanie przed rozładowaniem) — dla cyklu
  dobowego to przybliżenie wystarczające do planowania.
- Warunek `D ≤ Dload` gwarantuje, że naładowana energia służy realnemu późniejszemu zużyciu.
- ETA=0.90 jako stała (łatwo zmienić).

## Test akceptacyjny (PRZED commitem)
- Okno = cały rok, magazyn ON-standard (checkbox OFF), bez PV: koszt MA SPAŚĆ vs brak magazynu.
- To samo + PV: koszt spada bardziej (magazyn magazynuje tanie/ujemne godziny i PV).
- Checkbox happy-hours ON przy oknie z cenami DODATNIMI: koszt ROŚNIE vs OFF (ekspozycja widoczna).
- Checkbox ON przy oknie z cenami UJEMNYMI (weekendowe południa): koszt nie rośnie / spada.
- Magazyn nie oddaje więcej niż realny deficyt dnia (sprawdź skrajnie duży magazyn).
Pokaż wyniki. Zaktualizuj CLAUDE.md. Commit. Nie pushuj bez zgody.
