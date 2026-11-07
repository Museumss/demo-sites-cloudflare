const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const now=()=>new Date().toISOString();
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
async function makeToken(secret,version='0'){const payload=b64(new TextEncoder().encode(JSON.stringify({exp:Date.now()+8*60*60*1000,ver:String(version),nonce:crypto.randomUUID()})));return payload+'.'+await sign(payload,secret)}
async function getSetting(db,key){const row=await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();return row?.value??''}
async function putSetting(db,key,value){
 const updated=await db.prepare('UPDATE settings SET value=? WHERE key=?').bind(String(value),key).run();
 if(!(updated.meta?.changes>0)){
  await db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind(key,String(value)).run();
 }
}
async function validToken(req,secret,db){let c=req.headers.get('Cookie')||'',m=c.match(/(?:^|;\\s*)demo_session=([^;]+)/);if(!m)return false;let [p,s]=m[1].split('.');if(!p||!s||!secret)return false;let expected=await sign(p,secret);if(expected.length!==s.length)return false;let a=0;for(let i=0;i<s.length;i++)a|=s.charCodeAt(i)^expected.charCodeAt(i);if(a)return false;try{const payload=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));const version=await getSetting(db,'session_version')||'0';return payload.exp>Date.now()&&String(payload.ver??'0')===String(version)}catch{return false}}
async function derivePassword(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);return b64(bits)}
async function verifyPassword(password,env){const hash=await getSetting(env.DB,'admin_password_hash');if(hash){const salt=await getSetting(env.DB,'admin_password_salt');return !!salt&&await derivePassword(password,salt)===hash}return String(password)===String(env.ADMIN_PASSWORD||'')}
function safeUrl(raw){try{let u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1','0.0.0.0','::1'].includes(u.hostname.toLowerCase())?u.href:null}catch{return null}}
async function authorized(req,env){return validToken(req,env.SESSION_SECRET,env.DB)}
async function checkSite(site){let started=Date.now();try{let url=safeUrl(site.url);if(!url)return {status:'down',http_status:0,checked_at:now(),response_ms:0};let r=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'user-agent':'DemoShowcase-Monitor/1.0'}});return {status:r.status>=200&&r.status<400?'up':'down',http_status:r.status,checked_at:now(),response_ms:Date.now()-started}}catch{return {status:'down',http_status:0,checked_at:now(),response_ms:Date.now()-started}}}
async function runChecks(env,ids=null){let rows=ids?.length?await Promise.all(ids.map(id=>env.DB.prepare('SELECT id,url FROM sites WHERE id=?').bind(id).first())): (await env.DB.prepare('SELECT id,url FROM sites ORDER BY id').all()).results;let count=0;for(let i=0;i<rows.length;i+=8){await Promise.all(rows.slice(i,i+8).filter(Boolean).map(async s=>{let c=await checkSite(s);await env.DB.prepare('UPDATE sites SET status=?,http_status=?,last_checked=?,response_ms=? WHERE id=?').bind(c.status,c.http_status,c.checked_at,c.response_ms,s.id).run();count++}))}return count}
function validSite(x){let url=safeUrl(x.url);if(!url||!String(x.name||'').trim())return null;let source=x.source_url?safeUrl(x.source_url):null;let cover=x.cover?safeUrl(x.cover):null;return {name:String(x.name).trim().slice(0,120),url,category:String(x.category||'其他').slice(0,50),cover,description:String(x.description||'').slice(0,2000),features:String(x.features||'').slice(0,2000),demo_user:String(x.demo_user||'').slice(0,200),demo_password:String(x.demo_password||'').slice(0,200),source_url:source,video_url:x.video_url?safeUrl(x.video_url):null,source_price:Math.max(0,Math.min(99999999,Math.round(Number(x.source_price||0)*100)))}}


async function ensurePaySchema(db){
 for(const sql of [
  "ALTER TABLE sites ADD COLUMN video_url TEXT",
  "ALTER TABLE sites ADD COLUMN source_price INTEGER NOT NULL DEFAULT 0"
 ]){try{await db.prepare(sql).run()}catch(e){if(!/duplicate column/i.test(String(e)))throw e}}
 await db.prepare(`CREATE TABLE IF NOT EXISTS pay_orders(
  order_no TEXT PRIMARY KEY, site_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', token_hash TEXT NOT NULL, alipay_trade_no TEXT,
  created_at TEXT NOT NULL, paid_at TEXT
 )`).run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_pay_orders_site ON pay_orders(site_id)").run();
}
const bytesToB64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const b64ToBytes=s=>Uint8Array.from(atob(String(s).replace(/\s/g,'')),c=>c.charCodeAt(0));
const pemBytes=s=>b64ToBytes(String(s).replace(/-----[^-]+-----/g,'').replace(/\s/g,''));
function derLen(n){if(n<128)return Uint8Array.of(n);let a=[];while(n){a.unshift(n&255);n>>=8}return Uint8Array.of(0x80|a.length,...a)}
function concatBytes(...parts){let n=parts.reduce((x,a)=>x+a.length,0),o=new Uint8Array(n),i=0;for(const a of parts){o.set(a,i);i+=a.length}return o}
function alipayPublicDer(raw){const b=pemBytes(raw);if(String(raw).includes('BEGIN PUBLIC KEY'))return b;const alg=Uint8Array.from([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]);const bit=concatBytes(Uint8Array.of(0x03),derLen(b.length+1),Uint8Array.of(0),b);const seq=concatBytes(alg,bit);return concatBytes(Uint8Array.of(0x30),derLen(seq.length),seq)}
function formEncode(obj){return Object.keys(obj).sort().map(k=>`${k}=${obj[k]}`).join('&')}
async function alipaySign(params,privatePem){
 const key=await crypto.subtle.importKey('pkcs8',pemBytes(privatePem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 return bytesToB64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(formEncode(params))));
}
async function verifyAlipay(params,publicPem){
 const sig=params.sign;if(!sig)return false;const clean={};for(const [k,v] of Object.entries(params))if(k!=='sign'&&k!=='sign_type'&&v!==''&&v!=null)clean[k]=v;
 const key=await crypto.subtle.importKey('spki',alipayPublicDer(publicPem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64ToBytes(sig),new TextEncoder().encode(formEncode(clean)));
}
async function sha256hex(v){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function createAlipayOrder(env,origin,siteId){
 const site=await env.DB.prepare('SELECT id,name,source_price FROM sites WHERE id=?').bind(siteId).first();
 if(!site||!site.source_url||!Number(site.source_price)||Number(site.source_price)<1)throw new Error('该站点尚未填写源码地址或设置有效售价');
 const appId=(await getSetting(env.DB,'alipay_app_id'))||env.ALIPAY_APP_ID||'';const enabled=(await getSetting(env.DB,'alipay_enabled'))!=='0';if(!enabled)throw new Error('支付宝当面付暂未启用');if(!appId||!env.ALIPAY_PRIVATE_KEY||!env.ALIPAY_PUBLIC_KEY)throw new Error('支付宝配置尚未完成，请检查后台 AppID 和 Cloudflare 加密变量');
 const orderNo='DS'+Date.now()+crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase();
 const accessToken=bytesToB64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 const tokenHash=await sha256hex(accessToken),amount=(Number(site.source_price)/100).toFixed(2);
 await env.DB.prepare("INSERT INTO pay_orders(order_no,site_id,amount_cents,status,token_hash,created_at) VALUES(?,?,?,'pending',?,?)").bind(orderNo,siteId,Number(site.source_price),tokenHash,now()).run();
 const params={app_id:appId,method:'alipay.trade.precreate',format:'JSON',charset:'utf-8',sign_type:'RSA2',timestamp:new Date().toISOString().replace('T',' ').slice(0,19),version:'1.0',notify_url:`${origin}/api/pay/notify`,biz_content:JSON.stringify({out_trade_no:orderNo,total_amount:amount,subject:`源码购买-${String(site.name).slice(0,30)}`,timeout_express:'30m'})};
 params.sign=await alipaySign(params,env.ALIPAY_PRIVATE_KEY);
 const response=await fetch('https://openapi.alipay.com/gateway.do',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=utf-8'},body:new URLSearchParams(params)});
 const data=await response.json(),result=data.alipay_trade_precreate_response;
 if(!response.ok||!result||result.code!=='10000'||!result.qr_code){await env.DB.prepare("UPDATE pay_orders SET status='failed' WHERE order_no=?").bind(orderNo).run();throw new Error(result?.sub_msg||result?.msg||'支付宝创建订单失败')}
 return {order_no:orderNo,access_token:accessToken,qr_code:result.qr_code,amount}
}
async function alipayNotify(req,env){
 const raw=await req.text(),form=new URLSearchParams(raw),params=Object.fromEntries(form.entries());
 if(!env.ALIPAY_PUBLIC_KEY||!await verifyAlipay(params,env.ALIPAY_PUBLIC_KEY))return new Response('failure');
 if(!['TRADE_SUCCESS','TRADE_FINISHED'].includes(params.trade_status))return new Response('success');
 const order=await env.DB.prepare('SELECT * FROM pay_orders WHERE order_no=?').bind(params.out_trade_no||'').first();
 if(!order)return new Response('failure');
 const paid=Math.round(Number(params.total_amount)*100);
 if(paid!==Number(order.amount_cents))return new Response('failure');
 if(order.status!=='paid')await env.DB.prepare("UPDATE pay_orders SET status='paid',alipay_trade_no=?,paid_at=? WHERE order_no=? AND status='pending'").bind(String(params.trade_no||''),now(),order.order_no).run();
 return new Response('success');
}

const htmlEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slugify=v=>String(v||'').trim().toLowerCase().replace(/[\s_]+/g,'-').replace(/[^\p{L}\p{N}-]/gu,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,100);
async function readArticles(db){try{const v=await getSetting(db,'articles_json');const a=JSON.parse(v||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function articleHtml(article,origin){
 const title=htmlEscape(article.seo_title||article.title),desc=htmlEscape(article.seo_description||article.summary||article.title);
 const body=String(article.content||'').split(/\n{2,}/).map(p=>`<p>${htmlEscape(p).replace(/\n/g,'<br>')}</p>`).join('');
 const canonical=htmlEscape(article.canonical||`${origin}/article/${encodeURIComponent(article.slug)}`);
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><meta name="keywords" content="${htmlEscape(article.seo_keywords||'')}"><link rel="canonical" href="${canonical}"><meta name="robots" content="index,follow"><link rel="stylesheet" href="/style.css"></head><body><header class="topbar"><a class="brand" href="/"><span class="brand-mark">⬡</span><span>演示站合集</span></a><nav class="nav"><a href="/">首页</a><a href="/about">关于我们</a><a href="/contact">联系我们</a></nav></header><main class="admin-wrap"><article class="panel article-page"><p class="muted">演示站合集 · 文章</p><h1>${htmlEscape(article.title)}</h1>${article.cover?`<img src="${htmlEscape(article.cover)}" alt="${htmlEscape(article.title)}" style="max-width:100%;border-radius:12px">`:''}<div class="article-content">${body}</div><p><a href="/">← 返回首页</a></p></article></main><footer class="footer">© ${new Date().getFullYear()} 演示站合集</footer></body></html>`;
}
function infoPage(path,origin){
 const pages={
 '/contact':['联系我们','我们专注于 WordPress 网站建设及各类网站搭建服务，涵盖公司企业网站、发卡网、个人主页、博客网站、导航网站、影视网站、商城网站等。同时提供支付收款对接、网站安全优化、网站加速、网站排名 SEO 等相关服务。欢迎来咨询交流！','联系方式<br>微信：quanqiu09<br>QQ：1948267220<br>邮箱：xqdj.site@qq.com<br><br>网站搭建交流群<br>一群：861661915<br>二群：237644861'],
 '/privacy':['隐私政策','我们重视访客隐私。本网站提供演示站点导航与信息展示服务。访问公开页面时，服务器可能处理保障网站运行所需的基础请求信息。管理后台使用必要的会话 Cookie 维持管理员登录状态。','站点资料及后台设置存储于运营者配置的 Cloudflare D1 数据库。请勿在公开演示信息中填写真实密码、身份证件或其他敏感个人信息。我们不会要求访客提交与浏览服务无关的敏感资料。'],
 '/disclaimer':['免责声明','本站收录的第三方演示站仅用于技术演示、学习与交流。第三方网站的内容、服务、账号权限、可用性及安全性均由其运营者负责。','访问第三方网站前，请自行判断其安全性与适用性。本站不对第三方网站内容作出保证，也不承担因访问、使用或分享第三方网站而产生的损失或争议。若发现不准确或不适宜的信息，请联系我们处理。'],
 '/terms':['使用条款','访问和使用演示站合集，即表示你理解并同意遵守本页面所述条款。本站内容仅供信息参考、技术演示与学习交流，不构成任何商业、投资或专业建议。','请勿利用本站从事违法活动、攻击第三方服务、侵犯他人知识产权或干扰网站正常运行。本站有权在必要时调整页面内容、收录项目或暂停相关服务。'],
 };
 const item=pages[path];if(!item)return null;
 const desc=htmlEscape(item[1].slice(0,150));
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${item[0]}｜演示站合集</title><meta name="description" content="${desc}"><link rel="canonical" href="${origin}${path}"><meta name="robots" content="index,follow"><link rel="stylesheet" href="/style.css"></head><body><header class="topbar"><a class="brand" href="/"><span class="brand-mark">⬡</span><span>演示站合集</span></a><nav class="nav"><a href="/">首页</a><a href="/about">关于我们</a><a href="/contact">联系我们</a></nav></header><main class="admin-wrap"><article class="panel article-page"><p class="eyebrow">DEMO SITES COLLECTION</p><h1>${item[0]}</h1><p>${item[1]}</p><p>${item[2]??''}</p><p>${item[3]??''}</p><p><a href="/">← 返回首页</a></p></article></main><footer class="footer">© ${new Date().getFullYear()} 演示站合集</footer></body></html>`;
}

export default {
 async fetch(req,env){
  const u=new URL(req.url),p=u.pathname;
  if(p.startsWith('/api/')){
   if(req.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':u.origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type'}});
   try{
    await ensurePaySchema(env.DB);
    if(p==='/api/pay/notify'&&req.method==='POST')return await alipayNotify(req,env);
    if(p==='/api/pay/create'&&req.method==='POST'){const b=await req.json();const result=await createAlipayOrder(env,u.origin,Number(b.site_id));return reply(result,201)}
    if(p==='/api/pay/status'&&req.method==='POST'){const b=await req.json(),token=String(b.access_token||''),hash=await sha256hex(token);const order=await env.DB.prepare('SELECT o.order_no,o.status,o.amount_cents,s.source_url,s.video_url FROM pay_orders o JOIN sites s ON s.id=o.site_id WHERE o.order_no=? AND o.token_hash=?').bind(String(b.order_no||''),hash).first();if(!order)return reply({error:'订单不存在或凭证无效'},404);if(order.status!=='paid')return reply({status:order.status,paid:false});return reply({status:'paid',paid:true,source_url:order.source_url,video_url:order.video_url,amount:(Number(order.amount_cents)/100).toFixed(2)})}
    if(p==='/api/articles'&&req.method==='GET'){const allArticles=await readArticles(env.DB);const articles=(await authorized(req,env)?allArticles:allArticles.filter(a=>a.status==='published')).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));return reply({articles:await authorized(req,env)?articles:articles.map(({content,...a})=>a)})}
    if(p==='/api/login'&&req.method==='POST'){let body=await req.json();if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return reply({error:'管理员密码或 SESSION_SECRET 尚未配置'},503);if(!await verifyPassword(String(body.password||''),env))return reply({error:'密码错误'},401);let version=await getSetting(env.DB,'session_version')||'0';let token=await makeToken(env.SESSION_SECRET,version);return new Response(JSON.stringify({ok:true}),{headers:{...JSON_HEADERS,'set-cookie':`demo_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`}})}
    if(p==='/api/logout'&&req.method==='POST')return new Response('{"ok":true}',{headers:{...JSON_HEADERS,'set-cookie':'demo_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}});
    if(p==='/api/auth/me'&&req.method==='GET'){if(!await authorized(req,env))return reply({error:'未登录'},401);return reply({ok:true,authenticated:true})}
    if(p==='/api/stats'&&req.method==='GET'){const total=Number(await getSetting(env.DB,'total_visits')||0);return reply({total_visits:total})}
    if(p==='/api/visit'&&req.method==='POST'){await env.DB.prepare("INSERT INTO settings(key,value) VALUES('total_visits','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)").run();const total=Number(await getSetting(env.DB,'total_visits')||0);return reply({ok:true,total_visits:total})}
    let viewMatch=p.match(/^\/api\/sites\/(\d+)\/view$/);if(viewMatch&&req.method==='POST'){const id=Number(viewMatch[1]);const exists=await env.DB.prepare('SELECT id FROM sites WHERE id=?').bind(id).first();if(!exists)return reply({error:'站点不存在'},404);await env.DB.prepare('INSERT INTO site_views(site_id,views) VALUES(?,1) ON CONFLICT(site_id) DO UPDATE SET views=views+1').bind(id).run();const row=await env.DB.prepare('SELECT views FROM site_views WHERE site_id=?').bind(id).first();return reply({ok:true,view_count:Number(row?.views||0)})}
    if(p==='/api/sites'&&req.method==='GET'){let rows=(await env.DB.prepare('SELECT sites.*,COALESCE(site_views.views,0) AS view_count FROM sites LEFT JOIN site_views ON site_views.site_id=sites.id ORDER BY CASE sites.status WHEN "up" THEN 0 ELSE 1 END, sites.name COLLATE NOCASE').all()).results;if(!await authorized(req,env))rows=rows.map(({source_url,video_url,...x})=>x);return reply({sites:rows})}
    if(p==='/api/settings'&&req.method==='GET'){let rows=(await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ("page_size","contact_wechat","contact_qq","contact_email")').all()).results;let values=Object.fromEntries(rows.map(x=>[x.key,x.value]));return reply({page_size:Number(values.page_size||24),contact_wechat:values.contact_wechat||'',contact_qq:values.contact_qq||'',contact_email:values.contact_email||''})}
    if(!await authorized(req,env))return reply({error:'请先登录管理后台'},401);
    if(p==='/api/articles'&&req.method==='GET'){return reply({articles:await readArticles(env.DB)})}
    if(p==='/api/articles'&&req.method==='POST'){const b=await req.json();const title=String(b.title||'').trim();const slug=slugify(b.slug||title);if(!title||!slug)return reply({error:'标题和网址别名不能为空'},400);const articles=await readArticles(env.DB);if(articles.some(a=>a.slug===slug))return reply({error:'网址别名已存在'},409);const a={id:crypto.randomUUID(),title,slug,summary:String(b.summary||'').slice(0,500),content:String(b.content||'').slice(0,50000),cover:safeUrl(b.cover||'')||'',seo_title:String(b.seo_title||'').slice(0,200),seo_description:String(b.seo_description||'').slice(0,500),seo_keywords:String(b.seo_keywords||'').slice(0,500),canonical:String(b.canonical||'').slice(0,500),status:b.status==='published'?'published':'draft',created_at:now(),updated_at:now()};articles.push(a);await putSetting(env.DB,'articles_json',JSON.stringify(articles));return reply({ok:true,article:a},201)}
    let am=p.match(/^\/api\/articles\/([a-f0-9-]+)$/i);if(am&&req.method==='PUT'){const b=await req.json(),articles=await readArticles(env.DB),i=articles.findIndex(a=>a.id===am[1]);if(i<0)return reply({error:'文章不存在'},404);const title=String(b.title||'').trim(),slug=slugify(b.slug||title);if(!title||!slug)return reply({error:'标题和网址别名不能为空'},400);if(articles.some((a,j)=>j!==i&&a.slug===slug))return reply({error:'网址别名已存在'},409);articles[i]={...articles[i],title,slug,summary:String(b.summary||'').slice(0,500),content:String(b.content||'').slice(0,50000),cover:safeUrl(b.cover||'')||'',seo_title:String(b.seo_title||'').slice(0,200),seo_description:String(b.seo_description||'').slice(0,500),seo_keywords:String(b.seo_keywords||'').slice(0,500),canonical:String(b.canonical||'').slice(0,500),status:b.status==='published'?'published':'draft',updated_at:now()};await putSetting(env.DB,'articles_json',JSON.stringify(articles));return reply({ok:true,article:articles[i]})}
    if(am&&req.method==='DELETE'){const articles=(await readArticles(env.DB)).filter(a=>a.id!==am[1]);await putSetting(env.DB,'articles_json',JSON.stringify(articles));return reply({ok:true})}
    if(p==='/api/password'&&req.method==='POST'){
     let b=await req.json();let current=String(b.current_password||''),next=String(b.new_password||'');
     if(next.length<8||next.length>128)return reply({error:'新密码长度须为 8 至 128 位'},400);
     if(current===next)return reply({error:'新密码不能与当前密码相同'},400);
     if(!await verifyPassword(current,env))return reply({error:'当前管理员密码不正确'},401);
     const salt=b64(crypto.getRandomValues(new Uint8Array(16)));
     const hash=await derivePassword(next,salt);
     await putSetting(env.DB,'admin_password_salt',salt);
     await putSetting(env.DB,'admin_password_hash',hash);
     const version=String(Number(await getSetting(env.DB,'session_version')||0)+1);
     await putSetting(env.DB,'session_version',version);
     return new Response(JSON.stringify({ok:true}),{headers:{...JSON_HEADERS,'set-cookie':'demo_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}});
    }
    if(p==='/api/sites'&&req.method==='POST'){let b=await req.json(),s=validSite(b);if(!s)return reply({error:'站点名称或网址无效'},400);let r=await env.DB.prepare('INSERT INTO sites(name,url,category,cover,description,features,demo_user,demo_password,source_url,video_url,source_price,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(s.name,s.url,s.category,s.cover,s.description,s.features,s.demo_user,s.demo_password,s.source_url,s.video_url,s.source_price,'unknown').run();return reply({ok:true,id:r.meta.last_row_id},201)}
    let m=p.match(/^\/api\/sites\/(\d+)$/);if(m&&req.method==='PUT'){let s=validSite(await req.json());if(!s)return reply({error:'站点名称或网址无效'},400);await env.DB.prepare('UPDATE sites SET name=?,url=?,category=?,cover=?,description=?,features=?,demo_user=?,demo_password=?,source_url=?,video_url=?,source_price=? WHERE id=?').bind(s.name,s.url,s.category,s.cover,s.description,s.features,s.demo_user,s.demo_password,s.source_url,s.video_url,s.source_price,Number(m[1])).run();return reply({ok:true})}
    if(m&&req.method==='DELETE'){await env.DB.prepare('DELETE FROM sites WHERE id=?').bind(Number(m[1])).run();return reply({ok:true})}
    if(p==='/api/check'&&req.method==='POST'){let b=await req.json().catch(()=>({}));let n=await runChecks(env,Array.isArray(b.ids)?b.ids.map(Number):null);return reply({ok:true,checked:n})}
    if(p==='/api/import'&&req.method==='POST'){let b=await req.json();if(!Array.isArray(b.sites)||b.sites.length>1000)return reply({error:'导入格式错误或超过1000条'},400);let count=0;for(let item of b.sites){let s=validSite(item);if(!s)continue;await env.DB.prepare('INSERT INTO sites(name,url,category,cover,description,features,demo_user,demo_password,source_url,video_url,source_price,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(s.name,s.url,s.category,s.cover,s.description,s.features,s.demo_user,s.demo_password,s.source_url,s.video_url,s.source_price,'unknown').run();count++}return reply({ok:true,imported:count})}
    if(p==='/api/pay/config'&&req.method==='GET'){const app_id=(await getSetting(env.DB,'alipay_app_id'))||env.ALIPAY_APP_ID||'';const enabled=(await getSetting(env.DB,'alipay_enabled'))!=='0';const ready=!!(enabled&&app_id&&env.ALIPAY_PRIVATE_KEY&&env.ALIPAY_PUBLIC_KEY);return reply({app_id,enabled,ready,configured:ready})}
    if(p==='/api/pay/config'&&req.method==='PUT'){const b=await req.json();const app_id=String(b.app_id||'').trim();if(!/^\d{10,30}$/.test(app_id))return reply({error:'AppID 格式不正确'},400);await putSetting(env.DB,'alipay_app_id',app_id);await putSetting(env.DB,'alipay_enabled',b.enabled?'1':'0');const ready=!!(b.enabled&&env.ALIPAY_PRIVATE_KEY&&env.ALIPAY_PUBLIC_KEY);return reply({ok:true,ready,app_id,enabled:!!b.enabled})}
    if(p==='/api/pay/orders'&&req.method==='GET'){const rows=(await env.DB.prepare('SELECT o.order_no,o.amount_cents,o.status,o.created_at,o.paid_at,o.alipay_trade_no,s.name AS site_name FROM pay_orders o LEFT JOIN sites s ON s.id=o.site_id ORDER BY o.created_at DESC LIMIT 200').all()).results;return reply({orders:rows})}
    if(p==='/api/export'&&req.method==='GET'){let rows=(await env.DB.prepare('SELECT name,url,category,cover,description,features,demo_user,demo_password,source_url,video_url,source_price,status,last_checked FROM sites ORDER BY id').all()).results;return reply({sites:rows})}
    if(p==='/api/settings'&&(req.method==='GET'||req.method==='PUT')){if(req.method==='GET'){let rows=(await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ("page_size","contact_wechat","contact_qq","contact_email")').all()).results;let values=Object.fromEntries(rows.map(x=>[x.key,x.value]));return reply({page_size:Number(values.page_size||24),contact_wechat:values.contact_wechat||'',contact_qq:values.contact_qq||'',contact_email:values.contact_email||''})}let b=await req.json();if(b.page_size!==undefined){let n=Math.max(6,Math.min(100,Number(b.page_size)||24));await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES("page_size",?)').bind(String(n)).run()}for(let key of ['contact_wechat','contact_qq','contact_email']){if(b[key]!==undefined){let value=String(b[key]||'').trim().slice(0,200);await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(key,value).run()}}let rows=(await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ("page_size","contact_wechat","contact_qq","contact_email")').all()).results;let values=Object.fromEntries(rows.map(x=>[x.key,x.value]));return reply({page_size:Number(values.page_size||24),contact_wechat:values.contact_wechat||'',contact_qq:values.contact_qq||'',contact_email:values.contact_email||''})}
    return reply({error:'接口不存在'},404)
   }catch(e){console.error('API error',p,e);return reply({error:'服务器处理失败，请检查 D1 settings 表结构或 Worker 日志'},500)}
  }
  if(req.method==='GET'){
   if(p==='/robots.txt')return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${u.origin}/sitemap.xml\n`,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}});
   if(p==='/sitemap.xml'){const paths=['/','/about','/privacy','/disclaimer','/terms','/contact'];const articles=(await readArticles(env.DB)).filter(a=>a.status==='published');const urls=[...paths.map(x=>`${u.origin}${x}`),...articles.map(a=>`${u.origin}/article/${encodeURIComponent(a.slug)}`)];return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(x=>`<url><loc>${htmlEscape(x)}</loc></url>`).join('')}</urlset>`,{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=3600'}})}
   const page=infoPage(p,u.origin);if(page)return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'}});
   const am=p.match(/^\/article\/(.+)$/);if(am){let requestedSlug='';try{requestedSlug=decodeURIComponent(am[1])}catch{}const article=(await readArticles(env.DB)).find(a=>a.slug===requestedSlug&&a.status==='published');if(article)return new Response(articleHtml(article,u.origin),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'}})}
  }
  return env.ASSETS.fetch(req);
 },
 async scheduled(controller,env){await runChecks(env)}
};
