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

## Moduł PV (dodany 2026-06-09)
Karta „5 · Własna fotowoltaika (PV)" z suwakiem mocy 1–15 kWp (domyślnie 5).
- **Dane:** stała `PV` zaszyjna w pliku — profil miesięczny + kształt godzinowy doby wg realnej analizy (uzysk 983,9 kWh/kWp/rok).
- **Autokonsumpcja:** liczona per dzień, per godzina (NIE na zagregowanych sumach) → `import_dzien = max(0, zuz_dzien − pv_dzien_h)`.
- **Koszt promocji:** na imporcie netto (zużycie − autokonsumpcja); magazyn też na imporcie netto.
- **Eksport nadwyżek** (opcja, domyślnie odznaczona): wycena po cenie RDN minus dodatkowe opłaty, dla całego roku (nie tylko okna). Wynik: koszt_promo, wartość eksportu i netto NEXBE.
- **Mapowanie godzin:** CELLS.h 1..24 → PV.within_day_fraction[m][h===24?0:h].
- TODO: potwierdzić uzysk 983,9 kWh/kWp/rok poza instalacją referencyjną; ewentualnie zamienić na pole edytowalne.
- TODO: eksport liczony rocznie (cały rok) — łatwo przełączyć na „tylko okno" jeśli biznes zdecyduje.
- TODO: brak modelu net-billing/depozytu — uproszczenie; eksport wyceniany po RDN.

## TODO / pomysły na rozwój
- Potwierdzić naturę opłaty handlowej (zł/MWh vs zł/mc) i ewentualnie poprawić model.
- Wersja w Excelu z jawnymi formułami dla finansów — po wybraniu 2–3 finalnych wariantów.
- Sekcja „jak czytać / założenia" na górze appki, by była samowyjaśniająca dla Kamila.
- Opcjonalnie: podłożyć profile wielu realnych klientów zamiast jednego.

## Konwencje
- Język UI i komentarzy: polski.
- Liczby: format pl-PL, jednostki zł oraz zł/MWh.
- Nie dodawać zależności wymagających serwera — plik ma zostać samowystarczalny i statyczny.
