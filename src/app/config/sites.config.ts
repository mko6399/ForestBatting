/**
 * The three forest-bathing locations.
 *
 * This is mock data standing in for GET /api/majorlocation. The shape deliberately mirrors
 * the MajorLocation table the API already has (Id, Name, Checkpoints) plus the presentation
 * fields that are currently hardcoded across the app, so swapping this file for a real HTTP
 * call later is a change of source, not of structure.
 */

export type SiteStatus = 'open' | 'coming-soon';

export interface Localized {
  th: string;
  en: string;
}

export interface SiteTheme {
  /** Drives the browser theme-color and the portal card accent. */
  primary: string;
  /** Used for the soft background wash behind the card. */
  surface: string;
}

export interface SiteCertificate {
  organisationLine1: string;
  organisationLine2: string;
  signerName: Localized;
  signerTitle: Localized;
}

export interface Site {
  /** URL-safe identifier. Used for QR deep links: /s/<slug> */
  slug: string;
  /** Mirrors MajorLocation.Id so this maps straight onto the API later. */
  majorLocationId: number;
  name: Localized;
  area: Localized;
  summary: Localized;
  theme: SiteTheme;
  /** Portal card artwork. */
  image: string;
  /** Rough figures shown on the portal card so people can pick a trail that fits. */
  stats: {
    checkpoints: number;
    distanceKm: number;
    minutes: number;
  };
  certificate: SiteCertificate;
  status: SiteStatus;
  /**
   * Where this site's checkpoints come from. Kachong ships with real bundled data; the other
   * two will point at the API once their content exists.
   */
  checkpointSource: string | null;
}

export const SITES: readonly Site[] = [
  {
    slug: 'kachong',
    majorLocationId: 1,
    name: { th: 'กะช่องฮิลล์', en: 'Kachong Hills' },
    area: { th: 'อ.นาโยง จ.ตรัง', en: 'Na Yong, Trang' },
    summary: {
      th: 'เส้นทางอาบป่าในสวนพฤกษศาสตร์ ผ่านน้ำตก สะพานเหล็ก และจุดชมวิวบนเนิน',
      en: 'A forest bathing trail through the botanical garden, past waterfalls, the iron bridge and hilltop viewpoints.',
    },
    theme: { primary: '#15803d', surface: '#f0fdf4' },
    image: 'assets/images/forest-bathing-trail-home-th.png',
    stats: { checkpoints: 17, distanceKm: 2.4, minutes: 90 },
    certificate: {
      organisationLine1: 'KACHONG HILLS',
      organisationLine2: 'TENT RESORT',
      signerName: { th: 'ดร.ประพล วิระพรสวรรค์', en: 'Dr. Prapol Wiraporsawan' },
      signerTitle: {
        th: 'ประธานกรรมการบริหาร, Kachong Hills',
        en: 'Executive Chairman, Kachong Hills',
      },
    },
    status: 'open',
    checkpointSource: 'assets/bases/bases-bilingual.json',
  },
  {
    slug: 'thungkhai',
    majorLocationId: 2,
    name: { th: 'ทุ่งค่าย', en: 'Thung Khai' },
    area: { th: 'อ.ย่านตาขาว จ.ตรัง', en: 'Yan Ta Khao, Trang' },
    summary: {
      th: 'เส้นทางศึกษาธรรมชาติบนสะพานเรือนยอดไม้ ท่ามกลางป่าดิบชื้นที่ราบต่ำ',
      en: 'A canopy walkway trail through lowland rainforest.',
    },
    theme: { primary: '#0f766e', surface: '#f0fdfa' },
    image: 'assets/images/forest-bathing-trail-home-en.png',
    stats: { checkpoints: 12, distanceKm: 1.6, minutes: 60 },
    certificate: {
      organisationLine1: 'THUNG KHAI',
      organisationLine2: 'BOTANICAL GARDEN',
      signerName: { th: 'ผู้อำนวยการสวนพฤกษศาสตร์ทุ่งค่าย', en: 'Director, Thung Khai Botanical Garden' },
      signerTitle: { th: 'สวนพฤกษศาสตร์ทุ่งค่าย', en: 'Thung Khai Botanical Garden' },
    },
    status: 'coming-soon',
    checkpointSource: null,
  },
  {
    slug: 'forest-of-play',
    majorLocationId: 3,
    name: { th: 'Forest of Play', en: 'Forest of Play' },
    area: { th: 'จ.ตรัง', en: 'Trang' },
    summary: {
      th: 'เส้นทางกิจกรรมสำหรับครอบครัวและเด็ก เน้นการเล่นและสำรวจธรรมชาติ',
      en: 'An activity trail for families and children, built around play and discovery.',
    },
    theme: { primary: '#b45309', surface: '#fffbeb' },
    image: 'assets/images/forest-bathing-trail-home-th.png',
    stats: { checkpoints: 9, distanceKm: 1.1, minutes: 45 },
    certificate: {
      organisationLine1: 'FOREST OF PLAY',
      organisationLine2: 'TRANG',
      signerName: { th: 'ผู้อำนวยการ Forest of Play', en: 'Director, Forest of Play' },
      signerTitle: { th: 'Forest of Play', en: 'Forest of Play' },
    },
    status: 'coming-soon',
    checkpointSource: null,
  },
] as const;

/** The site used when nothing has been chosen yet and no deep link was followed. */
export const DEFAULT_SITE_SLUG = 'kachong';

export function findSite(slug: string | null | undefined): Site | null {
  if (!slug) return null;
  return SITES.find(s => s.slug === slug) ?? null;
}
