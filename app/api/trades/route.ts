import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1118939070';
 const headers={'Accept':'application/json','User-Agent':'Mozilla/5.0'};
 const diagnostics:string[]=[];
 try{
  const params=new URL(request.url).searchParams; const week=params.get('week');
  if(params.get('rosters')==='1'){const rr=await fetch(base+'?view=mRoster&view=mTeam&scoringPeriodId='+encodeURIComponent(week||'1'),{cache:'no-store',headers});const j=await rr.json();return NextResponse.json({week,teams:(j.teams||[]).map((t:any)=>({id:t.id,name:t.name||t.location+' '+t.nickname,players:(t.roster?.entries||[]).map((e:any)=>({id:e.playerId,name:e.playerPoolEntry?.player?.fullName}))}))});}

  if(!week&&!params.has('raw')&&!params.has('rosters')){
   const get=async(url:string,extra:Record<string,string>={})=>{const r=await fetch(url,{cache:'no-store',headers:{...headers,...extra}});if(!r.ok)throw Error('ESPN HTTP '+r.status);return r.json()};
   const league=await get(base+'?view=mTeam&view=mStatus');
   const current=Number(league.status?.currentMatchupPeriod||11);
   const snapshots=await Promise.all(Array.from({length:Math.min(current,18)},(_,i)=>get(base+'?view=mRoster&scoringPeriodId='+(i+1)).catch(()=>null)));
   const players=new Map<string,number>();
   const points=new Map<string,number>();
   const knownWeeks=new Set<string>();
   snapshots.forEach((j,idx)=>{for(const t of j?.teams||[])for(const e of t.roster?.entries||[]){const p=e.playerPoolEntry?.player;if(!p)continue;players.set(p.fullName,Number(e.playerId));if(Array.isArray(p.stats)&&p.stats.some((st:any)=>st.statSourceId===0&&st.statSplitTypeId===1))knownWeeks.add(e.playerId+':'+(idx+1));for(const st of p.stats||[])if(st.statSourceId===0&&st.statSplitTypeId===1&&Number.isFinite(st.appliedTotal))points.set(e.playerId+':'+st.scoringPeriodId,st.appliedTotal)}});
   const seeds:any[]=[[1,2,11,["Rome Odunze","Travis Etienne Jr."],["CeeDee Lamb","Jordan Mason"]],[1,3,10,["Josh Allen","Chris Olave"],["Drake London","Caleb Williams"]],[6,5,10,["Harold Fannin Jr.","Chase Brown","Michael Wilson"],["Colston Loveland","Omarion Hampton","Garrett Wilson"]],[6,7,11,["Davante Adams"],["Chuba Hubbard"]],[7,2,3,["Breece Hall","Ladd McConkey"],["Zay Flowers","Roschon Johnson"]],[8,7,12,["Rhamondre Stevenson"],["Stefon Diggs"]],[10,4,9,["Mike Evans"],["Audric Estime","Jeremiyah Love"]],[11,5,3,["Jonathan Taylor"],["Kyren Williams"]]];
   const trades=seeds.map(([start,a,b,left,right],idx)=>({id:'confirmed-'+idx,status:'Confirmed',date:null,scoringPeriodId:start,teams:[a,b],items:[...left.map((name:string)=>({playerName:name,playerId:players.get(name)||null,fromTeamId:b,toTeamId:a})),...right.map((name:string)=>({playerName:name,playerId:players.get(name)||null,fromTeamId:a,toTeamId:b}))]}));
   const ids=trades.flatMap(t=>t.items.map(i=>i.playerId)).filter(Boolean);
   const filter=JSON.stringify({players:{filterIds:{value:ids},limit:100}});
   try{const j=await get(base+'?view=kona_player_info',{'x-fantasy-filter':filter});for(const e of j.players||[]){const p=e.player||e;for(const st of p.stats||[])if(st.statSourceId===0&&st.statSplitTypeId===1&&Number.isFinite(st.appliedTotal))points.set(p.id+':'+st.scoringPeriodId,st.appliedTotal)}}catch{}
   const scored=trades.map(t=>({...t,weekly:Array.from({length:Math.max(0,current-t.scoringPeriodId)},(_,i)=>{const week=t.scoringPeriodId+i;const totals=t.teams.map(team=>{const vals=t.items.filter(x=>x.toTeamId===team).map(x=>(points.get(x.playerId+':'+week)??(knownWeeks.has(x.playerId+':'+week)?0:undefined)));return vals.every(v=>v!==undefined)?vals.reduce<number>((a,b)=>a+(b||0),0):null});return {week,totals}})}));
   return NextResponse.json({trades:scored,notice:'Eight confirmed historical trades. Automatic discovery of new trades is not yet verified; refresh retrieves current ESPN scoring data.',diagnostics:[],refreshedAt:new Date().toISOString()});
  }
  const r=await fetch(base+'/transactions?view=mTransactions2'+(week?'&scoringPeriodId='+encodeURIComponent(week):''),{cache:'no-store',headers});
  if(!r.ok)return NextResponse.json({trades:[],notice:'ESPN transactions request returned HTTP '+r.status,diagnostics});
  const payload=await r.json();
  const all:any[]=Array.isArray(payload)?payload:Array.isArray(payload.transactions)?payload.transactions:[];
  diagnostics.push('Requested week '+(week||'default')+'; ESPN returned '+all.length+' transactions.');
  const count=(key:string)=>Object.entries(all.reduce((acc:Record<string,number>,t:any)=>{const k=String(t[key]??'(missing)');acc[k]=(acc[k]||0)+1;return acc},{})).sort((a:any,b:any)=>b[1]-a[1]).slice(0,25);
  diagnostics.push('Transaction types: '+JSON.stringify(count('type')));
  diagnostics.push('Transaction statuses: '+JSON.stringify(count('status')));
  const likely=all.filter((t:any)=>String(t.type||'').toUpperCase().includes('TRADE')||Array.isArray(t.items)&&t.items.some((i:any)=>String(i.type||'').toUpperCase().includes('TRADE')));
  diagnostics.push('Trade-related transactions: '+likely.length);
  diagnostics.push('Trade-related type/status breakdown: '+JSON.stringify(likely.reduce((acc:Record<string,number>,t:any)=>{const k=String(t.type)+' / '+String(t.status);acc[k]=(acc[k]||0)+1;return acc},{})));
  diagnostics.push('Trade sample structure (IDs, no personal data): '+JSON.stringify(likely.slice(0,5).map((t:any)=>({type:t.type,status:t.status,id:t.id,relatedTransactionId:t.relatedTransactionId,scoringPeriodId:t.scoringPeriodId,itemCount:t.items?.length,items:(t.items||[]).slice(0,4).map((i:any)=>({type:i.type,playerId:i.playerId,fromTeamId:i.fromTeamId,toTeamId:i.toTeamId}))}))).slice(0,5000));
  if(params.get('raw')==='1')return NextResponse.json({week,records:likely.map(t=>({id:t.id,relatedTransactionId:t.relatedTransactionId,type:t.type,status:t.status,teamId:t.teamId,proposedDate:t.proposedDate,processDate:t.processDate,items:t.items})),moves:all.filter(t=>['WAIVER','FREEAGENT','DRAFT'].includes(t.type)&&t.status==='EXECUTED').map(t=>({type:t.type,items:t.items}))});
  const trades=all.filter(t=>String(t.type||t.transactionType||'').toUpperCase().includes('TRADE')&&['EXECUTED','COMPLETED','PROCESSED'].includes(String(t.status||'').toUpperCase())).map(t=>{
   const items=(Array.isArray(t.items)?t.items:[]).filter((i:any)=>i.playerId!=null&&i.fromTeamId!=null&&i.toTeamId!=null).map((i:any)=>({playerId:Number(i.playerId),fromTeamId:Number(i.fromTeamId),toTeamId:Number(i.toTeamId),playerName:i.player?.fullName||i.playerName||null}));
   const teams=[...new Set<number>(items.flatMap((i:any)=>[i.fromTeamId,i.toTeamId]))];
   return {id:String(t.id||t.relatedTransactionId||t.proposedDate),date:t.processDate||t.executionDate||t.proposedDate||null,status:t.status,teams,items,scoringPeriodId:t.scoringPeriodId||null};
  }).filter(t=>t.items.length>0);
  const ids=[...new Set<number>(trades.flatMap(t=>t.items.map(i=>i.playerId)))];
  const names=new Map<number,string>();
  if(ids.length){
   const filter=JSON.stringify({players:{filterIds:{value:ids},limit:Math.max(ids.length,50)}});
   for(const url of [base+'?view=kona_player_info',base+'/players?view=kona_player_info']){
    try{
     const p=await fetch(url,{cache:'no-store',headers:{...headers,'x-fantasy-filter':filter}});
     if(!p.ok){diagnostics.push('Player lookup HTTP '+p.status);continue}
     const json=await p.json();
     const players=Array.isArray(json)?json:Array.isArray(json.players)?json.players:[];
     for(const entry of players){const player=entry.player||entry;const id=Number(player.id||entry.id);if(id&&player.fullName)names.set(id,player.fullName)}
     if(names.size)break;
    }catch(e){diagnostics.push('Player lookup error: '+String(e))}
   }
  }
  for(const trade of trades)for(const item of trade.items)item.playerName=item.playerName||names.get(item.playerId)||null;
  diagnostics.push('Completed trades: '+trades.length+'; player names found: '+names.size+'/'+ids.length);
  return NextResponse.json({trades,diagnostics,notice:trades.length?'':'No executed player-for-player trades were found in ESPN transaction history.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({trades:[],diagnostics,notice:'Could not load trade history: '+String(e)},{status:200})}
}