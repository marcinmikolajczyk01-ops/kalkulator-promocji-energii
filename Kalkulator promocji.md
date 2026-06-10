# CLAUDE.md — Kalkulator promocji energii (NEXBE × KENO)

Kontekst projektu dla Claude Code. Czytaj na starcie każdej sesji.

## Cel
Symulator kosztu promocji „darmowej energii" dla klientów taryfy G (rynek KENO Energia),
oferowanej kupującym magazyn energii NEXBE. Liczy, ile NEXBE kosztuje oddanie klientowi
darmowej energii w wybranym oknie czasowym (np. darmowe weekendy, południa, „wakacje").
Odbiorca narzędzia: kolega Kamil (strona biznesowa).

## Plik główny
`symulator_promocji_NEXBE.html` — pojedynczy, samowystarczalny plik HTML.
Wszystkie dane i logika są zaszyte w środku (działa po dwukliku, bez serwera).
Hosting: plik statyczny — GitHub Pages / Netlify Drop / Cloudflare Pages.

## Model kosztu dla NEXBE
koszt [zł] = wolumen[MWh] × (cena RDN + KB + opłata handlowa)
- cena RDN — godzinowa cena dnia następnego z TGE, 2025 (zł/MWh), bywa ujemna
- KB (koszt bilansowania) = 60 zł/MWh
- opłata handlowa = 35 zł/MWh
- **OTWARTE PYTANIE:** czy opłata handlowa to zł/MWh, czy opłata stała zł/miesiąc.
  Obecnie liczona jako zł/MWh. Jeśli stała — trzeba ją liczyć osobno per klient.

## Dane źródłowe (folder, pliki wejściowe)
- `TGE_mc01-12.csv` — ceny RDN 2025, układ doba×godzina, separator `;`, przecinek dziesiętny.
- `Rap_godzinowy_*.csv` — REALNY profil 1 klienta G11: 2 504 kWh/rok, godzinowy,
  2025-02-01 → 2026-01-30, kompletność 100%, kodowanie ISO-8859-2.
- `Załącznik_4_IRiESD_profile_2025.xlsx` — profile standardowe (G11 znormalizowany:
  suma roczna = 1000, czyli „na 1000 kWh"). Używane do skalowalnego klienta „przeciętnego".
- W aplikacji dane są zagregowane do 576 komórek = miesiąc × typ_dnia(0=roboczy,1=weekend)
  × godzina(1–24), każda z: średnia RDN, % godzin ujemnych, kWh realne, udział SLP/1000.

## Kluczowe ustalenia (NIE odkrywać na nowo)
1. Ceny ujemne to tylko ~3,6% godzin roku, ale skupione w POŁUDNIE (godz. 11–16)
   i WIOSNĄ/wczesnym latem (kwiecień–czerwiec; w czerwcu ~45% godzin południowych ujemnych).
   Wieczór 18–21 najdroższy. Wniosek: tanie okno = „weekendowe południa", nie „cały weekend".
2. Koszty dla realnego klienta (RDN+95, bez zmiany zachowania):
   weekendy cała doba ~344 zł/rok; 11–16 codziennie ~360; weekendowe 11–16 ~92; wakacje cze–lip ~167.
3. MAGAZYN ODWRACA LOGIKĘ PRZESUNIĘCIA: jeśli okno = godziny tanie/ujemne, to im więcej
   klient/magazyn wciągnie energii w oknie, tym TANIEJ dla NEXBE. Przy RDN < −95 zł/MWh
   NEXBE wręcz zarabia na oddawanej energii. To argument sprzedażowy, nie ryzyko.

## Funkcje aplikacji
Przełącznik profil realny / standardowy G11 (skalowalny) · składniki kosztu (RDN ± korekta,
KB, opłata handlowa) · definicja okna (dni: wszystkie/weekendy/robocze + zakres godzin +
miesiące + presety) · suwak przesunięcia zużycia + model magazynu (kWh × cykle/dzień) ·
skala (liczba klientów, marża na magazynie do porównania) · wykres RDN wg godziny (rozbieżny
od 0, ujemne na zielono) + tabela kosztu wg miesiąca.

## Moduł PV (rozbudowany 2026-06-09)
Karta „5 · Własna fotowoltaika (PV)" — suwak 0–15 kWp (krok 0,5; domyślnie 5; 0 = brak PV).

### Architektura danych
- **Realny profil:** stała `HOURLY` (8 711 godzin z `dane_godzinowe.json`): **d** (indeks dnia 0..363), mo, wk, h, rdn, cons, pvk; `pv_h = kWp * pvk[i]`; autokonsumpcja per godzina. Pole `d` grupuje godziny w doby (potrzebne dla magazynu).
- **Wstrzykiwanie danych:** `node inject_hourly.js` czyta `dane_godzinowe.json` z dysku i podmienia linię `const HOURLY = …;` w HTML (nie wczytywać JSON-a ręcznie do edytora — ~320 KB).
- **G11 profil:** stała `CELLS` (576 komórek) + `PV` (within_day_fraction); autokonsumpcja per dzień per godzina dla każdej komórki.
- `pvk[i]` = 983,9 × monthly_share[mo] / days_in_month[mo] × within_day_fraction[mo][h==24?0:h].

### Wskaźnik niedopasowania (v2, NADRZĘDNY)
Dane godzinowe zawyżają autokonsumpcję (uśredniają chwilowe piki poboru w ramach godziny). Dotyczy OBU profili — zapis „0 dla realnego" był błędny.
- Pole „Korekta autokonsumpcji w dół [%]": domyślnie 15 (realny) / 25 (G11); edytowalne; aktualizowane przy zmianie profilu.
- `korektaEff = (korekta/100) × (1 − tlumik_magazynu)` — magazyn pochłania piki, zmniejsza błąd.
- `tlumik = min(1, bat×cyc / avg_daily_import)`.
- `delta_import_window = pvAutoInWindow × korektaEff`; `costMismatch = delta × (meanRdn + adder) / 1000`.
- **Domknięcie energetyczne (2026-06-10):** utracona (zawyżona) autokonsumpcja to TA SAMA energia,
  która realnie rozjeżdża się na +IMPORT (kara) i +EKSPORT (kredyt). `delta_export = delta_import`
  (już NIE 0 jak w v1 spec). `exportMismatchCredit = delta × (meanRdn − fee)/1000` (gdy eksport ON).
  Netto kary niedopasowania = `delta × (adder + fee)/1000` (meanRdn się skraca) — zawsze dodatnia,
  ale mniejsza niż sam import. Zmiana korekty rusza I koszt, I eksport (KPI eksportu reaguje).
- Wyniki: widełki SC (model → realnie) i koszt (optymistycznie → ostrożnie). Nagłówek = wariant ostrożny.

### Eksport nadwyżek (rozliczany W OKNIE — poprawka 2026-06-10)
- Checkbox (domyślnie odznaczony) + pole opłat od sprzedanej energii [zł/MWh].
- **Eksport rozliczany TYLKO w oknie promocji** (NEXBE bilansuje handlowo pobór i oddanie klienta
  w czasie promocji; poza oknem energię rozlicza zwykły sprzedawca). Osobne akumulatory `pvExportWin`
  / `pvExportWinRdn` (suma tylko `inW`); `wartoscEksportu = (pvExportWinRdn − pvExportWin×fee)/1000`.
- W trybie OFF magazyn pochłania nadwyżkę PV W OKNIE tylko, gdy to się opłaca NEXBE (koszt = utracony
  kredyt eksportu w oknie); nadwyżkę POZA oknem może brać za darmo (eksport poza oknem nie jest NEXBE).
- `pvExportTotal`/`pvExportRdnVol` zostają ROCZNE — zasilają KPI „Oddana do sieci / rok (eksport)".
- Nagłówek: netto NEXBE = kostReal − wartoscEksportuReal. Breakdown: „Wartość eksportu w oknie (kWh)".
- Skutek: wąskie okna bez nadwyżki PV (np. wieczór) nie dostają już fałszywego kredytu za roczny eksport.

### KPI „Wynik na 1 klienta" — dwie sekcje (2026-06-10)
Wszystkie wartości to wariant REALNY (ostrożny), spójny z nagłówkiem. Bilans energii się domyka.
- **Promocja — w oknie:** Energia pobrana w oknie (`realImportWin`, + „% rocznego zużycia"),
  Oddana w oknie (`realExportWin`), **Produkcja PV w oknie** (`pvProdInWindow`),
  **Autokonsumpcja PV w oknie** (`scWinReal`=`(pvAutoInWindow+pvBatChgWin)/pvProdInWindow`, real główna
  + model podtekst — wlicza PV zmagazynowane w oknie, więc dla okna=rok = autokonsumpcja roczna),
  Śr. RDN w oknie, Godzin ujemnych w oknie.
- **Instalacja PV — rocznie** (gdy PV>0): Produkcja PV, Autokonsumpcja PV (REALNA główna `scReal`,
  model `scModel` jako szary podtekst), Energia pobrana / rok (`realImportAnnual`),
  Oddana do sieci / rok (`realExportAnnual`).
- `realImport/Export = model + delta` (delta = utracona autokonsumpcja). Bilans: pobrana+autokons=zużycie,
  oddana+autokons=produkcja. „Udział w zużyciu" → podtekst „% rocznego zużycia" pod energią pobraną.

### Rzeczywiste wartości testowe (3 kWp, 2500 kWh/rok)
- Realny 3 kWp: SC model ~35%, realnie (15%.) ~29% ✓
- G11 3 kWp: SC model ~34%, realnie (25%) ~26% (SPEC zakładał ~40%/30% — różnica wynika z mniejszej konsumpcji G11 w południe vs realny klient)
- 0 kWp: import = całe zużycie ✓

### TODO
- Potwierdzić uzysk 983,9 kWh/kWp/rok poza instalacją referencyjną.
- Eksport liczony rocznie — łatwo przełączyć na „tylko okno" jeśli biznes zdecyduje.
- Brak modelu net-billing/depozytu — uproszczenie; eksport wyceniany po RDN.

## Magazyn energii — dyspozycja dobowa (2026-06-10, wg magazyn_SPEC.md)
Wspólna funkcja `dispatchDay()` (przed `compute()`) liczy dyspozycję na JEDNEJ dobie i jest używana
przez OBA profile. Realny: doba kalendarzowa (grupowanie po `HOURLY.d`). G11: doba reprezentacyjna
(CELLS pogrupowane po `mo_wk`, 24 godziny), wynik skalowany przez liczbę dni `DAYS[mo_wk]`.
Magazyn jest wliczony w `baseVol` (nie ma już osobnego `extraBat`).
- Parametry: `bat` [kWh] = pojemność C, `cyc` cykle/dobę (domyślnie 1), `ETA=0.90` (stała w kodzie).
- **JEDEN tryb, NIEZALEŻNY OD OKNA** (przebudowa 2026-06-10; usunięto checkbox happy-hours).
  Magazyn = cecha instalacji klienta: pracuje ekonomicznie cały rok, minimalizując KOSZT ENERGII
  (realne ceny `p_h=rdn+adder`), niezależnie od okna promocji — „gra na korzyść tego, kto płaci".
- `dispatchDay` (per doba): paruje najdroższy deficyt (rozładowanie, wartość=`p_h`, dowolna godzina)
  z najtańszym źródłem ładowania (PV: utracony kredyt eksportu `rdn−fee` przy eksporcie ON, inaczej 0;
  sieć: `p_h`), dopóki `p_d > p_c/ETA`. Brak referencji do `inW` → dyspozycja jest window-independent.
- **Skutek (kluczowy):** dane ROCZNE (pobór, autokonsumpcja, eksport) zależą tylko od PV/magazynu/
  zużycia, NIE od okna promocji (potwierdza test T3/T6: rozrzut 0 kWh między oknami).
- Koszt promocji NEXBE = `Σ_{h∈okno} grid_h*p_h/1000 − eksport_w_oknie` (uczciwy wycinek przepływów).
  W drogim oknie magazyn zbija koszt; w TANIM oknie z eksportem może go **podnieść** (klient magazynuje
  swoją nadwyżkę PV zamiast eksportować → mniej kredytu eksportu dla NEXBE) — to realne, nie błąd.
- Nota „Efekt magazynu" (`#batBreakdown`) pokazuje koszt importu w oknie bez/z magazynem + bilans kWh
  (delta może być na minus = magazyn podniósł koszt w danym oknie).
- Sprzężenie z niedopasowaniem (v2): `tlumik=min(1,(bat*cyc)/avg_daily_import)` zmniejsza korektę.
- **Testy akceptacyjne:** `node test_magazyn.js` (shim DOM ładuje prawdziwy skrypt z HTML). 9/9 PASS:
  T1/T2 cały rok koszt spada; **T3/T6 dane roczne niezależne od okna** (rozrzut 0 kWh);
  T4 tanie okno+eksport — koszt może wzrosnąć (realnie); T5 ogromny magazyn oddaje ≤ realny deficyt;
  T7 G11 obniża koszt; T8 eksport liczony w oknie; T9 korekta rusza koszt I eksport.

## TODO / pomysły na rozwój
- Potwierdzić naturę opłaty handlowej (zł/MWh vs zł/mc) i ewentualnie poprawić model.
- Wersja w Excelu z jawnymi formułami dla finansów — po wybraniu 2–3 finalnych wariantów.
- Sekcja „jak czytać / założenia" na górze appki, by była samowyjaśniająca dla Kamila.
- Opcjonalnie: podłożyć profile wielu realnych klientów zamiast jednego.

## Konwencje
- Język UI i komentarzy: polski.
- Liczby: format pl-PL, jednostki zł oraz zł/MWh.
- Nie dodawać zależności wymagających serwera — plik ma zostać samowystarczalny i statyczny.
