# PICK UP N GO — Smart Food Pre-Order & Pickup (PWA)

Aplikasi web PWA untuk tempahan makanan secara online: pelanggan pilih menu daripada katalog, checkout, pilih **tarikh & masa pickup**, dan pesanan dihantar terus ke **WhatsApp** kedai. Staff scan QR pesanan di kaunter, admin urus menu, slot pickup, pembayaran dan analitik.

Dibina dengan **HTML5 + Vanilla CSS + Vanilla JavaScript (ES modules)** sahaja. Tiada React / Vue / Bootstrap / Tailwind.

## Cara jalankan

PWA dan ES modules perlukan web server (bukan `file://`):

```bash
# mana-mana static server
python3 -m http.server 8080
# atau
npx serve .
```

Buka <http://localhost:8080>. Untuk uji install di telefon, deploy ke HTTPS (Firebase Hosting, Netlify, GitHub Pages, dll).

### Akaun demo (Demo Mode)

| Peranan | Email | Password | Halaman |
|---|---|---|---|
| Admin | `admin@pickupngo.my` | `admin123` | `#/admin` |
| Staff | `staff@pickupngo.my` | `staff123` | `#/staff` |
| Customer | — (guest, tiada login) | — | `#/home` |

Tip: buka customer app dalam satu tab dan `#/admin` atau `#/staff` dalam tab lain. Pesanan baru dan perubahan status disegerakkan secara langsung antara tab.

## Fungsi utama

**Customer**
- Home: logo, ucapan, carian, banner promo, kategori, Featured / Recommended / Popular / Latest menu, butang Order Now.
- Katalog: carian, tapis kategori, susun ikut harga/populariti/nama/terbaru, tapis "Available only", status Sold Out.
- Butiran menu: pilihan variasi (dengan harga tambahan), kuantiti, nota khas, *slide-to-add* (atau tekan butang), favourite, share.
- Cart: tambah/kurang/padam, nota setiap item, special request, kod promo (`PNG10`, `JIMAT5`), subtotal, diskaun, grand total.
- Checkout 4 langkah: Review → maklumat pelanggan → pickup (Immediate / Scheduled, tarikh, slot masa, lokasi) → pembayaran → Confirm.
- Slot pickup disekat jika **penuh**, **di luar waktu operasi**, **dimatikan admin**, **tarikh disekat**, atau **kurang daripada masa penyediaan** dari sekarang. Semakan dibuat semula semasa simpan (transaksi dalam Firebase) supaya slot tidak terlebih tempah.
- Pembayaran: Cash on Pickup, DuitNow QR (QR boleh ditetapkan admin, arahan, upload resit, status Pending/Verified/Rejected), Online Payment (simulasi dalam demo).
- Selepas checkout: WhatsApp dibuka dengan mesej pesanan auto-jana ke nombor kedai. Halaman pengesahan papar Order ID unik, QR pesanan, tracker status, ringkasan, butang Download Receipt (PNG), Share via WhatsApp, Send to Shop, Contact Shop, Repeat Order, Cancel.
- My Orders: active orders, jadual pickup, sejarah, repeat order. Profile: kemas kini profil, menu favourite, install app.

**Admin** (`#/admin`)
- Dashboard: Total Orders Today, Total Sales Today, Pending, Preparing, Ready, Completed, Popular Menu, carta jualan 7 hari.
- Orders: tapis status/tarikh, carian, Accept/Reject, tukar status, verify/reject pembayaran, lihat resit, print receipt (format printer thermal), WhatsApp status update / pickup reminder, export CSV.
- Pickup Schedule: papan slot harian dengan kapasiti.
- Menu: tambah/edit/padam, upload gambar, harga, kategori, variasi, Available/Sold Out, Featured/Popular/Recommended.
- Pickup Settings: waktu operasi setiap hari, slot (tambah/padam/hidup-mati/jana automatik), maksimum pesanan per slot, masa penyediaan, hari tempahan awal, tarikh disekat, lokasi pickup.
- Customers: senarai pelanggan, jumlah pesanan & belanja, sejarah, WhatsApp/call.
- Shop & Payment: nama kedai, nombor WhatsApp, kaedah pembayaran, DuitNow QR, kod promo.

**Staff** (`#/staff`)
- Pesanan hari ini disusun ikut waktu pickup, tapis To Do / Ready / Done, carian Order ID / nama.
- **Scan QR** (kamera — BarcodeDetector atau jsQR) atau taip Order ID → skrin Verify → Mark as Completed (sahkan bayaran tunai).
- Butang status seterusnya (Accept → Preparing → Ready → Completed) dan WhatsApp pickup reminder.

**PWA**
- `manifest.json` (ikon, maskable, shortcuts), `sw.js` (precache app shell, stale-while-revalidate, network-first navigation), `offline.html` fallback, banner offline, butang install (Android/desktop) + arahan iPhone.
- Penjana & pengimbas QR dibundel dalam `js/vendor/` supaya berfungsi offline.

## Push notification

- **Customer**: tekan *Hidupkan Notifikasi* (halaman pesanan atau Profile). Bila staff/admin tukar status pesanan (Accepted → Preparing → **Ready for Pickup** → Completed), pelanggan terima notifikasi push walaupun app ditutup. Staff/admin juga boleh hantar *Push Reminder* untuk pickup.
- **Staff/Admin**: butang 🔔 *Order alerts* — notifikasi pesanan baru masuk semasa panel staff/admin dibuka (termasuk tab di belakang).
- Push dihantar oleh fungsi serverless **`/api/push`** (Vercel) menggunakan VAPID. Mesej dibina di server daripada templat tetap, dan hanya endpoint push service yang sah (Google/Mozilla/Apple/Microsoft) diterima.
- Pemboleh ubah persekitaran Vercel yang diperlukan: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (contoh `mailto:owner@kedai.my`). Jana kunci baharu dengan `npx web-push generate-vapid-keys`.
- **iPhone/iPad**: notifikasi hanya berfungsi selepas app dipasang ke Home Screen (iOS 16.4+), dan mesti dihidupkan dari app yang dipasang itu.
- Tanpa `/api/push` (contoh `python3 -m http.server`), app guna notifikasi dalam-app sahaja.
- Demo mode: data pesanan hanya ada dalam browser yang sama, jadi push dari admin ke pelanggan di peranti lain memerlukan Firebase mode (subscription disimpan pada pesanan sebagai `pushSub`).

## Safe area (telefon berskrin notch)

Layout menggunakan `viewport-fit=cover` dengan `env(safe-area-inset-*)` untuk semua sisi: jalur status bar berwarna, header, bar navigasi bawah, butang checkout, modal, toast dan panel admin/staff dijauhkan daripada notch, Dynamic Island dan home indicator, termasuk mod landscape. Input menggunakan saiz 16px pada peranti sentuh supaya iOS tidak zoom.

## Struktur fail

```
index.html            App shell
manifest.json  sw.js  offline.html
css/app.css           Semua gaya (design tokens dalam :root)
js/app.js             Bootstrap + hash router
js/config.js          FIREBASE_CONFIG (null = demo mode)
js/store.js           Data layer: LocalBackend & FirebaseBackend
js/cart.js            Cart, harga variasi, promo
js/pickup.js          Peraturan slot pickup & waktu operasi
js/whatsapp.js        Mesej WhatsApp auto-jana
js/qr.js              Jana & imbas QR
js/ui.js              Ikon, toast, modal, loader
js/pwa.js             Service worker, install prompt, status online
js/push.js            Web Push + notifikasi tempatan
api/push.js           Fungsi serverless Vercel untuk hantar push (web-push)
js/food-art.js        Ilustrasi makanan SVG (offline)
js/sample-data.js     Menu, kategori, tetapan & akaun demo
js/views/             customer.js, admin.js, staff.js, shared.js
js/vendor/            qrcode-generator (MIT), jsQR (Apache-2.0)
firestore.rules  storage.rules  firebase.json
```

## Firebase (production)

Config projek **`pickup-n-go`** sudah dimasukkan dalam `js/config.js` dan Firebase SDK dibundel dalam `js/vendor/firebase/`. Selagi servis di bawah belum diaktifkan, app berjalan dalam **mod demo** dan memaparkan sebabnya (Profile → Demo Mode, dan bahagian atas panel Admin). Selepas diaktifkan, muat semula app dan ia akan bertukar ke Firebase secara automatik.

1. **Authentication** → *Get started* → tab **Sign-in method** → aktifkan **Anonymous** dan **Email/Password**.
2. **Firestore Database** → *Create database* → pilih lokasi (cadangan `asia-southeast1`, Singapura) → *Production mode*.
3. **Firestore → Rules** → padam kandungan sedia ada, tampal semua isi `firestore.rules` dari repo ini → **Publish**.
4. **Akaun pemilik (admin)** — UID dalam senarai `isOwner()` di `firestore.rules` / `storage.rules` (dan `OWNER_UIDS` dalam `js/config.js`) sentiasa menjadi admin. Untuk menambah admin lain tanpa Console, tambah UID mereka di ketiga-tiga tempat itu dan publish semula rules. Cara lain (manual):
   - Authentication → Users → **Add user** (email + password).
   - Buka app → Profile → *Staff / Admin Login* → log masuk sekali (ini mencipta dokumen `users/{uid}`).
   - Firestore → koleksi `users` → dokumen dengan UID tadi → tukar medan `role` daripada `customer` kepada `admin` (atau `staff` untuk pekerja kaunter).
   - Muat semula app → log masuk semula → **Admin → Menu → Seed sample menu** untuk masukkan menu & tetapan contoh.
5. **Storage (pilihan)** — memerlukan pelan Blaze. Jika tidak diaktifkan, gambar menu dan resit DuitNow disimpan terus dalam Firestore (dimampatkan, had ~500KB). Jika diaktifkan, tampal `storage.rules` di Storage → Rules.

Atau guna Firebase CLI: `firebase deploy --only firestore:rules,storage`.

Nota keselamatan:
- Pelanggan log masuk secara anonymous; mereka hanya boleh baca/ubah pesanan sendiri (upload resit, batal semasa *Pending Confirmation*). Status pembayaran hanya boleh disahkan oleh staff/admin.
- Peranan (`role`) tidak boleh diubah oleh pengguna sendiri — hanya admin.
- Gambar menu: admin sahaja. Resit: pemilik & staff sahaja, imej < 5MB.
- **Demo mode** menyimpan kata laluan demo dalam LocalStorage dan bukan untuk production.
- Online Payment ialah simulasi. Untuk production, sambungkan payment gateway (contoh ToyyibPay / Billplz / Stripe) melalui Cloud Function yang mengemas kini `payment.status`.

## Warna & reka bentuk

Cream `#FFF9F0`, Dark Forest Green `#244B38`, Orange `#F4A340`, Charcoal `#292929`, kad putih `#FFFFFF`, font Poppins. Gaya kad makanan dengan pinggan "terapung" di atas panel berwarna, chip butiran bulat, dan *slide-to-add* diinspirasikan daripada rujukan reka bentuk yang diberi.
