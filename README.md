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
  board.ts       45 basamaklı tahta (sabit mod basamakları + karışık), mod süreleri ve pass kuralları
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

## Tur ekranları

`src/screens/rounds/`: Anlatma (`AnlatmaRound`) ve üçlü kart modları (`TripleRound`: 15 Kelime, ayrıca Çizme/Kukla için kart + tik + pass çerçevesi).
Anlatıcı ve Gözlemci tur sırasında yalnızca kartına odaklanır (tahta gizlenir), Dinleyici tahtayı ve anlık skoru görür.
Pass kuralı `shared/board.ts` içindeki `passCost` / `canPass` ile hem sunucuda hem butonun `disabled` durumunda aynı şekilde işler.
Eylem butonları kısa süre kendini kilitler (çift dokunuş çift puan yazmasın).

Yerel geliştirmede `.dev.vars` içine `DEV_TOOLS=1` yazılırsa (gitignore'da), tarayıcı konsolundan
`__tabuSend({ t: 'dev:setBoard', a: 25, b: 0 })` ile tahta konumu ayarlanıp ileri modlar hızlıca denenebilir. Üretimde bu değişken yoktur, mesaj reddedilir.

## Çizme modu ve çizim akışı

- `shared/draw.ts`: çizim protokolü. Görüntü gönderilmez; yalnızca 15 bit normalize `[x, y]` koordinatları ve BEGIN / END / CLEAR / UNDO komutları (16 bitlik sözcükler) ikili çerçevelerle akar. Çerçeve çizginin ortasında bölünebilir, ayrıştırıcı durumu taşır. Nokta başına 4 bayt.
- `src/lib/drawBoard.ts`: Anlatıcı ve Dinleyici aynı sınıfı kullanır (aynı görüntü). rAF döngüsü yok, çizgi parçaları geldiği anda çizilir, boştayken CPU harcanmaz. Çizgi listesi (`StrokeStore`) geri alma ve yeniden çizim için bellekte tutulur ve 500 çizgi / 60 bin nokta ile sınırlıdır.
- Anlatıcı: işaretçi olayları (`getCoalescedEvents` ile akıcı), 8 renk, 4 kalınlık, silgi, geri al, temizle. Komutlar rAF ile ~60 Hz'e kadar gönderilir; soket tamponu doluysa kare atılmaz, yeniden denenir (kare kaybı çizimi bozar).
- Sunucu çizimi çözmez ve SAKLAMAZ; yalnızca aktif Anlatıcı'dan gelen kareleri Çizme modunda Dinleyicilere iletir (Gözlemci yalnızca kartı görür). Geç katılan veya yeniden bağlanan Dinleyici `draw:resync` ister, Anlatıcı tüm çizimi anlık görüntü olarak yeniden yayınlar.
- Yeni kart (pass veya 3 kelimenin tamamı bilinince) tuvali temizler.

## Tahta ve çark

- `src/components/board/Board.tsx`: 45 basamaklı yılan düzenli tahta. Mod renkleri, sıradaki basamak vurgusu, piyonlar basamak basamak yürür (`useSteppedValue`, tek `setTimeout` zinciri).
- `src/components/roulette/ModeRoulette.tsx` + `shared/roulette.ts`: sunucu yalnızca `result`, `seed` ve `startedAt` yollar. Her cihaz çark açısını sunucu saatine göre kendisi hesaplar, bu yüzden hepsi aynı anda aynı yerde durur ve geç bağlanan doğru kareyi görür. Çark canvas'a bir kez çizilir, dönüş CSS transform ile yapılır, durunca rAF döngüsü kapanır, unmount'ta canvas belleği bırakılır.
- Geliştirmede `/dev/ui` sayfası sunucusuz önizleme sunar (üretim derlemesine girmez).

## Kelime havuzu

`shared/data/words_tr.json`: 4 mod × 4 seviye, her seviyede en az 150, toplam mod başına 850 kelime (1 Kolay, 2 Orta, 3 Zor, 4 Çok Zor). Anlatma kartı = kelime + 5 yasaklı; Kukla kelimesi bir hareket klibine bağlıdır (`Kelime|Klip Adı`). Seviyeyi oda kurucusu lobide seçer.
Kaynaklar `scripts/words_src_<mod>_<seviye>.txt` dosyalarındadır; düzenledikten sonra `npm run words:build` çalıştır.
`npm run build` önce `words:check` ile her dosyada en az 150 kelime, mod içinde seviyeler arası tekrar olmaması ve her kartta tam 5 yasaklı kelime olmasını doğrular.
Kartlar `shared/words.ts` içindeki `CardDeck` ile çekilir: havuz tükenmeden aynı kelime tekrar gelmez.

## Yol haritası

- [x] Task 1: İskelet, tipler, store, Cloudflare oda mimarisi, tema
- [x] Task 2: Türkçe kelime havuzu (`shared/data/words_tr.json`)
- [x] Task 3: Lobi, takımlar, tur motoru, sunucu zamanlayıcısı
- [x] Task 4: Oyun tahtası ve mod ruleti
- [x] Task 5: Anlatma ve 15 Kelime modları
- [x] Task 6: Çizme modu
- [ ] Task 7: 3D kukla modu
- [ ] Task 8: Tur/oyun sonu, bellek testleri, deploy

## Yayına alma (Cloudflare + dorukplays.com)

1. `npx wrangler login` (bir kez).
2. `npm run deploy` — kelime doğrulaması, tip kontrolü, testler ve Vite build'i çalışır, ardından `wrangler deploy` Worker'ı, statik dosyaları ve `RoomDurableObject`'i tek seferde yayına alır. Adres: `https://tabu-party.<hesap>.workers.dev`.
3. Kendi alan adın için `wrangler.jsonc` içindeki `routes` satırının yorumunu kaldır (`tabu.dorukplays.com`; alan adı aynı Cloudflare hesabında olmalı) ve yeniden deploy et. `dorukplays.com` ana sayfasındaki butonu bu adrese yönlendir.
4. `DEV_TOOLS` yalnızca yerel `.dev.vars` içindir; üretimde tanımlama (`dev:setBoard` kapalı kalır).
5. Ön kontrol: `npx wrangler deploy --dry-run`.

Statik dosyalar `public/_headers` ile önbelleğe alınır (`/assets/*` değişmez, `index.html` her seferinde yenilenir).

## Bellek sızıntısı testi

`.dev.vars` içinde `DEV_TOOLS=1` varken `npm run dev`, ardından başka bir terminalde `npm run test:leak`. 4 oyuncuyla Çizme → Kukla → Karışık turlarını `CYCLES` (varsayılan 12) kez açıp kapatır; açık disposer sayısı, `<canvas>` sayısı ve GC sonrası JS heap'i ölçer, sızıntı varsa 0 olmayan kodla çıkar.

### Cloudflare Workers Builds ayarları

- Production dalı `main`: build `npm run build`, deploy `npx wrangler deploy`.
- Diğer dallar (PR önizlemeleri): preview komutu deploy yapmayan bir komut olmalı (ör. `echo "onizleme deploy atlandi"`). Build ve testler yine çalışır. Varsayılan `npx wrangler preview` `previews` bloğu ister, `npx wrangler versions upload` ise önizleme ortamındaki Worker adıyla eşleşmediği için hata verir (PR #9'da "Deploying" adımının kırılma sebebi buydu). Canlıya yalnızca `main` dalındaki `npx wrangler deploy` çıkar.
