# Solana AI Trader — mobil demo

En mobilanpassad webbapp på svenska för **simulerad handel**. Inga riktiga köp, sälj eller blockchain-transaktioner utförs.

## Funktioner
- Starta/stoppa simuleringsmotorn
- Simulerat saldo, P/L, vinstprocent och öppen position
- Syntetisk SOL/USD-prisgraf
- Simulerad köp-/säljhändelselogg
- Valfri anslutningsknapp för att upptäcka Phantom och läsa publik plånboksadress
- PWA-manifest och enkel offline-cache

## Kör lokalt
Öppna `index.html` i en modern webbläsare. Phantom-anslutning och service worker fungerar bäst när appen serveras via HTTPS eller localhost.

Om du har Python installerat kan du köra en lokal server från projektmappen:

```bash
python -m http.server 8000
```

Öppna sedan `http://localhost:8000` i webbläsaren.

## Testa på mobilen
Publicera mappen på en statisk webbhost som stöder HTTPS (t.ex. GitHub Pages eller annan statisk hosting), öppna URL:en på mobilen och välj “Lägg till på hemskärmen” i webbläsarens meny. Phantom-stöd beror på webbläsare och plattform; använd vid behov Phantom-appens inbyggda webbläsare.

## Viktiga begränsningar
- Prisdata skapas slumpmässigt lokalt; det är inte live-data och strategin har ingen verklig edge.
- Phantom-anslutningen är valfri och hämtar inte saldo från kedjan.
- Inga riktiga transaktioner signeras eller skickas.
- “Stoppa” öppnar inga fler simulerade affärer men stänger inte en öppen demo-position automatiskt.
- Detta är en prototyp för UI- och flödestest, inte finansiell rådgivning och inte en produktionsklar handelsbot.

## Säkerhet inför eventuell liveversion
Lägg aldrig seed phrase eller privata nycklar i frontend, källkod, formulär eller chatt. Livehandel kräver separat granskning av signeringsmodell, handelsprogram, API:er, transaktionssimulering, slippage-skydd, tokenrisk och riskgränser.
