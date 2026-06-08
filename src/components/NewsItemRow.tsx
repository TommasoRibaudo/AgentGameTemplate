import { NewsItem, NewsItemType } from '../types/run';

// Single entry in the News Feed scroll list. Entries are append-only and revisitable.
// Negative money_delta or reputation_delta renders in a warning colour.

export interface NewsItemRowProps {
  item: NewsItem;
  // resolved client name if item.client_id is set (caller handles lookup)
  clientName?: string;
}

// Icon key mapped from NewsItemType — caller resolves to an actual icon asset.
export const NEWS_ITEM_ICONS: Record<NewsItemType, string> = {
  campaign_installment: 'star',
  income_received:      'dollar',
  client_milestone:     'trophy',
  event_fired:          'alert',
  contract_activated:   'handshake',
  contract_expired:     'clock',
  upkeep_summary:       'refresh',
};
