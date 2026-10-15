# RIVL mark

The approved Trail Ribbon concept 01 vector in `assets/icon.svg` is the master. The app icon is its opaque 1024-pixel PNG rendering; iOS supplies the outer mask.

The mark combines a solid forward-slanting R, an open counter and a narrow cut suggesting a route through the letter. Signal Coral #FF4B35 (RGB 255/75/53) and Ink #101114 (RGB 16/17/20) remain the identity. Warm #F5F4EF (RGB 245/244/239) is the reversed mark. The native wordmark uses bold italic system lettering.

HSL equivalents: Coral 6.53°/100%/60.39%; Ink 225°/11.11%/7.06%; Warm 50°/23.08%/94.90%.

Use the mark at 24 logical pixels or larger in app interfaces. The 16/32 pixel exports are favicon-only; the narrow cut may disappear at those sizes while the R silhouette remains. Keep clear space equal to one eighth of the symbol height; never stretch, crop the R, add shadows, recolor outside the palette, or place the transparent mark over a busy photo without a solid backing.

`light` is Ink on a light surface, `dark` is Warm on an Ink surface, and `monochrome` is for single-colour reproduction. PNG exports are 16, 32, 64, 128, 256, and 512 pixels. `favicon.ico` contains 16 and 32 pixel PNG images. Run `node scripts/render-logo.mjs` to regenerate all exports from the vector master.
