# Kamera og 3D Rendering — Årølia Rally 3D

## 1. 3D Programvare-Rasteriser (`wireframeRenderer.js`)
All rendering er implementert frå botnen utan WebGL eller eksterne bibliotek:
- **Renderer:** HTML5 2D Canvas Context (`ctx.beginPath()`, `ctx.moveTo()`, `ctx.lineTo()`, `ctx.stroke()`).
- **Yting:** Svært lettvekts; oppnår stabilt 60 FPS på sjølv enkle bærbare datamaskiner og mobiltelefonar.

---

## 2. 3D-Matematikk og Analytisk Linjeklipping (`math3d.js`)
For å hindre at linjer bak kameraet forvrenge seg eller skyt på tvers av skjermen:

### Analytisk Near-Plane Clipping:
Viss eit linjesegment frå $\mathbf{P}_1$ til $\mathbf{P}_2$ kryssar kameras nære klippeplan ($z = z_{\text{near}} = 0.5 \text{ m}$ i øyerommet):
1. Dersom begge punkt er bak klippeplanet ($z_1 \le z_{\text{near}}$ og $z_2 \le z_{\text{near}}$), vert linja forkasta.
2. Dersom linja kryssar planet, finn vi det eksakte skjeringspunktet ved lineær interpolering:
   $$t = \frac{z_{\text{near}} - z_1}{z_2 - z_1}, \quad \mathbf{P}_{\text{clipped}} = \mathbf{P}_1 + t (\mathbf{P}_2 - \mathbf{P}_1)$$
3. Dette løyste problemet der vegar tidlegare kunne forsvinne plutseleg når ein køyrde framover.

---

## 3. Kameramodusar
Spelet har 4 kameramodusar som kan vekslast med `C`-tasten:

### 1. Heli Skrått (`heli_chase`) — STANDARD
- **WRC TV-helikopter:** Posisjonert skrått bak bilen for spektakulær oversikt over heile vegen og landskapet.
- **Geometri:**
  - Avstand bak: $22.0 + (\text{speedRatio} \times 8.0) \text{ meter}$
  - Sideforskyving: $10.0 + (\text{speedRatio} \times 4.0) \text{ meter}$
  - Høgde: $18.0 + (\text{speedRatio} \times 6.0) \text{ meter}$ (med minimum $12 \text{ meter}$ bakkeklaring mot åssidene).
- **Kinematisk demping (Cinematic damping):**
  Kameraet følgjer ikkje stivt etter hekken, men har simulert aerodynamisk tregleik (`dt * 2.2` på posisjon, `dt * 3.5` på siktepunkt). Når bilen kastar seg inn i ein brekksladd, glir kameraet nydeleg rundt i ei mjuk boge.

### 2. Chase (`chase`)
- Dynamisk 3. persons rally-kamera 6–9 meter bak bilen.
- Følgjer bilens pitch og har adaptiv bakkeklaring i motbakkar.

### 3. Panser (`hood`)
- 1. persons cockpit-perspektiv montert på panseret.
- Gjev maksimal fartsfølelse og direkte siktlinje inn i svingane.

### 4. Heli Topp (`heli_top`)
- Taktisk fugleperspektiv 48 meter rett over bilen, perfekt for å lære seg vegnettet og sjekkpunkta.

---

## 4. Dynamisk Farts-FOV & Visuell Palett
- **Farts-FOV:** Kameraets synsvinkel aukar dynamisk frå $70^\circ$ i ro opp til $76^\circ$ ved høg fart for å skape ei naturleg fartsbølgje i sidesynet ("ground rush").
- **Neon Cyberpunk Fargepalett:**
  - **Vegar:** `#00ffcc` (lysande neon cyan)
  - **Terreng-grid:** `#003344` (dempa elektrisk blå)
  - **Rallybil:** `#ff0055` (neon magenta) / `#ffffff`
  - **Bygningar:** `#0088aa` (kontur-cyan)
  - **Sjekkpunktportar:** `#ffcc00` (gyllengul)
  - **Fjord / Horisont:** `#002233` (djupt nattblått)
