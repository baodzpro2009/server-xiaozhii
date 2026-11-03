const $=id=>document.getElementById(id);async function get(u){const r=await fetch(u);return r.json()}
async function fetchJson(url,options={}){const response=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(15000)});let data;try{data=await response.json()}catch{throw new Error(`Phản hồi không phải JSON (HTTP ${response.status})`)}if(!response.ok)throw new Error(data?.error||data?.message||`HTTP ${response.status}`);return{data,response}}
let apiDocs=[];
let activeDocCategory='all';
async function renderSuggestions(){
 const container=$('feature-list');if(!container)return;
 container.textContent='Đang tải chức năng...';
 try{
  const {data}=await fetchJson('/api/suggestions/features',{signal:AbortSignal.timeout(10000)});
  const categories=Array.isArray(data.categories)?data.categories:[];
  const items=Array.isArray(data.items)?data.items:[];
  if(!items.length){container.textContent='Máy chủ chưa công bố chức năng nào.';return}
  container.innerHTML=categories.map((category,index)=>{
   const entries=items.filter(item=>item.category===category.id);
   if(!entries.length)return '';
   return `<article class="category-card"><div class="category-art" aria-hidden="true">${['♫','✦','▣'][index%3]}</div><h3>${esc(category.name)}</h3><p>${entries.length} chức năng Xiaozhi hỗ trợ.</p><div class="category-hidden">${entries.map(item=>`<div class="supported-tool"><strong>${esc(item.title)}</strong><br>${esc(item.description)}<br><small>Gợi ý: “${esc(item.prompt)}”</small></div>`).join('')}</div><a class="category-action" href="#mcp-section">Xem công cụ MCP →</a></article>`;
  }).join('')||items.map(item=>`<article class="category-card"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><a class="category-action" href="#mcp-section">Xem công cụ MCP →</a></article>`).join('');
 }catch(error){container.textContent=`Không tải được chức năng: ${error.message}`}
}
function setApiStatus(ok){const node=$('status');if(!node)return;node.textContent=ok?'SYSTEM ONLINE':'SYSTEM OFFLINE';node.classList.toggle('offline',!ok)}
get('/health').then(data=>setApiStatus(Boolean(data.ok))).catch(()=>setApiStatus(false));
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
const toolDescriptions={youtube_search:'T&#236;m video YouTube theo t&#234;n b&#224;i h&#225;t ho&#7863;c t&#7915; kh&#243;a.',youtube_play:'L&#432;u video &#273;&#227; ch&#7885;n v&#224;o l&#7883;ch s&#7917; YouTube.',weather_current:'Xem th&#7901;i ti&#7871;t hi&#7879;n t&#7841;i v&#224; d&#7921; b&#225;o theo th&#224;nh ph&#7889;.',news_latest:'L&#7845;y c&#225;c tin t&#7913;c m&#7899;i nh&#7845;t.',news_detail:'L&#7845;y n&#7897;i dung chi ti&#7871;t c&#7911;a m&#7897;t tin.',news_search:'T&#236;m tin t&#7913;c theo t&#7915; kh&#243;a.',get_history:'Xem l&#7883;ch s&#7917; t&#236;m ki&#7871;m YouTube c&#7911;a thi&#7871;t b&#7883;.',get_suggestions:'L&#7845;y c&#225;c g&#7907;i &#253; cho Xiaozhi.',daily_briefing:'T&#7893;ng h&#7907;p th&#7901;i ti&#7871;t, tin m&#7899;i v&#224; l&#7901;i nh&#7855;c h&#244;m nay.',reminder_add:'T&#7841;o l&#7901;i nh&#7855;c m&#7899;i theo th&#7901;i gian.',reminder_list_today:'Li&#7879;t k&#234; l&#7901;i nh&#7855;c h&#244;m nay.',reminder_list_upcoming:'Li&#7879;t k&#234; c&#225;c l&#7901;i nh&#7855;c s&#7855;p t&#7899;i.',reminder_delete:'X&#243;a l&#7901;i nh&#7855;c theo m&#227;.',gold_sjc:'Xem gi&#225; v&#224;ng SJC m&#7899;i nh&#7845;t.',lottery_results:'Xem k&#7871;t qu&#7843; x&#7893; s&#7889; theo mi&#7873;n.',get_financial_overview:'Xem t&#7893;ng quan th&#7883; tr&#432;&#7901;ng t&#224;i ch&#237;nh.',get_exchange_rates:'Tra c&#7913;u t&#7927; gi&#225; ngo&#7841;i t&#7879;.',get_stock_market:'Xem c&#225;c ch&#7881; s&#7889; th&#7883; tr&#432;&#7901;ng ch&#7913;ng kho&#225;n.',get_financial_news:'L&#7845;y tin t&#224;i ch&#237;nh v&#224; kinh doanh.',get_crypto_market:'Xem gi&#225; v&#224; bi&#7871;n &#273;&#7897;ng ti&#7873;n m&#227; h&#243;a.',radio_play:'T&#236;m v&#224; ph&#225;t m&#7897;t &#273;&#224;i radio.',soundcloud_search:'T&#236;m b&#224;i h&#225;t tr&#234;n SoundCloud.',soundcloud_play:'Ph&#225;t b&#224;i &#273;&#227; ch&#7885;n ho&#7863;c t&#236;m th&#7917; b&#224;i theo t&#7915; kh&#243;a.',youtube_audio_play:'T&#236;m v&#224; ph&#225;t nh&#7841;c YouTube; c&#243; d&#7921; ph&#242;ng SoundCloud.',music_channel3_play:'Ph&#225;t radio VOV3.',story_get:'Ch&#7885;n v&#224; &#273;&#7885;c truy&#7879;n ng&#7855;n ti&#7871;ng Vi&#7879;t.',wordplay_get:'L&#7845;y c&#226;u luy&#7879;n ph&#225;t &#226;m ti&#7871;ng Vi&#7879;t.'};
function mcpField(name,schema,required,index){
 const id=`mcp-${index}-${name}`;
 const note=schema.description?`<small>${esc(schema.description)}</small>`:'';
 const label=`<label for="${esc(id)}">${esc(name)}${required?' <b>*</b>':''}${note}</label>`;
 if(schema.enum)return `${label}<select name="${esc(name)}" id="${esc(id)}" ${required?'required':''}>${schema.enum.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select>`;
 if(schema.type==='boolean')return `${label}<select name="${esc(name)}" id="${esc(id)}" ${required?'required':''}><option value="true">true</option><option value="false">false</option></select>`;
 if(schema.type==='array'||schema.type==='object')return `${label}<textarea name="${esc(name)}" id="${esc(id)}" rows="2" placeholder="${schema.type==='array'?'[]':'{}'}" ${required?'required':''}></textarea>`;
 const type=schema.format==='date-time'?'datetime-local':['number','integer'].includes(schema.type)?'number':'text';
 const step=schema.type==='integer'?'1':'any';
 const min=Number.isFinite(schema.minimum)?`min="${schema.minimum}"`:'';
 const max=Number.isFinite(schema.maximum)?`max="${schema.maximum}"`:'';
 const maxlength=schema.maxLength?`maxlength="${schema.maxLength}"`:'';
 return `${label}<input name="${esc(name)}" id="${esc(id)}" type="${type}" ${type==='number'?`step="${step}" ${min} ${max}`:''} ${maxlength} ${required?'required':''}>`;
}async function loadMcpTools(){const container=$('mcp-tools');if(!container)return;const refresh=$('mcp-refresh');if(refresh)refresh.disabled=true;container.textContent='Đang tải công cụ...';try{const {data}=await fetchJson('/api/mcp/tools',{signal:AbortSignal.timeout(12000)});const tools=Array.isArray(data.tools)?data.tools:[];container.innerHTML=tools.length?`<p class="mcp-notice">Nút chạy sẽ gọi công cụ thật trên máy chủ. Tool tạo hoặc xóa dữ liệu sẽ thực hiện thay đổi thật.</p>${tools.map((tool,index)=>{const schema=tool.inputSchema||{};const properties=schema.properties||{};const required=schema.required||[];return `<article class="mcp-tool"><div class="mcp-tool-title"><strong>${esc(tool.name)}</strong><span>${Object.keys(properties).length?`${Object.keys(properties).length} tham số`:'Không cần tham số'}</span></div><p>${toolDescriptions[tool.name]||esc(tool.description||'')}</p><form class="mcp-test-form" data-tool="${esc(tool.name)}">${Object.entries(properties).map(([name,field])=>mcpField(name,field,required.includes(name),index)).join('')}<button type="submit">Chạy thử</button></form><pre class="mcp-result" aria-live="polite">Chưa chạy</pre></article>`}).join('')}`:'Máy chủ chưa công bố công cụ MCP nào.'}catch(error){container.textContent=error.name==='TimeoutError'?'Máy chủ không trả lời khi tải MCP tools (hết 12 giây). Hãy kiểm tra server rồi bấm Làm mới.':`Không tải được công cụ MCP: ${error.message}`}finally{if(refresh)refresh.disabled=false}}
if($('mcp-tools')){
 loadMcpTools();
 $('mcp-refresh').addEventListener('click',loadMcpTools);
 $('mcp-tools').addEventListener('submit',async event=>{
  const form=event.target.closest('.mcp-test-form');
  if(!form)return;
  event.preventDefault();
  if(form.dataset.tool==='reminder_delete'&&!confirm('Bạn có chắc muốn gọi tool xóa lời nhắc thật?'))return;
  const output=form.closest('.mcp-tool')?.querySelector('.mcp-result');
  const button=form.querySelector('button[type="submit"]');
  if(!output||!button){console.error('[MCP UI] Missing result area or submit button for',form.dataset.tool);return}
  const args={};
  for(const element of form.elements){
   if(!element.name||element.type==='submit'||(!element.value&&!element.required))continue;
   const value=element.value;
   if(element.tagName==='TEXTAREA'){
    try{args[element.name]=JSON.parse(value)}catch{output.classList.add('error');output.textContent=`Tham số ${element.name} cần JSON hợp lệ.`;return}
   }else if(element.type==='number')args[element.name]=Number(value);
   else if(element.type==='datetime-local'){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime())){output.classList.add('error');output.textContent=`Thời gian ${element.name} không hợp lệ.`;return}
    args[element.name]=date.toISOString();
   }else if(element.tagName==='SELECT'&&(value==='true'||value==='false'))args[element.name]=value==='true';
   else args[element.name]=value;
  }
  if(form.dataset.tool==='soundcloud_play'&&!String(args.query||'').trim()&&!String(args.url||'').trim()){
   output.classList.add('error');output.textContent='Nhập query hoặc URL SoundCloud rồi chạy lại.';return;
  }
  form.closest('.mcp-tool').querySelector('audio.mcp-audio-preview')?.remove();
  button.disabled=true;output.textContent='Đang gọi MCP...';output.classList.remove('error');
  try{
   const response=await fetch('/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method:'tools/call',params:{name:form.dataset.tool,arguments:args}}),signal:AbortSignal.timeout(35000)});
   const data=await response.json();
   if(!response.ok||data.error||data.result?.isError){
    output.classList.add('error');
    output.textContent=JSON.stringify(data.error||data.result?.structuredContent||data.result?.content||data,null,2);
   }else{
    const result=data.result?.structuredContent??data.result?.content??data.result;
    output.textContent=JSON.stringify(result,null,2);
    if(typeof result?.stream_url==='string'){
     const stream=new URL(result.stream_url,location.origin);
     if(!['http:','https:'].includes(stream.protocol))throw new Error('MCP trả về URL audio không hợp lệ.');
     const player=document.createElement('audio');player.className='mcp-audio-preview';player.controls=true;player.preload='none';player.src=stream.href;player.addEventListener('error',()=>{output.classList.add('error');output.textContent+='\nAudio stream failed; check server logs for the source error.'});player.setAttribute('aria-label',`Nghe thử ${form.dataset.tool}`);
     output.insertAdjacentElement('afterend',player);
    }
   }
  }catch(error){output.classList.add('error');output.textContent=error.name==='TimeoutError'?'Công cụ MCP quá thời gian chờ. Máy chủ không trả kết quả trong 35 giây.':`Lỗi gọi MCP: ${error.message}`}
  finally{button.disabled=false}
 });
}function currentDoc(){const value=$('explorer-endpoint')?.value;if(value==='')return null;const index=Number(value);return Number.isInteger(index)?apiDocs[index]:null}
function updateExplorer(){const doc=currentDoc();if(!doc)return;$('explorer-description').textContent=`${doc.method} ${doc.path} · ${doc.description}`;$('explorer-params').value=JSON.stringify(doc.params||{},null,2);$('explorer-body').value=doc.body?JSON.stringify(doc.body,null,2):'';$('explorer-body').disabled=doc.method==='GET';$('explorer-meta').textContent=doc.method==='GET'?'Gửi query parameters trên URL.':'Request body gửi dưới dạng JSON.'}
function selectDoc(index){$('explorer-endpoint').value=String(index);updateExplorer();location.hash='#api-explorer';$('explorer-endpoint').focus({preventScroll:true})}
function renderDocs(){const categories=['all',...new Set(apiDocs.map(item=>item.category))];$('docs-sidebar').innerHTML=categories.map(category=>`<button type="button" class="docs-filter ${category===activeDocCategory?'active':''}" data-category="${esc(category)}">${esc(category==='all'?'Tất cả':category)}</button>`).join('');const visible=activeDocCategory==='all'?apiDocs:apiDocs.filter(item=>item.category===activeDocCategory);$('docs-list').innerHTML=visible.map(doc=>{const index=apiDocs.indexOf(doc);const query=doc.params&&Object.keys(doc.params).length?`?${new URLSearchParams(Object.entries(doc.params).map(([key,value])=>[key,String(value)]))}`:'';const request=`${doc.method} ${doc.path}${query}`;return `<article class="doc-item"><div class="doc-title"><span class="method-badge ${doc.method.toLowerCase()}">${esc(doc.method)}</span><code>${esc(doc.path)}</code><button type="button" class="copy-doc" data-copy="${esc(request)}">Sao chép</button></div><span class="category-tag">${esc(doc.category)}</span><p>${esc(doc.description)}</p>${doc.params?`<pre>${esc(JSON.stringify(doc.params,null,2))}</pre>`:''}${doc.body?`<pre>${esc(JSON.stringify(doc.body,null,2))}</pre>`:''}<button type="button" class="try-doc" data-index="${index}">Mở trong Explorer</button></article>`}).join('')||'<p>Danh mục này chưa có endpoint.</p>'}
async function loadDocs(){const select=$('explorer-endpoint');try{const shared=window.xiaozhiApiDocs;if(Array.isArray(shared)&&shared.length)apiDocs=shared;else{const detail=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('API catalog timed out')),11000);window.addEventListener('xiaozhi-api-docs-ready',event=>{clearTimeout(timer);resolve(event.detail||{})},{once:true})});if(detail.error)throw new Error(detail.error);apiDocs=detail.endpoints||[]}if(!apiDocs.length)throw new Error('Máy chủ chưa trả danh sách endpoint');select.innerHTML=apiDocs.map((doc,index)=>`<option value="${index}">${esc(doc.method)} ${esc(doc.path)}</option>`).join('');renderDocs();updateExplorer()}catch(error){const message=`Không tải được danh sách API: ${error.message}`;$('docs-list').textContent=message;select.innerHTML=`<option value="">${esc(message)}</option>`;$('explorer-description').textContent=message;$('explorer-meta').textContent='Kiểm tra kết nối tới máy chủ rồi tải lại trang.'}}
async function runExplorer(event){event.preventDefault();const doc=currentDoc(),output=$('explorer-result');if(!doc){output.textContent='Hãy chọn endpoint trước.';return}let params={},body={};try{params=JSON.parse($('explorer-params').value||'{}');if(!params||Array.isArray(params)||typeof params!=='object')throw new Error('Query parameters phải là JSON object');if(doc.method!=='GET'&&$('explorer-body').value.trim()){body=JSON.parse($('explorer-body').value);if(!body||Array.isArray(body)||typeof body!=='object')throw new Error('Request body phải là JSON object')}}catch(error){output.textContent=`JSON không hợp lệ: ${error.message}`;return}if(doc.method!=='GET'&&!confirm('Request '+doc.method+' may create or change data. Continue?'))return;const url=new URL(doc.path,location.origin);if(doc.method==='GET')for(const [key,value]of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,Array.isArray(value)?value.join(','):String(value));$('explorer-meta').textContent=`Đang gửi ${doc.method} ${url.pathname}${url.search}`;output.textContent='Đang chờ response...';try{const options={method:doc.method,headers:{}};if(doc.method!=='GET'){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}if(doc.responseType==='audio'){output.innerHTML='<audio controls preload="none" src="'+url.pathname+url.search+'"></audio>';$("explorer-meta").textContent='Audio stream';return}const {data,response}=await fetchJson(url.pathname+url.search,options);output.textContent=JSON.stringify(data,null,2);$('explorer-meta').textContent=`HTTP ${response.status} · ${doc.method} ${url.pathname}${url.search}`}catch(error){output.textContent=error.message;$('explorer-meta').textContent='Request thất bại'}}
function formatUptime(seconds){const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);return days?`${days} ngày ${hours} giờ`:`${hours} giờ ${minutes} phút`}
function drawGrowthChart(timeline=[]){const chart=$('request-growth-chart');if(!chart)return;const rows=timeline.slice(-168).map(item=>({time:new Date(item.time),total:Math.max(0,Number(item.total)||0),errors:Math.max(0,Number(item.errors)||0)}));if(!rows.length){chart.textContent='Ch\u01b0a c\u00f3 request trong kho\u1ea3ng th\u1eddi gian n\u00e0y.';return}const width=900,height=260,left=48,right=14,top=18,bottom=38,plotWidth=width-left-right,plotHeight=height-top-bottom,max=Math.max(1,...rows.map(row=>row.total)),slot=plotWidth/Math.max(1,rows.length-1);const coords=key=>rows.map((row,index)=>({x:left+index*slot,y:top+plotHeight-(row[key]/max)*plotHeight}));const curve=pts=>pts.map((point,index)=>index===0?'M '+point.x+' '+point.y:' L '+point.x+' '+point.y).join('');const totalPoints=coords('total'),errorPoints=coords('errors'),base=top+plotHeight;const totalPath=curve(totalPoints),errorPath=curve(errorPoints),areaPath=totalPath+' L '+totalPoints[totalPoints.length-1].x+' '+base+' L '+totalPoints[0].x+' '+base+' Z';let grid='';for(let i=0;i<=4;i++){const value=Math.round(max*(4-i)/4),y=top+plotHeight*i/4;grid+='<line x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'" class="chart-grid-line"/><text x="'+(left-9)+'" y="'+(y+4)+'" text-anchor="end" class="chart-axis-label">'+value+'</text>'}let labels='';for(let day=0;day<7;day++){const index=Math.min(rows.length-1,Math.round(day*(rows.length-1)/6)),point=totalPoints[index],label=rows[index].time.toLocaleDateString('vi-VN',{day:'2-digit',month:'short'});labels+='<text x="'+point.x+'" y="'+(height-8)+'" text-anchor="middle" class="chart-axis-label">'+label+'</text>'}const total=rows.reduce((sum,row)=>sum+row.total,0),peak=Math.max(...rows.map(row=>row.total));chart.innerHTML='<svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" aria-label="'+total+' requests over seven days"><defs><linearGradient id="request-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#9a5cff" stop-opacity=".38"/><stop offset="100%" stop-color="#9a5cff" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+areaPath+'" fill="url(#request-area)"/><path d="'+totalPath+'" class="chart-total-line"/><path d="'+errorPath+'" class="chart-error-line"/>'+totalPoints.filter((_,i)=>i%24===0||i===rows.length-1).map(point=>'<circle cx="'+point.x+'" cy="'+point.y+'" r="3.5" class="chart-total-point"/>').join('')+labels+'</svg>';const label=$('chart-period');if(label)label.textContent='7 ng\u00e0y qua · '+total+' requests · cao nh\u1ea5t '+peak+'/gi\u1edd'}
async function loadAdmin(){
 const status=$('service-status');if(!status)return;
 try{
  const [health,service,metrics,config]=await Promise.all([fetchJson('/api/health'),fetchJson('/api/status'),fetchJson('/api/admin/metrics'),fetchJson('/api/admin/config')]);
  const h=health.data,s=service.data,m=metrics.data,c=config.data;
  $('rail-uptime').textContent=formatUptime(s.uptime_seconds||0);$('rail-requests').textContent=m.total_requests??0;$('rail-errors').textContent=m.error_requests??0;
  $('metric-total').textContent=m.total_requests??0;$('metric-errors').textContent=m.error_requests??0;$('metric-uptime').textContent=formatUptime(s.uptime_seconds||0);drawGrowthChart(m.timeline||[]);
  const apiOk=Boolean(h.ok),dbOk=h.database==='connected',indicator=$('service-indicator');
  indicator.textContent=apiOk?(dbOk?'API + database hoạt động':'API hoạt động · database gián đoạn'):'API gặp lỗi';
  indicator.classList.toggle('bad',!apiOk||!dbOk);
  status.innerHTML='<div class="status-row"><span>API</span><b class="'+(apiOk?'ok':'bad')+'">'+(apiOk?'Hoạt động':'Lỗi')+'</b></div><div class="status-row"><span>PostgreSQL</span><b class="'+(dbOk?'ok':'bad')+'">'+(dbOk?'Hoạt động':'Không kết nối')+'</b></div><div class="status-row"><span>FFmpeg</span><b class="'+(s.ffmpeg_available?'ok':'bad')+'">'+(s.ffmpeg_available?'Sẵn sàng':'Không có')+'</b></div><div class="status-row"><span>yt-dlp</span><b class="'+(s.youtube_dl_available?'ok':'bad')+'">'+(s.youtube_dl_available?'Sẵn sàng':'Không có')+'</b></div><div class="status-row"><span>Nền tảng</span><b>'+esc(s.platform||'?')+'</b></div>';
  const configElement=$('config-status');configElement.innerHTML=(c.items||[]).map(item=>'<div class="status-row"><span>'+esc(item.name)+'</span><b class="'+(item.configured?'ok':'bad')+'">'+(item.configured?'Đã cấu hình':'Chưa cấu hình')+'</b></div>').join('');
  $('popular-endpoints').innerHTML=(m.endpoints||[]).slice(0,6).map(item=>'<div class="status-row"><code>'+esc(item.endpoint)+'</code><b>'+item.total+'</b></div>').join('')||'Chưa có request';
  $('request-history').innerHTML=(m.recent||[]).map(item=>'<tr><td>'+esc(new Date(item.time).toLocaleTimeString('vi-VN'))+'</td><td><span class="method-badge '+esc(item.method.toLowerCase())+'">'+esc(item.method)+'</span></td><td><code>'+esc(item.path)+'</code></td><td><span class="status-code '+(item.status>=400?'bad':'ok')+'">'+item.status+'</span></td><td>'+item.duration_ms+' ms</td></tr>').join('')||'<tr><td colspan="5">Chưa ghi nhận request.</td></tr>';
 }catch(error){status.textContent='Không tải được trạng thái: '+error.message}
}
if($('admin-refresh')){$('admin-refresh').addEventListener('click',loadAdmin);loadAdmin();window.setInterval(loadAdmin,30000)}
if($('feature-list')&&typeof renderSuggestions==='function')renderSuggestions();if($('explorer-endpoint')){window.apiDocsReady=loadDocs();$('explorer-endpoint').addEventListener('change',updateExplorer);$('explorer-form').addEventListener('submit',runExplorer);$('docs-sidebar').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;activeDocCategory=button.dataset.category;renderDocs()});$('docs-list').addEventListener('click',event=>{const button=event.target.closest('[data-index]');if(button)selectDoc(button.dataset.index)});}
