import { bindings, defineConfig } from "cf/config";

// Connect the Images binding to the real one on Cloudflare only with `cf dev --mode remote`
// (local Images only emulates resize / rotate / format)
export default defineConfig(({ mode }) => ({
  worker: {
    name: "openflux",
    compatibilityDate: "2026-10-01",
    entrypoint: "src/index.ts",
    // JPEG XL encoding and filters are CPU-intensive, so raise the limit (requires the Workers Paid plan)
    limits: { cpuMs: 30000 },
    observability: { enabled: true },
    // Domain used for image delivery (the Cache API does not work on workers.dev)
    // domains: ["img.example.com"],
    env: {
      IMAGES: bindings.images({ dev: { remote: mode === "remote" } }),
      // To use R2 as the origin, bind the bucket and put its name in source.binding of OPENFLUX_CONFIG
      // IMAGES_BUCKET: bindings.r2({ name: "my-images" }),
      // Declare signing secrets and S3 keys as secrets; pass the values with `cf deploy --secrets-file`
      // SIGNING_SECRET: bindings.secret(),
      // Token for the cache API (cache.lookup / cache.delete)
      // OPENFLUX_API_TOKEN: bindings.secret(),
      OPENFLUX_CONFIG: bindings.json({
        // To enable the cache API (with purge, the Purge API removes entries from all data centers)
        // api: { hosts: ["api.img.example.com"], tokenEnv: "OPENFLUX_API_TOKEN", purge: { zoneId: "<ZONE_ID>", apiTokenEnv: "CF_PURGE_TOKEN" } },
        origins: [
          {
            hosts: ["*"],
            // Sample images from Lorem Picsum, e.g. /w=400/id/10/1200/800. Replace with your own origin
            description: "sample (Lorem Picsum)",
            source: { kind: "http", scheme: "https", host: "picsum.photos", pathPrefix: "/" },
            defaultCacheSeconds: 600,
            // Fonts for text overlays. Register variable fonts as "name:instance" or "name:wght=700"
            // fonts: {
            //   "Noto Sans JP": "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.3.0/files/noto-sans-jp-japanese-400-normal.woff2",
            //   "Noto Sans JP:Bold": "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.3.0/files/noto-sans-jp-japanese-700-normal.woff2",
            // },
            // defaultFont: "Noto Sans JP",
          },
        ],
      }),
    },
  },
}));
