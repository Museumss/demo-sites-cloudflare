const $=s=>document.querySelector(s);let sites=[];
async function api(path,opts={}){const r=await fetch('/api'+path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({error:'服务器响应异常'}));if(!r.ok)throw Error(d.error||'请求失败');return d}
async function compressImage(file){
 if(!file||file.type==='image/gif'||!['image/jpeg','image/png','image/webp'].includes(file.type))return file;
 if(!('createImageBitmap' in window))return file;
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.82));
  if(!blob)return file;
  if(blob.size>=file.size&&scale===1)return file;
  return new File([blob],file.name.replace(/\\.[^.]+$/,'')+'.webp',{type:'image/webp',lastModified:Date.now()});
 }catch{return file}finally{bitmap?.close?.()}
}
async function uploadImage(file){
 if(!file)throw Error('请选择图片');
 const optimized=await compressImage(file);
 const fd=new FormData();fd.append('file',optimized,optimized.name||'image.webp');
 const r=await fetch('/api/media/upload',{method:'POST',body:fd,credentials:'same-origin'});
 const d=await r.json().catch(()=>({error:'服务器响应异常'}));
 if(!r.ok)throw Error(d.error||'图片上传失败');
 return new URL(d.url,location.origin).href;
}
function msg(t){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.append(x);setTimeout(()=>x.remove(),3000)}
function esc(s=''){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function enter(){try{await api('/auth/me');$('#login').classList.add('hidden');$('#admin').classList.remove('hidden');$('#loginError').textContent='';await load()}catch(e){$('#admin').classList.add('hidden');$('#login').classList.remove('hidden');if(e.message!=='未登录'&&!e.message.includes('登录'))$('#loginError').textContent=e.message}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#password').value='';await enter()}catch(x){$('#loginError').textContent=x.message}finally{b.disabled=false}};
async function load(){try{const siteData=await api('/sites');sites=siteData.sites||[];$('#summary').textContent=`共 ${sites.length} 个站点 · 正常 ${sites.filter(x=>x.status==='up').length} · 异常 ${sites.filter(x=>x.status==='down').length}`;$('#rows').innerHTML=sites.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td>${s.status==='up'?'正常':s.status==='down'?'异常':'待检测'}</td><td>${Number(s.view_count||0).toLocaleString()}</td><td>${s.last_checked?new Date(s.last_checked).toLocaleString():'—'}</td><td><div class="actions"><button class="btn small" data-edit="${Number(s.id)}">编辑</button><button class="btn small danger" data-del="${Number(s.id)}">删除</button></div></td></tr>`).join('')||'<tr><td colspan="6">暂无站点，点击新增站点开始添加</td></tr>';await loadPages()}catch(e){msg(e.message);if(e.message.includes('登录'))enter()}}
function editor(s){$('#editor').classList.remove('hidden');$('#editorTitle').textContent=s?'编辑站点':'新增站点';const f=$('#siteForm');f.reset();for(const [k,v] of Object.entries(s||{})){if(f.elements[k])f.elements[k].value=v??''}scrollTo({top:document.body.scrollHeight,behavior:'smooth'})}
function previewImage(img,url){if(!img)return;if(url){img.src=url;img.style.display='block'}else{img.removeAttribute('src');img.style.display='none'}}
$('#avatarUpload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const b=e.target.closest('label')?.querySelector('.btn');if(b)b.textContent='上传中…';try{const url=await uploadImage(file);$('#pagesForm').elements.brand_avatar_url.value=url;previewImage($('#avatarPreview'),url);msg('头像上传成功，请保存页面设置')}catch(x){msg(x.message)}finally{if(b)b.textContent='上传头像';e.target.value=''}};
$('#backgroundUpload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const b=e.target.closest('label')?.querySelector('.btn');if(b)b.textContent='上传中…';try{const url=await uploadImage(file);$('#pagesForm').elements.background_image.value=url;msg('背景图片上传成功，链接已自动填入，请保存页面设置')}catch(x){msg(x.message)}finally{if(b)b.textContent='上传背景图片';e.target.value=''}};
$('#coverUpload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const b=e.target.closest('label')?.querySelector('.btn');if(b)b.textContent='上传中…';try{const url=await uploadImage(file);$('#siteForm').elements.cover.value=url;msg('封面上传成功，图片链接已自动填入，请保存站点')}catch(x){msg(x.message)}finally{if(b)b.textContent='上传封面';e.target.value=''}};
$('#pagesForm').elements.brand_avatar_url.addEventListener('input',e=>previewImage($('#avatarPreview'),e.target.value));

$('#add').onclick=()=>editor(null);$('#cancel').onclick=()=>$('#editor').classList.add('hidden');$('#rows').onclick=async e=>{const a=e.target.closest('[data-edit],[data-del]');if(!a)return;const id=Number(a.dataset.edit||a.dataset.del),s=sites.find(x=>Number(x.id)===id);if(a.dataset.edit!==undefined)editor(s);else if(confirm(`确认删除「${s.name}」？`)){try{await api('/sites/'+id,{method:'DELETE'});msg('已删除');await load()}catch(x){msg(x.message)}}};
$('#siteForm').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target).entries()),id=o.id;delete o.id;try{await api('/sites'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(o)});msg('保存成功');$('#editor').classList.add('hidden');await load()}catch(x){msg(x.message)}};
$('#check').onclick=async()=>{const b=$('#check');b.disabled=true;b.textContent='检测中…';try{const d=await api('/check',{method:'POST',body:'{}'});msg(`检测完成：${d.checked} 个站点`);await load()}catch(e){msg(e.message)}finally{b.disabled=false;b.textContent='一键检测存活'}};
$('#export').onclick=async()=>{try{const d=await api('/export'),blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='demo-sites-backup.json';a.click();URL.revokeObjectURL(a.href)}catch(e){msg(e.message)}};
$('#importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text()),rows=Array.isArray(d)?d:d.sites;if(!Array.isArray(rows))throw Error('JSON中需要包含 sites 数组');const r=await api('/import',{method:'POST',body:JSON.stringify({sites:rows})});msg(`成功导入 ${r.imported} 条`);await load()}catch(x){msg('导入失败：'+x.message)}e.target.value=''};
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


async function initRichEditors(){
 if(!window.tinymce){msg('可视化编辑器加载失败，请检查网络或 CDN 访问');return}
 const common={license_key:'gpl',height:360,menubar:'edit view insert format table',plugins:'lists link image table code wordcount',toolbar:'undo redo | blocks | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright | bullist numlist | link image table | removeformat code',language:'zh_CN',language_url:'https://cdn.jsdelivr.net/npm/tinymce@7.6.1/langs/zh_CN.js',promotion:false,branding:false,elementpath:false,convert_urls:false,relative_urls:false,remove_script_host:false,images_file_types:'jpg,jpeg,png,gif,webp',image_title:true,automatic_uploads:true,paste_data_images:true,file_picker_types:'image',images_upload_handler:async(blobInfo)=>{
 const fd=new FormData();fd.append('file',blobInfo.blob(),blobInfo.filename());
 const response=await fetch('/api/media/upload',{method:'POST',body:fd,credentials:'same-origin'});
 const data=await response.json().catch(()=>({error:'服务器响应异常'}));
 if(!response.ok)throw new Error(data.error||'图片上传失败');
 return new URL(data.url,location.origin).href;
},file_picker_callback:(callback)=>{
 const picker=document.createElement('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp,image/gif';
 picker.onchange=async()=>{const file=picker.files?.[0];if(!file)return;try{const fd=new FormData();fd.append('file',file);const response=await fetch('/api/media/upload',{method:'POST',body:fd,credentials:'same-origin'});const data=await response.json().catch(()=>({error:'服务器响应异常'}));if(!response.ok)throw new Error(data.error||'图片上传失败');callback(new URL(data.url,location.origin).href,{title:file.name});msg('图片上传成功')}catch(error){msg(error.message)}};
 picker.click();
}};
 await tinymce.init({...common,selector:'#toolsEditor',placeholder:'在这里编写工具页面内容…'});
 await tinymce.init({...common,selector:'#contactEditor',placeholder:'在这里编写联系我们页面内容…'});
}
async function loadPages(){const d=await api('/settings');const p=d,f=$('#pagesForm');for(const k of ['nav_tools_label','nav_contact_label','background_image','customer_service_url','brand_name','brand_avatar_url','tools_title','tools_content','contact_title','contact_content'])f.elements[k].value=p[k]||'';if(window.tinymce){for(const [id,key] of [['toolsEditor','tools_content'],['contactEditor','contact_content']]){const ed=tinymce.get(id);if(ed)ed.setContent(p[key]||'')}}}
initRichEditors().then(()=>loadPages()).catch(e=>msg('编辑器初始化失败：'+e.message));

const pagesForm=$('#pagesForm');
if(pagesForm)pagesForm.onsubmit=async e=>{e.preventDefault();if(window.tinymce)tinymce.triggerSave();const b=e.submitter;if(b)b.disabled=true;try{await api('/settings',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(pagesForm).entries()))});msg('工具和联系我们页面已保存')}catch(x){msg('保存失败：'+x.message)}finally{if(b)b.disabled=false}};
