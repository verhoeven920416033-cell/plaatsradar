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
- **Werkwijze optimiser:** 's ochtends de export *opdrachten* (nog zonder rit) inlezen: tab **Opdrachten** toont per transportcode plaats, straat, huisnummer, postcode en de hinder (volgorde zonder ritten: hinder, dan postcode; met ritten: per rit met een kopregel, dan hinder en postcode). 's Avonds de export met de **werkelijke geplande route**: zelfde overzicht, nu per rit. Opdrachten zonder rit staan onder *Zonder rit*. Grafieken staan standaard uit (knop *Grafieken*).
- **Geplande route of stamroute:** heeft de export beide kolommen, dan gebruikt Planning (en de Routecheck) de **geplande route**: dat is wat er die dag rijdt. Wisselen kan bij *Rit uit*. Herkende namen: *Geplande route/rit*, *GRit*, *SRit*, *Stamroute*, *Rit*, *Route*, *Tour*. Worden de kolommen niet herkend, dan verschijnt een keuzescherm waarin je zelf aanwijst welke kolom de rit, postcode, plaats, straat, datum en klantcode is (*Kolommen aanpassen* opent het later ook).
- **Optimiser-export kan ook:** sleep de export uit de optimiser erin in plaats van het geogroepen-Excel. Dan worden de ritten de "diensten" (knoppen *Rit …*), met de postcodegebieden van hun stops op de datum uit *Vroegste laden*. De rijdag springt naar die datum. Alleen rit, klantcode, adres en datum worden gelezen. *Ritten overslaan* staat standaard op 442 en 443.
- **Klantcodes (optimiser):** tab *Klantcodes* koppelt de meldingen aan de adressen uit de export. *Straat* = de melding noemt de straat van de stop; met *Ook zelfde postcodegebied* zie je ook klanten in hetzelfde gebied. De klantcode komt standaard uit kolom E (*Laad-losplaats kenmerk*); een andere kolom kies je in de lijst. Ook in het zoekveld en de Excel (blad *Klantcodes*). Volgorde: eerst hinder, dan postcode. Filteren op postcode: klik op een postcodeknop (getal = aantal klantcodes) of typ het begin van een postcode (56, 5611, 5611AB). Klik op een kolomkop om anders te sorteren; het getal *klantcodes met hinder* bovenaan opent deze tab.
- **Dashboard:** bovenaan klikbare kerncijfers (hoge hinder, meldingen, klantcodes, plaatsen, gebieden) en drie overzichten: verdeling hoog/middel/laag, drukste postcodegebieden en hinder per dienst of rit. Klik op een balk om daarop te filteren; nog een klik zet het filter weer uit.
- **Filters, tabel en kaart:** zoekveld voor postcode, straat, plaats, dienst of melding (komma = of), dienstknoppen met aantal gebieden (eerste klik kiest alleen die dienst, *Alle* zet alles terug), hinder (standaard hoog + middel), soort, rijdag met één klik (vandaag t/m over 3 dagen) en *Filters wissen*. Tab *Tabel* sorteert op elke kolom. Tab *Kaart* toont de postcodegebieden die op de rijdag gereden worden (blauw) met de hinder erin; klik op een gebied voor de diensten van die dag.

## Om de hoek, nieuw, tijdvak, verwerkt, week
- **Om de hoek (≤ 250 m):** de pagina zoekt de plek van elke stop op via de 6-cijferige postcode (openbare PDOK-lijst, zit in de pagina) en meet de afstand tot de melding. Zo vind je ook een afsluiting op de toegangsweg of het kruispunt ernaast. Er wordt niets verstuurd. Werkt alleen als de stop een volledige postcode heeft. De postcodelijst wordt in de eerste runs na deze update stap voor stap opgebouwd.
- **Nieuw:** label *nieuw* bij meldingen die in de laatste 24 uur voor het eerst in de feed stonden. Knop *Alleen nieuw* en kerncijfer *nieuw sinds gisteren*.
- **Tijdvak:** *06–19 uur*, *07–17 uur* of eigen tijden: alleen hinder die (deels) in dat tijdvak valt. Nachtwerk valt dan weg.
- **Verwerkt (✓):** vink een melding af als hij geregeld is. Alleen bewaard in deze browser op deze pc (45 dagen); niets gaat naar buiten. *Verberg verwerkt* haalt ze uit beeld.
- **Week (Planning):** 7 dagen vanaf de rijdag, per dienst of rit het aantal hoge en middel meldingen. Klik op een vak om die dag en dienst te openen.

## Elk half uur verversen (externe timer)
GitHub voert geplande taken vaak uren te laat uit. Een gratis timer (bijv. cron-job.org) kan de update elk half uur starten:
1. GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*. Alleen deze repo, permissie **Actions: Read and write**. Vervaldatum 1 jaar.
2. cron-job.org → nieuwe cronjob, elke 30 minuten, methode **POST**, URL `https://api.github.com/repos/<eigenaar>/plaatsradar/actions/workflows/bijwerken.yml/dispatches`.
3. Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`. Body: `{"ref":"main"}`.
4. Test: in tab Actions verschijnt een run met *workflow_dispatch*.
De token kan alleen workflows starten in deze repo. Lekt hij, trek hem in bij GitHub.

## Bediening (alle pagina's)
- Navigatiebalk bovenaan: Overzicht · Planning · Routecheck, plus **? Hulp** met uitleg per pagina en *Wat is nieuw*.
- Sneltoetsen: `/` naar het zoekveld, `?` hulp, `Esc` sluiten of zoekveld leegmaken.
- Filters en gekozen tab worden onthouden in de browser (nooit route-, klant- of planningsgegevens). *Filters wissen* zet alles terug.
- Gaat er iets mis in de pagina, dan verschijnt bovenaan een rode balk met de fout in plaats van een pagina die stil niets doet.
- Startpagina, onderaan: **Status van de bronnen** (hoe vers, NDW, Gemeenteblad per gemeente, postcodes, postcodeplekken).

## Projectopbouw (voor wie het onderhoudt)
| Pad | Wat |
|---|---|
| `scripts/ophalen.py` | Haalt NDW, Gemeenteblad, markten, postcodevlakken, gemeentegrenzen en postcodeplekken op → `site/data.json`, `kaart.json`, `pc6.json`, `woonplaatsen.json`. Cache in `.cache/`. |
| `scripts/offline.py` | Bouwt de werk-pc-bestanden (`*-offline.html`): alles in één bestand, netwerk alleen naar de eigen site. |
| `site/route-kern.js`, `site/plan-kern.js` | Rekenkern van Routecheck en Planning (lezen, vergelijken). Geen DOM, getest in Node. |
| `site/hulp.js` | Postcodeplek, afstand tot een melding, tijdvak, nieuw, verwerkt. |
| `site/kaart.js` | Kaart als SVG zonder kaartdienst. |
| `site/app.js` | Navigatie, hulp, sneltoetsen, foutbalk, voorkeuren, versie. |
| `tests/` | Rekenkern, parsers en een controle dat alle pagina-scripts geldig zijn en de werk-pc-bestanden alleen naar de eigen site verbinden. Draait bij elke update; faalt een test, dan gaat er niets live. |

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

## Aankomsttijd, tijdvenster en "geen last" (Werkelijke planning)
- Hinder telt voor de hele rijdag, niet per aankomsttijd: routes worden bij bijzonderheden anders gereden.
- **⏰ Tijdvenster** per rit: aankomst buiten *Van Tijd*–*Tot Tijd*, of buiten de eigen lijst **Openingstijden** (`N31560 ma-vr 08:00-17:00; za 09:00-12:00; zo dicht`). Die lijst staat alleen in de browser van de planner (localStorage), nooit in de repo; delen via *Bewaar als bestand* / *Laden*.
- **🚫 geen last**: melding niet meer tonen (120 dagen, alleen in die browser). Een weekmarkt geldt voor alle weken op die plek.
- **🌐 Google-tijden**: hulppagina `site/openingstijden.html` (eigen venster, CSP alleen `places.googleapis.com`) zoekt per transportcode naam + adres op via Places API (New) Text Search en stuurt alleen de uitkomst terug (postMessage). De planningpagina zelf blijft zonder netwerk. Sleutel en uitkomsten staan alleen in de browser van de planner (60 dagen). Kosten: Text Search Enterprise, 1000 gratis per maand; zet een daglimiet op de sleutel.
- **🔎 controleer**: opent Google Maps met naam + adres van die stop.
- **📋 Geen hinder gemeld**: transportcodes plakken → per code + melding uitvinken (alleen in die browser, 120 dagen); terugzetten via *Eerder uitgevinkt*.
