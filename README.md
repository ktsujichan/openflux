# OpenFlux

English | [日本語](README.ja.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ktsujichan/openflux)

An image server that transforms and delivers images based on transformation parameters written in the URL.
It runs on Cloudflare Workers + the [Cloudflare Images binding](https://developers.cloudflare.com/images/transform-images/bindings/).

```
https://img.example.com/w=400,l=(w=300%2fimages%2f1.png),f=webp:auto/bridge.jpg
```

- Resizing, cropping, filters, image and text overlays, clipping masks, URL signing, and a cache API
- **AVIF / JPEG XL output** and **HEIC / AVIF / JPEG XL input**
- URL grammar and output dimensions are largely compatible with [ImageFlux](https://console.imageflux.jp/docs/) (see [Compatibility](#compatibility))

## Setup

Local development uses the [Cloudflare CLI (`cf`)](https://developers.cloudflare.com/cf/) with `cloudflare.config.ts`; deploys use wrangler with `wrangler.jsonc`.
Keep the two in sync when you change bindings or `OPENFLUX_CONFIG`.

```sh
pnpm install
pnpm test            # unit tests
pnpm lint            # oxlint
pnpm format          # oxfmt (check only: pnpm format:check)
pnpm dev             # local (offline Images: only resize/rotate/format work)
pnpm dev:remote      # cf dev --mode remote: only the Images binding talks to real Cloudflare
pnpm run deploy      # wrangler deploy (`run` is required because `pnpm deploy` is a built-in pnpm command)
pnpm build:cf        # cf build (outputs to .cloudflare/output)
pnpm deploy:cf       # cf deploy (uses cloudflare.config.ts)
```

Requirements:

- Node.js 22.18 or later (pinned to 24 in `mise.toml`)
- **Workers Paid plan** (`limits.cpuMs` is set to 30 seconds because JPEG XL encoding and filters use CPU time)
- Cloudflare Images enabled (binding transformations are billed per unique transformation)
- A custom domain rather than `workers.dev`, so the Cache API takes effect (`routes` in `wrangler.jsonc`, `domains` in `cloudflare.config.ts`)

Secrets (signing secrets, S3 keys, API tokens) are set with `npx wrangler secret put <NAME>` (with `cf`: `npx cf deploy --secrets-file secrets.json`).

### Origin config (`OPENFLUX_CONFIG`)

Per-hostname settings for the fetch source, signing, caching, and more. Write them in `OPENFLUX_CONFIG: bindings.json({...})` in `cloudflare.config.ts`.
Secrets are not written directly; reference a name declared with `bindings.secret()` via the `*Env` fields.
To use R2 as an origin, add `bindings.r2({ name: "<bucket name>" })` and put that binding name in `source.binding`.

```jsonc
{
  "origins": [
    {
      "hosts": ["img.example.com"], // hostnames to serve; "*" matches all hosts
      "source": {
        "kind": "http",
        "scheme": "https",
        "host": "www.example.com",
        "pathPrefix": "/images",
        "hostHeader": "origin.example.com",
      },
      // "source": { "kind": "s3", "region": "ap-northeast-1", "bucket": "my-bucket", "endpoint": "s3.isk01.sakurastorage.jp",
      //             "accessKeyIdEnv": "S3_KEY_ID", "secretAccessKeyEnv": "S3_SECRET" },
      // "source": { "kind": "r2", "binding": "IMAGES_BUCKET" },
      "signedUrl": { "secretEnv": "SIGNING_SECRET" }, // URL signing
      "defaultCacheSeconds": 600, // default cache lifetime
      "allowedParams": ["w", "h", "a", "f", "q"], // parameters that may be overridden
      "ipAccess": { "mode": "deny", "list": ["192.0.2.0/24"] },
      "pathParams": [{ "basePrefix": "/small/", "targetPrefix": "/", "params": "w=100", "lockParams": true }],
      "fonts": {
        "Noto Sans JP": "https://fonts.example.com/NotoSansJP-Regular.woff2",
        "Noto Sans JP:Bold": "https://fonts.example.com/NotoSansJP-Bold.woff2",
      }, // font=(Noto Sans JP,instance=Bold)
      "defaultFont": "Noto Sans JP",
      "strict": false, // whether unsupported features return 400 or are ignored
      "extendedInputs": true, // whether to transform HEIC / AVIF / JXL input
      "jxl": { "effort": 3, "maxPixels": 16000000 },
    },
  ],
}
```

Generating a signed URL: `node scripts/sign.mjs <secret> "/w=200/images/1.jpg"`

### Cache API

Endpoints for looking up and deleting cache entries. Add `api` to `OPENFLUX_CONFIG` and pass the token as a secret.

```jsonc
"api": {
  "hosts": ["api.img.example.com"],          // accepted at /api/* on this host (put it in the same zone as image delivery)
  "tokenEnv": "OPENFLUX_API_TOKEN",          // name of the secret compared against the token parameter
  "purge": { "zoneId": "<ZONE_ID>", "apiTokenEnv": "CF_PURGE_TOKEN" }  // optional: delete from all data centers via the Purge API
}
```

```sh
curl -XPOST https://api.img.example.com/api/cache.lookup -d token=... --data-urlencode url=https://img.example.com/w=400/a.jpg
# {"ok":true,"urls":["https://img.example.com/w=400/a.jpg"]}
curl -XPOST https://api.img.example.com/api/cache.delete -d token=... --data-urlencode url=https://img.example.com/w=400/a.jpg
```

- For URLs with alternative-format specs such as `f=webp:auto`, the per-format cache entries (keys with `?__openflux_format=...`) are looked up and deleted together
- The Cache API is per data center, so `cache.lookup`, and `cache.delete` without `purge` configured, only affect the data center that received the API request
- Authentication errors return `401 {"ok":false,"error":"invalid_auth"}`

## Compatibility

OpenFlux follows the URL grammar of [ImageFlux](https://console.imageflux.jp/docs/) so that existing URLs work as-is wherever possible.
Dimensions, crop and overlay positions, and filters are matched against output measured on demo.imageflux.jp, and the cache API has the same shape as ImageFlux's (legacy) cache API.
See [COMPATIBILITY.md](doc/COMPATIBILITY.md) for the per-feature table. Main differences:

- Text overlays `t=(...)`: Morisawa fonts are not available, so register your own font URLs in `fonts`. `dir` `wrap` `ellipsize` `justify` are unsupported
- `f=mp4` is unsupported (400), and `o` / `s` are ignored
- Exif Orientation is always applied (equivalent to `ir=auto`)
- Signature header is `X-OpenFlux-Signature` instead of `X-ImageFlux-Signature`
- Pixel-level results (resampling, JPEG/WebP encoders) do not exactly match libvips-based ImageFlux

### JPEG XL output

`f=jxl` is encoded with [jSquash](https://github.com/jamsinclair/jSquash) (a WASM build of libjxl), since Cloudflare Images cannot output JPEG XL.

- It uses CPU time, so the **Workers Paid plan is required**. Tune with `jxl.effort` (default 3) and `jxl.maxPixels` (default 16 million pixels; larger returns 400)
- Few browsers display it by default, so **use it with fallbacks such as `f=jxl:avif:webp:jpg`** rather than `f=jxl` alone

## Development

See [ARCHITECTURE.md](doc/ARCHITECTURE.md) for the code layout, the delivery and transform flows, and behavior still to be verified against production Cloudflare Images.
