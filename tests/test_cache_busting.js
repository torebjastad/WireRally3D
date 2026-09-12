// tests/test_cache_busting.js
// Verifies no-cache HTTP headers and dynamic asset cache-busting on page refresh

const assert = require('assert');
const http = require('http');
const fs = require('fs');

console.log('Running Cache-Busting & Freshness Verification Tests...');

// 1. Verify index.html contains anti-cache meta tags and dynamic loader
{
    const html = fs.readFileSync('index.html', 'utf-8');
    assert.ok(html.includes('http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"'), 'Missing anti-cache meta tag');
    assert.ok(html.includes('http-equiv="Pragma" content="no-cache"'), 'Missing pragma meta tag');
    assert.ok(html.includes('window._CACHE_VERSION = Date.now()'), 'Missing dynamic cache version token');
    assert.ok(html.includes('s.src = src + \'?v=\' + v'), 'Missing script cache-busting parameter');
    assert.ok(html.includes('css/style.css?v='), 'Missing stylesheet cache-busting parameter');
    console.log('  -> [PASS] index.html contains all anti-cache meta tags and dynamic cache-busters.');
}

// 2. Verify dev_server responds with strict no-cache headers on port 8080
http.get('http://localhost:8080/index.html', res => {
    assert.strictEqual(res.statusCode, 200, 'Server must respond 200');
    const cc = res.headers['cache-control'] || '';
    assert.ok(cc.includes('no-cache'), 'Cache-Control header must contain no-cache');
    assert.ok(cc.includes('no-store'), 'Cache-Control header must contain no-store');
    assert.ok(cc.includes('must-revalidate'), 'Cache-Control header must contain must-revalidate');
    assert.strictEqual(res.headers['pragma'], 'no-cache', 'Pragma must be no-cache');
    console.log(`  -> [PASS] dev_server sent strict Cache-Control: "${cc}" and Pragma: "${res.headers['pragma']}".`);

    // 3. Test script request also has no-cache
    http.get('http://localhost:8080/js/game/gameLoop.js', jsRes => {
        assert.strictEqual(jsRes.statusCode, 200);
        const jsCc = jsRes.headers['cache-control'] || '';
        assert.ok(jsCc.includes('no-store') && jsCc.includes('no-cache'), 'JS file must have no-store/no-cache');
        console.log(`  -> [PASS] JS assets served with no-store/no-cache.`);
        console.log('ALL CACHE-BUSTING VERIFICATIONS PASSED (100%)!');
    }).on('error', err => {
        console.error('Error fetching JS asset:', err);
        process.exit(1);
    });
}).on('error', err => {
    console.error('Error connecting to dev_server on port 8080:', err.message);
    process.exit(1);
});
