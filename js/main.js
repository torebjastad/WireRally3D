// Entry point for Årølia Rally 3D
window.addEventListener('DOMContentLoaded', () => {
    console.log("Årølia Rally 3D Initializing...");
    
    // Check if data bundle is loaded
    if (!window.AROLIA_DATA) {
        console.warn("AROLIA_DATA not found in window, attempting fetch from data/...");
        Promise.all([
            fetch('data/arolia_roads.json').then(r => r.json()),
            fetch('data/arolia_buildings.json').then(r => r.json()),
            fetch('data/arolia_terrain.json').then(r => r.json()),
            fetch('data/rally_track.json').then(r => r.json()),
            fetch('data/scenery.json').then(r => r.json()),
            fetch('data/projection_meta.json').then(r => r.json())
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
        }).catch(err => {
            alert("Kunne ikkje laste kartdata for Årølia Rally. Sjekk konsollen.");
            console.error(err);
        });
    } else {
        const game = new GameLoop();
        game.start();
        window.rallyGame = game;
    }
});
