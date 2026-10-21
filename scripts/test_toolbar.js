const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testToolbar() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-rwd-audit-toolbar';
  const remoteDebuggingPort = 9255;

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

    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await wait(400);

    // Scroll to #filterToolbar
    const toolbarMetrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const tb = document.getElementById('filterToolbar');
        if (tb) tb.scrollIntoView({ behavior: 'instant', block: 'center' });
        const sav = document.querySelector('.search-and-view');
        const fg = document.querySelector('.filter-group');
        const sb = document.querySelector('.search-box');
        const vtg = document.querySelector('.view-toggle-group');
        return {
          windowWidth: window.innerWidth,
          filterGroup: fg ? { right: fg.getBoundingClientRect().right, width: fg.getBoundingClientRect().width } : null,
          searchAndView: sav ? { right: sav.getBoundingClientRect().right, width: sav.getBoundingClientRect().width } : null,
          searchBox: sb ? { right: sb.getBoundingClientRect().right, width: sb.getBoundingClientRect().width } : null,
          viewToggle: vtg ? { right: vtg.getBoundingClientRect().right, width: vtg.getBoundingClientRect().width } : null
        };
      })()`,
      returnByValue: true
    });

    console.log('Mobile 375 Toolbar metrics:', JSON.stringify(toolbarMetrics.result.value, null, 2));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.resolve(__dirname, 'shot_toolbar_mobile_375.png'), Buffer.from(shot.data, 'base64'));

    ws.close();
  } catch (e) {
    console.error(e);
  } finally {
    edgeProcess.kill();
  }
}

testToolbar();
