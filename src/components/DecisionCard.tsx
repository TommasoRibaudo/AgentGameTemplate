import { DecisionItem } from '../types/decision';
import { ContractDraft } from '../types/contract';

// One item on the decision board (PRD §4.2, §3.3). Shows:
//   - Type badge (contract offer / client request / opportunity / renewal)
//   - Description text
//   - expires_in countdown if item persists across turns
//   - ContractSummary inline when item.contract_draft is set
//   - Verb buttons: Approve / Reject / Push / any custom options
//
// Push button is only shown when the item has a 'push' option AND agent.negotiation > 0.
// Expiring-soon items (expires_in ≤ 1) render with a visual urgency indicator.

export interface DecisionCardProps {
  item: DecisionItem;

  // resolved display data (caller handles lookup from RunState)
  clientName?: string;
  clientLabel?: string;   // variant label (e.g. 'Artist')
  entityLabel?: string;   // variant label (e.g. 'Label')

  // push is only surfaced if the item supports it AND negotiation level qualifies
  isPushEnabled: boolean;

  onResolve: (itemId: string, optionKey: string) => void;
}
