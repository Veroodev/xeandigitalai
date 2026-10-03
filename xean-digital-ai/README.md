# Xean Digital AI

AI Chat bergaya Claude dengan streaming, artifact/code preview, dan provider abstraction. Provider lama APMIX tetap didukung; **xKiro** sekarang terintegrasi sebagai provider dinamis dengan live model catalog.

## Arsitektur provider

```text
Browser
  ↓
Xean /api/chat + /api/models
  ↓
Provider Manager
  ├─ APMIX
  └─ xKiro
       ↓
GET /v1/models (live catalog, cache TTL)
       ↓
Dynamic Model Registry
       ↓
Model Selector
       ↓
POST /v1/chat/completions (server-only secret)
       ↓
Normalized Xean SSE
```

xKiro menggunakan OpenAI-compatible `POST /v1/chat/completions`, full model ID `vendor/model`, dan SSE untuk streaming. `GET /v1/models` adalah katalog live dan metadata-nya additive; Xean menyimpan metadata mentah sekaligus field ternormalisasi agar field baru tidak memecahkan UI.

## Struktur penting

```text
app/api/chat/route.js             proxy chat + SSE normalization + retry/error handling
app/api/models/route.js           live multi-provider model catalog
lib/server/providers.js            provider manager (APMIX + xKiro)
lib/server/model-registry.js      TTL cache + sync/invalidation
lib/server/sse.js                 SSE parsing/normalization
lib/server/provider-errors.js     safe provider error mapping/redaction
lib/model-normalizer.js           tolerant model metadata normalization
components/ModelSelector.jsx      search/filter/model metadata UI
lib/stream.js                     normalized client SSE reader
```

## Environment

Salin `.env.example` menjadi `.env.local`. **API key hanya boleh ada di server environment.** Jangan gunakan `NEXT_PUBLIC_XKIRO_API_KEY`, Vite public variables, frontend constants, atau source code.

```env
XKIRO_API_KEY=sk-xt_...
XKIRO_BASE_URL=https://api.xkiro.com/v1
MODEL_CACHE_TTL_MS=300000
```

xKiro menerima `Authorization: Bearer <key>`; Xean memakai format tersebut. Dokumentasi xKiro juga menyatakan key harus tetap di server.

## Dynamic model discovery

Xean **tidak hardcode daftar model xKiro**. `/api/models` mengambil `GET https://api.xkiro.com/v1/models`, menormalisasi seluruh entry yang memiliki `id`, lalu menyimpan:

- full `id`
- `display_name`
- `owned_by` / vendor
- `access_tier`
- `context_length`
- `max_output_tokens`
- `pricing`
- `capabilities`
- `reasoning_efforts`
- `modality`
- metadata mentah yang belum dikenal

Catalog di-cache di server selama `MODEL_CACHE_TTL_MS` (default 5 menit). Tombol **Sync Models** memaksa refresh. xKiro sendiri menyarankan cache beberapa menit karena catalog berubah relatif jarang.

## Model selector

Selector mendukung pencarian berdasarkan nama, ID, provider/vendor, tier, dan capability. Filter hanya ditampilkan bila memang ada data yang mendukungnya; Xean tidak mengarang capability yang tidak diberikan API.

Metadata terpilih ditampilkan termasuk provider, tier, context, max output, vision, tools, dan reasoning. `reasoning_efforts` hanya digunakan bila model benar-benar menyediakan level tersebut.

## Chat & streaming

Request dari browser hanya menuju `/api/chat`. Server memilih provider dan model, memvalidasi model terhadap server-side registry, lalu meneruskan ke provider. Full model ID dikirim apa adanya, misalnya `qwen/qwen3.8-max:free`.

SSE provider dinormalisasi menjadi event internal Xean:

```json
{"type":"token","content":"...","provider":"xkiro","model":"vendor/model"}
{"type":"meta","usage":{},"finishReason":"stop"}
```

Abort dari browser diteruskan melalui `AbortSignal`, dan connection cleanup dilakukan di stream reader. xKiro mendokumentasikan bahwa menutup stream menghentikan pekerjaan upstream.

## Retry

Retry hanya dibatasi pada status `429`, `502`, `503`, dan `504`, maksimal dua retry dengan exponential backoff dan penghormatan `Retry-After`. Network timeout/unknown POST failure **tidak otomatis di-retry**, karena dokumentasi xKiro memperingatkan retry POST setelah timeout dapat menjalankan request kedua.

## Security

- `XKIRO_API_KEY` hanya dibaca di `lib/server/*` / route handler.
- Tidak ada `NEXT_PUBLIC_XKIRO_API_KEY`.
- Authorization header tidak dikirim ke browser.
- Error detail direduksi dan pola secret di-redact.
- Browser tidak boleh memilih capability dengan memalsukan metadata; route melakukan lookup ulang model pada server registry sebelum mengirim request.
- `.env.local` sudah di-ignore Git, tetapi **jangan pernah mengunggahnya ke repository/zip publik**.

## Testing

Unit checks untuk normalisasi model dan SSE:

```bash
npm run test:xkiro
```

Pemeriksaan produksi:

```bash
npm run build
npm start
```

Kemudian verifikasi:

1. `/api/models` menampilkan model xKiro live.
2. Model dengan full ID dapat dipilih.
3. Chat mengalir token demi token.
4. Stop membatalkan stream.
5. 401/403/404/429/5xx menghasilkan pesan aman.
6. Refresh halaman tidak mem-fetch catalog secara berlebihan selama TTL.
7. Sync Models memaksa refresh.
8. Model baru dari `/v1/models` muncul tanpa perubahan source code.
9. Tidak ada secret di browser bundle/log.

Build penuh perlu dijalankan di environment yang dapat mengakses npm registry dan dependency proyek. Jika memakai reverse proxy seperti Nginx, matikan response buffering untuk route streaming. xKiro juga mensyaratkan stream agar jawaban panjang tidak terkena batas blocking 95 detik.
