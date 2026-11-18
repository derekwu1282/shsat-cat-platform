import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(){
 const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1118939070';
 const headers={'Accept':'application/json','User-Agent':'Mozilla/5.0','x-fantasy-filter':JSON.stringify({transactions:{filterType:{value:['TRADE']}}})};
 const attempts=[base+'?view=mTransactions2',base+'/transactions?view=mTransactions2',base+'?view=mTransactions'];
 const diagnostics:string[]=[];
 const all:any[]=[];
 for(const url of attempts){
  try{
   const res=await fetch(url,{cache:'no-store',headers});
   if(!res.ok){diagnostics.push(new URL(url).pathname+' HTTP '+res.status);continue}
   const json=await res.json();
   const candidates=Array.isArray(json)?json:Array.isArray(json.transactions)?json.transactions:Array.isArray(json?.league?.transactions)?json.league.transactions:[];
   diagnostics.push(new URL(url).pathname+' returned '+candidates.length+' transactions; fields: '+Object.keys(json||{}).slice(0,12).join(','));
   all.push(...candidates);
  }catch(e){diagnostics.push(String(e))}
 }
 const seen=new Set<string>();
 const trades=all.filter(t=>{
  const type=String(t.type||t.transactionType||t.typeId||'').toUpperCase();
  const status=String(t.status||'').toUpperCase();
  const id=String(t.id||t.transactionId||JSON.stringify(t));
  if(seen.has(id))return false;
  seen.add(id);
  return (type.includes('TRADE')||type==='2')&&['EXECUTED','COMPLETED','PROCESSED'].includes(status);
 }).map(t=>({
  id:String(t.id||t.transactionId||t.processDate||t.proposedDate),
  date:t.processDate||t.executionDate||t.proposedDate||null,
  status:t.status||'COMPLETED',
  teams:[...new Set<number>((Array.isArray(t.items)?t.items:[]).flatMap((i:any)=>[i.fromTeamId,i.toTeamId]).filter((x:any)=>Number.isFinite(Number(x))).map(Number))],
  items:(t.items||[]).map((i:any)=>({playerId:i.playerId||i.player?.id,fromTeamId:i.fromTeamId,toTeamId:i.toTeamId,type:i.type,playerName:i.player?.fullName||i.player?.name||i.playerName||null})),
  scoringPeriodId:t.scoringPeriodId||null
 }));
 const first=all.find(t=>String(t.type||t.transactionType||'').toUpperCase().includes('TRADE'));
 if(first){diagnostics.push('Trade record fields: '+Object.keys(first).join(', '));diagnostics.push('Trade record structure (IDs only): '+JSON.stringify({id:first.id,type:first.type,status:first.status,teamIds:first.teamIds,items:first.items,actions:first.actions,transactionItems:first.transactionItems}).slice(0,4500));}
 const ids=[...new Set<number>(trades.flatMap(t=>t.items.map((i:any)=>Number(i.playerId)).filter((x:number)=>Number.isFinite(x))))];
 const playerNames=new Map<number,string>();
 if(ids.length){
  try{
   const filter=JSON.stringify({players:{filterIds:{value:ids},limit:ids.length}});
   const r=await fetch(base+'?view=kona_player_info',{cache:'no-store',headers:{Accept:'application/json','User-Agent':'Mozilla/5.0','x-fantasy-filter':filter}});
   if(r.ok){const j=await r.json();for(const p of j.players||[]){const obj=p.player||p;const id=Number(obj.id||p.id);if(id&&obj.fullName)playerNames.set(id,obj.fullName)}diagnostics.push('Player names resolved: '+playerNames.size+' of '+ids.length)}else diagnostics.push('Player name lookup HTTP '+r.status);
  }catch(e){diagnostics.push('Player name lookup: '+String(e))}
 }
 for(const trade of trades){for(const item of trade.items){if(!item.playerName)item.playerName=playerNames.get(Number(item.playerId))||null}}
 const notice=trades.length?'':all.length?'ESPN returned transactions, but none were identified as completed trades.':'ESPN returned no transactions through the available public endpoints. Your league may require ESPN authentication to access trade history.';
 return NextResponse.json({trades,notice,diagnostics},{headers:{'Cache-Control':'no-store'}});
}