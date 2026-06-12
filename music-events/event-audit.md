# Event Narrative Audit — music_v1

**Date:** 2026-06-11
**Scope:** All 24 events in `src/manifest/variants/music.ts → events[]`
**Code read:** `src/engine/event.ts`, `src/engine/decision-queue.ts`, `src/manifest/variants/music.ts`

Axes (1 = weak, 5 = excellent):
- **TQ** Trade-off quality — does every choice cost something real, or is one option dominant?
- **SA** State-awareness — does it reference client arc, traits, campaigns, or is it boilerplate?
- **TF** Trigger fit — does the gate make the event contextually plausible when it fires?
- **CD** Consequence depth — one-shot stat change, or does it seed something that surfaces later?
- **MF** Mobile fit — under ~2 short sentences? Flag anything over that.

---

## Rating Table (worst → best)

| Key | Cat | Sev | TQ | SA | TF | CD | MF | Total |
|-----|-----|-----|----|----|----|----|-----|-------|
| `agency_lawsuit` | agency | crisis | 1 | 1 | 2 | 1 | 5 | **10** |
| `police_trouble` | market | major | 2 | 2 | 2 | 1 | 3 | **10** |
| `contract_dispute` | agency | minor | 3 | 1 | 2 | 1 | 5 | **12** |
| `family_career_skepticism` | client | major | 2 | 2 | 1 | 2 | 5 | **12** |
| `negative_review` | market | minor | 2 | 2 | 2 | 1 | 5 | **12** |
| `brand_inquiry` | windfall | major | 2 | 2 | 2 | 1 | 5 | **12** |
| `streaming_viral` | windfall | minor | 2 | 2 | 2 | 1 | 5 | **12** |
| `drunk_driving` | market | major | 2 | 3 | 3 | 2 | 2 | **12** |
| `award_nomination` | windfall | minor | 3 | 2 | 2 | 1 | 5 | **13** |
| `health_crisis` | client | crisis | 3 | 2 | 3 | 2 | 3 | **13** |
| `major_scandal` | market | crisis | 3 | 2 | 3 | 2 | 4 | **14** |
| `sync_placement_buzz` | windfall | minor | 2 | 3 | 3 | 1 | 5 | **14** |
| `social_controversy` | market | major | 4 | 2 | 3 | 2 | 4 | **15** |
| `collab_offer` | windfall | minor | 2 | 3 | 4 | 1 | 5 | **15** |
| `artist_fatigue` | client | minor | 4 | 2 | 3 | 2 | 5 | **16** |
| `artist_burnout` | client | major | 4 | 2 | 3 | 2 | 5 | **16** |
| `sync_award_nomination` | windfall | major | 3 | 3 | 3 | 2 | 5 | **16** |
| `licensing_terms_dispute` | agency | minor | 4 | 3 | 3 | 2 | 5 | **17** |
| `sponsor_advertiser_revolt` | market | crisis | 3 | 4 | 4 | 2 | 5 | **18** |
| `album_deadline_pressure` | client | minor | 4 | 3 | 4 | 2 | 5 | **18** |
| `sponsor_public_backlash` | market | major | 3 | 4 | 4 | 2 | 5 | **18** |
| `label_pressure` | agency | major | 4 | 3 | 4 | 2 | 5 | **18** |
| `influential_feature_request` | agency | minor | 4 | 3 | 4 | 2 | 5 | **18** |
| `commission_creative_block` | client | minor | 4 | 3 | 4 | 2 | 5 | **18** |

---

## Per-event axis justifications

### agency_lawsuit (10)
- **TQ 1** `fight` and `settle` both cost $5,000. Fight loses 0 rep; settle loses 2. Identical cost, fight is strictly better — not a decision.
- **SA 1** "Your agency" has zero client reference. Could fire against any state.
- **TF 2** No gate, no narrative cause. Why is the agency being sued?
- **CD 1** One-shot money/rep hit. No lasting legal state.
- **MF 5** One sentence.

### police_trouble (10)
- **TQ 2** `pay_up` is -$2,500 / rep -1 / mkt -1. `let_it_play` is rep -3 / mkt -4. Pay-up is better on every axis if you have money; `let_it_play` has zero upside.
- **SA 2** "An incident with the police" says nothing. The word "police" appears twice in two sentences.
- **TF 2** No gate; thematically overlaps with `drunk_driving`.
- **CD 1** Pure damage. No follow-up.
- **MF 3** Three sentences, repeated word, no new information in the third sentence.

### contract_dispute (12)
- **TQ 3** `contest` gives +1 rep at no cost. That's not a trade-off; it's a free button for any player who isn't scared of the default.
- **SA 1** "A minor dispute with a partner" — no client, no contract named. Lowest state-awareness in the set.
- **TF 2** No gate. Who is the partner? What contract?
- **CD 1** Pure transient.
- **MF 5** Tight.

### family_career_skepticism (12)
- **TQ 2** `back_their_decision` costs $1,000 for +5 morale / +1 form. `stay_out` gives -8 morale / -3 form with no upside. Backing them dominates.
- **SA 2** No arc check. A peak artist with 1M fans being pressured to quit music by their family is absurd. *(schema flag — see below)*
- **TF 1** Worst trigger fit in the set. This is only coherent in the rising arc. No gate enforces this.
- **CD 2** Morale cascade is real, but the narrative dead-ends.
- **MF 5** Tight.

### negative_review (12)
- **TQ 2** `respond` (-$500, rep +1, mkt +1) vs `ignore` (rep -1, mkt -1). Respond gives better outcome on every stat axis AND the cost is small. Dominant for anyone with money.
- **SA 2** "Recent work" with no active campaign or catalog release gate. Can fire with no release on record.
- **TF 2** No catalog gate — "scathing review of recent work" when there is no recent work.
- **CD 1** Resolved. No follow-up critic event.
- **MF 5** Tight.

### brand_inquiry (12)
- **TQ 2** `engage` gives +$2,000 / rep +2 / mkt +3. `pass` gives form +2. Engage wins on three axes simultaneously and gives money. Only dominant if you don't care about form.
- **SA 2** No scope gate — fires even with an existing sponsor contract.
- **TF 2** Should not fire as a windfall when the client already has an active sponsor deal.
- **CD 1** Gives stat boosts instead of activating a sponsor contract. No contract-level consequence.
- **MF 5** Tight.

### streaming_viral (12)
- **TQ 2** `capitalise` (+$500 / rep +2 / mkt +3) vs `let_it_ride` (rep +1 / form +1 / mkt +1). Capitalise gives more money AND more on every social stat.
- **SA 2** "Back catalog is trending" but no `requires_catalog_release_kind` gate — fires even with no catalog. *(schema flag — see below)*
- **TF 2** No catalog gate. Can fire turn 1.
- **CD 1** Pure windfall stat bump.
- **MF 5** Tight.

### drunk_driving (12)
- **TQ 2** `pay_to_manage` (-$3,000 / rep -2 / mkt -1 / morale -2) vs `do_nothing` (rep -5 / mkt -5 / morale -3). Pay wins on every stat. Only reason to skip is no cash.
- **SA 3** Specific flavor; the "late-night call" framing is strong. Best description in the low-scoring group.
- **TF 3** No gate but thematically coherent for any arc.
- **CD 2** Morale/mkt cascade is real, but no follow-up criminal/legal event.
- **MF 2** ⚠ Three sentences. Mobile flag.

### award_nomination (13)
- **TQ 3** `celebrate` (-$500 / rep +3 / morale +3 / mkt +2) vs `stay_focused` (rep +2 / form +2). Celebrate wins on social stats; stay_focused gives form. Reasonable spread but celebrate is usually better.
- **SA 2** "An unexpected nomination" — for what? No campaign or catalog gate to ground it.
- **TF 2** No catalog gate. Can fire with no released work.
- **CD 1** No nomination-outcome event. The award just evaporates.
- **MF 5** Tight.

### health_crisis (13)
- **TQ 3** `no_comment` (rep -5 / morale -3) has no upside. Players without $5,000 are forced into it, making it a cash-check not a decision for solvent players.
- **SA 2** Generic hospitalization. No cause, no arc context.
- **TF 3** No gate; plausible for any arc stage but description is too vague.
- **CD 2** Should pause active campaigns (doesn't). Morale drain cascades naturally.
- **MF 3** ⚠ Two sentences but the second ("news is out and fans are flooding social media") is long.

### major_scandal (14)
- **TQ 3** Three options with distinct profiles (money/rep, rep-only, money+mkt). Reasonable but no morale dimension on any branch.
- **SA 2** Generic "major scandal." No cause, no trait link, no arc note.
- **TF 3** No gate; no narrative grounding.
- **CD 2** No follow-up. Crisis PR team is hired and disappears.
- **MF 4** Two punchy sentences.

### sync_placement_buzz (14)
- **TQ 2** `capitalise` (+$1,000 / rep +2 / mkt +3 / form +1) vs `let_it_ride` (rep +1 / mkt +2). Capitalise wins on every axis AND gives money. No cost to capitalise.
- **SA 3** Implies an active sync license — better than generic windfalls, but no `requires_active_scope` gate.
- **TF 3** Would need a license scope gate to be credible.
- **CD 1** Pure bump.
- **MF 5** Tight.

---

## Proposed Rewrites (events scoring ≤ 14)

All rewrites stay within the existing `EventDefinition` schema.
Fields shown are only the ones that change.
`⚠ SCHEMA FLAG` marks changes that need a new field — listed for approval, not applied here.

---

### 1. `agency_lawsuit` — dominant choice fix + narrative anchor

**Root issue:** Fight and settle cost the same money; fight is strictly better on rep.

```
// BEFORE
description_template: 'Your agency has been named in a major industry lawsuit.',
options: [
  { key: 'fight',               outcome: { money_delta: -5000, reputation_delta:  0 } },
  { key: 'settle_out_of_court', outcome: { money_delta: -5000, reputation_delta: -2 } },
],
default_outcome: { money_delta: -5000, reputation_delta: -5 },

// AFTER
description_template: "{client_name}'s former label has filed suit against the agency over a contract dispute.",
options: [
  { key: 'fight',   label: 'Fight It in Court',    outcome: { money_delta: -8000, reputation_delta:  1, stat_deltas: {} } },
  { key: 'settle',  label: 'Settle Quietly',        outcome: { money_delta: -3000, reputation_delta: -3, stat_deltas: {} } },
],
default_outcome: { money_delta: -5000, reputation_delta: -3, stat_deltas: {} },
```

**What changed and why:** Fight now costs $3,000 more but earns +1 rep (vindicated publicly). Settle is cheaper ($3k vs $8k) but costs 3 rep (reads as guilt). Money-vs-reputation trade-off now exists. Anchoring the lawsuit to a client's former label adds narrative cause at no schema cost.

---

### 2. `police_trouble` — add upside to the "do nothing" branch + mobile fix

**Root issue:** `let_it_play` has no upside; three verbose sentences with a word repeat.

```
// BEFORE
description_template: "You get a call late at night. It's the police, {client_name} has had an incident with the police. It's starting to attract attention.",
options: [
  { key: 'pay_up',      label: 'Pay to Resolve It', outcome: { money_delta: -2500, reputation_delta: -1, stat_deltas: { marketability: -1 } } },
  { key: 'let_it_play', label: 'Let It Play Out',   outcome: { money_delta:     0, reputation_delta: -3, stat_deltas: { marketability: -4 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -3, stat_deltas: { marketability: -4 } },

// AFTER
description_template: "{client_name} called from a police station. The incident is minor, but it'll be public by morning.",
options: [
  { key: 'pay_up',      label: 'Pay to Resolve It', outcome: { money_delta: -2500, reputation_delta: -1, stat_deltas: { marketability: -1 } } },
  { key: 'let_it_run',  label: 'Let It Run',        outcome: { money_delta:     0, reputation_delta: -2, stat_deltas: { marketability: 2, morale: -1 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -3, stat_deltas: { marketability: -2 } },
```

**What changed and why:** "Let it run" now earns mkt +2 (some fans romanticise the edge) at a morale cost, making it a real choice for an artist building a provocateur image when cash is short. Description collapsed to two sentences and drops the word "police" repeat.

---

### 3. `contract_dispute` — give contest a real cost + add narrative context

**Root issue:** Contesting gives free +1 rep with no downside.

```
// BEFORE
description_template: 'A minor contract dispute has emerged with a partner.',
options: [
  { key: 'settle',  label: 'Settle Quickly', outcome: { money_delta: -500, reputation_delta:  0, stat_deltas: {} } },
  { key: 'contest', label: 'Contest It',     outcome: { money_delta:    0, reputation_delta:  1, stat_deltas: {} } },
],
default_outcome: { money_delta: -500, reputation_delta: -2, stat_deltas: {} },

// AFTER
description_template: "A venue is disputing {client_name}'s performance fee from last month.",
options: [
  { key: 'settle',  label: 'Pay and Move On', outcome: { money_delta: -500, reputation_delta: 0, stat_deltas: { morale:  1 } } },
  { key: 'contest', label: 'Fight the Charge', outcome: { money_delta:    0, reputation_delta: 1, stat_deltas: { morale: -2 } } },
],
default_outcome: { money_delta: -500, reputation_delta: -2, stat_deltas: { morale: -1 } },
```

**What changed and why:** Settling now includes morale +1 (stress lifted). Contesting still earns rep but now costs morale -2 (artist is dragged into a public dispute). Makes the choice real for low-morale clients. Grounding it to a venue + performance fee gives the description minimal but meaningful context.

---

### 4. `family_career_skepticism` — fix dominant choice; arc gate flagged separately

**Root issue:** Backing them dominates. Also fires at peak arc (absurd).

```
// BEFORE
options: [
  { key: 'back_their_decision', label: 'Back Their Decision', outcome: { money_delta: -1000, reputation_delta: 0, stat_deltas: { morale:  5, form:  1 } } },
  { key: 'stay_out',            label: 'Stay Out of It',      outcome: { money_delta:     0, reputation_delta: 0, stat_deltas: { morale: -8, form: -3 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -10, form: -4 } },

// AFTER
options: [
  { key: 'back_their_decision', label: 'Back Their Decision', outcome: { money_delta: -1000, reputation_delta: 0, stat_deltas: { morale: 3, form: -2 } } },
  { key: 'stay_out',            label: 'Stay Out of It',      outcome: { money_delta:     0, reputation_delta: 0, stat_deltas: { morale: -4, form:  2 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -1, stat_deltas: { morale: -6, form: -2 } },
```

**What changed and why:** Backing them now costs form -2 (artist spends time with family instead of rehearsing). Staying out now costs only morale -4 instead of -8, but gives form +2 (artist throws themselves into music as a coping mechanism). No longer a dominant choice — morale vs. form is a genuine tension. The arc gate (rising only) requires a schema addition — see `⚠ SCHEMA FLAGS` below.

---

### 5. `negative_review` — flip ignore to have an upside; add catalog gate flag

**Root issue:** `respond` wins on every axis including money. `ignore` has only costs.

```
// BEFORE
options: [
  { key: 'respond', label: 'Respond Publicly', outcome: { money_delta: -500, reputation_delta:  1, stat_deltas: { marketability:  1 } } },
  { key: 'ignore',  label: 'Ignore It',        outcome: { money_delta:    0, reputation_delta: -1, stat_deltas: { marketability: -1 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 } },

// AFTER
options: [
  { key: 'respond', label: 'Hit Back Publicly', outcome: { money_delta: -750, reputation_delta:  1, stat_deltas: { marketability:  1, morale: -1 } } },
  { key: 'ignore',  label: 'Let It Sit',        outcome: { money_delta:    0, reputation_delta: -1, stat_deltas: { marketability: -1, form:  2 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -2, stat_deltas: { marketability: -2 } },
```

**What changed and why:** Responding now costs slightly more (-$750) and stings morale (artist hates engaging with critics). Ignoring now gives form +2 (artist channels the frustration into work). Low-morale or form-needy clients now have a credible reason to ignore. Catalog gate flag: see `⚠ SCHEMA FLAGS`.

---

### 6. `brand_inquiry` — add morale cost to engaging; strengthen the artistic pass

**Root issue:** `engage` wins on three axes simultaneously and gives money.

```
// BEFORE
options: [
  { key: 'engage', label: 'Engage the Brand', outcome: { money_delta: 2000, reputation_delta: 2, stat_deltas: { marketability: 3 } } },
  { key: 'pass',   label: 'Stay Artistic',    outcome: { money_delta:    0, reputation_delta: 0, stat_deltas: { form: 2 } } },
],
default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: {} },

// AFTER
options: [
  { key: 'engage', label: 'Take the Meeting', outcome: { money_delta: 2000, reputation_delta: 1, stat_deltas: { marketability: 3, morale: -2 } } },
  { key: 'pass',   label: 'Stay Artistic',    outcome: { money_delta:    0, reputation_delta: 1, stat_deltas: { form: 2, morale: 2 } } },
],
default_outcome: { money_delta: 0, reputation_delta: 0, stat_deltas: { morale: -1 } },
```

**What changed and why:** Engaging now costs morale -2 (artist feels like a product). Passing gains morale +2 and rep +1 (credibility boost for refusing a deal). For a low-morale client, passing is now genuinely the right call. The windfall framing is retained but the artist-integrity cost is visible.

---

### 7. `streaming_viral` — remove the free money from capitalise; add catalog gate flag

**Root issue:** Capitalising gives more stats on every axis AND earns money. No cost to taking the better option.

```
// BEFORE
options: [
  { key: 'capitalise',  label: 'Capitalise Now', outcome: { money_delta: 500, reputation_delta: 2, stat_deltas: { marketability: 3 } } },
  { key: 'let_it_ride', label: 'Let It Ride',    outcome: { money_delta:   0, reputation_delta: 1, stat_deltas: { form: 1, marketability: 1 } } },
],

// AFTER
options: [
  { key: 'capitalise',  label: 'Push the Moment', outcome: { money_delta: -750, reputation_delta: 2, stat_deltas: { marketability: 4 } } },
  { key: 'let_it_ride', label: 'Let It Ride',     outcome: { money_delta:    0, reputation_delta: 1, stat_deltas: { form: 1, marketability: 2 } } },
],
default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { marketability: 1 } },
```

**What changed and why:** Capitalising now costs $750 (promotion spend) instead of earning $500. The reward is a larger marketability boost (4 vs 2 above let_it_ride). Cash-strapped players now have a real reason to let it ride. Catalog gate flag: see `⚠ SCHEMA FLAGS`.

---

### 8. `drunk_driving` — give the "do nothing" branch an angle; fix mobile length

**Root issue:** `do_nothing` has no upside. Three sentences.

```
// BEFORE
description_template: "You get a call late at night. It's the police, {client_name} has been caught drink-driving. You need to take action now before the news spreads like wildfire.",
options: [
  { key: 'pay_to_manage', label: 'Manage the Fallout', outcome: { money_delta: -3000, reputation_delta: -2, stat_deltas: { marketability: -1, morale: -2 } } },
  { key: 'do_nothing',    label: 'Do Nothing',         outcome: { money_delta:     0, reputation_delta: -5, stat_deltas: { marketability: -5, morale: -3 } } },
],

// AFTER
description_template: "{client_name} called from the back of a police car. The story will be out before dawn.",
options: [
  { key: 'pay_to_manage', label: 'Manage the Fallout', outcome: { money_delta: -3000, reputation_delta: -2, stat_deltas: { marketability: -1, morale: -1 } } },
  { key: 'let_it_play',   label: 'Let It Play Out',    outcome: { money_delta:     0, reputation_delta: -3, stat_deltas: { marketability:  2, morale: -3 } } },
],
default_outcome: { money_delta: 0, reputation_delta: -4, stat_deltas: { marketability: -3, morale: -2 } },
```

**What changed and why:** "Let it play out" now earns mkt +2 (some fans see it as raw and real) at a severe morale cost (-3). For a high-marketability artist with poor morale anyway, this is now worth considering. Description collapsed to two sentences; removed the exhortative third sentence which didn't add information.

---

### 9. `award_nomination` — widen the form gap on stay_focused; add catalog gate flag

**Root issue:** `celebrate` wins on most axes; `stay_focused` gives too little to be interesting.

```
// BEFORE
options: [
  { key: 'celebrate',    label: 'Celebrate Publicly', outcome: { money_delta: -500, reputation_delta: 3, stat_deltas: { morale: 3, marketability: 2 } } },
  { key: 'stay_focused', label: 'Stay Focused',       outcome: { money_delta:    0, reputation_delta: 2, stat_deltas: { form: 2 } } },
],

// AFTER
options: [
  { key: 'celebrate',    label: 'Make Some Noise',  outcome: { money_delta: -1000, reputation_delta: 4, stat_deltas: { morale: 3, marketability: 3 } } },
  { key: 'stay_focused', label: 'Stay in the Room', outcome: { money_delta:     0, reputation_delta: 1, stat_deltas: { form: 5, morale: 1 } } },
],
default_outcome: { money_delta: 0, reputation_delta: 1, stat_deltas: { morale: 1 } },
```

**What changed and why:** Celebrate now costs more (-$1k) but delivers a bigger social splash (rep +4, mkt +3). Stay focused now gives form +5 — a genuinely valuable outcome for an artist mid-campaign who needs form rather than clout. The trade-off is now money+social vs. no-cost+form. Catalog gate flag: see `⚠ SCHEMA FLAGS`.

---

### 10. `health_crisis` — give no_comment a thin upside; fix mobile length

**Root issue:** `no_comment` is pure damage. If you have $5k, it's not a decision.

```
// BEFORE
description_template: '{client_name} has been hospitalised. The news is out and the fans are flooding social media looking for updates.',
options: [
  { key: 'release_statement', label: 'Release Statement', outcome: { money_delta: -5000, reputation_delta: -1, stat_deltas: { morale:  3 } } },
  { key: 'no_comment',        label: 'No Comment',        outcome: { money_delta:     0, reputation_delta: -5, stat_deltas: { morale: -3 } } },
],
default_outcome: { money_delta: -5000, reputation_delta: -5, stat_deltas: { morale: -5, form: -5 } },

// AFTER
description_template: "{client_name} has been hospitalised. Fans are waiting impatiently.",
options: [
  { key: 'release_statement', label: 'Release a Statement', outcome: { money_delta: -5000, reputation_delta: -1, stat_deltas: { morale:  2 } } },
  { key: 'no_comment',        label: 'Stay Silent',         outcome: { money_delta:     0, reputation_delta: -3, stat_deltas: { morale: -2, marketability: 1 } } },
],
default_outcome: { money_delta: -5000, reputation_delta: -4, stat_deltas: { morale: -4, form: -3 } },
```

**What changed and why:** "Stay silent" now earns mkt +1 (mystique; some fanbases find the silence intriguing) while still hurting rep -3 and morale -2. The rep damage gap narrows (-1 vs -3 instead of -1 vs -5) so it's no longer purely a cash check. Description tightened to two sentences.

---

### 11. `major_scandal` — add morale dimension; sharpen description

**Root issue:** No morale on any branch. Description is the most generic crisis framing possible.

```
// BEFORE
description_template: 'A major scandal has engulfed {client_name}. The media is having a field day and the public is outraged.',
options: [
  { key: 'crisis_pr',           outcome: { money_delta: -5000, reputation_delta: -2, stat_deltas: { marketability: -2 } } },
  { key: 'deny',                outcome: { money_delta:     0, reputation_delta: -5, stat_deltas: { marketability: -3 } } },
  { key: 'accept_consequences', outcome: { money_delta: -5000, reputation_delta: -3, stat_deltas: { marketability:  2 } } },
],

// AFTER
description_template: "{client_name} is at the center of a breaking scandal and the window to respond is closing fast.",
options: [
  { key: 'crisis_pr',           label: 'Hire a Crisis PR Team',  outcome: { money_delta: -5000, reputation_delta: -2, stat_deltas: { marketability: -2, morale:  1 } } },
  { key: 'deny',                label: 'Deny Everything',        outcome: { money_delta:     0, reputation_delta: -5, stat_deltas: { marketability: -3, morale:  2 } } },
  { key: 'accept_consequences', label: 'Accept Consequences',    outcome: { money_delta: -5000, reputation_delta: -3, stat_deltas: { marketability:  2, morale:  3 } } },
],
```

**What changed and why:** Added morale to all three branches. Denying gives the highest morale (artist feels vindicated internally even if it's messy publicly). Accepting gives the highest morale + mkt boost (coming clean is cathartic and fans respect honesty). PR team gives minimal morale (professional but emotionally neutral). Now there's a hidden integrity dimension visible in morale. Description shortened and removes "media is having a field day" cliché.

---

### 12. `sync_placement_buzz` — remove free money from capitalise; add license gate flag

**Root issue:** Capitalising earns money AND wins on every stat. No cost.

```
// BEFORE
options: [
  { key: 'capitalise',  label: 'Capitalise on the Moment', outcome: { money_delta: 1000, reputation_delta: 2, stat_deltas: { marketability: 3, form: 1 } } },
  { key: 'let_it_ride', label: 'Let It Ride',              outcome: { money_delta:    0, reputation_delta: 1, stat_deltas: { marketability: 2 } } },
],

// AFTER
options: [
  { key: 'capitalise',  label: 'Push the Moment', outcome: { money_delta: -500, reputation_delta: 2, stat_deltas: { marketability: 4, form: 1 } } },
  { key: 'let_it_ride', label: 'Let It Ride',     outcome: { money_delta:    0, reputation_delta: 1, stat_deltas: { marketability: 2, form: 1 } } },
],
```

**What changed and why:** Capitalising now costs $500 (promo spend) instead of earning $1,000. The mkt reward grows (4 vs 2 above let_it_ride). Both options now give form +1. Cash-tight players have a real reason to let it ride. License scope gate: see `⚠ SCHEMA FLAGS`.

---

## ⚠ Schema Flag Proposals

These rewrites cannot be applied with the current `EventDefinition` schema. Listing here for approval before implementation.

### FLAG 1 — Arc-stage gate on events (`requires_arc_stages`)

**Affected events:** `family_career_skepticism` (should be rising-only), `streaming_viral` (declining arc makes no sense — no active fanbase momentum), `award_nomination` (peak/declining makes more sense than rising).

**Proposed addition to `EventDefinition`:**
```typescript
requires_arc_stages?: ArcStage[];  // if set, client must be in one of these stages
```

**Engine change needed in `isEventEligibleForState`:**
```typescript
if (def.requires_arc_stages && def.requires_arc_stages.length > 0) {
  const clientId = /* the targeted client */;
  const client = state.roster.find(c => c.id === clientId);
  if (!client || !def.requires_arc_stages.includes(client.arc_stage)) return false;
}
```

Note: arc stage is on the targeted client, which is selected after eligibility — so this gate would need to run at the candidate-filtering stage, not before client selection. One approach: filter `manifest.events` to arc-eligible candidates after `selectEventTarget` resolves, or pre-filter by checking whether any roster client satisfies the arc requirement before committing to the event.

---

### FLAG 2 — Catalog release gate on events (`requires_catalog_release_kind`)

**Affected events:** `streaming_viral`, `negative_review`, `award_nomination`, `sync_placement_buzz` — all reference released work but fire with no catalog.

This field already exists on `BoardItemTemplate`. Adding it to `EventDefinition` and handling it in `isEventEligibleForState` is a small, consistent change:

```typescript
// EventDefinition addition
requires_catalog_release_kind?: string[];

// isEventEligibleForState addition
if (def.requires_catalog_release_kind && def.requires_catalog_release_kind.length > 0) {
  const kinds = def.requires_catalog_release_kind;
  const hasRelease = state.roster.some(c =>
    (c.catalog_releases ?? []).some(r => kinds.includes(r.kind))
  );
  if (!hasRelease) return false;
}
```

**Proposed values:**
```
streaming_viral:     requires_catalog_release_kind: ['single', 'album', 'mixtape']
negative_review:     requires_catalog_release_kind: ['single', 'album', 'mixtape']
award_nomination:    requires_catalog_release_kind: ['single', 'album']
sync_placement_buzz: requires_catalog_release_kind: ['single', 'album', 'mixtape']
```

---

## Systemic Patterns (fix these, fix 60% of the problems)

### Pattern 1 — Windfall events uniformly lack trade-offs

`award_nomination`, `brand_inquiry`, `streaming_viral`, `collab_offer`, `sync_placement_buzz`: in all five, one option is better on more axes than the other and often costs nothing or earns money. Windfalls should still involve a real choice — the classic tension is *short-term gain vs. long-term cost* (e.g., creative integrity, morale, form). The fix is consistent: the "capitalise" branch should always spend money or incur a stat cost; the "pass" branch should give a smaller but free or morale-positive outcome.

### Pattern 2 — No event has an arc-stage gate

The engine has no `requires_arc_stages` field on `EventDefinition` (see Flag 1). As a result, `family_career_skepticism` fires at peak, `streaming_viral` fires at rising before any catalog exists, and `award_nomination` fires with nothing to nominate. Every event with arc-dependent narrative needs this gate. Without it, 5–6 events fire in contexts that break fiction.

### Pattern 3 — All 24 events score 1 or 2 on Consequence Depth

No event sets a game flag, references a prior event, or seeds a follow-on. Events appear, resolve, and leave no trace. The system supports `requires_active_scope` and `campaign_type_keys` as trigger conditions, but nothing in `EventOutcome` can set a flag or inject a follow-on event. The closest analogy is `injects_board_item_key` on decisions — a parallel `injects_event_key` or a simple boolean flag like `triggered_followup: 'health_recovery'` would let crises resolve into story threads instead of stat dumps. This is a schema gap, not a content gap.

### Pattern 4 — Description templates only substitute `{client_name}`; client state is invisible

The engine resolves `client_id`, `arc_stage`, active campaigns, traits, and morale before generating an event — but none of that state is accessible in `description_template`. "A music critic published a scathing review of {client_name}'s recent work" is identical whether the client is a rising act with one mixtape or a peak artist with four albums. The cheapest fix within the current schema is to write descriptions that are already specific to the gated context (e.g., `album_deadline_pressure` mentions the album). The real fix is a richer template engine — but that's a schema and engine change.

### Pattern 5 — Pay-to-avoid is the dominant structure for negative events

`police_trouble`, `drunk_driving`, `health_crisis`, `agency_lawsuit`, `negative_review` all share the same skeleton: one option costs money and limits damage, the other option avoids the money cost but takes worse damage on every stat. This collapses to "do you have money?" not "what kind of manager are you?" The fix is to give the "don't pay" branch a genuine upside — street cred, morale, form, artistic integrity — so that solvent players still have a reason to consider it. Seven of the rewrites above apply this directly.

---

## Reputation Economy Analysis — Why You're Always at 0

### Summary

Reputation (called "Clout" in the music variant) starts at 0 and stays near 0 because **every structural force in the system pushes it down while nothing pushes it back up passively**. This is not a content problem — it's a probability and architecture problem.

---

### 1. The Event Fire Rate Is Much Lower Than It Feels

Events only have a **1-in-6 chance of rolling at all** per turn (`EVENT_PRESSURE_CHANCE = 1/6` in `turn-loop.ts`). When they do roll, the probability for each category is:

```
P(category fires) = min(0.95, event_base_rate × turnRamp × pacing × (1 + exposure) × (1 - defenseReduction))
```

With `event_base_rate = 0.08` (`music.ts → economy`), a small early roster (exposure ≈ 0.16), turnRamp ≈ 1.0, and no defense built yet:

```
P(any one category fires | event beat rolls) ≈ 0.08 × 1.0 × 1.0 × 1.16 ≈ 0.093
```

Combined with the 1/6 gate: **P(a specific category fires on a given turn) ≈ 1.5%**.

That means on average, 67 turns pass for every one event in a given category. At 60 turns per career, you might see 3–4 events total across all categories — and only a fraction of those will be rep-moving windfalls.

---

### 2. The Category Loop Systematically Crowds Out Windfalls

`generateEvents()` (`event.ts:157–203`) iterates categories in fixed order and **breaks after the first fires**:

```
for (category of ['client', 'market', 'agency', 'windfall']) {
  if (generated.length >= 1) break;   // ← hard break
  ...
}
```

Windfall only fires if **none** of client, market, or agency fire first. Combined probability:

```
P(windfall fires | event beat rolls) = P(client misses) × P(market misses) × P(agency misses) × P(windfall hits)
≈ (1 - 0.093)³ × 0.093
≈ 0.907³ × 0.093
≈ 0.069
```

Through the 1/6 gate: **P(windfall fires on any given turn) ≈ 1.1%**.

At 60 turns per career, expected windfall events: **0.7**. You'll see zero or one windfall in an entire run.

---

### 3. Full Reputation Ledger — All 24 Events

All player-chosen option outcomes and auto-resolved defaults for reputation, by category.

#### CLIENT events (7 total — defense: medical)

| Event | Key | Severity | Best Option | Worst Option | Auto-Default |
|-------|-----|----------|-------------|--------------|--------------|
| Burnout Risk | `burnout_risk` | minor | **+1** (push_through) | 0 (rest) | **−1** |
| Artist Burnout | `artist_burnout` | major | −1 (hiatus) | −2 (ignore) | **−3** |
| Album Deadline Pressure | `album_deadline_pressure` | major | 0 (extra studio / trim scope) | −1 (push_deadline) | **−1** |
| Health Crisis | `health_crisis` | crisis | −1 (release_statement) | −5 (no_comment) | **−5** |
| Family Skepticism | `family_career_skepticism` | major | 0 (either option) | 0 | **−1** |
| Creative Block | `creative_block` | major | 0 (either option) | 0 | **−1** |
| Artistic Disagreement | `artistic_disagreement` | major | 0 (either option) | 0 | **−1** |

**Client subtotal (best case across all 7):** +1. **Worst case (auto-defaults):** −13.  
Only one option across all 7 events produces any positive reputation (+1 from `burnout_risk → push_through`).

#### MARKET events (7 total — defense: pr)

| Event | Key | Severity | Best Option | Worst Option | Auto-Default |
|-------|-----|----------|-------------|--------------|--------------|
| Negative Review | `negative_review` | minor | **+1** (respond) | −1 (ignore) | **−2** |
| Social Media Controversy | `social_media_controversy` | major | −1 (issue_apology) | −3 (double_down) | **−4** |
| Major Scandal | `major_scandal` | crisis | −2 (crisis_pr) | −5 (deny) | **−6** |
| Drunk Driving | `drunk_driving` | major | −2 (pay_to_manage) | −5 (do_nothing) | **−5** |
| Police Trouble | `police_trouble` | major | −1 (pay_up) | −3 (let_it_play) | **−3** |
| Festival Slot Opening | `festival_slot_opening` | minor | **+2** (seize_it) | 0 (pass) | **−1** |
| Venue Cancellation | `venue_cancellation` | major | 0 (spend_to_fix) | −1 (accept_cancel) | **−2** |

**Market subtotal (best case):** +3 (across all 7, choosing perfectly). **Worst case (auto-defaults):** −23.  
`festival_slot_opening` is the only market event with a positive option — and it's gated to active tour/perform_gigs campaigns.

#### AGENCY events (5 total — defense: legal)

| Event | Key | Severity | Best Option | Worst Option | Auto-Default |
|-------|-----|----------|-------------|--------------|--------------|
| Contract Dispute | `contract_dispute` | minor | **+1** (contest) | 0 (settle) | **−2** |
| Label Dispute | `label_dispute` | major | 0 (negotiate) | −2 (walk_away) | **−3** |
| Feature Demand | `feature_demand` | major | **+1** (accept_feature) | −2 (decline) | 0 |
| Agency Lawsuit | `agency_lawsuit` | crisis | 0 (fight) | −2 (settle_out_of_court) | **−5** |
| Sponsor Backlash | `sponsor_backlash` | major | **+2** (distance) | −3 (defend_deal) | **−4** |
| Brand Crisis | `brand_crisis` | crisis | **+1** (cut_ties) | −5 (ride_it_out) | **−6** |

Note: `sponsor_backlash` and `brand_crisis` require `active_scope: 'sponsor'` — they are ineligible in most runs unless the player has signed a sponsorship contract.

**Agency subtotal (best case):** +5. **Worst case (auto-defaults):** −20.

#### WINDFALL events (6 total — no defense track)

| Event | Key | Gate | Best Option | Worst Option | Auto-Default |
|-------|-----|------|-------------|--------------|--------------|
| Award Nomination | `award_nomination` | none | **+3** (celebrate) | +2 (stay_focused) | **+1** |
| Brand Inquiry | `brand_inquiry` | none | **+2** (engage) | 0 (pass) | **+1** |
| Collab Offer | `collab_offer` | mixtape_drop | **+2** (link_up) | 0 (stay_solo) | **+1** |
| Streaming Viral | `streaming_viral` | none | **+2** (capitalise) | +1 (let_it_ride) | **+1** |
| Sync Placement Buzz | `sync_placement_buzz` | active_scope: license | **+2** (capitalise) | +1 (let_it_ride) | **+1** |
| Song Award | `song_award` | active_scope: license | **+5** (campaign) | +3 (stay_low) | **+2** |

**Windfall subtotal (best case):** +16. **Worst case:** +6. **All auto-defaults:** +7.  
Windfalls are uniformly positive — but you need to see them for them to matter.

---

### 4. The Compounding Structural Problem

Combining all factors:

| Factor | Effect on Rep |
|--------|--------------|
| 1/6 event roll per turn | ~83% of turns see zero rep movement |
| Category priority order | Windfall fires on <1.1% of turns on average |
| 18 negative-category events : 6 windfall events | 3× more likely to get a negative event when one does fire |
| All 18 negative events have only negative auto-defaults | If ignored, always maximum damage |
| 2 of 6 windfalls are scope-gated (license required) | Effective windfall pool is 4 events most of the game |
| Rep floor is 0, no passive recovery | Early losses create a permanent hole |
| No passive reputation gain anywhere | The only organic source is campaign installments |

**The math in a typical 20-turn early run (small roster, 1 campaign):**

- Event beats expected: 20 × (1/6) ≈ 3.3 turns with events
- Of those, P(windfall) ≈ 21% → ~0.7 windfall events
- Of those, P(non-windfall) ≈ 79% → ~2.6 negative events
- Expected rep from events: 0.7 × (+1 default) + 2.6 × (−2 avg default) ≈ **−4.5 rep**
- Expected rep from campaign installments (10 turns, ~30% great rolls): 3 × (+2) + 2 × (−1) = **+4 rep**
- Net: roughly **−0.5 rep** over 20 turns, floored at 0

You don't gain rep — you orbit the floor.

---

### 5. Campaign Installments: The Hidden Rep Source

`rollInstallment()` (`campaign.ts:288`) produces:

```typescript
const reputation_delta = roll_result >= 70 ? 2 : roll_result < 40 ? -1 : 0;
```

- **Great roll (≥ 70):** +2 rep
- **Average roll (40–69):** 0
- **Poor roll (< 40):** −1 rep

For a client with form 50 using a campaign type with `form_weight = 0.8`: `effectiveForm ≈ 40`, with typical `variance = 15`, roughly 30% of installments roll great, 55% average, 15% poor. That's `0.3×2 - 0.15×1 ≈ +0.45 rep per installment`.

A 10-turn campaign yields ~+4 to +5 rep in total — the **single most reliable rep source in the game**. But you can only run one campaign per client, and campaigns are not always active.

---

### 6. Why the Floor Sticks

Even if you recover to +3 or +5 rep, a single unresolved major event (auto-default) returns you to 0:

- `artist_burnout` default: −3
- `major_scandal` default: −6
- `health_crisis` default: −5
- `brand_crisis` default: −6

The positive sources peak at +2 to +5 per event. The negative defaults go to −3 to −6. One ignored crisis undoes 2–3 campaigns of installment gains.

**Reputation only accumulates when all of these are true simultaneously:**
1. You're actively managing events (not auto-defaulting)
2. A windfall actually fires (< 1.1% chance per turn)
3. You're running active campaigns that produce great rolls

None of those are guaranteed per turn. The floor is not a balance choice — it's a consequence of the math.

---

### 7. Fix Proposals (no schema changes required)

These can be done today in content and engine constants:

**Fix A — Passive rep trickle in economy (engine change, `resource.ts` or `turn-loop.ts`):**  
Add `reputation_per_turn: 0.5` to the economy block and apply it in `applyUpkeep()`. At 60 turns, a +0.5/turn trickle adds 30 rep maximum if nothing goes wrong. This gives the floor a floor.

**Fix B — Reorder or parallelize windfall generation:**  
In `generateEvents()`, check windfall independently of the client/market/agency loop. The current hard-break at `TARGET_EVENTS_PER_TURN_MAX = 1` is the culprit. One approach: roll windfall separately before the main loop, accept it at 50% rate even if a negative event also fires (allow 2 events max if one is windfall). This doesn't require a schema change.

**Fix C — Raise `event_base_rate` for windfall category:**  
Currently all categories share the same `event_base_rate = 0.08`. The simplest schema extension is a per-category rate override. Set windfall to 0.20 to compensate for the crowding-out. This requires adding `windfall_event_base_rate` to the economy block or making `event_base_rate` a category map — a small schema change.

**Fix D — Add positive rep options to the 8 negative events that have none:**  
`artist_burnout`, `album_deadline_pressure`, `major_scandal`, `drunk_driving`, `police_trouble`, `label_dispute`, `agency_lawsuit`, `venue_cancellation`: none of their options produce positive rep. Add one option per event that frames the crisis as a brand moment: "Turn It Into a Documentary" (+2 rep, −$2000), "Go Fully Transparent" (+1 rep, −1 marketability), etc. This is a content change only, zero engine or schema work.

**Fix E — Campaign installments: raise great-roll rep from +2 to +3:**  
`campaign.ts:288` — single-line change. This makes campaigns the reliable rep backbone the game needs without adding new systems.

**Fix F — Remove the rep floor from auto-defaults on minor events:**  
Minor events (`contract_dispute`, `negative_review`, `burnout_risk`) default to −1 or −2. Change minor defaults to 0 rep and −1 stat only. Players who miss minor events shouldn't be punished as hard as those who ignore crises. This makes the floor feel less like a trap.
