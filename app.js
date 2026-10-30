(() => {
'use strict';
const $ = id => document.getElementById(id);
const PROFILE_API = 'https://api.dexscreener.com/token-profiles/latest/v1';
const TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens/';
const START_BALANCE = 150, MAX_POSITIONS = 5, MAX_TRADE_USD = 50;
const STOP_LOSS = 0.06, TRAIL_FROM_PEAK = 0.12, MAX_DAILY_LOSS = 0.05;
const FEE_RATE = 0.01, MIN_VOLUME = 5000, MIN_LIQUIDITY = 25000, MIN_SCORE = 70, SCAN_MS = 30000;
let running=false, timer=null, balance=START_BALANCE, realized=0, positions=[];
let tokens=[], seen=new Set(), logs=[], busy=false, consecutiveLosses=0;
let dayKey=new Date().toLocaleDateString('en-CA'), dayStartEquity=START_BALANCE, dailyPaused=false;

const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s){$('message').textContent=s}
function agent(id,s){const el=$('agent'+id);if(el)el.textContent=s}
function log(a,b='',cls=''){logs.unshift({a,b,cls,t:new Date().toLocaleTimeString()});logs=logs.slice(0,50);$('log').innerHTML=logs.map(x=>'<div class="logrow"><span class="'+x.cls+'">'+esc(x.a)+'</span><small class="sub">'+esc(x.b)+' · '+x.t+'</small></div>').join('')}
function currentEquity(){return balance+positions.reduce((sum,p)=>{const t=tokens.find(x=>x.address===p.address);return sum+p.size*((t?.price||p.entry)/p.entry)},0)}
function rollDay(){const today=new Date().toLocaleDateString('en-CA');if(today!==dayKey){dayKey=today;dayStartEquity=currentEquity();dailyPaused=false;consecutiveLosses=0;log('Ny handelsdag','Daglig riskgräns återställd')}}
function render(){
 $('balance').textContent=money(balance);$('pnl').textContent=money(realized);$('pnl').className=realized>=0?'positive':'negative';
 $('count').textContent=positions.length;$('n').textContent=tokens.length;
 $('tokens').innerHTML=tokens.length?tokens.slice(0,50).map(t=>'<tr><td><b>'+esc(t.symbol)+'</b><span class="sub">'+esc(t.name)+' · '+esc(t.address.slice(0,5)+'…'+t.address.slice(-5))+'</span></td><td>'+money(t.price)+'</td><td>'+money(t.liquidity)+'</td><td>'+money(t.volume)+'</td><td class="'+(t.change>=0?'positive':'negative')+'">'+(t.change==null?'—':t.change.toFixed(2)+'%')+'</td><td>'+t.score+'/100</td><td>'+(positions.some(p=>p.address===t.address)?'Öppen':'<button class="tablebtn" data-buy="'+esc(t.address)+'">Paper köp</button>')+'</td></tr>').join(''):'<tr><td colspan="7">Inga tokens hittades ännu.</td></tr>';
 $('positions').innerHTML=positions.length?positions.map(p=>{const t=tokens.find(x=>x.address===p.address),price=t?.price||p.entry,pnl=p.size*(price/p.entry-1);return '<tr><td>'+esc(p.symbol)+'</td><td>'+money(p.entry)+'</td><td>'+money(price)+'</td><td class="'+(pnl>=0?'positive':'negative')+'">'+money(pnl)+'</td><td><button class="tablebtn secondary" data-sell="'+esc(p.address)+'">Sälj</button></td></tr>'}).join(''):'<tr><td colspan="5">Inga öppna positioner.</td></tr>';
}
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('API '+r.status);return r.json()}
function analyse(t){
 let score=0;
 // Transparent heuristic: liquidity 0-35, volume/liquidity 0-25, momentum 0-25, absolute activity 0-15.
 score+=Math.min(35,t.liquidity/40000*35);
 const ratio=t.volume/Math.max(t.liquidity,1);score+=Math.min(25,ratio*100);
 if(t.change!==null){if(t.change>0&&t.change<=35)score+=Math.max(0,25-Math.abs(t.change-12)*0.65);else if(t.change>35)score+=4;else if(t.change>=-5)score+=8}
 score+=Math.min(15,t.volume/20000*15);
 return Math.max(0,Math.min(100,Math.round(score)));
}
function riskCheck(t,manual=false){
 if(dailyPaused)return 'Daglig förlustgräns har pausat handeln';
 if(realized<=-dayStartEquity*MAX_DAILY_LOSS)return 'Daglig maxförlust 5% uppnådd';
 if(consecutiveLosses>=3)return 'Paus efter tre förlustaffärer';
 if(positions.length>=MAX_POSITIONS)return 'Max antal positioner nått';
 if(positions.some(p=>p.address===t.address))return 'Token har redan en öppen position';
 if(!t.price||!Number.isFinite(t.price))return 'Ogiltigt pris';
 if(t.liquidity<MIN_LIQUIDITY||t.volume<MIN_VOLUME)return 'Likviditet eller volym under gränsen';
 if(t.score<MIN_SCORE)return 'Analyst-poäng under gränsen';
 if(balance<5)return 'För litet saldo';
 return '';
}
function buy(t,automatic=false){
 const why=riskCheck(t);if(why){if(!automatic)message('Risk Manager stoppade köpet: '+why);return false}
 const size=Math.min(balance*0.08,MAX_TRADE_USD,balance);if(size<1)return false;
 balance-=size;positions.push({address:t.address,symbol:t.symbol,entry:t.price,size,peak:t.price,opened:Date.now()});
 log((automatic?'Executor · auto paper-köp ':'Executor · manuellt paper-köp ')+t.symbol,money(size)+' vid '+money(t.price)+' · score '+t.score+'/100');
 agent('Executor','Simulerade köp: '+positions.length+' öppna positioner');render();return true;
}
function sell(address,reason='Manuell försäljning'){
 const i=positions.findIndex(p=>p.address===address);if(i<0)return;
 const p=positions[i],t=tokens.find(x=>x.address===address),price=t?.price||p.entry;
 const gross=p.size*(price/p.entry),fee=gross*FEE_RATE,proceeds=Math.max(0,gross-fee),pnl=proceeds-p.size;
 balance+=proceeds;realized+=pnl;positions.splice(i,1);
 if(pnl<0)consecutiveLosses++;else consecutiveLosses=0;
 log('Executor · paper-sälj '+p.symbol,reason+' · '+money(pnl)+' inkl. uppskattad avgift',pnl>=0?'positive':'negative');
 if(consecutiveLosses>=3){dailyPaused=true;log('Risk Manager · paus','Tre förlustaffärer i rad','negative')}
 if(realized<=-dayStartEquity*MAX_DAILY_LOSS){dailyPaused=true;log('Risk Manager · dagsstopp','Maximal daglig förlust nådd','negative')}
 render();
}
function managePositions(){
 for(const p of [...positions]){
  const t=tokens.find(x=>x.address===p.address);if(!t?.price)continue;
  p.peak=Math.max(p.peak,t.price);
  const fromEntry=(t.price/p.entry)-1,fromPeak=(t.price/p.peak)-1;
  if(fromEntry<=-STOP_LOSS)sell(p.address,'Stop-loss −6%');
  else if(fromPeak<=-TRAIL_FROM_PEAK&&p.peak>p.entry)sell(p.address,'Trailing exit −12% från topp');
 }
}
function autoTrade(){
 rollDay();
 if(realized<=-dayStartEquity*MAX_DAILY_LOSS){dailyPaused=true;agent('Risk','Pausad · daglig förlustgräns');return}
 if(consecutiveLosses>=3){dailyPaused=true;agent('Risk','Pausad · tre förluster i rad');return}
 for(const t of tokens){if(positions.length>=MAX_POSITIONS)break;if(t.score>=MIN_SCORE)buy(t,true)}
}
async function scan(){
 if(busy)return;busy=true;$('scan').disabled=true;
 try{
  rollDay();agent('Scanner','Hämtar senaste tokenprofiler…');agent('Analyst','Väntar på marknadsdata');agent('Risk','Kontrollerar risk före varje order');
  message('Scanner hämtar senaste Solana-tokenprofiler…');
  const data=await get(PROFILE_API),profiles=(Array.isArray(data)?data:[]).filter(x=>x.chainId==='solana'&&x.tokenAddress);
  const unique=[...new Map(profiles.map(x=>[x.tokenAddress,x])).values()].slice(0,30);
  const out=await Promise.allSettled(unique.map(async p=>{
   const d=await get(TOKEN_API+encodeURIComponent(p.tokenAddress));
   const pairs=(d.pairs||[]).filter(x=>x.chainId==='solana'&&x.baseToken?.address===p.tokenAddress).sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0));
   const q=pairs[0];if(!q)return null;
   const t={address:p.tokenAddress,name:q.baseToken?.name||'Unknown',symbol:q.baseToken?.symbol||'TOKEN',price:Number(q.priceUsd)||0,liquidity:Number(q.liquidity?.usd)||0,volume:Number(q.volume?.h24)||0,change:q.priceChange?.h24==null?null:Number(q.priceChange.h24)};
   t.score=analyse(t);return t;
  }));
  tokens=out.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value).sort((a,b)=>b.score-a.score);
  for(const t of tokens)if(!seen.has(t.address)){seen.add(t.address);log('Scanner · upptäckt '+t.symbol,t.name+' · likviditet '+money(t.liquidity)+' · score '+t.score+'/100')}
  agent('Scanner','Hittade '+tokens.length+' Solana-tokenpar');
  agent('Analyst',tokens.filter(t=>t.score>=MIN_SCORE&&t.liquidity>=MIN_LIQUIDITY&&t.volume>=MIN_VOLUME).length+' kandidater klarar poänggränsen');
  managePositions();
  if(running)autoTrade();
  agent('Risk',dailyPaused?'Pausad av riskregler':'Riskkontroll aktiv');
  agent('Executor','Endast simulerade order · '+positions.length+' öppna');
  const qualified=tokens.filter(t=>t.score>=MIN_SCORE&&t.liquidity>=MIN_LIQUIDITY&&t.volume>=MIN_VOLUME).length;\n  message('Skanningen klar: '+tokens.length+' tokenpar analyserade · '+qualified+' klarar köpkraven. Autopiloten avvaktar om ingen kandidat klarar riskkontrollen.');
  render();
 }catch(e){message('Kunde inte hämta data: '+e.message+'. API kan vara begränsat eller tillfälligt nere.');log('Skanningsfel',e.message,'negative');agent('Scanner','Fel vid datahämtning')}
 finally{busy=false;$('scan').disabled=false}
}
$('start').onclick=()=>{if(running)return;running=true;$('status').textContent='Bevakar';$('start').disabled=true;$('stop').disabled=false;scan();timer=setInterval(scan,SCAN_MS)};
$('stop').onclick=()=>{running=false;clearInterval(timer);timer=null;$('status').textContent='Stoppad';$('start').disabled=false;$('stop').disabled=true;message('Bevakningen stoppad. Papperspositionerna ligger kvar.')};
$('scan').onclick=scan;
$('tempo').onchange=()=>{if(running){clearInterval(timer);timer=setInterval(scan,Number($('tempo').value))}};
$('reset').onclick=()=>{running=false;clearInterval(timer);timer=null;balance=START_BALANCE;realized=0;positions=[];tokens=[];seen.clear();logs=[];consecutiveLosses=0;dailyPaused=false;dayStartEquity=START_BALANCE;$('status').textContent='Inte startad';$('start').disabled=false;$('stop').disabled=true;agent('Scanner','Väntar på skanning');agent('Analyst','Väntar på kandidater');agent('Risk','Kontrollerar risk före köp');agent('Executor','Endast pappersorder');log('Demo återställd','Startsaldo '+money(START_BALANCE));render();message('Demot är återställt.')};
$('tokens').onclick=e=>{const b=e.target.closest('[data-buy]');if(b)buy(tokens.find(t=>t.address===b.dataset.buy))};
$('positions').onclick=e=>{const b=e.target.closest('[data-sell]');if(b)sell(b.dataset.sell)};
render();log('System redo','Fyra regelbaserade steg · endast pappershandel');
})();