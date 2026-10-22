/* Outfit Library + Admin AI Photo Studio — Phase 1. No AI generation and no external photo sharing. */
(function(){
  'use strict';
  const TYPES={suit:'ชุดสูท', 'white-uniform':'ชุดปกติขาว', college:'ชุดวิทยาลัย',other:'ชุดอื่นที่ได้รับอนุญาต'};
  let mode='studio',photo=null,templates=[],chosen='',selectedBefore='',busy=false,lastFocused=null,loadingId=0,visible=false;
  const $=id=>document.getElementById(id);
  const getRole=()=>typeof state==='object'?state.role:'';
  const getToken=()=>typeof state==='object'?state.token:'';
  const canUse=()=>Boolean(getToken()&&['owner','editor'].includes(getRole()));
  const canManage=()=>Boolean(getToken()&&getRole()==='owner');

  // Dedicated Phase 1 API client: avoid stale main-page RPC allowlists.
  // Authorization still happens on the server for every request.
  const STUDIO_METHODS=new Set(['adminListOutfits','adminCreateOutfit','adminRenameOutfit','adminToggleOutfit','adminDeleteOutfit','adminGetPhotoEdit','adminChooseOutfit','adminGetImage']);
  async function studioRun(method,...args){
    if(!STUDIO_METHODS.has(method))throw new Error('คำสั่ง AI Studio ไม่ถูกต้อง');
    const endpoint=String(window.PERSONNEL_CONFIG?.apiBaseUrl||'https://personnel-photo-api.muhammadeirchard-m.workers.dev/api').trim();
    const ctrl=new AbortController();
    const clock=setTimeout(()=>ctrl.abort(),method==='adminCreateOutfit'?115000:65000);
    try{
      const response=await fetch(endpoint,{method:'POST',mode:'cors',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args}),signal:ctrl.signal});
      let payload;
      try{payload=await response.json();}catch(_){throw new Error('API ส่งข้อมูลกลับมาไม่ใช่ JSON โปรดตรวจสอบการ Deploy');}
      if(!response.ok||!payload||!payload.ok){
        const reason=String(payload?.error||('HTTP '+response.status));
        if(reason==='ไม่รองรับคำสั่งนี้'||reason==='คำสั่งไม่ถูกต้อง')
          throw new Error('ระบบหลังบ้านยังไม่รองรับ '+method+' โปรดตรวจสอบเวอร์ชัน Apps Script และ Cloudflare Worker');
        throw new Error(reason);
      }
      return payload.data;
    }catch(e){
      if(e?.name==='AbortError')throw new Error('การเชื่อมต่อใช้เวลานานเกินไป');
      throw e;
    }finally{clearTimeout(clock);}
  }

  const q=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const panel=q('div','outfit-shade hide');panel.id='outfitPhase1Overlay';panel.setAttribute('role','presentation');
  panel.innerHTML=`<section class="outfit-modal" role="dialog" aria-modal="true" aria-labelledby="outfitDialogTitle">
   <header class="outfit-head"><span class="outfit-head-icon" aria-hidden="true">✦</span>
     <div><h2 id="outfitDialogTitle">AI Photo Studio</h2><p id="outfitSubtitle">เลือกชุดมาตรฐานสำหรับบุคลากร</p></div>
     <div class="outfit-head-actions"><button type="button" class="outfit-close" id="outfitClose" aria-label="ปิดหน้าต่าง">×</button></div></header>
   <div class="outfit-body">
      <p class="outfit-note" id="outfitPhaseNote">Phase 1: เลือกและบันทึกชุดมาตรฐานเพื่อเตรียมงาน ภาพ AI ยังไม่ได้สร้างขึ้นในขั้นตอนนี้</p>
      <div id="outfitStudioView" class="outfit-columns">
        <section><p class="outfit-label">รูปต้นฉบับของบุคลากร</p><div class="outfit-photo" id="outfitOriginalPhoto"><span class="outfit-loading"><span class="outfit-spin"></span>กำลังโหลดรูปต้นฉบับ…</span></div>
          <p class="outfit-muted" id="outfitStaffName"></p></section>
        <section><p class="outfit-label">เลือกชุดมาตรฐานที่วิทยาลัยกำหนด</p><div class="outfit-choice-grid" id="outfitChoices"></div>
          <p class="outfit-muted" id="outfitCurrentChoice">ยังไม่ได้เลือกชุด</p>
          <div class="outfit-foot"><span class="outfit-muted">เมื่อเลือกแล้วจะบันทึกเป็น “รอเปลี่ยนชุดด้วย AI” โดยไม่แก้ภาพต้นฉบับ</span>
             <div class="outfit-actions"><button class="outfit-btn" type="button" id="outfitOpenManage">จัดการคลังชุด</button><button class="outfit-btn primary" type="button" id="outfitSaveChoice">บันทึกชุดที่เลือก</button></div></div></section></div>
      <div id="outfitManagerView" class="outfit-manager-grid hide">
        <form class="outfit-form" id="outfitCreateForm"><p class="outfit-label">เพิ่มต้นแบบชุดใหม่</p>
          <div class="group"><label for="outfitNewName">ชื่อรูปแบบชุด</label><input id="outfitNewName" type="text" minlength="3" maxlength="80" placeholder="เช่น สูทสีกรมท่า" required></div>
          <div class="group"><label for="outfitNewType">ประเภทชุด</label><select id="outfitNewType"><option value="suit">ชุดสูท</option><option value="white-uniform">ชุดปกติขาว</option><option value="college">ชุดวิทยาลัย</option><option value="other">ชุดอื่นที่ได้รับอนุญาต</option></select></div>
          <div class="group"><label for="outfitNewImage">ภาพต้นแบบชุด (JPG / PNG / WEBP)</label><input id="outfitNewImage" type="file" accept="image/jpeg,image/png,image/webp" required></div>
          <button type="submit" class="outfit-btn purple" id="outfitCreateButton">+ เพิ่มชุดในคลัง</button>
          <p class="outfit-muted">ควรใช้ภาพชุดที่วิทยาลัยได้รับอนุญาต และตรวจความถูกต้องของเครื่องแบบ/เครื่องหมายก่อนใช้งาน</p></form>
        <section><p class="outfit-label">ชุดมาตรฐานในระบบ</p><div class="outfit-management-list" id="outfitManageList"></div></section>
      </div>
      <div class="outfit-message hide" id="outfitMessage" role="status" aria-live="polite"></div>
   </div></section>`;
  document.body.appendChild(panel);
  const managerButton=q('button','settings-btn outfit-manage-btn hide','✦ คลังชุด');
  managerButton.type='button';managerButton.id='outfitLibraryButton';
  const toolbar=document.querySelector('.admin-toolbar');
  if(toolbar)toolbar.appendChild(managerButton);
  function msg(t,err=false){const el=$('outfitMessage');el.textContent=t;el.className='outfit-message'+(err?' error':'');}
  function clearMsg(){$('outfitMessage').className='outfit-message hide';$('outfitMessage').textContent='';}
  function setBusy(v){busy=v;for(const el of panel.querySelectorAll('button,input,select')){if(el.id==='outfitClose')continue;el.disabled=v;}$('outfitClose').disabled=v;}
  function apiError(e){const s=String(e?.message||e||'ไม่สามารถเชื่อมต่อฐานข้อมูล');
    if(/ไม่รองรับคำสั่ง|คำสั่งไม่ถูกต้อง|API|Apps Script|ไม่สามารถติดต่อ/.test(s))return 'คลังชุดยังเชื่อมต่อระบบหลังบ้านไม่สำเร็จ กรุณาอัปเดต Code.gs และ Cloudflare Worker เวอร์ชัน Phase 1 ก่อนใช้งาน ('+s+')';
    return s;
  }
  function syncRole(){managerButton.classList.toggle('hide',!canManage());if(!canUse()&&visible)close();}
  const observer=new MutationObserver(syncRole);if($('adminDashboard'))observer.observe($('adminDashboard'),{attributes:true,attributeFilter:['class']});
  syncRole();
  function close(){if(busy)return;visible=false;loadingId++;panel.classList.add('hide');document.body.classList.remove('outfit-modal-open');
    if(lastFocused&&lastFocused.isConnected)lastFocused.focus();}
  function initOpen(){if(!canUse())return false;lastFocused=document.activeElement;panel.classList.remove('hide');visible=true;clearMsg();return true;}
  function typeName(type){return TYPES[type]||'ชุดอื่น';}
  function noTemplates(el,message){el.replaceChildren(q('div','outfit-empty',message));}
  function renderChoiceList(){
    const grid=$('outfitChoices');grid.replaceChildren();
    const active=templates.filter(t=>t.active);
    if(!active.length){noTemplates(grid,'ยังไม่มีชุดที่เปิดใช้งาน ผู้ดูแลหลักสามารถเพิ่มชุดในเมนูคลังชุด');$('outfitSaveChoice').disabled=true;return;}
    active.forEach(t=>{
      const btn=q('button','outfit-choice'+(chosen===t.id?' selected':''));btn.type='button';btn.setAttribute('aria-pressed',String(chosen===t.id));
      const img=q('img');img.src=t.thumbnail;img.alt='ต้นแบบ '+t.name;img.loading='lazy';
      btn.append(img,q('div','outfit-choice-title',t.name),q('div','outfit-choice-type',typeName(t.type)));
      btn.addEventListener('click',()=>{if(busy)return;chosen=t.id;renderChoiceList();$('outfitCurrentChoice').textContent='ชุดที่เลือก: '+t.name+(chosen===selectedBefore?' (บันทึกไว้แล้ว)':'');});grid.append(btn);
    });
    $('outfitSaveChoice').disabled=!chosen||busy;
  }
  function renderManageList(){
    const grid=$('outfitManageList');grid.replaceChildren();
    if(!templates.length){noTemplates(grid,'ยังไม่มีชุดในคลัง เพิ่มชุดมาตรฐานรายการแรกได้จากแบบฟอร์มทางซ้าย');return;}
    templates.forEach(t=>{
      const item=q('div','outfit-management-item');const img=q('img');img.src=t.thumbnail;img.alt=t.name;
      const details=q('div','outfit-management-details');const strong=q('strong','',t.name);
      const meta=q('div','outfit-muted',typeName(t.type)+' · ');
      meta.append(q('span','outfit-pill'+(t.active?'':' off'),t.active?'เปิดใช้งาน':'ปิดใช้งาน'));
      const tools=q('div','outfit-management-actions');
      const rename=q('button','outfit-btn','แก้ชื่อ'),toggle=q('button','outfit-btn',t.active?'ปิดใช้งาน':'เปิดใช้งาน'),del=q('button','outfit-btn danger','ลบ');
      [rename,toggle,del].forEach(b=>{b.type='button';b.disabled=busy;});
      rename.addEventListener('click',()=>manageAction('rename',t));
      toggle.addEventListener('click',()=>manageAction('toggle',t));
      del.addEventListener('click',()=>manageAction('delete',t));
      tools.append(rename,toggle,del);details.append(strong,meta,tools);item.append(img,details);grid.append(item);
    });
  }
  async function fetchTemplates(){const res=await studioRun('adminListOutfits',getToken());
    templates=Array.isArray(res.items)?res.items:[];return templates;}
  async function open(record){
    if(!canUse()||!initOpen())return;
    mode='studio';photo=record;chosen='';selectedBefore='';
    $('outfitDialogTitle').textContent='AI Photo Studio';$('outfitSubtitle').textContent='เลือกชุดให้ '+String(record.name||'บุคลากร');
    $('outfitStudioView').classList.remove('hide');$('outfitManagerView').classList.add('hide');
    $('outfitOpenManage').classList.toggle('hide',!canManage());
    $('outfitStaffName').textContent=record.name;
    $('outfitOriginalPhoto').replaceChildren(q('span','outfit-loading','กำลังโหลดภาพต้นฉบับ…'));
    noTemplates($('outfitChoices'),'กำลังโหลดคลังชุด…');$('outfitSaveChoice').disabled=true;$('outfitCurrentChoice').textContent='กำลังตรวจสอบชุดที่บันทึกไว้…';
    const request=++loadingId;
    try{
      const [a,b,c]=await Promise.all([fetchTemplates(),studioRun('adminGetImage',getToken(),record.id),studioRun('adminGetPhotoEdit',getToken(),record.id)]);
      if(request!==loadingId||!visible)return;
      const orig=$('outfitOriginalPhoto');orig.replaceChildren();
      if(b?.imageData){const image=q('img');image.src=b.imageData;image.alt='ภาพต้นฉบับ '+record.name;orig.append(image);}else orig.textContent='ไม่พบภาพต้นฉบับ';
      selectedBefore=c?.edit?.outfitId||'';
      chosen=a.some(t=>t.id===selectedBefore&&t.active)?selectedBefore:'';
      renderChoiceList();
      const match=a.find(t=>t.id===selectedBefore);
      $('outfitCurrentChoice').textContent=match?'ชุดที่บันทึกไว้: '+match.name:'ยังไม่มีการเลือกชุด';
    }catch(e){if(request===loadingId&&visible){noTemplates($('outfitChoices'),'ไม่สามารถโหลดคลังชุด');msg(apiError(e),true);$('outfitCurrentChoice').textContent='';}}
  }
  async function openManager(){if(!canManage()||!initOpen())return;mode='manage';photo=null;
    $('outfitDialogTitle').textContent='คลังชุดมาตรฐาน';$('outfitSubtitle').textContent='เพิ่ม แก้ชื่อ เปิด–ปิด และลบต้นแบบชุด (ผู้ดูแลหลักเท่านั้น)';
    $('outfitStudioView').classList.add('hide');$('outfitManagerView').classList.remove('hide');
    noTemplates($('outfitManageList'),'กำลังโหลดข้อมูล…');
    try{await fetchTemplates();renderManageList();}catch(e){msg(apiError(e),true);noTemplates($('outfitManageList'),'เชื่อมต่อฐานข้อมูลคลังชุดไม่สำเร็จ');}
  }
  async function manageAction(action,t){if(!canManage()||busy)return;
    let result,newValue;
    if(action==='rename'){
      newValue=prompt('ตั้งชื่อชุดใหม่',t.name);if(newValue===null||newValue.trim()===t.name)return;
    }
    if(action==='delete'&&!confirm('ลบต้นแบบชุด “'+t.name+'” หรือไม่?\nหากเคยเลือกให้บุคลากรแล้ว ระบบจะไม่อนุญาตให้ลบ'))return;
    if(action==='toggle'&&!confirm((t.active?'ปิด':'เปิด')+'การใช้งานชุด “'+t.name+'” ?'))return;
    setBusy(true);msg('กำลังบันทึกการเปลี่ยนแปลง…');
    try{
      if(action==='rename')result=await studioRun('adminRenameOutfit',getToken(),t.id,newValue);
      if(action==='toggle')result=await studioRun('adminToggleOutfit',getToken(),t.id,!t.active);
      if(action==='delete')result=await studioRun('adminDeleteOutfit',getToken(),t.id);
      await fetchTemplates();renderManageList();msg('บันทึกเรียบร้อยแล้ว');
    }catch(e){msg(apiError(e),true);}finally{setBusy(false);renderManageList();}
  }
  function fromFile(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('เปิดรูปต้นแบบไม่ได้'));};img.src=url;});}
  function resizeJpeg(image,bound,quality){const naturalW=image.naturalWidth||image.width,naturalH=image.naturalHeight||image.height;
    const scale=Math.min(1,bound/Math.max(naturalW,naturalH));const w=Math.max(1,Math.round(naturalW*scale)),h=Math.max(1,Math.round(naturalH*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
    return c.toDataURL('image/jpeg',quality);}
  function bytes(data){return Math.ceil((data.length-23)*.75);}
  async function prepareImage(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('เลือก JPG, PNG หรือ WEBP ขนาดไม่เกิน 12 MB');
    const image=await fromFile(file);let large='',small='';
    for(let i=0;i<6;i++){large=resizeJpeg(image,1100-i*130,.82-i*.055);if(bytes(large)<=1350000)break;}
    for(let i=0;i<6;i++){small=resizeJpeg(image,220-i*20,.65-i*.055);if(bytes(small)<=22000)break;}
    if(bytes(large)>1350000||bytes(small)>22000)throw new Error('ไม่สามารถลดขนาดรูปให้เหมาะสมได้');
    return {imageData:large,thumbnail:small};
  }
  $('outfitCreateForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!canManage()||busy)return;
    const file=$('outfitNewImage').files?.[0];
    setBusy(true);msg('กำลังเตรียมรูปภาพชุด…');
    try{
      const data=await prepareImage(file);
      msg('กำลังบันทึกคลังชุดลง Google Drive และ Google Sheets…');
      await studioRun('adminCreateOutfit',getToken(),{name:$('outfitNewName').value.trim(),type:$('outfitNewType').value,...data});
      $('outfitCreateForm').reset();await fetchTemplates();renderManageList();msg('เพิ่มชุดในคลังเรียบร้อยแล้ว');
    }catch(e){msg(apiError(e),true);}finally{setBusy(false);renderManageList();}
  });
  $('outfitSaveChoice').addEventListener('click',async()=>{
    if(!canUse()||!photo||!chosen||busy)return;
    const outfit=templates.find(t=>t.id===chosen&&t.active);if(!outfit)return;
    setBusy(true);msg('กำลังบันทึกชุดที่เลือก…');
    try{
      await studioRun('adminChooseOutfit',getToken(),photo.id,outfit.id);
      selectedBefore=outfit.id;msg('บันทึกชุด “'+outfit.name+'” ให้ '+photo.name+' แล้ว · สถานะ: รอการสร้างภาพด้วย AI');
      $('outfitCurrentChoice').textContent='ชุดที่บันทึกไว้: '+outfit.name;
    }catch(e){msg(apiError(e),true);}finally{setBusy(false);renderChoiceList();}
  });
  $('outfitOpenManage').addEventListener('click',()=>{if(canManage()){close();openManager();}});
  $('outfitClose').addEventListener('click',close);
  panel.addEventListener('click',e=>{if(e.target===panel)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visible&&!busy){e.preventDefault();close();}});
  managerButton.addEventListener('click',openManager);
  window.PersonnelOutfitStudio=Object.freeze({open,openManager,close,syncRole});
})();