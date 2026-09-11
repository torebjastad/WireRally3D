# Testing og Verifikasjon — Årølia Rally 3D

## 1. Filosofi: Autonom Utviklingssløyfe
Brukaren bad opphavleg om:
> *"Du skal jobbe sjølvstendig lenge og vel. Lage testar som viser at ting virkar. Testar som viser at 3D modellen passar med kartutsnittet. Lag ein slags loop som gjer at du kan jobbe sjølvstendig og finne ut når du har noko som er klart for å spelast."*

For å oppfylle dette har prosjektet ein komplett automatisert verifikasjonsloop som kan køyrast med éin enkelt kommando:

```bash
python tools/run_all_tests.py
```

---

## 2. Dei 4 Teststega

### Steg 1: Python & Kartdata Kalibreringstestar (`pytest -v`)
Køyrer 12 grundige einings- og integrasjonstestar:
1. **`test_ribbon_algorithm`:** Verifiserer at miter-normal algoritmen genererer jamne vegkantar med avstand under 12 meter utan vridningar.
2. **`test_landmark_projections_against_map_slice`:** Verifiserer at dei 4 rundkøyringane treff biletet med under 1.0 pikslars RMS-feil (oppnådd: **0.86 px**).
3. **`test_road_continuity_and_extent`:** Verifiserer at vegnettet spenner over heile Årølia og har over 25 km vegsegment.
4. **`test_visual_verification_overlay_generation`:** Genererer eit overleggsbilete (`test_alignment_verification.png`) som beviser visuell 1:1 match mot originalbiletet.
5. **`test_car_acceleration_and_top_speed`:** Verifiserer at bilen akselerer gjennom gira frå stilleståande og når rett fart innanfor rammene.
6. **`test_braking_and_handbrake_drift`:** Sjekkar at bremselengda frå 70 km/h er under 28 meter, og at brekket induserer reell sidesladd (`drift_slip > 2.0 m/s`).
7. **`test_airborne_jump_and_landing`:** Verifiserer at køyretøyet lettar ved bakketopp og landar trygt att.
8. **`test_car_follows_downhill_and_uphill_slopes`:** Verifiserer at pitch vinklar seg korrekt nedover i unnabakke og oppover i motbakke.
9. **`test_ai_driver_completes_rally_course`:** Ein autonom pure-pursuit AI-sjåfør køyrer heile etappen gjennom alle 9 sjekkpunkt innanfor tidsfristen (< 90s).
10. **`test_elevation_dataset_properties`:** Sjekkar at DTM1-høgdene spenner frå 0 til 193 moh.
11. **`test_hillside_slope_gradient`:** Bekreftar at terrenget stig naturleg frå fjorden i sør mot fjellet i nord.
12. **`test_rally_stage_elevation_continuity`:** Sjekkar at vegstigninga langs etappen er kontinuerleg utan umoglege sprang.

### Steg 2: Math3D Matrise- og Projeksjonseiningstest (`node tests/test_math3d.js`)
- Verifiserer 3D-vektorar (`Vector3`) og 4x4 matriser (`Matrix4`).
- Bekreftar at `perspective()`, `lookAt()` og kameraets høgre/venstre-orientering projiserer punkt til rett side av skjermen (NDC).

### Steg 3: Full Headless Spelintegrasjonstest (`node tests/test_game_headless.js`)
- Lastar inn alle spelets JavaScript-filer i eit reint Node.js-miljø med ein mocka Canvas Context.
- Simulerer **300 fulle fysikk- og rendering-frames** (5 sekund med aktiv køyring).
- Veksler gjennom alle 4 kameramodusar (`heli_chase`, `chase`, `hood`, `heli_top`) og verifiserer at ingen koordinatar eller berekningar vert `NaN`.

### Steg 4: 3D Scenerender & Visuelt Artefakt (`python tools/render_3d_preview.py`)
- Teiknar eit reelt 3D wireframe-bilete av terrenget, vegane og bilen sett frå kameraet.
- Lagrar eit PNG-bilete som visuelt bevis på at grafikken og linjene er feilfrie.

---

## 3. Krav ved Vidareutvikling
Kvar gong kode eller fysikk vert endra:
1. Køyr alltid `python tools/run_all_tests.py`.
2. Alle testar må passere med grønt lys (100 %) før endringar godkjennast.
