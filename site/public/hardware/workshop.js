(() => {
  'use strict';

  const viewport = document.querySelector('#scene');
  const sidebar = document.querySelector('aside');
  const modes = document.querySelector('.segmented');
  const hardwareToggle = document.querySelector('#hardware');
  const transparentToggle = document.querySelector('#transparent');
  const statusElement = document.querySelector('#status');
  let currentMode = 'board';
  let failed = false;
  let viewer;

  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', '3D hardware reference. Arrow keys orbit, plus and minus zoom, Home resets.');
  statusElement.setAttribute('role', 'status');
  statusElement.setAttribute('aria-live', 'polite');
  const boardButton = document.createElement('button');
  boardButton.dataset.mode = 'board';
  boardButton.textContent = 'Board';
  modes.prepend(boardButton);
  document.querySelector('[data-mode="assembly"]').textContent = 'Assembled';
  document.querySelector('.panel-title').replaceChildren('Explore the hardware');
  document.querySelector('.micro').append(' ', Object.assign(document.createElement('a'), {
    href: './README.md', textContent: 'Provenance and permissions',
  }));

  const cameraGroup = document.createElement('div');
  cameraGroup.className = 'group camera-controls';
  const keyboardHelp = document.createElement('p');
  keyboardHelp.id = 'keyboard-help';
  keyboardHelp.textContent = 'Drag to orbit; scroll or pinch to zoom. Focus the model: arrows orbit, + / − zoom, Home resets.';
  viewport.setAttribute('aria-describedby', keyboardHelp.id);
  const actions = [
    ['Turn left', 'ArrowLeft'], ['Tilt up', 'ArrowUp'], ['Turn right', 'ArrowRight'],
    ['Zoom in', '+'], ['Tilt down', 'ArrowDown'], ['Zoom out', '-'],
  ];
  for (const [label, key] of actions) {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => navigate(key));
    cameraGroup.append(button);
  }
  cameraGroup.append(keyboardHelp);
  sidebar.insertBefore(cameraGroup, sidebar.querySelector('.note'));

  function fallback() {
    if (failed) return;
    failed = true;
    window.workshopViewerReady = false;
    window.workshopViewerState = 'fallback';
    viewport.hidden = true;
    document.querySelector('#loading').hidden = true;
    for (const control of sidebar.querySelectorAll('button, input')) control.disabled = true;
    const preview = document.createElement('section');
    preview.id = 'fallback';
    preview.setAttribute('role', 'status');
    const image = document.createElement('img');
    image.src = './front-view.png';
    image.alt = 'Static front preview of the CrowPanel case supported by two separate stand feet.';
    const message = document.createElement('p');
    message.textContent = 'Interactive 3D is unavailable. This static preview shows the case and stand, not a bare-board view.';
    preview.append(image, message);
    document.body.append(preview);
    statusElement.textContent = 'Static preview. Interactive controls unavailable.';
  }

  function fitBoard(reset = false) {
    if (reset) { yaw = .68; pitch = .4; }
    const bounds = viewer.mesh.hardware.geometry.boundingBox;
    const size = bounds.getSize(new THREE.Vector3());
    bounds.getCenter(target);
    scale = Math.max(size.y, size.z, size.x / (viewport.clientWidth / viewport.clientHeight)) * 1.8;
    updateCamera();
  }

  function resetView() {
    if (currentMode === 'board') fitBoard(true);
    else viewer.fit(true);
    setPresetState(null);
  }

  function setPresetState(selected) {
    for (const button of document.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === selected));
    }
  }

  function selectMode(nextMode) {
    if (!['board', 'assembly', 'exploded', 'print'].includes(nextMode)) return;
    currentMode = nextMode;
    viewer.layout(nextMode === 'board' ? 'assembly' : nextMode);
    if (nextMode === 'board') {
      for (const [key, model] of Object.entries(viewer.mesh)) {
        model.visible = key === 'hardware';
        model.position.set(0, 0, 0);
      }
      hardwareToggle.disabled = true;
      transparentToggle.disabled = true;
      fitBoard(true);
    }
    for (const button of document.querySelectorAll('[data-mode]')) {
      const active = button.dataset.mode === nextMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    setPresetState(null);
    statusElement.textContent = nextMode === 'board'
      ? 'Elecrow hardware reference from imported CAD. Display shown blank.'
      : { assembly: 'Case and two feet assembled. Physical fit verified.', exploded: 'Case and stand parts separated for inspection.', print: 'Four print pieces in supplied print orientations. Hardware hidden.' }[nextMode];
    dirty = true;
  }

  function navigate(key) {
    if (!viewer || failed) return false;
    if (key === 'Home' || key.toLowerCase() === 'r') { resetView(); return true; }
    if (key === 'ArrowLeft') yaw -= .16;
    else if (key === 'ArrowRight') yaw += .16;
    else if (key === 'ArrowUp') pitch = Math.min(1.56, pitch + .12);
    else if (key === 'ArrowDown') pitch = Math.max(-1.48, pitch - .12);
    else if (key === '+' || key === '=') scale = Math.max(30, scale / 1.15);
    else if (key === '-' || key === '_') scale = Math.min(500, scale * 1.15);
    else return false;
    updateCamera();
    setPresetState(null);
    return true;
  }

  viewport.addEventListener('keydown', event => {
    if (!event.ctrlKey && !event.metaKey && !event.altKey && navigate(event.key)) event.preventDefault();
  });
  viewport.addEventListener('pointerdown', () => setPresetState(null));
  viewport.addEventListener('dblclick', () => { if (viewer && !failed) resetView(); });
  window.addEventListener('resize', () => {
    if (viewer && !failed && currentMode === 'board') fitBoard();
  });

  window.workshopViewerReady = false;
  window.workshopViewerState = 'loading';
  window.addEventListener('error', fallback);
  window.addEventListener('unhandledrejection', fallback);
  const deadline = performance.now() + 30000;
  function initialize() {
    if (failed) return;
    if (window.viewerError || performance.now() > deadline) { fallback(); return; }
    if (!window.viewerReady) { requestAnimationFrame(initialize); return; }
    viewer = window.cadViewer;
    viewer.renderer.setClearColor(0xf9fbfc);
    viewer.mesh.hardware.material.color.setHex(0x687a80);
    viewport.querySelector('canvas').setAttribute('aria-hidden', 'true');
    viewport.querySelector('canvas').addEventListener('webglcontextlost', event => {
      event.preventDefault();
      fallback();
    });
    for (const button of document.querySelectorAll('[data-mode]')) {
      button.onclick = () => selectMode(button.dataset.mode);
    }
    for (const button of document.querySelectorAll('[data-view]')) {
      button.onclick = () => {
        viewer.preset(button.dataset.view);
        if (currentMode === 'board') fitBoard();
        setPresetState(button.dataset.view);
      };
    }
    document.querySelector('#reset').onclick = resetView;
    selectMode('board');
    window.workshopViewer = { setMode: selectMode, reset: resetView, get mode() { return currentMode; } };
    window.workshopViewerReady = true;
    window.workshopViewerState = 'ready';
    window.dispatchEvent(new Event('workshop-viewer-ready'));
  }
  initialize();
})();
