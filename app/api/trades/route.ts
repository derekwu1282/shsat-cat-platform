import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1118939070';
 const headers={'Accept':'application/json','User-Agent':'Mozilla/5.0'};
 const diagnostics:string[]=[];
 try{
  const week=new URL(request.url).searchParams.get('week');
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