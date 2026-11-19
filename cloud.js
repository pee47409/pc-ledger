'use strict';
const cloud = supabase.createClient(
  'https://gkhikrggtyrdaxqgyefp.supabase.co',
  'sb_publishable_sf8UHnHZ2NALCNpJDr1TzQ_6887XnbC',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}
);
let cloudUser = null;
let revision = 0;
let saving = false;
let loading = false;
let ready = false;
let authGeneration = 0;
let cloudError = '';
const blankLedger = () => ({version:1,rows:[],parts:[]});

function lockLedger(message = '') {
  ready = false;
  cloudUser = null;
  revision = 0;
  state = blankLedger();
  render();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('#workspace').hidden = true;
  $('#auth-panel').hidden = false;
  $('#auth-message').textContent = message;
  $('#login-password').value = '';
}

function cloudMessage(error) {
  if (['42P01','PGRST202','PGRST205'].includes(error?.code)) {
    return 'ยังไม่ได้ตั้งฐานข้อมูล กรุณารันไฟล์ supabase-setup.sql ใน SQL Editor';
  }
  if (error?.code === '42501') return 'บัญชีนี้ยังไม่มีสิทธิ์ กรุณาตรวจการตั้งค่าเจ้าของใน Supabase';
  return 'เชื่อมต่อไม่สำเร็จ ตรวจอินเทอร์เน็ตหรือสถานะโปรเจกต์ แล้วลองอีกครั้ง';
}

async function loadCloud() {
  if (loading || saving || !cloudUser) return false;
  loading = true;
  const generation = authGeneration;
  $('#sync-label').textContent = 'กำลังโหลดข้อมูล…';
  try {
    const {data,error} = await cloud.from('pc_ledger_state').select('data,revision').eq('owner_id',cloudUser.id).maybeSingle();
    if (error) throw error;
    if (generation !== authGeneration) return false;
    if (data && !validate(data.data)) throw new Error('invalid state');
    state = data ? data.data : blankLedger();
    revision = data ? data.revision : 0;
    render();
    ready = true;
    cloudError = '';
    $('#sync-label').textContent = 'ข้อมูลล่าสุดจากคลาวด์';
    return true;
  } catch (error) {
    if (generation !== authGeneration) return false;
    cloudError = cloudMessage(error);
    $('#sync-label').textContent = cloudError;
    status(cloudError);
    return false;
  } finally {
    loading = false;
  }
}

async function openCloud(session) {
  const generation = ++authGeneration;
  lockLedger('กำลังตรวจสอบสิทธิ์…');
  if (!session) { $('#auth-message').textContent = ''; return; }
  try {
    const {data,error} = await cloud.from('pc_ledger_owners').select('user_id').eq('user_id',session.user.id).maybeSingle();
    if (generation !== authGeneration) return;
    if (error) throw error;
    if (!data) {
      lockLedger('บัญชีนี้ไม่ได้รับสิทธิ์เข้า PC Ledger');
      return;
    }
    cloudUser = session.user;
    $('#account-label').textContent = session.user.email;
    $('#auth-panel').hidden = true;
    $('#workspace').hidden = false;
    await loadCloud();
  } catch (error) {
    if (generation === authGeneration) lockLedger(cloudMessage(error));
  }
}

async function saveCloud(next, message) {
  if (!ready || !cloudUser) { status(cloudError || 'กรุณาโหลดข้อมูลให้สำเร็จก่อนบันทึก'); return false; }
  if (saving || loading) { status('กำลังเชื่อมต่อ กรุณารอสักครู่'); return false; }
  if (!validate(next)) { status('ข้อมูลรายการไม่ถูกต้อง'); return false; }
  saving = true;
  const generation = authGeneration;
  $('#sync-label').textContent = 'กำลังบันทึก…';
  try {
    const {data,error} = await cloud.rpc('save_pc_ledger',{p_expected_revision:revision,p_data:next});
    if (error) throw error;
    if (generation !== authGeneration) return false;
    if (!data?.length) {
      ready = false;
      $('#sync-label').textContent = 'มีข้อมูลใหม่จากอีกเครื่อง กดโหลดล่าสุดก่อนแก้ไขอีกครั้ง';
      status('ข้อมูลเปลี่ยนจากอีกเครื่องแล้ว เก็บข้อความที่กำลังแก้ไข แล้วกดโหลดล่าสุด');
      return false;
    }
    revision = data[0].revision;
    state = next;
    render();
    $('#sync-label').textContent = 'บันทึกบนคลาวด์แล้ว';
    status(message);
    return true;
  } catch (error) {
    ready = false;
    cloudError = cloudMessage(error);
    $('#sync-label').textContent = cloudError + ' · กดโหลดล่าสุดก่อนบันทึกอีกครั้ง';
    status('ยังยืนยันการบันทึกไม่ได้ เก็บข้อความที่กรอกไว้แล้วกดโหลดล่าสุด');
    return false;
  } finally {
    saving = false;
  }
}

$('#login-form').onsubmit = async event => {
  event.preventDefault();
  const button = $('#login-submit');
  button.disabled = true;
  $('#auth-message').textContent = 'กำลังเข้าสู่ระบบ…';
  try {
    const {data,error} = await cloud.auth.signInWithPassword({
      email:$('#login-email').value.trim(),
      password:$('#login-password').value
    });
    if (error) {
      $('#auth-message').textContent = error.status === 400
        ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่ได้ยืนยัน'
        : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง';
      return;
    }
    await openCloud(data.session);
  } catch {
    $('#auth-message').textContent = 'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง';
  } finally {
    $('#login-password').value = '';
    button.disabled = false;
  }
};
$('#logout').onclick = async () => {
  if (saving) { status('รอบันทึกให้เสร็จก่อนออกจากระบบ'); return; }
  ++authGeneration;
  lockLedger();
  const {error} = await cloud.auth.signOut({scope:'local'});
  if (error) $('#auth-message').textContent = 'ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง';
};
$('#auth-logout').onclick = () => $('#logout').click();
$('#reload-cloud').onclick = async () => {
  if (saving || loading) return;
  if (document.querySelector('dialog[open]') && !confirm('เก็บข้อความที่กำลังแก้ไขไว้ก่อน โหลดข้อมูลล่าสุดและปิดแบบฟอร์มนี้ใช่ไหม?')) return;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  await loadCloud();
};
$('#migrate-local').onclick = async () => {
  try {
    const previous = JSON.parse(localStorage.getItem(storageKey));
    if (!validate(previous)) { status('ไม่พบข้อมูลเดิมในเบราว์เซอร์นี้ ใช้ปุ่มกู้ข้อมูลเพื่อนำเข้า JSON'); return; }
    if (confirm('นำข้อมูลเดิมในเบราว์เซอร์นี้มาแทนข้อมูลบนคลาวด์ใช่ไหม?')) {
      await saveCloud(previous,'ย้ายข้อมูลเดิมขึ้นคลาวด์แล้ว');
    }
  } catch { status('อ่านข้อมูลเดิมไม่ได้ ใช้ไฟล์สำรอง JSON แทน'); }
};
cloud.auth.onAuthStateChange((event,session) => {
  if (event === 'SIGNED_OUT') { ++authGeneration; lockLedger(); }
  if (event === 'SIGNED_IN' && session?.user.id !== cloudUser?.id) {
    setTimeout(() => { if (!loading && !$('#login-submit').disabled) void openCloud(session); },0);
  }
});
void cloud.auth.getSession().then(({data,error}) => {
  if (error) lockLedger('อ่านสถานะล็อกอินไม่ได้ กรุณาเข้าสู่ระบบอีกครั้ง');
  else void openCloud(data.session);
}).catch(() => lockLedger('เชื่อมต่อไม่ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง'));

setInterval(() => {
  if (!document.hidden && ready && !saving && !loading && !document.querySelector('dialog[open]')) void loadCloud();
},30000);
window.addEventListener('focus',() => {
  if (ready && !saving && !loading && !document.querySelector('dialog[open]')) void loadCloud();
});
