// Core stat keys are fixed by the engine; variants supply display labels only
export type CoreStatKey = 'talent' | 'form' | 'marketability' | 'morale';

// talent and performance attributes → stat_scouting narrows these
// form, morale, arc stage → insight_scouting narrows these
export type HardStatKey = 'talent';
export type SoftStatKey = 'form' | 'marketability' | 'morale';

export type ArcStage = 'rising' | 'peak' | 'declining';

export type PayoutType = 'per_week' | 'lump_sum' | 'per_objective';

// agent<->client: you represent the client; client<->entity: the client signs a deal you broker
export type ContractTier = 'agent_client' | 'client_entity';

export type EventCategory = 'client' | 'market' | 'agency' | 'windfall';
export type EventSeverity = 'minor' | 'major' | 'crisis';

export type DecisionItemType = 'contract_offer' | 'client_request' | 'opportunity' | 'renewal' | 'label_option';

export type TurnPhase = 'turn_open' | 'upkeep' | 'decision' | 'resolution' | 'turn_close';

export type RunEndCondition = 'retired' | 'bankrupt' | 'clock_expired';

// Partial stat adjustments — used in event, decision, and campaign outcomes
export type StatDeltas = Partial<Record<CoreStatKey, number>>;
