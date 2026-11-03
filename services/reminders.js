const crypto = require('node:crypto');
const { query } = require('../db');

function getDeviceId(value) {
  return String(value || process.env.DEFAULT_DEVICE_ID || 'xiaozhi').slice(0, 128);
}

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function mapReminder(row) {
  return {
    id: row.id,
    title: row.title,
    dueAt: new Date(row.due_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function listReminders(deviceId, scope = 'today') {
  const owner = getDeviceId(deviceId);
  const rows = scope === 'upcoming'
    ? await query('SELECT id,title,due_at,created_at FROM reminders WHERE device_id=? AND due_at >= NOW() ORDER BY due_at LIMIT 100', [owner])
    : await query("SELECT id,title,due_at,created_at FROM reminders WHERE device_id=? AND (due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date ORDER BY due_at LIMIT 100", [owner]);
  return { available: true, date: localDate(), scope, count: rows.length, items: rows.map(mapReminder) };
}

async function addReminder(deviceId, title, dueAt) {
  const cleanTitle = String(title || '').trim();
  const timestamp = Date.parse(String(dueAt || ''));
  if (!cleanTitle || cleanTitle.length > 120 || !Number.isFinite(timestamp)) {
    const error = new Error('Cần title tối đa 120 ký tự và due_at là thời gian ISO hợp lệ');
    error.status = 400;
    throw error;
  }
  if (timestamp < Date.now() - 60000) {
    const error = new Error('Thời gian nhắc việc phải ở hiện tại hoặc tương lai');
    error.status = 400;
    throw error;
  }
  const owner = getDeviceId(deviceId);
  const count = await query('SELECT COUNT(*) AS total FROM reminders WHERE device_id=?', [owner]);
  if (Number(count[0]?.total || 0) >= 100) {
    const error = new Error('Đã đạt giới hạn 100 lời nhắc cho thiết bị');
    error.status = 507;
    throw error;
  }
  const id = crypto.randomUUID();
  const date = new Date(timestamp);
  await query('INSERT INTO reminders(id,device_id,title,due_at) VALUES(?,?,?,?)', [id, owner, cleanTitle, date.toISOString()]);
  return { id, title: cleanTitle, dueAt: date.toISOString(), createdAt: new Date().toISOString() };
}

async function deleteReminder(deviceId, id) {
  const owner = getDeviceId(deviceId);
  const rows = await query('SELECT id,title,due_at,created_at FROM reminders WHERE id=? AND device_id=? LIMIT 1', [id, owner]);
  if (!rows.length) {
    const error = new Error('Không tìm thấy lời nhắc');
    error.status = 404;
    throw error;
  }
  await query('DELETE FROM reminders WHERE id=? AND device_id=?', [id, owner]);
  return mapReminder(rows[0]);
}

module.exports = { getDeviceId, localDate, mapReminder, listReminders, addReminder, deleteReminder };
