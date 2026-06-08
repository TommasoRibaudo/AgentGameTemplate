# Variant Guide

How to create a third variant (e.g., Hollywood, Fashion, Esports).

## What a variant is

A variant is a single TypeScript file that exports a `VariantManifest` object.
The engine — turn loop, events, campaigns, contracts, arc progression — is shared
across all variants. Variants only supply **content** (labels, events, traits, etc.)
and **tuning** (economy numbers, arc lengths). No engine code is touched.

## Step-by-step

### 1. Create the file

```
src/manifest/variants/your_variant.ts
```

Copy `music.ts` or `sports.ts` as a starting point. Change the top-level fields:

```typescript
export const YOUR_MANIFEST: VariantManifest = {
  id:      'your_variant_v1',   // unique, kebab-case, ends with _v<N>
  name:    'Your Variant',
  version: '1.0.0',
  ...
};
```

### 2. Rename domain labels

```typescript
labels: {
  client:     'Actor',       // what a signed client is called
  entity:     'Studio',      // counterparty in entity contracts
  agent:      'Talent Agent',
  money:      'Budget',
  reputation: 'Clout',
  stat_labels: {
    talent:        'Acting Skill',
    form:          'Current Buzz',
    marketability: 'Star Power',
    morale:        'Morale',
  },
},
```

The four stat keys (`talent`, `form`, `marketability`, `morale`) are **fixed** by
the engine. Only their display labels change per variant.

### 3. Define stat sub-attributes

Each core stat can have 1–4 sub-attributes that roll up to it.
Weights per `maps_to` group **must sum to 1.0**:

```typescript
stat_sub_attributes: [
  { key: 'range',      label: 'Vocal Range',   maps_to: 'talent', weight: 0.50 },
  { key: 'emotion',    label: 'Emotional Depth',maps_to: 'talent', weight: 0.50 },
  { key: 'buzz',       label: 'Social Buzz',    maps_to: 'form',   weight: 1.00 },
  // ...
],
```

The validator throws if any group's weights don't sum to 1.0 within ±0.01.

### 4. Define entity types

```typescript
entity_types: [
  { key: 'studio',    label: 'Film Studio',    valid_payout_types: ['per_month'] },
  { key: 'streaming', label: 'Streamer',       valid_payout_types: ['per_objective'] },
  { key: 'brand',     label: 'Sponsor',        valid_payout_types: ['lump_sum'] },
],
```

Valid payout types: `per_month`, `lump_sum`, `per_objective`.

### 5. Write events with real outcomes

Every event needs `options` (player choices) and a `default_outcome` (auto-applied
if the player ignores the event). Keep outcomes balanced: the default is always
worse than at least one player choice.

```typescript
{
  key:                  'casting_dispute',
  category:             'agency',     // client | market | agency | windfall
  severity:             'minor',      // minor | major | crisis
  description_template: 'A casting director is challenging {client_name}\'s contract terms.',
  options: [
    { key: 'mediate',    label: 'Mediate',     outcome: { money_delta: -500, reputation_delta:  1, stat_deltas: {} } },
    { key: 'hold_firm',  label: 'Hold Firm',   outcome: { money_delta:    0, reputation_delta: -1, stat_deltas: { morale: -1 } } },
  ],
  default_outcome: { money_delta: -500, reputation_delta: -2, stat_deltas: { morale: -2 } },
  defense_track_key: 'legal',   // null | 'insurance' | 'pr' | 'legal' | 'medical'
},
```

Severity guides expected magnitude: minor → ±$500/rep±1, major → ±$2k/rep±3,
crisis → ±$5k/rep±5. The defense track reduces severity by up to 50%.

### 6. Define campaign types

Campaigns are time-limited revenue generators. `base_payout` is the **per-installment
agent cut** at 100% client form. Typical form is 40–70, so expect ~50–70% of that
figure per turn in practice.

```typescript
{
  key:          'film_shoot',
  label:        'Film Production',
  total_turns:  8,
  form_weight:  0.75,   // 0–1; how much form drives the installment roll
  variance:     12,     // std deviation of random component
  base_payout:  3_000,  // agent's per-turn cut at 100% form
  payout_type:  'per_month',
  per_installment_stat_deltas: { morale: -1 },
  event_trigger_threshold: 30,   // roll below this → client event fires
  trait_trigger_threshold: 88,   // roll above this → trait grant check
  valid_arc_stages: ['peak'],
},
```

### 7. Define traits

Traits modify stats and event probability:

```typescript
{
  key:                    'method_actor',
  label:                  'Method Actor',
  stat_modifiers:         { talent: 6 },
  marketability_modifier: 0,
  event_bias:             { client: 1.3 },  // 30% more client events
  trigger_condition_key:  'film_shoot',
  trigger_threshold:      88,
},
```

### 8. Define contract templates

At minimum provide one `agent_client` template (signing) and one `client_entity`
template (the deals your clients sign). See music.ts `agent_signing` for the
canonical example.

### 9. Define board item templates

Include at least 2 global items (`valid_arc_stages: []`) so the board is never
empty in the early game when no clients are on the roster:

```typescript
{
  key:                   'audition_circuit',
  type:                  'opportunity',
  description_template:  'Audition season has started. Scout the circuit for emerging talent?',
  rep_gate:              0,
  valid_arc_stages:      [],   // empty = always eligible regardless of roster
  contract_template_key: null,
  default_on_ignore_key: 'skip',
  expires_in:            null,
},
```

### 10. Tune the economy

| Field | Notes |
|---|---|
| `starting_money` | Should give ~10 turns of runway before income starts |
| `overhead_per_turn` | Keep below `starting_money / 10` |
| `career_length` | 48–72 turns feels right for a session |
| `event_base_rate` | 0.12–0.20; higher = more chaotic |

### 11. Register the manifest

Add it to `src/manifest/registry.ts`:

```typescript
import { YOUR_MANIFEST } from './variants/your_variant';

export const MANIFEST_REGISTRY: Record<string, VariantManifest> = {
  [MUSIC_MANIFEST.id]:  MUSIC_MANIFEST,
  [SPORTS_MANIFEST.id]: SPORTS_MANIFEST,
  [YOUR_MANIFEST.id]:   YOUR_MANIFEST,   // ← add this
};
```

### 12. Add to the career selection screen

In `src/screens/NewCareerScreen.tsx`, add an entry to `VARIANTS`:

```typescript
import { YOUR_MANIFEST } from '../manifest/variants/your_variant';

const VARIANTS = [
  // ...existing entries...
  {
    manifest: YOUR_MANIFEST,
    emoji:    '🎬',
    tagline:  'Sign actors, land roles, build a Hollywood dynasty.',
  },
];
```

### 13. Validate

Run the test suite. The validator acceptance tests live in
`src/manifest/__tests__/validator.test.ts`. Add a test for your manifest:

```typescript
it('accepts the hollywood manifest', () => {
  expect(() => validateManifest(YOUR_MANIFEST)).not.toThrow();
});
```

The validator checks:
- All weight groups sum to 1.0
- All `contract_template_key` references exist
- All `defense_track_key` values are `null` or a valid infra key
- Economy `event_base_rate` is in [0, 1]
- Arc multipliers are all > 0
- Campaign `total_turns` > 0

Fix any throws, then the variant is ready to play.

## What NOT to change

- The four core stat keys (`talent`, `form`, `marketability`, `morale`)
- The four arc stages (`rising`, `peak`, `declining`) — only their threshold turns change
- The four defense track keys (`insurance`, `pr`, `legal`, `medical`)
- The turn phase order (turn_open → upkeep → decision → resolution → turn_close)
- The `GameEvent`, `Contract`, `Campaign`, `DecisionItem` runtime types

Changing any of the above is an engine change, not a variant change, and requires
updating `src/types/`, `src/engine/`, and all dependent tests.
