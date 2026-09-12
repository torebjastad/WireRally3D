# Årølia Rally 3D (WireRally3D) 🏎️💨

> **Retro 3D wireframe motorsport simulator running in pure Vanilla JavaScript and HTML5 Canvas on real-world LiDAR and map data from Årølia in Molde, Norway.**

---

## 🌟 Kjernefunksjonar (Key Features)

1. **Null eksterne bibliotek (Zero Runtime Dependencies):**
   - Korkje Three.js, WebGL eller fysikkmotorar er nytta.
   - All 3D-vektormatematikk, matriser (`Matrix4`, `Vector3`), projeksjon, analytisk near-plane linjeklipping og wireframe-rendering er bygd frå botnen i rein Vanilla JavaScript og 2D Canvas.
2. **Ekte Geodata & Høgdemodell:**
   - **Terreng:** Ekte 1-meters laserdata frå **Kartverkets DTM1 Nasjonal Høgdemodell** (spenn frå 0 til 193 moh. frå fjorden opp i fjellsida).
   - **Vegar & Bygningar:** Vektordata frå **OpenStreetMap (OSM)**, affint kalibrert med sub-piksel presisjon mot flyfoto/kartutsnitt (**RMS-feil 0.86 px**).
   - **Samanhengande vegbånd (Road ribbons):** Miter-normal polylinje-algoritme som teiknar 100 % kontinuerlege vegkantar og lukkede rundkøyringar i neon cyan (`#00ffcc`).
3. **Avansert Rally-fysikk:**
   - **4-hjuls bakkekontakt:** Samplepunkt under kvart hjul for presis bakkefølging i bratte mot- og unnabakkar (pitch og roll).
   - **Overflatedeteksjon:** Romleg 2D vegsegment-indeksering. Rullar du ut i graset/terrenget trer progressiv grasrullemotstand og motortaper i kraft (`⚠️ UTANFOR VEGEN`).
   - **Analog musestyring & Smart tastaturfilter:** Kontinuerleg styring ved å klikke og dra musa, med dynamisk HUD-sikte og gyro-stabilisering i høgfart.
   - **Rallydynamikk:** Brekksladd (Space), ballistiske luftferder/hopp over bakketoppar, aerodynamisk drag og elastiske bygningskollisjonar med gnistar.
4. **WRC TV-Helikopterkamera (`Heli Bakfra` som standard):**
   - Opphøgd oversiktshelikopter rett bak bilen (~47° innsynsvinkel) med simulert kinematisk tregleik og framtidsretta siktepunkt langs køyrelinja.
   - 4 kameravinklar: **Heli Bakfra** (Standard) ➔ **Chase** ➔ **Panser** ➔ **Heli Topp**.
5. **Prosedyrisk Web Audio Motorlyd:**
   - Sanntids syntese av motorbrøl (sawtooth/triangle oscillatorar) og dekkskrik (resonans-støyfilter ved drift) via Web Audio API.
6. **Dynamisk 1km × 1km Kartgenerator (OpenStreetMap + DEM):**
   - Klikk **🗺️ VEL KART** for å bytte etappe on-the-fly!
   - Årølia er 100 % bevart som standard originalkart.
   - Køyr førehandspakka etappar: **Trollstigen (Fv63)**, **Lysebotn (Fv500)** og **Monaco GP Circuit**.
   - Søk opp eit **vilkårleg stadsnamn eller GPS-koordinatar** i heile verda for å hente vegar og høgder on-the-fly i 1000m × 1000m utsnitt.
7. **Full Mobil- og Nettbrett-støtte (Multi-Touch & Gyro):**
   - **3 Styremodusar:** `🕹️ KNAPPAR` (store retningspiler), `🎯 STYREHJUL` (trinnlaus analog berøringsslider) og `🔄 GYRO` (fysisk vri telefonen som eit ekte ratt).
   - **Ergonomiske pedalar:** Høgre tommelsone med GASS (▲), BREMS (▼) og DRIFT-knapp for brekksladdar.
   - **Multi-Touch:** Full uavhengig fingersporing slik at gass, brems og styring aldri blokkerer kvarandre.
   - **Responsivt Cyber-HUD & Fullskjerm (`⛶`):** Automatisk orienteringshjelp, kompakt minikart og DPR-optimalisering for 60 FPS og lågt batteriforbruk på mobilskjermar.
8. **Autonom Verifikasjonssyklus:**
   - Komplett testsuite (`python tools/run_all_tests.py`) med pytest (13 testar), Node.js matrise- og projeksjonstestar, headless spelsimulering (300 frames) og visuelt 3D scenerender.

---

## 🎮 Kontrollar (Controls)

| Handling | Tastatur | Mus / Skjerm | Mobil / Nettbrett |
| :--- | :--- | :--- | :--- |
| **Styring (Valfri)** | `A` / `D` / Piltastar | Klikk & Dra Mus (V/H) | **Knappar**, **Styrehjul** eller **Gyro/Tilt** |
| **Gass / Akselerasjon** | `W` eller `Pil Opp` | — | Pedal **▲ GASS** |
| **Brems / Rygge** | `S` eller `Pil Ned` | — | Pedal **▼ BREMS** |
| **Brekk-sladd (Drift)**| `Space` (Mellomrom) | — | Knapp **DRIFT** (Neon rosa) |
| **Bytt Styremodus** | — | — | Knapp `🎮 MODUS` (Knappar/Hjul/Gyro) |
| **Fullskjerm** | — | — | Knapp `⛶ FULLSKJERM` |
| **Skift Kameramodus** | `C` | Knapp `🎥 KAMERA` | Knapp `🎥 KAMERA` |
| **Nullstill bil til veg** | `R` | Knapp `🔄 RESET BIL` | Knapp `🔄 RESET BIL` |
| **Start etappe på nytt** | `T` | — | — |
| **Lyd Av / På (Mute)** | `M` | Knapp `🔊 LYD` | Knapp `🔊 LYD` |

---

## 🚀 Kom i gang (Quick Start)

Ingen installasjon eller byggeprosess er naudsynt!

### 1. Klon kodelageret
```bash
git clone https://github.com/torebjastad/WireRally3D.git
cd WireRally3D
```

### 2. Start ein lokal webserver
```bash
# Med Python:
python -m http.server 8080

# Eller med Node.js (npx):
npx serve .
```

### 3. Opne i nettlesaren
Gå til **[http://localhost:8080](http://localhost:8080)** i Chrome, Firefox, Edge eller Safari.

---

## 🧪 Køyring av Testar (Automated Tests)

Køyr heile den autonome verifikasjonssuiten:

```bash
python tools/run_all_tests.py
```

Dette køyrer automatisk:
1. **Pytest (13 testar):** Kartkalibrering, bakkekontakt, pitch/roll, bremselengd, brekksladd, off-road fysikk og autonom AI-sjåfør.
2. **Node.js Math3D:** Matriser, vektorar og analytisk near-plane linjeklipping.
3. **Headless Game Simulation:** 300 simulerte frames av heile spelsyklusen i Node.js.
4. **3D Preview Render:** Generering av wireframe-bilete frå kameravinkel.

---

## 📚 Dokumentasjon

Detaljert dokumentasjon finst i [`docs/`](docs/) og [`AGENTS.md`](AGENTS.md):
- [**AGENTS.md**](AGENTS.md) — Prosjektoversyn, instruksjonshistorikk og agentprotokoll.
- [**docs/architecture.md**](docs/architecture.md) — Systemarkitektur og dataflyt.
- [**docs/map_and_terrain.md**](docs/map_and_terrain.md) — Kartkalibrering og DTM1 høgdemodell.
- [**docs/vehicle_physics.md**](docs/vehicle_physics.md) — Bilfysikk, overflatedeteksjon og styring.
- [**docs/camera_and_rendering.md**](docs/camera_and_rendering.md) — 3D linjerasteriser og kameravinklar.
- [**docs/gameplay_and_audio.md**](docs/gameplay_and_audio.md) — Rallyetappe, HUD, minikart og lyd.
- [**docs/testing_and_verification.md**](docs/testing_and_verification.md) — Den autonome testsyklusen.

---

## 📄 Lisens

Dette prosjektet er lisensiert under [MIT License](LICENSE).
Terrengdata: © Kartverket (DTM1 Nasjonal Høgdemodell, CC-BY 4.0).
Veg- og bygningsdata: © OpenStreetMap-bidragsytarar (ODbL).