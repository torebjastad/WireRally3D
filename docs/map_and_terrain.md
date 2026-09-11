# Kart- og Terrengdata — Årølia Rally 3D

## 1. Geografisk Bakgrunn og Koordinatsystem
Spelet er bygd nøyaktig oppå det verkelege landskapet i **Årølia i Molde**:
- **Geografisk Origo (0, 0, 0):** Sentral rundkøyring i Årølia (kryss Årølivegen / Olav Oksviks veg)
  - Lengdegrad ($\lambda_0$): `7.2801607° E`
  - Breiddegrad ($\phi_0$): `62.7547996° N`
  - Høgde ($Y_0$): `62.21 moh.`
- **Lokalt 3D Koordinatsystem (i meter):**
  - $+X$ = Austover (mot Årølia skole)
  - $-X$ = Vestover (mot Årøhallen og Kringstadstien)
  - $+Z$ = Nordover (oppover dalsida/fjellet)
  - $-Z$ = Sørover (nedover mot Fannefjorden)
  - $+Y$ = Høgde over havet i meter

---

## 2. Terrengmodell (Kartverkets DTM1)
Terrenghøgdene er henta frå **Kartverket sin Nasjonale Høgdemodell (DTM1)**:
- Området dekker eit rektangel på **$2500 \text{ m} \times 1500 \text{ m}$**.
- Rutenett: $50 \times 50$ ruter med $30 \text{ meter}$ mellom kvart punkt (`data/arolia_terrain.json`).
- Høgdespenn: Frå $0 \text{ moh.}$ ved fjorden til $193 \text{ moh.}$ øvst i åssida mot nord.
- **Bilineær interpolering ([`terrain.js`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/js/engine/terrain.js)):**
  For ein vilkårleg posisjon $(x, z)$ vert høgda interpolert kontinuerleg mellom dei 4 næraste høgdepunkta.
  Terrengnormalen $\vec{n} = (n_x, 1, n_z)$ vert berekna med sentrert differanse over $1 \text{ meter}$ for bakkerefleksjon og køyretøysorientering.

---

## 3. Matematisk Kalibrering mot Brukarens Kartbilete
Brukaren leverte eit kartutsnitt (`1024 x 576` pikslar) med 4 tydelege rundkøyringar. For å sikre at det nedlasta 3D-vegnettet passa nøyaktig over kartbiletet:

1. **Datasyn & Krysskorrelasjon ([`tools/calibrate_affine.py`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/tools/calibrate_affine.py)):**
   - Vi lokaliserte dei eksakte piksel-sentera for dei 4 rundkøyringane i biletet:
     - **RB1 (Årøhallen):** `(66, 366)`
     - **RB2 (Kringstadstien):** `(198, 187)`
     - **RB3 (Mid Årølia):** `(508, 204)`
     - **RB4 (Årølia skole):** `(890, 197)`
2. **Affin Transformasjon ([`projection_meta.json`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/data/projection_meta.json)):**
   Løyste eit minste kvadraters problem ($Ax = b$) mellom dei lokale 3D-metermåla og pikselkoordinatane:
   $$\begin{pmatrix} u \\ v \end{pmatrix} = \begin{pmatrix} 0.663353 & -0.361538 \\ 0.081813 & -0.681947 \end{pmatrix} \begin{pmatrix} x \\ z \end{pmatrix} + \begin{pmatrix} 507.34 \\ 205.29 \end{pmatrix}$$
   - **Nøyaktigheit:** RMS-feilen er berre **0.86 pikslar** (sub-piksel presisjon!).
   - Dette gjer at minikartet i spelet har 100 % identisk orientering, plassering og proporsjonar som originalbiletet.

---

## 4. Vegnett og "Road Ribbons"
Vegane er henta frå **OpenStreetMap (OSM)** via Overpass API:
- Totalt **120+ veglinjer** (primærvegar, samlevegar, bustadgater og gangvegar).
- **Einsarta Farge:** Alle køyrevegar er teikna med same lysande neon cyanfarge (`#00ffcc`).
- **Samanhengande Vegbånd (Miter-Normal Algoritme):**
  Tidlegare laga vegsegmenta hol og brot i svingar fordi kvar linje vart teikna uavhengig.
  I [`wireframeRenderer.js`](file:///c:/Users/toreb/OneDrive/Code/ÅrøliaRally/js/engine/wireframeRenderer.js) er det implementert ein ribbon-ekstruderingsalgoritme:
  - Berekner hjørne-bisektrise (miter normal) i kvart vegpuktt:
    $$\vec{m} = \frac{\vec{n}_1 + \vec{n}_2}{1 + \vec{n}_1 \cdot \vec{n}_2}$$
  - Forgreinar venstre og høgre vegkant med halv vegbreidde ($w/2$).
  - Rundkøyringar er eksplisitt lukka slik at første og siste punkt fletter saman i ein ubroten sirkel.
  - Vegane projiserast med eit lite høgdeløft ($+0.12 \text{ m}$) over terrenget for å unngå Z-fighting mot bakken.

---

## 5. Bygningar og Kulisser
- **Bygningar (`data/arolia_buildings.json`):**
  Bygningsomriss frå OSM ekstruderast som 3D wireframe-prismar med ekte høgder (4 til 12 meter høge einebustader, skule og hallar).
  - Bygningane har AABB (Axis-Aligned Bounding Boxes) i 2D for rask kollisjonssjekk mot bilen.
- **Kulisser (`data/scenery.json`):**
  Fjordlinja i sør og karakteristiske tre langs vegen er teikna som enkle wireframe-element.
