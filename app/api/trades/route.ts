import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1118939070';
  const response=await fetch(base+'/transactions?view=mTransactions2',{cache:'no-store',headers:{Accept:'application/json','User-Agent':'Mozilla/5.0'}});
  if(!response.ok)return NextResponse.json({trades:[],notice:'ESPN transaction history is unavailable (HTTP '+response.status+'). The league may require authentication.'});
  const json=await response.json();
  const raw=Array.isArray(json)?json:Array.isArray(json.transactions)?json.transactions:[];
  const trades=raw.filter((t:any)=>String(t.type||t.transactionType||'').toUpperCase().includes('TRADE')&& !['VETOED','CANCELED','REJECTED','PROPOSED','PENDING'].includes(String(t.status||'').toUpperCase())).map((t:any)=>({
   id:String(t.id||t.transactionId||t.processDate||Math.random()),
   date:t.processDate||t.executionDate||t.proposedDate||null,
   status:t.status||'',
   teams:Array.isArray(t.teamIds)?t.teamIds:[],
   items:(t.items||[]).map((i:any)=>({playerId:i.playerId,fromTeamId:i.fromTeamId,toTeamId:i.toTeamId,type:i.type,playerName:i.player?.fullName||i.player?.name||i.playerName||null})),
   scoringPeriodId:t.scoringPeriodId||null
  }));
  return NextResponse.json({trades,notice:trades.length?'':'No completed trades were returned by ESPN. This can also happen when transaction history is restricted.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({trades:[],notice:'Could not load ESPN trade history: '+String(e)})}
}