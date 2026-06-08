# Manual Testing Checklist

Use this after automated tests pass. Record exact failures, screenshots, and the turn number whenever something feels wrong.

## Before You Start

1. Run `npm test -- --runInBand`. PASSED
2. Run `npx tsc --noEmit`. PASSED
3. Start the app with `npm run start`. PASSED
4. Create a new Music Manager career. PASSED
5. Note the platform tested: Expo Go, simulator, emulator, or device. EXPO GO IPHONE

## Smoke Test

1. Confirm the New Career screen opens. PASSED
2. Start a Music Manager run. PASSED
3. Confirm the main tabs are available: Home, Roster, Scout, Agency. PASSED
4. Confirm the top bar shows money, reputation, roster count, and turn count. PASSED 
5. Navigate to every tab and back without crashes. PASSED
6. Close and reopen the app. IN EXPO THIS DOES NOT WORK
7. Confirm the active run reloads. IN EXPO GO THIS DOES NOT WORK 

## Three-Turn Core Loop

For each of turns 1, 2, and 3:

1. Open Home. PASSED
2. Confirm the news feed is visible. PASSED BUT: ARE THE NEWS JUST GONNA STACK FOREVER? MAYBE YOU ONLY SEE CURRENT AND PREVIOUS TURN NEWS. 
3. Confirm the decision board has 2 to 5 items. PASSED ONLY SEE 2 EVERY TIME
4. Resolve at least one decision item. PASSED
5. Leave at least one decision item unresolved once, then press End Turn. PASSED
6. Confirm the unresolved-item warning appears. PASSED
7. End the turn. PASSED
8. Confirm the turn number advances by 1. PASSED
9. Confirm news from the prior turn remains visible or is summarized. PASSED
10. Confirm money and reputation changes make sense based on visible outcomes. PASSED

Report:

- Turn 1 result:
- Turn 2 result:
- Turn 3 result:
- Any confusing text or missing feedback:

## Scout And Sign Flow

1. Go to Scout. PASSED
2. Open a prospect detail screen. PASSED
3. Invest in Talent. PASSED
4. Confirm money decreases by the scouting cost. NOT PASSED, DOES NOT HAPPEN
5. Confirm the Talent fog band narrows but does not become exact. PASSED
6. Invest in Form, Marketability, or Morale. PASSED
7. Confirm the soft stat fog band narrows. NOT PASSED, DOES NOT HAPPEN
8. Tap Sign on a prospect. PASSED
9. Confirm a signing offer is queued for the Decision Board. PASSED
10. Approve the signing offer from Home. PASSED
11. Confirm the prospect moves to Roster. PASSED
12. Open the client detail screen. PASSED
13. Confirm the client has Overview, Stats, Contracts, and Campaign content. PASSED

Report:

- Prospect signed:
- Did fog change clearly after scouting:
- Any sign-flow issue:

## Roster Capacity

1. Sign clients until the roster reaches capacity. PASSED
2. Return to Scout. PASSED
3. Confirm signing is blocked or disabled for additional prospects. PASSED
4. Go to Agency. PASSED
5. Upgrade roster capacity if affordable. PASSED
6. Confirm the roster capacity increases. PASSED
7. Return to Scout and confirm signing is available again. PASSED

Report:

- Capacity before upgrade:
- Capacity after upgrade:
- Any incorrect signing state:

## Agency Upgrades

1. Go to Agency. PASSED
2. Check each agent stat upgrade button. PASSED
3. Upgrade one affordable agent stat. PASSED
4. Confirm money and reputation costs are deducted. PASSED
5. Confirm the stat level increases. PASSED
6. Upgrade a defense track if affordable. PASSED
7. Confirm its recurring cost is shown or reflected in later upkeep. PASSED
8. Confirm unaffordable upgrades are disabled. PASSED

Report:

- Upgrade tested:
- Costs deducted correctly:
- Any unclear disabled state:

## Debt And Bankruptcy

This may require spending aggressively or running several turns without income.

1. Spend or advance until money reaches 0. PASSED
2. Confirm the low-money warning appears. NOT PASSED DOES NOT SHOW UP
3. Confirm the debt state opens.
4. Go to Agency.
5. Confirm the Bank panel shows debt balance, credit ceiling, and loan controls.
6. Take a valid loan.
7. Confirm money increases and debt balance increases.
8. Advance turns and confirm repayments occur.
9. If possible, recover by repaying debt and confirm debt state closes.
10. If possible, force missed repayment with no credit headroom.
11. Confirm a bankruptcy warning appears before the run ends.
12. Confirm bankruptcy ends the run only after the grace period.

Report:

- Debt opened at turn:
- Loan amount:
- Recovery worked:
- Bankruptcy path worked:

## Campaigns And Traits

1. Find or create a decision that starts a campaign.
2. Approve it.
3. Confirm the client shows an active campaign.
4. Advance turns while the campaign is active.
5. Confirm installment results appear in client campaign history or news.
6. Confirm campaign stat deltas affect the client.
7. Continue until the campaign closes.
8. Confirm objectives settle and news is recorded.
9. If a trait is granted, confirm it appears on the client and later rolls use its modifier.

Report:

- Campaign type:
- Completed on turn:
- Payout/objectives correct:
- Trait grant observed:

## Events And Windfalls

1. Advance several turns with at least one client on the roster.
2. Confirm events appear at a reasonable frequency, usually 0 to 2 per turn.
3. Resolve an event option.
4. Confirm money, reputation, or client changes are applied.
5. Dismiss or ignore an event once.
6. Confirm the default outcome applies at turn end.
7. If a windfall event appears, confirm it can inject a decision board item during the current Decision phase.

Report:

- Event frequency felt too low/right/too high:
- Default event behavior worked:
- Windfall board injection observed:

## Retirement And End Screens

1. During the Decision phase, go to Agency.
2. Tap Retire.
3. Confirm the retirement confirmation appears.
4. Confirm retirement ends the run.
5. Confirm Career Summary shows score and run outcome.
6. Open Leaderboard, Achievements, and Legacy screens.
7. Confirm the completed run appears where expected.

Report:

- Retirement worked:
- Score displayed:
- Meta screens updated:

## Open Tuning Questions

Use these notes to decide whether the placeholder values need changes.

1. Career length: Does 60 turns feel like the right target, too short, or too long?
2. Fog curve: Does scouting feel useful early? Does Talent correctly stay uncertain?
3. Push risk: Are Push outcomes understandable and worth using?
4. Exposure: At mid-game roster size, do events average around 0.5 per turn?
5. Credit ceiling: Does available credit feel fair based on reputation and roster value?
6. Career score: Does the final score reward the run's actual success?
7. Economy: Are the first 3 turns tight but survivable?
8. Progression: Do upgrades feel meaningful but achievable?

## Final Report Template

- Platform:
- App started cleanly:
- Automated tests passed before manual test:
- TypeScript passed before manual test:
- Number of turns played:
- Major blockers:
- Minor bugs:
- Confusing UX:
- Economy/tuning notes:
- Screenshots or videos captured:
- Recommended next fixes:
