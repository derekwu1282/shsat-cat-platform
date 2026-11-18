import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(){
 const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1118939070';
 const headers={'Accept':'application/json','User-Agent':'Mozilla/5.0'};
 const diagnostics:string[]=[];
 try{
  const r=await fetch(base+'/transactions?view=mTransactions2',{cache:'no-store',headers});
  if(!r.ok)return NextResponse.json({trades:[],notice:'ESPN transactions request returned HTTP '+r.status,diagnostics});
  const payload=await r.json();
  const all:any[]=Array.isArray(payload)?payload:Array.isArray(payload.transactions)?payload.transactions:[];
  diagnostics.push('ESPN returned '+all.length+' transactions.');
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