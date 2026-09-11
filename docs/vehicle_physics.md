# Køyretøysfysikk — Årølia Rally 3D

Fysikkmotoren ([`js/engine/physics.js`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/js/engine/physics.js)) og dens spegla testmotor ([`tools/simulate_headless.py`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/tools/simulate_headless.py)) er spesialbygde for responsiv og truverdig rallykøyring på ujamt terreng.

---

## 1. Køyretøysspesifikasjonar
- **Masse:** $1150 \text{ kg}$ (typisk WRC Rally1/R5 bil)
- **Akselavstand (Wheelbase):** $2.50 \text{ m}$
- **Sporvidde (Width):** $1.80 \text{ m}$
- **Lengde:** $4.20 \text{ m}$
- **Maks styrevinkel:** $35^\circ$ ($0.61 \text{ rad}$)
- **Fysisk toppfart:** $84.0 \text{ m/s}$ (~$302 \text{ km/h}$ udempa, kalibrert til ~$185 \text{ km/h}$ i HUD)
- **Tyngdeakselerasjon:** $g = 9.81 \text{ m/s}^2$

---

## 2. 4-Hjuls Bakkekontakt og Terrenghelling (Pitch & Roll)
I staden for berre å måle eitt punkt under bilens sentrum, målar fysikkmotoren 4 kontaktpunkt under kvart dekk:
- Halv akselavstand: $L_w = 1.365 \text{ m}$
- Halv sporvidde: $W_w = 0.98 \text{ m}$

Dei fire hjulhøgdene henta frå terrenget:
- Fram-venstre ($h_{FL}$), Fram-høgre ($h_{FR}$)
- Bak-venstre ($h_{RL}$), Bak-høgre ($h_{RR}$)

### Vinkelberekning:
- **Pitch (helning i køyretøysretninga):**
  $$\text{targetPitch} = \text{atan2}(h_{\text{front}} - h_{\text{rear}}, 2 L_w)$$
- **Roll (sidehelning):**
  $$\text{targetRoll} = \text{atan2}(h_{\text{right}} - h_{\text{left}}, 2 W_w)$$

Ved bakkekontakt vert pitch og roll glatta inn med ein responsiv integrasjonsrate (`dt * 20.0`). Dette gjer at bilen legg seg naturleg i bakkar og motbakkar utan at hjula svevar i lause lufta.

---

## 3. Styresystem: Tastatur og Mus-Draing (Analog Kontroll)

Fysikkmotoren støttar både digital tastaturstyring og kontinuerleg analog styring via venstreklikk og draing med musa:

### A. Klikk & Dra med Mus (Analog Presisjonsstyring)
- **Mekanisme:** Hald nede venstre museknapp kor som helst på skjermen og dra horisontalt mot venstre eller høgre.
- **Skalering:** Draing på $\pm 130\text{ pikslar}$ svarar til fullt $100\ \%$ styreutslag. Ei lita justering på $15–30\text{ px}$ gjev superpresise småjusteringar i høg fart ($10–20\ \%$ utslag).
- **Ikkje-lineær responskurve:** Små utslag nær klikkpunktet har ein roleg respons for presis sporing i køyrefeltet, medan kraftig draing slår raskt ut i hårnåler.
- **Visuell HUD-indikator:** Når du dreg med musa, visest eit diskret neon-sikte med drag-linje, peikar og sanntids svinggrad i prosent (`◀ 45% VENSTRE` / `HØGRE 60% ▶`).
- **Slepp for re-sentrering:** Når museknappen sleppast, rettar hjula seg automatisk og mjukt opp att.

### B. Smart Tastaturfilter & Target-Approaching Rate Limiter
1. **Target-approaching integrator:**
   Både tastatur ($[-1, 0, 1]$) og mus-drag (vilkårleg flyttal i $[-1.0, 1.0]$) går gjennom ein felles mål-integrator:
   - **Pådrag:** Rask og jamn overgang mot målvinkelen (`rate = 6.5`).
   - **Re-sentrering:** Kjapp re-oppretting mot midten når input opphøyrer (`decayRate = 8.0`).
   - **Kjapp kontrasving:** Ved kontrasladd (motsatt forteikn) reagerer styringa momentant med `rate = 12.0`.
2. **Fartsavhengig dynamisk svinglås (Speed-Sensitive Taper):**
   $$\text{speedScale} = \frac{1}{1 + (\text{speed}_{\text{kmh}} / 50.0) \cdot 0.95}$$
   I låg fart ($20 \text{ km/h}$) har bilen fullt $35^\circ$ utslag for rundkøyringar; i høg fart ($120+ \text{ km/h}$) vert maksimalt utslag redusert til $8^\circ–12^\circ$.
3. **Høgfarts gyro-stabilisering (Anti-wobble yaw damper):**
   På rettstrekk dempast `yawRate` automatisk for å fjerne fiskehale-svingingar. Når brekket aktiverast vert demparen frikopla for fri sladd.

---

## 4. Drivlinje, Gir og Akselerasjonskurve
Girkassa har 5 framovergir og 1 reversgir:
- **1. gir:** $0 – 24 \text{ m/s}$ ($0 – 53 \text{ km/h}$ visuelt)
- **2. gir:** $24 – 44 \text{ m/s}$ ($53 – 97 \text{ km/h}$)
- **3. gir:** $44 – 62 \text{ m/s}$ ($97 – 136 \text{ km/h}$)
- **4. gir:** $62 – 76 \text{ m/s}$ ($136 – 167 \text{ km/h}$)
- **5. gir:** $76 – 90 \text{ m/s}$ ($167 – 185+ \text{ km/h}$)

### Drivkrefter & Taper i Høg Fart:
- Grunnkraft: $\text{accelForce} = \text{throttle} \times 22.0 \times \text{gearRatio} \times \text{highSpeedTaper}$
- **Progressiv avtaging (High-Speed Taper):**
  Over $45 \text{ m/s}$ (~$100 \text{ km/h}$) byrjar akselerasjonen å avta gradvis:
  $$\text{progress} = \frac{v - 45}{84 - 45}, \quad \text{highSpeedTaper} = 1.0 - 0.45 \cdot (\text{progress})^{1.25}$$
- **Aerodynamisk luftmotstand:**
  $$F_{\text{drag}} = 0.0003 \cdot v^2$$
- **Rullemotstand:**
  $$F_{\text{rolling}} = 0.5 + 0.015 \cdot |v|$$
- **Hellingmotstand (bakkar):**
  $$F_{\text{slope}} = \sin(\text{pitch}) \cdot g$$

Dette gjer at bilen akselerer kraftfullt og snertent opp til 120 km/h, medan det å klatre frå 150 km/h opp til 185 km/h krev jamt pådrag på eit langt rettstrekk.

---

## 5. Brekk, Sladd og Hopp
- **Brekksladd (Space):**
  Reduserer sidevegs dekkfeste (`gripFactor` fell frå 30.0 til 6.0) og legg til ein kontrollerbar overstyrings-rotasjon (`oversteer`), noko som set i gang breie, kontrollerbare rallysladdar.
- **Hopp over Bakketoppar:**
  Viss terrenget fell brått meir enn $0.4 \text{ m}$ under hjula i høg fart ($v > 16 \text{ m/s}$), mistar bilen bakkekontakt (`isGrounded = false`). Bilen flyg i ballistisk boge styrt av tyngdekrafta og landar mjukt med demparrespons.
- **Kollisjonar:**
  Bygningar vert sjekka mot bilens omkrins. Ved kollisjon sprett bilen elastisk tilbake og det sprutar gnistpartiklar.

---

## 6. Overflatedeteksjon og Off-Road Bremsing

For å sikre at rallysjåføren må halde seg på vegen for å oppretthalde farta, har spelet kontinuerleg overflatedeteksjon:

1. **Romleg 2D vegsegment-indeks (`checkOnRoad`):**
   - Kvart vegsegment frå OpenStreetMap (`arolia_roads.json`) har ei definert vegbreidde ($w$, typisk $7.5\text{ m}$ for hovudvegar, $5.0\text{ m}$ for bustadvegar) pluss ein tilgjevande skuldermargin på $1.8\text{ m}$.
   - Dette gjer at vanlege kurvekutt og små skrens ikkje brått utløyser full terrengstraff.
   - Bilens posisjon $(x, z)$ vert projisert ortogonalt inn på næraste vegsegment med bounding-box-førehandssortering.
2. **Progressiv overflateovergang (`offRoadRatio`):**
   - Når bilen køyrer av vegen, aukar `offRoadRatio` mjukt frå $0.0$ (asfalt) til $1.0$ (gras/terreng) med filterrate `dt * 4.0`. Korte hjulavstikkarar gjev berre eit lite, beherska motstandstillegg før bilen er attende på vegen.
3. **Fysiske konsekvensar i gras/terreng:**
   - **Grasrullemotstand (Off-road drag):**
     $$F_{\text{offroadDrag}} = \text{offRoadRatio} \times 4.5\text{ m/s}^2$$
     Bilen bremsar merkbart opp gjennom reell fysisk motstandskraft (tilsvarande ~0.45G), utan å stanse som mot ein vegg.
   - **Mjuk struping av motoreffekt:**
     Når $\text{offRoadRatio} > 0.2$ og farten overstig $20.0\text{ m/s}$ (~$44\text{ km/h}$ reelt, ~$90\text{ km/h}$ HUD), vert motoren gradvis strupa, men beheld alltid minst 25 % kraft slik at sjåføren lett kan klatre ut av grøfter og skråningar.
   - **Naturleg toppfartsavgrensing:**
     Toppfart i terrenget vert naturleg avgrensa av balansen mellom motorkraft og summen av rullemotstand, grasdrag og luftmotstand (balanserer rundt ~28 m/s eller ~62 km/h HUD).
   - **Sleipare underlag:**
     Sidegrepet vert redusert frå $30.0$ til $22.0$. Bilen kjennest lett og laus på graset, men beheld god styreevne til å svinge inn på asfalten att.

---

## 8. Bygningskollisjon (Polygon-basert)

Bygningskollisjonen i [`physics.js`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/js/engine/physics.js) nyttar eit 3-stegs deteksjonssystem:

1. **Filtrering (`prepareBuildings`):**
   - Bygningar med polygon-areal under $4\text{ m}^2$ (berekna med shoelace-formelen) vert filtrerte ut for å eliminere fantomkollisjonar frå bittesmå skur, murar og tekniske polygonrestar.
   - AABB-padding er redusert til $0.3\text{ m}$ (tidlegare $0.8\text{ m}$) for tettare tilpassing til det faktiske fotavtrykket.
   - `baseY` vert sett til minimum $1.5\text{ m}$ over terrenget i bygningens senterpunkt, slik at låge strukturar (garasjar, kjellarar) ikkje fangar bilen ved bakkenivå.

2. **Rask AABB Early-Reject:**
   Berre bygningar der bilens $(x, z)$ ligg innanfor den (reduserte) AABB-boksen og bilens $y$ er mellom $\text{baseY} - 0.5$ og $\text{topY}$ vert sendt vidare til polygon-testen.

3. **Punkt-i-polygon Ray-Casting Test (`pointInPolygon`):**
   Ein klassisk ray-casting-algoritme i XZ-planet tel kor mange gongar ein horisontal stråle frå $(x, z)$ kryssar polygonkantane. Berre odde kryssingstal = inne i bygningen. Dette eliminerer alle falske treff frå L-forma, trekantar og andre uregulære bygningsformer som AABB-en overrapporterer.

4. **Elastisk Sprettrespons:**
   Ved detektert kollisjon vert bilen dytta $1.5\text{ m}$ vekk frå AABB-senteret, farten vert reversert med $30\%$ effekt ($v \times -0.3$) og yaw-rate vert dempa ($\times -0.5$). Ein visuell kollisjonsgneist vert plassert for HUD-tilbakemelding.
