const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function detailedAudit() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-rwd-audit-detailed';
  const remoteDebuggingPort = 9244;

  const edgeProcess = spawn(edgePath, [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ]);

  await wait(1800);

  try {
    const listRes = await fetch(`http://127.0.0.1:${remoteDebuggingPort}/json/list`);
    const pages = await listRes.json();
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);

    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        const { resolve, reject } = callbacks.get(data.id);
        callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        callbacks.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await send('Page.enable');
    await send('DOM.enable');
    await send('Runtime.enable');

    const htmlPath = path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await send('Page.navigate', { url: `file:///${htmlPath}` });
    await wait(2000);

    // Test Mobile 375
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(400);

    // Capture sections on mobile:
    const sections = [
      { name: 'header_and_hero', y: 0 },
      { name: 'trophy_spotlight', selector: '#trophySpotlight' },
      { name: 'filter_toolbar', selector: '#exhibitionSection' },
      { name: 'activity_cards', selector: '#activitiesContainer' },
      { name: 'sdgs_matrix', selector: '#sdgsMatrixSection' },
      { name: 'footer', selector: '.site-footer' }
    ];

    for (const sec of sections) {
      if (sec.selector) {
        await send('Runtime.evaluate', {
          expression: `(() => {
            const el = document.querySelector('${sec.selector}');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
          })()`
        });
        await wait(300);
      } else {
        await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${sec.y});` });
        await wait(300);
      }

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve(__dirname, `section_mobile_${sec.name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`Captured mobile ${sec.name}`);
    }

    // Now test Tablet 768
    await send('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(400);

    for (const sec of sections) {
      if (sec.selector) {
        await send('Runtime.evaluate', {
          expression: `(() => {
            const el = document.querySelector('${sec.selector}');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
          })()`
        });
        await wait(300);
      } else {
        await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${sec.y});` });
        await wait(300);
      }

      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.resolve(__dirname, `section_tablet_${sec.name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`Captured tablet ${sec.name}`);
    }

    ws.close();
  } catch (err) {
    console.error(err);
  } finally {
    edgeProcess.kill();
  }
}

detailedAudit();
