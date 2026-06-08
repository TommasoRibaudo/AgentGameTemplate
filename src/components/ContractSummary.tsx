import { Contract, ContractDraft } from '../types/contract';
import { ContractTier } from '../types/primitives';

// Renders a contract's terms for review. Used in:
//   - DecisionCard (ContractDraft before approval)
//   - ClientContractsTab (active Contract)
// All fields are fully visible (PRD §3.3); only counterparty_posture is fogged.

export interface ContractSummaryProps {
  // pass either a live Contract or a ContractDraft (pending board item)
  contract: Contract | ContractDraft;
  isDraft: boolean;   // true when showing a draft pending player decision

  clientLabel: string;    // variant label (e.g. 'Artist')
  entityLabel: string;    // variant label (e.g. 'Label')

  // show the posture fog band when Negotiation has partially revealed it
  showPosture: boolean;

  // for active contracts: show countdown to expiry
  showExpiry?: boolean;
}
