# AGENTS.md — Årølia Rally 3D

Velkomen til **Årølia Rally 3D**! Denne fila er hovudinstruksen og kunnskapsbasen for alle AI-agentar som jobbar på dette prosjektet.

---

## 1. Toppnivå-beskriving av Prosjektet

**Årølia Rally 3D** er eit nettlesarbasert 3D rallyspel i retro wireframe-stil ("stick-man-stil") som køyrer på ekte kart- og høgdedata henta frå **Årølia i Molde** (WGS84 `62.7548°N, 7.2802°E`), basert på eit opphavleg kartutsnitt levert av brukaren.

### Kjernekarakteristika:
1. **Null eksterne køyretidsavhengigheiter (Zero dependencies):**
   Spelet nyttar korkje Three.js, WebGL eller andre rammeverk. All 3D-matematikk (vektorar, matriser, projeksjon, linjeklipping) og teikning er bygd frå botnen i rein Vanilla JavaScript og HTML5 Canvas.
2. **Ekte Geodata & Høgdemodell:**
   - **Terreng:** Ekte 1-meters laserdata frå **Kartverkets DTM1 Nasjonal Høgdemodell** (frå 0 til 193 moh.).
   - **Vegar & Bygningar:** Vektordata frå **OpenStreetMap (OSM)**, kalibrert med sub-piksel presisjon mot brukarens originalbilete (RMS-feil 0.86 px).
3. **Avansert Rallyfysikk:**
   - 4-hjuls kontaktpatch med helningskalkyle (pitch og roll).
   - Smart progressiv tastaturstyring med anti-wobble gyro-stabilisering.
   - Brekksladd, luftferder/hopp over bakketoppar og elastiske bygningskollisjonar.
   - Progressiv akselerasjonskurve med aerodynamisk drag i høgfartsområdet.
4. **WRC TV-Helikopterkamera (`heli_chase`):**
   Standard kamera som følgjer bilen skrått bakfra og høgt oppe med simulert kinematisk demping.
5. **Autonom Verifikasjonssyklus:**
   Eit komplett test-økosystem (`python tools/run_all_tests.py`) med pytest, Node.js matrisetestar, headless spelsimulering og 3D-sceneprojisering.

---

## 2. KRONOLOGISK HISTORIKK OG TIDLEGARE INSTRUKSJONAR

Kvar iterasjon i prosjektet er basert på eksplisitte instruksjonar frå brukaren:

1. **Startinstruks:**
   - *Brukar:* "Basert på dette bildet, lag ein veldig enkel 3D linjegrafikk modell av området... eit veldig enkelt rally spel der ein kan køyre rundt i kartutsnittet her... i ein nettlesar... jobbe sjølvstendig lenge og vel... lage testar som viser at ting virkar og passar med kartutsnittet... wireframe enkel rendering... stick-man-stil... lag ein loop."
   - *Løysing:* Etablerte prosjektet, lasta ned OSM og Kartverket DTM1, implementerte 3D wireframe-motor frå botnen, bygde bilfysikk, GPS-minikart, Web Audio motorlyd og den autonome testsløyfa.
2. **Styring invertert:**
   - *Brukar:* "Something strange with the steering. If I press right arrow or d, car in 3D turns left, but car-arrow on map turns right.."
   - *Løysing:* Retta køyretøyets rotasjonsteikn slik at høgre alltid er høgre i både 3D-verda og på minikartet.
3. **Vegar forsvinn (Clipping):**
   - *Brukar:* "One thing I would like to fix, is that the road sometimes disappears. First image shows a small road with blue lines. Next image, I drive a little bit forward, and the road lines disappear..."
   - *Løysing:* Implementerte analytisk near-plane line clipping i 3D-motoren for å hindre at linjer bak kameraets klippeplan forsvinn eller forvrengast.
4. **Einsarta vegfarge og samanhengande vegar:**
   - *Brukar:* "Ønsker at veiane skal ha samme farge (grønne som store vegane no er kan du fint bruke) også dei små vegane som no er blå. Også: no er veimarkeringa litt diskontinuerlig. Får du til å segmentere dei ut bedre og gjere dei samanhengande?"
   - *Løysing:* Foreina alle vegar til lysande neon cyan (`#00ffcc`), og implementerte ein miter-normal ribbon-algoritme som genererer 100 % uavbrotne vegkantar og lukkede rundkøyringar.
5. **Terrengfølging i bakkar:**
   - *Brukar:* "Can you make the car follow the terrain better? Right now it seems to be horizontal regardless of whether it goes up or down a steep slope... Front wheels HIGH above the ground..."
   - *Løysing:* Retta pitch-rotasjonsmatrisen og implementerte 4-hjuls kontaktpatch under hjula ($L_w=1.365\text{m}$, $W_w=0.98\text{m}$) slik at alle fire hjul til kvar tid følgjer bakkehelninga.
6. **Mindre rykkete styring på tastatur:**
   - *Brukar:* "The steering feels a bit twitchy. Can you make the steering a bit less sensitive. Try to find a smart mechanism for the steering assuming keyboard controls"
   - *Løysing:* Utvikla eit 4-stegs smart tastaturfilter: dual-rate attack/return, ikkje-lineær $x^{1.35}$ soft-center kurve, fartsavhengig utslagslås og høgfarts gyro-stabilisering.
7. **Helikopterkamera:**
   - *Brukar:* "Kan du legge til eit nytt helikopterkamera som følger litt lazy bilen høyt oppe men skrått bakfra?"
   - *Løysing:* La til `heli_chase`-modus med kinematisk demping (`dt * 2.2` posisjon, `dt * 3.5` siktepunkt) 22–30m bak, 10–14m til sides og 18–24m over bakken.
8. **Standardkamera og fartsjustering:**
   - *Brukar:* "set the new camera mode as default. Then try to fix speed measurement. From dimensions of car and map, it seems that the car is moving too slow compared to the displayed speed."
   - *Løysing:* Sett `heli_chase` som standard startkamera. Kalibrerte speedometeret mot kartets pikselmålestokk (faktor 2.2).
9. **Dobling av toppfart:**
   - *Brukar:* "Max speed needs to be the double of what it is"
   - *Løysing:* Dobla bilens fysiske maksfart frå `42.0 m/s` til `84.0 m/s`, oppskalerte alle 5 girband og dobla bremsekrafta.
10. **Speedometer-mismatch og progressiv akselerasjon:**
    - *Brukar:* "Now there seems to be a bit mismatch again between what the speedometer shows and how the car moves. Also: The actual max speed now is ok (game mechanically wise), but it needs to be a bit slower acelleration to reach the very upper part of the speed."
    - *Løysing:* Sikra at speedometeret nyttar kalibreringsfaktoren 2.2 (toppfart ~185 km/h visuelt), og la inn ein progressiv high-speed taper over 45 m/s og aerodynamisk luftmotstand ($0.0003 \cdot v^2$) slik at klatringa frå 150 til 185 km/h krev eit langt rettstrekk.
11. **Off-road brems og overflatedeteksjon:**
    - *Brukar:* "Kan du legge til at bilen bremsar kvar gang ein er utanfor vegen? Slik at ein må halde vegen for å greie holde farta."
    - *Løysing:* Implementerte 2D romleg vegsegment-indeksering mot OpenStreetMap-vegane (`checkOnRoad`), progressiv grasrulle-motstand (+14 m/s² motstand), avkapping av motoreffekt over 12 m/s utanfor veg, redusert sidegrep i gras, visuell HUD-varsling (`⚠️ UTANFOR VEGEN`), og justerte dei 11 rally-sjekkpunkta nøyaktig langs Årølivegens asfaltkorridor.
12. **Mindre brutal off-road brems:**
    - *Brukar:* "It is slowing down too much outside road now."
    - *Løysing:* Fysikkjustering av off-road-modellen: reduserte grasdrag frå 14.0 til 4.5 m/s², fjerna den kunstige avkappinga av framoverhastigheit (`vFwd = min(effectiveMaxSpeed, vFwd)`) slik at nedbremsing skjer naturleg via krefter, auka vegskuldertoleransen frå 1.2m til 1.8m slik at vanlege kurvekutt ikkje brått utløyser grasstraff, senka innrullingsfarten for `offRoadRatio` til `dt * 4.0`, og tillèt motoren å halde opptil 20–25 m/s (~60–75 km/h HUD) i graset med minst 25 % motorkraft i reserve.
13. **Mus-Draing Styring og Justert Helikopterkamera:**
    - *Brukar:* "I am also considering a steering mechanism that steers by left clicking and dragging the mouse. I think that will give more control. Also the camera following the car in the helicpotermode above and behind needs to be straight behind car, a little bit closer to the car and a little more above the care (not directly above)"
    - *Løysing:* Implementerte kontinuerleg analog styring ved å klikke og dra venstre museknapp (eller touch-dra på skjerm) med felles target-integrator, dynamisk drag-sikte og prosentvis HUD-vinkelindikator. Oppdaterte `heli_chase` (Heli Bakfra): fjerna sideforskyving for å plassere kameraet rett bak bilen, reduserte avstand frå 22–30m til 13.5–18m (nærare), og auka helningsvinkelen til ~47° (meir opphøgd over taket) med siktepunkt 8m framfor bilen for ideell køyresikt.
14. **Dynamisk 1km × 1km Kart- og Høgdegenerator (OpenStreetMap + DEM):**
    - *Brukar:* "Er det mogelig å nytte open street map og velge eit område på feks 1km x 1km og deretter også hente høgdedata og lage spillkartet on the fly? Ja, bevar original kartet som vi har no, og legg til dette som ein opsjon ein kan velge."
    - *Løysing:* Bygde `DynamicMapLoader` (`js/engine/dynamicMapLoader.js`) og etappeveljar-modal i HUD (`🗺️ VEL KART`). Årølia med Kartverket DTM1 laserhøgder vert bevart 100 % som standard. Spelaren kan bytte etappe til førehandspakka ikoniske baner (Trollstigen, Lysebotn, Monaco GP) eller skrive inn eit vilkårleg stadsnamn eller GPS-koordinatar. Motoren geokodar, hentar Overpass-vegar/bygningar med fleire spegelserverar, samlar høgdedata frå Open-Meteo, projiserer med ekvirektangulær 1km-modell, genererer uavbrotne vegbånd og rallysjekkpunkt, og oppdaterer bilfysikk og minikart on-the-fly utan omlasting.
15. **Tastatur- og mus-isolasjon i tekstfelt (Søking etter stader):**
    - *Brukar:* "Når eg skriv in stedsnavn for å velge fritt kart, so kan eg ikkje bruke w a s d fordi dei er låst til styringa av bilen..."
    - *Løysing:* Oppdaterte `setupInputs()` og `setupMouseSteering()` i `js/game/gameLoop.js` til å sjekke om hendinga kjem frå eit tekstfelt (`INPUT`, `TEXTAREA` eller `contenteditable`). Køyretastane (W, A, S, D, Space, R, C, T, M) og `preventDefault()` vert omgått slik at alle teikn kan skrivast uforstyrra i søkeboksen. `clearKeys()` nullstiller alle køyretastar ved modalopning og feltfokus, og musestyring vert blokkert ved klikk inne i modalen.
16. **Usynlege Kollisjonar Fiksa (Polygon-basert Kollisjonsdeteksjon):**
    - *Brukar:* "Sometimes the car crashes with something invisible in the terrain.. possbile to make som changes to avoid that?"
    - *Løysing:* Erstatta den reine AABB-kollisjonsdeteksjonen med eit 3-stegs system i `js/engine/physics.js`: (1) Filtrerer ut bygningar med areal under 4 m² (shoelace-formel), slik at bittesmå skur, murar og utstikk ikkje lagar fantomkollisjonar. (2) Reduserte AABB-padding frå 0.8m til 0.3m og set `baseY` til minimum 1.5m over terrenget, slik at låge bygningar ikkje fangar bilen ved bakkenivå. (3) La til ein ray-casting punkt-i-polygon-test (`pointInPolygon`) som køyrer etter AABB early-reject og høgdesjekk, slik at uregulære bygningsformer (L-form, trekantar osv.) ikkje utløyser kollisjon utanfor det faktiske fotavtrykket.
17. **Full Mobil- og Nettbrett-støtte (Multi-touch, 3 Styreformer, Responsivt HUD, Gyro og DPR-vern):**
    - *Brukar:* "We need to add support for playing it on a mobile phone and tablet. Think hard and add support for the most intuitive controllers and gui for that. Try to map out all sensible changes to make it run smooth and engaging on a phone"
    - *Løysing:* Implementerte ei komplett mobiloppleving: (1) **Tre intuitive styremodusar**: `🕹️ KNAPPAR` (ergonomiske ◀ ▶ retningsknappar), `🎯 STYREHJUL` (trinnlaus horisontal berøringsslider med dynamisk styrevinkel), og `🔄 GYRO` (fysisk vri/tilting av telefonen som eit ratt via `DeviceOrientationEvent` med nullstillingsknapp). (2) **Ergonomiske pedalar for høgre tommel**: Høgre tommelsone har høg vertikal GASS-pedal (▲), brei BREMS/REVERS-pedal (▼), og ein eigen neon-rosa DRIFT-knapp for brekksladdar i hårnåler. (3) **Multi-touch manager**: Full sporing av uavhengige berøringar (`Touch.identifier`) slik at spelaren kan gassa, drifta og styre samstundes utan at knappane blokkerer kvarandre. (4) **Responsivt Cyber-HUD**: Skjuler hjelpetekst og lange titlar på små skjermar, skalerer minikartet ned (120×68px), flyttar speedometer/gir opp slik at det aldri kolliderer med pedalane, og legg til ein `⛶ FULLSKJERM`-knapp. (5) **Orientering & Audio**: Viser rettleiingsbanner ved høgkant (portrait) og låser opp Web Audio på første berøring. (6) **DPR-skalering**: Avgrensar oppløysinga til `Math.min(devicePixelRatio, 1.75)` for silkemjuke 60 FPS og lågt batteriforbruk på høgoppløyste mobilskjermar.
18. **Mindre Sensitiv og Progressiv Klikk-og-Dra Musestyring:**
    - *Brukar:* "Gjer den klikk og drag styringa mykje mindre sensitiv, slik at ein må drage ganske langt for å styre mykje. Lag den gjerne progressiv, slik at den styrer lite i starten og meir når ein dreg langt."
    - *Løysing:* Auka `maxDrag` frå 130px til 300px i `js/game/gameLoop.js`, slik at spelaren må gjere eit mykje lengre drag for fullt svingutslag. La inn ein progressiv potenskurve $x^{1.55}$ (som saman med fysikkens $x^{1.35}$ gjev ei ideell kvadratisk responsiv kurve $\approx x^{2.09}$): rolege mikroskopiske justeringar rundt midten (0–100px) for superstabil rettstrekk-køyring, og progressivt auka utslag opp mot 300px for hårnåler og sladdar.
19. **Mobil Kontroller-tilpassing, Skjulte Toppknappar (`⚙️ MENY`), Multi-touch Samtidigheit og Edge CDP-emulering:**
    - *Brukar:* "Controllers are outside the screen in portrait, and partially outside in landscape. Too many buttons on top for differen choices. Need to be hidden. Click and drag does always work together with acelleration. Can you figure out a way for you to emulate mobile usage and check yourself that different aspects works and gui looks ok?"
    - *Løysing:*
      1. **Kontrollerar innanfor skjermgrenser**: Justerte responsive media queries for høgkant (portrait 390×844) og breitt (landscape 844×390). Sat `padding: 0 8px 8px 8px;`, avgrensa pedal- og styreknappbreidder (DRIFT 44px, BREMS 46px, GASS 52px, Steer 50px), flytta speedometer opp, og senka etappebanneret til `top: 50px` slik at absolutt ingen element fell utanfor skjermkanten (`overflowRight <= 0`).
      2. **Ryddig Cyber-Toppmeny (`⚙️ MENY`)**: Fjerna rotet av 6 lause knappar øvst på mobilskjermen. Samla `🗺️ VEL KART`, `🔄 RESET BIL`, `🎥 KAMERA`, `🔊 LYD`, `🎮 MODUS` og `⛶ FULLSKJERM` i ein lekker, samanleggbar cyber-menyskuff (`#quickMenuDrawer`) med ein enkel, elegant `⚙️ MENY`-knapp øvst til høgre ved sida av minikartet.
      3. **Multi-touch Samtidigheit (Dra-styring + Gass)**: Løyste problemet der gasspedal overstyrte eller avbraut mus/touch-dra-styring på lerretet. Knytte lerretsporinga til dedikert `mouseSteer.touchId` via `changedTouches`, slik at tommelen på gasspedalen og tommelen som dreg på lerretet opererer 100 % uavhengig.
      4. **Autonom Mobil-Emulering og Visuell Sjekk (`tools/test_mobile_gui.js`)**: Bygde eit autonomt inspeksjonsverktøy basert på Microsoft Edge og Chrome DevTools Protocol (CDP) WebSocket. Verktøyet emulerer eksakte mobilmål med `Emulation.setDeviceMetricsOverride`, validerer at ingen DOM-element har `right > innerWidth`, og tek presise skjermbilete (`mobile_portrait.png`, `mobile_landscape.png`, `mobile_menu.png`, `mobile_wheel.png`).
      5. **Automatisert Verifikasjon**: Utvida `tools/run_all_tests.py` med `tests/test_multitouch.js` som verifiserer fleirberøringstilstandar og isolasjon ved 100 % suksess.

---

## 3. MODULÆRE DOKUMENTASJONSFILER (DOKUMENTKART)

Prosjektet er dokumentert i detalj gjennom følgjande modular under [`docs/`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/):

1. **[`docs/architecture.md`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/architecture.md) — Systemarkitektur:**
   Fil- og mappestruktur, teknologistakk, dataflyt i hovudspilløkka og zero-dependency designfilosofi.
2. **[`docs/map_and_terrain.md`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/map_and_terrain.md) — Kart og Terreng:**
   Geografisk opphav, Kartverkets DTM1 høgdemodell, sub-piksel affin kalibrering mot biletet (RMS 0.86 px), og samanhengande vegbånd (road ribbons).
3. **[`docs/vehicle_physics.md`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/vehicle_physics.md) — Køyretøysfysikk:**
   4-hjuls bakkekontakt, overflatedeteksjon (asfalt vs gras/off-road), smart tastaturstyring, gir og drivlinje, aerodynamisk drag, brekksladd, hopp og kollisjonsrespons.
4. **[`docs/camera_and_rendering.md`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/camera_and_rendering.md) — Kamera og 3D Rendering:**
   3D linjerasteriser, analytisk near-plane line clipping, dei 4 kameramodusane (`heli_chase` som standard), dynamisk farts-FOV og neonfargepalett.
5. **[`docs/gameplay_and_audio.md`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/gameplay_and_audio.md) — Gameplay, HUD og Lyd:**
   Rallyetappen frå Årøhallen til Årølia skole (11 sjekkpunkt), tidtaking, HUD med off-road åtvaring, 2D minikart og Web Audio prosedyrisk lydmotor.
6. **[`docs/testing_and_verification.md`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/testing_and_verification.md) — Testing og Verifikasjon:**
   Den autonome verifikasjonssløyfa (`python tools/run_all_tests.py`), pytest (13 testar), Node.js matrisetestar, headless spelsimulering og biletbevis.

---

## 4. OBLIGATORISK PROTOKOLL FOR AGENTAR (KUNNSKAP OG DOKUMENTASJON)

> [!IMPORTANT]
> **OBLIGATORISK REGEL VED KVART EINASTE ARBEIDSSTEG:**
> 1. **Dokumenter all ny kunnskap:** Kvar gong du gjer endringar i kode, fysikk, parametrar, grafikk eller spelemekanikk, **SKAL** ny kunnskap, innsikt og endringar dokumenterast omgåande.
> 2. **Hald eksisterande `.md`-filer oppdaterte:** Sørg for at [AGENTS.md](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/AGENTS.md) og dei relevante fagdokuementa under [`docs/`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/docs/) til ei kvar tid speglar nøyaktig kva koden gjer. Ingen dokumentasjon skal etterlatast utdatert eller i strid med koden.
> 3. **Køyr verifikasjonssløyfa:** Etter kvar endring skal du alltid køyre `python tools/run_all_tests.py` og verifisere at alle testar er grøne (100 % pass).
> 4. **Commit til Git:** Gjennomfør reine, atomiske git-commits med informative meldinger.
