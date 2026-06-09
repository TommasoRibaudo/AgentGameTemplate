import { DecisionItem } from '../types/decision';

export function canCounterDecisionItem(item: DecisionItem): boolean {
  return !item.is_resolved && item.contract_draft !== null;
}
