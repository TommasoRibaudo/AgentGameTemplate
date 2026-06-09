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
3. Confirm the debt state opens. PASSED
4. Go to Agency. PASSED
5. Confirm the Bank panel shows debt balance, credit ceiling, and loan controls. NOT PASSED EVERYTHING SEEMS TO BE AT 0
6. Take a valid loan. NOT PASSED CANNOT TAKE A LOAN
7. Confirm money increases and debt balance increases. TAKING A LOAN DOES NOT INCREASE MONEY
8. Advance turns and confirm repayments occur. CANNOT TEST
9. If possible, recover by repaying debt and confirm debt state closes. CANNOT TEST
10. If possible, force missed repayment with no credit headroom. CANNOT TESTS
11. Confirm a bankruptcy warning appears before the run ends. DO NOT SEE IT EVEN AFTER ENDING THE TURN A BUNCH OF TIMES
12. Confirm bankruptcy ends the run only after the grace period. CANNOT TEST

Report:

- Debt opened at turn:
- Loan amount:
- Recovery worked:
- Bankruptcy path worked:

## Campaigns And Traits

1. Sign a prospect and open that client from Roster.
2. Open the Campaign tab.
3. Confirm available campaigns show Start controls without needing a Home decision.
4. Change campaign size between small, medium, and large.
5. Confirm the projected budget, payout, fans, and event risk change.
6. Change campaign length with the minus/plus buttons.
7. Confirm the campaign budget changes with length.
8. Lower or raise the campaign budget with the minus/plus buttons.
9. If the budget is unaffordable, confirm Start is disabled and shows how much more money is needed.
10. Start an affordable campaign.
11. Confirm money immediately decreases by the selected campaign budget.
12. Confirm the client shows an active campaign with size, budget, payout, and turns left.
13. Advance turns while the campaign is active.
14. Confirm installment results appear in client campaign history or news.
15. Confirm campaign income appears in money changes/news when the campaign pays monthly.
16. Confirm the client's fans/listeners/followers increase after campaign installments.
17. Continue until the campaign closes.
18. Confirm objectives settle and news is recorded if the campaign was linked to an objective.
19. If a trait is granted, confirm it appears on the client and later rolls use its modifier.

gains from a a campaign are not being shown in the monthly report (I make money and I dont know why as it says I should be losing money)
Report:

- Campaign type:
- Campaign size/length/budget:
- Completed on turn:
- Payout/objectives correct:
- Audience grew:
- Trait grant observed:

## Events And Windfalls

1. Advance several turns with at least one client on the roster. PASSED
2. Confirm events appear at a reasonable frequency, usually 0 to 2 per turn. PASSED
3. Resolve an event option. PASSED
4. Confirm money, reputation, or client changes are applied. PASSED
5. Dismiss or ignore an event once. PASSED
6. Confirm the default outcome applies at turn end. PASSED
7. If a windfall event appears, confirm it can inject a decision board item during the current Decision phase. CANT SEE ANY

Report:

- Event frequency felt too low/right/too high:
- Default event behavior worked:
- Windfall board injection observed:

## Retirement And End Screens

1. During the Decision phase, go to Agency. PASSED
2. Tap Retire. PASSED
3. Confirm the retirement confirmation appears. PASSED
4. Confirm retirement ends the run. PASSED
5. Confirm Career Summary shows score and run outcome. PASSED
6. Open Leaderboard, Achievements, and Legacy screens. PASSED
7. Confirm the completed run appears where expected. PASSED

Report:

- Retirement worked:
- Score displayed:
- Meta screens updated:

## Open Tuning Questions

Use these notes to decide whether the placeholder values need changes.

1. Career length: Does 60 turns feel like the right target, too short, or too long? WAY TOO SHORT, NEEDS TO BE EVERY TURN IS A WEEK, YOU RETIRE AFTER 40 YEARS (YOU DO NOT SEE THIS LIMIT, ALSO THERE SHOULD BE EVENTS TIED TO THIS AS YOU APROACH OLD AGE: YOU FEEL TIRED, AND SOON PLAN TO RETIRE)
2. Fog curve: Does scouting feel useful early? Does Talent correctly stay uncertain? THE FOG NEEDS TO BE MORE OBSCURE AT FIRST
3. Push risk: Are Push outcomes understandable and worth using? NO IDEA WHAT YOU ARE TALKING ABOUT BUT THE DECISION I APPROVE HAVE NO VISIBLE OUTPUT
4. Exposure: At mid-game roster size, do events average around 0.5 per turn? THERE ARE A LOT OF EVENTS AND I JUST STARTED
5. Credit ceiling: Does available credit feel fair based on reputation and roster value? BANK DOES NOT WORK
6. Career score: Does the final score reward the run's actual success? COULD BE 
7. Economy: Are the first 3 turns tight but survivable? NO YOU JUST MAKE MEGA DOUGH
8. Progression: Do upgrades feel meaningful but achievable? EVERYTHING MOVES VERY FAST

## Final Report Template

- Platform: IOS EXPO GO
- App started cleanly: YES
- Automated tests passed before manual test: YES
- TypeScript passed before manual test: YES
- Number of turns played: A COUPLE OF MATCHES FOR 20 TURNS
- Major blockers: I IMMEDIATELY STARTED MAKING SERIOUS DOUGH BECAUSE I HAD PEOPLE WITH FOUR LABELS CONTRACTS LOL
- Minor bugs:
- Confusing UX: CONTRACTS ARE NOT CLEAR AT ALL
- Economy/tuning notes: EVERYTHING HAPPENS TOO QUICKLY, NO INITIAL STRUGGLE
- Screenshots or videos captured:
- Recommended next fixes: CHECK AgentGameTemplate\Improvements.md
