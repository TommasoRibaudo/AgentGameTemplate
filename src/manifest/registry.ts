import { VariantManifest } from '../types/manifest';
import { MUSIC_MANIFEST }  from './variants/music';
import { SPORTS_MANIFEST } from './variants/sports';

export const MANIFEST_REGISTRY: Record<string, VariantManifest> = {
  [MUSIC_MANIFEST.id]:  MUSIC_MANIFEST,
  [SPORTS_MANIFEST.id]: SPORTS_MANIFEST,
};

export const DEFAULT_MANIFEST_ID = MUSIC_MANIFEST.id;
