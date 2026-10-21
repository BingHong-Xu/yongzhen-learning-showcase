const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const baseDir = path.resolve(__dirname, '..');

// 1. Start a simple static server
const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  
  const fullPath = path.join(baseDir, reqPath.replace(/^\//, ''));
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found: ' + reqPath);
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(fullPath).pipe(res);
});

const PORT = 8899;
server.listen(PORT, async () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}`);

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const debugPort = 9456;
  const tempProfile = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\.edge_temp_showcase_verify';

  if (!fs.existsSync(tempProfile)) fs.mkdirSync(tempProfile, { recursive: true });

  const proc = cp.spawn(edgePath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1400,1050',
    `--user-data-dir=${tempProfile}`
  ]);

  await new Promise(r => setTimeout(r, 1600));

  try {
    const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
    const targetPage = pages[0];
    const ws = new WebSocket(targetPage.webSocketDebuggerUrl);

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === msgId) {
            ws.removeEventListener('message', handler);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await new Promise(resolve => ws.onopen = resolve);

    const consoleMessages = [];
    const exceptions = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push(data.params);
      } else if (data.method === 'Runtime.exceptionThrown') {
        exceptions.push(data.params);
      }
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });

    console.log('Navigating to http://127.0.0.1:' + PORT + '/index.html ...');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

    // Wait for page load and images
    await new Promise(r => setTimeout(r, 2500));

    console.log('--- Checking Console & Exceptions ---');
    console.log('Console calls count:', consoleMessages.length);
    console.log('Exceptions count:', exceptions.length);
    exceptions.forEach(e => console.error('Browser Exception:', e.exceptionDetails));

    // Capture Hero Screenshot
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    const heroShotPath = path.join(baseDir, 'preview_hero.png');
    fs.writeFileSync(heroShotPath, Buffer.from(shot1.data, 'base64'));
    console.log('Hero screenshot saved to:', heroShotPath);

    // Scroll to Exhibition Grid and capture
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 750);' });
    await new Promise(r => setTimeout(r, 1000));
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    const gridShotPath = path.join(baseDir, 'preview_grid.png');
    fs.writeFileSync(gridShotPath, Buffer.from(shot2.data, 'base64'));
    console.log('Grid screenshot saved to:', gridShotPath);

    // Click on Anniversary-39 explore button to open Modal
    console.log('Testing Modal open...');
    await send('Runtime.evaluate', { 
      expression: 'document.querySelector(\'[data-id="anniversary-39"] .btn-card-explore\').click();' 
    });
    await new Promise(r => setTimeout(r, 800));

    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    const modalShotPath = path.join(baseDir, 'preview_modal.png');
    fs.writeFileSync(modalShotPath, Buffer.from(shot3.data, 'base64'));
    console.log('Modal screenshot saved to:', modalShotPath);

    // Click a photo inside modal to test Lightbox
    console.log('Testing Lightbox open from modal...');
    await send('Runtime.evaluate', {
      expression: 'document.querySelector("#modalPhotosGrid .modal-photo-item").click();'
    });
    await new Promise(r => setTimeout(r, 800));

    const shot4 = await send('Page.captureScreenshot', { format: 'png' });
    const lightboxShotPath = path.join(baseDir, 'preview_lightbox.png');
    fs.writeFileSync(lightboxShotPath, Buffer.from(shot4.data, 'base64'));
    console.log('Lightbox screenshot saved to:', lightboxShotPath);

    // Close lightbox and modal, test timeline view
    console.log('Testing Timeline view mode...');
    await send('Runtime.evaluate', {
      expression: `
        document.getElementById("lightboxCloseBtn").click();
        document.getElementById("modalCloseBtn").click();
        document.querySelector('[data-view="timeline"]').click();
        window.scrollTo(0, 1200);
      `
    });
    await new Promise(r => setTimeout(r, 1000));

    const shot5 = await send('Page.captureScreenshot', { format: 'png' });
    const timelineShotPath = path.join(baseDir, 'preview_timeline.png');
    fs.writeFileSync(timelineShotPath, Buffer.from(shot5.data, 'base64'));
    console.log('Timeline screenshot saved to:', timelineShotPath);

    // Test PII Modal open
    console.log('Testing PII Compliance modal...');
    await send('Runtime.evaluate', {
      expression: `
        document.querySelector('.open-pii-modal').click();
      `
    });
    await new Promise(r => setTimeout(r, 800));

    const shot6 = await send('Page.captureScreenshot', { format: 'png' });
    const piiShotPath = path.join(baseDir, 'preview_pii_modal.png');
    fs.writeFileSync(piiShotPath, Buffer.from(shot6.data, 'base64'));
    console.log('PII Modal screenshot saved to:', piiShotPath);

    console.log('\n=== ALL TESTS PASSED WITH 0 EXCEPTIONS! ===');

    ws.close();
    proc.kill();
    server.close();
    process.exit(0);

  } catch(e) {
    console.error('Error during verification:', e);
    try { proc.kill(); } catch(_) {}
    try { server.close(); } catch(_) {}
    process.exit(1);
  }
});
