// tools/test_mobile_gui.js
// Inspects mobile layout, detects overflowing elements, and captures screenshots

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const width = parseInt(process.argv[2] || '390', 10);
const height = parseInt(process.argv[3] || '844', 10);
const screenshotPath = process.argv[4] || null;

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9222;

async function run() {
    console.log(`Starting Edge in headless mode: ${width}x${height}...`);
    const edge = spawn(edgePath, [
        '--headless',
        `--remote-debugging-port=${port}`,
        `--window-size=${width},${height}`,
        '--hide-scrollbars',
        'http://localhost:8080'
    ], { stdio: 'ignore' });

    let tabs = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const data = await new Promise((resolve, reject) => {
                http.get(`http://localhost:${port}/json`, res => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(body));
                }).on('error', reject);
            });
            const list = JSON.parse(data);
            const rallyTab = list.find(t => t.url && (t.url.includes('8080') || t.title.includes('Rally')));
            if (rallyTab) {
                tabs = rallyTab;
                break;
            }
        } catch (e) {
            // retry
        }
    }

    if (!tabs) {
        console.error('Could not find Rally tab in Edge.');
        edge.kill();
        process.exit(1);
    }

    const wsUrl = tabs.webSocketDebuggerUrl;
    console.log(`Connected to CDP: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    let reqId = 1;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = reqId++;
            const handler = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.id === id) {
                    ws.removeEventListener('message', handler);
                    if (msg.error) reject(msg.error);
                    else resolve(msg.result);
                }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    await new Promise(resolve => ws.addEventListener('open', resolve));

    // Enable mobile device metrics emulation
    await send('Emulation.setDeviceMetricsOverride', {
        width: width,
        height: height,
        deviceScaleFactor: 2,
        mobile: true
    });
    await send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5
    });

    // Reload or set viewport so media queries re-evaluate for exact mobile dimensions
    await send('Page.reload');

    // Wait 1.5 second for game loop to start
    await new Promise(r => setTimeout(r, 1500));

    // Inspect layout
    const evalResult = await send('Runtime.evaluate', {
        expression: `(() => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const docW = document.documentElement.scrollWidth;
            const bodyW = document.body.scrollWidth;
            
            const ids = [
                'gameContainer', 'renderCanvas', 'touchControls', 
                'btnTouchLeft', 'btnTouchRight', 'btnTouchBrake', 
                'btnTouchDown', 'btnTouchUp', 'minimapCanvas', 
                'btnMenuToggle', 'valSpeed'
            ];
            
            const rects = {};
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el) {
                    const r = el.getBoundingClientRect();
                    rects[id] = {
                        left: Math.round(r.left),
                        right: Math.round(r.right),
                        top: Math.round(r.top),
                        bottom: Math.round(r.bottom),
                        width: Math.round(r.width),
                        height: Math.round(r.height),
                        overflowRight: Math.round(r.right - w)
                    };
                }
            }

            // Find any element whose right exceeds window width
            const allElements = document.querySelectorAll('*');
            const overflowing = [];
            allElements.forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.right > w + 1 && r.width > 0 && r.height > 0) {
                    const desc = (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : el.tagName);
                    overflowing.push({ desc, right: Math.round(r.right), overflow: Math.round(r.right - w) });
                }
            });

            return {
                window: { w, h, docW, bodyW },
                rects,
                overflowing
            };
        })()`,
        returnByValue: true
    });

    const value = evalResult.result ? evalResult.result.value : evalResult;
    console.log('\n=== MOBILE LAYOUT DIAGNOSTICS ===');
    console.log(JSON.stringify(value, null, 2));

    if (process.argv.includes('--open-menu')) {
        console.log('Opening menu drawer...');
        await send('Runtime.evaluate', {
            expression: 'document.getElementById("btnMenuToggle").click()'
        });
        await new Promise(r => setTimeout(r, 400));
    }

    if (process.argv.includes('--touch-wheel')) {
        console.log('Switching to touch steering wheel...');
        await send('Runtime.evaluate', {
            expression: 'document.getElementById("btnTouchMode").click()' // KNAPPAR -> STYREHJUL
        });
        await new Promise(r => setTimeout(r, 400));
    }

    // Capture screenshot if requested
    if (screenshotPath) {
        const ss = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(screenshotPath, Buffer.from(ss.data, 'base64'));
        console.log(`\nScreenshot saved to ${screenshotPath}`);
    }

    ws.close();
    edge.kill();
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
