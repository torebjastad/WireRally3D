// Entry point for Årølia Rally 3D
function initGame() {
    if (window._rallyInitialized) return;
    window._rallyInitialized = true;
    console.log("Årølia Rally 3D Initializing... (Version / Cache-bust Active)");

    // Check if data bundle is loaded
    if (!window.AROLIA_DATA) {
        console.warn("AROLIA_DATA not found in window, attempting fetch from data/...");
        const v = Date.now();
        Promise.all([
            fetch(`data/arolia_roads.json?v=${v}`).then(r => r.json()),
            fetch(`data/arolia_buildings.json?v=${v}`).then(r => r.json()),
            fetch(`data/arolia_terrain.json?v=${v}`).then(r => r.json()),
            fetch(`data/rally_track.json?v=${v}`).then(r => r.json()),
            fetch(`data/scenery.json?v=${v}`).then(r => r.json()),
            fetch(`data/projection_meta.json?v=${v}`).then(r => r.json())
        ]).then(([roads, buildings, terrain, track, scenery, meta]) => {
            window.AROLIA_DATA = {
                arolia_roads: roads,
                arolia_buildings: buildings,
                arolia_terrain: terrain,
                rally_track: track,
                scenery: scenery,
                projection_meta: meta
            };
            const game = new GameLoop();
            game.start();
            window.rallyGame = game;
        }).catch(err => {
            alert("Kunne ikkje laste kartdata for Årølia Rally. Sjekk konsollen.");
            console.error(err);
        });
    } else {
        const game = new GameLoop();
        game.start();
        window.rallyGame = game;
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

