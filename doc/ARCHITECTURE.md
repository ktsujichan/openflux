# Architecture

English | [日本語](ARCHITECTURE.ja.md)

The code is split into directories by layer.
Dependencies point `index.ts` → `http` / `infrastructure` → `application` → `domain`, and `domain` performs no I/O.

| Directory              | Responsibility                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/params/`   | Parser that turns the parameter grammar (`w=400,l=(…)` etc.) into `Params`. Failures are a `Result` of `ParamError`                                                               |
| `src/domain/geometry/` | Computes output size (`ResizePlan`), crop area (`CropArea`), and overlay position                                                                                                 |
| `src/domain/image/`    | Input format detection, `Accept`-based negotiation, pixel math for filters / clipping masks / text line layout, font resolution, and the render port (`ImageRenderer`)            |
| `src/domain/config/`   | zod schema for `OPENFLUX_CONFIG` (types are derived from the schema). CIDRs and the path-parameter grammar are also validated when the config is loaded                           |
| `src/domain/delivery/` | Cache keys, `Cache-Control` decisions, ETag, and the cache port                                                                                                                   |
| `src/domain/access/`   | URL signing (HMAC-SHA256) and access-check errors                                                                                                                                 |
| `src/domain/source/`   | Origin path (`ObjectPath`), fetch results, and the fetch port (`SourceResolver`)                                                                                                  |
| `src/domain/shared/`   | Shared helpers: exhaustiveness check for discriminated unions (`assertNever`), and `schemaResult`, which turns a Standard Schema (zod) result into a `Result`                     |
| `src/application/`     | Workflows: image delivery (`serveImage`) and the cache API. `Result`s are composed with `safeTry`                                                                                 |
| `src/infrastructure/`  | Adapters: Cloudflare Images rendering, HTTP / S3 / R2 origins, Cache API, Purge API, WASM codecs, env validation                                                                  |
| `src/http/`            | Maps workflow errors (discriminated unions) to HTTP responses                                                                                                                     |
| `src/index.ts`         | Composition root. A [Hono](https://hono.dev/) app that validates env, routes requests, wires the adapters, and calls the workflows. Unexpected exceptions become 500 in `onError` |

Error handling:

- Failures where the caller chooses the response (bad parameters, signature mismatch, origin 404, etc.) are returned as `Result` errors (discriminated unions) and exhaustively mapped to responses with `switch` in `src/http/`
- Unexpected failures such as network errors or internal errors from the Images binding propagate as exceptions up to `index.ts` and become 500
- A misconfigured `OPENFLUX_CONFIG` is caught by startup validation and returns 500 `invalid configuration: …`

## Delivery flow

Requests are routed in `src/index.ts`, and image delivery is handled by the workflow in `src/application/serve-image.ts`.
If any step fails, an error containing only the status and a message is returned (`text/plain`, `Cache-Control: no-store`).

```mermaid
flowchart TD
    Req([Request]) --> Env{Validate<br>OPENFLUX_CONFIG}
    Env -- invalid --> E500[500 invalid configuration]
    Env -- OK --> Api{API host and<br>/api/*?}
    Api -- Yes --> CacheApi[[Cache API<br>cache.lookup / cache.delete]]
    Api -- No --> Method{GET / HEAD?}
    Method -- No --> E405[405]
    Method -- Yes --> Host{Origin config<br>for this host?}
    Host -- No --> E404[404 unknown host]

    subgraph Access [Access check]
        IP{IP allow/deny list} -- denied --> E403a[403 forbidden]
        IP -- allowed --> Sig{URL signature<br>sig / X-OpenFlux-Signature}
        Sig -- mismatch / missing --> E403b[403 signature]
    end
    Host -- Yes --> IP

    subgraph Params [Parameter resolution]
        PP[Apply path parameters<br>+ override with URL parameters] --> Allowed{lockParams /<br>allowedParams}
        Allowed -- violation --> E400a[400]
        Allowed -- OK --> Exp{expires}
        Exp -- expired --> E403c[403 already expired]
        Exp -- OK --> Neg[Choose output format<br>from f and Accept]
    end
    Sig -- OK --> PP

    Neg --> Cache{Cached in<br>Cache API?}
    Cache -- HIT --> Final
    Cache -- MISS --> Origin[Fetch from origin<br>HTTP / S3 / R2]
    Origin -- error --> EOrigin[Pass through origin status]
    Origin -- OK --> Trans{Any transform<br>parameters?}
    Trans -- No --> Pass[Return as is]
    Trans -- Yes --> Through{through matched or<br>unsupported input?}
    Through -- through --> Pass
    Through -- transform --> Render[Transform and encode<br>Cloudflare Images / WASM]
    Render -- failure --> E400b[400]
    Pass --> Store
    Render --> Store[Store in Cache API if cacheable<br>async via waitUntil]
    Store --> Final{If-None-Match<br>matches ETag?}
    Final -- Yes --> R304([304 Not Modified])
    Final -- No --> R200([200 image<br>no body for HEAD])
```

- The cache key is the request URL. With alternative-format specs such as `f=webp:auto`, each chosen format is stored under its own key and `Vary: Accept` is added
- Cache lifetime comes from the origin's `Cache-Control` / `Expires`, falling back to `defaultCacheSeconds`, and is capped at the `expires` parameter if present

## Transform pipeline

Transformation happens in `src/infrastructure/cloudflare-image-renderer.ts`, in the order: main transform → overlays → encode.
Colors show where each step runs (blue: Cloudflare Images, green: pixel processing in JS, orange: WebAssembly).

```mermaid
flowchart TD
    Src([Origin image]) --> IsJxl{JPEG XL input?}
    IsJxl -- Yes --> Dec[Decode JXL to PNG]:::wasm
    IsJxl -- No --> IR
    Dec --> IR

    subgraph Body [Main transform transformImage]
        IR["ir: rotate / flip input"]:::cf --> IC["ic / icr: crop input (trim)"]:::cf
        IC --> RS["Resize: w h a g u dpr b<br>(squeeze / cover / composite on background canvas)"]:::cf
        RS --> OC["oc / ocr: crop output (trim)"]:::cf
        OC --> OR["or: rotate / flip output"]:::cf
        OR --> HasF{Filters specified?}
        HasF -- Yes --> F["Extract pixels as PNG<br>unsharp / blur / grayscale etc."]:::js
    end

    subgraph Overlays [Overlays]
        Prep["Prepare (in parallel)<br>image l=(…): fetch from origin → same transform as main<br>text t=(…): draw each line with text() and place on canvas"]:::cf
        Prep --> Each{"One at a time in order<br>mask specified?"}
        Each -- No --> Draw["Composite with draw<br>(overflow is trimmed)"]:::cf
        Each -- Yes --> Mask["Extract composited pixels<br>cut alpha with the mask"]:::js
    end

    HasF -- No --> Prep
    F --> Prep
    Draw --> Fmt
    Mask --> Fmt

    subgraph Encode [Encode]
        Fmt{Output format}
        Fmt -- "jpeg / png / gif / webp / avif" --> Out["output()<br>jpeg is composited with b; lossless webp uses quality=100"]:::cf
        Fmt -- jxl --> Max{"Pixel count<br>≤ jxl.maxPixels?"}
        Max -- No --> E400[400]
        Max -- Yes --> Jxl["Extract pixels as PNG<br>encode to JPEG XL with jSquash"]:::wasm
    end

    Out --> Res([Result])
    Jxl --> Res

    classDef cf fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef js fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef wasm fill:#ffedd5,stroke:#ea580c,color:#7c2d12
```

All dimensions are computed up front in `src/domain/geometry/`, and explicit sizes are passed to Cloudflare Images via `fit: "squeeze"` / `"cover"` and `trim`.
Because nothing depends on the semantics of Cloudflare's `fit` modes (such as `scale-down`), rounding and output size are decided by the domain layer.

## Unverified items

The offline Images in `cf dev` only reproduces resize / rotate / format, so the following need to be checked against production Images (`pnpm dev:remote` or a deployment):

- Cropping with `trim`, `gravity: {x, y, mode: "remainder"}` with `fit: "cover"`, and composite positions with `draw()`
- The rotation direction of `rotate` (assumed clockwise), and the dimensions `info()` returns for JPEGs with Exif Orientation
- Text overlays in general (local Images does not support `text()`): the unit of `size`, and how much line spacing and strikethrough positions drift by font
- `purge` in the cache API (whether the Purge API removes Cache API entries)
- Whether `output({ format: "image/webp", quality: 100 })` is lossless
