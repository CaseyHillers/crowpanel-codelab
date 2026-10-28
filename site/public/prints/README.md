# CrowPanel 2.13 case and 20° desk stand

These three STL files are byte-for-byte copies from `PRINT/` in the local
`crowpanel-20deg-desk-kit-2026-10-15` source package. No bulk plates, 3MF files,
CAD assemblies, or reference hardware are included.

## Print one kit

| File | Quantity | Supplied print orientation |
| --- | ---: | --- |
| `case-front-switch-slot.stl` | 1 | Front/bezel flat on bed; open rear upward |
| `case-back-switch-slot.stl` | 1 | Outside back flat on bed; pins upward |
| `stand-20deg-print-two.stl` | 2 | Broad side flat on bed; 6 mm high |

Use **millimetres (mm) at 100% scale**. Import the parts as separate objects
and duplicate the stand once: both feet are **identical, not mirrored**.
Keep the supplied flat orientations. The source suggests PLA, a 0.4 mm nozzle,
0.20 mm layers, 3 walls, 5 top/bottom layers, 20% gyroid infill, and no supports
or raft as starting settings; select profiles for your actual printer and plate.

**Enclosure physical fit has been verified by Casey Hillers.** This confirmation
does not establish compatibility with every board revision, extra acrylic layer,
printer, or material. Print and fit one complete kit before a batch;
do not force the case closed or the device into the stand. Both feet's tall
rear support lips face the back of the display; seat the case evenly in both.

## Provenance and license evidence

- Imported from the supplied package
  `crowpanel-20deg-desk-kit-2026-10-15/PRINT/`.
  Instructions and evidence were read from the package's `PRINT-ME.md`,
  `SOURCE/README.md`, and source headers.
- The original case is by **Lucas Souza**, Printables model **1566902**:
  https://www.printables.com/model/1566902-case-for-crowpanel-213-epaper/files
  `PRINT-ME.md` ("What changed") and `SOURCE/README.md` describe that original
  as listed under **Creative Commons Public Domain**; `SOURCE/build_kit.py`
  also credits Souza and describes the original as Public Domain. This records
  the supplied package's attribution, not independent verification of the
  upstream license or its exact legal instrument.
- `SOURCE/README.md` says the new separate stand and case modifications were
  generated for the source request. Casey Hillers confirms ownership of all
  included print files, including the modified case and stand, and has provided
  owner permission to distribute them. **The included STLs are free to download
  and share.** This permission does not waive attribution or establish new license
  terms; preserve the original upstream provenance and attributions.
- The package cites Elecrow's official CAD as a hardware inspection reference:
  https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/blob/master/3D%20file/00-2-13_view_asm.stp
  That reference hardware is not included here.
- The source package's `THREEJS-LICENSE.txt` is an MIT notice for **Three.js
  0.160.1 and its authors**, used by its viewer, not a license grant for these
  printable models. These STLs are **not relicensed as MIT** by this import,
  and no repository-wide license is asserted to cover them. The owner's free
  distribution permission is separate from the viewer's software license and
  does not establish additional modification rights.

## Integrity

`SHA256SUMS` covers exactly the three imported STL files. From this directory,
verify with `shasum -a 256 -c SHA256SUMS` (or `sha256sum -c SHA256SUMS`).
