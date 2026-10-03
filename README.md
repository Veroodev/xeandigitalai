# Xean Digital AI

Aplikasi web AI Chat bergaya Claude: chat streaming, panel samping artifact untuk kode dan berkas, desain Neobrutalism.
Dibangun dengan Next.js (App Router), Tailwind CSS, Lucide React, dan highlight.js.

## Struktur proyek

```
xean-digital-ai/
├─ app/
│  ├─ api/
│  │  ├─ chat/route.js        POST /api/chat, proxy streaming (SSE) ke provider
│  │  └─ models/route.js      GET /api/models, ambil GET /v1/models dengan fallback
│  ├─ globals.css             token desain, tombol, markdown, warna syntax
│  ├─ layout.jsx              font Archivo dan Space Mono
│  └─ page.jsx
├─ components/
│  ├─ ChatInterface.jsx       state utama, thread, streaming, split-view
│  ├─ MessageList.jsx         daftar pesan dan layar awal
│  ├─ MessageContent.jsx      memecah pesan menjadi teks dan blok kode
│  ├─ Markdown.jsx            render Markdown lengkap (GFM)
│  ├─ CodeBlock.jsx           blok kode inline atau kartu artifact
│  ├─ ArtifactViewer.jsx      panel samping: kode, pratinjau, tab berkas
│  ├─ FileDownloader.jsx      unduh .html .js .py .json .csv .md .txt .zip
│  ├─ CopyButton.jsx          salin satu klik
│  ├─ Composer.jsx            input pesan (monospace)
│  └─ Sidebar.jsx             riwayat percakapan
├─ lib/
│  ├─ artifacts.js            deteksi blok kode, nama berkas, builder pratinjau
│  ├─ stream.js               pembaca SSE (format OpenAI dan Anthropic)
│  ├─ download.js, csv.js, highlight.js, storage.js, utils.js, config.js
│  └─ server/apmix.js         konfigurasi provider (hanya server)
├─ .env.example
├─ tailwind.config.js
└─ package.json
```

## Instalasi

Butuh Node.js 18.18 atau lebih baru.

```bash
npm install
cp .env.example .env.local     # lalu isi APMIX_API_KEY
npm run dev
```

Buka http://localhost:3000.

File `.env.local` sudah masuk `.gitignore`. Jangan memakai prefix `NEXT_PUBLIC_` untuk API key, karena nilainya akan ikut terkirim ke browser.

## Variabel environment

| Nama | Isi |
| --- | --- |
| `APMIX_API_KEY` | API key (wajib) |
| `APMIX_BASE_URL` | Default `https://api.apmix.ai/v1` |
| `APMIX_DEFAULT_MODEL` | Default `gpt-6-luna-free` |
| `APMIX_API_FORMAT` | `openai` (`/chat/completions`) atau `anthropic` (`/v1/messages`) |

## Deployment (Vercel)

1. Push proyek ke GitHub (pastikan `.env.local` tidak ikut).
2. Import repositori di Vercel.
3. Isi variabel environment di atas pada Project Settings, lalu deploy.

Di server sendiri: `npm run build && npm start`. Bila memakai reverse proxy Nginx, tambahkan `proxy_buffering off;` pada lokasi `/api/chat` agar streaming tidak tertahan.

## Cara kerja artifact

AI diminta menulis berkas dalam blok berpagar dengan nama berkas, misalnya ` ```html filename="index.html" `.
Blok panjang tampil sebagai kartu di chat dan otomatis terbuka di panel. HTML, CSS, JS, SVG, Markdown, dan CSV punya pratinjau.
Pratinjau web berjalan di `iframe` dengan `sandbox` tanpa `allow-same-origin`, jadi kode hasil AI tidak bisa membaca data aplikasi.

## Keamanan

- Tambahkan rate limiting (mis. Upstash Ratelimit) dan autentikasi pengguna di `/api/chat` sebelum dipublikasikan, karena route ini memakai kuota API key Anda.
- Jika API key pernah tertempel di chat, repositori publik, atau tangkapan layar, buat key baru dari dashboard provider.
