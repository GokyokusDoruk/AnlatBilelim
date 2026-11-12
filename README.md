# Tabu Party

Aynı odadaki arkadaşların kendi telefon/bilgisayar tarayıcılarından senkronize oynadığı, 4 modlu (Anlatma, Çizme, Kukla, 15 Kelime) Türkçe parti oyunu. Giriş yok: isim + oda kodu yeterli.

## Kurulum

```bash
npm install
npm run dev        # http://localhost:5173  (React + Worker + Durable Object aynı süreçte)
npm run build      # tip kontrolü + üretim derlemesi (dist/)
npm run deploy     # build + wrangler deploy (önce: npx wrangler login)
```

Gereksinim: Node.js 20+.

## Mimari

```
shared/        İstemci ve sunucunun ortak kullandığı kod
  types.ts       Alan modeli (oyuncu, takım, tur, kart, snapshot)
  protocol.ts    WebSocket mesajları (JSON kontrol + ikili akış kanalları)
  board.ts       45 basamaklı tahta, mod süreleri ve pass kuralları
  constants.ts   Limitler, TTL, oda kodu alfabesi
  validation.ts  İsim / oda kodu / oyuncu kimliği doğrulama

worker/        Cloudflare Worker (tek otorite)
  index.ts             /api/* yönlendirme, statik SPA servisi
  RoomDurableObject.ts Oda başına bir Durable Object (WebSocket Hibernation, TTL alarmı)
  room/RoomData.ts     Oda durumu ve saf dönüşümler

src/           React + Vite istemcisi
  net/RoomSocket.ts    Yeniden bağlanan, saat senkronlu WebSocket istemcisi
  net/connection.ts    Tekil aktif bağlantı yöneticisi
  store/               Zustand store + seçiciler
  hooks/               Sunucu saatli geri sayım, rAF döngüsü
  lib/disposer.ts      Kaynak temizliği yardımcısı (three.js / canvas / zamanlayıcılar)
  components/ui/       Tema uyumlu temel bileşenler
  screens/             Ana sayfa ve oda ekranı
```

### Neden tek Worker?

Cloudflare artık statik siteleri de Worker'ın `assets` özelliğiyle sunuyor. Tek bir `wrangler deploy` hem SPA'yı hem `/api/*` altındaki Durable Object WebSocket trafiğini yayına alır; Pages + ayrı Worker kurulumundaki iki proje ve servis bağlama karmaşası olmaz. `dorukplays.com` üzerindeki buton bu Worker'ın adresine (veya bağlanacak özel alt alan adına, ör. `tabu.dorukplays.com`) yönlendirilir.

### Bellek ve performans kuralları

- **Sunucu tek otoritedir.** Süre, skor, kart dağıtımı ve pass hakkı yalnızca Durable Object'te hesaplanır. Kart verisi sadece Anlatıcı ve Gözlemci'ye gönderilir.
- **Hibernation:** Odada trafik yokken Durable Object RAM'den düşer; bağlantılar açık kalır. Soket başına veri `serializeAttachment` ile tutulur, ayrı bir Map yoktur.
- **TTL:** Son anlamlı etkileşimden 1 saat sonra (ping sayılmaz) oda kapatılır ve depolaması tamamen silinir.
- **İkili akış:** Çizim (normalize `[x,y]`) ve kukla (`[x,y,z,qx,qy,qz,qw]`) verileri ikili çerçevelerle gönderilir; sunucu yükü çözmeden yalnızca aktarır. Görüntü (base64/blob) gönderimi yoktur.
- **Geri basınç:** İstemci, soket tamponu doluyken ikili kareleri atlar; kuyruk birikmez.
- **Zustand seçicileri:** Bileşenler yalnızca ihtiyaç duydukları dilime abone olur; değişmeyen dilimlerin referansı korunur. Yüksek frekanslı veriler store'a yazılmaz.
- **Temizlik:** Her soket, zamanlayıcı, rAF ve dinleyici unmount'ta kapatılır (`RoomSocket.dispose`, `createDisposer`).

## Yol haritası

- [x] Task 1: İskelet, tipler, store, Cloudflare oda mimarisi, tema
- [ ] Task 2: Türkçe kelime havuzu
- [ ] Task 3: Lobi, takımlar, tur motoru, sunucu zamanlayıcısı
- [ ] Task 4: Oyun tahtası ve mod ruleti
- [ ] Task 5: Anlatma ve 15 Kelime modları
- [ ] Task 6: Çizme modu
- [ ] Task 7: 3D kukla modu
- [ ] Task 8: Tur/oyun sonu, bellek testleri, deploy
