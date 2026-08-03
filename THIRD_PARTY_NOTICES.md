# Third-party notices

This file distinguishes assets shipped by the WeChat Mini Game build from
dependencies and references used only by the source Web project.

## Three.js (shipped)

The hangar models and the single-Canvas WebGL renderer use Three.js.

- Project: three.js
- Source: https://github.com/mrdoob/three.js
- Copyright: Copyright (c) 2010-2026 three.js authors
- License: MIT
- Packaged license: `node_modules/three/LICENSE`

## On The Offensive (shipped)

The optional `audio-extra` subpackage contains `8-bit Theme - On The
Offensive`.

- Author: Ted Kerr (OpenGameArt user Wolfgang_)
- Source: https://opengameart.org/content/8-bit-theme-on-the-offensive
- License: CC0 1.0 Universal
- License text: https://creativecommons.org/publicdomain/zero/1.0/
- Distributed file: `subpackages/audio-extra/assets/on-the-offensive.ogg`

## ZzFX (source baseline record, not shipped as library code)

The source Web version used ZzFX-derived sample synthesis. The Mini Game keeps
the event names and retro sound direction but uses its own WebAudio oscillator
envelopes in `src/audio/audio-manager.js`; it does not bundle the ZzFX sample
generator.

- Project: ZzFX, Zuper Zmall Zound Zynth
- Source: https://github.com/KilledByAPixel/ZzFX
- Copyright: Copyright (c) 2019 Frank Force
- License: MIT

## Lucide (source baseline record, not shipped)

The source Web interface used Lucide icons. The Mini Game renders controls on
the Canvas and does not include the `lucide` package in `package.json` or in
the production bundle.

- Project: Lucide
- Source: https://github.com/lucide-icons/lucide
- License: ISC

## Fighter reference images (source-only, excluded from build)

Reduced aircraft reference images remain under `assets/fighters/` for visual
comparison with the source project. The build script does not copy them into
`dist/`; the game uses procedural Three.js fighter models instead. Known
external references are documented in `docs/FIGHTER_IMAGE_CREDITS.md`.

## Commercial-game asset exclusion

The project does not distribute original audio, melodies, logos, models,
characters, or animation files from Nintendo, Konami, Contra, Transformers,
or other commercial games. Retro sound presets and fighter mechanics in this
project are original configurations.
