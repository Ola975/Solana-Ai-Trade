(() => {
  const START_BALANCE = 1000;
  const FEE_RATE = 0.002;
  const POSITION_FRACTION = 0.05;
  const STOP_LOSS = 0.03;
  const MAX_TRADES_SHOWN = 12;

  let balance = START_BALANCE;
  let realizedPnl = 0;
  let position = null;
  let price = 150;
  let initialPrice = 150;
  let ticks = 0;
  let timer = null;
  let running = false;
  let trades = [];
  let wins = 0;
  let closedTrades = 0;
  let priceHistory = Array.from({length: 34}, (_, i) => 150 + Math.sin(i / 3) * 1.1 + (Math.random() - .5) * .9);
  price = priceHistory[priceHistory.length - 1];
  initialPrice = price;

  const $ = id => document.getElementById(id);
  const money = n => '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const pct = n => (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  const now = () => new Date().toLocaleTimeString('sv-SE', {hour:'2-digit', minute:'2-digit', second:'2-digit'});

  function render() {
    const unrealized = position ? (price - position.entry) * position.qty : 0;
    const equity = balance + (position ? position.qty * price : 0);
    const totalPnl = realizedPnl + unrealized;
    $('balance').textContent = money(equity);
    $('returnValue').textContent = (totalPnl >= 0 ? '+' : '−') + money(Math.abs(totalPnl));
    $('returnValue').className = 'stat-value ' + (totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : '');
    $('returnPct').textContent = pct((totalPnl / START_BALANCE) * 100) + ' av startkapital';
    $('returnPct').className = 'stat-foot ' + (totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : '');
    $('winRate').textContent = closedTrades ? Math.round(wins / closedTrades * 100) + '%' : '0%';
    $('tradeCount').textContent = closedTrades + ' avslutade affärer';
    $('positionValue').textContent = position ? money(position.qty * price) : 'Ingen';
    $('positionHint').textContent = position ? position.qty.toFixed(4) + ' SOL · entry ' + money(position.entry) : 'Ingen position just nu';
    $('marketPrice').textContent = money(price);
    const move = ((price - initialPrice) / initialPrice) * 100;
    $('priceChange').textContent = pct(move);
    $('priceChange').className = move < 0 ? 'negative' : 'positive';
    $('marketTicks').textContent = ticks + ' uppdateringar';
    $('botStatus').classList.toggle('running', running);
    $('botStatus').innerHTML = '<span class="status-dot"></span> ' + (running ? 'Kör' : 'Stoppad');
    $('startBot').disabled = running;
    $('stopBot').disabled = !running;
    drawChart();
    renderTrades();
  }

  function drawChart() {
    const w = 340, h = 132, pad = 5;
    const min = Math.min(...priceHistory), max = Math.max(...priceHistory);
    const span = Math.max(max - min, 0.01);
    const points = priceHistory.map((p, i) => {
      const x = pad + (i / (priceHistory.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p - min) / span) * (h - pad * 2);
      return [x, y];
    });
    const line = points.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L ${points[points.length - 1][0]} ${h} L ${points[0][0]} ${h} Z`;
    $('chartLine').setAttribute('d', line);
    $('chartArea').setAttribute('d', area);
  }

  function renderTrades() {
    const host = $('tradeList');
    if (!trades.length) {
      host.innerHTML = '<div class="empty-state"><div class="empty-icon">⌁</div><strong>Inga affärer ännu</strong><p>Starta boten för att se simulerade köp och sälj här.</p></div>';
      return;
    }
    host.innerHTML = trades.slice(0, MAX_TRADES_SHOWN).map(t => `
      <div class="trade-item">
        <div class="trade-symbol ${t.type === 'SÄLJ' ? 'sell' : ''}">${t.type === 'KÖP' ? '↗' : '↘'}</div>
        <div class="trade-main"><strong>${t.type} SOL</strong><span>${t.time} · ${t.qty.toFixed(4)} SOL @ ${money(t.price)}</span></div>
        <div class="trade-amount"><strong class="${(t.pnl || 0) >= 0 ? 'positive' : 'negative'}">${t.type === 'SÄLJ' ? ((t.pnl || 0) >= 0 ? '+' : '−') + money(Math.abs(t.pnl || 0)) : money(t.cost)}</strong><span>${t.type === 'KÖP' ? 'Simulerat köp' : 'Realiserat P/L'}</span></div>
      </div>`).join('');
  }

  function addTrade(trade) {
    trades.unshift({...trade, time: now()});
    if (trades.length > 100) trades.length = 100;
  }

  function buy() {
    if (position || balance < 10) return;
    const budget = balance * POSITION_FRACTION;
    const fee = budget * FEE_RATE;
    const spend = Math.min(budget, balance);
    const qty = (spend - fee) / price;
    balance -= spend;
    position = {entry: price, qty, cost: spend, openedAt: ticks};
    addTrade({type:'KÖP', price, qty, cost:spend, pnl:0});
    $('botMessage').textContent = 'Simulerat köp genomfört vid ' + money(price) + '.';
  }

  function sell(reason) {
    if (!position) return;
    const gross = position.qty * price;
    const fee = gross * FEE_RATE;
    const proceeds = gross - fee;
    const pnl = proceeds - position.cost;
    balance += proceeds;
    realizedPnl += pnl;
    closedTrades++;
    if (pnl > 0) wins++;
    addTrade({type:'SÄLJ', price, qty:position.qty, pnl, cost:0});
    position = null;
    $('botMessage').textContent = 'Simulerad försäljning (' + reason + '). Resultat: ' + (pnl >= 0 ? '+' : '−') + money(Math.abs(pnl)) + '.';
  }

  function tick() {
    ticks++;
    // Syntetisk random walk: pedagogisk demo, inte verkliga marknadsdata.
    const drift = (Math.random() - 0.49) * 0.012;
    price = Math.max(10, price * (1 + drift));
    priceHistory.push(price);
    if (priceHistory.length > 45) priceHistory.shift();

    if (position) {
      const pnlPct = (price - position.entry) / position.entry;
      if (pnlPct <= -STOP_LOSS) {
        sell('demo stop-loss');
      } else if (pnlPct >= 0.025) {
        sell('demo vinstmål');
      } else if (ticks - position.openedAt >= 8) {
        sell('demo tidsgräns');
      }
    } else if (running && ticks % 4 === 0 && Math.random() > 0.22) {
      buy();
    }
    render();
  }

  function start() {
    if (running) return;
    running = true;
    $('botMessage').textContent = 'Boten kör. Pris och affärer är helt simulerade.';
    timer = window.setInterval(tick, 1800);
    render();
  }

  function stop() {
    running = false;
    if (timer) window.clearInterval(timer);
    timer = null;
    $('botMessage').textContent = position
      ? 'Stoppad: inga nya affärer öppnas. Den simulerade positionen är fortfarande öppen; återställ demo om du vill börja om.'
      : 'Boten är stoppad. Inga nya simulerade affärer öppnas.';
    render();
  }

  function reset() {
    stop();
    balance = START_BALANCE;
    realizedPnl = 0;
    position = null;
    price = 150;
    initialPrice = 150;
    ticks = 0;
    trades = [];
    wins = 0;
    closedTrades = 0;
    priceHistory = Array.from({length: 34}, (_, i) => 150 + Math.sin(i / 3) * 1.1 + (Math.random() - .5) * .9);
    price = priceHistory[priceHistory.length - 1];
    initialPrice = price;
    $('botMessage').textContent = 'Demot är återställd till $1,000 simulerat startkapital.';
    render();
  }

  $('startBot').addEventListener('click', start);
  $('stopBot').addEventListener('click', stop);
  $('resetBot').addEventListener('click', () => {
    if (confirm('Återställa saldo, positioner och affärshistorik i demon?')) reset();
  });

  $('connectWallet').addEventListener('click', async () => {
    const provider = window.phantom?.solana;
    if (!provider?.isPhantom) {
      $('walletNotice').textContent = 'Phantom hittades inte i den här webbläsaren. Öppna sidan i en webbläsare med Phantom-stöd eller använd Phantom-appens inbyggda webbläsare. Testläget fungerar ändå utan anslutning.';
      return;
    }
    try {
      const result = await provider.connect();
      const address = result.publicKey.toString();
      $('walletState').textContent = address.slice(0, 4) + '…' + address.slice(-4);
      $('walletHint').textContent = 'Endast publik adress ansluten';
      $('walletNotice').textContent = 'Phantom ansluten. Den här testversionen läser inte saldo från kedjan och skickar inga transaktioner.';
      $('connectWallet').textContent = 'Ansluten';
      $('connectWallet').disabled = true;
    } catch (err) {
      $('walletNotice').textContent = err?.message || 'Anslutningen avbröts. Du kan fortfarande testa simuleringen.';
    }
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  render();
})();