/**
 * Every device / permission problem the trail can run into, with what to tell the visitor.
 *
 * One entry per *cause*, not per symptom: "the dot on the map does not move" has four
 * different causes, and each needs different steps. DeviceCheckService decides which one
 * applies; this file only says what to show. Steps are per platform because the menus on an
 * iPhone and an Android phone have nothing in common.
 *
 * The full reasoning (how each case is detected, what staff at the entrance can do) lives in
 * docs/device-permissions-playbook.md — keep the two in step.
 */

export type Lang = 'th' | 'en';
export type Text = Record<Lang, string>;
export type Platform = 'ios' | 'android' | 'other';

export type HelpIssueId =
  | 'in-app-browser'
  | 'insecure-context'
  | 'geo-unsupported'
  | 'geo-denied'
  | 'geo-unavailable'
  | 'geo-timeout'
  | 'geo-approximate'
  | 'tracking-paused'
  | 'storage-blocked'
  | 'storage-full'
  | 'storage-eviction'
  | 'offline'
  | 'camera-denied'
  | 'notifications-ios'
  | 'install-ios'
  | 'install-android'
  | 'ios-standalone-storage';

/** What the main button in the help sheet does. */
export type HelpAction =
  | 'retry-location'
  | 'open-external'
  | 'install'
  | 'reload'
  | 'open-check'
  | 'dismiss';

export interface HelpEntry {
  /** blocker = the trail cannot work; warn = it works badly; info = good to know. */
  severity: 'blocker' | 'warn' | 'info';
  icon: string;
  title: Text;
  /** One or two sentences on why this happens, without blaming the visitor. */
  cause: Text;
  steps: Partial<Record<Platform, Text[]>> & { other: Text[] };
  action?: { kind: HelpAction; label: Text };
}

const t = (th: string, en: string): Text => ({ th, en });

export const HELP: Record<HelpIssueId, HelpEntry> = {
  'in-app-browser': {
    severity: 'blocker',
    icon: '📱',
    title: t('กรุณาเปิดในเบราว์เซอร์ของเครื่อง', 'Please open this in your phone\'s browser'),
    cause: t(
      'ลิงก์นี้เปิดอยู่ในแอป (เช่น LINE, Facebook) ซึ่งมักไม่ให้ใช้ GPS และลบข้อมูลการเดินทิ้งเมื่อปิดหน้า',
      'This link opened inside another app (LINE, Facebook…), which often blocks GPS and wipes your walk when the page closes.',
    ),
    steps: {
      ios: [
        t('แตะปุ่ม "เปิดใน Safari" ด้านล่าง', 'Tap "Open in Safari" below'),
        t('ถ้าไม่ได้ผล: แตะ ⋯ หรือ ⤴ มุมขวา แล้วเลือก "เปิดใน Safari"', 'If that does not work: tap ⋯ or ⤴ in the corner and choose "Open in Safari"'),
        t('หรือสแกน QR ด้วยแอปกล้องของ iPhone แทน LINE', 'Or scan the QR code with the iPhone Camera app instead of LINE'),
      ],
      android: [
        t('แตะปุ่ม "เปิดใน Chrome" ด้านล่าง', 'Tap "Open in Chrome" below'),
        t('ถ้าไม่ได้ผล: แตะ ⋮ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์"', 'If that does not work: tap ⋮ at the top right and choose "Open in browser"'),
      ],
      other: [t('ใช้เมนูของแอปเลือก "เปิดในเบราว์เซอร์"', 'Use the app menu and choose "Open in browser"')],
    },
    action: { kind: 'open-external', label: t('เปิดในเบราว์เซอร์', 'Open in browser') },
  },

  'insecure-context': {
    severity: 'blocker',
    icon: '🔒',
    title: t('ต้องเปิดผ่าน https://', 'This page must be opened over https://'),
    cause: t(
      'เบราว์เซอร์อนุญาตให้ใช้ GPS เฉพาะเว็บที่ปลอดภัย (https) เท่านั้น',
      'Browsers only allow GPS on secure (https) pages.',
    ),
    steps: { other: [t('แจ้งเจ้าหน้าที่ — ลิงก์หรือ QR นี้ตั้งค่าผิด', 'Tell a staff member — this link or QR code is set up wrongly')] },
  },

  'geo-unsupported': {
    severity: 'blocker',
    icon: '🧭',
    title: t('เครื่องนี้ใช้ GPS ผ่านเว็บไม่ได้', 'This browser cannot use GPS'),
    cause: t(
      'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง',
      'This browser does not support location.',
    ),
    steps: {
      ios: [t('เปิดลิงก์นี้ใน Safari', 'Open this link in Safari')],
      android: [t('เปิดลิงก์นี้ใน Chrome', 'Open this link in Chrome')],
      other: [t('เปิดลิงก์นี้ใน Chrome หรือ Safari', 'Open this link in Chrome or Safari')],
    },
  },

  'geo-denied': {
    severity: 'blocker',
    icon: '📍',
    title: t('ยังไม่ได้อนุญาตให้ใช้ตำแหน่ง', 'Location is not allowed yet'),
    cause: t(
      'ระบบต้องรู้ตำแหน่งเพื่อเปิดภารกิจเมื่อคุณเดินถึงแต่ละฐาน ตอนนี้ตำแหน่งถูกปิดไว้ที่ตัวเครื่องหรือที่เบราว์เซอร์ (อาจเคยกด "ไม่อนุญาต" ไว้)',
      'The trail needs your location to open each checkpoint as you reach it. Location is turned off on the phone or blocked for this browser (perhaps "Don\'t Allow" was tapped earlier).',
    ),
    steps: {
      ios: [
        t('เปิด การตั้งค่า › ความเป็นส่วนตัวและความปลอดภัย › บริการหาตำแหน่ง → เปิด', 'Open Settings › Privacy & Security › Location Services → turn it On'),
        t('ในหน้าเดียวกัน เลื่อนหา "เว็บไซต์ Safari" → เลือก "ขณะใช้งานแอป"', 'On the same screen, find "Safari Websites" → choose "While Using the App"'),
        t('กลับมาที่ Safari แตะ "aA" ในช่องที่อยู่ › การตั้งค่าเว็บไซต์ › ตำแหน่ง → "อนุญาต"', 'Back in Safari, tap "aA" in the address bar › Website Settings › Location → "Allow"'),
        t('กลับมาหน้านี้แล้วกด "ลองอีกครั้ง"', 'Come back here and tap "Try again"'),
      ],
      android: [
        t('ลากแถบด้านบนจอลง → เปิด "ตำแหน่ง" (Location)', 'Pull down from the top of the screen → turn on "Location"'),
        t('ใน Chrome แตะไอคอน 🔒 หรือ ⚙ หน้าที่อยู่เว็บ › สิทธิ์ › ตำแหน่ง → "อนุญาต"', 'In Chrome, tap the 🔒 or ⚙ icon next to the address › Permissions › Location → "Allow"'),
        t('ถ้ายังไม่ได้: การตั้งค่าเครื่อง › แอป › Chrome › สิทธิ์ › ตำแหน่ง → "อนุญาตขณะใช้แอป"', 'If still blocked: phone Settings › Apps › Chrome › Permissions › Location → "Allow only while using the app"'),
        t('กลับมาหน้านี้แล้วกด "ลองอีกครั้ง"', 'Come back here and tap "Try again"'),
      ],
      other: [
        t('เปิดตำแหน่งในการตั้งค่าเครื่อง', 'Turn on location in the device settings'),
        t('อนุญาตตำแหน่งให้เว็บนี้ในเบราว์เซอร์', 'Allow location for this site in the browser'),
      ],
    },
    action: { kind: 'retry-location', label: t('ลองอีกครั้ง', 'Try again') },
  },

  'geo-unavailable': {
    severity: 'warn',
    icon: '🛰️',
    title: t('เครื่องยังหาตำแหน่งไม่ได้', 'The phone cannot find its position yet'),
    cause: t(
      'อนุญาตแล้ว แต่ GPS ยังจับสัญญาณไม่ได้ — มักเกิดเมื่ออยู่ใต้ต้นไม้หนาทึบ ในอาคาร หรือเปิดโหมดเครื่องบิน/ประหยัดพลังงาน',
      'Permission is fine, but GPS has no signal yet — common under dense canopy, indoors, or in airplane / low power mode.',
    ),
    steps: {
      ios: [
        t('ออกไปที่โล่งสักครู่ แล้วรอ 10–30 วินาที', 'Step into an open area for a moment and wait 10–30 seconds'),
        t('ปิดโหมดเครื่องบิน และปิด "โหมดพลังงานต่ำ" (ศูนย์ควบคุม)', 'Turn off Airplane Mode and Low Power Mode (Control Centre)'),
        t('เปิด Wi-Fi ไว้ (ไม่ต้องเชื่อมต่อ) ช่วยให้หาตำแหน่งเร็วขึ้น', 'Keep Wi-Fi switched on (no need to connect) — it speeds up the first fix'),
      ],
      android: [
        t('ออกไปที่โล่งสักครู่ แล้วรอ 10–30 วินาที', 'Step into an open area for a moment and wait 10–30 seconds'),
        t('ปิดโหมดเครื่องบิน และปิดโหมดประหยัดแบตเตอรี่', 'Turn off Airplane mode and Battery saver'),
        t('การตั้งค่า › ตำแหน่ง › เปิด "ความแม่นยำของตำแหน่ง Google"', 'Settings › Location › turn on "Google Location Accuracy"'),
      ],
      other: [t('ออกไปที่โล่งแล้วรอสักครู่', 'Move to an open area and wait a moment')],
    },
    action: { kind: 'retry-location', label: t('ลองอีกครั้ง', 'Try again') },
  },

  'geo-timeout': {
    severity: 'warn',
    icon: '⏳',
    title: t('สัญญาณ GPS อ่อน', 'GPS signal is weak'),
    cause: t(
      'เครื่องใช้เวลานานเกินไปในการหาตำแหน่ง ซึ่งปกติในป่าทึบ ระบบจะพยายามต่อเองโดยอัตโนมัติ',
      'The phone took too long to find its position, which is normal under thick forest. The app keeps trying on its own.',
    ),
    steps: {
      other: [
        t('เดินต่อช้า ๆ ไปยังจุดที่ท้องฟ้าเปิดกว่า', 'Keep walking slowly toward a spot with more open sky'),
        t('ถือโทรศัพท์ไว้ในมือ ไม่ใส่กระเป๋าลึก', 'Hold the phone in your hand rather than deep in a bag'),
        t('อย่าปิดหน้าจอระหว่างเดิน', 'Keep the screen on while walking'),
      ],
    },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'geo-approximate': {
    severity: 'warn',
    icon: '🎯',
    title: t('ตำแหน่งไม่แม่นยำ — เปิด "ตำแหน่งที่แม่นยำ"', 'Location is approximate — turn on "Precise Location"'),
    cause: t(
      'เครื่องส่งตำแหน่งแบบคร่าว ๆ (คลาดเคลื่อนเป็นกิโลเมตร) ทำให้ระบบรู้ไม่ได้ว่าคุณถึงฐานแล้ว',
      'The phone is sharing an approximate position (off by kilometres), so the trail cannot tell when you reach a checkpoint.',
    ),
    steps: {
      ios: [
        t('การตั้งค่า › ความเป็นส่วนตัวและความปลอดภัย › บริการหาตำแหน่ง', 'Settings › Privacy & Security › Location Services'),
        t('แตะ "เว็บไซต์ Safari" → เปิด "ตำแหน่งที่แม่นยำ"', 'Tap "Safari Websites" → turn on "Precise Location"'),
        t('กลับมาหน้านี้แล้วกด "ลองอีกครั้ง"', 'Come back and tap "Try again"'),
      ],
      android: [
        t('การตั้งค่า › แอป › Chrome › สิทธิ์ › ตำแหน่ง', 'Settings › Apps › Chrome › Permissions › Location'),
        t('เปิด "ใช้ตำแหน่งที่แม่นยำ"', 'Turn on "Use precise location"'),
        t('กลับมาหน้านี้แล้วกด "ลองอีกครั้ง"', 'Come back and tap "Try again"'),
      ],
      other: [t('เปิดตำแหน่งแบบแม่นยำในการตั้งค่าเครื่อง', 'Turn on precise location in the device settings')],
    },
    action: { kind: 'retry-location', label: t('ลองอีกครั้ง', 'Try again') },
  },

  'tracking-paused': {
    severity: 'info',
    icon: '🌙',
    title: t('การติดตามหยุดไประหว่างจอดับ', 'Tracking paused while the screen was off'),
    cause: t(
      'เมื่อจอดับหรือสลับไปแอปอื่น โทรศัพท์จะหยุดส่งตำแหน่งให้เว็บ ระยะทางช่วงนั้นอาจขาดหายและภารกิจจะไม่เด้ง',
      'When the screen turns off or you switch apps, the phone stops giving this page your position. Distance in that gap may be missing and checkpoints will not pop up.',
    ),
    steps: {
      ios: [
        t('เปิดหน้านี้ค้างไว้ขณะเดิน (ระบบพยายามกันจอดับให้แล้ว)', 'Keep this page open while walking (the app already tries to keep the screen awake)'),
        t('ถ้าจอยังดับเอง: การตั้งค่า › จอภาพและความสว่าง › ล็อคอัตโนมัติ → 5 นาที หรือ "ไม่ใช้"', 'If the screen still locks: Settings › Display & Brightness › Auto-Lock → 5 minutes or "Never"'),
      ],
      android: [
        t('เปิดหน้านี้ค้างไว้ขณะเดิน (ระบบพยายามกันจอดับให้แล้ว)', 'Keep this page open while walking (the app already tries to keep the screen awake)'),
        t('ถ้าจอยังดับเอง: การตั้งค่า › หน้าจอ › ระยะหมดเวลาหน้าจอ → 5–10 นาที', 'If the screen still turns off: Settings › Display › Screen timeout → 5–10 minutes'),
      ],
      other: [t('เปิดหน้านี้ค้างไว้ขณะเดิน', 'Keep this page open while walking')],
    },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'storage-blocked': {
    severity: 'blocker',
    icon: '🗂️',
    title: t('เครื่องไม่ยอมให้บันทึกความคืบหน้า', 'This browser will not save your progress'),
    cause: t(
      'มักเกิดจากการเปิดใน "โหมดส่วนตัว" หรือปิดคุกกี้/ข้อมูลเว็บไซต์ไว้ ถ้าปิดหน้านี้ความคืบหน้าจะหายทั้งหมด',
      'Usually caused by a Private tab or by blocking cookies / website data. If this page closes, all progress is lost.',
    ),
    steps: {
      ios: [
        t('ใน Safari แตะปุ่มแท็บ (สี่เหลี่ยมซ้อน) › เลือกกลุ่มแท็บปกติ ไม่ใช่ "ส่วนตัว" แล้วเปิดลิงก์ใหม่', 'In Safari, tap the Tabs button › switch from "Private" to normal tabs and open the link again'),
        t('การตั้งค่า › แอป › Safari → ปิด "ปิดกั้นคุกกี้ทั้งหมด"', 'Settings › Apps › Safari → turn off "Block All Cookies"'),
      ],
      android: [
        t('ปิดแท็บไม่ระบุตัวตน แล้วเปิดลิงก์ในแท็บปกติ', 'Close the Incognito tab and open the link in a normal tab'),
        t('Chrome › ⋮ › การตั้งค่า › การตั้งค่าเว็บไซต์ › คุกกี้ → อนุญาต', 'Chrome › ⋮ › Settings › Site settings › Cookies → Allow'),
      ],
      other: [t('เปิดในหน้าต่างปกติ (ไม่ใช่โหมดส่วนตัว) และอนุญาตคุกกี้', 'Use a normal (not private) window and allow cookies')],
    },
    action: { kind: 'reload', label: t('ตรวจอีกครั้ง', 'Check again') },
  },

  'storage-full': {
    severity: 'warn',
    icon: '💾',
    title: t('พื้นที่เก็บข้อมูลของเว็บเต็ม', 'Website storage is full'),
    cause: t(
      'รูปถ่ายและเส้นทางถูกเก็บในเครื่อง เบราว์เซอร์ให้พื้นที่ส่วนนี้จำกัด (ประมาณ 5 MB) ข้อมูลล่าสุดอาจไม่ถูกบันทึก',
      'Photos and your route are kept on the phone, and browsers only allow a small space for that (about 5 MB). The newest data may not have been saved.',
    ),
    steps: {
      other: [
        t('ถ่ายรูปภารกิจเฉพาะที่จำเป็น', 'Only take the mission photos you need'),
        t('ถ้าเครื่องเหลือพื้นที่น้อยมาก ลบรูป/วิดีโอที่ไม่ใช้ออกบ้าง', 'If the phone itself is nearly full, delete some unused photos or videos'),
        t('แจ้งเจ้าหน้าที่หากความคืบหน้าหาย', 'Tell a staff member if progress went missing'),
      ],
    },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'storage-eviction': {
    severity: 'info',
    icon: '🗓️',
    title: t('ควรเดินให้จบภายในวันเดียว', 'Try to finish the trail on the same day'),
    cause: t(
      'Safari จะลบข้อมูลของเว็บที่ไม่ได้เปิดนานเกิน 7 วัน ความคืบหน้าที่ค้างไว้อาจหายได้',
      'Safari deletes data for websites you have not opened for 7 days, so unfinished progress can disappear.',
    ),
    steps: { other: [t('เดินให้ครบและรับเกียรติบัตรในครั้งเดียว', 'Complete the trail and collect your certificate in one visit')] },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'offline': {
    severity: 'info',
    icon: '📶',
    title: t('ไม่มีสัญญาณอินเทอร์เน็ต', 'No internet connection'),
    cause: t(
      'เดินเส้นทางและทำภารกิจได้ตามปกติ แต่แผนที่พื้นหลัง การเข้าสู่ระบบ และการส่งเกียรติบัตรทางอีเมลต้องใช้อินเทอร์เน็ต',
      'You can keep walking and doing missions, but map tiles, signing in and emailing the certificate need internet.',
    ),
    steps: { other: [t('ระบบจะส่งข้อมูลเมื่อกลับมามีสัญญาณ', 'It will catch up once you have signal again')] },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'camera-denied': {
    severity: 'warn',
    icon: '📷',
    title: t('เปิดกล้องไม่ได้', 'The camera did not open'),
    cause: t(
      'เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้กล้อง',
      'The browser is not allowed to use the camera.',
    ),
    steps: {
      ios: [
        t('การตั้งค่า › แอป › Safari › กล้อง → "อนุญาต" หรือ "ถาม"', 'Settings › Apps › Safari › Camera → "Allow" or "Ask"'),
        t('หรือเลือก "คลังรูปภาพ" แทนการถ่ายใหม่', 'Or pick "Photo Library" instead of taking a new photo'),
      ],
      android: [
        t('Chrome › 🔒 ข้างที่อยู่เว็บ › สิทธิ์ › กล้อง → อนุญาต', 'Chrome › 🔒 by the address › Permissions › Camera → Allow'),
        t('การตั้งค่า › แอป › Chrome › สิทธิ์ › กล้อง → อนุญาต', 'Settings › Apps › Chrome › Permissions › Camera → Allow'),
      ],
      other: [t('อนุญาตกล้องให้เบราว์เซอร์', 'Allow the camera for this browser')],
    },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'notifications-ios': {
    severity: 'info',
    icon: '🔔',
    title: t('การแจ้งเตือนบน iPhone', 'Notifications on iPhone'),
    cause: t(
      'iPhone ส่งการแจ้งเตือนจากเว็บได้เฉพาะเมื่อ "เพิ่มไปยังหน้าจอโฮม" แล้ว (iOS 16.4 ขึ้นไป) ใน Safari ธรรมดาระบบจะแจ้งด้วยป๊อปอัพและเสียงในหน้าแอปแทน',
      'iPhones only allow web notifications for apps added to the Home Screen (iOS 16.4+). In plain Safari the trail alerts you on screen with a sound instead.',
    ),
    steps: { other: [t('เปิดหน้าแผนที่ค้างไว้ระหว่างเดิน', 'Keep the map open while walking')] },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'install-ios': {
    severity: 'info',
    icon: '➕',
    title: t('เพิ่มไปยังหน้าจอโฮม (iPhone)', 'Add to Home Screen (iPhone)'),
    cause: t(
      'iPhone ไม่มีปุ่มติดตั้งอัตโนมัติ ต้องเพิ่มเองจาก Safari ใช้เวลาประมาณ 10 วินาที — ควรทำก่อนเริ่มเดิน เพราะแอปบนหน้าจอโฮมเก็บข้อมูลแยกจาก Safari',
      'iPhones have no automatic install button; you add it from Safari in about 10 seconds. Do it before you start walking — the Home Screen app keeps its data separately from Safari.',
    ),
    steps: {
      ios: [
        t('เปิดหน้านี้ใน Safari', 'Open this page in Safari'),
        t('แตะปุ่มแชร์ ⤴ (ด้านล่างหรือข้างช่องที่อยู่)', 'Tap the Share button ⤴ (bottom bar or next to the address)'),
        t('เลื่อนลงแล้วแตะ "เพิ่มไปยังหน้าจอโฮม"', 'Scroll down and tap "Add to Home Screen"'),
        t('ถ้ามีสวิตช์ "เปิดเป็นแอปบนเว็บ" ให้เปิดไว้ แล้วแตะ "เพิ่ม"', 'If there is an "Open as Web App" switch, leave it on, then tap "Add"'),
        t('เปิดแอปจากไอคอนบนหน้าจอโฮม แล้วเริ่มเดินจากในแอป', 'Open it from the Home Screen icon and start the walk from there'),
      ],
      other: [t('ใช้ Safari บน iPhone', 'Use Safari on the iPhone')],
    },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },

  'install-android': {
    severity: 'info',
    icon: '⬇️',
    title: t('ติดตั้งแอป (Android)', 'Install the app (Android)'),
    cause: t(
      'Android ติดตั้งได้ในแตะเดียว ไม่ต้องผ่าน Play Store',
      'Android can install it with one tap — no Play Store needed.',
    ),
    steps: {
      android: [
        t('แตะปุ่ม "ติดตั้งแอป" ด้านล่าง แล้วกด "ติดตั้ง"', 'Tap "Install app" below, then "Install"'),
        t('ถ้าไม่มีปุ่ม: Chrome › ⋮ › "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"', 'If there is no button: Chrome › ⋮ › "Install app" or "Add to Home screen"'),
      ],
      other: [t('ใช้เมนูของเบราว์เซอร์ เลือก "ติดตั้งแอป"', 'Use the browser menu and choose "Install app"')],
    },
    action: { kind: 'install', label: t('ติดตั้งแอป', 'Install app') },
  },

  'ios-standalone-storage': {
    severity: 'info',
    icon: '🔁',
    title: t('ความคืบหน้าจาก Safari ไม่ได้ย้ายมา', 'Progress from Safari does not carry over'),
    cause: t(
      'แอปบนหน้าจอโฮมของ iPhone เก็บข้อมูลแยกจาก Safari ถ้าเริ่มเดินใน Safari ไว้ ให้กลับไปเดินต่อใน Safari',
      'On iPhone the Home Screen app keeps separate data from Safari. If you started the walk in Safari, continue it in Safari.',
    ),
    steps: { other: [t('เลือกใช้ที่ใดที่หนึ่งตลอดทั้งเส้นทาง', 'Stick to one of them for the whole trail')] },
    action: { kind: 'dismiss', label: t('เข้าใจแล้ว', 'Got it') },
  },
};
