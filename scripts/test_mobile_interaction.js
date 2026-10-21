const { spawn } = require('child_process');

async function testMobileInteractions() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new',
    '--remote-debugging-port=9599',
    '--user-data-dir=C:\\Users\\user\\.gemini\\antigravity\\scratch\\edge-test-interaction-profile',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 2000));
  const listRes = await fetch('http://127.0.0.1:9599/json/list');
  const pages = await listRes.json();
  const page = pages.find(p => p.type === 'page') || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const callbacks = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (callbacks.has(d.id)) callbacks.get(d.id)(d); };
  const send = (method, params = {}) => new Promise(r => { const msgId = id++; callbacks.set(msgId, r); ws.send(JSON.stringify({ id: msgId, method, params })); });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'file:///C:/Users/user/.gemini/antigravity/scratch/yongzhen-learning-showcase/index.html' });
  await new Promise(r => setTimeout(r, 2000));

  const results = {};

  // Step 1: Open Activity Modal via card click
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.activity-card')?.click();`
  });
  await new Promise(r => setTimeout(r, 600));

  const modalOpenRes = await send('Runtime.evaluate', {
    expression: `({
      modalOpen: document.getElementById('activityModal').classList.contains('open'),
      modalTitle: document.getElementById('modalTitle').textContent,
      bodyOverflow: document.body.style.overflow
    })`,
    returnByValue: true
  });
  results.modalOpen = modalOpenRes.result.result.value;

  // Step 2: Close Modal
  await send('Runtime.evaluate', {
    expression: `document.getElementById('modalCloseBtn')?.click();`
  });
  await new Promise(r => setTimeout(r, 400));
  const modalCloseRes = await send('Runtime.evaluate', {
    expression: `({
      modalOpen: document.getElementById('activityModal').classList.contains('open'),
      bodyOverflow: document.body.style.overflow
    })`,
    returnByValue: true
  });
  results.modalClosed = modalCloseRes.result.result.value;

  // Step 3: Switch to Gallery View
  await send('Runtime.evaluate', {
    expression: `document.querySelector('[data-view="gallery"]')?.click();`
  });
  await new Promise(r => setTimeout(r, 600));
  const galleryRes = await send('Runtime.evaluate', {
    expression: `({
      isGallery: document.getElementById('activitiesContainer').className.includes('gallery'),
      photoCount: document.querySelectorAll('.gallery-photo-item').length
    })`,
    returnByValue: true
  });
  results.galleryView = galleryRes.result.result.value;

  // Step 4: Open Lightbox from Gallery Photo
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.gallery-photo-item')?.click();`
  });
  await new Promise(r => setTimeout(r, 600));
  const lightboxOpenRes = await send('Runtime.evaluate', {
    expression: `({
      lightboxOpen: document.getElementById('lightboxModal').classList.contains('open'),
      counter: document.getElementById('lightboxCounter').textContent,
      bodyOverflow: document.body.style.overflow
    })`,
    returnByValue: true
  });
  results.lightboxOpen = lightboxOpenRes.result.result.value;

  // Step 5: Close Lightbox
  await send('Runtime.evaluate', {
    expression: `document.getElementById('lightboxCloseBtn')?.click();`
  });
  await new Promise(r => setTimeout(r, 400));
  const lightboxCloseRes = await send('Runtime.evaluate', {
    expression: `({
      lightboxOpen: document.getElementById('lightboxModal').classList.contains('open'),
      bodyOverflow: document.body.style.overflow
    })`,
    returnByValue: true
  });
  results.lightboxClosed = lightboxCloseRes.result.result.value;

  // Step 6: Test Hamburger Menu Drawer
  await send('Runtime.evaluate', {
    expression: `document.getElementById('mobileMenuBtn')?.click();`
  });
  await new Promise(r => setTimeout(r, 500));
  const drawerOpenRes = await send('Runtime.evaluate', {
    expression: `({
      drawerOpen: document.getElementById('mobileNavDrawer').classList.contains('open')
    })`,
    returnByValue: true
  });
  results.drawerOpen = drawerOpenRes.result.result.value;

  // Step 7: Close Drawer
  await send('Runtime.evaluate', {
    expression: `document.getElementById('mobileMenuBtn')?.click();`
  });
  await new Promise(r => setTimeout(r, 400));
  const drawerCloseRes = await send('Runtime.evaluate', {
    expression: `({
      drawerOpen: document.getElementById('mobileNavDrawer').classList.contains('open')
    })`,
    returnByValue: true
  });
  results.drawerClosed = drawerCloseRes.result.result.value;

  console.log('Mobile Interaction Audit Results:');
  console.log(JSON.stringify(results, null, 2));

  ws.close();
  edge.kill();
}
testMobileInteractions();
