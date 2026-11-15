const $=s=>document.querySelector(s);let sites=[];
async function api(path,opts={}){const r=await fetch('/api'+path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({error:'服务器响应异常'}));if(!r.ok)throw Error(d.error||'请求失败');return d}
function msg(t){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.append(x);setTimeout(()=>x.remove(),3000)}
function esc(s=''){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function enter(){try{await api('/auth/me');$('#login').classList.add('hidden');$('#admin').classList.remove('hidden');$('#loginError').textContent='';await load()}catch(e){$('#admin').classList.add('hidden');$('#login').classList.remove('hidden');if(e.message!=='未登录'&&!e.message.includes('登录'))$('#loginError').textContent=e.message}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#password').value='';await enter()}catch(x){$('#loginError').textContent=x.message}finally{b.disabled=false}};
async function load(){try{const [siteData,setting]=await Promise.all([api('/sites'),api('/settings')]);sites=siteData.sites||[];$('#summary').textContent=`共 ${sites.length} 个站点 · 正常 ${sites.filter(x=>x.status==='up').length} · 异常 ${sites.filter(x=>x.status==='down').length}`;$('#rows').innerHTML=sites.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td>${s.status==='up'?'正常':s.status==='down'?'异常':'待检测'}</td><td>${Number(s.view_count||0).toLocaleString()}</td><td>${s.last_checked?new Date(s.last_checked).toLocaleString():'—'}</td><td><div class="actions"><button class="btn small" data-edit="${Number(s.id)}">编辑</button><button class="btn small danger" data-del="${Number(s.id)}">删除</button></div></td></tr>`).join('')||'<tr><td colspan="6">暂无站点，点击新增站点开始添加</td></tr>';$('#pageSize').value=String(setting.page_size||24);await loadPages();await loadMedia()}catch(e){msg(e.message);if(e.message.includes('登录'))enter()}}
function editor(s){$('#editor').classList.remove('hidden');$('#editorTitle').textContent=s?'编辑站点':'新增站点';const f=$('#siteForm');f.reset();for(const [k,v] of Object.entries(s||{})){if(f.elements[k])f.elements[k].value=v??''}scrollTo({top:document.body.scrollHeight,behavior:'smooth'})}
$('#add').onclick=()=>editor(null);$('#cancel').onclick=()=>$('#editor').classList.add('hidden');$('#rows').onclick=async e=>{const a=e.target.closest('[data-edit],[data-del]');if(!a)return;const id=Number(a.dataset.edit||a.dataset.del),s=sites.find(x=>Number(x.id)===id);if(a.dataset.edit!==undefined)editor(s);else if(confirm(`确认删除「${s.name}」？`)){try{await api('/sites/'+id,{method:'DELETE'});msg('已删除');await load()}catch(x){msg(x.message)}}};
$('#siteForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target).entries()),id=o.id;delete o.id;try{await api('/sites'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(o)});msg('保存成功');$('#editor').classList.add('hidden');await load()}catch(x){msg(x.message)}};
$('#check').onclick=async()=>{const b=$('#check');b.disabled=true;b.textContent='检测中…';try{const d=await api('/check',{method:'POST',body:'{}'});msg(`检测完成：${d.checked} 个站点`);await load()}catch(e){msg(e.message)}finally{b.disabled=false;b.textContent='一键检测存活'}};
$('#export').onclick=async()=>{try{const d=await api('/export'),blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='demo-sites-backup.json';a.click();URL.revokeObjectURL(a.href)}catch(e){msg(e.message)}};
$('#importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text()),rows=Array.isArray(d)?d:d.sites;if(!Array.isArray(rows))throw Error('JSON中需要包含 sites 数组');const r=await api('/import',{method:'POST',body:JSON.stringify({sites:rows})});msg(`成功导入 ${r.imported} 条`);await load()}catch(x){msg('导入失败：'+x.message)}e.target.value=''};
$('#pageSize').onchange=async e=>{try{await api('/settings',{method:'PUT',body:JSON.stringify({page_size:Number(e.target.value)})});msg('首页分页设置已保存')}catch(x){msg(x.message)}};
const contactForm=$('#contactForm');if(contactForm)contactForm.onsubmit=async e=>{e.preventDefault();const b=e.submitter||contactForm.querySelector('[type=submit]');if(b)b.disabled=true;const data=Object.fromEntries(new FormData(contactForm).entries());try{await api('/settings',{method:'PUT',body:JSON.stringify(data)});msg('联系方式已保存')}catch(x){msg('保存失败：'+x.message)}finally{if(b)b.disabled=false}};
$('#logout').onclick=async()=>{try{await api('/logout',{method:'POST'})}finally{location.reload()}};
enter();

const passwordForm=$('#passwordForm');
if(passwordForm)passwordForm.onsubmit=async e=>{
 e.preventDefault();
 const f=passwordForm, b=e.submitter||f.querySelector('[type=submit]');
 const current_password=f.elements.current_password.value;
 const new_password=f.elements.new_password.value;
 if(new_password.length<8){msg('新密码至少需要 8 位');return}
 if(b){b.disabled=true;b.textContent='正在修改…'}
 try{
  await api('/password',{method:'POST',body:JSON.stringify({current_password,new_password})});
  f.reset();msg('管理员密码已修改，请使用新密码重新登录');
  await api('/logout',{method:'POST'});location.reload();
 }catch(x){msg('修改失败：'+x.message)}
 finally{if(b){b.disabled=false;b.textContent='修改管理员密码'}}
};


async function loadMedia(){
 const status=$('#mediaStatus'),grid=$('#mediaGrid');if(!status||!grid)return;
 status.textContent='正在加载图片…';
 try{const d=await api('/media');grid.innerHTML=(d.files||[]).map(f=>{const url=new URL(f.url,location.origin).href;return `<div class="media-item"><img src="${esc(url)}" loading="lazy" alt=""><div class="muted">${esc(f.key.split('/').pop())}<br>${(Number(f.size||0)/1024).toFixed(1)} KB</div><div class="actions"><button class="btn small" type="button" data-media-copy="${esc(url)}">复制链接</button><button class="btn small" type="button" data-media-insert="${esc(url)}">插入编辑器</button><button class="btn small danger" type="button" data-media-delete="${esc(f.key)}">删除</button></div></div>`}).join('');status.textContent=(d.files||[]).length?`共 ${d.files.length} 张图片${d.truncated?'（仅显示前 100 张）':''}`:'暂无图片，请点击“上传图片”';}catch(e){status.textContent='图片列表加载失败：'+e.message;grid.innerHTML=''}
}
$('#refreshMedia')?.addEventListener('click',loadMedia);
$('#mediaFile')?.addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 const status=$('#mediaStatus'),button=$('label[for="mediaFile"]');button?.classList.add('disabled');status.textContent='正在上传…';
 try{const fd=new FormData();fd.append('file',file);const r=await fetch('/api/media/upload',{method:'POST',body:fd,credentials:'same-origin'});const d=await r.json().catch(()=>({error:'服务器响应异常'}));if(!r.ok)throw Error(d.error||'上传失败');msg('图片上传成功');await loadMedia();}catch(x){status.textContent='上传失败：'+x.message;msg('上传失败：'+x.message)}finally{if(button)button.classList.remove('disabled');e.target.value=''}
});
$('#mediaGrid')?.addEventListener('click',async e=>{
 const b=e.target.closest('[data-media-copy],[data-media-insert],[data-media-delete]');if(!b)return;
 if(b.dataset.mediaCopy){try{await navigator.clipboard.writeText(b.dataset.mediaCopy);msg('图片链接已复制')}catch{prompt('复制图片链接',b.dataset.mediaCopy)}}
 if(b.dataset.mediaInsert){const ed=window.tinymce?.activeEditor;if(!ed){msg('请先点击工具或联系我们正文编辑器，再点击插入图片');return}ed.insertContent('<img src="'+esc(b.dataset.mediaInsert)+'" alt="" style="max-width:100%;height:auto">');msg('已插入当前编辑器')}
 if(b.dataset.mediaDelete&&confirm('确定删除这张图片吗？已插入页面的图片也会失效。')){try{await api('/media/'+b.dataset.mediaDelete,{method:'DELETE'});msg('图片已删除');await loadMedia()}catch(x){msg('删除失败：'+x.message)}}
});
async function initRichEditors(){
 if(!window.tinymce){msg('可视化编辑器加载失败，请检查网络或 CDN 访问');return}
 const common={license_key:'gpl',height:360,menubar:'edit view insert format table',plugins:'lists link image table code wordcount',toolbar:'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright | bullist numlist | link image table | removeformat code',language:'zh_CN',language_url:'https://cdn.jsdelivr.net/npm/tinymce@7.6.1/langs/zh_CN.js',promotion:false,branding:false,elementpath:false,convert_urls:false,relative_urls:false,remove_script_host:false,images_file_types:'jpg,jpeg,png,gif,webp',image_title:true,automatic_uploads:false,file_picker_types:'image',file_picker_callback:(callback)=>{const url=prompt('请输入已经上传到图床的图片直链（https:// 开头）：');if(url&&/^https:\/\//i.test(url))callback(url,{title:'页面图片'});else if(url)msg('图片地址必须以 https:// 开头')}};
 await tinymce.init({...common,selector:'#toolsEditor',placeholder:'在这里编写工具页面内容…'});
 await tinymce.init({...common,selector:'#contactEditor',placeholder:'在这里编写联系我们页面内容…'});
}
async function loadPages(){const d=await api('/settings');const p=d,f=$('#pagesForm');for(const k of ['nav_tools_label','nav_contact_label','background_image','customer_service_url','brand_name','brand_avatar_url','tools_title','tools_content','contact_title','contact_content'])f.elements[k].value=p[k]||'';if(window.tinymce){for(const [id,key] of [['toolsEditor','tools_content'],['contactEditor','contact_content']]){const ed=tinymce.get(id);if(ed)ed.setContent(p[key]||'')}}}
initRichEditors().then(()=>loadPages()).catch(e=>msg('编辑器初始化失败：'+e.message));

const pagesForm=$('#pagesForm');
if(pagesForm)pagesForm.onsubmit=async e=>{e.preventDefault();if(window.tinymce)tinymce.triggerSave();const b=e.submitter;if(b)b.disabled=true;try{await api('/settings',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(pagesForm).entries()))});msg('工具和联系我们页面已保存')}catch(x){msg('保存失败：'+x.message)}finally{if(b)b.disabled=false}};
