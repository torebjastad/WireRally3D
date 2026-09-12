# Gameplay, HUD og Lyd — Årølia Rally 3D

## 1. Rallyetappen: Årøhallen til Årølia Skole
Etappen følgjer den asfalterte hovudvegen gjennom heile Årølia (Årølivegen):
- **Start:** Ved Årøhallen ($X = -838, Z = -335$, kurs $88^\circ$ mot aust).
- **Trasé:** Startar på Årølivegen ved Årøhallen, følgjer svingane forbi bustadområda, gjennom midt-rundkøyringa i Årølivegen og klatrar opp bakkane mot aust.
- **Mål:** Like ovanfor Årølia skole ($X = 688, Z = 74$).
- **Sjekkpunkt:** 11 sjekkpunktportar (`data/rally_track.json`) lagde nøyaktig langs vegkorridoren, slik at ein må følgje vegen for å ta sjekkpunkta.
- **Målgang & Tider:**
  - Viser live tidtaking i formatet `M:SS.ss`.
  - Split-tider og sektor-meldinger i stort HUD-banner.
  - Beste tid lagrast lokalt per økt.

---

## 2. Førar-HUD og Instrumentpanel
Plassert nede til høgre, i midten og oppe til venstre:

### Mus-Styring HUD-Indikator (`#mouseSteerIndicator`)
- Ved klikk og draing med venstre museknapp visest eit holografisk sikte med drag-linje, retningspeikar og live prosentvis styrevinkel (`◀ 45% VENSTRE` / `HØGRE 60% ▶`).

### Off-Road Åtvaringsbanner (`#offroadWarning`)
- Når bilen rullar utanfor asfaltvegen, kjem det opp eit blinkande oransje og raudt åtvaringsskilt i midten av skjermen: `⚠️ UTANFOR VEGEN`.
- Skiltet indikerer at bilen er utanfor vegen og grasrullemotstanden reduserer farten.

### Speedometer og Turtall
- **Kalibrert Fartsmåling ($v \times 2.2$):**
  Speedometeret viser hastigheit i km/h tilpassa kartets pikselmålestokk og augas oppleving frå helikopterkameraet:
  - Rundkøyringar: ~25–35 km/h
  - Bustadgater: ~45–65 km/h
  - Raske strekk: ~110–140 km/h
  - Toppfart: ~180–185 km/h (svarar til ein ekte WRC-bil)
- **Gir-indikator:** Viser `R`, `N`, `1`, `2`, `3`, `4`, `5`.
- **Turtalsbar (Tachometer):**
  Dynamisk fargeindikator som skiftar farge mot raudlinja:
  - Normal: Grøn/Cyan (`#00ffcc`)
  - Høgt turtall (> 70 %): Oransje (`#ffaa00`)
  - Turtallskutt (> 88 %): Raud (`#ff0055`)

---

## 3. 2D GPS-Minikart (`minimap.js`)
Plassert oppe til venstre:
- **Kartutsnitt:** Følgjer det eksakte rektangulære utsnittet frå brukarens opphavlege referansebilete.
- **Skalert Rally-Chevron:** Køyretøyet er markert med ei smekker 5.5-piksels retningspil som roterer nøyaktig med bilens kompasskurs.
- **Sjekkpunktmarkering:** Aktive og passerte sjekkpunkt lyser opp i gult og grønt.

---

## 4. Prosedyrisk Lydmotor (`audio.js`)
Spelet nyttar **Web Audio API** utan eksterne lydfiler:
- **Motorlyd:**
  - Kombinasjon av sagtagg- (sawtooth) og trekant- (triangle) oscillatorar som vert frekvensmodulerte i sanntid etter bilens RPM ($900 – 7200 \text{ RPM}$).
  - Waveshaper-forvrenging (distortion) gjev ein rå og metallisk rallybil-tone ved gasspådrag.
- **Dekkskrik og Sladdelyd:**
  - Kvit støy generert gjennom eit resonerande bandpassfilter (`BiquadFilterNode`).
  - Gain vert trigga proporsjonalt med bilens sideslip (`driftSlip`) ved brekksladd og hard bremsing.
- **Lydkontroll:** Kan slåast av/på med `M`-tasten eller `🔊 LYD`-knappen i HUD.

---

## 5. Mobil- og Nettbrett-støtte (`gameLoop.js` & `style.css`)

Spelet har full integrert støtte for smarttelefonar og nettbrett med tre valfrie styremodusar og multi-touch:

1. **Tre Styremodusar:**
   - **`🕹️ KNAPPAR` (Standard):** Store berøringsknappar for venstre tommel (`◀` og `▶`).
   - **`🎯 STYREHJUL`:** Trinnlaus analog berøringsflate. Når tommelen dregast mot høgre eller venstre, vert styrevinkelen kalkulert proporsjonalt ($0 - 100\%$) med ikkje-lineær kurve for presis linjehaldning.
   - **`🔄 GYRO`:** Fysisk vri/tilting av telefonen som eit ratt (`DeviceOrientationEvent` gamma/beta). Støttar iOS 13+ med løyve-førespurnad og har eigen nullstillingsknapp (`btnCalibrateGyro`).

2. **Ergonomiske Pedalar (Høgre Tommelsone):**
   - **▲ GASS:** Vertikalt langstrakt gasspedal tilpassa naturleg tommelkvile.
   - **▼ BREMS:** Brei bremse- og reversblokk.
   - **DRIFT:** Neon-rosa knapp for handbrekksladd i krappe svingar.

3. **Multi-Touch Sporing:**
   Kvar finger vert spora uavhengig via `Touch.identifier`, slik at gasspådrag, styring og brekksladd kan utførast samstundes utan at hendingane blokkerer kvarandre.

4. **Web Audio Opplåsing på Mobil:**
   `AudioContext` vert automatisk låst opp (`init()` og `resume()`) ved første berøring (`touchstart`) på skjermen.

5. **Responsivt Cyber-HUD & Fullskjerm:**
   - Eige `⛶ FULLSKJERM`-val som skjuler adressefeltet for ei rein app-oppleving.
   - Kompakt minikart ($120 \times 68\text{ px}$) og speedometer heva over pedalområdet.
   - Orienteringsoverlay som rår spelaren til å nytte liggande format (landscape).

