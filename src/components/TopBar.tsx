// Persistent top bar — always visible across all four tabs (PRD §4.1).
// The four numbers that define your state at a glance, plus the failure-warning indicator.
// Must be thumb-reachable and legible at small sizes.

export interface TopBarProps {
  money: number;
  reputation: number;
  rosterCount: number;
  rosterCapacity: number;
  turnNumber: number;
  careerLength: number;
  // true when debt.is_active — renders a persistent debt flag
  isInDebt: boolean;
  // true when Money has crossed LOW_MONEY_THRESHOLD this turn — renders a warning tint
  lowMoneyWarning: boolean;
  // variant display labels
  moneyLabel: string;
  reputationLabel: string;
}
