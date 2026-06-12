# Decisions

Each decision lists gate conditions, options with fixed outcomes, and any roll-based outcomes.

Roll notation: `roll(stat)` — weighted by that stat's true value; high stat tilts toward success.
Cost tiers: small ~$500–1k, medium ~$2–5k, large ~$10k+.
Stat shorthands: mkt = marketability, aud = audience.

---

# No artists on roster

### Family friend recording help
*Gate: roster empty*

**Help them out**
- Fixed: +money (small)
- if rep ≥ medium threshold: roll(coaching) → success: → signs new client (high morale, high mkt, avg form, avg talent) / fail: +money only

**Decline**
- Fixed: nothing

---

### Friend's song [one-time, early turns only]
*Gate: roster empty, turn ≤ 3*

**Listen and sign them**
- Fixed: → signs special client (very high morale, very high mkt, avg-good form, avg talent)

**Pass**
- Fixed: nothing; opportunity does not return

---

### Overseas networking event
*Gate: rep ≥ 100*

**Attend** (costs money: medium)
- Fixed: +rep (small)
- roll(negotiation): success → adds established (non-rising) prospect to scouting pool / fail: +rep only

**Skip**
- Fixed: nothing

---

### Desperate offer [blind]
*Gate: roster empty*

**Accept**
- Fixed: → signs client (good contract terms for you; client stats unknown until scouted)

**Decline**
- Fixed: nothing

---

# Low money, no artists, starting out

### Concert crew work
*Gate: money < low threshold, roster empty, early turns; blocks campaigns and signing this turn*

**Take the job**
- Fixed: +money (small)
- roll(operations): success → +1 to agent stat matching the job type / fail: +money only

**Decline**
- Fixed: nothing

---

## Scouting trips (only one fires per turn)

### Go to a local concert
*Gate: any time; max one scouting event per turn*

**Go** (costs money: small)
- roll(stat_scouting): success → adds prospect to pool; prospect quality scales with stat_scouting / fail: nothing found

**Skip**
- Fixed: nothing

---

### Go to a local pub
*Gate: any time; max one scouting event per turn*

**Go** (costs money: small)
- roll(stat_scouting): success → adds prospect to pool; prospect quality scales with stat_scouting / fail: nothing found

**Skip**
- Fixed: nothing

---

### Park encounter
*Gate: any time; max one scouting event per turn; very low spawn rate*

**Stop and listen**
- roll(flat low base; stat_scouting does not improve odds): success → adds legendary-tier prospect / fail: nothing

**Walk past**
- Fixed: nothing

---

# At least 1 artist

## Declining arc

### Old post resurfaces [auto-event] ADDED
*Gate: arc = declining*

**Let it play out**
- roll(mkt): success → +fans (reinterpretation; new generation finds them) / fail → -fans -rep (cancellation wave)

**Get ahead of it** (costs money: small; requires pr_defense ≥ 1)
- Fixed: +morale
- roll(pr_defense + mkt): success → neutral; public moves on / fail → -fans only (softer than ignoring)

---

### Audience generational shift
*Gate: arc = declining*

**Adapt to new audience**
- Fixed: -morale
- roll(coaching × mkt): success → +mkt +fans (new demographic) / fail → -fans (lost old audience, gained nothing)

**Stay authentic**
- Fixed: +morale +form, -fans (slow, gradual)

---

## Peak arc

### Artist's style sets a trend [1M+ fans] ADDED
*Gate: arc = peak, aud ≥ 1,000,000*

**Invest** (costs money: medium)
- Fixed: ++fans +morale

**Let it ride**
- Fixed: +fans +morale (smaller)

---

### Buy back early music rights ADDED
*Gate: arc = peak*

**Purchase** (costs money: large)
- Fixed: +morale; unlocks rerecording decisions and improves passive catalog income

**Pass**
- Fixed: nothing

---

### Re-record older songs
*Gate: arc = peak; buy-back completed*

**Re-record** (costs money: medium)
- roll(talent × coaching): success → +quality of re-release, +fans / fail → -morale (fell short of the original)

**Pass**
- Fixed: nothing

---

### Platform rights dispute [auto-event]
*Gate: arc = peak*

**Fight it** (costs money: medium; requires legal_defense ≥ 1)
- roll(legal_defense): success → rights restored, +rep / fail → -money (legal fees), -rep (public dispute drags on)

**Let it be**
- Fixed: -fans (gradual stream loss), -rep (small)

---

## Rising arc, no label

### Sign a small record deal
*Gate: arc = rising, no label contract*

**Sign**
- Fixed: → label contract (small label; unfavorable revenue split; distribution and promo included)

**Stay independent**
- Fixed: +morale, +form (creative control)

---

### Local shop sponsor offer
*Gate: arc = rising, no label*

**Accept**
- Fixed: → sponsor contract (small per-turn income, +rep per turn)

**Decline**
- Fixed: nothing

---

### Open for popular local band
*Gate: arc = rising, no label*

**Open for them** (costs money: small, travel)
- roll(form): success → +fans +mkt / fail → +fans (small, exposure still helps), -morale

**Decline**
- Fixed: nothing

---

### Commercial producer offer
*Gate: arc = rising, no label*

**Let the producer reshape**
- Fixed: -morale
- roll(mkt): success → +mkt +fans (commercial reach) / fail → -morale (compromised sound, no reward)

**Self-produce**
- Fixed: +morale +form, -fans (slower growth without commercial push)

---

### Weekday venue slot (early morning next day) ADDED
*Gate: arc = rising*

**Take it**
- Fixed: +fans (small) +money (small) -morale -form

**Pass**
- Fixed: nothing

---

### Music blog interview ADDED
*Gate: arc = rising*

**Speak honestly**
- Fixed: +fans (small) +rep (small)

**Thoughtful critique**
- roll(mkt): success → +rep (moderate) / fail → -rep (backfired in the local scene)

---

### Community festival application
*Gate: arc = rising, no active campaign*

**Apply**
- Fixed: → starts short gig campaign (very low money, good fan gains)

**Pass**
- Fixed: nothing

---

### Independent label contract [blind terms]
*Gate: arc = rising, no label*

**Sign**
- Fixed: → label contract (bad revenue split, high % cut; distribution and promo included)

**Decline**
- Fixed: nothing

---

### Merch: print run offer
*Gate: arc = rising*

**Invest** (costs money: small)
- roll(mkt × aud): success → +money +fans / fail → -money (unsold stock)

**Pass**
- Fixed: nothing

---

### Larger city show offer
*Gate: arc = rising*

**Go** (costs money: medium, travel)
- roll(form × mkt): success → +fans +rep (new scene breakthrough) / fail → -money (no return, no audience there)

**Stay local**
- Fixed: nothing

---

### Café recurring slot
*Gate: arc = rising, no active campaign*

**Accept**
- Fixed: → starts custom gig campaign (+money per installment; -morale per installment for image mismatch)

**Decline**
- Fixed: nothing

---

### Exploitative venue owner
*Gate: arc = rising, no active campaign*

**Accept anyway**
- Fixed: → starts custom gig campaign (+form per installment from stage time; low money; -morale per installment)

**Decline**
- Fixed: +morale (self-respect)

---

### Playlist pay-for-play ADDED
*Gate: arc = rising*

**Pay** (costs money: small)
- Fixed: +fans (moderate, stream boost)
- roll(pr_defense): success → no rep loss / fail → -rep (pay-to-play becomes public)

**Decline**
- Fixed: nothing

---

### Last-minute opener (unprepared) ADDED
*Gate: arc = rising*

**Do it**
- roll(form): success → +fans +mkt / fail → -morale, -rep (small)

**Pass**
- Fixed: -morale (artist feels they let it go)

---

### Join touring band
*Gate: arc = rising*

**Join**
- Fixed: → starts long tour campaign (good money per installment; blocks other campaigns until complete)

**Decline**
- Fixed: +morale (solo focus preserved)

---

## General (1+ artists)

### Work/life balance struggle [low-quality or early artist]
*Gate: talent < 50 or arc = rising (early turns)*

**Support them** (costs money: small)
- roll(coaching): success → +morale +form (stabilized) / fail → -money, -morale (intervention backfired)

**Push through**
- Fixed: -form -morale (gradual, each turn this persists)

---

### Photographed with someone [rumors] ADDED
*Gate: general*

**Let people talk**
- Fixed: +fans (small) -morale

**PR manage** (costs money: small; requires pr_defense ≥ 1)
- Fixed: +morale
- roll(pr_defense): success → +rep (clean narrative landed) / fail → neutral (damage contained, no gain)

---

### First interview [one-time per client]
*Gate: fires once per client*

**Auto-outcome** — roll(mkt × form × morale):
- success → +fans +rep
- fail → -fans (word gets out they don't interview well)

---

# Has a label

### Leave the label
*Gate: has label, arc = peak or rising*

**Leave**
- Fixed: ends label contract; +morale +form; -money (lose label distribution and promo budget)

**Stay**
- Fixed: nothing

---

### Label controls interview talking points
*Gate: has label*

**Follow the script**
- roll(mkt): success → +mkt / fail → -fans (audience senses inauthenticity)

**Answer honestly**
- Fixed: +fans

**Decline the interview**
- Fixed: +morale; -label relationship

---

### Label wants daily personal content
*Gate: has label*

**Comply**
- Fixed: +fans per turn, -morale per turn (persists until rescinded)

**Refuse**
- Fixed: nothing; possible -label relationship

---

### Label shifts budget to new signing
*Gate: has label*

**Demand a meeting**
- roll(negotiation): success → budget maintained, +rep / fail → -rep, -label relationship

**Collaborate with the new artist**
- roll(talent × mkt): success → +fans, rep neutral / fail → -rep (overshadowed)

**Do nothing**
- Fixed: -fans (gradual, less promotion)

---

# Has a sponsor contract

### Brand tries to commercialize artist's image [auto-event]
*Gate: has sponsor contract*

**Cancel the contract**
- Fixed: ends sponsor contract; +morale

**Keep it**
- Fixed: --morale (ongoing each turn)

---

# Generating an album or mixtape

### Great idea surfaces ADDED
*Gate: generating album or mixtape*

**Sponsor it** (costs money: small)
- roll(talent × coaching): success → +quality / fail → +morale only (artist appreciated the attempt)

**Pass**
- Fixed: -morale (artist wanted your backing)

---

### Writer's block [auto-event] ADDED
*Gate: generating album or mixtape*

**Pay to resolve** (costs money: medium)
- Fixed: unblocks; quality preserved

**Let it be**
- Fixed: -quality; +1 turn added to campaign

---

### Better studio request ADDED
*Gate: generating album or mixtape*

**Upgrade** (costs money: medium)
- roll(talent): success → +quality / fail → quality unchanged (spend wasted)

**Keep current**
- Fixed: nothing

---

### Producer wants to reshape the sound ADDED
*Gate: generating album or mixtape*

**Let them** (costs money: small)
- roll(talent × coaching): success → +quality / fail → -morale, -quality (creative damage without benefit)

**Decline**
- Fixed: +morale +form (artist stays true to vision)

---

### Artist-designed album cover ADDED
*Gate: generating album*

**Commission it** (costs money: small)
- Fixed: +quality (small)

**Skip**
- Fixed: nothing

---

### Artist hates the project and wants to scrap it [auto-event] ADDED
*Gate: generating album or mixtape; campaign turn > 2*

**Let them scrap it**
- Fixed: ends campaign; +morale; partial money refund (sunk costs partially recovered)

**Push through**
- Fixed: -morale; campaign continues (risk of further morale decay each turn)

---

### Videographer offer ADDED
*Gate: generating album or mixtape*

**Commission** (costs money: large)
- Fixed: +quality (moderate)

**Decline**
- Fixed: nothing

---

# Generating a mixtape only

### Budget constraint: what to record?
*Gate: generating mixtape, arc = rising*

**One polished single**
- Fixed: high quality; fewer tracks

**Multiple simpler songs**
- Fixed: medium quality; more tracks

**Invest in home equipment** (costs money: small)
- Fixed: no immediate quality gain; unlocks a +quality bonus on future recording campaigns

---

# Generating an album only

### Label delays album for strategic reasons [auto-event]
*Gate: generating album, has label*

**Agree to delay**
- Fixed: +money (better release window); +label relationship

**Argue against it**
- roll(negotiation): success → release proceeds on schedule / fail → -label relationship; delayed anyway

---

### Unreleased album leaks online [auto-event]
*Gate: generating album*

**Embrace it — release now**
- Fixed: ends campaign early; +fans; -quality positioning (rushed rollout)

**Fight to suppress** (costs money: medium; requires legal_defense ≥ 1)
- roll(legal_defense): success → leak suppressed; campaign continues / fail → -rep; +fans (leak spreads regardless)

---

# Selling an album or single

### Very different sound confuses the audience ADDED
*Gate: selling album or single*

**Spin it** (costs money: small)
- Fixed: +fans (new audience); -fans (small, some existing fans leave)

**Do nothing**
- Fixed: -sales (campaign quality reduced this turn)

---

### Unexpected viral clip [auto-event] ADDED
*Gate: selling album or single*
- Fixed: +fans (moderate, one-time spike)

---

### Low-quality song unexpectedly blows up [auto-event]
*Gate: selling album*
- Fixed: +fans; +campaign quality (small — broader interest lifts all tracks)

---

### Audience reacts badly [first turn post-release only; excludes "reacts well"]
*Gate: selling; turn 1 post-release*
- Fixed: -sales this turn; fan count unaffected

---

### Audience reacts well [first turn post-release only; excludes "reacts badly"]
*Gate: selling; turn 1 post-release*
- Fixed: +sales this turn; +fans

---

### Song suddenly gains traction ADDED
*Gate: selling album or single*

**Capitalize** (costs money: small)
- Fixed: ++fans

**Ignore**
- Fixed: +fans (smaller)

---

# Selling an album (not the first)

### "Too polished" backlash from early fans
*Gate: selling album; not first album*

**Defend the new direction**
- Fixed: +form +morale
- roll(mkt): success → fans unaffected / fail → -fans (some old fans leave)

**Ignore the criticism**
- Fixed: -fans

---

# Selling an underwhelming album, has label

### Dropped by the label [auto-event]
*Gate: has label; album underperforms*
- Fixed: label contract ends; -rep

---

# Active single or album campaign

### Music video opportunity ADDED
*Gate: active single or album campaign*

**Commission** (costs money: medium)
- roll(campaign quality): success → +fans (large) / fail → +fans (small; video was weak)

**Skip**
- Fixed: nothing

---

### Agent provides input on recording
*Gate: active single or album campaign*

**Provide input**
- roll(coaching): success → +quality / fail → -quality (your input was off; artist loses confidence in you)

---

# No active campaign

### Artist releases album without warning [auto-event]
*Gate: no active campaign; at least 1 prior catalog release*
- Fixed: → starts selling campaign; quality = average of prior releases (no production boost)

---

### Inspiration
*Gate: no active campaign*

**Finance an album** (costs money: medium)
- Fixed: → starts album campaign with +quality bonus (motivated start)

**Finance a single** (costs money: small)
- Fixed: → starts single campaign with +quality bonus

**Pass**
- Fixed: nothing; event does not recur immediately

---

### Festival underpaid invite
*Gate: no active campaign*

**Accept**
- Fixed: → starts small tour campaign (free to start; very low pay per installment; good fan gains)

**Decline**
- Fixed: nothing

---

# On tour or doing gigs

### Terrible weather at outdoor festival ADDED
*Gate: on tour or gig campaign*

**Delay the show**
- if aud < 100,000 and arc = rising: -fans -form
- if aud ≥ 100,000: no consequence (fans are patient with an established act)

**Play through**
- if arc = rising and aud < 100,000: roll(form) → success: +form +mkt +fans, -morale / fail: -fans -morale
- if aud ≥ 100,000: +fans +form (crowd respects the commitment)

---

### Sound system fails — acoustic set [auto-event]
*Gate: on tour or gig campaign* *(not yet implemented — needs form-threshold gate)*

**Auto-outcome** — roll(form):
- form ≥ 60 → +mkt +form (crowd loves the raw performance)
- form < 60 → -fans (not strong enough to save it without a PA)

---

### Guitarist leaves before show ADDED
*Gate: on tour or gig campaign*

**Find a replacement** (costs money: small)
- roll(operations): success → campaign quality maintained / fail → -quality this installment

**Cancel the show**
- Fixed: -fans -rep

**Play without them**
- roll(talent): success → +form (artist proves themselves) / fail → -fans

---

### Venue cancels last minute [auto-event] ADDED
*Gate: on tour or gig campaign*

**Spend to fix it** (costs money: medium)
- Fixed: campaign quality maintained

**Accept the cancellation**
- Fixed: -quality this installment

---

### Opens for a bigger artist [auto-event, one-time] ADDED
*Gate: on tour or gig campaign*

**Auto-outcome** — roll(form × mkt):
- success → ++fans (new audience captured)
- fail → -rep (booed off; word travels)

---

### Technical accident on stage ADDED
*Gate: on tour or gig campaign*

**Embrace the chaos**
- roll(mkt): success → +fans +form (crowd loves it) / fail → -morale -fans

**Try to resolve it**
- roll(form): success → campaign quality restored / fail → -fans (disruption too visible to recover from)

---

# Tours only

### Spot talent in a local opener [established acts]
*Gate: on tour; stat_scouting ≥ medium*

**Scout them**
- Fixed: → adds prospect to pool; fog moderately narrowed by stat_scouting

**Ignore**
- Fixed: nothing

---

### Illness or exhaustion forces cancellation ADDED
*Gate: on tour*

**Force them to play**
- Fixed: -form -morale; campaign continues

**Skip the installment**
- Fixed: -fans (one installment missed); form and morale preserved

---

### World tour — artist wants a private plane [1M+ fans]
*Gate: on tour; aud ≥ 1,000,000*

**Rent it** (costs money: large)
- Fixed: +morale

**Decline**
- Fixed: --morale

---

### Tour is emotionally draining
*Gate: on tour; multi-turn campaign*

**Take a break**
- Fixed: ends campaign early; +morale +form

**Push through**
- Fixed: -form -morale each remaining installment

---

# Has label, making an album

### Label rejects album: wants commercial singles
*Gate: has label, generating album*

**Delay and comply**
- Fixed: +label relationship; -morale; +1 turn added to campaign

**Submit anyway**
- roll(negotiation): success → label accepts; relationship neutral / fail → -label relationship

---

### Label wants the accessible song as first single
*Gate: has label, generating album*

**Follow the label's plan**
- Fixed: +money (commercial push); fans neutral

**Insist on the artist's preferred track**
- Fixed: +fans (credibility with core audience)

---

### Two songs not ready at release date
*Gate: has label, generating album; final turns of campaign*

**Release on schedule**
- Fixed: +label relationship

**Request a delay**
- Fixed: +quality; -label relationship; -fans (short-term momentum lost)

**Remove the unfinished songs**
- roll(talent): success → +quality (tighter, focused album) / fail → -quality (missing tracks leave a gap)

---

### Label proposes an artist collaboration
*Gate: has label, generating album*

**Accept**
- Fixed: -quality; +label relationship; +fans (new audience via collaborator)

**Refuse**
- Fixed: +quality; label relationship neutral

---

### Marketing team suggests a fake feud
*Gate: has label, generating album; pre-release*

**Fake feud**
- Fixed: ++fans (short-term spike)
- roll(rep): success → rep unaffected / fail → -rep (perceived as manufactured)

**Normal promotion**
- Fixed: +fans (steady, smaller); rep stable

**Playful public exchange**
- Fixed: +fans (moderate); rep neutral

---

# Has label, making a single

### Label wants the single recorded by a bigger artist
*Gate: has label, making single*

**Give it up**
- Fixed: +money (large); ends single campaign; track removed from catalog

**Keep it**
- Fixed: campaign continues; +quality (it's a very good song)

---

# Has label, selling a successful album (peak, 100k+ fans)

### Label wants a deluxe edition
*Gate: has label; selling album; arc = peak; aud ≥ 100,000*

**Agree**
- Fixed: → starts additional release campaign; +sales on current album (renewed attention)

**Refuse**
- Fixed: +morale +form

---

# Has label, on tour

### Label wants to extend the tour
*Gate: has label; on tour; tour performing well*

**Add dates**
- Fixed: extends campaign; +money per added installment; -morale -form (fatigue)

**Refuse**
- Fixed: +morale; possible -label relationship

---

### Choose the opening act
*Gate: has label; on tour; headline show*

**Close friend's band**
- Fixed: +form; -tour quality (weaker support slot)

**Trendy rising act**
- Fixed: +tour quality
- roll(mkt): success → rep neutral / fail → -rep (overshadowed by opener)

---

### Label recommends a larger hometown venue
*Gate: has label; on tour*

**Book the large venue**
- roll(mkt × aud): success → +fans +rep (defining career moment) / fail → -rep (visible failure to fill it)

**Book the smaller venue (guaranteed sell-out)**
- Fixed: +rep (sold out); revenue capped

---

# At least 2 artists

### Two low-morale clients fight [auto-event]
*Gate: 2+ clients; both morale < 40*

**Ignore it**
- Fixed: -rep

**Intervene**
- roll(coaching + negotiation): success → +rep (resolved professionally) / fail → --rep (made it worse publicly)

---

### Replace musician before televised performance
*Gate: 2+ clients*

**Send Artist A**
- roll(A.form × A.talent): success → +rep +fans / fail → -rep

**Send Artist B**
- roll(B.form × B.talent): success → +rep +fans / fail → -rep

*(Player is making a judgment call under fog — scouting determines how accurately they can read each artist's true readiness)*
