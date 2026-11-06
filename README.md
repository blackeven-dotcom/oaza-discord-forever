# Wow forever – roster społeczności

Statyczna strona na GitHub Pages pokazująca postacie członków społeczności
w **World of Warcraft: Forever**. Dane (klasa, rasa, specjalizacja, poziom,
item level, frakcja, profesje, portret) pochodzą z oficjalnego
[Armory Blizzarda](https://worldofwarcraft.blizzard.com/en-gb/forever/eu/armory).
Brak backendu, brak kluczy API, brak kosztów.

## Jak to działa

1. `roster.json` – lista postaci społeczności (edytujesz ręcznie).
2. `scripts/fetch_armory.py` – pobiera stronę każdej postaci z Armory,
   wyciąga osadzony JSON i zapisuje skrót do `data/characters.json`.
3. `.github/workflows/update-roster.yml` – uruchamia ten skrypt **co godzinę**,
   po każdej zmianie `roster.json` oraz ręcznie (Actions → *Update roster from
   Armory* → *Run workflow*), i commituje `data/characters.json`, jeśli coś się
   zmieniło.
4. `index.html` + `assets/app.js` – strona czyta `data/characters.json` i buduje
   tabelę z sortowaniem, wyszukiwaniem i filtrem frakcji.

Armory nie udostępnia nagłówków CORS, dlatego przeglądarka nie może odpytać go
bezpośrednio; stąd krok w GitHub Actions.

## Dodawanie postaci

Edytuj plik `roster.json`. Każda postać to jeden wpis:

```json
{ "label": "Beef Bong", "name": "Beef Bong", "leader": true }
```

| Pole     | Znaczenie                                                                       |
|----------|---------------------------------------------------------------------------------|
| `name`   | Pełna, dwuczłonowa nazwa postaci z gry, np. `Jokerd Prime`. Forever nie ma serwerów. |
| `label`  | Opcjonalny podpis, np. nick z Discorda, jeśli różni się od nazwy postaci.       |
| `leader` | Opcjonalne `true`, pokazuje koronę przy liderze.                                |
| `region` | Opcjonalnie `eu`, `us`, `kr`, `tw`; domyślnie `community.region`.               |

Po wypchnięciu zmiany workflow sam pobierze nowe postacie (zwykle w ciągu
minuty lub dwóch). Lokalnie możesz uruchomić `python scripts/fetch_armory.py`
(Python 3.8+, bez dodatkowych bibliotek).

## Postać nie pokazuje się

- Armory aktualizuje postać dopiero **po wylogowaniu z gry**; nowa postać
  pojawia się po pierwszym wylogowaniu.
- Sprawdź nazwę: adres w Armory to
  `https://worldofwarcraft.blizzard.com/en-gb/forever/eu/armory/character/<imie-nazwisko>`
  (małe litery, myślnik zamiast spacji). Jeśli ten adres daje błąd 500 lub 404,
  Armory nie zna postaci pod tą nazwą.
- Tabela pokazuje takie wpisy jako „brak w Armory”.

## Włączenie GitHub Pages

1. **Settings → Pages**, sekcja **Build and deployment**: **Source: Deploy from
   a branch**, gałąź `main`, folder `/ (root)`. Zapisz.
2. **Settings → Actions → General → Workflow permissions**: zaznacz **Read and
   write permissions**, żeby workflow mógł commitować `data/characters.json`.
3. Po minucie strona będzie dostępna pod
   `https://<użytkownik>.github.io/<nazwa-repo>/`.

Plik `.nojekyll` wyłącza Jekylla, więc pliki są serwowane bez przetwarzania.

## Ograniczenia

- Forever nie ma Mythic+ ani oficjalnych rankingów, więc nie ma kolumny score.
- Armory nie podaje gildii dla postaci Forever (na dzień pisania).
- Dane odświeżają się co godzinę; przycisk **Odśwież** wczytuje tylko ostatni
  wygenerowany plik, nie odpytuje Armory na żywo.
- Skrypt czyta JSON osadzony w stronie Armory. Jeśli Blizzard zmieni układ
  strony, workflow zacznie zgłaszać błąd i trzeba będzie dostosować
  `scripts/fetch_armory.py`.
