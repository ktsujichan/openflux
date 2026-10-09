# ImageFlux / OpenFlux Feature Compatibility

English | [日本語](COMPATIBILITY.ja.md)

Support status of [ImageFlux's image transformation features](https://console.imageflux.jp/docs/) in this repository (OpenFlux: Cloudflare Workers + Cloudflare Images).

Legend:

- ✅ Supported
- ⚠️ Partially supported / behaves differently
- ❌ Not supported
- — Not applicable

Meaning of the "Verified" column:

- **Measured**: unit tests confirm the result matches values measured from actual demo.imageflux.jp output
- **Local**: behavior confirmed with `cf dev` (local Images)
- **Needs prod**: uses processing that local Images does not reproduce, so it needs checking against production Cloudflare Images (`pnpm dev:remote` or a deployment)

Last updated: 2026-10-09

## Summary

|                        | Of ImageFlux's features                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Supported           | Resize, crop, rotate/flip, filters, image overlay, clipping mask, output (except MP4), URL signing, delivery expiry, origin config, cache management API               |
| ⚠️ Partial / different | Text overlay (some fonts and typesetting), default Exif Orientation handling, `lossless` `o` `s`, Host header override, signature header name (`X-OpenFlux-Signature`) |
| ❌ Not supported       | MP4 output, text `dir` `wrap` `ellipsize` `justify` and Noto fallback, the new cache API (only the legacy API is implemented), WordPress plugin, live video streaming  |

## URL format

| Feature                                                 | ImageFlux                    | OpenFlux                     | Verified | Notes                                                                                           |
| ------------------------------------------------------- | ---------------------------- | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Transform parameters at the path start (`/w=400/a.jpg`) | ✅                           | ✅                           | Local    |                                                                                                 |
| `,` separator / `%2C` `%2c` separator                   | ✅                           | ✅                           | Measured |                                                                                                 |
| `/c/` `/c!/` prefix                                     | ✅                           | ✅                           | Measured | Also matches in fetching the origin's `/c/a.jpg` when there are no parameters, as in `/c/a.jpg` |
| Duplicate parameters                                    | ✅ last wins                 | ✅ last wins                 | —        |                                                                                                 |
| URL without parameters                                  | ✅ serves the original as is | ✅ serves the original as is | Local    |                                                                                                 |
| 400 for unknown parameters / invalid values             | ✅                           | ✅                           | Measured | Messages are matched where feasible                                                             |

## Resize

| Parameter               | Description                          | ImageFlux | OpenFlux | Verified              | Notes                                                                    |
| ----------------------- | ------------------------------------ | --------- | -------- | --------------------- | ------------------------------------------------------------------------ |
| `w` `h`                 | Output size                          | ✅        | ✅       | Measured              | Rounding (half up) when only one is given also matches                   |
| `a=0`                   | scale (fit inside)                   | ✅        | ✅       | Measured              |                                                                          |
| `a=1`                   | force-scale (default)                | ✅        | ✅       | Measured              |                                                                          |
| `a=2`                   | crop (fill and crop)                 | ✅        | ✅       | Measured / Needs prod | Dimensions match. Crop position depends on Cloudflare's `gravity`        |
| `a=3`                   | pad (fill margins with background)   | ✅        | ✅       | Measured / Local      | Reproduces compositing of transparent areas with the background color    |
| `b`                     | Background color (RRGGBB / RRGGBBAA) | ✅        | ✅       | Measured              |                                                                          |
| `g`                     | Gravity (1–9)                        | ✅        | ✅       | Measured              |                                                                          |
| `u=0`                   | Disallow upscaling                   | ✅        | ✅       | Measured              | Per-`a` details also match (a=1/2 clamp each axis; a=3 keeps the canvas) |
| `dpr`                   | Device Pixel Ratio (0–5)             | ✅        | ✅       | Measured              |                                                                          |
| Max output size 16383px |                                      | ✅ 400    | ✅ 400   | Measured              |                                                                          |

## Crop

| Parameter             | Description                     | ImageFlux | OpenFlux | Verified              | Notes                                                                    |
| --------------------- | ------------------------------- | --------- | -------- | --------------------- | ------------------------------------------------------------------------ |
| `ic` / `icr`          | Crop before resize (px / ratio) | ✅        | ✅       | Measured / Needs prod | Area computation matches. Cloudflare's `trim` is ignored by local Images |
| `ig`                  | Gravity for crop before resize  | ✅        | ✅       | Measured              |                                                                          |
| `oc` `c` / `ocr` `cr` | Crop after resize               | ✅        | ✅       | Measured / Needs prod | Reversed coordinates (x2 < x1) and overflow outside the image also match |
| `og`                  | Gravity for crop after resize   | ✅        | ✅       | Measured              |                                                                          |

## Rotate / flip

| Parameter                         | Description               | ImageFlux   | OpenFlux          | Verified              | Notes                                                                    |
| --------------------------------- | ------------------------- | ----------- | ----------------- | --------------------- | ------------------------------------------------------------------------ |
| `ir` (1–8)                        | Rotate/flip before resize | ✅          | ✅                | Measured / Needs prod | Assumes Cloudflare rotates clockwise                                     |
| `or` `r` (1–8)                    | Rotate/flip after resize  | ✅          | ✅                | Measured / Needs prod | Same as above                                                            |
| `ir=auto` `or=auto`               | Apply Exif Orientation    | ✅          | ✅                | Needs prod            |                                                                          |
| Default Exif Orientation handling |                           | Not applied | ⚠️ Always applied | Needs prod            | Cloudflare Images always applies it, so it always behaves like `ir=auto` |

## Filters

| Parameter    | Description   | ImageFlux | OpenFlux | Verified      | Notes                                                               |
| ------------ | ------------- | --------- | -------- | ------------- | ------------------------------------------------------------------- |
| `unsharp`    | Unsharp mask  | ✅        | ✅       | Local         | Implemented in JS with the same formula as ImageMagick's `-unsharp` |
| `blur`       | Gaussian blur | ✅        | ✅       | Local         | Implemented in JS                                                   |
| `grayscale`  | Grayscale     | ✅        | ✅       | Measured (±1) | Same matrix as CSS Filter Effects                                   |
| `sepia`      | Sepia         | ✅        | ✅       | Measured (±1) | Same as above                                                       |
| `brightness` | Brightness    | ✅        | ✅       | Measured (±1) |                                                                     |
| `contrast`   | Contrast      | ✅        | ✅       | Measured (±1) |                                                                     |
| `invert`     | Invert        | ✅        | ✅       | Measured      |                                                                     |
| Filter order |               | ✅        | ✅       | Measured      | unsharp/blur → grayscale → sepia → brightness → contrast → invert   |

## Overlays

| Parameter                               | Description                                   | ImageFlux | OpenFlux | Verified           | Notes                                                                                                                                     |
| --------------------------------------- | --------------------------------------------- | --------- | -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `l=(...)`                               | Image overlay (with transform parameters)     | ✅        | ✅       | Local / Needs prod | Multiple overlays, composited in the given order                                                                                          |
| `x` `y` `xr` `yr` `lg`                  | Overlay position                              | ✅        | ✅       | Measured           | Offset mirroring for right/bottom gravities and clipping of overflow also match                                                           |
| `l` `lx` `ly` `lxr` `lyr` `lg` (legacy) | Image overlay                                 | ✅        | ✅       | Measured           |                                                                                                                                           |
| `t=(...)`                               | Text overlay                                  | ✅        | ⚠️       | Needs prod         | Each line is drawn with Cloudflare Images' `text()` and laid out by OpenFlux. `text()` does not work in local Images. See the table below |
| Clipping mask accuracy                  |                                               |           |          | Local              | Alpha difference between `cf dev` and demo.imageflux.jp output averages 0.03 (max 23, due to downscaling the mask image)                  |
| `mask=alpha`                            | Clipping mask by alpha                        | ✅        | ✅       | Measured / Local   | Output alpha = base alpha × mask alpha. A mask without alpha is treated as `white`                                                        |
| `mask=white` `mask=black`               | Clipping mask by luminance                    | ✅        | ✅       | Measured / Local   | Uses Rec.709 luminance in linear RGB, converted back to sRGB, as alpha (inverted for black)                                               |
| `mask=…:0` `mask=…:1`                   | Outside of the mask (transparent / unchanged) | ✅        | ✅       | Measured / Local   |                                                                                                                                           |
| Text as a mask (`t=(mask=…)`)           |                                               | ✅        | ✅       | Needs prod         | Text rendering only works in production                                                                                                   |

### Text overlay details

Text rendering (`text()`) does not work in local Images, so all rendering results need production checks.
"Measured" means the layout formulas are tested against values measured on demo.imageflux.jp.

| Parameter                         | Description                               | ImageFlux               | OpenFlux | Verified              | Notes                                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------- | ----------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`                            | Text to draw (may contain `%0A` newlines) | ✅                      | ✅       | Needs prod            | Each line is drawn separately and stacked                                                                                                                                                 |
| `font`                            | Font                                      | ✅ Morisawa fonts, etc. | ⚠️       | Needs prod            | Morisawa fonts are not available. Register font file URLs (TTF/OTF/WOFF/WOFF2) in the `fonts` setting                                                                                     |
| `font=(name,instance=…)`          | Named instance of a variable font         | ✅                      | ⚠️       | Needs prod            | Only font files registered in `fonts` under a `"name:instance"` key can be used                                                                                                           |
| `font=(name,var=tag:value)`       | Variable font axes                        | ✅                      | ⚠️       | Needs prod            | Only value combinations registered in `fonts` under keys like `"name:wght=700"` (multiple axes `,`-separated in tag order) can be used. Arbitrary values are not supported                |
| Unregistered font / instance      |                                           | —                       | ⚠️       | —                     | Drawn with the default font and reported in `X-OpenFlux-Ignored` (400 with `strict: true`)                                                                                                |
| Fallback (Noto)                   | Characters not in the font                | ✅                      | ❌       | —                     | Per-character coverage cannot be determined                                                                                                                                               |
| `size`                            | Font size                                 | ✅                      | ⚠️       | Needs prod            | Both ImageFlux and Cloudflare appear to use pt, but matching rendered size is unconfirmed                                                                                                 |
| `f`                               | Text color                                | ✅                      | ✅       | Needs prod            |                                                                                                                                                                                           |
| `b`                               | Background color of the text area         | ✅                      | ✅       | Needs prod            |                                                                                                                                                                                           |
| `w` `h`                           | Size of the text area                     | ✅                      | ✅       | Needs prod            | Overflow is clipped                                                                                                                                                                       |
| `align`                           | Left / center / right alignment           | ✅                      | ✅       | Measured / Needs prod | Applied per line                                                                                                                                                                          |
| `linespacing`                     | Line spacing                              | ✅                      | ✅       | Measured / Needs prod | 0 gives the natural line advance; otherwise natural advance × 2 × linespacing (negative overlaps upward). The natural advance is derived from the drawn line height, so it varies by font |
| `strike`                          | Strikethrough                             | ✅                      | ✅       | Measured / Needs prod | A line in the text color at 60% of each line's height, about 1/20 of the line height thick (measured with Ryumin R-KL)                                                                    |
| `dir`                             | Writing direction                         | ✅                      | ❌       | —                     |                                                                                                                                                                                           |
| `wrap` `ellipsize` `justify`      | Wrapping / ellipsis / justification       | ✅                      | ❌       | —                     | Glyph widths cannot be measured                                                                                                                                                           |
| `oc` `ocr` `og` `or`              | Crop / rotate the text area               | ✅                      | ✅       | Needs prod            |                                                                                                                                                                                           |
| Position (`x` `y` `xr` `yr` `lg`) |                                           | ✅                      | ✅       | Measured              | Same computation as image overlays                                                                                                                                                        |
| `mask`                            | Use the text as a mask                    | ✅                      | ✅       | Needs prod            |                                                                                                                                                                                           |

## Output

| Parameter                                      | Description                               | ImageFlux     | OpenFlux          | Verified   | Notes                                                                                                            |
| ---------------------------------------------- | ----------------------------------------- | ------------- | ----------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `f=auto`                                       | Same format as input                      | ✅            | ✅                | Local      | HEIC input is output as JPEG, JPEG XL input as JPEG XL                                                           |
| `f=jpg` `jpeg`                                 | JPEG                                      | ✅            | ✅                | Local      |                                                                                                                  |
| `f=png`                                        | PNG                                       | ✅            | ✅                | Local      |                                                                                                                  |
| `f=gif`                                        | GIF                                       | ✅            | ✅                | Local      |                                                                                                                  |
| `f=webp`                                       | WebP                                      | ✅            | ✅                | Local      |                                                                                                                  |
| `f=mp4`                                        | MP4 (H.264)                               | ✅            | ❌ 400            | —          | The Images binding has no video output                                                                           |
| `f=webp:auto` `webp:jpg` `webp:png` `webp:gif` | Alternative format via Accept             | ✅            | ✅                | Local      | Adds `Vary: Accept`                                                                                              |
| `f=avif`                                       | AVIF                                      | ❌            | ✅                | Needs prod |                                                                                                                  |
| `f=jxl`                                        | JPEG XL                                   | ❌            | ✅                | Local      | Encoded with a WASM build of libjxl. Confirmed that the output decodes                                           |
| `f=jxl:avif:webp:jpg` etc.                     | Multi-step alternative formats            | ❌            | ✅                | Local      | Picks the first candidate the Accept header allows; the last candidate is used unconditionally                   |
| `q`                                            | Quality (0–100, default 75)               | ✅            | ✅                | —          | Applies to JPEG / WebP / AVIF / JPEG XL                                                                          |
| `lossless`                                     | Lossless WebP                             | ✅            | ⚠️                | Needs prod | Passes quality=100 to Cloudflare; whether it is lossless needs a production check. Lossless JPEG XL is supported |
| `o`                                            | JPEG Huffman optimization                 | ✅            | ⚠️ Ignored        | —          | Not controllable on Cloudflare                                                                                   |
| `s=1` `s=2`                                    | Exif handling                             | ✅            | ⚠️ Ignored        | —          | Follows Cloudflare's default (Exif is mostly stripped)                                                           |
| Background compositing (`b`)                   | When converting to a format without alpha | ✅            | ✅                | Local      |                                                                                                                  |
| Animated GIF                                   | Only the first frame is processed         | ✅            | ✅                | —          |                                                                                                                  |
| `anim=1`                                       | Keep the animation when transforming      | ❌            | ✅                | Needs prod |                                                                                                                  |
| Pixel-level quality                            | Resampling / encoders                     | libvips-based | Cloudflare Images | —          | Does not match exactly                                                                                           |

## Format exclusion and input formats

| Item                                | ImageFlux | OpenFlux | Notes                                                                   |
| ----------------------------------- | --------- | -------- | ----------------------------------------------------------------------- |
| `through=jpg/png/gif/webp/bmp/heic` | ✅        | ✅       |                                                                         |
| `through=auto`                      | ✅        | ✅       | The `extendedInputs` setting changes what counts as "not transformable" |
| `through=avif` `jxl` `svg`          | ❌        | ✅       |                                                                         |
| JPEG / PNG / GIF / WebP input       | ✅        | ✅       |                                                                         |
| HEIC input                          | ❌        | ✅       | Decoded by Cloudflare Images                                            |
| AVIF input                          | ❌        | ✅       | Enterprise plan only, due to a Cloudflare limitation                    |
| JPEG XL input                       | ❌        | ✅       | Decoded with WASM                                                       |
| 400 for unsupported input           | ✅        | ✅       |                                                                         |

## URL signing and delivery expiry

| Item                                             | ImageFlux            | OpenFlux              | Verified | Notes                                                               |
| ------------------------------------------------ | -------------------- | --------------------- | -------- | ------------------------------------------------------------------- |
| `sig` parameter (HMAC-SHA256, `1.` + Base64URL)  | ✅                   | ✅                    | Measured | Reproduces both signature examples in the docs. Padding is optional |
| `X-ImageFlux-Signature` header                   | ✅                   | ❌                    | —        | The same signature is accepted in the `X-OpenFlux-Signature` header |
| 403 for missing / invalid signature              | ✅                   | ✅                    | —        |                                                                     |
| `expires` (RFC3339 UTC)                          | ✅                   | ✅                    | Measured | 403 once expired; 400 for non-UTC                                   |
| `Cache-Control` / `Expires` capped at the expiry | ✅                   | ✅                    | —        |                                                                     |
| Signing sample code                              | ✅ (PHP / Ruby / Go) | ✅ `scripts/sign.mjs` | —        |                                                                     |

## Origin config

| Item                                                                     | ImageFlux     | OpenFlux                                   | Notes                                                                   |
| ------------------------------------------------------------------------ | ------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| HTTP origin (Scheme / Host / Path Prefix)                                | ✅            | ✅                                         |                                                                         |
| Host header override                                                     | ✅            | ⚠️                                         | Uses Workers' `resolveOverride`, so it only works within the same zone  |
| S3 API origin (Amazon S3 / Sakura Object Storage / GCS)                  | ✅            | ✅                                         |                                                                         |
| R2 origin                                                                | ❌            | ✅                                         | Via binding                                                             |
| Default cache (`s-maxage`, `must-revalidate`)                            | ✅            | ✅                                         |                                                                         |
| Overridable parameters                                                   | ✅            | ✅                                         |                                                                         |
| IP allow / deny list (IPv4, CIDR)                                        | ✅            | ✅                                         | IPv6 clients are denied with an allow list and allowed with a deny list |
| Path parameters (Base Prefix / Target Prefix / Parameter, longest match) | ✅            | ✅                                         |                                                                         |
| Disallow overriding / changing parameters                                | ✅            | ✅                                         |                                                                         |
| Whether unsupported features return 400 or are ignored                   | —             | ✅ `strict`                                |                                                                         |
| JPEG XL encoding settings                                                | —             | ✅ `jxl.effort` / `jxl.maxPixels`          |                                                                         |
| How to configure                                                         | Admin console | `cloudflare.config.ts` (applied on deploy) |                                                                         |
| Duplicating origins / descriptions                                       | ✅            | ⚠️                                         | Duplicate in the config file. `description` is for documentation only   |

## Delivery, caching, and operations

| Item                                                                    | ImageFlux | OpenFlux | Verified   | Notes                                                                                                                                                        |
| ----------------------------------------------------------------------- | --------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Caching transform results                                               | ✅        | ✅       | —          | Cache API (requires a custom domain)                                                                                                                         |
| Inheriting origin `Cache-Control` / `Expires` / `Last-Modified`         | ✅        | ✅       | Local      |                                                                                                                                                              |
| Weak `ETag` and 304 via `If-None-Match`                                 | ✅        | ✅       | Measured   | Confirmed that ImageFlux also returns 304                                                                                                                    |
| Error responses (text/plain, `no-store`), pass-through of origin status | ✅        | ✅       | Measured   |                                                                                                                                                              |
| Cache API `cache.lookup`                                                | ✅        | ✅       | Local      | `POST /api/cache.lookup` with `token` and `url`; returns `{"ok": true, "urls": [...]}`. Only sees the cache of the data center that received the API request |
| Cache API `cache.delete`                                                | ✅        | ✅       | Local      | Without `purge` configured, only deletes from the data center that received the API request                                                                  |
| Propagating `cache.delete` to all data centers                          | ✅        | ⚠️       | Needs prod | With `api.purge` set, Cloudflare's Purge API (by URL) is also called. Whether the Purge API removes Cache API entries needs checking                         |
| Caching per alternative format                                          | —         | ✅       | Local      | For URLs like `f=webp:auto`, per-format cache entries (keys with `?__openflux_format=…`) are looked up and deleted together                                  |
| Authentication with an API token                                        | ✅        | ✅       | Local      | A wrong token returns `401 {"ok":false,"error":"invalid_auth"}`                                                                                              |
| New cache API (ImageFlux API reference)                                 | ✅        | ❌       | —          | Only the legacy API is implemented                                                                                                                           |
| Custom domains and SSL certificates                                     | ✅        | ✅       | —          | Cloudflare custom domains (`domains`)                                                                                                                        |
| Statistics dashboard                                                    | ✅        | ⚠️       | —          | Use Workers Logs / Analytics instead                                                                                                                         |
| Admin console, user / API token permissions                             | ✅        | —        | —          | Covered by Cloudflare account features                                                                                                                       |
| WordPress plugin                                                        | ✅        | ❌       | —          |                                                                                                                                                              |
| Live video streaming (WebRTC / RTMP / HLS / WHIP)                       | ✅        | ❌       | —          | Out of scope                                                                                                                                                 |
