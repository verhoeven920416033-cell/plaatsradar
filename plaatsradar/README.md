# PlaatsRadar

Gratis dashboard met actuele **wegwerkzaamheden en afsluitingen, evenementen, kermissen en weekmarkten** per plaats. Het dashboard wordt elke 30 minuten automatisch bijgewerkt en draait op een gratis GitHub-account, zonder server, sleutels of abonnementen.

## Bronnen
| Soort | Bron | Licentie |
|---|---|---|
| Wegwerk, afsluitingen, evenement-afsluitingen | NDW open data – `planningsfeed_wegwerkzaamheden_en_evenementen` | CC0 |
| Evenementenvergunningen en -meldingen, kermissen, braderieën, tijdelijke verkeersbesluiten | Gemeenteblad via de KOOP SRU-API (`repository.overheid.nl/sru`), op titel én rubriek | CC0 |
| Weekmarkten | Vast rooster in `config.json`, overgenomen uit de marktreglementen | — |
| Straatnamen bij wegwerk zonder omschrijving | OpenStreetMap Nominatim (gecachet) | ODbL |

## Eenmalig installeren (± 10 minuten)
1. Maak een gratis account aan op github.com.
2. Klik op **New repository** en noem hem bijvoorbeeld `plaatsradar`. Kies **Public**, want GitHub Pages is alleen bij publieke repo's gratis. Er staan geen privégegevens in.
3. Klik op **uploading an existing file** en sleep de inhoud van deze map erin, inclusief de map `.github`. Klik daarna op **Commit**.
   - Tip: als `.github` niet meekomt, maak dan via **Add file → Create new file** het bestand `.github/workflows/bijwerken.yml` aan en plak de inhoud erin.
4. Ga naar **Settings → Pages → Build and deployment → Source** en kies **GitHub Actions**.
5. Ga naar het tabblad **Actions**, kies **PlaatsRadar bijwerken** en klik op **Run workflow**. Na ongeveer 2 minuten staat de site op `https://<gebruikersnaam>.github.io/plaatsradar/`.

## Aanpassen
- **Plaatsen**: pas `config.json` aan via het potloodje in GitHub en commit. De workflow draait dan meteen opnieuw.
  - `gemeente` moet exact de gemeentenaam zijn zoals die in het Gemeenteblad staat (bijv. `Geldrop-Mierlo`, `Nuenen, Gerwen en Nederwetten`).
  - `lat`/`lon` is het centrum van de plaats. Je vindt het via rechtermuisklik in Google Maps.
  - `straal_km` bepaalt hoe ver om het centrum heen naar wegwerk wordt gezocht.
- **Markten**: in `config.json` staat `dag` als 0 = maandag t/m 6 = zondag.

## Goed om te weten
- **GitHub zet geplande taken na 60 dagen zonder activiteit in de repo stil.** Je krijgt daar een mail over. Klik dan in Actions op **Enable workflow**, of doe af en toe een kleine wijziging in `config.json`.
- Gemeenteblad-publicaties zijn vergunningen en besluiten. De datum van het evenement wordt uit de titel of de tekst gehaald (o.a. `Datum evenement:` en `Omschrijving:`). Lukt dat niet, dan staat er "datum onbekend" en wordt de melding nog 3 weken na publicatie getoond. Ingetrokken, geweigerde en ontwerp-publicaties worden overgeslagen; aanvraag + besluit van hetzelfde evenement worden één regel.
- **Hinder**: *hoog* = weg dicht voor auto's op een hoofdroute of met NDW-hinderklasse 2+, of een op-/afrit dicht, of een verkeersbesluit met afsluitingen. *middel* = weg dicht in een woonstraat of rijstrookbeperking. *laag* = snelheidsbeperking of fiets-/voetpad. Fiets-/voetpaden staan standaard uit (knop **Incl. fiets-/voetpaden**).
- NDW kent aparte uitvoeringsvensters (bijv. alleen 's nachts). "NU" en **Nu actief** kijken naar die vensters, niet naar de hele projectduur.
- Contactpersonen uit de NDW-opmerkingen worden bewust niet overgenomen.
- Kleine evenementen zonder vergunning staan niet in het Gemeenteblad.
- Het Brinks-netwerk blokkeert externe sites waarschijnlijk. Gebruik de site dan op je telefoon.
- Lokaal testen: `python3 tests/test_gemeenteblad.py && python3 tests/test_ndw.py`, dan `python3 scripts/ophalen.py` en daarna `python3 -m http.server -d site` openen op http://localhost:8000.
- De eerste run leest tot 80 publicaties per gemeente (±1 min per gemeente); daarna komt alles uit de cache.

Casper Verhoeven — Supervisor, Brinks Geld & Waardetransport.
