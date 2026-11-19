'use strict';
const $ = selector => document.querySelector(selector);
const storageKey = 'pc-ledger-v1';
const labels = {buy:'ซื้อ', sell:'ขาย', swap:'แลก', net:'ยอดสุทธิ'};
const money = new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:0,maximumFractionDigits:2});
const baht = cents => money.format(cents / 100);
const cents = amount => Math.round(amount * 100);
const delta = row => (row.type === 'sell' ? -1 : 1) * cents(row.amount) + cents(row.fee);
const clean = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function webUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
const string = value => typeof value === 'string';
const price = value => Number.isFinite(value) && value >= 0 && value <= 99999999;
function validate(data) {
  return data?.version === 1 && Array.isArray(data.rows) && Array.isArray(data.parts)
    && data.rows.every(row => row && ['id','name','part','note','date','time'].every(key => string(row[key])) && Object.hasOwn(labels,row.type) && ['amount','fee','reference'].every(key => price(row[key])))
    && data.parts.every(part => part && ['id','category','name','detail','image','source'].every(key => string(part[key])))
    && new Set(data.rows.map(row => row.id)).size === data.rows.length
    && new Set(data.parts.map(part => part.id)).size === data.parts.length;
}
let state = {version:1,rows:seed,parts:specs};
let timer;
function status(message) {
  $('#status').textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => { $('#status').textContent = ''; }, 4800);
}
try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (validate(stored)) state = stored;
  else if (stored) status('เปิดข้อมูลเดิมไม่ได้ จึงแสดงข้อมูลเริ่มต้น');
} catch { status('เปิดข้อมูลเดิมไม่ได้ จึงแสดงข้อมูลเริ่มต้น'); }
function save(next, message) {
  try { localStorage.setItem(storageKey,JSON.stringify(next)); }
  catch { status('บันทึกไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์'); return false; }
  state = next;
  render();
  status(message);
  return true;
}
function renderLedger() {
  let balance = 0, buys = 0, sales = 0, fees = 0, net = 0, swaps = 0, bought = 0, sold = 0;
  const history = state.rows.map(row => {
    balance += delta(row);
    fees += cents(row.fee);
    if (row.type === 'buy') { buys += cents(row.amount); bought++; }
    if (row.type === 'sell') { sales += cents(row.amount); sold++; }
    if (row.type === 'net') net += cents(row.amount);
    if (row.type === 'swap') swaps += cents(row.amount);
    return {row,balance};
  });
  $('#total').textContent = baht(balance);
  $('#buys').textContent = baht(buys);
  $('#sales').textContent = baht(sales);
  $('#buy-count').textContent = bought + ' รายการซื้อ';
  $('#sell-count').textContent = sold + ' รายการขาย ก่อนหักค่าส่ง';
  $('#balance-note').textContent = 'ยอดสุทธิ = ยอดซื้อ − ยอดขาย + ค่าใช้จ่ายเพิ่ม ' + baht(fees) + ' + ยอดสุทธิจาก Notes ' + baht(net) + ' + เงินเพิ่มตอนแลก ' + baht(swaps);
  const query = $('#search').value.trim().toLowerCase(), filter = $('#filter').value;
  const filtered = history.filter(({row}) => (!filter || row.type === filter) && (row.name + ' ' + row.note).toLowerCase().includes(query)).reverse();
  $('#count').textContent = filtered.length + ' จาก ' + history.length + ' รายการ · บันทึกล่าสุดอยู่บนสุด';
  $('#empty').hidden = filtered.length > 0;
  $('#empty').textContent = history.length
    ? 'ไม่พบรายการที่ตรงกับตัวกรอง'
    : 'เริ่มด้วยการเพิ่มรายการ หรือกดกู้ข้อมูลเพื่อนำเข้าประวัติเดิม';
  $('#rows').innerHTML = filtered.map(({row,balance}) => {
    const details = [row.note, row.reference && 'มูลค่าอ้างอิง ' + baht(cents(row.reference)), row.fee && 'ค่าใช้จ่ายเพิ่ม ' + baht(cents(row.fee))].filter(Boolean).join(' · ');
    const date = [row.date && row.date.split('-').reverse().join('/'),row.time].filter(Boolean).join(' · ');
    const signed = delta(row);
    return `<tr role="row"><td role="cell"><strong>${clean(row.name)}</strong>${details ? '<small>'+clean(details)+'</small>' : ''}</td><td role="cell"><span class="tag ${row.type}">${labels[row.type]}</span></td><td role="cell" class="date">${clean(date || '—')}</td><td role="cell" class="money ${signed < 0 ? 'income' : ''}">${signed < 0 ? '+' : signed > 0 ? '−' : ''}${baht(Math.abs(signed))}</td><td role="cell" class="money">${baht(balance)}</td><td role="cell"><button class="edit" data-edit="${clean(row.id)}" aria-label="แก้ไข ${clean(row.name)}">แก้ไข</button></td></tr>`;
  }).join('');
}
function renderParts() {
  $('#parts').innerHTML = state.parts.map(part => {
    const image = webUrl(part.image), source = webUrl(part.source);
    const records = state.rows.filter(row => row.part === part.id);
    const latest = records.filter(row => row.type === 'buy' || row.type === 'swap').at(-1);
    const reference = latest?.type === 'swap' ? latest.reference : 0;
    const priceText = reference ? 'มูลค่าตอนแลกประมาณ ' + baht(cents(reference)) : records.length ? 'ซื้อ / แลกที่บันทึก ' + baht(records.filter(row=>row.type==='buy'||row.type==='swap').reduce((sum,row)=>sum+delta(row),0)) : 'ยังไม่มีราคาที่เชื่อมไว้';
    return `<article class="part">${image ? '<img loading="lazy" referrerpolicy="no-referrer" src="'+clean(image)+'" alt="'+clean(part.name)+'">' : ''}<div class="part-body"><div class="part-head"><span class="tag">${clean(part.category)}</span><button class="edit" data-part="${clean(part.id)}" aria-label="แก้ไข ${clean(part.name)}">แก้ไข</button></div><h2>${clean(part.name)}</h2><p>${clean(part.detail)}</p><p class="linked">${priceText}</p>${source ? '<a target="_blank" rel="noopener noreferrer" href="'+clean(source)+'">แหล่งรูปอ้างอิง ↗</a>' : ''}</div></article>`;
  }).join('') || '<p>ยังไม่มีอุปกรณ์ในสเปก</p>';
  $('#parts').querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.hidden = true; }));
}
function render() { renderLedger(); renderParts(); }
function setTab(tab) {
  for (const button of document.querySelectorAll('[data-tab]')) {
    const active = button.dataset.tab === tab;
    if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    $('#' + button.dataset.tab).hidden = !active;
  }
}
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => setTab(button.dataset.tab));
$('#search').oninput = renderLedger;
$('#filter').onchange = renderLedger;
const entry = $('#entry'), partForm = $('#part-form');
let entryId, partId;
function typeFields() {
  const type = entry.elements.type.value;
  $('#amount-label').textContent = type === 'swap' ? 'เงินเพิ่มตอนแลก (บาท)' : type === 'sell' ? 'ราคาขาย (บาท)' : 'ราคา (บาท)';
  $('#ref-field').hidden = type !== 'swap';
}
entry.elements.type.onchange = () => {
  if (entry.elements.type.value === 'swap' && !entry.elements.amount.value) entry.elements.amount.value = 0;
  typeFields();
};
function fill(form, row) {
  form.reset();
  if (row) for (const field of form.elements) if (field.name && Object.hasOwn(row,field.name)) field.value = row[field.name];
}
function openEntry(row) {
  entryId = row?.id;
  $('#entry-title').textContent = row ? 'แก้ไขรายการ' : 'เพิ่มรายการ';
  $('#part-select').innerHTML = '<option value="">ไม่ระบุ</option>' + state.parts.map(part => '<option value="'+clean(part.id)+'">'+clean(part.name)+'</option>').join('');
  fill(entry,row);
  entry.querySelector('.delete').hidden = !row;
  typeFields();
  $('#editor').showModal();
}
function openPart(part) {
  partId = part?.id;
  $('#part-title').textContent = part ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์';
  fill(partForm,part);
  partForm.querySelector('.delete').hidden = !part;
  $('#part-editor').showModal();
}
$('#add').onclick = () => openEntry();
$('#add-part').onclick = () => openPart();
$('#rows').onclick = event => {
  const button = event.target.closest('[data-edit]');
  if (button) openEntry(state.rows.find(row => row.id === button.dataset.edit));
};
$('#parts').onclick = event => {
  const button = event.target.closest('[data-part]');
  if (button) openPart(state.parts.find(part => part.id === button.dataset.part));
};
document.querySelectorAll('.close').forEach(button => button.onclick = () => button.closest('dialog').close());
function formRecord(form) { return Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,value.trim()])); }
function upsert(records, record, id) { return id ? records.map(item => item.id === id ? record : item) : [...records,record]; }
entry.onsubmit = event => {
  event.preventDefault();
  const fields = formRecord(entry);
  if (!fields.name) { status('กรอกชื่อรายการ'); return; }
  if (fields.time && !fields.date) { status('กรอกวันที่ด้วยเมื่อระบุเวลา'); return; }
  const row = {...fields,id:entryId || crypto.randomUUID(),amount:Number(fields.amount),fee:Number(fields.fee),reference:fields.type === 'swap' ? Number(fields.reference) : 0};
  if (save({...state,rows:upsert(state.rows,row,entryId)},'บันทึกรายการแล้ว')) {
    $('#editor').close();
    setTab('ledger');
    if (!entryId) { $('#filter').value = ''; $('#search').value = ''; renderLedger(); }
  }
};
partForm.onsubmit = event => {
  event.preventDefault();
  const fields = formRecord(partForm);
  if (!fields.name || !fields.category) { status('กรอกชื่อและหมวดอุปกรณ์'); return; }
  if ([fields.image,fields.source].some(value => value && !webUrl(value))) { status('ใช้ลิงก์รูปและแหล่งที่มาที่ขึ้นต้นด้วย HTTPS หรือ HTTP'); return; }
  const part = {...fields,id:partId || crypto.randomUUID()};
  if (save({...state,parts:upsert(state.parts,part,partId)},'บันทึกอุปกรณ์แล้ว')) $('#part-editor').close();
};
entry.querySelector('.delete').onclick = () => {
  if (entryId && confirm('ลบรายการนี้และคำนวณยอดใหม่ใช่ไหม?') && save({...state,rows:state.rows.filter(row => row.id !== entryId)},'ลบรายการแล้ว')) $('#editor').close();
};
partForm.querySelector('.delete').onclick = () => {
  if (partId && confirm('ลบอุปกรณ์นี้จากสเปกปัจจุบัน? ประวัติซื้อขายยังอยู่')) {
    const next = {...state,parts:state.parts.filter(part => part.id !== partId),rows:state.rows.map(row => row.part === partId ? {...row,part:''} : row)};
    if (save(next,'ลบอุปกรณ์แล้ว')) $('#part-editor').close();
  }
};
$('#export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pc-ledger-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('#import').onclick = () => $('#backup').click();
$('#backup').onchange = async event => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    const next = JSON.parse(await file.text());
    if (!validate(next)) throw new Error('invalid backup');
    if (confirm('ใช้ข้อมูลจากไฟล์สำรองแทนประวัติซื้อขายและสเปกในเบราว์เซอร์นี้ใช่ไหม?')) save(next,'กู้ข้อมูลแล้ว');
  } catch { status('อ่านไฟล์สำรองไม่ได้ กรุณาเลือกไฟล์ JSON ที่ส่งออกจาก PC Ledger'); }
};
render();
