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
async function derivePassword(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:150000,hash:'SHA-256'},key,256);return b64(bits)}
async function verifyPassword(password,env){const hash=await getSetting(env.DB,'admin_password_hash');if(hash){const salt=await getSetting(env.DB,'admin_password_salt');return !!salt&&await derivePassword(password,salt)===hash}return String(password)===String(env.ADMIN_PASSWORD||'')}
function safeUrl(raw){try{let u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1','0.0.0.0','::1'].includes(u.hostname.toLowerCase())?u.href:null}catch{return null}}
async function authorized(req,env){return validToken(req,env.SESSION_SECRET,env.DB)}
async function checkSite(site){let started=Date.now();try{let url=safeUrl(site.url);if(!url)return {status:'down',http_status:0,checked_at:now(),response_ms:0};let r=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(9000),headers:{'user-agent':'DemoShowcase-Monitor/1.0'}});return {status:r.status>=200&&r.status<400?'up':'down',http_status:r.status,checked_at:now(),response_ms:Date.now()-started}}catch{return {status:'down',http_status:0,checked_at:now(),response_ms:Date.now()-started}}}
async function runChecks(env,ids=null){let rows=ids?.length?await Promise.all(ids.map(id=>env.DB.prepare('SELECT id,url FROM sites WHERE id=?').bind(id).first())): (await env.DB.prepare('SELECT id,url FROM sites ORDER BY id').all()).results;let count=0;for(let i=0;i<rows.length;i+=8){await Promise.all(rows.slice(i,i+8).filter(Boolean).map(async s=>{let c=await checkSite(s);await env.DB.prepare('UPDATE sites SET status=?,http_status=?,last_checked=?,response_ms=? WHERE id=?').bind(c.status,c.http_status,c.checked_at,c.response_ms,s.id).run();count++}))}return count}
function validSite(x){let url=safeUrl(x.url);if(!url||!String(x.name||'').trim())return null;let source=x.source_url?safeUrl(x.source_url):null;let cover=x.cover?safeUrl(x.cover):null;return {name:String(x.name).trim().slice(0,120),url,category:String(x.category||'其他').slice(0,50),cover,description:String(x.description||'').slice(0,2000),features:String(x.features||'').slice(0,2000),demo_user:String(x.demo_user||'').slice(0,200),demo_password:String(x.demo_password||'').slice(0,200),source_url:source}}
export default {
 async fetch(req,env){
  const u=new URL(req.url),p=u.pathname;
  if(p.startsWith('/api/')){
   if(req.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':u.origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type'}});
   try{
    if(p==='/api/login'&&req.method==='POST'){let body=await req.json();if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return reply({error:'管理员密码或 SESSION_SECRET 尚未配置'},503);if(!await verifyPassword(String(body.password||''),env))return reply({error:'密码错误'},401);let version=await getSetting(env.DB,'session_version')||'0';let token=await makeToken(env.SESSION_SECRET,version);return new Response(JSON.stringify({ok:true}),{headers:{...JSON_HEADERS,'set-cookie':`demo_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`}})}
    if(p==='/api/logout'&&req.method==='POST')return new Response('{"ok":true}',{headers:{...JSON_HEADERS,'set-cookie':'demo_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}});
    if(p==='/api/auth/me'&&req.method==='GET'){if(!await authorized(req,env))return reply({error:'未登录'},401);return reply({ok:true,authenticated:true})}
    if(p==='/api/sites'&&req.method==='GET'){let rows=(await env.DB.prepare('SELECT * FROM sites ORDER BY CASE status WHEN "up" THEN 0 ELSE 1 END, name COLLATE NOCASE').all()).results;return reply({sites:rows})}
    if(p==='/api/settings'&&req.method==='GET'){let rows=(await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ("page_size","contact_wechat","contact_qq","contact_email")').all()).results;let values=Object.fromEntries(rows.map(x=>[x.key,x.value]));return reply({page_size:Number(values.page_size||24),contact_wechat:values.contact_wechat||'',contact_qq:values.contact_qq||'',contact_email:values.contact_email||''})}
    if(!await authorized(req,env))return reply({error:'请先登录管理后台'},401);
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
    if(p==='/api/sites'&&req.method==='POST'){let b=await req.json(),s=validSite(b);if(!s)return reply({error:'站点名称或网址无效'},400);let r=await env.DB.prepare('INSERT INTO sites(name,url,category,cover,description,features,demo_user,demo_password,source_url,status) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(s.name,s.url,s.category,s.cover,s.description,s.features,s.demo_user,s.demo_password,s.source_url,'unknown').run();return reply({ok:true,id:r.meta.last_row_id},201)}
    let m=p.match(/^\/api\/sites\/(\d+)$/);if(m&&req.method==='PUT'){let s=validSite(await req.json());if(!s)return reply({error:'站点名称或网址无效'},400);await env.DB.prepare('UPDATE sites SET name=?,url=?,category=?,cover=?,description=?,features=?,demo_user=?,demo_password=?,source_url=? WHERE id=?').bind(s.name,s.url,s.category,s.cover,s.description,s.features,s.demo_user,s.demo_password,s.source_url,Number(m[1])).run();return reply({ok:true})}
    if(m&&req.method==='DELETE'){await env.DB.prepare('DELETE FROM sites WHERE id=?').bind(Number(m[1])).run();return reply({ok:true})}
    if(p==='/api/check'&&req.method==='POST'){let b=await req.json().catch(()=>({}));let n=await runChecks(env,Array.isArray(b.ids)?b.ids.map(Number):null);return reply({ok:true,checked:n})}
    if(p==='/api/import'&&req.method==='POST'){let b=await req.json();if(!Array.isArray(b.sites)||b.sites.length>1000)return reply({error:'导入格式错误或超过1000条'},400);let count=0;for(let item of b.sites){let s=validSite(item);if(!s)continue;await env.DB.prepare('INSERT INTO sites(name,url,category,cover,description,features,demo_user,demo_password,source_url,status) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(s.name,s.url,s.category,s.cover,s.description,s.features,s.demo_user,s.demo_password,s.source_url,'unknown').run();count++}return reply({ok:true,imported:count})}
    if(p==='/api/export'&&req.method==='GET'){let rows=(await env.DB.prepare('SELECT name,url,category,cover,description,features,demo_user,demo_password,source_url,status,last_checked FROM sites ORDER BY id').all()).results;return reply({sites:rows})}
    if(p==='/api/settings'&&(req.method==='GET'||req.method==='PUT')){if(req.method==='GET'){let rows=(await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ("page_size","contact_wechat","contact_qq","contact_email")').all()).results;let values=Object.fromEntries(rows.map(x=>[x.key,x.value]));return reply({page_size:Number(values.page_size||24),contact_wechat:values.contact_wechat||'',contact_qq:values.contact_qq||'',contact_email:values.contact_email||''})}let b=await req.json();if(b.page_size!==undefined){let n=Math.max(6,Math.min(100,Number(b.page_size)||24));await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES("page_size",?)').bind(String(n)).run()}for(let key of ['contact_wechat','contact_qq','contact_email']){if(b[key]!==undefined){let value=String(b[key]||'').trim().slice(0,200);await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(key,value).run()}}let rows=(await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ("page_size","contact_wechat","contact_qq","contact_email")').all()).results;let values=Object.fromEntries(rows.map(x=>[x.key,x.value]));return reply({page_size:Number(values.page_size||24),contact_wechat:values.contact_wechat||'',contact_qq:values.contact_qq||'',contact_email:values.contact_email||''})}
    return reply({error:'接口不存在'},404)
   }catch(e){console.error('API error',p,e);return reply({error:'服务器处理失败，请检查 D1 settings 表结构或 Worker 日志'},500)}
  }
  return env.ASSETS.fetch(req);
 },
 async scheduled(controller,env){await runChecks(env)}
};