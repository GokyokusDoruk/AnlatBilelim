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

## Oyun motoru

`worker/room/engine.ts` saf mantıktır (Cloudflare API'si yok), `npm test` ile vitest üzerinden test edilir.
Durable Object sadece I/O yapar: her eylemden sonra durumu kaydeder, herkese yayar ve tek alarm yuvasını
`min(faz bitişi, TTL)` olarak kurar. Zaman geçişleri (çark bitişi, tur sonu, özetin otomatik kapanışı) alarmla yürür.

- Başlatma: herkes takım seçip "Hazırım" der, her takımda en az 2 oyuncu olur, otomatik başlar.
- Roller: anlatıcı takım içinde sırayla döner, gözlemci rakip takımdan sırayla gelir, bağlantısı kopanlar atlanır.
- Kartlar yalnızca Anlatıcı ve Gözlemci'ye `private` mesajıyla gider; Dinleyiciler hiç almaz.
- Pass: Anlatma'da 1 hak; üçlü kartlarda bilinmemiş kelime sayısı kadar hak düşer (turda toplam 3).
- 15 Kelime: sayaç 0'a inince tur süre bitmeden sona erer.
- Net skor adıma çevrilir, negatif skor geri götürmez; 45. basamağa ulaşan takım kazanır.
- Bir takımda bağlı oyuncu kalmazsa oda lobiye döner.

## Tahta ve çark

- `src/components/board/Board.tsx`: 45 basamaklı yılan düzenli tahta. Mod renkleri, sıradaki basamak vurgusu, piyonlar basamak basamak yürür (`useSteppedValue`, tek `setTimeout` zinciri).
- `src/components/roulette/ModeRoulette.tsx` + `shared/roulette.ts`: sunucu yalnızca `result`, `seed` ve `startedAt` yollar. Her cihaz çark açısını sunucu saatine göre kendisi hesaplar, bu yüzden hepsi aynı anda aynı yerde durur ve geç bağlanan doğru kareyi görür. Çark canvas'a bir kez çizilir, dönüş CSS transform ile yapılır, durunca rAF döngüsü kapanır, unmount'ta canvas belleği bırakılır.
- Geliştirmede `/dev/ui` sayfası sunucusuz önizleme sunar (üretim derlemesine girmez).

## Kelime havuzu

`shared/data/words_tr.json`: Anlatma 104 kart (kelime + 5 yasaklı), Çizme / Kukla / 15 Kelime için 150'şer kelime.
Kaynaklar `scripts/words_src_*.txt` dosyalarındadır; düzenledikten sonra `npm run words:build` çalıştır.
`npm run build` önce `words:check` ile sayıları (en az 100), tekrarları ve her kartta tam 5 yasaklı kelime olmasını doğrular.
Kartlar `shared/words.ts` içindeki `CardDeck` ile çekilir: havuz tükenmeden aynı kelime tekrar gelmez.

## Yol haritası

- [x] Task 1: İskelet, tipler, store, Cloudflare oda mimarisi, tema
- [x] Task 2: Türkçe kelime havuzu (`shared/data/words_tr.json`)
- [x] Task 3: Lobi, takımlar, tur motoru, sunucu zamanlayıcısı
- [x] Task 4: Oyun tahtası ve mod ruleti
- [ ] Task 5: Anlatma ve 15 Kelime modları
- [ ] Task 6: Çizme modu
- [ ] Task 7: 3D kukla modu
- [ ] Task 8: Tur/oyun sonu, bellek testleri, deploy
