# Wow forever – roster społeczności

Statyczna strona na GitHub Pages pokazująca postacie członków społeczności.
Dane (klasa, spec, item level, Mythic+ score, progres rajdowy, gildia, portret)
pobierane są na żywo z publicznego API [Raider.IO](https://raider.io) bezpośrednio
w przeglądarce. Brak backendu, brak kluczy, brak kosztów.

## Dodawanie postaci

Edytuj plik `roster.json`. Każda postać to jeden wpis:

```json
{ "label": "Beef Bong", "name": "Beefbong", "realm": "Burning Legion", "leader": true }
```

| Pole     | Znaczenie                                                                 |
|----------|---------------------------------------------------------------------------|
| `name`   | Dokładna nazwa postaci w grze (bez spacji, wielkość liter bez znaczenia). |
| `realm`  | Serwer. Można wpisać z spacjami i apostrofami, np. `Kel'Thuzad`.          |
| `label`  | Opcjonalny podpis, np. nick z Battle.net albo Discorda.                   |
| `leader` | Opcjonalne `true`, pokazuje koronę przy liderze.                          |

Wpis bez `name` lub `realm` jest wyświetlany jako „do uzupełnienia”.

Region ustawia się raz, w sekcji `community.region` (`eu`, `us`, `kr`, `tw`).
Pole `community.discord` może zawierać link do zaproszenia; pojawi się w nagłówku.

## Włączenie GitHub Pages

1. Wypchnij repozytorium na GitHub (gałąź `main`).
2. W repozytorium: **Settings → Pages**.
3. W sekcji **Build and deployment** ustaw **Source: Deploy from a branch**,
   gałąź `main`, folder `/ (root)`. Zapisz.
4. Po minucie strona będzie dostępna pod
   `https://<użytkownik>.github.io/<nazwa-repo>/`.

Plik `.nojekyll` wyłącza Jekylla, więc pliki są serwowane bez przetwarzania.

## Jak to działa

- `index.html` – szkielet strony.
- `assets/app.js` – wczytuje `roster.json`, odpytuje Raider.IO (maks. 4 zapytania
  równolegle), buduje tabelę, obsługuje sortowanie, wyszukiwanie i filtr roli.
- `assets/style.css` – ciemny motyw, responsywny układ.
- Odpowiedzi API są cache'owane w `localStorage` przeglądarki przez
  `cacheMinutes` minut (domyślnie 10). Przycisk **Odśwież** omija cache.

## Ograniczenia

- Raider.IO musi znać postać. Nowa lub dawno nieaktywna postać pojawi się po
  odświeżeniu jej profilu na raider.io.
- Dane Raider.IO są pochodną Armory, więc mogą być opóźnione o kilka godzin.
- Publiczne API Raider.IO ma limity zapytań. Przy kilkudziesięciu postaciach i
  cache po stronie przeglądarki nie stanowi to problemu; przy setkach postaci
  warto przenieść pobieranie do GitHub Actions i serwować gotowy plik JSON.
