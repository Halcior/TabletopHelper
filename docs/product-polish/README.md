# Rules Source & product polish

Nowe gry prowadzą najpierw do obsługiwanych oficjalnych formatów. Cauldron i mieszane talie pozostały dostępne w ustawieniach zaawansowanych. Zmiany dotyczą wyborów początkowych i prezentacji; silnik punktowania, synchronizacja i format zapisu nie zostały zmienione.

## Domyślności i źródła zasad

| Tryb | Preset nowej gry | Oznaczenie |
| --- | --- | --- |
| Duel 1v1 | Chapter Approved: macierz Force Dispositions, Secondary Tactical | Official format |
| Doubles 2v2 | GW Doubles v1.0, macierz Chapter Approved, wspólne talie drużyn, Tactical | Official format |
| FFA 3 | Balanced FFA v1, Chapter Approved z adaptacją Rival, Tactical, 7 objectives | Community format / Recommended House Format |

- Sekcja **Rules Source** pokazuje źródło, opis Primary i Secondary oraz przycisk przywracający rekomendowany preset.
- **Custom / Homebrew settings** jest domyślnie zamknięte. Pozwala wybrać Cauldron albo dostępne mieszane talie w Duel/FFA. Doubles zachowuje wyłącznie istniejącą, obsługiwaną konfigurację oficjalną.
- Etykieta jest wyliczana z faktycznie wybranych talii i trybu. Użycie kart Chapter Approved w FFA nigdy nie zmienia go w format Official.
- Oznaczenia są widoczne w podsumowaniu setupu, lobby i wyborze miejsca gracza, szczegółach bitwy, raporcie i historii na Home.
- Bezpośrednie linki `?mode=duel`, `?mode=ffa3` i `?mode=doubles2v2` stosują te same domyślności. Doubles otrzymuje poprawne początkowe strefy i kolejność drużyn.
- Zapisane bitwy nie otrzymują nowych domyślności. Brakujące historyczne pola nadal oznaczają Cauldron. Stary profil FFA nie jest przedstawiany jako Balanced FFA v1.
- Linki źródłowe prowadzą do tych samych przypiętych dokumentów GW v1.0 co [istniejący audyt zasad](../11th-edition-rules-audit-2026-10-15.md), oraz do strony aktualizacji GW. Ten polish nie jest nowym audytem ani zmianą reguł.

## Wygląd i obsługa

- Spójne karty, ramki, zaokrąglenia, odstępy i nagłówki w setupie oraz we wspólnym stylu aplikacji.
- Złoto wyróżnia aktywną fazę, aktywną stronę i główną akcję. Niebieski oznacza informację/CP, zielony potwierdzenie, czerwony zagrożenie. Kolory graczy zachowują dotychczasowe znaczenie.
- Scoreboard rozdziela duży wynik VP i zasób CP. Aktywna karta ma złotą ramkę i czytelną etykietę; wspólny widok potrafi pokazać jednocześnie „You · Active”. Przyciski ±CP zostają na kartach.
- Home pokazuje dostępne trzy formaty i poprawnie rozkłada wyniki aktywnej bitwy. Poprawiono opisy pustych ekranów, komunikaty ładowania i komunikację o niedostępnym multiplayerze.
- Mobilny setup ma dostępną u dołu akcję przejścia do następnego kroku. Przyciski CP zachowują co najmniej 44 × 44 px również przy szerokości 320 px.
- Etykiety źródła używają także tekstu i symbolu, aby rozróżnienie nie zależało tylko od koloru.

## Usunięcie stratagemów z interfejsu

- Usunięto karty stratagemów, panel przeciwnika, podpowiedzi reakcji i przegląd timingu przy końcu fazy. Zwykła gra nie otwiera już automatycznych okien reakcji.
- Ekran bitwy nie pobiera bazy 40kdc; build nie zawiera już jej pakietu ~1,2 MB przed kompresją. CP obsługuje się przyciskami ± na scoreboardzie, a zasady stratagemów rozstrzyga przy stole.
- Zachowano format zdarzeń, replay, odczyt historycznych stratagemów oraz logikę zgodności starszych zapisów. Zapisane otwarte okna, zarówno automatyczne, jak i ręczne, mają przycisk **Close legacy pause**, respektujący dotychczasowe uprawnienia multiplayer. Zamknięcie nie usuwa historii ani nie zwraca wydanych CP.
- Zmiany znajdują się w `BattleDashboard.tsx`, `ContextCommandCentre.tsx` i `SharedPlayerPerspective.tsx`; nieużywane komponenty stratagemów zostały usunięte. Regresje obejmuje `e2e/no-stratagems.spec.ts`.

## Tło

1. Gradient grafitowej stali z ograniczonym bursztynowym i chłodnym światłem.
2. Autorski SVG z abstrakcyjnymi konturami terenu, przerywanymi trasami i znakami pomiarowymi. Bez logotypów, figurek i emblematów.
3. Delikatna siatka i mała, statyczna tekstura ziarna. Telefon pomija ziarno i zmniejsza widoczność mapy.
4. Winieta ograniczająca intensywność motywów przy krawędziach.

Brak animacji, parallax, canvas, fontów sieciowych i ciężkich bitmap. Warstwy nie przechwytują kliknięć i są ukryte przed czytnikami ekranu oraz wydrukiem. Wewnętrzne presety `tactical` (domyślny), `steel` i `cartography` różnią intensywność warstw; nie dodają nowej opcji do zapisów bitew.

## Mapa plików

| Obszar | Pliki |
| --- | --- |
| Domyślności i klasyfikacja źródła | `src/rulesets/rulesSource.ts`, `src/pages/BattleSetup.tsx` |
| Wspólny badge | `src/components/ui/RulesSourceBadge.tsx` |
| Tło i presety | `src/components/AppBackground.tsx`, `src/appBackground.css`, `src/assets/tactical-map.svg` |
| Wspólny polish i kolejność stylów | `src/productPolish.css`, `src/visualSystem.css`, `src/App.tsx` |
| Scoreboard | `src/components/battle/Scoreboard.tsx` |
| Home, lobby i ekran bitwy | `src/pages/Home.tsx`, `src/pages/SharedSessions.tsx`, `src/pages/BattleDashboard.tsx` |
| Raport i wydruk | `src/components/battle/BattleReport.tsx` |
| Regresje domyślności i zapisów | `src/rulesets/rulesSource.test.ts`, `e2e/rules-source.spec.ts` |

Dotychczasowe scenariusze E2E wymagające Cauldrona teraz jawnie wybierają go przez `chooseCauldronPreset`; scenariusze oficjalne korzystają z nowego domyślnego wyboru. Nie pomijano testów rozgrywki.

## Sprawdzenie i podglądy

Weryfikacja 2026-10-20: TypeScript bez błędów, 518/518 testów jednostkowych, build produkcyjny poprawny. Po usunięciu importu danych stratagemów zniknęło ostrzeżenie o pakiecie danych ~1,2 MB. Scenariusze E2E obejmują 47 przypadków: pełny przebieg uruchomiono, a po poprawieniu oczekiwań testów dla pustych faz i przygotowania historycznych zapisów powtórzono zmienione scenariusze oraz wszystkie kontrole UI. Starsze testy nie zakładają już obecności karty stratagemów w każdej fazie.

Polecenia walidacji:

```sh
npx tsc --noEmit
npm test -- --run
npm run test:e2e
npm run build
```

Nowy zestaw sprawdza domyślności, zachowanie wyborów pomiędzy krokami, tworzenie i ponowne otwieranie każdego trybu przez bezpośredni link, stare profile oraz powierzchnie 320/360/390/768/1440 px. Istniejące testy obejmują również synchronizację 2/3/4 telefonów, cele, fazy, punktację, import, raport i offline/reconnect. Podglądy korzystają z danych testowych i prawdziwych ekranów aplikacji.

Zrzuty można odtworzyć poleceniem:

```sh
CAPTURE_PRODUCT_UI=1 npx playwright test e2e/rules-source.spec.ts
```

- [Setup Duel — telefon](screenshots/setup-duel-mobile.png)
- [Setup Duel — desktop](screenshots/setup-duel-desktop.png)
- [Setup FFA — Community](screenshots/setup-ffa-mobile.png)
- [Home — telefon](screenshots/home-mobile.png)
- [Home — desktop](screenshots/home-desktop.png)
- [Bitwa — telefon](screenshots/battle-mobile.png)
- [Bitwa — desktop](screenshots/battle-desktop.png)

Ręczna kontrola: zaimportuj armię, otwórz **New battle**, porównaj źródła dla trzech formatów, rozwiń **Custom / Homebrew settings**, przejdź między krokami i otwórz starą bitwę. Na ekranie bitwy sprawdź aktywną stronę, fazę, CP/VP oraz **Session details**. PR pozostaje do przeglądu; nie jest automatycznie scalany.
