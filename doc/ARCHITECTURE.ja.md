# 構成

[English](ARCHITECTURE.md) | 日本語

層ごとにディレクトリを分けています。
依存の向きは `index.ts` → `http` / `infrastructure` → `application` → `domain` で、`domain` は I/O を持ちません。

| ディレクトリ           | 役割                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/params/`   | 変換パラメータの文法 (`w=400,l=(…)` など) を `Params` にするパーサ。失敗は `ParamError` の `Result`                                                                       |
| `src/domain/geometry/` | 出力サイズ (`ResizePlan`)・切り抜き領域 (`CropArea`)・オーバーレイ位置の計算                                                                                              |
| `src/domain/image/`    | 入力フォーマット判定、`Accept` による出し分け、フィルタ・クリッピングマスク・テキスト行配置の画素計算、フォント解決、変換のポート (`ImageRenderer`)                       |
| `src/domain/config/`   | `OPENFLUX_CONFIG` の zod スキーマ (型はスキーマから導出)。CIDR やパスパラメータの文法も設定の読み込み時に検証する                                                         |
| `src/domain/delivery/` | キャッシュキー・`Cache-Control` の決定・ETag、キャッシュのポート                                                                                                          |
| `src/domain/access/`   | URL 署名 (HMAC-SHA256) とアクセス判定のエラー                                                                                                                             |
| `src/domain/source/`   | オリジンのパス (`ObjectPath`)・取得結果、取得のポート (`SourceResolver`)                                                                                                  |
| `src/domain/shared/`   | 共通部品: 判別共用体の網羅性チェック (`assertNever`)、Standard Schema (zod) の検証結果を `Result` にする `schemaResult`                                                   |
| `src/application/`     | ワークフロー: 画像配信 (`serveImage`) とキャッシュ API。`safeTry` で `Result` を合成する                                                                                  |
| `src/infrastructure/`  | アダプタ: Cloudflare Images による変換、HTTP / S3 / R2 オリジン、Cache API、Purge API、WASM コーデック、env の検証                                                        |
| `src/http/`            | ワークフローのエラー (判別共用体) を HTTP 応答に対応付ける                                                                                                                |
| `src/index.ts`         | コンポジションルート。[Hono](https://hono.dev/) アプリで env の検証・ルーティングを行い、アダプタを組み立ててワークフローを呼ぶ。予期しない例外は `onError` で 500 にする |

エラーの扱い:

- パラメータの誤り・署名不一致・オリジンの 404 など、呼び出し側が応答を選ぶ失敗は `Result` のエラー (判別共用体) で返し、`src/http/` で `switch` により網羅的に応答へ対応付ける
- 通信障害や Images binding の内部エラーなど予期しない失敗は例外のまま `index.ts` まで伝え、500 にする
- 設定 (`OPENFLUX_CONFIG`) の誤りは起動時の検証で 500 `invalid configuration: …` になる

## 配信の流れ

リクエストは `src/index.ts` で振り分けられ、画像配信は `src/application/serve-image.ts` のワークフローで処理されます。
途中で失敗した場合は、ステータスとメッセージだけのエラー (`text/plain`, `Cache-Control: no-store`) を返します。

```mermaid
flowchart TD
    Req([リクエスト]) --> Env{OPENFLUX_CONFIG<br>の検証}
    Env -- 不正 --> E500[500 invalid configuration]
    Env -- OK --> Api{API ホストかつ<br>/api/*}
    Api -- Yes --> CacheApi[[キャッシュ API<br>cache.lookup / cache.delete]]
    Api -- No --> Method{GET / HEAD?}
    Method -- No --> E405[405]
    Method -- Yes --> Host{ホスト名に対応する<br>オリジン設定がある?}
    Host -- No --> E404[404 unknown host]

    subgraph Access [アクセス判定]
        IP{IP 許可/拒否リスト} -- 拒否 --> E403a[403 forbidden]
        IP -- 許可 --> Sig{URL 署名<br>sig / X-OpenFlux-Signature}
        Sig -- 不一致・なし --> E403b[403 signature]
    end
    Host -- Yes --> IP

    subgraph Params [パラメータ解決]
        PP[パスパラメータ適用<br>+ URL パラメータを上書き] --> Allowed{lockParams /<br>allowedParams}
        Allowed -- 違反 --> E400a[400]
        Allowed -- OK --> Exp{expires}
        Exp -- 期限切れ --> E403c[403 already expired]
        Exp -- OK --> Neg[f と Accept から<br>出力フォーマットを決定]
    end
    Sig -- OK --> PP

    Neg --> Cache{Cache API に<br>キャッシュあり?}
    Cache -- HIT --> Final
    Cache -- MISS --> Origin[オリジン取得<br>HTTP / S3 / R2]
    Origin -- エラー --> EOrigin[オリジンのステータスを透過]
    Origin -- OK --> Trans{変換パラメータあり?}
    Trans -- No --> Pass[そのまま返す]
    Trans -- Yes --> Through{through 指定や<br>非対応入力?}
    Through -- through --> Pass
    Through -- 変換 --> Render[変換・エンコード<br>Cloudflare Images / WASM]
    Render -- 失敗 --> E400b[400]
    Pass --> Store
    Render --> Store[キャッシュ可能なら<br>Cache API に保存<br>waitUntil で非同期]
    Store --> Final{If-None-Match<br>が ETag と一致?}
    Final -- Yes --> R304([304 Not Modified])
    Final -- No --> R200([200 画像<br>HEAD なら本文なし])
```

- キャッシュキーはリクエスト URL。`f=webp:auto` などの代替フォーマット指定では、選ばれたフォーマットごとに別キーで保存し `Vary: Accept` を付けます
- キャッシュ期間はオリジンの `Cache-Control` / `Expires`、なければ `defaultCacheSeconds` で決まり、`expires` パラメータがあればその期限までに制限されます

## 変換処理の流れ

変換は `src/infrastructure/cloudflare-image-renderer.ts` で、本体の変換 → オーバーレイ → エンコードの順に行います。
色は処理する場所を表します (青: Cloudflare Images、緑: JS で画素を処理、橙: WebAssembly)。

```mermaid
flowchart TD
    Src([オリジンの画像]) --> IsJxl{JPEG XL 入力?}
    IsJxl -- Yes --> Dec[JXL をデコードして PNG に]:::wasm
    IsJxl -- No --> IR
    Dec --> IR

    subgraph Body [本体の変換 transformImage]
        IR["ir: 入力の回転・反転"]:::cf --> IC["ic / icr: 入力の切り抜き (trim)"]:::cf
        IC --> RS["拡大縮小: w h a g u dpr b<br>(squeeze / cover / 背景色キャンバスに合成)"]:::cf
        RS --> OC["oc / ocr: 出力の切り抜き (trim)"]:::cf
        OC --> OR["or: 出力の回転・反転"]:::cf
        OR --> HasF{フィルタ指定あり?}
        HasF -- Yes --> F["PNG で画素を取り出し<br>unsharp / blur / grayscale など"]:::js
    end

    subgraph Overlays [オーバーレイ]
        Prep["準備 (並列)<br>画像 l=(…): オリジン取得 → 本体と同じ変換<br>テキスト t=(…): 1 行ずつ text() で描きキャンバスに配置"]:::cf
        Prep --> Each{"指定順に 1 つずつ<br>mask 指定あり?"}
        Each -- No --> Draw["draw で合成<br>(はみ出しは trim)"]:::cf
        Each -- Yes --> Mask["合成結果の画素を取り出し<br>マスクでアルファ値を削る"]:::js
    end

    HasF -- No --> Prep
    F --> Prep
    Draw --> Fmt
    Mask --> Fmt

    subgraph Encode [エンコード]
        Fmt{出力フォーマット}
        Fmt -- "jpeg / png / gif / webp / avif" --> Out["output()<br>jpeg は b の色と合成、webp の lossless は quality=100"]:::cf
        Fmt -- jxl --> Max{"画素数が<br>jxl.maxPixels 以下?"}
        Max -- No --> E400[400]
        Max -- Yes --> Jxl["PNG で画素を取り出し<br>jSquash で JPEG XL にエンコード"]:::wasm
    end

    Out --> Res([変換結果])
    Jxl --> Res

    classDef cf fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef js fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef wasm fill:#ffedd5,stroke:#ea580c,color:#7c2d12
```

寸法はすべて `src/domain/geometry/` で先に計算し、Cloudflare Images には `fit: "squeeze"` / `"cover"` と `trim` で明示的なサイズを渡します。
Cloudflare の `fit` の意味 (`scale-down` など) に依存しないので、丸め方・出力サイズをドメイン側で決められます。

## 未検証事項

`cf dev` のオフライン版 Images は resize / rotate / format しか再現しないため、以下は本番の Images (`pnpm dev:remote` またはデプロイ) で確認が必要です。

- `trim` による切り抜き、`fit: "cover"` の `gravity: {x, y, mode: "remainder"}`、`draw()` による合成位置
- `rotate` の回転方向 (時計回りと想定) と、Exif Orientation 付き JPEG で `info()` が返す寸法
- テキストオーバーレイ全般 (ローカル版 Images は `text()` に対応していない)。`size` の単位、行送り・取り消し線の位置がフォントによってどの程度ずれるか
- キャッシュ API の `purge` (Purge API で Cache API のエントリが消えるか)
- `output({ format: "image/webp", quality: 100 })` がロスレスになるか
