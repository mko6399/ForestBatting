# ForestBatting — บันทึกส่งต่องาน

> อัปเดตล่าสุด: 2026-11-11
> โปรเจ็คนี้คือ **Forest Bathing Trail เวอร์ชันใหม่** ที่ย้ายมาจาก `D:\work formony\Botany`
> ของเดิมยังอยู่ครบไม่ถูกแตะต้อง

---

## 1. โปรเจ็คนี้คืออะไร

พอร์ตแอป Forest Bathing Trail มาขึ้นใหม่ด้วย **Angular 22.2.6 แบบ Client-Side Rendering ล้วน**
(ของเดิมเป็น Angular 19 + SSR) เพื่อเตรียมรองรับ **หลายสถานที่** (เขาช่อง, ทุ่งค่าย, Forest of Play)

| | ของเดิม (Botany) | ของใหม่ (ForestBatting) |
|---|---|---|
| Angular | 19.2 | 22.2.6 |
| Rendering | SSR (Express) | CSR ล้วน |
| Test runner | Karma + Jasmine | Vitest |
| Change detection | zone.js | zone.js (คงไว้โดยตั้งใจ) |

### สถานะที่ตรวจสอบแล้ว ✅
- `npm run build` ผ่าน **ไม่มี error ไม่มี warning**
- `/home` แสดงผลเหมือนเดิมทุกอย่าง (โปสเตอร์ เมนูข้าง ภาษาไทย)
- `/map` โหลด Leaflet สำเร็จ — 12 tiles, 43 markers
- `manifest.webmanifest` + `sw-notification.js` เสิร์ฟได้ (HTTP 200)
- ย้ายมาครบ: 64 ไฟล์ใน `src/app`, ทุกหน้า, services, guards, translations,
  **ไฟล์ JSON ข้อมูลครบ** (`bases-bilingual.json`, `botany-route-*.json`), assets 78MB

---

## 2. สิ่งที่ตัดสินใจต่างจากของเดิม (ตั้งใจทำ)

| เรื่อง | เหตุผล |
|---|---|
| **คง `zone.js` ไว้** | Angular 22 default เป็น zoneless แต่โค้ดนี้พึ่ง zone อยู่ — `side-nav` เรียก `detectChanges()` บน timer, Leaflet callback แก้ state นอก Angular ถ้าเปลี่ยนเป็น zoneless **UI จะหยุดอัปเดตแบบเงียบ ๆ** |
| **ไม่ลง `@angular/fire` + `firebase`** | `@angular/fire@21` ยัง peer-depend `@angular/core@^21` + `typescript <6.0` ชนกับ Angular 22 และที่สำคัญ **โค้ดเดิมลงทะเบียน Firebase ไว้แต่ไม่มีไฟล์ไหนเรียกใช้เลย** |
| **ไม่ลง `ol` (OpenLayers)** | import 0 ที่ ในโปรเจ็คเดิม |
| **register service worker ที่เดียว** (`app.config.ts`) | ของเดิมลงทะเบียนทั้งใน `main.ts` และ `app.config.ts` ตัวหลังถูกทับ ทำให้ `isDevMode()` guard ไม่ทำงาน → dev ก็ติด SW |
| **`APP_INITIALIZER` → `provideAppInitializer()`** | API เดิมถูกถอดออกใน Angular 22 |
| **ลบ `RouterLink` ที่ไม่ได้ใช้** ใน stress-questionnaire | NG8113 warning |

---

## 3. งานที่กำลังทำค้างอยู่ — ระบบหลายสถานที่ (Multi-site)

### บริบท / ผลการวิเคราะห์

**backend ออกแบบรองรับหลายสถานที่ไว้แล้ว** (ดู `D:\work formony\BotanyAPI`):

```
MajorLocation ──< Checkpoint ──< CheckpointQuestion
                      │         ──< CheckpointActivity
                      │         ──< CertificateField (มี MajorLocationId ของตัวเอง)
                      └── MajorLocationId
```

และ `missions.component` แตกการแสดงผลตาม `type` 5 แบบ
(`question_forest_bathing`, `activity_forest_bathing`, `activity_forest_bathing_photo`,
`question_botany`, `writing_reflection`)
→ **แอปเป็น engine ที่ขับเคลื่อนด้วยข้อมูลอยู่แล้ว เพิ่มสถานที่ = เพิ่มข้อมูล ไม่ต้องเขียนโค้ดใหม่**

### ❌ สรุป: ไม่ควรแยกเป็น 3 โปรเจ็ค

บั๊กทุกตัวจะต้องแก้ 3 รอบ deploy 3 ชุด และไม่ได้แยกจริงเพราะยังใช้ API + ฐานข้อมูลเดียวกัน

### ✅ แนวทางที่เลือก: QR deep link เป็นทางหลัก + portal เป็นทางรอง

```
QR ที่ทางเข้าเขาช่อง   →  /s/kachong         → เข้าแผนที่เลย
QR ที่ทุ่งค่าย         →  /s/thungkhai       → เข้าแผนที่เลย
เปิดเว็บจากที่บ้าน     →  /  (portal 3 การ์ด) → เลือกเอง
```

**เหตุผล:** ผู้ใช้ยืนอยู่ที่สถานที่นั้นอยู่แล้ว การให้เลือกจาก 3 ไอคอนคือถามคำถามที่บริบทตอบให้แล้ว
และ **login ควรเลื่อนไปอยู่ตอนจะออกใบเกียรติบัตร** ไม่ใช่บังคับตั้งแต่หน้าแรก

### เหตุผลที่ไม่เปลี่ยน route เป็น `/:site/...`
มี `router.navigate` / `routerLink` **27 จุดใน 16 ไฟล์** การเปลี่ยนทั้งหมดเสี่ยงเกินไป
→ ใช้ **site เก็บใน service + deep-link route `/s/:slug`** แทน (route เดิมคงรูปแบบแบน)
ถ้าจะอัปเกรดเป็น path-based เต็มรูปแบบทีหลังค่อยทำแยก

### ✅ ทำไปแล้ว (ตรวจด้วยการรันจริงแล้วทุกข้อ ยกเว้นที่ระบุไว้)

- [x] **`src/app/config/sites.config.ts`**
  mock data ครบ 3 สถานที่ (kachong `open`, thungkhai `coming-soon`, forest-of-play `coming-soon`)
  โครงสร้าง field ตั้งใจให้ตรงกับ `MajorLocation` ใน API เพื่อสลับไปใช้ HTTP ได้โดยไม่เปลี่ยน shape
  มี `slug`, `majorLocationId`, `name/area/summary` (th/en), `theme`, `stats`, `certificate`, `checkpointSource`

- [x] **`src/app/services/site.service.ts`**
  signal `current`, `slug()`, `select()`, `clearSelection()`, `isOpen()`
  เก็บค่าใน key กลาง `app.currentSite` และ**คุยกับ localStorage ตรง ๆ** ไม่ผ่าน StorageService
  (เพราะ StorageService ต้องถามหา prefix จากตัวนี้ — ถ้าเรียกกลับจะเป็น cycle)
  `applyTheme()` เปลี่ยนสี `<meta name="theme-color">` + CSS var ตามสถานที่

- [x] **🔴 แยก localStorage ตามสถานที่ — ทำแล้วใน `storage.service.ts`**
  - เพิ่ม `scoped()` เติม prefix `site:{slug}:` — แก้จุดเดียวครอบคลุมทั้งแอป
    เพราะทุก caller ผ่าน `getItem`/`setItem`/`removeItem` อยู่แล้ว
  - `GLOBAL_KEYS` (ไม่ scope): `username`, `authToken`, `selectedLanguage`,
    `hasSelectedLanguage`, `app.currentSite`, `appVersion` + prefix `consent.`
  - **เขียน `clearAllExcept()` ใหม่** — เดิมใช้ `localStorage.clear()` ซึ่งจะล้างทุกสถานที่
    ตอนนี้ลบเฉพาะ key ที่ขึ้นต้นด้วย `site:{สถานที่ปัจจุบัน}:`
  - ⚠️ **ยังไม่ได้ทดสอบ end-to-end** — ตรวจแล้วว่า key ถูกเขียนเป็น `site:kachong:...` จริง
    แต่ยังไม่ได้เดินจนจบทริปเพื่อดูว่า `clearAllExceptUserPrefs()` ไม่ไปแตะข้อมูลสถานที่อื่น
    **ควรทดสอบข้อนี้ก่อนใช้จริง**

- [x] **แก้บั๊ก P0 #4 (ภาษาหายตอนจบทริป)** ไปพร้อมกัน
  `clearAllExceptUserPrefs()` เก็บ `selectedLanguage`, `hasSelectedLanguage`, `app.currentSite` แล้ว

- [x] **`src/app/pages/portal/portal.component.ts`** — หน้าเลือกสถานที่
  การ์ด 3 ใบ responsive (1 คอลัมน์บนมือถือ → 3 คอลัมน์ที่ ≥720px), ธีมสีต่อสถานที่,
  badge "เร็ว ๆ นี้", stats (จุด/กม./นาที), รองรับ `prefers-reduced-motion`
  ใช้ **grid gap** (iOS 10.3+) ไม่ใช่ flex gap (ต้อง 14.1+) และใช้ margin แทน gap ในแถว stats
  **ไม่ใช้รูปโปสเตอร์เป็นภาพการ์ด** — ไฟล์ละ 2.4MB และครอปออกมาเป็นพื้นที่ขาว
  เปลี่ยนเป็น SVG glyph ตามสีสถานที่แทน (เบากว่ามากและดูตั้งใจ)

- [x] **`src/app/guards/site-entry.guard.ts` + route**
  `/s/:slug` → เลือกสถานที่แล้วเด้งไป `/home` · slug ผิด → เด้งไป portal
  `/` เปลี่ยนจาก redirect ไป login เป็น **หน้า portal**
  **ทดสอบแล้ว:** `/s/kachong` → `/home` + `app.currentSite=kachong` + theme `#15803d` ✓
  `/s/not-a-real-site` → `/` ✓

- [x] **🔴 แก้บั๊ก P0 #1 — route guards ที่ไม่เคยทำงาน (แก้ผิดไป 1 รอบก่อนจะถูก)**
  - ❌ แบบเดิม `() => import(...).then(m => m.guard)` → คืน**ตัวฟังก์ชัน** Angular ไม่รู้จักเลยปล่อยผ่าน
  - ❌ แก้ครั้งแรกเป็น `(route, state) => import(...).then(m => m.guard(route, state))`
    → guard ถูกเรียกใน `.then()` ซึ่ง**อยู่นอก injection context** → `inject()` โยน **NG0203**
  - ✅ แบบที่ถูก: **import แบบ static แล้วใส่ตรง ๆ** `canActivate: [AuthGuard, inRadiusGuard]`
    ไฟล์ guard เล็กกว่า 1.2kB ทั้งคู่ การ lazy load ไม่ได้ประโยชน์อะไรเลย
  - **ทดสอบแล้ว:** 0/17 checkpoint → `/certificate` เด้งไป `/map` ✓ ·
    `inRadius=false` → `/missions` เด้งไป `/map` ✓ · ไม่มี NG0203 แล้ว ✓

---

## 4. 🔴 สิ่งที่ยังต้องทำ (เรียงตามลำดับที่ควรทำ)

### 4.1 Multi-site — งานที่เหลือ

- [ ] **ทดสอบ 2 ข้อที่ทำไปแล้วแต่ยังไม่ได้ยืนยัน** (ดูหัวข้อ 3)
  1. `clearAllExceptUserPrefs()` ไม่แตะข้อมูลสถานที่อื่น
  2. route guards บล็อกได้จริงหลังแก้

- [ ] **ย้าย branding ที่ hardcode เป็นข้อมูลจาก site**
  - hardcode "Kachong/กะช่อง" **15 จุดใน 4 ไฟล์**:
    `pages/certificate/certificate.component.ts`, `pages/home/home.component.html`,
    `services/certificate-pdf.service.ts`, `services/translations.ts`

- [ ] **`base-data.service.ts` อ่าน checkpoint ตาม site**
  - ตอนนี้บรรทัด 8 **`import basesBilingual from '.../bases-bilingual.json'` ตอน build**
  - ต้องเปลี่ยนเป็นอ่านจาก `site.checkpointSource` + cache ลง storage (ต้องใช้ออฟไลน์ได้ในป่า)

### 4.1b เข้าหน้า /missions ตอนพัฒนา

หน้า `/missions` ผูกกับ `inRadiusGuard` ซึ่งเปิดได้เฉพาะตอนอยู่ในรัศมี checkpoint จริง
(หน้านี้แสดงภารกิจของจุดที่ยืนอยู่ เปิดจากที่อื่นก็ไม่มีอะไรให้แสดง)

- **ตอนพัฒนา (`ng serve`)** guard ปล่อยผ่านให้อัตโนมัติ พร้อม `console.warn` บอกเหตุผล
  เพราะนั่งที่โต๊ะไม่มี GPS fix จึงไม่มีทางเข้าหน้านี้ได้เลย
- **ตอน production** ยังบังคับตามเดิม
- ถ้าอยากทดสอบเงื่อนไขจริงใน dev ให้ตั้งค่านี้ใน console (สังเกตว่า key มี prefix สถานที่):
  ```javascript
  localStorage.setItem('site:kachong:inRadius', 'true')
  ```
- เมนูข้าง + เมนูล่าง **ปิดปุ่ม ภารกิจ พร้อม tooltip** เมื่อยังไม่ถึง checkpoint
  (เดิมโชว์ปุ่มตลอดแล้วให้ guard เด้งกลับเฉย ๆ ซึ่งดูเหมือนแอปพัง)

### 4.1c ระบบดีไซน์ "อาบป่า" (ทำแล้วบางส่วน)

- [x] **design token กลางใน `src/styles.scss`** — ไม่ได้ไปแก้หน้าไหนเอง หน้าไหนจะใช้ค่อย opt-in
  - สี: canopy / forest / moss / leaf / fern / mist / morning + bark, sunlight, dapple
  - เงาแบบร่มไม้ (`--shadow-rest/lift/float`) ไม่ใช่ drop shadow แข็ง ๆ
  - motion: `--ease-settle` (ค่อย ๆ นิ่ง ไม่เด้ง) + `--t-quick/base/slow/drift`
  - keyframes ใช้ซ้ำได้: `forest-rise`, `forest-fade`, `forest-drift`, `forest-sway` + คลาส `.u-rise`
  - focus ring ชัดทั่วเว็บ (สำคัญตอนใช้กลางแดด) + `prefers-reduced-motion` ปิดทุกอย่างทั้งก้อน
- [x] **หน้า portal ออกแบบใหม่ทั้งหน้า**
  - บรรยากาศแสงลอดใบไม้: radial-gradient 3 ก้อนลอยช้า ๆ **ไม่ใช้ `filter: blur()`**
    (blur ที่ขยับทุกเฟรมทำให้เครื่องวาดใหม่ทั้งจอ ซึ่งแพงมากบนมือถือที่กำลังจับ GPS อยู่)
  - เงาแนวต้นไม้ด้านล่างเป็น SVG path
  - หัวเรื่อง + การ์ดทยอยปรากฏแบบ stagger · ใบไม้แต่ละใบแกว่งคนละจังหวะ
  - ใช้แค่ transform/opacity เพื่อให้อยู่บน compositor
- [x] **เปลี่ยนธีมทั้งแอปเป็น "อาบป่า" แล้ว (2026-11-12)**
  - ฟอนต์: `Noto Sans Thai` (เนื้อหา) + `Prompt` (หัวข้อ/เมนู) จาก Google Fonts ใน `index.html`
    cache ผ่าน `dataGroups.fonts` ใน `ngsw-config.json` (ใช้ออฟไลน์ได้หลังเปิดครั้งแรก)
  - `components/forest-backdrop` — พื้นหลังป่าเคลื่อนไหวอยู่หลังทุกหน้า (ใส่ใน `app.component`)
    ต้นไม้ 3 แถวโยกคนละจังหวะ, ลำแสง, หมอก, ใบไม้ร่วง, ละอองแสง — transform/opacity ล้วน,
    ปิดหมดเมื่อ `prefers-reduced-motion`
  - top bar + sidebar + bottom nav เป็นแผงสีเขียวป่าเข้ม, เมนู active = พื้นกระดาษ + แถบทอง
  - สีม่วง/น้ำเงิน/เทาเดิมทั้งหมดใน `src/app` ถูก map เป็นพาเลตป่า (ยกเว้น `services/certificate-pdf`)
  - redesign เต็ม: login, language picker, home (hero + วงแหวนความคืบหน้า), map, missions, portal
  - portal ใช้รูปจริงของทุ่งค่าย / Forest of Play และตั้งจำนวนฐานเป็น 24 ทั้งสองที่
  - ⚠️ budget style ของ `missions.component.ts` เหลือเผื่อแค่ไม่กี่ byte (12kB) ถ้าเพิ่ม style อีกควรย้ายไป scss แยก

### 4.2 Consent

- [x] **`consent.service.ts`** — เก็บคำตอบ 2 เรื่องแยกกัน (`storage`, `location`)
  ใช้ key `consent.*` ซึ่ง StorageService กันเป็น global ไม่ scope ตามสถานที่
  คุยกับ localStorage ตรง ๆ (เพราะ StorageService ต้องถามตัวนี้ว่าเขียนได้ไหม)
- [x] **`consent-banner.component.ts`** — PDPA banner ไทย/อังกฤษ มีปุ่ม **ยินยอม / ไม่ยินยอม จริง**
  กาง "ดูรายละเอียด" บอกว่าเก็บอะไรบ้าง · safe-area inset สำหรับ iPhone มีติ่ง · tap target 46px
- [x] **ทำให้ consent มีผลจริง ไม่ใช่แค่ UI**
  - ยังไม่ตอบ / ไม่ยินยอม → `StorageService` เขียนลง **Map ในหน่วยความจำ** แทน localStorage
  - ยินยอม → `flushPendingWrites()` ย้ายของที่ค้างในหน่วยความจำลงเครื่อง
  - ไม่ยินยอม → `forgetStoredData()` **ลบข้อมูลเดิมในเครื่องทิ้ง** เหลือแค่ `consent.storage`
    **ทดสอบแล้ว:** กดไม่ยินยอม → localStorage เหลือ key เดียวจริง ✓
  - ⚠️ บทเรียน: ตอนแรกผมไป gate **การอ่าน** ด้วย ทำให้แอปอ่านภาษาที่เก็บไว้ไม่ได้ →
    หน้าเลือกภาษาขึ้นค้างตลอด **consent คุมแค่การเขียน การอ่านต้องปล่อยผ่าน**
- [x] **banner รอจนเลือกภาษาเสร็จก่อน** — ไม่งั้นถามความยินยอมด้วยภาษาที่ผู้ใช้ยังไม่ได้เลือก

- [x] **หน้าอธิบายก่อนขอสิทธิ์ตำแหน่ง — ทำแล้ว (2026-11-12)**
  primer "ก่อนเริ่มเดิน" ใน `home.component` → ปุ่ม "อนุญาตตำแหน่งและเริ่มเดิน" เรียก
  `beginTracking()` ภายใน tap เดียวกัน + `setLocationConsent('granted')`
  ถ้า Android บอก `denied` อยู่แล้ว / เปิดใน in-app browser → ข้าม prompt ไปโชว์วิธีแก้เลย

- [x] **Optimize: ไม่แลค + เน็ตช้าก็ใช้ได้ โดยกราฟิกยังอยู่ครบ (2026-11-12)**
  วัดจริงก่อนแก้ทุกข้อ:
  - **ต้นเหตุแลคตัวจริงไม่ใช่กราฟิก** — เมนูข้าง/ล่างและ Home `JSON.parse` ข้อมูล `missions`
    (มีรูป base64 ~2 MB) ทุกรอบ change detection + ทุกวินาที → ~2 ms/ครั้งบน desktop (มือถือ ~10 ms)
    และ CD เกิดทุก GPS fix + ทุก touchmove ตอนลากแผนที่ → แก้ด้วย `StorageService.getMissionsSnapshot()`
    (parse ใหม่เฉพาะเมื่อข้อความเปลี่ยน) เหลือ **~0.01 ms** · timer 1 วินาทีย้ายออกนอก zone
  - **พื้นหลังป่า**: ต้นไม้เดิมเป็น `<g>` ใน SVG ใหญ่ → repaint ทั้งจอทุกเฟรม · ตอนนี้แต่ละต้นเป็น
    `<svg>` เล็กของตัวเอง ขยับด้วย CSS transform บน GPU (ภาพเหมือนเดิมทุกอย่าง) · หยุดขยับบนหน้าแผนที่
  - **ลากแผนที่**: `html.map-moving` หยุดอนิเมชันตกแต่งทั้งหมดระหว่างลาก/ซูม
  - **Lite mode อัตโนมัติ** (`performance-mode.service.ts`): Data Saver / 2G / RAM ≤ 2 GB /
    วัดเฟรมจริงแล้วช้ากว่า ~26 ms → ป่าและตัวละครยังอยู่ แค่หยุดโยก/ใบไม้ร่วง/เอฟเฟกต์ · สลับเองได้ที่ `/check`
  - **เน็ตช้า (ทดสอบจำลอง 3G ~400 kbps)**: จอขาว **15 วินาที → เห็นหน้าใน 0.56 วินาที**
    (`leaflet.js` เป็น `defer`, โหลดฟอนต์แบบไม่บล็อก, splash ใน `index.html`)
  - โปสเตอร์ Home PNG 2.4 MB → JPEG **267 kB** (ขนาดภาพเท่าเดิม) + ภาพตัวอย่างเบลอ 1 kB ระหว่างโหลด
  - **แผนที่สัญญาณอ่อน**: service worker เก็บ tile ที่เคยเห็นแล้ว (`dataGroups.map-tiles`, 1500 tiles, 7 วัน)
    ต้องเปิด `crossOrigin` ไม่งั้น opaque response ถูกนับ ~7 MB/tile จน quota เต็ม
    ⚠️ **ไม่ได้ดาวน์โหลด tile ล่วงหน้า** — นโยบาย OSM ห้าม bulk download ถ้าต้องการออฟไลน์ทั้งเส้นทาง
    ต้องทำ tile ของตัวเอง (เช่น PMTiles) · ตรวจ SW จริงในเบราว์เซอร์ preview ไม่ได้ (ไม่รองรับ SW) ต้องลองบนมือถือ

- [x] **ลดการกดจาก QR → เริ่มเดิน เหลือ 2 ครั้ง (2026-11-12)** — เดิม ~16 ครั้ง + พิมพ์ + รออีเมล
  - **เลื่อน login ไปตอนรับเกียรติบัตร**: เอา `AuthGuard` ออกจาก home / map / missions / mobile
    (API ไม่มี `[Authorize]` ในส่วนที่ใช้ระหว่างเดิน) · certificate / certificate-summary / gallery
    ยังต้อง login → `/login?returnUrl=...` แล้วเด้งกลับ · ปุ่ม "หยุด" ที่ home ถ้ายังไม่ login
    → ไป login แล้วกลับมา `/home?finish=1` ทำขั้นตอนจบต่ออัตโนมัติ
  - หน้า login ตอนจบเปลี่ยนหัวเป็น "รับเกียรติบัตรของคุณ" · ใส่รหัส 6 หลักครบ/autofill → ยืนยันเองไม่ต้องกด
  - ไม่โชว์หน้าเลือกภาษา (ใช้ภาษาเครื่องอัตโนมัติ เปลี่ยนได้ที่ปุ่ม EN/ไทย ด้านบน)
  - ไม่เด้งแบบประเมินก่อนเดิน → เป็นปุ่ม "แบบประเมินก่อนเดิน (ไม่บังคับ)" ข้างปุ่มเริ่ม
  - ไม่โชว์แบนเนอร์ consent บน /home → ปุ่ม "เริ่มต้น" = ยินยอม (มีข้อความระบุ + ลิงก์ "ไม่ยินยอม")
  - ไม่เด้ง tutorial / primer → ข้อความ 3 ข้อแสดงบนหน้า Home เหนือปุ่มเริ่ม · ปุ่มเริ่มย้ายขึ้นเหนือโปสเตอร์
  - ⚠️ **ผลข้างเคียงที่ต้องรู้:** ตาราง `Visitors` ถูกเพิ่มตอน verify login → ตอนนี้นับเฉพาะคน**ที่เดินจบและรับเกียรติบัตร**
    ถ้าต้องการนับคนเริ่มเดินด้วย ต้องเพิ่ม endpoint นับแบบไม่ระบุตัวตน (ฝั่ง API)
  - ⚠️ แบบประเมินก่อนเดินไม่ได้ถูกเสนออัตโนมัติแล้ว — ถ้างานวิจัยต้องการให้ทุกคนเห็น ให้แจ้ง จะทำเป็นข้อความเด่นแทน popup

- [x] **ระบบวินิจฉัยปัญหาเครื่องแบบเคสต่อเคส (2026-11-12)** — ดู `docs/device-permissions-playbook.md`
  - `config/device-help.ts` — 17 เคส: สาเหตุ + ขั้นตอนแยก iOS / Android (ไทย/อังกฤษ)
  - `services/device-check.service.ts` — ตรวจจับ env, แปลง geolocation error code / accuracy /
    storage error เป็นเคส, Screen Wake Lock ระหว่างเดิน, จับ `beforeinstallprompt`
  - `components/device-help-sheet` — popup เดียวใช้ทุกเคส (โหลดแบบ `@defer (on idle)`)
  - หน้า `/check` ตรวจความพร้อมเครื่อง (ไม่ต้องล็อกอิน) + ทดสอบ GPS จริง + รหัสแจ้งเจ้าหน้าที่
  - `index.html`: LINE → `?openExternalBrowser=1` อัตโนมัติ · iOS < 15 → ข้อความแทนหน้าขาว
  - `StorageService.setItem` และการบันทึกเส้นทาง GPS **ไม่เงียบแล้ว** เมื่อพื้นที่เต็ม/ถูกบล็อก
  - ⚠️ ยังไม่ได้ทดสอบบน iPhone จริง — ทดสอบตามตารางข้อ 7 ใน playbook

### 4.3 Optimize / รองรับอุปกรณ์

- [x] **`.browserslistrc`** — สร้างแล้ว
  🔴 **ข้อค้นพบสำคัญ: Angular 22 ตั้งเป้าต่ำสุดได้แค่ iOS 15**
  ทดสอบจริงแล้ว iOS 12.2 / 13 / 14 **ล้มหมด** ด้วย error จาก esbuild:
  `Transforming destructuring to the configured target environment is not supported yet`
  (491 errors) ส่วน iOS 15 → 0 errors
  **ผลกระทบ:** iPhone X รองรับได้ถึง iOS 16.7 จึงใช้งานได้ถ้าอัปเดตแล้ว
  แต่เครื่องที่ค้าง iOS 12–14 จะ**เปิดแอปไม่ได้เลย** — ต่างจากโปรเจ็คเดิม (Angular 19) ที่ตั้ง 12.2 ได้
  ถ้าจำเป็นต้องรองรับต่ำกว่านี้ **ต้องอยู่กับ Angular 19 ต่อ**
- [x] **`ngsw-config.json`** — เพิ่ม asset group `trail-data` แบบ `prefetch`
  สำหรับ `/assets/bases/*.json` + `/assets/route/*.json` (รวม ~138KB) และเพิ่ม `.mp3` ใน lazy group
  ลบ `/index.csr.html` ที่เป็นของเหลือจาก SSR ออก
- [ ] ลบ asset ที่ไม่ถูกอ้างถึง — `src/assets` 78MB แต่ **~65MB ไม่มีอะไร import**
  (`forest-bathing-trail-home-*-old*.png` ใหญ่ถึง 14MB/ไฟล์, `checkpoint-soundtrack-old.mp3` 4.5MB)
- [ ] ยังไม่มี `.dockerignore` → image จะบวมตาม

---

## 5. ⚠️ บั๊กที่ยกมาจากโปรเจ็คเดิม (ยังไม่ได้แก้ในนี้)

ตรวจพบและ**ยืนยันด้วยการรันจริง**ในโปรเจ็คเดิม — ยังมีอยู่ในโค้ดที่ย้ายมา

### 🔴 P0

1. **Route guards ไม่ทำงานเลยทั้งสองตัว** — `app.routes.ts`
   ```ts
   canActivate: [AuthGuard, () => import('./guards/in-radius.guard').then(m => m.inRadiusGuard)]
   ```
   รูปแบบนี้คืน **ตัวฟังก์ชัน** ไม่ใช่ผลลัพธ์ Angular เลยปล่อยผ่าน
   **ทดสอบจริงแล้ว:** ตั้ง 0/17 checkpoint → เปิด `/certificate` **เข้าได้ ออกใบเกียรติบัตรได้**
   และ `inRadius=false` → เปิด `/missions` **เข้าได้**
   แก้: `(route, state) => import('...').then(m => m.inRadiusGuard(route, state))`

2. **หน้าต่างภารกิจบนแผนที่กด "เสร็จสิ้น" ไม่ได้เลย** — `map.component.html:86`
   `<textarea>` ไม่มี `[(ngModel)]` → `answer` undefined ตลอด → ปุ่มติด `[disabled]` ถาวร
   (ข้อความในกล่องนี้ยัง hardcode ภาษาไทยทั้งหมดด้วย)

3. **ปุ่ม "มาเริ่มต้นกันเลย" ปิด tutorial ทั้งหมด** — `home.component.ts:178`
   เรียก `markIntroChoice(false)` → เขียน `tutorial_enabled='false'`
   คนกดขอดูคำแนะนำได้ผลตรงข้าม (มี key `tutorialSkip` อยู่แต่ไม่ได้ render ปุ่ม)

### 🟠 P1

4. **จบทริปแล้วภาษาหาย** — `storage.service.ts:123`
   comment บอกว่าเก็บภาษาไว้ แต่โค้ดคือ `clearAllExcept(['username','authToken'])`
   → `selectedLanguage` / `hasSelectedLanguage` ถูกลบ → เด้งกลับเป็นอังกฤษ + ถามภาษาใหม่

5. **`hasLiveFix` ไม่ถูกรีเซ็ตตอน `stop()`** — `location-tracking.service.ts`
   หลัง stop→start พิกัดเก่าอาจ trigger checkpoint ก่อนได้ fix ใหม่

6. **Checkpoint 17 ทำให้ "ครบทุกด่าน" กระพริบ** — map เขียนกลับ 17 รายการ แต่ missions เก็บ 16
   → `every(m => m.reached)` เดี๋ยว true เดี๋ยว false

7. **`version.service.ts` บล็อกการบูต** — `provideAppInitializer` + `timeout(5000)`
   ถ้า API ล่ม **ผู้ใช้เห็นหน้าขาว 5 วินาทีทุกครั้งที่เปิดแอป**
   (คงไว้ตามเดิมโดยตั้งใจ เพราะเปลี่ยนแล้วลำดับการล้างข้อมูลเก่าจะเปลี่ยน — แก้แยกทีหลัง)

8. **`version.service.ts` ล้างข้อมูลซ้ำทุก reload** ถ้า server version ใหม่กว่า bundle
   บรรทัดสุดท้ายเขียน `setStoredVersion(appVersion)` ซึ่งเป็นค่าเก่า → รอบหน้าเข้าเงื่อนไขอีก
   ⚠️ **ตอนนี้ยังไม่ระเบิดเพราะ API คืน `{version: null}` — แต่วันที่ใส่ค่า `AppVersion` จริงจะระเบิดทันที**

### 🟡 P2

9. **Polling 1 วินาที 2 จุด** — `home.component.ts:143` และ `side-nav.component.ts:316`
   parse `missions` ทั้งก้อน (อาจมีรูป base64 ระดับ MB) ทุกวินาที + สั่ง change detection
   เป็นต้นตอ **NG0506 (hydration ไม่เสร็จ)** และกินแบตตลอดการเดิน
   `side-nav` ยังใส่ `addEventListener('storage')` โดยไม่ถอดใน `ngOnDestroy`

---

## 6. ข้อมูลสภาพแวดล้อมที่ควรรู้

### คำสั่ง
```bash
cd "D:/work formony/ForestBatting"
npm start          # ng serve --host 0.0.0.0 --port 4200
npm run build      # production build
```
> ตอนทดสอบใช้ port 4300 เพื่อไม่ชนกับโปรเจ็คเดิม:
> `npx ng serve --port 4300`

### Angular 22 ที่ต่างจาก 19
- **ไม่มี zone.js มาให้** — ต้องใส่ `"polyfills": ["zone.js"]` ใน `angular.json` เอง (ทำแล้ว)
- `APP_INITIALIZER` ถูกถอด → ใช้ `provideAppInitializer()`
- มี `provideBrowserGlobalErrorListeners()` ตัวใหม่
- TypeScript ~6.0.2, test runner เป็น **vitest**
- Node ขั้นต่ำ `^22.22.3` (เครื่องนี้มี 22.22.3 พอดี — **อย่าดาวน์เกรด Node**)

### `angular.json` ที่ปรับไว้แล้ว
- `assets`: `public`, `src/assets` → `assets`, leaflet + locatecontrol → `vendor/`
- `polyfills: ["zone.js"]`
- `serviceWorker: "ngsw-config.json"` (production)
- `allowedCommonJsDependencies`: canvg, core-js, raf, rgbcolor, html2canvas, dompurify
- budgets: initial 700kB/1.5MB, component style 12kB/32kB

### git
**ยังไม่ได้ init** ตามที่ผู้ใช้แจ้งว่าจะทำเอง

---

## 7. เรื่องที่ค้างนอกโปรเจ็คนี้

### DNS — `botanydev.online` ชี้ผิดที่ (ยังไม่แก้)
```
ปัจจุบัน:  botanydev.online → 76.223.67.189 , 13.248.213.45   (GoDaddy forwarding)
ควรเป็น:   botanydev.online → 119.59.99.26                     (เครื่อง metrabyte)
```
**ยืนยันแล้ว:** ยิงตรงไป `119.59.99.26` ได้ `200` แต่ผ่านโดเมนได้ `504`
→ stack ทั้งหมดปกติ ปัญหาอยู่ที่ DNS ล้วน ๆ
DNS อยู่ที่ **GoDaddy** (`ns51/ns52.domaincontrol.com`) — ต้องปิด Domain Forwarding + ตั้ง A record

### API (`D:\work formony\BotanyAPI`) — ยังไม่แก้
- `app.UseHttpsRedirection()` **ถูกเรียกซ้ำ 2 ครั้ง** (Program.cs:40 และ :60) — log ยืนยันแล้ว
  และไม่ควรมีเลยเพราะอยู่หลัง Traefik ที่จบ TLS แล้ว
- ลำดับ middleware กลับหัว — `UseRouting`/`UseCors`/`UseAuthentication` อยู่**หลัง** `MapGet`
- `docker-compose`: `botany-api` ใช้ `${DB_PASSWORD}` แต่ service `db` hardcode `botanypass`

### Dockerfile ของ Botany เดิม — build พัง
`sed` หา `https://localhost:7134/api` ซึ่งไม่มีในไฟล์แล้ว → `grep -q` fail
ทางแก้: เปลี่ยนเป็นแทนทั้งบรรทัดแทนการ match ค่าเดิม
```dockerfile
RUN sed -i "s#^const API_URL = '.*';#const API_URL = '${API_URL}';#" src/environments/environment.ts \
    && grep -q "const API_URL = '${API_URL}';" src/environments/environment.ts
```

---

## 8. คำถามที่ยังรอผู้ใช้ตัดสินใจ

1. **"Forest of Play" เป็นกิจกรรมอาบป่าเหมือนกันไหม** — ถ้าคนละคอนเซปต์ อาจต้องมี
   checkpoint type ใหม่ + ใบเกียรติบัตรคนละแบบ **กระทบขอบเขตงานมากที่สุด**
2. **ใบเกียรติบัตรแยกต่อสถานที่ หรือมีใบรวม "เดินครบ 3 ที่"**
3. **เดินค้างหลายสถานที่พร้อมกันได้ไหม** — กระทบการออกแบบ storage ข้อ 4.1
4. **ผู้ดูแลแต่ละสถานที่แยกกันไหม** — ถ้าใช่ `AdminController` ต้องมี scope ต่อ location

---

## 9. เตรียมทำ PWA + Push Notification

> **สถานะ 2026-11-12:** ส่วน PWA/การติดตั้งทำแล้ว (ปุ่มติดตั้งแตะเดียวบน Android, คู่มือ iOS,
> เตือนข้อมูลแยกเมื่อเปิดจากหน้าจอโฮม — อยู่ในหน้า `/check`)
> **Push ยังไม่ทำ — รอคีย์ Firebase ที่เจ้าของโปรเจ็คต้องสมัครเอง** และควรตัดสินใจก่อนว่าต้องการจริงไหม
> (ดู `docs/device-permissions-playbook.md` ข้อ 5–6)

### คีย์ที่ต้องไปสมัคร/สร้าง
1. **Google Account ใหม่** → เปิด 2-Step Verification ทันที
2. **Firebase Project** → Add Web app → ได้ `firebaseConfig` 6 ค่า
   (`apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId`)
3. **VAPID Key** → Project Settings › Cloud Messaging › Web configuration › Generate key pair
4. **Service Account JSON** → Project Settings › Service accounts › Generate new private key
   (**ห้ามเข้า git** เก็บเป็น secret เท่านั้น — ใช้กับ BotanyAPI)
5. **Gmail App Password** (16 ตัว) → myaccount.google.com › Security › App passwords
   ต้องเปิด 2FA ก่อน และ**ไม่ใช่รหัสผ่านบัญชี**

### ⚠️ ข้อจำกัด iOS ที่ต้องรู้ก่อนลงทุน
- Web Push ใช้ได้เฉพาะ **iOS 16.4+**
- **ต้อง "Add to Home Screen" ก่อนเท่านั้น** — เปิดใน Safari ธรรมดาไม่มี Notification API เลย
- PWA ที่ติดตั้งมี **localStorage คนละถังกับ Safari** → ความคืบหน้าที่เดินไว้จะหาย

**ข้อคิด:** notification ใช้แจ้งตอนถึง checkpoint ซึ่งผู้ใช้เปิดแอปดูแผนที่อยู่แล้ว
→ in-app alert + `navigator.vibrate` (มีในโค้ดแล้ว) ทำงานได้ทุกเครื่องโดยไม่ต้องตั้ง Firebase เลย
Push จะคุ้มก็ต่อเมื่อต้องยิงหาผู้ใช้**ตอนไม่ได้เปิดแอป**

### เมื่อจะเริ่มทำจริง
- `npm install firebase` — ใช้ SDK ตรง ๆ ไม่ต้องรอ `@angular/fire` (SDK ไม่ผูกกับ framework)
- สร้าง `public/firebase-messaging-sw.js` — **ต้องอยู่ที่ root** ไม่งั้น FCM หาไม่เจอ
- ฝั่งเซิร์ฟเวอร์ใช้ **FCM HTTP v1 API** (Server Key แบบเก่าถูกยกเลิกแล้ว)
