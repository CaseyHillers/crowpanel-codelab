# Workshop hardware viewer — provenance and integration

This directory is a mixed-provenance reference asset, not an MIT relicensing of
all its contents. The containing application's license does not grant rights to
third-party hardware geometry. Enclosure physical fit has been verified by Casey
Hillers; this does not certify hardware operation or every board revision.

## Files and integration

- `viewer.html`: the original self-contained `VIEW-MODEL.html`, with a local
  stylesheet link, a local classic-script tag, a final newline and updated
  verified-fit/free-print notice. Eight embedded meshes,
  original attribution, Three.js vendor code and its full embedded MIT notice remain.
- `workshop.css` / `workshop.js`: workshop presentation and accessibility adapter.
- `story.html`: separate copy of the embedded model, with `story.css`, `story.js`,
  and `story-timeline.js` providing the guided welcome presentation. The full
  viewer remains available in the appendix, unchanged by the story controls.
- `THREEJS-LICENSE.txt`: unchanged supplied Three.js MIT notice.
- `front-view.png`: unchanged supplied **assembled case and stand** preview; not
  a bare-board photograph or rendering. It inherits the provenance uncertainties below.

Parent integration: use a base-aware URL ending in `hardware/viewer.html`, an
iframe title such as `CrowPanel hardware reference`, `sandbox="allow-scripts"`,
width `100%`, and height `600`. No same-origin permission, storage, network API,
parent access or postMessage is needed. CSS cannot inherit across this boundary;
the adapter mirrors the codelab's framed-sheet palette and system font locally.
Load the full viewer only on the appendix route, and the story only on welcome;
unload either on navigation to release its WebGL context.

The story uses the same scripts-only isolation, but accepts
`crowpanel-story-progress` messages with finite clamped progress and a boolean
reduced-motion preference, only from its parent window. The parent accepts
`crowpanel-story-ready` / `crowpanel-story-error` only from the story iframe.
Messages contain no code, credentials, device state, or electrical identification.
Illustrative screen content is not device output. Processor labels are omitted;
no Arm-based component has been verified for a highlight.

Child-only API: `window.workshopViewer.setMode(value)` accepts `board`, `assembly`,
`exploded`, `print`; `reset()` resets the current view; `.mode` reads the selection.
`window.workshopViewerReady` is true only after the adapter initializes;
`window.workshopViewerState` is `loading`, `ready`, or `fallback`.
The child emits `workshop-viewer-ready` on its own window, **not** on the parent.
The original `window.viewerReady` / `window.cadViewer` remain baseline internals:
they do not guarantee adapter readiness and can remain set after context loss.
Sandboxing intentionally prevents parent reads of these child globals. The parent
must not treat the iframe `load` event as proof of successful WebGL initialization.

Board mode hides front/back/feet and displays the actual embedded Elecrow hardware
mesh, not a simulation or a reconstructed schematic. Its screen is intentionally
blank. A neutral contrasting material aids visibility; colors are not component
identification or a claim about actual hardware materials. Assembled/exploded show
the case and two feet; print mode uses the supplied
STL print poses and disables hardware/transparency. Checkboxes and buttons are
native keyboard controls; the focusable model also supports arrow-key orbit,
plus/minus zoom, Home/R reset, pointer orbit, pinch/scroll zoom and shift/right-drag
pan. No component-identification or electrical labels are inferred from geometry.

WebGL initialization errors, runtime errors, context loss, and a 30-second startup
deadline fail closed to the local preview with disabled model controls. There is
no retry loop or remote fallback. Parent-level readiness/fallback is separate.

## Source package and notices retained

Imported from `crowpanel-20deg-desk-kit-2026-10-15`, locally inspected October 27,
2026. Original viewer SHA-256 before the two integration hooks:
`a031c0c13c2983770c45859baaf45348a78ac513abef3c8b807c9f8a189af651`.

### Original case: Lucas Souza

The source package's `SOURCE/README.md` line 19 describes the unmodified
`original-case-by-Lucas-Souza.scad` from Printables model **1566902** as
**"Creative Commons Public Domain"**. `PRINT-ME.md` line 49 attributes the adapted
case to Lucas Souza under the same description. The original SCAD contains no
embedded license grant. This audit could not independently retrieve the upstream
model's current license; do not silently promote this description to a verified
CC0 dedication or invent an attribution/share-alike obligation. Keep the author,
model identifier, source URL, quoted license description and modification history.

Original source: https://www.printables.com/model/1566902-case-for-crowpanel-213-epaper/files

Package changes: switch notch and USB opening, shorter snap-pin tips and added pin
clearance; two separate stand feet provide 20-degree backward tilt and 30 mm minimum
case lift. Stand design and case modifications were described as generated for the
original request. Casey Hillers confirms ownership of all included print files,
including the modified case and stand, and has provided owner permission to
distribute them: **the included STLs are free to download and share**. Preserve
upstream provenance and attributions; this permission does not waive attribution,
relicense the models as MIT, or cover third-party Elecrow reference geometry.
The original viewer application code's licensing remains separate from this STL
distribution permission. On October 28, 2026, Casey Hillers explicitly confirmed
having permission to publish both the original viewer application code and the
Elecrow-derived CAD mesh publicly with this codelab. This records the publisher's
confirmation, not an independent verification or a new license grant; preserve
the original provenance and notices.

### Hardware: Elecrow reference geometry

The viewer's hardware mesh is derived from Elecrow's official
`3D file/00-2-13_view_asm.stp`, used for fit/reference inspection. This is third-party
CAD-derived geometry, not a new MIT model. The source package supplies attribution
and a URL, **not an explicit hardware-geometry redistribution license**. Upstream
licensing was not independently verified. Publication proceeds on Casey Hillers's
explicit permission confirmation above, not an inference from public availability.
This does not relicense the geometry as MIT or establish rights beyond that
confirmed public distribution with the codelab.

Official source: https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/blob/master/3D%20file/00-2-13_view_asm.stp

### Three.js

Bundled Three.js identifies itself as version **0.160.1**, MIT, copyright
2010–2023 Three.js authors. Preserve its full copyright/permission/warranty notice
in `viewer.html` and keep `THREEJS-LICENSE.txt` with distributed copies. This
software license does not extend to the case, stand, hardware CAD or preview.

### Safety and fit notices

**Enclosure physical fit has been verified by Casey Hillers.** This supersedes
the original viewer's digital-check-only fit notice. Print one set and check fit
before making a batch. Hardware is a viewing reference, not a printable part. Use separate
print pieces rather than printing the assembly as one object. Dimensions are mm;
do not infer electrical, USB-driver or compatibility validation for other board
revisions from the meshes or this fit confirmation.

## Security, accessibility and size audit

No external scripts, fonts, CDN requests, telemetry, uploads, fetch, XHR, WebSocket,
storage, eval or parent messaging occur in the custom viewer/adapter. The original
inline scripts/styles and embedded Three.js remain executable trusted code. A
strict host CSP needs hashes/nonces for the two executable inline baseline scripts
and permission for local CSS/JS/images; `script-src 'self'` alone will block startup.
Do not add `allow-same-origin` to work around sandbox-origin restrictions. There
are no cross-origin module imports or fetch-based geometry loads.

The original is a standalone full-page document, not an importable component:
global THREE/state, generic element selectors, viewport CSS, resize handlers and
an animation loop make an isolated iframe preferable to injecting its HTML.
Original controls had native buttons/labels but no keyboard orbit, pressed-state
semantics or accessible failure preview. The adapter adds those. Geometry remains
visual; descriptions and viewpoints are not a complete nonvisual equivalent of CAD.
On narrow screens the model gets 42% height; controls and notices scroll below.
Notices remain available at all widths, unlike the baseline's hidden mobile notice.

Baseline sizes measured without dumping mesh coordinates:

- HTML: 5,037,866 bytes (4.80 MiB); embedded vendor script approximately 670 KB.
- Eight-mesh JSON: 4,350,524 bytes; base64 encodes already-gzipped buffers.
- Hardware alone: 4,067,592 base64 characters, 410,708 triangles (~81% of HTML).
- All source meshes: 443,120 triangles, 7,963,440 decoded buffer bytes, before
  normals, GPU buffers, temporary strings, shadow maps and canvas allocations.
- Whole baseline HTML: 3,424,355 gzip bytes / 3,354,007 Brotli bytes in local tests;
  these are measurements, not claims about the deployment server's compression.

Keep the payload out of the main app bundle, load it only on demand and preserve
all notices if extracting/compressing later. Hiding hardware does not save transfer
or decoding; all eight meshes currently decode at startup. For a future smaller
build, decimate hardware with provenance retained or remove its geometry entirely
if redistribution cannot be cleared. Do not call a simplified model "exact CAD".
