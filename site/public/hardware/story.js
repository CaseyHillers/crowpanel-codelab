(() => {
  'use strict';

  const viewport = document.querySelector('#scene');
  const loading = document.querySelector('#loading');
  const fallback = document.querySelector('#story-fallback');
  const timeline = globalThis.CrowPanelStoryTimeline;
  const events = new AbortController();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let requested = { progress: 0, reducedMotion: false };
  let viewer;
  let display;
  let displayCanvas;
  let displayTexture;
  let screenContent;
  let resizeObserver;
  let visibilityObserver;
  let frame = 0;
  let stopped = false;
  let ready = false;
  let inView = true;

  window.crowpanelStoryState = 'loading';

  function notify(type) {
    if (window.parent !== window) window.parent.postMessage({ type }, '*');
  }

  function disposeScene() {
    const geometries = new Set();
    const materials = new Set();
    if (typeof scene !== 'undefined') scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
      if (object.shadow) object.shadow.dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    displayTexture?.dispose();
    if (typeof renderer !== 'undefined') renderer.dispose();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    window.storyStopped = true;
    clearTimeout(deadline);
    cancelAnimationFrame(frame);
    frame = 0;
    events.abort();
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    disposeScene();
  }

  function showFallback() {
    if (stopped) return;
    stop();
    window.crowpanelStoryState = 'fallback';
    viewport.hidden = true;
    loading.hidden = true;
    fallback.hidden = false;
    notify('crowpanel-story-error');
  }

  function createDisplay() {
    displayCanvas = document.createElement('canvas');
    displayCanvas.width = 750;
    displayCanvas.height = 366;
    displayTexture = new THREE.CanvasTexture(displayCanvas);
    displayTexture.colorSpace = THREE.SRGBColorSpace;
    displayTexture.minFilter = THREE.LinearFilter;
    displayTexture.generateMipmaps = false;
    const screenSurface = { left: -21.65, right: 26.9, bottom: 6.05, top: 29.76, depth: 1 };
    const edgeInset = .13;
    display = new THREE.Mesh(new THREE.PlaneGeometry(screenSurface.right - screenSurface.left - edgeInset * 2,
      screenSurface.top - screenSurface.bottom - edgeInset * 2), new THREE.MeshBasicMaterial({ map: displayTexture }));
    const lean = Math.PI / 9;
    const depth = screenSurface.depth - .02;
    const height = (screenSurface.bottom + screenSurface.top) / 2;
    display.name = 'Illustrative screen, not live device output';
    display.rotation.x = Math.PI / 2 - lean;
    display.position.set((screenSurface.left + screenSurface.right) / 2,
      (depth + .5) * Math.cos(lean) + height * Math.sin(lean),
      30 + 16.8 * Math.sin(lean) - (depth + .5) * Math.sin(lean) + height * Math.cos(lean));
    viewer.mesh.hardware.add(display);
  }

  function paintDisplay(content) {
    if (screenContent === content) return;
    const context = displayCanvas.getContext('2d');
    if (!context) throw new Error('Screen illustration unavailable');
    context.fillStyle = '#f6f6ef';
    context.fillRect(0, 0, 750, 366);
    context.fillStyle = '#181c1b';
    context.textBaseline = 'top';
    if (content === 'hello') {
      context.font = 'bold 76px monospace';
      context.fillText('Hello,', 32, 97);
      context.fillText('world!', 32, 181);
    } else if (content === 'slideshow') {
      context.beginPath();
      context.moveTo(32, 282);
      context.lineTo(180, 115);
      context.lineTo(278, 220);
      context.lineTo(380, 86);
      context.lineTo(540, 282);
      context.closePath();
      context.fill();
      context.beginPath();
      context.arc(602, 113, 42, 0, Math.PI * 2);
      context.fill();
    } else {
      context.font = 'bold 82px monospace';
      context.fillText('67 F', 32, 101);
      context.font = '100px "Apple Symbols", "Segoe UI Symbol", sans-serif';
      context.fillText('☀︎', 540, 84);
      context.font = '32px monospace';
      context.fillText('Sabre Springs', 32, 231);
    }
    displayTexture.needsUpdate = true;
    screenContent = content;
  }

  function fitStory(state, width, height) {
    const boardBounds = viewer.mesh.hardware.geometry.boundingBox.clone().translate(viewer.mesh.hardware.position);
    const framing = boardBounds.clone();
    if (state.shellOpacity > 0) {
      for (const key of ['front', 'back', 'foot1', 'foot2']) {
        framing.union(viewer.mesh[key].geometry.boundingBox.clone().translate(viewer.mesh[key].position));
      }
    }
    framing.getCenter(target);
    yaw = state.yaw;
    pitch = state.pitch;
    scale = 120;
    updateCamera();
    viewer.camera.updateMatrixWorld(true);
    const projected = new THREE.Box3();
    for (const horizontal of [framing.min.x, framing.max.x]) {
      for (const depth of [framing.min.y, framing.max.y]) {
        for (const vertical of [framing.min.z, framing.max.z]) {
          projected.expandByPoint(new THREE.Vector3(horizontal, depth, vertical).applyMatrix4(viewer.camera.matrixWorldInverse));
        }
      }
    }
    const size = projected.getSize(new THREE.Vector3());
    const portrait = width <= 700;
    const usableWidth = width * (portrait ? .88 : .54);
    const usableHeight = height * (portrait ? .43 : .72);
    scale = Math.max(size.y * height / usableHeight, size.x * height / usableWidth) * 1.12;
    updateCamera();
    viewer.camera.projectionMatrix.elements[12] += portrait ? 0 : .4;
    viewer.camera.projectionMatrix.elements[13] += portrait ? (height <= 740 ? .33 : .23) : 0;
    viewer.camera.projectionMatrixInverse.copy(viewer.camera.projectionMatrix).invert();
  }

  function render() {
    frame = 0;
    if (!ready || stopped || document.hidden || !inView) return;
    try {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const state = timeline.storyState(requested.progress, requested.reducedMotion || motionPreference.matches);
      const lean = Math.PI / 9;
      viewer.mesh.hardware.position.set(0, -Math.cos(lean) * state.boardSlide, Math.sin(lean) * state.boardSlide);
      viewer.mesh.hardware.material.color.setHex(0x687a80).lerp(new THREE.Color(0x1b6c80), state.highlight);
      viewer.mesh.hardware.material.emissive.setHex(0x1b6c80);
      viewer.mesh.hardware.material.emissiveIntensity = state.highlight * .18;
      for (const key of ['front', 'back', 'foot1', 'foot2']) {
        const model = viewer.mesh[key];
        model.visible = state.shellOpacity > 0;
        model.material.transparent = state.shellOpacity < 1;
        model.material.opacity = state.shellOpacity;
        model.material.depthWrite = state.shellOpacity === 1;
        model.position.set(0, 0, 0);
        if (key === 'front' || key === 'back') {
          const direction = key === 'front' ? -1 : 1;
          model.position.set(0, direction * Math.cos(lean) * state.shellSeparation,
            -direction * Math.sin(lean) * state.shellSeparation);
        } else model.position.z = state.feetDrop;
        goals[key].copy(model.position);
      }
      goals.hardware.copy(viewer.mesh.hardware.position);
      viewer.scene.getObjectByName('story-desk').visible = state.deskVisible;
      for (const model of Object.values(viewer.printMesh)) model.visible = false;
      paintDisplay(state.screen);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (viewer.renderer.getPixelRatio() !== pixelRatio) viewer.renderer.setPixelRatio(pixelRatio);
      const size = viewer.renderer.getSize(new THREE.Vector2());
      if (size.x !== width || size.y !== height) viewer.renderer.setSize(width, height, false);
      fitStory(state, width, height);
      viewer.renderer.render(viewer.scene, viewer.camera);
      dirty = false;
    } catch {
      showFallback();
    }
  }

  function schedule() {
    if (ready && !stopped && !frame && !document.hidden && inView) frame = requestAnimationFrame(render);
  }

  function initialize() {
    if (ready || stopped || !window.viewerReady) return;
    try {
      if (!timeline) throw new Error('Story timeline unavailable');
      viewer = window.cadViewer;
      viewer.renderer.setClearColor(0xf9fbfc);
      viewer.renderer.domElement.setAttribute('aria-hidden', 'true');
      viewer.renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        showFallback();
      }, { signal: events.signal });
      viewer.mesh.front.material.color.setHex(0x397f7c);
      viewer.mesh.back.material.color.setHex(0x5c9690);
      const rearLight = new THREE.DirectionalLight(0xffffff, 2);
      rearLight.position.set(-40, 160, 100);
      viewer.scene.add(rearLight);
      createDisplay();
      ready = true;
      render();
      if (stopped) return;
      clearTimeout(deadline);
      loading.hidden = true;
      window.crowpanelStoryState = 'ready';
      notify('crowpanel-story-ready');
    } catch {
      showFallback();
    }
  }

  const deadline = setTimeout(showFallback, 30000);
  window.addEventListener('message', event => {
    if (event.source !== window.parent || window.parent === window) return;
    const message = timeline?.readProgressMessage(event.data);
    if (!message) return;
    requested = message;
    schedule();
  }, { signal: events.signal });
  window.addEventListener('crowpanel-cad-ready', initialize, { signal: events.signal });
  window.addEventListener('crowpanel-cad-error', showFallback, { signal: events.signal });
  window.addEventListener('error', showFallback, { signal: events.signal });
  window.addEventListener('unhandledrejection', showFallback, { signal: events.signal });
  window.addEventListener('resize', schedule, { signal: events.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  }, { signal: events.signal });
  motionPreference.addEventListener('change', schedule, { signal: events.signal });
  window.addEventListener('pagehide', () => {
    stop();
    window.crowpanelStoryState = 'stopped';
    viewport.hidden = true;
    loading.hidden = true;
    fallback.hidden = false;
  }, { once: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted && stopped) notify('crowpanel-story-error');
  });
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(viewport);
  }
  if (typeof IntersectionObserver !== 'undefined') {
    visibilityObserver = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView) schedule();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    visibilityObserver.observe(viewport);
  }
  if (window.viewerError || typeof THREE === 'undefined') showFallback();
  else initialize();
})();
