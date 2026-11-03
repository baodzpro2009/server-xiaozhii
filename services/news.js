const Parser=require('rss-parser');
const axios=require('axios');
const crypto=require('node:crypto');
const {query}=require('../db');
const parser=new Parser({timeout:10000});

const feeds=[
  ['VNExpress','https://vnexpress.net/rss/tin-moi-nhat.rss'],
  ['Tuổi Trẻ','https://tuoitre.vn/rss/tin-moi-nhat.rss'],
  ['Thanh Niên','https://thanhnien.vn/rss/home.rss']
];
const CACHE_TTL_MS = 120000;
const MAX_SEARCH_CACHE_ENTRIES = 100;
let latestCache = null;
let latestCacheAt = 0;
const searchCache = new Map();

function cleanupMemory(now = Date.now()) {
  let removed = 0;
  for (const [keyword, entry] of searchCache) {
    if (!entry || now - entry.at >= CACHE_TTL_MS) {
      searchCache.delete(keyword);
      removed += 1;
    }
  }
  while (searchCache.size > MAX_SEARCH_CACHE_ENTRIES) {
    searchCache.delete(searchCache.keys().next().value);
    removed += 1;
  }
  return { removed, remaining_search_entries: searchCache.size };
}

async function persistCache(keyword, items) {
  try {
    await query(`INSERT INTO news_cache(keyword,data_json) VALUES(?,?) ON CONFLICT (keyword) DO UPDATE SET data_json=EXCLUDED.data_json,updated_at=NOW()`, [keyword, JSON.stringify(items)]);
  } catch (error) {
    // RSS-backed news remains useful when the database is offline. Persistence
    // is best effort; the process cache below serves repeated requests.
    console.warn(`[news] could not persist ${keyword} cache:`, error.message);
  }
}

function normalize(items,source){return items.slice(0,20).map(x=>({title:x.title||'',link:x.link||'',sourceId:String(x.guid||x.id||'').trim(),publishedAt:x.isoDate||x.pubDate||null,source,description:(x.contentSnippet||x.content||'').replace(/<[^>]+>/g,'').slice(0,300)}));}
function articleIds(item){
  const ids=new Set([String(item.sourceId||'').trim(),cryptoId(item)]);
  const link=String(item.link||'');
  for(const match of link.matchAll(/(\d{5,})(?=\.html?(?:[?#]|$))/gi))ids.add(match[1]);
  return ids;
}
function cryptoId(item){return crypto.createHash('sha1').update(String(item.link||item.title)).digest('hex').slice(0,12);}
function findById(items,id){const wanted=String(id||'').trim();return items.find(item=>articleIds(item).has(wanted)||String(item.link||'')===wanted||String(item.title||'').trim()===wanted);}
async function latest(){
  if (latestCache && Date.now() - latestCacheAt < CACHE_TTL_MS) return latestCache;
  const all=[];
  for(const [source,url] of feeds){try{const f=await parser.parseURL(url);all.push(...normalize(f.items||[],source));}catch(e){}}
  all.sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0));
  const out=all.slice(0,30);
  if (out.length) {
    latestCache = out;
    latestCacheAt = Date.now();
  }
  void persistCache('__latest__', out);
  if (!out.length && latestCache) return latestCache;
  return out;
}
async function searchNews(keyword){
  cleanupMemory();
  const cached = searchCache.get(keyword);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;
  const url=`https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=vi&gl=VN&ceid=VN:vi`;
  const feed=await parser.parseURL(url);
  const out=normalize(feed.items||[],'Google News').slice(0,30);
  if (out.length) {
    searchCache.set(keyword, { items: out, at: Date.now() });
    cleanupMemory();
  }
  void persistCache(keyword, out);
  return out;
}
module.exports={latest,searchNews,cleanupMemory,findById};
