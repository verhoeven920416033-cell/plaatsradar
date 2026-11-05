# PlaatsRadar

Gratis dashboard met actuele **wegwerkzaamheden en afsluitingen, evenementen, kermissen en weekmarkten** voor alle 138 gemeenten in **Noord-Brabant, Gelderland en Limburg**. Het dashboard wordt elke 30 minuten automatisch bijgewerkt en draait op een gratis GitHub-account, zonder server, sleutels of abonnementen.

## Bronnen
| Soort | Bron | Licentie |
|---|---|---|
| Wegwerk, afsluitingen, evenement-afsluitingen | NDW open data – `planningsfeed_wegwerkzaamheden_en_evenementen` | CC0 |
| Evenementenvergunningen en -meldingen, kermissen, braderieën, tijdelijke verkeersbesluiten | Gemeenteblad via de KOOP SRU-API (`repository.overheid.nl/sru`), op titel én rubriek | CC0 |
| Weekmarkten | Vast rooster in `config.json`, overgenomen uit de marktreglementen | — |
| Plaatsen zoeken (in je browser) | PDOK Locatieserver | CC0 |
| Straatnamen bij wegwerk zonder omschrijving | OpenStreetMap Nominatim (gecachet) | ODbL |

## Eenmalig installeren (± 10 minuten)
1. Maak een gratis account aan op github.com.
2. Klik op **New repository** en noem hem bijvoorbeeld `plaatsradar`. Kies **Public**, want GitHub Pages is alleen bij publieke repo's gratis. Er staan geen privégegevens in.
3. Klik op **uploading an existing file** en sleep de inhoud van deze map erin, inclusief de map `.github`. Klik daarna op **Commit**.
   - Tip: als `.github` niet meekomt, maak dan via **Add file → Create new file** het bestand `.github/workflows/bijwerken.yml` aan en plak de inhoud erin.
4. Ga naar **Settings → Pages → Build and deployment → Source** en kies **GitHub Actions**.
5. Ga naar het tabblad **Actions**, kies **PlaatsRadar bijwerken** en klik op **Run workflow**. Na ongeveer 2 minuten staat de site op `https://<gebruikersnaam>.github.io/plaatsradar/`.

## Aanpassen
- **Op de site**: klik een provincie aan, typ een plaats (ook dorpen, bijv. Lierop) of vink gemeenten aan onder **Alle gemeenten per provincie**. Je keuze wordt in je browser onthouden. **Mijn regio** zet de favorieten terug.
- **Losse plaats** = alles binnen de gekozen straal rond dat dorp. Publicaties zonder coördinaten komen via de gemeente mee.
- **Favorieten**: `favorieten` in `config.json` zijn de gemeenten die standaard openstaan.
- **Gemeenten**: `gemeenten.json`. Pas alleen aan bij een gemeentelijke herindeling. `naam` moet exact de naam in het Gemeenteblad zijn.
- **Markten**: in `config.json` staat `dag` als 0 = maandag t/m 6 = zondag, `plaats` is de gemeentenaam. Alleen de ingevoerde markten staan op de site, dus nog niet heel Gelderland en Limburg.

## Routecheck
Knop **Routecheck** op de site, of `routecheck.html`. Kies een routelijst (PDF met tekst, Excel .xlsx, CSV of tekst) en een periode. Je krijgt per route de meldingen op de straten van je stops, plus hoge hinder, evenementen en markten in de plaatsen op de route.

- **Routelijsten blijven op je computer.** Ze worden in de browser gelezen, niet verstuurd en niet bewaard. Een Content-Security-Policy op de pagina blokkeert verkeer naar andere sites. Zet routelijsten **nooit** in deze publieke repo; `*.pdf`, `*.xlsx`, `*.xls` en `*.csv` staan in `.gitignore`.
- **Pc zonder toegang tot de site:** download `routecheck-offline.html` thuis en zet die over. Dat ene bestand bevat lezer + openbare meldingen van dat moment. Dubbelklikken is genoeg, internet is niet nodig. Vanaf 1 dag oud waarschuwt de pagina.
- De vergelijking werkt op naam: de weg tussen twee stops wordt niet bekeken. *Controleren* = zelfde straatnaam in dezelfde gemeente, maar plaats niet bevestigd.
- Een gescande PDF (afbeelding) kan niet gelezen worden.

## Goed om te weten
- **GitHub zet geplande taken na 60 dagen zonder activiteit in de repo stil.** Je krijgt daar een mail over. Klik dan in Actions op **Enable workflow**, of doe af en toe een kleine wijziging in `config.json`.
- Gemeenteblad-publicaties zijn vergunningen en besluiten. De datum van het evenement wordt uit de titel of de tekst gehaald (o.a. `Datum evenement:` en `Omschrijving:`). Lukt dat niet, dan staat er "datum onbekend" en wordt de melding nog 3 weken na publicatie getoond. Ingetrokken, geweigerde en ontwerp-publicaties worden overgeslagen; aanvraag + besluit van hetzelfde evenement worden één regel.
- **Hinder**: *hoog* = weg dicht voor auto's op een hoofdroute of met NDW-hinderklasse 2+, of een op-/afrit dicht, of een verkeersbesluit met afsluitingen. *middel* = weg dicht in een woonstraat of rijstrookbeperking. *laag* = snelheidsbeperking of fiets-/voetpad. Fiets-/voetpaden staan standaard uit (knop **Incl. fiets-/voetpaden**).
- NDW kent aparte uitvoeringsvensters (bijv. alleen 's nachts). "NU" en **Nu actief** kijken naar die vensters, niet naar de hele projectduur.
- Contactpersonen uit de NDW-opmerkingen worden bewust niet overgenomen.
- Kleine evenementen zonder vergunning staan niet in het Gemeenteblad.
- Lokaal testen: `python3 tests/test_gemeenteblad.py && python3 tests/test_ndw.py`, dan `python3 scripts/ophalen.py` en daarna `python3 -m http.server -d site` openen op http://localhost:8000.
- De eerste runs lezen 250 publicaties per run; tot die klaar zijn kan bij sommige evenementen "datum onbekend" staan. Het Gemeenteblad wordt per gemeente elke 6 uur bevraagd, NDW elke run.
- Gemeente-indeling NDW: op de bron ("Gemeente Arnhem"), anders dichtstbijzijnde gemeentecentrum (max. 15 km). Bij RWS-wegen op een gemeentegrens kan een melding bij de buurgemeente staan.
