import { defer } from "@remix-run/node";
import { mediaDetailFixture } from "../../test/fixtures/media-detail";

const poster = "/__audit/poster.svg";
const title = "The extraordinarily long title of this illustrated example movie with a very long subtitle";
const item = { title, ratingKey:"42", guid:"plex://movie/42", type:"movie", year:"2024", posterUrl:poster, backdropUrl:poster, thumb:poster, imageUrl:poster, poster, userRating:8, score:8, genres:["Drama"], viewCount:0, details:{summary:"Synthetic summary", runtime:"2h"}, progress:42, isInWatchlist:false };
const show = {...item, type:"show", ratingKey:"44"};
const row = {title:"Recommendations", items:[{...item,key:"rec",href:"/app/media/movie/42"}]};
const blankHome = {billboardCandidates:[],continueWatching:[],recentlyAdded:[],nextRows:[],feedErrors:[]};
function delayed<T>(value:T,failed=false){return new Promise<T>((resolve,reject)=>setTimeout(()=>failed?reject(new Error("Fixture unavailable")):resolve(value),550));}
const home=(full:boolean,failed=false)=>()=>defer({...blankHome,...(full?{billboardCandidates:[{...item,logoUrl:poster},show],continueWatching:[item],recentlyAdded:[item,show],nextRows:[row]}:{}),logos:Promise.resolve({}),extraRows:delayed(full?[row]:[],failed),feedErrors:failed?["One feed could not be loaded."]:[]});
const lib={libraryKey:"1",currentFilters:{filter:"all",sort:"titleSort",sortDirection:"asc"},availableFilters:{genres:["Drama","Very Long Genre Name"],years:[2024]},page:1,pages:1,total:1,letters:{T:{page:1,ratingKey:"42"}},keys:["42"]};
const rows=[{title:"Trending",items:[{id:17,mediaType:"movie",title,releaseDate:"2024-01-01",mediaInfo:{status:5}}]}];
const search={q:"example",library:[item],discover:[{id:18,type:"show",title:"External series",releaseDate:"2024-01-01",posterUrl:poster}]};
const playlist={ratingKey:"9",title:"Example Playlist",itemCount:4,thumb:poster,type:"playlist"};
const collection={...playlist,ratingKey:"10",title:"Example Collection",type:"collection"};
const wlItem={id:"plex-42",title,type:"movie",thumb:poster,year:2024,sources:["plex"],addedAt:{plex:1700000000},localRatingKey:"42",isLocal:true,rating:8};
const watchlist=(items:unknown[],isStale=false,failed=false)=>()=>defer({traktEnabled:true,imdbEnabled:true,watchlistData:delayed({items,counts:{plex:items.length,trakt:0,imdb:0,total:items.length},isStale,cachedAt:1700000000},failed)});
type Case={id:string,path:string,routeId:string,data:unknown};
const c=(route:string,path:string,id:string,data:unknown):Case=>({id,path,routeId:"routes/"+route,data});
export const cases:Case[]=[
  ...[["full",true,false],["fallback",false,false],["error",false,true]].map(([n,f,e])=>c("app._index","/app","home-"+n,home(!!f,!!e))),
  ...["movies","series"].flatMap(family=>[
    ["populated",{...lib,items:[family==="movies"?item:show]}],
    ["empty",{...lib,items:[],total:0,keys:[],letters:{}}],
    ["filtered-empty",{...lib,items:[],total:0,keys:[],letters:{},currentFilters:{...lib.currentFilters,genre:"Drama"}}],
    ["paged-rating",{...lib,items:[item],pages:3,total:100,currentFilters:{...lib.currentFilters,sort:"userRating"}}],
  ].map(([n,d])=>c("app.watch."+family,"/app/watch/"+family+(n==="filtered-empty"?"?genre=Drama":""),"library-"+family+"-"+n,d))),
  ...[["full",{items:[item],error:null}],["empty",{items:[],error:null}],["error",{items:[],error:"Could not load recent titles."}]].map(([n,d])=>c("app.watch.recent","/app/watch/recent","recent-"+n,d)),
  ...[["full",{rows}],["empty",{rows:[{title:"Trending",items:[]}]}],["partial",{rows:[...rows,{title:"Popular",items:[],error:"Could not load Popular."}]}],["error",{rows:[],error:"Discover is unavailable."}]].map(([n,d])=>c("app.discover","/app/discover","discover-"+n,d)),
  ...[["idle",{q:"",library:[],discover:[]}],["results",search],["empty",{...search,library:[],discover:[]}],["partial",{...search,library:[],libraryError:true}],["error",{...search,library:[],discover:[],libraryError:true,discoverError:true}]].map(([n,d])=>c("app.search","/app/search"+(n==="idle"?"":"?q=example"),"search-"+n,d)),
  ...[["full",{playlists:[playlist],collections:[collection],errors:[]}],["empty",{playlists:[],collections:[],errors:[]}],["error",{playlists:[],collections:[],errors:["Could not load playlists."]}]].map(([n,d])=>c("app.stuff.lists","/app/stuff/lists","lists-"+n,d)),
  ...["playlist","collection"].flatMap(t=>[true,false].map(full=>c("app.lists_.$type.$ratingKey","/app/lists/"+t+"/9","listdetail-"+t+(full?"":"-empty"),{title,summary:"Local list summary",items:full?[item,show]:[],itemCount:full?2:0,listType:t}))),
  ...[["full",watchlist([wlItem])],["empty",watchlist([])],["stale",watchlist([wlItem],true)],["error",watchlist([],false,true)]].map(([n,d])=>c("app.stuff.watchlist","/app/stuff/watchlist","watchlist-"+n,d)),
  ...[["full",{movies:[item],shows:[show],errors:[]}],["empty",{movies:[],shows:[],errors:[]}],["error",{movies:[],shows:[],errors:["Could not load movies."]}]].map(([n,d])=>c("app.actor.$id","/app/actor/17","actor-"+n,{actorName:title,actorPhotoUrl:poster,...(d as object)})),
  ...(["movie","show","season","episode"] as const).map(t=>c("app.media.$type.$ratingKey","/app/media/"+t+"/42","media-"+t,{...mediaDetailFixture(t),posterUrl:poster,backdropUrl:poster,cast:[{id:17,tag:"Example Actor",role:"Lead"}],viewOffset:50000})),
  c("app.media.$type.$ratingKey","/app/media/movie/tmdb-17","external-long",{external:{id:17,title:"Extraordinary".repeat(10),type:"movie",year:"2024",overview:"Synthetic unbroken title",status:1,status4k:null,requestEnabled:true,error:null}}),
  ...[1,2,3,4,5,6,7,null].map(status=>c("app.media.$type.$ratingKey","/app/media/movie/tmdb-17","external-"+status,{external:{id:17,title,type:"movie",year:"2024",overview:"Example external title",status,status4k:null,requestEnabled:status!==null,error:status===null?"Could not fetch request status.":null}})),
  c("app.watch.$ratingKey","/app/watch/42","player-loading",{ratingKey:"42",type:"episode",title,streamUrl:"/__audit/no-video.mp4",posterUrl:poster,durationMs:420000,resumePositionSeconds:0,quality:{id:"original",label:"Original"},availableQualities:[{id:"original",label:"Original"}],playbackMethod:"direct_play",mediaInfo:{},audioTracks:[],subtitleTracks:[],markers:[],episodes:[{ratingKey:"42",title,index:1},{ratingKey:"43",title:"Next",index:2}],nextEpisode:{ratingKey:"43",title:"Next",label:"S1:E2"}}),
];
