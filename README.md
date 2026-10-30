# Solana AI Trader V3 — pappershandel

## Vad version 3 gör
- **Scanner:** hämtar senaste tokenprofiler och tillgängliga Solana-tokenpar från DexScreener.
- **Analyst:** ger varje token en transparent regelbaserad poäng 0–100 baserat på likviditet, volym och prisrörelse.
- **Risk Manager:** kontrollerar minsta likviditet/volym, poänggräns, maxpositioner, stop-loss, trailing exit, daglig förlustgräns och paus efter tre förlustaffärer.
- **Executor:** öppnar och stänger endast simulerade papperspositioner.

## Testinställningar
Startsaldo $150; positionsstorlek 8% av saldo (max $50); max 5 positioner; minsta likviditet $40 000 som standard; minsta volym $5 000; Analyst-poäng minst 70; stop-loss −6%; trailing exit −12% från topp; max daglig förlust 5%; paus efter 3 förlustaffärer. Simulerade avslut räknar med uppskattad avgift på 1%.

## Starta
1. Öppna GitHub Pages-sidan för repot.
2. Uppdatera sidan.
3. Tryck **Skanna nu** för en engångsskanning eller **Starta bevakning** för återkommande skanning.
4. Låt sidan vara öppen under testet.

## Viktiga begränsningar och säkerhet
- Detta är pappershandel. Ingen riktig handel, Phantom-anslutning, wallet-signering eller privat nyckel används.
- De fyra stegen är regelbaserade delar av samma webbläsarapp, inte separata AI-agenter.
- DexScreener-profiler är inte en komplett lista över alla nyskapade tokens. API-fel, begränsningar och fördröjda/ofullständiga priser kan förekomma.
- Tokenägarfördelning, mint authority, freeze authority, honeypot-risk och likviditetslås verifieras inte. Dessa egenskaper ska betraktas som okända, inte godkända.
- GitHub Pages är statiskt webbhotell. Appen kör bara när sidan är öppen och sparar inte automatiskt positioner mellan omladdningar.
- Analyst-poängen är en enkel heuristik, inte en tränad AI och inte investeringsråd. Kryptotillgångar kan förlora hela sitt värde; vinst garanteras inte.

Riktiga köp ska inte aktiveras genom att lägga in privata nycklar i frontend eller GitHub. En framtida liveversion kräver separat backend, säkra nycklar, robust tokenkontroll, tester och ett uttryckligt separat godkännande.
