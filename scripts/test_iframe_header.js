const { spawn } = require('child_process');

async function testHeaderIframe() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, ['--headless=new', '--remote-debugging-port=9577', 'about:blank']);
  await new Promise(r => setTimeout(r, 2000));
  const listRes = await fetch('http://127.0.0.1:9577/json/list');
  const pages = await listRes.json();
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const callbacks = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (callbacks.has(d.id)) callbacks.get(d.id)(d); };
  const send = (method, params = {}) => new Promise(r => { const msgId = id++; callbacks.set(msgId, r); ws.send(JSON.stringify({ id: msgId, method, params })); });

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'file:///C:/Users/user/.gemini/antigravity/scratch/yongzhen-learning-showcase/index.html' });
  await new Promise(r => setTimeout(r, 1500));

  await send('Runtime.evaluate', { expression: `document.getElementById('openFullscreenBtn').style.display = 'inline-flex';` });
  await new Promise(r => setTimeout(r, 500));

  const check = await send('Runtime.evaluate', {
    expression: `({ scrollW: document.documentElement.scrollWidth, docW: document.documentElement.offsetWidth, headerH: document.querySelector('.site-header').offsetHeight, brandW: document.querySelector('.brand').offsetWidth, actionsW: document.querySelector('.header-actions').offsetWidth })`,
    returnByValue: true
  });
  console.log('Result at 375px with Fullscreen button:', check.result.result.value);

  // Also test 320px
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 500));
  const check320 = await send('Runtime.evaluate', {
    expression: `({ scrollW: document.documentElement.scrollWidth, docW: document.documentElement.offsetWidth, headerH: document.querySelector('.site-header').offsetHeight, brandW: document.querySelector('.brand').offsetWidth, actionsW: document.querySelector('.header-actions').offsetWidth })`,
    returnByValue: true
  });
  console.log('Result at 320px with Fullscreen button:', check320.result.result.value);

  ws.close();
  edge.kill();
}
testHeaderIframe();
