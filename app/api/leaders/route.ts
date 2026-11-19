import {NextResponse} from 'next/server';
export const revalidate=900;
const base='https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026';
export async function GET(){try{
 const settings=await fetch(base+'/segments/0/leagues/1118939070?view=mSettings',{next:{revalidate:900}}).then(r=>{if(!r.ok)throw Error('League settings unavailable');return r.json()});
 const current=Number(settings.status?.currentMatchupPeriod||0);
 const rules=settings.settings?.scoringSettings?.scoringItems||[];
 if(!rules.length||current<2)throw Error('Scoring rules or completed weeks unavailable');
 const headers={Accept:'application/json','User-Agent':'Mozilla/5.0','X-Fantasy-Filter':JSON.stringify({players:{limit:2500,filterStatsForTopScoringPeriodIds:{value:Array.from({length:current-1},(_,i)=>i+1),additionalValue:['002026']},sortAppliedStatTotal:{sortAsc:false,sortPriority:1,sortKey:'002026'}}})};
 const response=await fetch(base+'/segments/0/leaguedefaults/1?view=kona_player_info',{headers,next:{revalidate:900}});
 if(!response.ok)throw Error('ESPN player stats unavailable');
 const data=await response.json();
 const positions:Record<number,string>={1:'QB',2:'RB',3:'WR',4:'TE',5:'K',16:'D/ST'};
 const leaders:Record<string,{name:string;points:number}>={};let record:{name:string;points:number;week:number}|null=null;
 for(const entry of data.players||[]){const p=entry.player||entry;const pos=positions[p.defaultPositionId];if(!pos)continue;let total=0,found=false;
 for(const st of p.stats||[]){const week=Number(st.scoringPeriodId);if(Number(st.statSourceId)!==0||Number(st.statSplitTypeId)!==1||week<1||week>=current||!st.stats)continue;let points=0;
 for(const rule of rules){const multiplier=rule.pointsOverrides?.[p.defaultPositionId]??rule.points??0;points+=Number(st.stats[rule.statId]||0)*Number(multiplier)}
 if(!Number.isFinite(points))continue;found=true;total+=points;if(pos!=='D/ST'&&(!record||points>record.points))record={name:p.fullName,points,week};
 }if(found&&(!leaders[pos]||total>leaders[pos].points))leaders[pos]={name:p.fullName,points:total};
 }
 if(!Object.keys(leaders).length)throw Error('Weekly player statistics missing');
 return NextResponse.json({leaders,record,throughWeek:current-1});
 }catch(e){return NextResponse.json({error:String(e)},{status:502})}}
