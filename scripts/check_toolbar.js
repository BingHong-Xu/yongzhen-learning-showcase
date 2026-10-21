const { spawn } = require('child_process');
const fs = require('fs');

async function checkToolbarTablets() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-toolbar-profile';
  const port = 9566;

  const edge = spawn(edgePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
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
    const localFileUrl = 'file:///C:/Users/user/.gemini/antigravity/scratch/yongzhen-learning-showcase/index.html';
    
    for (const w of [768, 820, 900, 1024]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false
      });
      await send('Page.navigate', { url: localFileUrl });
      await new Promise(r => setTimeout(r, 1200));

      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const tb = document.querySelector('.toolbar-section');
          const inner = document.querySelector('.toolbar-inner');
          const filterGrp = document.querySelector('.filter-group');
          const searchView = document.querySelector('.search-and-view');
          const navLinks = document.querySelector('.nav-links');
          const hamburger = document.querySelector('.mobile-menu-btn');
          return {
            width: window.innerWidth,
            toolbarHeight: tb ? tb.offsetHeight : 0,
            innerWrap: inner ? window.getComputedStyle(inner).flexWrap : '',
            filterGrpW: filterGrp ? filterGrp.offsetWidth : 0,
            searchViewW: searchView ? searchView.offsetWidth : 0,
            navLinksVisible: navLinks ? window.getComputedStyle(navLinks).display !== 'none' : false,
            hamburgerVisible: hamburger ? window.getComputedStyle(hamburger).display !== 'none' : false
          };
        })()`,
        returnByValue: true
      });
      console.log('Viewport ' + w + ':', res.result.value);
    }
    ws.close();
  } catch (e) {
    console.error(e);
  } finally {
    edge.kill();
  }
}
checkToolbarTablets();
