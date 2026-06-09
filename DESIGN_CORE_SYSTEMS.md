# Core System Design Notes

## Counteroffer Flow

Counteroffers are a core contract interaction, not a single push button.

- Contract offers can be accepted, rejected, or countered.
- Countering opens an adjustment flow where the player changes terms such as cut, duration, obligations, and offer-specific money fields.
- The engine estimates acceptance probability from agent negotiation, counterparty posture, client value, audience, and how aggressive the requested changes are.
- Acceptance probability is shown as a fogged range. Higher negotiation narrows the range.
- Resolution outcomes should be accepted, rejected, or revised offer.

## Campaign Setup

Campaigns should be configured before starting.

- Player chooses campaign type.
- Player chooses size, length, and budget.
- These choices affect start cost, payout ceiling, audience growth, stat deltas, event risk, and trait chance.
- Campaign history should persist completed campaigns on the client.

## Generic Audience

Audience is a core client metric with variant-specific labels.

- Music: fans/monthly listeners.
- Sports: followers/fanbase.
- Other variants can label it differently.
- Audience affects contracts, campaign results, events, final scoring, and marketability-driven opportunities.
- Audience growth should come primarily from campaigns and major public events.
