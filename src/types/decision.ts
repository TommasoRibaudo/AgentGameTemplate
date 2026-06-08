import { DecisionItemType, StatDeltas } from './primitives';
import { ContractDraft } from './contract';

export interface DecisionOutcome {
  money_delta: number;
  reputation_delta: number;
  stat_deltas: StatDeltas;
  morale_delta: number;
  // if the outcome creates or activates a contract, its ID is set here post-resolution
  activates_contract_id: string | null;
}

// Push carries real downside risk — a failed push can worsen terms or make the
// counterparty withdraw. The risk curves are open question §6.3 in the PRD.
export interface PushRisk {
  // 0–1; function of agent Negotiation skill and counterparty posture
  success_probability: number;
  success_outcome: DecisionOutcome;
  failure_outcome: DecisionOutcome;
}

export interface DecisionOption {
  key: 'approve' | 'reject' | 'push' | string;
  label: string;
  outcome: DecisionOutcome;
  // only present on the 'push' option
  push_risk: PushRisk | null;
}

export interface DecisionItem {
  id: string;
  type: DecisionItemType;
  // references variant manifest board item template
  template_key: string;
  client_id: string | null;
  // set when item involves an existing active contract (renewals, expiry pressure)
  contract_id: string | null;
  // set on contract_offer items — the proposed terms the player reads before deciding.
  // On Approve the engine promotes this draft to an active Contract.
  contract_draft: ContractDraft | null;
  description: string;
  options: DecisionOption[];
  // fires automatically if the player ends the turn without resolving this item
  default_on_ignore: DecisionOutcome;
  // null = expires end of current turn; N = persists for N more turns
  expires_in: number | null;
  is_resolved: boolean;
  chosen_option_key: string | null;
}
