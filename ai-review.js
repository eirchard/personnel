/* Personnel AI Photo Review — Phase 2. Admin uploads externally edited photos; NO AI generation. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const e=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const allow=new Set(['adminGetAIReview','adminUploadAIReview','adminReviewAIResult','adminGetAIReviewImage','adminDownloadApprovedAI','adminGetImage','adminGetPhotoEdit','adminListOutfits']);
  const canOpen=()=>typeof state==='object'&&Boolean(state.token)&&['owner','editor'].includes(state.role);
  const isOwner=()=>canOpen()&&state.role==='owner';
  const token=()=>state.token;
  let photo=null,latest=null,approved=null,history=[],viewingId='',loading=0,busy=false,visible=false,chosenOutfit='',lastFocus=null,editImageId='',approvalShown='';

  async function rpc(method,...args){
    if(!allow.has(method))throw new Error('ไม่อนุญาตคำสั่ง Phase 2 นี้');
    const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),method==='adminUploadAIReview'?115000:65000);
    const endpoint=String(window.PERSONNEL_CONFIG?.apiBaseUrl||'https://personnel-photo-api.muhammadeirchard-m.workers.dev/api').trim();
    try{
      const response=await fetch(endpoint,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({method,args}),signal:ctrl.signal});
      let data;
      try{data=await response.json();}catch(_){throw new Error('API ไม่ได้ตอบข้อมูล JSON กรุณาตรวจสอบการ Deploy');}
      if(!response.ok||!data?.ok){
        const reason=String(data?.error||'HTTP '+response.status);
        if(/ไม่รองรับคำสั่ง|ไม่รองรับ .*admin|คำสั่งไม่ถูกต้อง/.test(reason))
          throw new Error('Phase 2 ยังไม่ได้เปิดใน Apps Script หรือ Cloudflare Worker ('+method+')');
        throw new Error(reason);
      }
      return data.data;
    }catch(err){if(err?.name==='AbortError')throw new Error('การเชื่อมต่อหมดเวลา กรุณาลองใหม่');throw err;}
    finally{clearTimeout(timeout);}
  }

  const shade=e('div','ai2-overlay hide');shade.id='ai2Overlay';shade.innerHTML=`
  <section class="ai2-modal" role="dialog" aria-modal="true" aria-labelledby="ai2Title">
    <header class="ai2-head">
      <div class="ai2-mark" aria-hidden="true">✦</div><div class="ai2-heading"><p class="ai2-eyebrow">AI PHOTO STUDIO · PHASE 2</p><h2 id="ai2Title">ตรวจสอบภาพที่เปลี่ยนชุด</h2>
      <p id="ai2Staff">นำเข้าภาพ AI เพื่อเปรียบเทียบและอนุมัติ</p></div>
      <button class="ai2-close" id="ai2Close" type="button" aria-label="ปิดหน้าต่าง">×</button>
    </header>
    <div class="ai2-inner">
      <div class="ai2-banner"><span aria-hidden="true">ⓘ</span> Phase 2 ยังไม่สร้างภาพด้วย AI อัตโนมัติ ให้นำภาพที่ได้รับอนุญาตและปรับแต่งแล้วเข้ามาตรวจสอบ</div>
      <div class="ai2-details"><span id="ai2Outfit" class="ai2-outfit">กำลังตรวจสอบชุดที่เลือก…</span><span id="ai2Status" class="ai2-status">ยังไม่มีภาพ AI</span></div>
      <div class="ai2-compare">
        <section class="ai2-photo-card"><div class="ai2-photo-head"><b>ภาพต้นฉบับ</b><span>เก็บไว้เหมือนเดิม</span></div>
          <div class="ai2-photo-frame" id="ai2Original"><span class="ai2-empty">กำลังโหลดรูปบุคลากร…</span></div>
          <p class="ai2-photo-foot">อ้างอิงใบหน้าและตัวตนของบุคลากร</p></section>
        <section class="ai2-photo-card ai2-edited-card"><div class="ai2-photo-head"><b>ภาพที่ปรับแต่งด้วย AI</b><span id="ai2Version">รอเพิ่มภาพ</span></div>
          <div class="ai2-photo-frame" id="ai2Edited"><span class="ai2-empty">ยังไม่ได้เพิ่มภาพที่ปรับแต่ง</span></div>
          <p class="ai2-photo-foot" id="ai2EditedInfo">โปรดตรวจเครื่องแต่งกาย ใบหน้า และเครื่องหมายให้ถูกต้อง</p></section>
      </div>
      <section class="ai2-history-panel" aria-labelledby="ai2HistoryTitle">
        <div class="ai2-history-head"><div><h3 id="ai2HistoryTitle">ประวัติภาพ AI ทุกเวอร์ชัน</h3>
          <p>คลิกเวอร์ชันเพื่อย้อนดูภาพและผลการตรวจสอบ ข้อมูลเดิมจะไม่ถูกแก้ไข</p></div>
          <span class="ai2-history-count" id="ai2HistoryCount">0 เวอร์ชัน</span></div>
        <div class="ai2-history-list" id="ai2History" aria-live="polite"></div>
      </section>
      <div class="ai2-approved hide" id="ai2ApprovedBox"><span id="ai2ApprovedDescription">มีภาพที่อนุมัติแล้ว</span><button class="ai2-btn outline" type="button" id="ai2Download">ดาวน์โหลดภาพที่อนุมัติ</button></div>
      <div class="ai2-grid">
        <div class="ai2-panel"><h3>นำเข้าภาพที่เปลี่ยนชุดแล้ว</h3>
          <p>ใช้ไฟล์ JPG / PNG / WEBP ที่ตรวจสิทธิ์และได้รับอนุญาตแล้ว ระบบเก็บแยกจากรูปต้นฉบับ</p>
          <label class="ai2-file-label" for="ai2File">เลือกภาพ AI ที่ต้องการตรวจสอบ</label>
          <input type="file" id="ai2File" accept="image/jpeg,image/png,image/webp">
          <div id="ai2Selected" class="ai2-selected">ยังไม่ได้เลือกไฟล์</div>
          <button class="ai2-btn primary" id="ai2Upload" type="button">บันทึกภาพเพื่อรออนุมัติ</button>
        </div>
        <div class="ai2-panel ai2-reviewer"><h3>ผลการตรวจสอบ</h3>
          <p id="ai2ReviewHelp">ผู้ดูแลหลักสามารถอนุมัติหรือปฏิเสธภาพที่รอตรวจสอบ</p>
          <div class="ai2-review-actions"><button type="button" id="ai2Approve" class="ai2-btn success">✓ อนุมัติภาพ</button>
            <button type="button" id="ai2Reject" class="ai2-btn danger">× ขอแก้ไขภาพ</button></div>
          <button type="button" id="ai2FullImage" class="ai2-btn outline">ดูภาพ AI ขนาดเต็ม</button>
        </div>
      </div>
      <div id="ai2Message" class="ai2-message hide" role="status" aria-live="polite"></div>
    </div>
  </section>`;
  document.body.appendChild(shade);
  const controls=['ai2Close','ai2Download','ai2File','ai2Upload','ai2Approve','ai2Reject','ai2FullImage'];
  function message(t,isError=false){const box=$('ai2Message');box.textContent=t;box.className='ai2-message'+(isError?' error':'');}
  function clearMessage(){$('ai2Message').textContent='';$('ai2Message').className='ai2-message hide';}
  function busyState(v){busy=v;controls.forEach(id=>{$(id).disabled=v;});if(!v)renderButtons();}
  function close(){if(busy)return;visible=false;loading++;shade.classList.add('hide');document.body.classList.remove('ai2-modal-open');
    $('ai2File').value='';if(lastFocus?.isConnected)lastFocus.focus();}
  function latestStatusLabel(s){return ({pending:'รอการอนุมัติ',approved:'อนุมัติแล้ว',rejected:'ขอแก้ไข',superseded:'มีภาพเวอร์ชันใหม่'})[s]||'ยังไม่มีภาพ AI';}
  function renderButtons(){
    const pending=latest?.status==='pending'&&viewingId===latest?.id;
    $('ai2Approve').classList.toggle('hide',!isOwner());$('ai2Reject').classList.toggle('hide',!isOwner());
    $('ai2Approve').disabled=busy||!pending||!isOwner();$('ai2Reject').disabled=busy||!pending||!isOwner();
    $('ai2File').disabled=busy;$('ai2Upload').disabled=busy||!chosenOutfit;
    $('ai2FullImage').disabled=busy||!latest;
    $('ai2Download').disabled=busy||!approved;
    $('ai2ReviewHelp').textContent=isOwner()?'ตรวจสอบภาพฉบับเต็ม ก่อนอนุมัติหรือขอแก้ไข':'คุณสามารถนำเข้าภาพ AI ได้ การอนุมัติเป็นสิทธิ์ของผู้ดูแลหลัก';
  }
  function showImage(el,data,alternative){const box=$(el);box.replaceChildren();
    if(data){const img=e('img');img.src=data;img.alt=alternative;box.append(img);}
    else box.append(e('span','ai2-empty','ยังไม่มีรูปภาพ'));}
  function versionDetails(item){
    return (item.status==='rejected'&&item.reason?'เหตุผลที่ขอแก้ไข: '+item.reason+' · ':'')+
      'เพิ่มโดย '+(item.createdBy||'-')+' · '+(item.createdAt||'-')+
      (item.reviewedBy?' · ตรวจโดย '+item.reviewedBy:'');
  }
  function renderHistory(){
    const list=$('ai2History');list.replaceChildren();
    $('ai2HistoryCount').textContent=history?.length+' เวอร์ชัน';
    if(history===null){list.append(e('p','ai2-history-empty','ยังไม่สามารถแสดงประวัติย้อนหลังได้ กรุณาติดตั้ง Code.gs Phase 2.1'));return;}
    if(!history.length){list.append(e('p','ai2-history-empty','ยังไม่มีประวัติภาพ AI สำหรับบุคลากรรายนี้'));return;}
    history.forEach((item,index)=>{
      const btn=e('button','ai2-history-item'+(viewingId===item.id?' selected':''));btn.type='button';
      btn.setAttribute('aria-pressed',String(viewingId===item.id));
      const img=e('img','ai2-history-thumb');img.src=item.thumbnail||'';img.alt='ภาพ AI เวอร์ชัน '+(history.length-index);img.loading='lazy';
      const body=e('span','ai2-history-body');
      body.append(e('strong','',`เวอร์ชัน ${history.length-index} · ${latestStatusLabel(item.status)}`),
        e('span','',item.createdAt||'ไม่ระบุวันที่'));
      if(item.status==='rejected'&&item.reason)body.append(e('span','ai2-history-reason','เหตุผล: '+item.reason));
      const indicator=e('span','ai2-history-indicator',viewingId===item.id?'กำลังดู':'ดูภาพ');
      btn.append(img,body,indicator);btn.addEventListener('click',()=>viewHistory(item));list.append(btn);
    });
  }
  async function viewHistory(item){
    if(busy||!visible||!item?.id||viewingId===item.id)return;
    const request=++loading,previous=viewingId;viewingId=item.id;
    renderHistory();renderButtons();
    $('ai2Version').textContent='ภาพเวอร์ชัน '+(history.length-history.findIndex(x=>x.id===item.id));
    $('ai2EditedInfo').textContent=versionDetails(item);
    $('ai2Status').textContent=latestStatusLabel(item.status);
    $('ai2Status').dataset.status=item.status;
    showImage('ai2Edited',item.thumbnail,'ตัวอย่างภาพ AI เวอร์ชันที่เลือก');
    message('กำลังโหลดภาพ AI เวอร์ชันที่เลือก…');
    try{
      const result=await rpc('adminGetAIReviewImage',token(),item.id);
      if(request!==loading||!visible)return;
      if(result?.imageData)showImage('ai2Edited',result.imageData,'ภาพ AI ย้อนหลังขนาดเต็ม');
      message('กำลังแสดงภาพเวอร์ชัน '+(history.length-history.findIndex(x=>x.id===item.id))+' · ไม่เปลี่ยนผลการอนุมัติ');
    }catch(err){if(request!==loading||!visible)return;viewingId=previous;
      $('ai2Status').textContent=latestStatusLabel(latest?.status);
      $('ai2Status').dataset.status=latest?.status||'none';
      renderHistory();renderButtons();message('เปิดภาพย้อนหลังไม่สำเร็จ: '+err.message,true);}
  }
  async function loadReview(request){
    const [result,origin,selection,outfits]=await Promise.all([
      rpc('adminGetAIReview',token(),photo.id),rpc('adminGetImage',token(),photo.id),
      rpc('adminGetPhotoEdit',token(),photo.id),rpc('adminListOutfits',token())]);
    if(request!==loading||!visible)return;
    latest=result.latest;approved=result.approved;
    history=Array.isArray(result.history)?result.history:null;
    viewingId=latest?.id||'';
    const selected=selection.edit?.outfitId||'';
    const match=(outfits.items||[]).find(x=>x.id===selected);
    chosenOutfit=match?.active?selected:'';
    $('ai2Outfit').textContent=match?'ชุดที่เลือก: '+match.name+(match.active?'':' (ปิดใช้งาน)'):'ยังไม่ได้เลือกชุดใน Phase 1';
    $('ai2Status').textContent=latestStatusLabel(latest?.status);
    $('ai2Status').dataset.status=latest?.status||'none';
    $('ai2Version').textContent=latest?'ภาพเวอร์ชัน '+result.versionCount:'รอเพิ่มภาพ';
    showImage('ai2Original',origin.imageData,'รูปบุคลากรต้นฉบับ '+photo.name);
    $('ai2EditedInfo').textContent=latest?(latest.status==='rejected'?'เหตุผลที่ขอแก้ไข: '+latest.reason:
      'เพิ่มโดย '+latest.createdBy+' · '+latest.createdAt+(latest.reviewedBy?' · ตรวจโดย '+latest.reviewedBy:'')):'ตรวจใบหน้าและชุดก่อนส่งตรวจทุกครั้ง';
    showImage('ai2Edited',latest?.thumbnail,'รูป AI ที่นำเข้า');
    renderHistory();
    // Full-resolution file is loaded for reviewers, not just the thumbnail.
    if(latest){
      try{
        const full=await rpc('adminGetAIReviewImage',token(),latest.id);
        if(request===loading&&visible&&full?.imageData){editImageId=latest.id;showImage('ai2Edited',full.imageData,'ภาพที่ปรับแต่งแล้วขนาดเต็ม');}
      }catch(err){if(request===loading&&visible)message('ไม่สามารถเปิดภาพ AI ขนาดเต็ม: '+err.message,true);}
    }
    if(request!==loading||!visible)return;
    $('ai2ApprovedBox').classList.toggle('hide',!approved);
    if(approved)$('ai2ApprovedDescription').textContent='มีภาพที่อนุมัติแล้ว · '+approved.reviewedAt;
    $('ai2Upload').textContent=result.canUpload?'บันทึกภาพเพื่อรออนุมัติ':'จำนวนเวอร์ชันถึงขีดจำกัด';
    renderButtons();if(!result.canUpload)$('ai2Upload').disabled=true;
  }
  async function open(record){
    if(!canOpen()||!record?.id)return;
    lastFocus=document.activeElement;photo=record;latest=null;approved=null;history=[];viewingId='';chosenOutfit='';editImageId='';approvalShown='';loading++;
    const request=loading;visible=true;shade.classList.remove('hide');document.body.classList.add('ai2-modal-open');
    clearMessage();$('ai2File').value='';$('ai2Selected').textContent='ยังไม่ได้เลือกไฟล์';
    $('ai2Staff').textContent='บุคลากร: '+record.name;
    $('ai2Outfit').textContent='กำลังตรวจสอบชุดที่เลือก…';$('ai2Status').textContent='กำลังโหลด…';
    $('ai2ApprovedBox').classList.add('hide');$('ai2Original').textContent='กำลังโหลดรูปบุคลากร…';
    $('ai2Edited').textContent='กำลังโหลดข้อมูลการตรวจสอบ…';$('ai2Version').textContent='กำลังโหลด…';
    renderButtons();
    try{await loadReview(request);}
    catch(err){if(request===loading&&visible)message('ไม่สามารถโหลด Phase 2: '+err.message,true);}
  }
  async function toImage(file){return new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(file),im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);resolve(im);};
    im.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('ไม่สามารถเปิดรูปภาพนี้ได้'));};im.src=u;
  });}
  function resized(img,bound,quality){
    const k=Math.min(1,bound/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*k));const h=Math.max(1,Math.round(img.naturalHeight*k));
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
    return c.toDataURL('image/jpeg',quality);
  }
  function sizeOf(base64){return Math.ceil((base64.length-23)*.75);}
  async function prepare(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)
      throw new Error('เลือกรูป JPG, PNG หรือ WEBP ขนาดไม่เกิน 12 MB');
    const img=await toImage(file);
    if(img.naturalWidth<400||img.naturalHeight<400)throw new Error('รูปภาพต้องมีความละเอียดไม่น้อยกว่า 400×400 พิกเซล');
    let imageData='',thumbnail='';
    for(let i=0;i<7;i++){imageData=resized(img,1600-i*160,.88-i*.075);if(sizeOf(imageData)<=1350000)break;}
    for(let i=0;i<7;i++){thumbnail=resized(img,230-i*20,.7-i*.065);if(sizeOf(thumbnail)<=22000)break;}
    if(sizeOf(imageData)>1350000||sizeOf(thumbnail)>22000)throw new Error('ไม่สามารถลดขนาดรูปภาพให้เหมาะสมได้');
    return {imageData,thumbnail};
  }
  $('ai2File').addEventListener('change',()=>{$('ai2Selected').textContent=$('ai2File').files?.[0]?.name||'ยังไม่ได้เลือกไฟล์';});
  $('ai2Upload').addEventListener('click',async()=>{
    if(busy||!canOpen()||!photo||!chosenOutfit)return;
    const f=$('ai2File').files?.[0];if(!f){message('กรุณาเลือกรูปภาพที่เปลี่ยนชุดแล้ว',true);return;}
    busyState(true);message('กำลังเตรียมภาพและตรวจสอบขนาดไฟล์…');
    try{
      const data=await prepare(f);
      if(!confirm('ยืนยันบันทึกภาพที่ปรับแต่งแล้วสำหรับ '+photo.name+' ?\nจะเก็บเป็นภาพรอตรวจสอบ โดยไม่แก้ไขรูปต้นฉบับ'))return;
      message('กำลังบันทึกภาพที่ปรับแต่งลง Google Drive…');
      await rpc('adminUploadAIReview',token(),photo.id,data);
      $('ai2File').value='';$('ai2Selected').textContent='ยังไม่ได้เลือกไฟล์';
      const request=++loading;await loadReview(request);message('บันทึกภาพ AI เรียบร้อยแล้ว · รอผู้ดูแลหลักอนุมัติ');
    }catch(err){message(err.message,true);}finally{busyState(false);}
  });
  async function review(action){
    if(busy||!isOwner()||latest?.status!=='pending')return;
    let reason='';
    if(action==='reject'){
      const input=prompt('ระบุเหตุผลที่ขอให้แก้ไขภาพ เช่น ใบหน้าไม่ตรงกับต้นฉบับ');
      if(input===null)return;reason=input.trim();if(reason.length<3){message('กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร',true);return;}
    }else if(!confirm('อนุมัติภาพนี้ให้ใช้บนเว็บไซต์วิทยาลัยหรือไม่?\nโปรดยืนยันว่าใบหน้าและเครื่องแบบถูกต้อง'))return;
    busyState(true);message('กำลังบันทึกผลการตรวจสอบ…');
    try{
      await rpc('adminReviewAIResult',token(),latest.id,action,reason);
      const request=++loading;await loadReview(request);
      message(action==='approve'?'อนุมัติภาพเรียบร้อยแล้ว สามารถดาวน์โหลดภาพได้':'บันทึกการขอแก้ไขภาพแล้ว');
    }catch(err){message(err.message,true);}finally{busyState(false);}
  }
  $('ai2Approve').addEventListener('click',()=>review('approve'));
  $('ai2Reject').addEventListener('click',()=>review('reject'));
  $('ai2FullImage').addEventListener('click',async()=>{
    if(!latest||busy)return;
    busyState(true);message('กำลังเปิดภาพ AI ขนาดเต็ม…');
    try{const data=await rpc('adminGetAIReviewImage',token(),viewingId||latest.id);
      if(data?.imageData){showImage('ai2Edited',data.imageData,'ภาพ AI ขนาดเต็ม');message('โหลดภาพขนาดเต็มเรียบร้อยแล้ว');}
    }catch(err){message(err.message,true);}finally{busyState(false);}
  });
  $('ai2Download').addEventListener('click',async()=>{
    if(!approved||busy)return;
    busyState(true);message('กำลังเตรียมไฟล์ภาพที่อนุมัติ…');
    try{
      const result=await rpc('adminDownloadApprovedAI',token(),photo.id);
      const a=e('a');a.href=result.imageData;a.download=result.fileName||'staff_ai_approved.jpg';document.body.append(a);a.click();a.remove();
      message('ดาวน์โหลดภาพที่อนุมัติแล้ว');
    }catch(err){message(err.message,true);}finally{busyState(false);}
  });
  $('ai2Close').addEventListener('click',close);
  shade.addEventListener('click',ev=>{if(ev.target===shade)close();});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&visible&&!busy){ev.preventDefault();close();}});
  window.PersonnelAIReview=Object.freeze({open,close});
})();