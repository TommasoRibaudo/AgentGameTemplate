import { ImageSourcePropType } from 'react-native';

// ─── Asset registry ───────────────────────────────────────────────────────────

const PORTRAIT_ASSETS: Record<string, ImageSourcePropType> = {
  man_afro:            require('../assets/portraits/man_afro.png'),
  man_bald:            require('../assets/portraits/man_bald.png'),
  man_beard:           require('../assets/portraits/man_beard.png'),
  man_bighair:         require('../assets/portraits/man_bighair.png'),
  man_coolguy:         require('../assets/portraits/man_coolguy.png'),
  man_hood:            require('../assets/portraits/man_hood.png'),
  man_idontevenknow:   require('../assets/portraits/man_idontevenknow.png'),
  man_inhat:           require('../assets/portraits/man_inhat.png'),
  man_justguy:         require('../assets/portraits/man_justguy.png'),
  man_old:             require('../assets/portraits/man_old.png'),
  man_oldbald:         require('../assets/portraits/man_oldbald.png'),
  man_scaryguy:        require('../assets/portraits/man_scaryguy.png'),
  man_shortboy:        require('../assets/portraits/man_shortboy.png'),
  man_squarehead:      require('../assets/portraits/man_squarehead.png'),
  man_weirdo:          require('../assets/portraits/man_weirdo.png'),
  woman_3:             require('../assets/portraits/woman_3.png'),
  woman_4:             require('../assets/portraits/woman_4.png'),
  woman_angry:         require('../assets/portraits/woman_angry.png'),
  woman_justgirl:      require('../assets/portraits/woman_justgirl.png'),
  woman_justwoman2:    require('../assets/portraits/woman_justwoman2.png'),
  something_banana:    require('../assets/portraits/something_banana.png'),
  something_bigeyes:   require('../assets/portraits/something_bigeyes.png'),
  something_cartonhead:require('../assets/portraits/something_cartonhead.png'),
  something_cat:       require('../assets/portraits/something_cat.png'),
  something_phonehead: require('../assets/portraits/something_phonehead.png'),
  something_squidhead: require('../assets/portraits/something_squidhead.png'),
};

// ─── Pools ────────────────────────────────────────────────────────────────────

const MAN_NORMAL = [
  'man_afro', 'man_bald', 'man_beard', 'man_bighair',
  'man_coolguy', 'man_hood', 'man_idontevenknow', 'man_inhat', 'man_justguy',
  'man_old', 'man_oldbald', 'man_shortboy', 'man_squarehead', 'man_weirdo',
];

const WOMAN_NORMAL = [
  'woman_3', 'woman_4', 'woman_angry', 'woman_justgirl', 'woman_justwoman2',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Portrait selection ───────────────────────────────────────────────────────

export function pickPortrait(): { key: string; gender: 'male' | 'female' } {
  const r = Math.random();

  // Extremely rare (0.5% each)
  if (r < 0.005) return { key: 'something_banana',    gender: Math.random() < 0.5 ? 'male' : 'female' };
  if (r < 0.010) return { key: 'something_cat',       gender: Math.random() < 0.5 ? 'male' : 'female' };

  // Rare (2% each)
  if (r < 0.030) return { key: 'something_phonehead', gender: Math.random() < 0.5 ? 'male' : 'female' };
  if (r < 0.050) return { key: 'something_cartonhead',gender: Math.random() < 0.5 ? 'male' : 'female' };

  // Normal neutral (2% each)
  if (r < 0.070) return { key: 'something_bigeyes',   gender: Math.random() < 0.5 ? 'male' : 'female' };
  if (r < 0.090) return { key: 'something_squidhead', gender: Math.random() < 0.5 ? 'male' : 'female' };

  // Normal gendered — remaining 91% split 50/50
  if (r < 0.545) {
    return { key: pick(WOMAN_NORMAL), gender: 'female' };
  }

  // Male: 5% chance of scaryguy, 95% normal man
  const key = Math.random() < 0.05 ? 'man_scaryguy' : pick(MAN_NORMAL);
  return { key, gender: 'male' };
}

// ─── Asset lookup ─────────────────────────────────────────────────────────────

export function portraitAsset(key: string | undefined): ImageSourcePropType | undefined {
  if (!key) return undefined;
  return PORTRAIT_ASSETS[key];
}

// Normal-only pool used when deriving a portrait from an ID (no rare/extremely-rare portraits)
const NORMAL_FALLBACK_KEYS = [
  'man_afro', 'man_bald', 'man_beard', 'man_bighair',
  'man_coolguy', 'man_hood', 'man_idontevenknow', 'man_inhat', 'man_justguy',
  'man_old', 'man_oldbald', 'man_shortboy', 'man_squarehead', 'man_weirdo',
  'woman_3', 'woman_4', 'woman_angry', 'woman_justgirl', 'woman_justwoman2',
  'something_bigeyes', 'something_squidhead',
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Always returns an asset — uses the stored portrait key when available,
 * otherwise derives a stable portrait from the entity's id so old saves
 * get a consistent face without requiring data migration.
 */
export function resolvePortrait(portrait: string | undefined, id: string): ImageSourcePropType {
  const key = portrait ?? NORMAL_FALLBACK_KEYS[hashId(id) % NORMAL_FALLBACK_KEYS.length];
  return PORTRAIT_ASSETS[key] ?? PORTRAIT_ASSETS['man_justguy'];
}
