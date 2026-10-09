# OpenFlux

[English](README.md) | 日本語

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ktsujichan/openflux)

URL に変換パラメータを書いて画像を変換・配信するサーバです。
Cloudflare Workers + [Cloudflare Images binding](https://developers.cloudflare.com/images/transform-images/bindings/) で動きます。

```
https://img.example.com/w=400,l=(w=300%2fimages%2f1.png),f=webp:auto/bridge.jpg
```

- 拡大・縮小、クリッピング、フィルタ、画像・テキストのオーバーレイ、クリッピングマスク、URL 署名、キャッシュ API
- **AVIF / JPEG XL 出力** と **HEIC / AVIF / JPEG XL 入力** に対応
- URL の文法と変換結果の寸法は [ImageFlux](https://console.imageflux.jp/docs/) とおおむね互換 (詳細は [互換性](#互換性))

## セットアップ

ローカル開発は [Cloudflare CLI (`cf`)](https://developers.cloudflare.com/cf/) と `cloudflare.config.ts`、デプロイは wrangler と `wrangler.jsonc` を使います。
binding や `OPENFLUX_CONFIG` を変えるときは両方を揃えてください。

```sh
pnpm install
pnpm test            # ユニットテスト
pnpm lint            # oxlint
pnpm format          # oxfmt (チェックのみは pnpm format:check)
pnpm dev             # ローカル (Images はオフライン簡易版: resize/rotate/format のみ有効)
pnpm dev:remote      # cf dev --mode remote: Images binding だけ Cloudflare 上の本物につなぐ
pnpm run deploy      # wrangler deploy (pnpm deploy は pnpm 組み込みコマンドなので run が必要)
pnpm build:cf        # cf build (.cloudflare/output に出力)
pnpm deploy:cf       # cf deploy (cloudflare.config.ts を使う)
```

必要なもの:

- Node.js 22.18 以上 (`mise.toml` で 24 に固定)
- **Workers Paid プラン** (JPEG XL エンコードとフィルタで CPU 時間を使うため `limits.cpuMs` を 30 秒にしている)
- Cloudflare Images の有効化 (binding による変換はユニーク変換数で課金)
- Cache API を効かせるため、`workers.dev` ではなくカスタムドメインに割り当てる (`wrangler.jsonc` の `routes`、`cloudflare.config.ts` の `domains`)

シークレット (署名用シークレット、S3 キー、API トークン) は `npx wrangler secret put <NAME>` で登録します (`cf` の場合は `npx cf deploy --secrets-file secrets.json`)。

### オリジン設定 (`OPENFLUX_CONFIG`)

ホスト名ごとの取得先・署名・キャッシュなどの設定です。`cloudflare.config.ts` の `OPENFLUX_CONFIG: bindings.json({...})` に書きます。
シークレットは値を直接書かず、`bindings.secret()` で宣言した名前を `*Env` で参照します。
R2 をオリジンにする場合は `bindings.r2({ name: "<バケット名>" })` を追加し、その binding 名を `source.binding` に書きます。

```jsonc
{
  "origins": [
    {
      "hosts": ["img.example.com"], // 配信に使うホスト名。"*" は全ホスト
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
      "signedUrl": { "secretEnv": "SIGNING_SECRET" }, // URL 署名
      "defaultCacheSeconds": 600, // デフォルトキャッシュ
      "allowedParams": ["w", "h", "a", "f", "q"], // 上書き可能パラメータ
      "ipAccess": { "mode": "deny", "list": ["192.0.2.0/24"] },
      "pathParams": [{ "basePrefix": "/small/", "targetPrefix": "/", "params": "w=100", "lockParams": true }],
      "fonts": {
        "Noto Sans JP": "https://fonts.example.com/NotoSansJP-Regular.woff2",
        "Noto Sans JP:Bold": "https://fonts.example.com/NotoSansJP-Bold.woff2",
      }, // font=(Noto Sans JP,instance=Bold)
      "defaultFont": "Noto Sans JP",
      "strict": false, // 非対応機能を 400 にするか、無視するか
      "extendedInputs": true, // HEIC / AVIF / JXL 入力を変換するか
      "jxl": { "effort": 3, "maxPixels": 16000000 },
    },
  ],
}
```

署名付き URL の生成: `node scripts/sign.mjs <secret> "/w=200/images/1.jpg"`

### キャッシュ API

キャッシュの検索・削除用のエンドポイントです。`OPENFLUX_CONFIG` に `api` を追加し、トークンを secret で渡します。

```jsonc
"api": {
  "hosts": ["api.img.example.com"],          // このホストの /api/* で受け付ける (画像配信と同じゾーンに置く)
  "tokenEnv": "OPENFLUX_API_TOKEN",          // token パラメータと照合する secret 名
  "purge": { "zoneId": "<ZONE_ID>", "apiTokenEnv": "CF_PURGE_TOKEN" }  // 任意: Purge API で全データセンターから削除
}
```

```sh
curl -XPOST https://api.img.example.com/api/cache.lookup -d token=... --data-urlencode url=https://img.example.com/w=400/a.jpg
# {"ok":true,"urls":["https://img.example.com/w=400/a.jpg"]}
curl -XPOST https://api.img.example.com/api/cache.delete -d token=... --data-urlencode url=https://img.example.com/w=400/a.jpg
```

- `f=webp:auto` のような代替フォーマット指定の URL は、フォーマットごとのキャッシュ (`?__openflux_format=...` 付きのキー) もまとめて検索・削除します
- Cache API はデータセンターごとなので、`cache.lookup` と `purge` 未設定時の `cache.delete` は API リクエストを受けたデータセンターだけが対象です
- 認証エラーは `401 {"ok":false,"error":"invalid_auth"}` を返します

## 互換性

OpenFlux は [ImageFlux](https://console.imageflux.jp/docs/) の URL 文法を参考にしており、既存の URL がなるべくそのまま使えるようにしています。
寸法・切り抜き位置・オーバーレイ位置・フィルタは demo.imageflux.jp の実際の出力に合わせており、キャッシュ API は ImageFlux の (旧) キャッシュ API と同じ形です。
機能ごとの対応表は [COMPATIBILITY.ja.md](doc/COMPATIBILITY.ja.md) を参照してください。主な差異:

- テキストオーバーレイ `t=(...)`: モリサワフォントは使えないため `fonts` に自前のフォント URL を登録する。`dir` `wrap` `ellipsize` `justify` は未対応
- `f=mp4` は非対応 (400)、`o` / `s` は無視
- Exif Orientation は常に適用される (`ir=auto` 相当)
- 署名ヘッダは `X-ImageFlux-Signature` ではなく `X-OpenFlux-Signature`
- ピクセル単位の結果 (リサンプリング、JPEG/WebP エンコーダ) は libvips ベースの ImageFlux と完全には一致しない

### JPEG XL 出力

Cloudflare Images は JPEG XL を出力できないため、`f=jxl` は [jSquash](https://github.com/jamsinclair/jSquash) (libjxl の WASM 版) でエンコードします。

- CPU 時間を使うので **Workers Paid プランが前提** です。`jxl.effort` (既定 3) と `jxl.maxPixels` (既定 1600 万画素、超えると 400) で調整します
- 既定で表示できるブラウザは限られるため、`f=jxl` 単独ではなく **`f=jxl:avif:webp:jpg` のように代替フォーマット付きで使う** ことを推奨します

## 開発

コード構成、配信・変換処理の流れ、本番の Cloudflare Images で未検証の挙動は [ARCHITECTURE.ja.md](doc/ARCHITECTURE.ja.md) を参照してください。
