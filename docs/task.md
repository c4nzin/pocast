# Görev: Aktif oturumları listeleme ve tek oturumu kapatma

|                           |                                                 |
| ------------------------- | ----------------------------------------------- |
| **Görev no**              | POC-001                                         |
| **Atayan**                | Takım lideri                                    |
| **Seviye**                | Başlangıç-orta (ilk görev)                      |
| **Tahmini süre**          | 1 gün                                           |
| **Dokunulacak servisler** | `libs/contracts`, `auth-service`, `api-gateway` |
| **Branch**                | `feat/auth-sessions`                            |

---

## 1. Neden bu görev?

Kullanıcılar uygulamaya birden fazla cihazdan giriş yapıyor: telefon, tablet, bilgisayar. Şu an
iki seçenekleri var: bulundukları cihazdan çıkmak (`/auth/logout`) ya da **her yerden** çıkmak
(`/auth/logout-all`).

Eksik olan, Spotify ve Google hesaplarında gördüğün şu ekran:

```
Aktif oturumlar
──────────────────────────────────────────────
📱 PocastiOS/1.0          son aktif: 2 dk önce      [Çıkış yap]
💻 Chrome / Windows       son aktif: 3 gün önce     [Çıkış yap]
```

Kullanıcı, telefonunu kaybettiğinde **sadece o cihazı** kapatabilmeli. Senin görevin bu ekranın
backend'ini yazmak: **listeleme** ve **tek oturumu kapatma**.

Bu görevi senin için seçtim, çünkü dün okuduğun her şeye dokunuyor: `familyId`, `userAgent`,
`revokedAt`, `revokeFamily`, `@MessagePattern`, `contracts`, `@Authenticated`. Ayrıca gerçek bir
güvenlik açığı tuzağı içeriyor (bölüm 6). Onu fark edip kapatman, bu görevin en önemli kısmı.

---

## 2. Ne yapılacak (kabul kriterleri)

İş bitti sayılması için aşağıdakilerin **hepsi** doğru olmalı.

### Endpoint 1: Oturumları listele

```
GET /api/auth/sessions
Authorization: Bearer <access token>
```

Cevap `200`:

```json
[
  {
    "id": "01a11528-....",
    "userAgent": "PocastiOS/1.0",
    "lastActiveAt": "2026-10-08T09:12:00.000Z",
    "expiresAt": "2026-11-07T09:12:00.000Z"
  }
]
```

- [ ] Sadece **giriş yapmış kullanıcının kendi** oturumları döner.
- [ ] Sadece **aktif** oturumlar döner: çıkış yapılmış, iptal edilmiş veya süresi dolmuş olanlar dönmez.
- [ ] Her oturum **bir kez** görünür (aynı oturumda 5 kez refresh yapılmış olsa bile).
- [ ] En son aktif olan en üstte (`lastActiveAt` azalan sırada).
- [ ] En fazla **50** oturum döner (sınırsız sorgu yasak, bkz. bölüm 7).
- [ ] `id` alanı oturumun `familyId`'sidir.
- [ ] Cevapta `tokenHash`, `userId` veya başka iç alan **yoktur**.
- [ ] Token yoksa `401`.

### Endpoint 2: Tek oturumu kapat

```
DELETE /api/auth/sessions/:id
Authorization: Bearer <access token>
```

Cevap `200`: `{ "ok": true }`

- [ ] Kapatılan oturumun refresh token'ı artık çalışmaz (`/auth/refresh` → `401`).
- [ ] Kullanıcının **diğer** oturumları çalışmaya devam eder.
- [ ] **Başka bir kullanıcının** oturum id'si gönderilirse `404` döner ve o oturum **kapanmaz**.
- [ ] Var olmayan bir id gönderilirse `404`.
- [ ] Zaten kapalı bir oturumun id'si gönderilirse `404`.
- [ ] `:id` UUID değilse `400`.
- [ ] Token yoksa `401`.

### Ortak

- [ ] İki endpoint de `Cache-Control: no-store` başlığı döner.
- [ ] Yeni kod için **integration testleri** yazıldı ve geçiyor.
- [ ] `pnpm nx run-many -t lint test build typecheck` hatasız.
- [ ] `pnpm nx format:check` ve `pnpm check:deps` hatasız.

---

## 3. Başlamadan önce

### 3.1 Çalışma dizinini temizle

`main` branch'inde commitlenmemiş değişiklikler var (`git status` ile gör). Görevine bunları
karıştırma. İkisinden birini yap:

```sh
git add -A && git commit -m "chore: format and comments"   # değişiklikler senin ve kalsın istiyorsan
# veya
git stash                                                   # şimdilik kenara koymak istiyorsan
```

Sonra yeni branch aç. **`main`'e doğrudan commit atmıyoruz.**

```sh
git switch -c feat/auth-sessions
```

### 3.2 Ortamı ayağa kaldır ve her şeyin yeşil olduğunu gör

```sh
pnpm install
pnpm infra:up       # Postgres, RabbitMQ, Redis
pnpm db:deploy      # migration'lar
pnpm nx run-many -t test
```

Testler **sen hiçbir şey değiştirmeden önce** geçmeli. Geçmiyorsa kodla uğraşmadan önce bana yaz,
ortamında bir sorun var demektir.

### 3.3 Önce oku

Bu dosyaları yeniden aç, görev bunlara dayanıyor:

1. [session.service.ts](../apps/auth-service/src/app/sessions/session.service.ts): özellikle `revoke`, `revokeAll`, `revokeFamily`
2. [schema.prisma](../apps/auth-service/prisma/schema.prisma): `RefreshToken` modeli ve indeksleri
3. [auth.controller.ts (auth-service)](../apps/auth-service/src/app/auth/auth.controller.ts): `LOGOUT_ALL` ve `GET_USER` nasıl bağlanmış
4. [auth.controller.ts (gateway)](../apps/api-gateway/src/app/auth/auth.controller.ts): `logout-all` ve `me` nasıl yazılmış
5. [auth.int.spec.ts](../apps/auth-service/src/app/auth/auth.int.spec.ts): testler nasıl yazılıyor

**İpucu:** `logout-all` ve `me` endpoint'leri, yazacağın şeyin neredeyse birebir şablonu.
Akışı (gateway → contracts → auth-service) onları takip ederek anla.

---

## 4. Uygulama adımları

Sırayla git. Her adımın sonunda `typecheck` çalıştır, hataları biriktirme.

### Adım 1: Sözleşme (`libs/contracts`)

Dosyalar: [auth.patterns.ts](../libs/contracts/src/lib/auth/auth.patterns.ts),
[auth.dto.ts](../libs/contracts/src/lib/auth/auth.dto.ts)

1. `AUTH_PATTERNS` içine iki yeni mesaj ekle. İsimlendirme mevcut kalıba uymalı
   (`auth.user.get` gibi): örneğin `LIST_SESSIONS: 'auth.session.list'` ve
   `REVOKE_SESSION: 'auth.session.revoke'`.
2. Listeleme için yeni bir command sınıfı gerekmiyor. Neden? (`UserIdCommand`'a bak.)
3. Kapatma için `RevokeSessionCommand` sınıfı yaz: `userId` ve `sessionId`, ikisi de `@IsUUID()`.
4. Cevap tipi için `SessionSummary` **interface**'i yaz (bölüm 2'deki JSON'un şekli).
   Tarihler `string` (ISO formatı), çünkü JSON'da `Date` diye bir tip yok.

```sh
pnpm nx typecheck @pocast/contracts
```

### Adım 2: Önce testi yaz (auth-service)

Dosya: [auth.int.spec.ts](../apps/auth-service/src/app/auth/auth.int.spec.ts)

Kodu yazmadan **önce** testleri yaz. Testler kırmızı olacak (çünkü metotlar yok); bu normal ve
istenen durum. Buna TDD diyoruz: önce "ne olmalı"yı tarif et, sonra yap.

Yeni bir `describe('sessions', ...)` bloğu aç. Dosyada hazır yardımcılar var: `register()` ve
`expectRpcStatus(...)`. Onları kullan.

Testin `AuthService`'i değil `SessionService`'i doğrudan çağırmasını istersen, `beforeAll` içinde
oluşturulan `SessionService`'i bir değişkende tutman gerekecek.

Yazman gereken testler (en az bunlar):

| #   | Senaryo                                  | Beklenen                                           |
| --- | ---------------------------------------- | -------------------------------------------------- |
| 1   | Kullanıcı 2 kez giriş yaptı              | 2 oturum listelenir                                |
| 2   | Bir oturumda 3 kez refresh yapıldı       | O oturum **1 kez** listelenir                      |
| 3   | Bir oturumdan logout yapıldı             | O oturum listede yok                               |
| 4   | Süresi dolmuş oturum                     | Listede yok                                        |
| 5   | İki farklı kullanıcı var                 | Her biri sadece kendininkini görür                 |
| 6   | Kendi oturumunu kapat                    | O oturumun refresh token'ı `401`, diğeri çalışıyor |
| 7   | **Başkasının** oturumunu kapatmaya çalış | `404`, ve **o kişinin oturumu hâlâ çalışıyor**     |
| 8   | Zaten kapalı oturumu kapat               | `404`                                              |

7 numaralı test, bu görevin en önemli testi. Neden önemli olduğu bölüm 6'da.

Test çalıştırma:

```sh
pnpm nx test @pocast/auth-service --testPathPatterns=auth.int
```

### Adım 3: `SessionService`'e iki metot ekle

Dosya: [session.service.ts](../apps/auth-service/src/app/sessions/session.service.ts)

**`listActive(userId)`**: kullanıcının aktif oturumlarını döner.

Düşünmen gereken nokta: veritabanında bir **oturum = bir aile**, ama bir aile **birçok satırdan**
oluşuyor (A → B → C). "Her oturum bir kez görünsün" kuralını nasıl sağlarsın?

<details>
<summary>İpucu (önce kendin düşün, sonra aç)</summary>

Rotation'ı hatırla: yeni token üretilirken eskisinin `revokedAt` alanı doluyor. Yani aktif bir
ailede **iptal edilmemiş tek bir satır** vardır: en sonuncusu. "İptal edilmemiş ve süresi
dolmamış satırlar"ı çekersen her aileden zaten bir satır gelir. `groupBy` gerekmez.

Bu sorguyu destekleyen indeks şemada zaten var: `@@index([userId, revokedAt])`.
</details>

Kurallar:

- `select` ile **sadece gereken** alanları çek. `tokenHash`'i asla çekme.
- `take: 50` sınırı koy.
- `createdAt` azalan sırala. (Neden `createdAt` bu ailenin "son aktif" zamanı oluyor? Düşün.)
- Veritabanı satırını `SessionSummary`'ye çeviren küçük bir fonksiyon yaz. Örnek için
  [catalog-mappers.ts](../apps/catalog-service/src/app/catalog/catalog-mappers.ts) dosyasındaki
  `toPodcastSummary`'ye bak.

**`revokeOwn(userId, sessionId)`**: oturumu kapatır, kapattıysa `true` döner.

- `revokeFamily`'yi **doğrudan kullanma**. Neden? `where` koşuluna bak ve bölüm 6'yı oku.
- `updateMany` dönüşündeki `count` ile bir şeyin kapanıp kapanmadığını anla
  (`rotate` metodundaki "atomic claim" kısmını hatırla).

### Adım 4: auth-service controller

Dosya: [auth.controller.ts (auth-service)](../apps/auth-service/src/app/auth/auth.controller.ts)

İki `@MessagePattern` ekle. `REVOKE_SESSION`, `revokeOwn` `false` dönerse 404 fırlatmalı:

```ts
throw rpcError(HttpStatus.NOT_FOUND, 'Session not found');
```

`rpcError`'ın nereden import edildiğine [auth.service.ts](../apps/auth-service/src/app/auth/auth.service.ts) içinde bak.

Bu iş mantığını controller'a mı, service'e mi koymalısın? Takımda genel kural: controller ince
kalır. Kararını PR açıklamasında yaz.

Bu noktada Adım 2'deki testler **yeşile** dönmeli.

### Adım 5: Gateway

Dosya: [auth.controller.ts (gateway)](../apps/api-gateway/src/app/auth/auth.controller.ts)

İki route ekle. `me` endpoint'ini şablon al.

- `@Get('sessions')` ve `@Delete('sessions/:id')`
- İkisine de: `@Header('Cache-Control', NO_STORE)` ve `@Authenticated()`
- Silme route'unda: `@HttpCode(HttpStatus.OK)` ve `@Param('id', ParseUUIDPipe)`
- **`userId`'yi asla istekten (body, query, URL) alma.** Her zaman `@CurrentUser()`'dan al.
  Neden? Bölüm 6.

`Delete`, `Param`, `ParseUUIDPipe` henüz bu dosyada import edilmemiş; `@nestjs/common`'dan ekle.
[podcasts.controller.ts](../apps/api-gateway/src/app/podcasts/podcasts.controller.ts) içinde
`ParseUUIDPipe` kullanımının örneği var.

### Adım 6: Elle dene

Servisleri başlat:

```sh
pnpm dev
```

Başka bir terminalde (Git Bash):

```sh
B=http://localhost:3000/api
H='Content-Type: application/json'

# Aynı kullanıcı için iki "cihaz"
curl -s -X POST $B/auth/register -H "$H" -H 'User-Agent: Phone/1.0' \
  -d '{"email":"task@example.com","password":"a long passphrase"}'
curl -s -X POST $B/auth/login -H "$H" -H 'User-Agent: Laptop/1.0' \
  -d '{"email":"task@example.com","password":"a long passphrase"}'

# Login cevabındaki accessToken'ı kopyala
AT=buraya_access_token

curl -s $B/auth/sessions -H "Authorization: Bearer $AT"
curl -s -X DELETE $B/auth/sessions/<id> -H "Authorization: Bearer $AT"
curl -s -X DELETE $B/auth/sessions/not-a-uuid -H "Authorization: Bearer $AT"   # 400 bekleniyor
```

Bölüm 2'deki her kabul kriterini elle de bir kez gör. Özellikle: **ikinci bir kullanıcı aç ve
onun token'ıyla ilk kullanıcının oturumunu silmeyi dene.**

Not: Login endpoint'i dakikada 10 istekle sınırlı. Çok deneme yaparsan `429` alırsın, bir
dakika bekle veya `docker exec pocast-redis redis-cli FLUSHALL` ile sayacı sıfırla (sadece
geliştirme ortamında!).

### Adım 7: Son kontrol

```sh
pnpm nx format:write
pnpm nx run-many -t lint test build typecheck
pnpm nx format:check
pnpm check:deps
```

Hepsi yeşil değilse PR açma.

---

## 5. Mimari kurallar (bunlar pazarlık konusu değil)

1. **auth-service HTTP bilmez.** `@Get`, `@Delete`, `Request` gibi şeyler sadece gateway'de.
   Servis sadece `@MessagePattern` kullanır.
2. **Mesaj isimleri sadece `contracts`'ta.** Hiçbir yerde `'auth.session.list'` diye çıplak
   yazı geçmez; her yerde `AUTH_PATTERNS.LIST_SESSIONS`.
3. **Servis gateway'e güvenmez.** `RevokeSessionCommand` sınıfındaki `@IsUUID()` kuralları
   gateway zaten kontrol etse bile kalacak.
4. **Hatalar `rpcError(...)` ile fırlatılır.** Düz `throw new Error(...)` gateway'de `500` olur.
5. **Kod okunabilir olsun.** Fonksiyonlar kısa, isimler açık. Bir yorum "ne" yaptığını değil,
   **neden** yaptığını anlatır.

---

## 6. ⚠️ Güvenlik tuzağı: IDOR

Bu bölümü atlama. Görevin asıl öğretmek istediği şey bu.

**IDOR** (_Insecure Direct Object Reference_), web uygulamalarında en sık görülen açıklardan
biri. Şöyle olur:

```
DELETE /api/auth/sessions/01a11528-...      ← bu id kimin?
```

Kod sadece "bu id'li oturumu kapat" derse, **herhangi bir giriş yapmış kullanıcı** başka birinin
oturum id'sini bulduğu anda o kişiyi sistemden atabilir. Giriş yapmış olmak (authentication),
o nesne üzerinde **yetkili** olmak (authorization) demek değildir.

Doğru kural: **"bu id'li oturumu kapat"** değil, **"bu kullanıcıya ait olan, bu id'li oturumu
kapat."** Yani sorgunun `where` kısmında `userId` de olmalı.

Mevcut `revokeFamily(familyId)` metodu sadece `familyId`'ye bakıyor. Logout için bu doğru, çünkü
orada kullanıcı zaten o ailenin token'ını elinde tutarak sahipliğini kanıtlıyor. Senin endpoint'inde
ise kullanıcının elinde sadece bir id var, sahipliği kanıtlamıyor. Bu yüzden yeni metot yazıyorsun.

**Neden `403` değil de `404`?** `403 Forbidden` dersen saldırgana "bu id gerçekten var, ama senin
değil" bilgisini vermiş olursun. `404` ise "var olmayan" ile "senin olmayan" arasında fark
göstermez. Kullanıcı açısından ikisi de aynı: senin oturumların arasında böyle bir şey yok.

---

## 7. Performans notları

Bu uygulama yüksek trafik için tasarlanıyor. Bu görevde dikkat:

- **`take: 50`.** Sınırsız liste sorgusu yasak. Bir hesabın binlerce oturumu olabilir
  (bot, hata, saldırı). Cevap boyutu her zaman sınırlı olmalı.
- **`select`.** Sadece gereken kolonlar. Veritabanından gereksiz veri taşımak hem yavaş hem riskli.
- **İndeks.** Sorgun `userId` + `revokedAt` ile filtreliyorsa, şemadaki
  `@@index([userId, revokedAt])` bunu hızlandırır. Bu indeks olmasaydı ne olurdu?
- **Ekstra sorgu yapma.** Kapatma işlemi tek bir `updateMany` ile yapılabilir. Önce `find`,
  sonra `update` yapmak hem iki kat sorgu, hem de `rotate`'teki gibi yarış durumuna açık kapı.

---

## 8. Kapsam dışı (bu görevde yapma)

Bunlar iyi fikirler ama **bu görevin parçası değil**. Görmüş olman güzel; PR açıklamasına
"gelecekte yapılabilir" diye not düşebilirsin.

- Listede "bu cihaz" (şu an kullandığın oturum) işareti.
  (Zor kısmı: access token içinde `familyId` yok. Nasıl çözülürdü?)
- Oturumun **ilk** başladığı zaman (`startedAt`).
- `userAgent`'ı "iPhone", "Chrome" gibi okunur isimlere çevirmek.
- Gateway için unit test. (Yazarsan bonus.)

---

## 9. Teslim

### Commit

Küçük, anlamlı commitler at. Mesaj formatı (conventional commits):

```
feat(auth): list active sessions
feat(auth): revoke a single session
test(auth): cover session listing and revocation
```

### Pull request

GitHub'da `main`'e PR aç. Açıklamada şunlar olsun:

1. **Ne yaptın** (2-3 cümle).
2. **Nasıl test ettin** (komutlar + elle denediklerin).
3. **Aşağıdaki soruların cevapları.** Bunlar sınav değil, anladığını görmek istiyorum:
   - Listeleme sorgusunda her oturum neden tek satır olarak geliyor?
   - Başkasının oturumu için neden `403` değil `404` dönüyoruz?
   - Bir oturumu `DELETE` ile kapattıktan sonra, o cihazdaki **access token** hâlâ çalışır mı?
     Ne kadar süre? Neden?
   - `revokeOwn` içindeki iş mantığını neden (ya da neden değil) controller'a koydun?

PR'ı açınca bana haber ver, birlikte review edelim.

---

## 10. Takılırsan

- Önce **15 dakika** kendin dene: hata mesajını oku, ilgili dosyayı aç, mevcut benzer kodu
  (`logout-all`, `me`) karşılaştır.
- Sonra bana sor. Sorarken şunları yaz: **ne yapmaya çalıştın, ne bekliyordun, ne oldu**, ve
  hata mesajının tamamı.
- Takılmak normal. Saatlerce tek başına takılı kalmak normal değil; sormaktan çekinme.

### Bilinen ortam sorunu: `TS6059 ... is not under 'rootDir' 'c:/...'`

VS Code'un terminalinde `build` şu hatayla düşebilir:

```
File 'C:/Users/.../libs/contracts/dist/index.js' is not under rootDir 'c:/Users/...'
```

Kodla ilgisi yok. VS Code (Nx Console eklentisi), `NX_WORKSPACE_ROOT_PATH` ortam
değişkenini **küçük harfli** sürücüyle (`c:\...`) ayarlıyor; TypeScript `C:` ile `c:`'yi farklı
klasör sanıyor. Çözüm, o terminalde değişkeni kaldırıp Nx'i sıfırlamak:

```sh
unset NX_WORKSPACE_ROOT_PATH     # Git Bash
pnpm nx reset
```

PowerShell'de: `Remove-Item Env:NX_WORKSPACE_ROOT_PATH`.

Kolay gelsin! 🚀
