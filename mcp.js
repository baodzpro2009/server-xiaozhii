const {searchYouTube,saveSearch,savePlay,history}=require('./services/youtube');
const {getWeather,toSpeech}=require('./services/weather');
const {searchNews}=require('./services/news');
const {suggestions}=require('./services/suggest');
const {cleanServerMemory}=require('./services/memory-maintenance');
const {getServerStatus}=require('./services/server-status');
const DEVICE=()=>process.env.DEFAULT_DEVICE_ID||'xiaozhi';
const companionUrl=(path,args={},publicFacing=false,requestBase='')=>{
 const localBase=`http://127.0.0.1:${process.env.PORT||20150}`;
 const configured=process.env.BASE_URL||'';
 const configuredIsLocal=/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(?:\/|$)/i.test(configured);
 const companionConfigured=process.env.COMPANION_API_URL||'';
 const companionIsLocal=/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(?:\/|$)/i.test(companionConfigured);
 // A localhost URL from .env.example may have a stale port on hosted servers.
 const internalBase=companionIsLocal?localBase:(companionConfigured||localBase);
 const base=(publicFacing?((configured&&!configuredIsLocal?configured:'')||requestBase||internalBase):(internalBase)).replace(/\/$/,'');
 const url=new URL(base+'/api/companion'+path);
 for(const [key,value] of Object.entries(args))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
 if(!url.searchParams.has('deviceId'))url.searchParams.set('deviceId',DEVICE());
 return url.toString();
};
async function companionGet(path,args={}){const r=await fetch(companionUrl(path,args),{signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw new Error(data.error||`Companion returned HTTP ${r.status}`);return data;}
async function companionPost(path,body){const r=await fetch(companionUrl(path,{deviceId:body.deviceId||DEVICE()}),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw new Error(data.error||`Companion returned HTTP ${r.status}`);return data;}
async function companionDelete(path,args={}){const r=await fetch(companionUrl(path,args),{method:'DELETE',signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw new Error(data.error||`Companion returned HTTP ${r.status}`);return data;}

const tools=[
 {name:'server_status',description:'Check this server when the user asks about server status. Report CPU, memory, disk usage, uptime, FFmpeg, and yt-dlp.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'youtube_search',description:'Tìm video hoặc bài hát trên YouTube.',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query']}},
 {name:'youtube_play',description:'Ghi nhận và trả URL YouTube để phát video.',inputSchema:{type:'object',properties:{videoId:{type:'string'},title:{type:'string'},channel:{type:'string'},url:{type:'string'}},required:['videoId','title']}},
 {name:'weather_current',description:'Lấy thời tiết hiện tại và dự báo tại một địa điểm.',inputSchema:{type:'object',properties:{city:{type:'string'},days:{type:'number'}},required:['city']}},
 {name:'news_latest',description:'Lấy các tin tức mới nhất.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'news_detail',description:'Get a news story using the exact id from news_latest. Call news_latest first when no current id is available.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}},
 {name:'news_search',description:'Tìm tin tức mới theo từ khóa.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
 {name:'get_history',description:'Lấy lịch sử YouTube gần nhất của thiết bị.',inputSchema:{type:'object',properties:{deviceId:{type:'string'},limit:{type:'number'}}}},
 {name:'get_suggestions',description:'Đưa ra gợi ý những việc Xiaozhi có thể làm.',inputSchema:{type:'object',properties:{deviceId:{type:'string'}}}},
 {name:'daily_briefing',description:'Lấy báo cáo ngắn gồm thời tiết, tin mới và lịch nhắc hôm nay.',inputSchema:{type:'object',properties:{city:{type:'string'}},required:['city']}},
 {name:'reminder_add',description:'Lưu lời nhắc học bài, lịch học, lịch kiểm tra hoặc việc cần làm. due_at là ISO 8601 có múi giờ.',inputSchema:{type:'object',properties:{title:{type:'string',maxLength:120},due_at:{type:'string',format:'date-time',description:'Local date and time; sent as ISO 8601'},deviceId:{type:'string'}},required:['title','due_at']}},
 {name:'reminder_list_today',description:'Liệt kê lời nhắc hôm nay theo giờ Việt Nam.',inputSchema:{type:'object',properties:{deviceId:{type:'string'}}}},
 {name:'reminder_list_upcoming',description:'Liệt kê các lời nhắc sắp tới.',inputSchema:{type:'object',properties:{deviceId:{type:'string'}}}},
 {name:'reminder_delete',description:'Xóa lời nhắc theo ID sau khi đã xác định đúng mục cần xóa.',inputSchema:{type:'object',properties:{id:{type:'string'},deviceId:{type:'string'}},required:['id']}},
 {name:'gold_sjc',description:'Lấy giá vàng SJC mới nhất.',inputSchema:{type:'object',properties:{}}},
 {name:'lottery_results',description:'Lấy kết quả xổ số theo miền Bắc, Trung hoặc Nam.',inputSchema:{type:'object',properties:{region:{type:'string',enum:['mien-bac','mien-trung','mien-nam']}}}},
 {name:'get_financial_overview',description:'Tổng hợp giá vàng SJC, tỷ giá, chỉ số chứng khoán, crypto và tin tài chính hiện có trong ngày; dữ liệu có thể cập nhật ở thời điểm khác nhau.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'get_exchange_rates',description:'Lấy tỷ giá ngoại tệ tham chiếu theo ngày, mặc định lấy từ USD sang các đồng phổ biến.',inputSchema:{type:'object',properties:{base:{type:'string',description:'Mã tiền tệ 3 chữ cái, ví dụ USD'},quotes:{type:'array',items:{type:'string'},description:'Các mã tiền muốn lấy, ví dụ VND, EUR'}}}},
 {name:'get_stock_market',description:'Lấy snapshot VN-Index và các chỉ số chứng khoán quốc tế; có thể truyền danh sách ticker.',inputSchema:{type:'object',properties:{symbols:{type:'array',items:{type:'string'},description:'Ticker Yahoo Finance, ví dụ ^VNINDEX, ^GSPC'}}}},
 {name:'get_financial_news',description:'Lấy tin tài chính/kinh doanh mới nhất từ RSS VnExpress.',inputSchema:{type:'object',properties:{limit:{type:'number',minimum:1,maximum:20}}}},
 {name:'get_crypto_market',description:'Lấy giá và biến động 24 giờ của các cặp crypto/USDT trên Binance public market data.',inputSchema:{type:'object',properties:{symbols:{type:'array',items:{type:'string'},description:'Các cặp như BTCUSDT, ETHUSDT'}}}},
 {name:'server_resource_cleanup',description:'Dọn cache yt-dlp và file tạm cũ hơn 24 giờ, cache hết hạn của ứng dụng, rồi yêu cầu Node.js thu gom bộ nhớ không còn dùng. Trả dung lượng đĩa trước/sau. Không xóa database hoặc ngắt luồng đang phát.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'radio_play',description:'Tìm đài phát thanh và trả đường dẫn luồng Opus cho thiết bị.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
 {name:'soundcloud_search',description:'Tìm các bài hát trên SoundCloud và trả danh sách tên nghệ sĩ, thời lượng, URL để người dùng chọn phát.',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'number'}},required:['query']}},
 {name:'soundcloud_play',description:'Phát bài đã chọn trên SoundCloud bằng URL bài hát, hoặc tìm bài đầu tiên theo từ khóa.',inputSchema:{type:'object',properties:{query:{type:'string',description:'Search keyword (use this or a track URL)'},url:{type:'string',description:'Selected SoundCloud track URL (use this or a search keyword)'},title:{type:'string',description:'Optional track title'}},required:[]}},
 {name:'youtube_audio_play',description:'Tìm nhạc YouTube và trả đường dẫn luồng Opus.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
 {name:'music_channel3_play',description:'Phát radio VOV3 qua luồng Opus.',inputSchema:{type:'object',properties:{query:{type:'string'}}}},
 {name:'story_get',description:'Lấy một truyện ngắn tiếng Việt để đọc cho người dùng.',inputSchema:{type:'object',properties:{topic:{type:'string'}}}},
 {name:'wordplay_get',description:'Lấy một câu luyện phát âm tiếng Việt.',inputSchema:{type:'object',properties:{}}}
];
async function callTool(name,args={},requestBase=''){
 switch(name){
  case'youtube_search':{const r=await searchYouTube(args.query,args.limit||10);try{await saveSearch(args.deviceId||DEVICE(),args.query,r);}catch(error){console.warn('[YouTube search] could not save search history:',error.message);}return r;}
  case'youtube_play':{const v={videoId:args.videoId,title:args.title,channel:args.channel||'',url:args.url||`https://www.youtube.com/watch?v=${args.videoId}`};await savePlay(args.deviceId||DEVICE(),v);return v;}
  case'weather_current':{const w=await getWeather(args.city,args.days||7);return {...w,speech:toSpeech(w)};}
  case'news_latest':return await companionGet('/news',{limit:5});
  case'news_detail':{if(!String(args.id||'').trim())throw new Error('Call news_latest first and pass the exact id of the selected story.');try{return await companionGet('/news/detail',{id:args.id});}catch(error){if(/news_not_found/i.test(error.message))return {found:false,id:args.id,message:'Không tìm thấy tin này; hãy gọi news_latest để lấy danh sách mới nhất rồi chọn ID hiện tại.'};throw error;}}
  case'news_search':return await searchNews(args.query);
  case'get_history':return await history(args.deviceId||DEVICE(),args.limit||20);
  case'get_suggestions':return await suggestions(args.deviceId||DEVICE());
  case'daily_briefing':return await companionGet('/briefing',{city:args.city});
  case'reminder_add':return await companionPost('/reminders',{title:args.title,due_at:args.due_at,deviceId:args.deviceId||DEVICE()});
  case'reminder_list_today':return await companionGet('/reminders',{deviceId:args.deviceId||DEVICE()});
  case'reminder_list_upcoming':return await companionGet('/reminders',{scope:'upcoming',deviceId:args.deviceId||DEVICE()});
  case'reminder_delete':return await companionDelete(`/reminders/${encodeURIComponent(args.id)}`,{deviceId:args.deviceId||DEVICE()});
  case'gold_sjc':return await companionGet('/gold/sjc');
  case'lottery_results':return await companionGet('/lottery',{region:args.region||'mien-bac'});
  case'get_financial_overview':return await companionGet('/finance/overview');
  case'get_exchange_rates':return await companionGet('/finance/exchange-rates',{base:args.base||'USD',quotes:args.quotes?.join(',')});
  case'get_stock_market':return await companionGet('/finance/stock-market',{symbols:args.symbols?.join(',')});
  case'get_financial_news':return await companionGet('/finance/news',{limit:args.limit||8});
  case'get_crypto_market':return await companionGet('/finance/crypto-market',{symbols:args.symbols?.join(',')});
  case'server_resource_cleanup':case'server_memory_cleanup':return cleanServerMemory();
  case'server_status':return await getServerStatus();
  case'radio_play':return {stream_url:companionUrl('/radio/play',{q:args.query},true,requestBase),content_type:'audio/ogg'};
  case'soundcloud_search':return await companionGet('/music/soundcloud/search',{q:args.query,limit:args.limit||8});
  case'soundcloud_play':{if(!String(args.query||'').trim()&&!String(args.url||'').trim())throw new Error('Provide a SoundCloud search query or track URL.');return {stream_url:companionUrl('/music/soundcloud/play',{q:args.query,url:args.url,title:args.title},true,requestBase),content_type:'audio/ogg'};}
  case'youtube_audio_play':return {stream_url:companionUrl('/music/youtube/play',{q:args.query},true,requestBase),content_type:'audio/ogg'};
  case'music_channel3_play':return {stream_url:companionUrl('/music/channel3/play',{q:args.query||'VOV3'},true,requestBase),content_type:'audio/ogg'};
  case'story_get':return await companionGet('/story',{topic:args.topic||''});
  case'wordplay_get':return await companionGet('/wordplay');
  default:throw new Error('Tool không tồn tại: '+name);
 }
}
function mcpHandler(req,res){
 const body=req.body||{};const id=body.id??null;
 let timedOut=false;
 const timeout=setTimeout(()=>{timedOut=true;if(!res.headersSent&&!res.destroyed)res.status(504).json({jsonrpc:'2.0',id,error:{code:-32000,message:'MCP request timed out after 30 seconds'}});},30000);
 const scheme=(req.get('x-forwarded-proto')||req.protocol).split(',')[0].trim();
 const host=(req.get('x-forwarded-host')||req.get('host')||'').split(',')[0].trim();
 const requestBase=/^https?$/.test(scheme)&&host?`${scheme}://${host}`:'';
 Promise.resolve().then(async()=>{
  if(body.jsonrpc!=='2.0')throw new Error('jsonrpc phải là 2.0');
  if(body.method==='initialize')return {protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'xiaozhi-api',version:'1.0.0'}};
  if(body.method==='notifications/initialized')return null;
  if(body.method==='tools/list')return {tools};
  if(body.method==='tools/call'){const r=await callTool(body.params?.name,body.params?.arguments||{},requestBase);return {content:[{type:'text',text:JSON.stringify(r, null, 2)}],structuredContent:r,isError:false};}
  throw new Error('Method không hỗ trợ: '+body.method);
 }).then(result=>{if(timedOut||res.destroyed)return;if(body.method?.startsWith('notifications/'))return res.status(202).end();res.json({jsonrpc:'2.0',id,result});}).catch(e=>{console.error('[MCP ERROR]',{method:body.method,tool:body.params?.name,message:e.message,stack:e.stack});if(!timedOut&&!res.destroyed)res.status(200).json({jsonrpc:'2.0',id,error:{code:-32000,message:e.message}});}).finally(()=>clearTimeout(timeout));
}
module.exports={mcpHandler,tools};
