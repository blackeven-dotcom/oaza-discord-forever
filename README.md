# Wow forever – roster społeczności

Statyczna strona na GitHub Pages pokazująca postacie członków społeczności
w **World of Warcraft: Forever**. Dane (klasa, rasa, poziom, item level,
frakcja, gildia, portret) pobierane są na żywo z publicznego API
[Raider.IO Forever](https://forever.raider.io) bezpośrednio w przeglądarce.
Brak backendu, brak kluczy, brak kosztów.

## Dodawanie postaci

Edytuj plik `roster.json`. Każda postać to jeden wpis:

```json
{ "label": "Beef Bong", "name": "Beef Bong", "ruleset": "normal", "leader": true }
```

| Pole      | Znaczenie                                                                        |
|-----------|----------------------------------------------------------------------------------|
| `name`    | Pełna, dwuczłonowa nazwa postaci z gry, np. `Jokerd Prime`. Forever nie ma serwerów. |
| `ruleset` | Opcjonalnie `normal` lub `pvp`; domyślnie wartość `community.ruleset`.           |
| `label`   | Opcjonalny podpis, np. nick z Discorda, jeśli różni się od nazwy postaci.        |
| `leader`  | Opcjonalne `true`, pokazuje koronę przy liderze.                                 |

Wpis bez `name` jest wyświetlany jako „do uzupełnienia”.

Region ustawia się raz, w sekcji `community.region` (`eu`, `us`, `kr`, `tw`),
domyślny ruleset w `community.ruleset`. Pole `community.discord` może zawierać
link do zaproszenia; pojawi się w nagłówku.

## Skąd Raider.IO zna postać

Raider.IO indeksuje postać dopiero po tym, jak ktoś jej poszuka. Jeśli w tabeli
widzisz „nie znaleziono na Raider.IO”, wejdź na <https://forever.raider.io>,
wyszukaj postać po pełnej nazwie i odczekaj chwilę. Potem kliknij **Odśwież**
na stronie rosteru.

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
- `assets/app.js` – wczytuje `roster.json`, odpytuje
  `forever.raider.io/api/v1/characters/profile` (maks. 4 zapytania równolegle;
  parametr `realm` to ruleset), buduje tabelę, obsługuje sortowanie,
  wyszukiwanie i filtr frakcji.
- `assets/style.css` – ciemny motyw, responsywny układ.
- Odpowiedzi API są cache'owane w `localStorage` przeglądarki przez
  `cacheMinutes` minut (domyślnie 10). Przycisk **Odśwież** omija cache.

## Ograniczenia

- Forever nie ma Mythic+ ani rankingów na Raider.IO, więc nie ma kolumny score.
  Pola spec i progres rajdowy są w API Forever na razie puste.
- Dane Raider.IO są pochodną Armory, więc mogą być opóźnione o kilka godzin.
- Publiczne API Raider.IO ma limity zapytań. Przy kilkudziesięciu postaciach i
  cache po stronie przeglądarki nie stanowi to problemu; przy setkach postaci
  warto przenieść pobieranie do GitHub Actions i serwować gotowy plik JSON.
