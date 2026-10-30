(() => {
'use strict';
const $ = id => document.getElementById(id);
const PROFILE_API='https://api.dexscreener.com/token-profiles/latest/v1';
const TOKEN_API='https://api.dexscreener.com/latest/dex/tokens/';
const START_BALANCE=150,MAX_POSITIONS=5,MAX_TRADE_USD=50;
const STOP_LOSS=.06,TRAIL_FROM_PEAK=.12,MAX_DAILY_LOSS=.05,FEE_RATE=.01;
const MIN_VOLUME=5000,MIN_LIQUIDITY=25000,MIN_SCORE=68,SCAN_MS=30000,STATE_KEY='solana-ai-trader-v5';
let running=false,timer=null,balance=START_BALANCE,realized=0,buyCount=0,sellCount=0,positions=[],tokens=[],seen=new Set(),logs=[],busy=false,consecutiveLosses=0;
let dayKey=new Date().toLocaleDateString('en-CA'),dayStartEquity=START_BALANCE,dailyPaused=false;
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s){$('message').textContent=s}
function agent(id,s){const el=$('agent'+id);if(el)el.textContent=s}
function log(a,b='',cls=''){logs.unshift({a,b,cls,t:new Date().toLocaleTimeString()});logs=logs.slice(0,60);$('log').innerHTML=logs.map(x=>'<div class="logrow"><span class="'+x.cls+'">'+esc(x.a)+'</span><small class="sub">'+esc(x.b)+' · '+x.t+'</small></div>').join('')}
function currentEquity(){return balance+positions.reduce((sum,p)=>{const t=tokens.find(x=>x.address===p.address);return sum+p.size*((t?.price||p.lastPrice||p.entry)/p.entry)},0)}
function saveState(){try{localStorage.setItem(STATE_KEY,JSON.stringify({balance,realized,positions,seen:[...seen].slice(-500),logs:logs.slice(0,60),buyCount,sellCount,consecutiveLosses,dayKey,dayStartEquity,dailyPaused}))}catch(e){log('Lagring','Kunde inte spara lokalt: '+e.message,'negative')}}
function loadState(){try{const x=JSON.parse(localStorage.getItem(STATE_KEY)||'null');if(!x)return;if(Number.isFinite(x.balance))balance=x.balance;if(Number.isFinite(x.realized))realized=x.realized;if(Array.isArray(x.positions))positions=x.positions.filter(p=>p&&p.address&&Number.isFinite(p.entry)&&p.entry>0&&Number.isFinite(p.size));if(Array.isArray(x.seen))seen=new Set(x.seen);if(Array.isArray(x.logs))logs=x.logs.slice(0,60);buyCount=Number.isFinite(x.buyCount)?x.buyCount:logs.filter(z=>String(z.a).startsWith('Paper-köp ')).length;sellCount=Number.isFinite(x.sellCount)?x.sellCount:logs.filter(z=>String(z.a).startsWith('Paper-sälj ')).length;if(Number.isFinite(x.consecutiveLosses))consecutiveLosses=x.consecutiveLosses;if(x.dayKey===dayKey&&Number.isFinite(x.dayStartEquity)){dayStartEquity=x.dayStartEquity;dailyPaused=!!x.dailyPaused}}catch(e){console.warn('Kunde inte läsa sparat demotillstånd',e)}}
function rollDay(){const d=new Date().toLocaleDateString('en-CA');if(d!==dayKey){dayKey=d;dayStartEquity=currentEquity();dailyPaused=false;consecutiveLosses=0;log('Ny handelsdag','Riskräknare återställd')}}
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('API '+r.status);return r.json()}
function analyse(t){
 const liq=Math.min(25,t.liquidity/60000*25);
 const vol=Math.min(20,(t.volume/Math.max(t.liquidity,1))*100);
 const activity=Math.min(10,t.volume/30000*10);
 const m5=t.change5m??0,m1=t.change1h??0,m6=t.change6h??0,m24=t.change24h??0;
 const trend=Math.max(0,Math.min(20,10+m1*.12+m6*.025+(m24>0&&m24<250?3:0)));
 const buyRatio=t.buys/(t.buys+t.sells||1);
 const flow=Math.max(0,Math.min(15,(buyRatio-.4)*35));
 // Hype is a market-activity proxy from DexScreener, not social-media sentiment.
 const acceleration=Math.max(0,Math.min(15,(t.volume5m/Math.max(t.volume1h/12,1)-.5)*10));
 const hype=Math.round(Math.min(100,Math.max(0,acceleration*4+Math.max(0,m5)*.8+Math.max(0,m1)*.18+buyRatio*20)));
 t.hype=hype;t.score=Math.round(liq+vol+activity+trend+flow+acceleration);
 t.signal=m5>55||m1>180?'Överhettad':hype>=65&&buyRatio>=.56?'Hype ökar':hype>=40?'Växande aktivitet':buyRatio<.42?'Säljtryck':'Avvaktar';
 return t;
}
function riskCheck(t){
 if(dailyPaused||currentEquity()<=dayStartEquity*(1-MAX_DAILY_LOSS))return 'Daglig förlustgräns aktiv';
 if(consecutiveLosses>=3)return 'Paus efter tre förluster';
 if(positions.length>=MAX_POSITIONS)return 'Max antal positioner';
 if(positions.some(p=>p.address===t.address))return 'Position finns redan';
 if(!t.price||!Number.isFinite(t.price))return 'Ogiltigt pris';
 if(t.liquidity<MIN_LIQUIDITY||t.volume<MIN_VOLUME)return 'För låg likviditet eller volym';
 if(t.score<MIN_SCORE)return 'För låg totalpoäng';
 if(t.hype<35)return 'För svag marknadsaktivitet';
 if(t.change5m>55||t.change1h>180)return 'För brant uppgång – invänta lugnare ingång';
 if(t.buys+t.sells<8)return 'För få transaktioner för bedömning';
 if(balance<5)return 'För litet saldo';
 return '';
}
function buy(t,automatic=false){
 const why=riskCheck(t);if(why){if(!automatic)message('Riskkontrollen stoppade köpet: '+why);return false}
 const size=Math.min(balance*.08,MAX_TRADE_USD,balance);if(size<1)return false;
 balance-=size;buyCount++;positions.push({address:t.address,symbol:t.symbol,entry:t.price,lastPrice:t.price,size,peak:t.price,opened:Date.now()});
 log('Paper-köp '+t.symbol,money(size)+' · totalpoäng '+t.score+' · hype '+t.hype+'/100');
 render();return true;
}
function sell(address,reason='Manuell försäljning'){
 const i=positions.findIndex(p=>p.address===address);if(i<0)return;
 const p=positions[i],t=tokens.find(x=>x.address===address),price=t?.price||p.lastPrice||p.entry;
 const gross=p.size*(price/p.entry),proceeds=Math.max(0,gross-gross*FEE_RATE),pnl=proceeds-p.size;
 balance+=proceeds;realized+=pnl;sellCount++;positions.splice(i,1);consecutiveLosses=pnl<0?consecutiveLosses+1:0;
 log('Paper-sälj '+p.symbol,reason+' · netto '+money(pnl),pnl>=0?'positive':'negative');
 if(consecutiveLosses>=3||currentEquity()<=dayStartEquity*(1-MAX_DAILY_LOSS)){dailyPaused=true;log('Risk Manager · paus','Förlustgräns uppnådd','negative')}
 render();
}
function managePositions(){for(const p of [...positions]){const t=tokens.find(x=>x.address===p.address);if(!t?.price)continue;p.lastPrice=t.price;p.peak=Math.max(p.peak,t.price);const ret=t.price/p.entry-1,peakRet=t.price/p.peak-1;
 if(ret<=-STOP_LOSS)sell(p.address,'Stop-loss −6%');else if(peakRet<=-TRAIL_FROM_PEAK&&p.peak>p.entry)sell(p.address,'Trailing exit −12% från topp');else if(t.signal==='Säljtryck'&&ret>0&&peakRet<-.06)sell(p.address,'Momentum och köptryck försvagades');
}}
function autoTrade(){rollDay();if(currentEquity()<=dayStartEquity*(1-MAX_DAILY_LOSS)){dailyPaused=true;log('Risk Manager · paus','Daglig förlustgräns baserad på eget kapital','negative');return}if(dailyPaused)return;for(const t of tokens.sort((a,b)=>(b.score+b.hype*.25)-(a.score+a.hype*.25))){if(positions.length>=MAX_POSITIONS)break;buy(t,true)}}
function render(){
 saveState();$('balance').textContent=money(balance);$('pnl').textContent=money(realized);$('pnl').className=realized>=0?'positive':'negative';$('count').textContent=positions.length;$('n').textContent=tokens.length;if($('buyCount'))$('buyCount').textContent=buyCount;if($('sellCount'))$('sellCount').textContent=sellCount;
 $('tokens').innerHTML=tokens.length?tokens.slice(0,50).map(t=>'<tr><td><b>'+esc(t.symbol)+'</b><span class="sub">'+esc(t.name)+' · '+esc(t.address.slice(0,5)+'…'+t.address.slice(-5))+'</span></td><td>'+money(t.price)+'</td><td>'+money(t.liquidity)+'</td><td>'+money(t.volume)+'</td><td class="'+(t.change24h>=0?'positive':'negative')+'">'+(t.change24h==null?'—':t.change24h.toFixed(1)+'%')+'</td><td>'+t.score+'/100</td><td>'+t.hype+'/100 · '+esc(t.signal)+'</td><td>'+(positions.some(p=>p.address===t.address)?'Öppen':'<button class="tablebtn" data-buy="'+esc(t.address)+'">Paper köp</button>')+'</td></tr>').join(''):'<tr><td colspan="8">Inga tokens hittades ännu.</td></tr>';
 $('positions').innerHTML=positions.length?positions.map(p=>{const t=tokens.find(x=>x.address===p.address),price=t?.price||p.lastPrice||p.entry,pnl=p.size*(price/p.entry-1);return '<tr><td>'+esc(p.symbol)+'</td><td>'+money(p.entry)+'</td><td>'+money(price)+'</td><td class="'+(pnl>=0?'positive':'negative')+'">'+money(pnl)+'</td><td><button class="tablebtn secondary" data-sell="'+esc(p.address)+'">Sälj</button></td></tr>'}).join(''):'<tr><td colspan="5">Inga öppna positioner.</td></tr>';
}
async function scan(){
 if(busy)return;busy=true;$('scan').disabled=true;
 try{
  rollDay();agent('Scanner','Hämtar senaste tokenprofiler');agent('Analyst','Analyserar hype, momentum och flöde');agent('Risk','Kontrollerar risk');message('Skannar Solana-tokenprofiler och marknadsaktivitet…');
  const data=await get(PROFILE_API),profiles=(Array.isArray(data)?data:[]).filter(x=>x.chainId==='solana'&&x.tokenAddress),unique=[...new Map(profiles.map(x=>[x.tokenAddress,x])).values()].slice(0,30);
  // Begränsa samtidiga anrop för att minska risken för API-begränsning.
  const queue=[...unique],out=[];
  async function worker(){while(queue.length){const p=queue.shift();try{out.push({status:'fulfilled',value:await (async()=>{
   const d=await get(TOKEN_API+encodeURIComponent(p.tokenAddress)),pairs=(d.pairs||[]).filter(x=>x.chainId==='solana'&&x.baseToken?.address===p.tokenAddress).sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0)),q=pairs[0];if(!q)return null;
   const tx=q.txns||{},h1=tx.h1||{},h24=tx.h24||{},v=q.volume||{},pc=q.priceChange||{};
   return analyse({address:p.tokenAddress,name:q.baseToken?.name||'Unknown',symbol:q.baseToken?.symbol||'TOKEN',price:Number(q.priceUsd)||0,liquidity:Number(q.liquidity?.usd)||0,volume:Number(v.h24)||0,volume5m:Number(v.m5)||0,volume1h:Number(v.h1)||0,change5m:pc.m5==null?0:Number(pc.m5),change1h:pc.h1==null?0:Number(pc.h1),change6h:pc.h6==null?0:Number(pc.h6),change24h:pc.h24==null?null:Number(pc.h24),buys:Number(h1.buys)||0,sells:Number(h1.sells)||0});
  })()})}catch(e){out.push({status:'rejected',reason:e})}}}
  await Promise.all(Array.from({length:Math.min(5,queue.length)},()=>worker()));
  tokens=out.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value).sort((a,b)=>(b.score+b.hype*.25)-(a.score+a.hype*.25));
  for(const t of tokens)if(!seen.has(t.address)){seen.add(t.address);log('Hittade '+t.symbol,t.signal+' · hype '+t.hype+'/100 · score '+t.score)}
  const eligible=tokens.filter(t=>!riskCheck({...t,address:'candidate'})).length;
  agent('Scanner','Analyserade '+tokens.length+' tokenpar');agent('Analyst',eligible+' kandidater klarar nuvarande filter');managePositions();if(running)autoTrade();agent('Risk',dailyPaused?'Pausad av riskregler':'Riskkontroll aktiv');agent('Executor','Paper trading · '+positions.length+' öppna positioner');
  message('Klart: '+tokens.length+' tokenpar · '+eligible+' möjliga kandidater. Hype mäts via marknadsdata, inte sociala medier. Säkerhetsdata om ägare och authorities är ännu inte verifierad.');render();
 }catch(e){message('Datafel: '+e.message+'. API kan vara begränsat eller nere.');log('Skanningsfel',e.message,'negative');agent('Scanner','Fel vid datahämtning')}
 finally{busy=false;$('scan').disabled=false}
}
$('start').onclick=()=>{if(running)return;running=true;$('status').textContent='Bevakar';$('start').disabled=true;$('stop').disabled=false;scan();timer=setInterval(scan,SCAN_MS)};
$('stop').onclick=()=>{running=false;clearInterval(timer);timer=null;$('status').textContent='Stoppad';$('start').disabled=false;$('stop').disabled=true;message('Bevakningen stoppad. Papperspositionerna ligger kvar.')};
$('scan').onclick=scan;
$('reset').onclick=()=>{running=false;clearInterval(timer);timer=null;balance=START_BALANCE;realized=0;buyCount=0;sellCount=0;positions=[];tokens=[];seen.clear();logs=[];consecutiveLosses=0;dailyPaused=false;dayStartEquity=START_BALANCE;$('status').textContent='Inte startad';$('start').disabled=false;$('stop').disabled=true;agent('Scanner','Väntar på skanning');agent('Analyst','Väntar på kandidater');agent('Risk','Riskkontroll aktiv');agent('Executor','Endast pappersorder');log('Demo återställd','Saldo '+money(START_BALANCE));render();message('Demot återställt.')};
$('tokens').onclick=e=>{const b=e.target.closest('[data-buy]');if(b)buy(tokens.find(t=>t.address===b.dataset.buy))};
$('positions').onclick=e=>{const b=e.target.closest('[data-sell]');if(b)sell(b.dataset.sell)};
loadState();render();log('System redo','V5 · lokalt sparande · endast pappershandel');
})();