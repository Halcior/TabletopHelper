# Original background asset

The panoramic outpost art was generated specifically for this implementation with the built-in **imagegen** tool on 2026-10-20. No reference-screen pixels, faction portraits, game logos, insignia or official terrain images were used as input. The four supplied mockups guided the visual direction of the HTML/CSS interface only.

The original generated panorama was inspected, then resized and encoded as WebP at quality 78. No UI or controls are painted into the image. The production copies are:

| File | Dimensions | Bytes |
| --- | --- | --- |
| `src/assets/outpost-panorama.webp` | 1920 × 640 | 67,076 |
| `src/assets/outpost-panorama-mobile.webp` | 960 × 320 | 23,800 |

The existing `src/assets/tactical-map.svg` remains a separate decorative layer. `src/components/ui/FormatGlyph.tsx` contains new original tactical symbols drawn in SVG code. The actual board is never replaced with a bitmap.

## Generation prompt

> Use case: stylized-concept. Asset type: original panoramic background artwork for an offline-first tabletop tactical application, NOT an app mockup. Create one premium atmospheric panoramic matte painting, roughly 3:1 composition, of a deserted futuristic relay outpost built of angular dark concrete, worn steel and antenna masts, in a ruined rocky industrial valley. Architectural silhouettes and broken gantries towards the right; quieter atmospheric negative space at left and top, usable behind real HTML headings. Near-black graphite and petrol blue/teal palette, restrained cold cyan haze, tiny warm amber lights in a few openings. Distant mountains and a very faint moon. Cinematic realistic materials, fine surface detail but low contrast, broad soft fog, luminous yet DARK overall so white UI text can read. Foreground fades naturally to near black along bottom. This is ONLY a landscape/environment texture. No text, letters, labels, grid, UI, buttons, cards, smartphone frame, soldiers, characters, vehicles, weapons, logos, emblems, insignia, skulls, wings or recognizable franchise designs. All architecture must be original generic industrial science fiction, with flat and angular functional silhouettes instead of Gothic cathedrals. Wide landscape panoramic framing, visually finished art, no vignette borders baked in.

Mode: built-in imagegen, opaque background. The original remains outside the production bundle; the two optimized project copies above are used by CSS. Background gradients preserve the dark shell if image decoding or loading fails.
