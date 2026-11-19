'use strict';
const evidenceBucket = 'pc-ledger-evidence';
let galleryGeneration = 0;
let uploadingEvidence = false;
async function showEvidence() {
  const generation = ++galleryGeneration;
  const gallery = $('#entry-gallery');
  gallery.replaceChildren();
  const files = JSON.parse(entry.elements.attachments.value || '[]');
  for (const file of files) {
    if (!cloudUser || typeof file.path !== 'string' || !file.path.startsWith(cloudUser.id + '/')) continue;
    const {data,error} = await cloud.storage.from(evidenceBucket).createSignedUrl(file.path,600);
    if (generation !== galleryGeneration) return;
    const box = document.createElement('div');
    const link = document.createElement('a');
    link.textContent = file.name || 'เปิดรูป';
    if (!error && data?.signedUrl) {
      link.href = data.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = data.signedUrl; img.alt = file.name || 'หลักฐาน'; link.prepend(img);
    } else link.textContent = 'โหลดรูปไม่ได้ กดแก้ไขรายการเพื่อลองใหม่';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'นำรูปออก';
    remove.onclick = () => {
      entry.elements.attachments.value = JSON.stringify(JSON.parse(entry.elements.attachments.value).filter(item=>item.path !== file.path));
      void showEvidence();
    };
    box.append(link,remove); gallery.append(box);
  }
}
async function uploadEvidence(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return [];
  if (!cloudUser) throw Error('กรุณาล็อกอินก่อนแนบรูป');
  if (files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>5*1024*1024)) throw Error('ใช้รูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 5 MB ต่อรูป');
  const uploaded = [];
  try {
    for (const file of files) {
      const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
      const path = cloudUser.id + '/' + crypto.randomUUID() + '.' + ext;
      const {error} = await cloud.storage.from(evidenceBucket).upload(path,file,{contentType:file.type,upsert:false});
      if (error) throw Error('อัปโหลดรูปไม่ได้ กรุณารัน SQL สำหรับรูปแนบและตรวจอินเทอร์เน็ต');
      uploaded.push({path,name:file.name});
    }
    input.value = '';
    return uploaded;
  } catch(error) {
    if (uploaded.length) await cloud.storage.from(evidenceBucket).remove(uploaded.map(file=>file.path));
    throw error;
  }
}
const previousEntrySubmit = entry.onsubmit;
entry.onsubmit = async event => {
  event.preventDefault();
  if (uploadingEvidence) return;
  uploadingEvidence = true;
  entry.querySelectorAll('button').forEach(button=>button.disabled=true);
  try {
    const old = JSON.parse(entry.elements.attachments.value || '[]');
    if (old.length + $('#entry-files').files.length > 12) throw Error('แนบได้ไม่เกิน 12 รูปต่อรายการ');
    $('#evidence-status').textContent = $('#entry-files').files.length ? 'กำลังอัปโหลดรูป…' : '';
    const added = await uploadEvidence($('#entry-files'));
    entry.elements.attachments.value = JSON.stringify([...old,...added]);
    $('#evidence-status').textContent = 'กำลังบันทึกรายการ…';
    await previousEntrySubmit(event);
    if ($('#editor').open) $('#evidence-status').textContent = 'ยังบันทึกไม่สำเร็จ รูปที่อัปโหลดไว้พร้อมสำหรับลองบันทึกอีกครั้ง';
  } catch(error) { $('#evidence-status').textContent = error.message; }
  finally {
    uploadingEvidence = false;
    entry.querySelectorAll('button').forEach(button=>button.disabled=false);
  }
};
function parseNoteLine(line) {
  const raw = line.trim();
  if (!raw || /^(=|[-—_]{3,}|computer$)/i.test(raw)) return null;
  if (/แลก|ไม่บวก|ไม่เพิ่มเงิน|ซื้อมาขายไป|รวมซื้อ/.test(raw)) {
    return {name:raw,type:/แลก|ไม่บวก|ไม่เพิ่มเงิน/.test(raw)?'swap':'net',amount:'',fee:0,note:'รายการกำกวม ตรวจยอดสุทธิหรือเงินเพิ่มก่อนบันทึก · '+raw,date:'',time:''};
  }
  let valueText = raw.match(/\(([^()]*)\)\s*$/)?.[1];
  let name = valueText ? raw.replace(/\([^()]*\)\s*$/,'').trim() : raw;
  if (!valueText) {
    const match = raw.match(/([+-]?\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|฿)?\s*$/);
    if (!match) return {name:raw,type:/^ขาย/.test(raw)?'sell':'buy',amount:'',fee:0,note:raw,date:'',time:''};
    valueText=match[1]; name=raw.slice(0,match.index).trim();
  }
  const numeric = valueText.replace(/,/g,'').match(/[+-]?\d+(?:\.\d{1,2})?/g) || [];
  const type = /^ขาย/.test(raw) || /^-/.test(valueText.trim()) ? 'sell' : 'buy';
  const shipping = /ค่าส่ง/.test(valueText);
  const amount = shipping ? Math.abs(Number(numeric[0])) : Math.abs(numeric.reduce((sum,n)=>sum+Number(n),0));
  return {name:name.replace(/^(ซื้อ|ขาย)\s*/,''),type,amount:numeric.length?amount:'',fee:shipping?Math.abs(Number(numeric[1]||0)):0,note:raw,date:'',time:''};
}
$('#paste-notes').onclick = () => $('#notes-dialog').showModal();
$('#notes-close').onclick = () => $('#notes-dialog').close();
$('#parse-notes').onclick = () => {
  const box=$('#notes-candidates'); box.replaceChildren();
  const parsed=$('#notes-text').value.split(/\r?\n/).map(parseNoteLine).filter(Boolean);
  const seen=new Set();
  for (const candidate of parsed) {
    const card=document.createElement('section'); card.className='note-candidate';
    const duplicate=state.rows.some(row=>row.name===candidate.name && row.amount===candidate.amount && row.type===candidate.type) || seen.has(JSON.stringify([candidate.name,candidate.amount,candidate.type]));
    seen.add(JSON.stringify([candidate.name,candidate.amount,candidate.type]));
    card.innerHTML='<label><input class="include" type="checkbox"> บันทึกรายการนี้</label><small></small><label>ชื่อ<input name="name" required maxlength="160"></label><div class="fields"><label>ประเภท<select name="type"><option value="buy">ซื้อ</option><option value="sell">ขาย</option><option value="net">ยอดสุทธิ</option><option value="swap">แลก</option></select></label><label>ราคา / เงินเพิ่มตอนแลก<input name="amount" type="number" min="0" max="99999999" step=".01" required></label></div><label>ค่าส่ง / ค่าใช้จ่ายเพิ่ม<input name="fee" type="number" min="0" max="99999999" step=".01"></label><div class="fields"><label>วันซื้อขาย<input name="date" type="date"></label><label>หมดประกัน<input name="warrantyUntil" type="date"></label></div><label>ร้านค้า<input name="seller" maxlength="200"></label><label>รูปถ่าย / หลักฐาน<input class="note-files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>';
    const include=card.querySelector('.include');
    include.checked=!duplicate;
    const updateSelection=()=>card.querySelectorAll('input:not(.include),select').forEach(field=>field.disabled=!include.checked);
    include.onchange=updateSelection;
    updateSelection();
    card.querySelector('small').textContent=duplicate?'อาจซ้ำกับรายการเดิม จึงยังไม่เลือกให้':candidate.note;
    for(const key of ['name','type','amount','fee','date']) card.querySelector('[name='+key+']').value=candidate[key];
    card.dataset.note=candidate.note;
    box.append(card);
  }
  $('#notes-save').hidden=!parsed.length;
  $('#notes-message').textContent=parsed.length ? 'ตรวจข้อมูลที่แยกได้ก่อนยืนยัน วันซื้อขายที่ไม่ระบุจะเว้นว่างไว้' : 'ไม่พบบรรทัดรายการ';
};
$('#notes-review').onsubmit = async event => {
  event.preventDefault();
  const button=$('#notes-save'); if(button.disabled) return;
  const cards=Array.from($('#notes-candidates').children).filter(card=>card.querySelector('.include').checked);
  if(!cards.length) { $('#notes-message').textContent='เลือกรายการที่จะบันทึก'; return; }
  button.disabled=true;
  try {
    const rows=[];
    for(const card of cards) {
      const value=name=>card.querySelector('[name='+name+']').value.trim();
      if(!value('name') || !value('amount') || !price(Number(value('amount'))) || !price(Number(value('fee')))) throw Error('กรอกชื่อและราคาของรายการที่เลือกให้ครบ');
      const input=card.querySelector('.note-files');
      const prior=JSON.parse(card.dataset.attachments || '[]');
      if(prior.length + input.files.length>12) throw Error('แนบได้ไม่เกิน 12 รูปต่อรายการ');
      $('#notes-message').textContent='กำลังอัปโหลดและบันทึก…';
      const attachments=[...prior,...await uploadEvidence(input)];
      card.dataset.attachments=JSON.stringify(attachments);
      rows.push({id:card.dataset.id || (card.dataset.id=crypto.randomUUID()),name:value('name'),type:value('type'),amount:Number(value('amount')),fee:Number(value('fee')),date:value('date'),time:'',part:'',reference:0,note:card.dataset.note,seller:value('seller'),warrantyUntil:value('warrantyUntil'),serial:'',warrantyNote:'',attachments});
    }
    const ok=await save({...state,rows:[...state.rows,...rows]},'เพิ่มรายการจาก Notes แล้ว');
    $('#notes-message').textContent=ok?'บันทึกเรียบร้อย':'ยังบันทึกไม่สำเร็จ ตรวจข้อความสถานะแล้วลองอีกครั้ง';
    if(ok) { $('#notes-dialog').close(); $('#notes-candidates').replaceChildren(); $('#notes-text').value=''; setTab('ledger'); }
  } catch(error) { $('#notes-message').textContent=error.message; }
  finally { button.disabled=false; }
};
