// Dynamic Map & Stage Loader for Årølia Rally 3D
// Generates complete 3D wireframe stages on-the-fly from OpenStreetMap and elevation data

class DynamicMapLoader {
    static OVERPASS_MIRRORS = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter'
    ];

    // Project WGS84 (lat, lon) to local Cartesian (x, z) in meters centered at (lat0, lon0)
    // +X is East, +Z is North
    static projectWGS84(lat, lon, lat0, lon0) {
        const R = 6378137.0; // Earth radius in meters (WGS84)
        const latRad0 = (lat0 * Math.PI) / 180.0;
        const x = ((lon - lon0) * Math.PI / 180.0) * R * Math.cos(latRad0);
        const z = ((lat - lat0) * Math.PI / 180.0) * R;
        return { x, z };
    }

    // Geocode a location name or parse coordinates
    static async geocode(query) {
        const trimmed = query.trim();
        const coordMatch = trimmed.match(/^([-+]?\d+(?:\.\d+)?)[,\s]+([-+]?\d+(?:\.\d+)?)$/);
        if (coordMatch) {
            return {
                lat: parseFloat(coordMatch[1]),
                lon: parseFloat(coordMatch[2]),
                displayName: `GPS (${parseFloat(coordMatch[1]).toFixed(4)}°, ${parseFloat(coordMatch[2]).toFixed(4)}°)`
            };
        }

        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) throw new Error(`Geocoding failed: HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data || data.length === 0) {
            throw new Error(`Fann ingen stad med namnet "${trimmed}". Prøv eit anna stadsnamn eller GPS-koordinatar.`);
        }
        return {
            lat: parseFloat(data[0].lat),
            lon: parseFloat(data[0].lon),
            displayName: data[0].display_name.split(',')[0]
        };
    }

    // Fetch roads and buildings via Overpass API with mirror fallback
    static async fetchOverpass(s, w, n, e, onStatus) {
        const query = `[out:json][timeout:25];(way["highway"](${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)});way["building"](${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)}););out body geom;`;
        
        let lastErr = null;
        for (const mirror of DynamicMapLoader.OVERPASS_MIRRORS) {
            try {
                if (onStatus) onStatus(`Kontaktar kartserver (${new URL(mirror).hostname})...`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);
                const resp = await fetch(mirror, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (resp.ok) {
                    const data = await resp.json();
                    return data;
                }
            } catch (err) {
                lastErr = err;
            }
        }
        throw new Error(`Kunne ikkje hente kartdata frå Overpass API: ${lastErr ? lastErr.message : 'Timeout'}`);
    }

    // Fetch elevation grid via Open-Meteo in safe batches
    static async fetchElevationGrid(lat, lon, deltaLat, deltaLon, nx = 16, nz = 16, onStatus) {
        const lats = [];
        const lons = [];
        for (let j = 0; j < nz; j++) {
            const curLat = (lat - deltaLat) + (j / (nz - 1)) * (2 * deltaLat);
            for (let i = 0; i < nx; i++) {
                const curLon = (lon - deltaLon) + (i / (nx - 1)) * (2 * deltaLon);
                lats.push(curLat);
                lons.push(curLon);
            }
        }

        const elevations = [];
        const chunkSize = 64;
        const totalChunks = Math.ceil(lats.length / chunkSize);

        for (let idx = 0; idx < lats.length; idx += chunkSize) {
            const chunkIdx = Math.floor(idx / chunkSize) + 1;
            if (onStatus) onStatus(`Hentar høgdedata (${chunkIdx}/${totalChunks})...`);
            const cLats = lats.slice(idx, idx + chunkSize);
            const cLons = lons.slice(idx, idx + chunkSize);
            const latStr = cLats.map(v => v.toFixed(4)).join(',');
            const lonStr = cLons.map(v => v.toFixed(4)).join(',');
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${latStr}&longitude=${lonStr}`;

            try {
                const resp = await fetch(url);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.elevation) {
                        elevations.push(...data.elevation);
                    }
                } else {
                    for (let k = 0; k < cLats.length; k++) elevations.push(10.0);
                }
            } catch (e) {
                for (let k = 0; k < cLats.length; k++) elevations.push(10.0);
            }
            await new Promise(r => setTimeout(r, 200));
        }

        return elevations;
    }

    // Construct full Stage data bundle from OSM and Elevation inputs
    static buildStageFromData(name, centerLat, centerLon, osmData, elevations, nx = 16, nz = 16, audio = null) {
        const elements = (osmData && osmData.elements) ? osmData.elements : [];

        // 1. Build Terrain Mesh (1km x 1km centered at 0,0)
        const xMin = -500.0, xMax = 500.0;
        const zMin = -500.0, zMax = 500.0;
        const stepX = (xMax - xMin) / (nx - 1);
        const stepZ = (zMax - zMin) / (nz - 1);

        const vertices = [];
        let minElev = Infinity;
        if (elevations && elevations.length >= nx * nz) {
            for (const h of elevations) if (h < minElev) minElev = h;
        } else {
            minElev = 0;
        }

        for (let j = 0; j < nz; j++) {
            const row = [];
            const z = zMin + j * stepZ;
            for (let i = 0; i < nx; i++) {
                const x = xMin + i * stepX;
                const idx = j * nx + i;
                let y = (elevations && elevations[idx] !== undefined) ? (elevations[idx] - minElev + 1.0) : 1.0;
                row.push({ x, y, z });
            }
            vertices.push(row);
        }

        const terrainData = {
            x_min: xMin,
            x_max: xMax,
            z_min: zMin,
            z_max: zMax,
            nx: nx,
            nz: nz,
            grid_step: stepX,
            vertices: vertices
        };
        const terrain = new Terrain(terrainData);

        // 2. Build Roads with 1km bounding box clipping
        const rawWays = elements.filter(el => el.type === 'way' && el.tags && el.tags.highway && el.geometry && el.geometry.length >= 2);
        
        const isDriveable = (hw) => !['footway', 'steps', 'path', 'cycleway', 'pedestrian', 'bridleway', 'corridor'].includes(hw);
        let candidateWays = rawWays.filter(w => isDriveable(w.tags.highway));
        if (candidateWays.length === 0) candidateWays = rawWays;

        const boundLimit = 520.0; // Stay within 1km x 1km region
        const roads = [];

        for (const way of candidateWays) {
            const hw = way.tags.highway || 'unclassified';
            let priority = 2;
            let width = 6.0;
            if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(hw)) {
                priority = 3;
                width = 7.5;
            } else if (['service', 'track', 'living_street'].includes(hw)) {
                priority = 1;
                width = 4.5;
            }

            // Project all points and split into segments that fall inside the bounding box
            const projected = way.geometry.map(pt => {
                const proj = DynamicMapLoader.projectWGS84(pt.lat, pt.lon, centerLat, centerLon);
                return {
                    x: proj.x,
                    y: terrain.getHeight(proj.x, proj.z),
                    z: proj.z,
                    lat: pt.lat,
                    lon: pt.lon
                };
            });

            const subSegments = [];
            let currentSub = [];
            for (const p of projected) {
                if (Math.abs(p.x) <= boundLimit && Math.abs(p.z) <= boundLimit) {
                    currentSub.push(p);
                } else {
                    if (currentSub.length >= 2) subSegments.push(currentSub);
                    currentSub = [];
                }
            }
            if (currentSub.length >= 2) subSegments.push(currentSub);

            for (let sIdx = 0; sIdx < subSegments.length; sIdx++) {
                const points = subSegments[sIdx];
                const isClosed = (way.nodes && way.nodes[0] === way.nodes[way.nodes.length - 1]) &&
                    (subSegments.length === 1) &&
                    (Math.hypot(points[0].x - points[points.length - 1].x, points[0].z - points[points.length - 1].z) < 1.0);

                const halfW = width * 0.5;
                const N = points.length;
                const leftCurb = [];
                const rightCurb = [];

                for (let i = 0; i < N; i++) {
                    const p = points[i];
                    let tx, tz, miter = 1.0;

                    if (isClosed) {
                        const prev = points[(i - 1 + N) % N];
                        const next = points[(i + 1) % N];
                        const dx1 = p.x - prev.x, dz1 = p.z - prev.z;
                        const l1 = Math.hypot(dx1, dz1) || 1.0;
                        const dx2 = next.x - p.x, dz2 = next.z - p.z;
                        const l2 = Math.hypot(dx2, dz2) || 1.0;
                        const v1x = dx1 / l1, v1z = dz1 / l1;
                        const v2x = dx2 / l2, v2z = dz2 / l2;
                        tx = v1x + v2x; tz = v1z + v2z;
                        const tl = Math.hypot(tx, tz);
                        if (tl < 0.01) { tx = v1x; tz = v1z; }
                        else {
                            tx /= tl; tz /= tl;
                            const dot = v1x * v2x + v1z * v2z;
                            miter = Math.min(1.4, 1.0 / Math.max(0.65, Math.sqrt(Math.max(0.01, (1.0 + dot) * 0.5))));
                        }
                    } else {
                        if (i === 0) {
                            const dx = points[1].x - p.x, dz = points[1].z - p.z;
                            const l = Math.hypot(dx, dz) || 1.0;
                            tx = dx / l; tz = dz / l;
                        } else if (i === N - 1) {
                            const dx = p.x - points[N - 2].x, dz = p.z - points[N - 2].z;
                            const l = Math.hypot(dx, dz) || 1.0;
                            tx = dx / l; tz = dz / l;
                        } else {
                            const dx1 = p.x - points[i - 1].x, dz1 = p.z - points[i - 1].z;
                            const l1 = Math.hypot(dx1, dz1) || 1.0;
                            const dx2 = points[i + 1].x - p.x, dz2 = points[i + 1].z - p.z;
                            const l2 = Math.hypot(dx2, dz2) || 1.0;
                            const v1x = dx1 / l1, v1z = dz1 / l1;
                            const v2x = dx2 / l2, v2z = dz2 / l2;
                            tx = v1x + v2x; tz = v1z + v2z;
                            const tl = Math.hypot(tx, tz);
                            if (tl < 0.01) { tx = v1x; tz = v1z; }
                            else {
                                tx /= tl; tz /= tl;
                                const dot = v1x * v2x + v1z * v2z;
                                miter = Math.min(1.4, 1.0 / Math.max(0.65, Math.sqrt(Math.max(0.01, (1.0 + dot) * 0.5))));
                            }
                        }
                    }

                    const nx = -tz, nz = tx;
                    leftCurb.push({
                        x: p.x + nx * halfW * miter,
                        y: p.y + 0.15,
                        z: p.z + nz * halfW * miter
                    });
                    rightCurb.push({
                        x: p.x - nx * halfW * miter,
                        y: p.y + 0.15,
                        z: p.z - nz * halfW * miter
                    });
                }

                roads.push({
                    id: way.id * 100 + sIdx,
                    name: way.tags.name || '',
                    type: hw,
                    width: width,
                    color: '#00ffcc',
                    priority: priority,
                    is_closed: isClosed,
                    points: points,
                    left_curb: leftCurb,
                    right_curb: rightCurb
                });
            }
        }

        // Fallback procedural road if area has no OSM roads
        if (roads.length === 0) {
            const fallbackPts = [];
            const N = 40;
            for (let i = 0; i <= N; i++) {
                const t = (i / N) * Math.PI * 2;
                const rx = Math.sin(t) * 320.0 + Math.sin(t * 3) * 60.0;
                const rz = Math.cos(t) * 320.0 + Math.cos(t * 2) * 40.0;
                fallbackPts.push({ x: rx, y: terrain.getHeight(rx, rz), z: rz });
            }
            roads.push({
                id: 999999,
                name: 'Høgfjellsetappe',
                type: 'primary',
                width: 7.5,
                color: '#00ffcc',
                priority: 3,
                is_closed: true,
                points: fallbackPts,
                left_curb: fallbackPts.map(p => ({ x: p.x - 3.75, y: p.y + 0.15, z: p.z })),
                right_curb: fallbackPts.map(p => ({ x: p.x + 3.75, y: p.y + 0.15, z: p.z }))
            });
        }

        // 3. Build Buildings
        const buildingWays = elements.filter(el => el.type === 'way' && el.tags && el.tags.building && el.geometry && el.geometry.length >= 3);
        const buildings = [];
        for (const bWay of buildingWays) {
            const poly = bWay.geometry.map(pt => {
                const proj = DynamicMapLoader.projectWGS84(pt.lat, pt.lon, centerLat, centerLon);
                return { x: proj.x, z: proj.z };
            });

            // Keep only buildings inside the 1km area
            const cX = poly.reduce((sum, p) => sum + p.x, 0) / poly.length;
            const cZ = poly.reduce((sum, p) => sum + p.z, 0) / poly.length;
            if (Math.abs(cX) > boundLimit || Math.abs(cZ) > boundLimit) continue;

            let avgY = 0;
            for (const p of poly) {
                avgY += terrain.getHeight(p.x, p.z);
            }
            avgY /= poly.length;

            let h = 6.0;
            if (bWay.tags['building:levels']) {
                h = Math.max(3.5, parseFloat(bWay.tags['building:levels']) * 3.2);
            } else if (['commercial', 'retail', 'industrial', 'church', 'school'].includes(bWay.tags.building)) {
                h = 10.5;
            }

            buildings.push({
                id: bWay.id,
                name: bWay.tags.name || '',
                type: bWay.tags.building,
                base_y: avgY,
                height: h,
                polygon: poly
            });
        }

        // 4. Generate Rally Track Checkpoints
        // Sort roads by priority descending, then length descending
        const sortedRoads = [...roads].sort((a, b) => (b.priority * 1000 + b.points.length) - (a.priority * 1000 + a.points.length));
        const mainRoad = sortedRoads[0];
        const checkpoints = [];

        if (mainRoad && mainRoad.points.length >= 2) {
            const pts = mainRoad.points;
            let cumDist = 0;
            const dists = [0];
            for (let i = 1; i < pts.length; i++) {
                cumDist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
                dists.push(cumDist);
            }

            const totalLen = cumDist;
            const targetSpacing = Math.max(80.0, Math.min(150.0, totalLen / 8.0));
            let nextDist = 0;
            let cpIdx = 0;

            for (let i = 0; i < pts.length; i++) {
                if (dists[i] >= nextDist || i === pts.length - 1) {
                    const p = pts[i];
                    const nextP = pts[Math.min(pts.length - 1, i + 1)];
                    const dx = nextP.x - p.x;
                    const dz = nextP.z - p.z;
                    const heading = (Math.hypot(dx, dz) > 0.01) ? (Math.atan2(dx, dz) * 180.0 / Math.PI) : 0.0;

                    let type = 'checkpoint';
                    let cpName = `Sjekkpunkt ${cpIdx}`;
                    if (cpIdx === 0) {
                        type = 'start';
                        cpName = 'Start / Etappe Start';
                    } else if (i === pts.length - 1 || dists[i] >= totalLen * 0.94) {
                        type = 'finish';
                        cpName = 'Mål / Etappe Slutt';
                    }

                    checkpoints.push({
                        x: p.x,
                        y: terrain.getHeight(p.x, p.z),
                        z: p.z,
                        heading: heading,
                        width: 12.0,
                        type: type,
                        name: cpName
                    });

                    cpIdx++;
                    nextDist += targetSpacing;
                    if (type === 'finish') break;
                }
            }

            // Ensure last checkpoint is finish
            if (checkpoints.length > 0) {
                checkpoints[checkpoints.length - 1].type = 'finish';
                checkpoints[checkpoints.length - 1].name = 'Mål / Etappe Slutt';
            }
        }

        const rallyTrack = new RallyTrack({ checkpoints: checkpoints }, audio);

        // 5. Minimap Metadata
        const minimapMeta = {
            is_dynamic: true,
            name: name,
            bounds: { xMin, xMax, zMin, zMax },
            local_to_pixel: { ax: 1, bx: 0, cx: 0, ay: 0, by: 1, cy: 0 }
        };

        const cp0 = checkpoints[0] || { x: 0, y: 1.0, z: 0, heading: 0 };
        const startPos = {
            x: cp0.x,
            y: cp0.y + 0.2,
            z: cp0.z,
            headingRad: (cp0.heading * Math.PI) / 180.0
        };

        return {
            name: name,
            terrain: terrain,
            roads: roads,
            buildings: buildings,
            track: rallyTrack,
            projection_meta: minimapMeta,
            startPos: startPos
        };
    }

    // Load Stage by preset key or custom search query
    static async loadStage(source, audio, onStatus) {
        if (window.STAGE_PRESETS && window.STAGE_PRESETS[source]) {
            if (onStatus) onStatus(`Konstruerer ${window.STAGE_PRESETS[source].name}...`);
            const p = window.STAGE_PRESETS[source];
            return DynamicMapLoader.buildStageFromData(
                p.name,
                p.lat,
                p.lon,
                p.osm,
                p.elevations,
                p.nx || 16,
                p.nz || 16,
                audio
            );
        }

        if (onStatus) onStatus(`Søker etter "${source}"...`);
        const geo = await DynamicMapLoader.geocode(source);
        if (onStatus) onStatus(`Funne: ${geo.displayName}. Hentar kartdata...`);

        const lat = geo.lat;
        const lon = geo.lon;
        const latRad = (lat * Math.PI) / 180.0;
        const deltaLat = (500.0 / 6378137.0) * (180.0 / Math.PI);
        const deltaLon = (500.0 / (6378137.0 * Math.cos(latRad))) * (180.0 / Math.PI);

        const s = lat - deltaLat, n = lat + deltaLat;
        const w = lon - deltaLon, e = lon + deltaLon;

        const [osmData, elevs] = await Promise.all([
            DynamicMapLoader.fetchOverpass(s, w, n, e, onStatus),
            DynamicMapLoader.fetchElevationGrid(lat, lon, deltaLat, deltaLon, 16, 16, onStatus)
        ]);

        if (onStatus) onStatus(`Byggjer 3D-modell og genererer rallysjekkpunkt...`);
        return DynamicMapLoader.buildStageFromData(
            geo.displayName,
            lat,
            lon,
            osmData,
            elevs,
            16,
            16,
            audio
        );
    }
}

if (typeof window !== 'undefined') {
    window.DynamicMapLoader = DynamicMapLoader;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DynamicMapLoader;
}
