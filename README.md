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
Knop **Routecheck** op de site, of `routecheck.html`. Kies een of meer routelijsten (PDF met tekst, Excel .xlsx, CSV of tekst) en een periode. Je krijgt per route welke plaatsen hij aandoet en alleen de meldingen die de straat van een stop noemen. Algemene meldingen uit de plaats, omleidingen en fiets-/voetpaden worden niet getoond. Bij een Dynamics-routelijst worden alleen routenummer, datum en de kolom Adres gelezen.

- **Routelijsten blijven op je computer.** Ze worden in de browser gelezen, niet verstuurd en niet bewaard. Een Content-Security-Policy op de pagina blokkeert verkeer naar andere sites. Zet routelijsten **nooit** in deze publieke repo; `*.pdf`, `*.xlsx`, `*.xls` en `*.csv` staan in `.gitignore`.
- **Werk-pc:** download via de routecheck *versie voor werk-pc* (`Routecheck-werk.html`). Eén bestand, geen installatie: dubbelklikken opent het in de browser. Bij openen haalt het verse meldingen op als die site bereikbaar is, anders gebruikt het de ingebouwde meldingen van de downloaddag of kies je een `data.json`. Daarna gaat het netwerk van de pagina dicht, vóór je een routelijst kiest.
- **Optimiser-export (.xlsx):** wordt herkend aan de kolommen *SRit* en *Laad-losplaats straat/huisnr./postcode/plaats*. Alleen rit, adres en datum (*Vroegste laden*) worden gelezen; naam, waarde, kwalificaties en tijden niet. De periode springt naar de datum uit het bestand. Dubbele orders op hetzelfde adres tellen als één stop. **Ritten overslaan** staat standaard op 442 en 443.
- **Huddle-print:** één A4 (liggend) voor de Daily Huddle: per route alleen hoge en middel hinder bij de stops, met tijden op de dag en een lege kolom *Actie* om met de hand in te vullen, plus afvinkvakken om na de dienst in te leveren. Kies één dag als periode voor tijden per dag.
- **Filters:** zoekveld (route, plaats, straat, postcode of melding; komma = of), periode met één klik (vandaag, morgen, over 2 dagen, 7 dagen), hinder (hoog/middel/laag), soort (weg/werk, evenement, markt/kermis), alleen routes met problemen, alleen zeker, en routes aan/uit. Aantallen staan op de knoppen. Huddle-print en Kopieer volgen het filter.
- **Weergaven:** *Per route*, *Tabel* (sorteren door op een kolomkop te klikken) en *Kaart*: een overzicht van bovenaf met gemeentegrenzen, de plaatsen van je stops en de knelpunten (rood = hoog, oranje = middel). Klik op een punt voor details. De kaart werkt zonder internet: geen kaartdienst, dus er gaat ook niets naar buiten over welk gebied je bekijkt. Daardoor geen straten op de kaart.
- De vergelijking werkt op straatnaam: een afsluiting om de hoek of op de weg ernaartoe valt erbuiten. *Controleren* = zelfde straatnaam in dezelfde gemeente, maar plaats niet bevestigd.
- Een gescande PDF (afbeelding) kan niet gelezen worden.
- Vanuit Dynamics: printbestemming **Bestand**, bestandsindeling **PDF** of **Tekst (UTF-8)**, geen RTF of HTML.

## Planning vooruit (geogroepen)
Knop **Planning** op de site, of `planning.html`. Voor de planners: kies een rijdag (standaard over 2 dagen) en sleep het geogroepen-Excel erin (kolommen *Locatie groep, Omschrijving, Van, Tot, Maandag … Zondag* met Ja/Nee). Je ziet:
- **Hinder op de rijdag:** per plaats de meldingen die die dag actief zijn in postcodegebieden (4 cijfers) die dan gereden worden, met welke diensten er komen. Fiets-/voetpaden, markten en meldingen zonder datum tellen niet; lage hinder staat standaard uit.
- **Diensten samenvoegen:** postcodegebieden waar de gekozen diensten op verschillende dagen rijden, met de dagen waarop ze er al samen komen.
- **Filter** op postcodes en straten, gescheiden door komma's: `5611, 5612-5615, Vestdijk, Tilburg`. Een volledige postcode (5611 AB) telt als het gebied 5611. Een plaatsnaam toont alles in die plaats. Het filter geldt ook voor het samenvoeg-overzicht en de Excel.
- **Download Excel** met beide overzichten.

Meldingen krijgen hun postcodegebied uit de openbare CBS-postcodevlakken (PDOK, maandelijks ververst). Gemeenteblad-meldingen zonder coördinaten staan apart onder *Zonder exacte plek*. Het Excel blijft op je computer; voor de werk-pc is er `Planning-werk.html` (zelfde werkwijze als de routecheck).
- **Optimiser-export kan ook:** sleep de export uit de optimiser erin in plaats van het geogroepen-Excel. Dan worden de ritten de "diensten" (knoppen *Rit …*), met de postcodegebieden van hun stops op de datum uit *Vroegste laden*. De rijdag springt naar die datum. Alleen rit, klantcode, adres en datum worden gelezen. *Ritten overslaan* staat standaard op 442 en 443.
- **Klantcodes (optimiser):** tab *Klantcodes* koppelt de meldingen aan de adressen uit de export. *Straat* = de melding noemt de straat van de stop; met *Ook zelfde postcodegebied* zie je ook klanten in hetzelfde gebied. De klantcode komt standaard uit kolom E (*Laad-losplaats kenmerk*); een andere kolom kies je in de lijst. Ook in het zoekveld en de Excel (blad *Klantcodes*). Volgorde: eerst hinder, dan postcode. Filteren op postcode: klik op een postcodeknop (getal = aantal klantcodes) of typ het begin van een postcode (56, 5611, 5611AB). Klik op een kolomkop om anders te sorteren; het getal *klantcodes met hinder* bovenaan opent deze tab.
- **Filters, tabel en kaart:** zoekveld voor postcode, straat, plaats, dienst of melding (komma = of), dienstknoppen met aantal gebieden (eerste klik kiest alleen die dienst, *Alle* zet alles terug), hinder (standaard hoog + middel), soort, rijdag met één klik (vandaag t/m over 3 dagen) en *Filters wissen*. Tab *Tabel* sorteert op elke kolom. Tab *Kaart* toont de postcodegebieden die op de rijdag gereden worden (blauw) met de hinder erin; klik op een gebied voor de diensten van die dag.

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
