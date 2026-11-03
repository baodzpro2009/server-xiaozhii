require('dotenv').config();
// YouTube uses yt-dlp directly by default. An external resolver is used only
// when YOUTUBE_PROXY_URL is explicitly configured by the operator.
if (String(process.env.YOUTUBE_PROXY_URL || '').trim()) {
  console.log(`[YouTube proxy] using explicitly configured resolver: ${process.env.YOUTUBE_PROXY_URL}`);
} else {
  console.log('[YouTube] using direct yt-dlp mode');
}
// Check the official yt-dlp release at startup and download only if it is
// missing or older. Keep the existing/PATH binary if the check fails.
if (!process.env.YT_DLP_BIN || ['yt-dlp', 'yt-dlp.exe'].includes(process.env.YT_DLP_BIN.toLowerCase())) {
  const fs = require('node:fs');
  const path = require('node:path');
  const { install, executable } = require('./scripts/install-ytdlp');
  const localYtDlp = path.join(__dirname, 'yt-dlp', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (fs.existsSync(localYtDlp)) process.env.YT_DLP_BIN = localYtDlp;
  const previousBinary = process.env.YT_DLP_BIN;
  console.log(`[yt-dlp] checking the installed version${fs.existsSync(localYtDlp) ? '' : ' (local binary missing)'}.`);
  install().then(() => {
    process.env.YT_DLP_BIN = executable;
    console.log(`[yt-dlp] binary is ready: ${executable}`);
  }).catch(error => {
    if (previousBinary) process.env.YT_DLP_BIN = previousBinary;
    console.error('[yt-dlp] automatic update failed; continuing with the existing binary:', error.message);
  });
}
// Prefer the host FFmpeg; download a validated Linux x64 build only when it is
// missing. Keep the API available while the optional media binary is fetched.
const { install: installFfmpeg } = require('./scripts/install-ffmpeg');
installFfmpeg().then(binary => {
  process.env.FFMPEG_BIN = binary;
}).catch(error => {
  console.error('[ffmpeg] automatic install unavailable; audio transcoding may fail:', error.message);
});
const express=require('express');const path=require('path');const {initDb,query}=require('./db');
const fs=require('node:fs/promises');
const youtube=require('./routes/youtube');const weather=require('./routes/weather');const news=require('./routes/news');const suggest=require('./routes/suggest');const companion=require('./routes/companion');const {mcpHandler,tools}=require('./mcp');
const reminders=require('./routes/reminders');const briefing=require('./routes/briefing');const market=require('./routes/market');const content=require('./routes/content');const audio=require('./routes/audio');const finance=require('./routes/finance');
const admin=require('./routes/admin');const docs=require('./routes/docs');const {recordRequest}=require('./services/metrics');
const {startHourlyMemoryMaintenance}=require('./services/memory-maintenance');
const {getServerStatus}=require('./services/server-status');
startHourlyMemoryMaintenance();
const app=express();app.use(express.json({limit:'256kb'}));app.use(express.urlencoded({extended:true,limit:'64kb',parameterLimit:100}));
const responseCachePath=path.join(__dirname,'dasu.response');
const responseCacheMaxAge=30*60*1000;
async function cleanupResponseCache(){
  try{
    const file=await fs.stat(responseCachePath);
    if(Date.now()-file.mtimeMs>=responseCacheMaxAge){await fs.unlink(responseCachePath);console.log('Removed expired dasu.response cache.');}
  }catch(error){if(error.code!=='ENOENT')console.error('dasu.response cache cleanup failed:',error.message);}
}
cleanupResponseCache();
const responseCacheCleanup=setInterval(cleanupResponseCache,60*1000);
responseCacheCleanup.unref();
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
app.use((req,res,next)=>{const sendJson=res.json.bind(res);res.json=(body)=>{if(res.statusCode>=400)console.error(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode}`,body?.error||body?.message||'Request failed');return sendJson(body);};res.once('finish',()=>{if(res.statusCode>=400)console.error(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode}`);});next();});
app.use((req,res,next)=>{const started=Date.now();res.once('finish',()=>{if(req.path.startsWith('/api/')||req.path==='/mcp')recordRequest({method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-started});});next();});
const healthCheck=async(_req,res)=>{const started=Date.now();let timeout;try{await Promise.race([query('SELECT 1 AS ok'),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('database health check timed out')),4000);})]);res.json({ok:true,status:'online',database:'connected',service:'xiaozhi-api',time:new Date().toISOString(),response_ms:Date.now()-started});}catch(error){res.json({ok:true,status:'degraded',database:'unavailable',database_error:error.message,service:'xiaozhi-api',time:new Date().toISOString(),response_ms:Date.now()-started});}finally{clearTimeout(timeout);}};
app.get('/health',healthCheck);
app.get('/api/health',healthCheck);
app.get('/saver',async(_req,res,next)=>{try{res.json(await getServerStatus());}catch(error){next(error);}});
// Serve the static API catalog directly so the explorer can load it without
// relying on nested-router path rewriting by a hosting proxy.
app.get('/api/docs',(_req,res)=>{res.set('Cache-Control','no-store');res.json({title:'Xiaozhi API',endpoints:docs.endpoints});});
app.use('/api/docs',docs);app.use('/api/admin',admin);
app.get('/api/mcp/tools',(_,res)=>res.json({tools}));
app.get('/api',(_,res)=>res.json({name:'Xiaozhi API',version:'1.0.0',endpoints:['/api/youtube/search','/api/weather','/api/news/latest','/api/news/search','/api/suggest','/api/briefing','/api/reminders','/api/gold/sjc','/api/lottery','/api/finance/overview','/api/finance/exchange-rates','/api/finance/stock-market','/api/finance/news','/api/finance/crypto-market','/api/music/*','/api/radio/play','/api/story','/api/wordplay','/api/companion/*','/mcp','/health']}));
app.use('/api/youtube',youtube);app.use('/api/weather',weather);app.use('/api/news',news);app.use('/api/suggest',suggest);app.use('/api/suggestions',suggest);
// Dedicated feature routers keep routes/services independently maintainable.
// Mount before the compatibility router so the new implementations take precedence.
for (const prefix of ['/api/companion', '/api']) {
  app.use(prefix, briefing);
  app.use(`${prefix}/reminders`, reminders);
  app.use(prefix, market);
  app.use(prefix, content);
  app.use(prefix, audio);
  app.use(prefix, finance);
}
app.use('/api/companion',companion);app.use('/api',companion);app.post('/mcp',mcpHandler);
app.get('/favicon.ico',(_,res)=>res.sendFile(path.join(__dirname,'public','favicon.svg')));
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=>{console.error(`[HTTP ERROR] ${req.method} ${req.path}`,err?.stack||err);if(res.headersSent)return next(err);res.status(err.status||500).json({error:err.message||'Internal Server Error'});});
// Use the hosting platform's assigned port when available. The fallback matches
// the public port configured for this deployment.
const port=Number(process.env.PORT||20150);
function listen() { app.listen(port,'0.0.0.0',()=>console.log(`Xiaozhi API listening on 0.0.0.0:${port}`)); }
initDb().then(()=>{
  const cacheCleanup=setInterval(()=>{
    query("DELETE FROM weather_cache WHERE updated_at < NOW() - INTERVAL '30 minutes'").catch(e=>console.error('Weather cache cleanup failed:',e.message));
    query("DELETE FROM news_cache WHERE updated_at < NOW() - INTERVAL '30 minutes'").catch(e=>console.error('News cache cleanup failed:',e.message));
  },30*60*1000);
  cacheCleanup.unref();
  listen();
}).catch(e=>{
  // Keep stateless features (audio, weather, RSS) usable while MySQL is down.
  // Database-backed endpoints and /health will report their own DB errors.
  console.error('DB init failed; starting API in degraded mode:',e.message);
  listen();
});
