# Solana AI Trader V2 — pappershandel
1. Packa upp ZIP-filen.
2. Ladda upp ALLA filer till GitHub-repots rot; `index.html` ska synas direkt under Code.
3. Settings → Pages: Branch `main`, folder `/(root)`.
4. Öppna Pages-länken och uppdatera sidan.

Appen hämtar senaste tokenprofiler via DexScreener och försöker hitta Solana-handelspar. Den simulerar affärer, med max 5 positioner, max $50 per affär, stop-loss -10%, take-profit +20%, och max dagsförlust -$50. Simulerade säljaffärer räknar med uppskattad 1% kostnad.

BEGRÄNSNINGAR: Ingen riktig handel eller wallet-signering. Tokenprofiler är inte en fullständig lista över alla nyskapade tokens. Appen bevakar bara medan webbsidan är öppen; GitHub Pages kör ingen bakgrundsserver. API kan rate-limita eller blockeras. Momentumregeln är en enkel demonstration, inte tränad AI. Vinst garanteras inte.