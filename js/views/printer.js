// ---------------------------------------------------------------------------
// Bluetooth thermal printer (58mm, ESC/POS) — Chrome on Android
//
// • The counter tablet pairs once ("Connect printer" in the Staff drawer).
//   Web Bluetooth needs a tap for that first pairing.
// • While the staff page is open, every NEW incoming order (customer pickup or
//   table order — not POS) is printed automatically. Each order prints once per
//   device, even if the page reloads.
// • If the printer drops (out of range, turned off), the app retries and prints
//   anything that was waiting as soon as it is back.
//
// Note: Web Bluetooth only talks to Bluetooth LE (BLE) printers. Most cheap 58mm
// printers sold as "Bluetooth" support BLE too; a few are classic-only.
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { toast } from './ui.js';
import { variantText } from './cart.js';
import { money, fmtDate, fmtTime } from './utils.js';
import { PAY_LABEL } from './whatsapp.js';

const SETTINGS_KEY = 'png_printer';      // { id, name, auto }
const PRINTED_KEY = 'png_printed';       // order ids already printed on this device
const WIDTH = 32;                        // characters per line on 58mm paper (Font A)

// GATT services used by common 58mm BLE receipt printers.
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
];

const readJSON = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let device = null;
let characteristic = null;
let connecting = false;
let retryTimer = null;
let pending = []; // orders waiting for the printer to come back

const settings = () => readJSON(SETTINGS_KEY, {});
const emit = () => window.dispatchEvent(new CustomEvent('printer:change'));

export const printerSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

export function printerState() {
  const s = settings();
  return {
    supported: printerSupported(),
    paired: !!s.id,
    connected: !!characteristic,
    connecting,
    name: s.name || device?.name || 'Printer',
    auto: s.auto !== false,
    waiting: pending.length,
  };
}

// ---------------------------------------------------------------------------
// Connect / reconnect
// ---------------------------------------------------------------------------
async function findWritable(server) {
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    let chars = [];
    try { chars = await svc.getCharacteristics(); } catch { continue; }
    const c = chars.find((ch) => ch.properties.writeWithoutResponse || ch.properties.write);
    if (c) return c;
  }
  return null;
}

function onDisconnected() {
  characteristic = null;
  emit();
  scheduleReconnect();
}

async function attach(dev) {
  if (device !== dev) {
    device?.removeEventListener('gattserverdisconnected', onDisconnected);
    device = dev;
    device.addEventListener('gattserverdisconnected', onDisconnected);
  }
  connecting = true;
  emit();
  try {
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    const ch = await findWritable(server);
    if (!ch) {
      device.gatt.disconnect();
      throw new Error('This printer has no Bluetooth LE print channel. Check that it supports BLE.');
    }
    characteristic = ch;
    clearTimeout(retryTimer);
    retryTimer = null;
    flushPending();
  } finally {
    connecting = false;
    emit();
  }
}

let retries = 0;
function scheduleReconnect() {
  if (!device || retryTimer) return;
  const delay = Math.min(30000, 2000 * 2 ** Math.min(retries, 4)); // 2s, 4s, 8s, 16s, 30s…
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    retries++;
    try {
      await attach(device);
      retries = 0;
    } catch {
      scheduleReconnect();
    }
  }, delay);
}

/** Pair a printer — must be called from a tap. */
export async function connectPrinter() {
  if (!printerSupported()) throw new Error('Bluetooth printing needs Chrome on an Android tablet/phone.');
  // Already paired on this device: try a quiet reconnect first.
  if (device && !characteristic) {
    try { await attach(device); return printerState(); } catch { /* fall back to the picker */ }
  }
  let dev;
  try {
    dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
  } catch (e) {
    if (e.name === 'NotFoundError') throw new Error('No printer selected.');
    throw e;
  }
  await attach(dev);
  const prev = settings();
  writeJSON(SETTINGS_KEY, { id: dev.id, name: dev.name || 'Printer', auto: prev.auto !== false });
  emit();
  return printerState();
}

/** After a reload, reconnect to the saved printer without a tap (where Chrome allows it). */
export async function reconnectSaved() {
  const s = settings();
  if (!s.id || characteristic || connecting || !printerSupported()) return false;
  if (device) { try { await attach(device); return true; } catch { scheduleReconnect(); return false; } }
  if (typeof navigator.bluetooth.getDevices !== 'function') return false;
  try {
    const devices = await navigator.bluetooth.getDevices();
    const dev = devices.find((d) => d.id === s.id);
    if (!dev) return false;
    await attach(dev);
    return true;
  } catch {
    return false;
  }
}

export function forgetPrinter() {
  clearTimeout(retryTimer);
  retryTimer = null;
  try { device?.gatt?.disconnect(); } catch { /* ignore */ }
  device?.removeEventListener('gattserverdisconnected', onDisconnected);
  device = null;
  characteristic = null;
  pending = [];
  localStorage.removeItem(SETTINGS_KEY);
  emit();
}

export function setAutoPrint(on) {
  writeJSON(SETTINGS_KEY, { ...settings(), auto: !!on });
  emit();
}

// ---------------------------------------------------------------------------
// ESC/POS receipt builder
// ---------------------------------------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;

/** Printers only know plain ASCII: swap common symbols, drop the rest (emoji etc.). */
function ascii(s) {
  return String(s ?? '')
    .replace(/[×✕]/g, 'x').replace(/[•·]/g, '-').replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\t/g, ' ')
    .replace(/[^\x20-\x7e\n]/g, '');
}

function wrap(text, width) {
  const out = [];
  ascii(text).split('\n').forEach((para) => {
    let line = '';
    para.trim().split(' ').filter(Boolean).forEach((word) => {
      while (word.length > width) { // very long word: hard-break
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else { out.push(line); line = word; }
    });
    if (line) out.push(line);
  });
  return out.length ? out : [''];
}

class Receipt {
  constructor() { this.bytes = [ESC, 0x40]; } // initialise
  raw(...b) { this.bytes.push(...b); return this; }
  text(s) { for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0)); return this; }
  line(s = '') { return this.text(s).raw(0x0a); }
  align(n) { return this.raw(ESC, 0x61, n); }           // 0 left, 1 centre, 2 right
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(n) { return this.raw(GS, 0x21, n); }             // 0 normal, 0x01 tall, 0x11 big
  hr(ch = '-') { return this.line(ch.repeat(WIDTH)); }
  feed(n = 1) { return this.raw(ESC, 0x64, n); }
  /** Left text and right text on one line; long left text wraps above. */
  cols(left, right = '', width = WIDTH) {
    const r = ascii(right).trim();
    if (r.length > width - 9) { // right side too long to share a line: left, then right-aligned below
      wrap(left, width).forEach((l) => this.line(l));
      wrap(r, width).forEach((l) => this.line(l.padStart(width)));
      return this;
    }
    const lines = wrap(left, Math.max(8, width - r.length - 1));
    const last = lines.pop();
    lines.forEach((l) => this.line(l));
    return this.line(last + ' '.repeat(Math.max(1, width - last.length - r.length)) + r);
  }
  para(s, width = WIDTH, indent = '') {
    wrap(s, width - indent.length).forEach((l) => this.line(indent + l));
    return this;
  }
}

function orderReceipt(o, { reprint = false } = {}) {
  const r = new Receipt();
  const shop = Store.settings?.shopName || 'PICK UP N GO';
  const created = new Date(o.createdAt || Date.now());
  const pad = (n) => String(n).padStart(2, '0');

  r.align(1).bold(true).size(0x11);
  wrap(shop, WIDTH / 2).forEach((l) => r.line(l));
  r.size(0).line(reprint ? '-- REPRINT --' : '*** NEW ORDER ***').bold(false).feed(1);

  if (o.table) {
    r.bold(true).size(0x11).line(`TABLE ${o.table}`).size(0).bold(false).line('Dine-in');
  } else {
    r.bold(true).size(0x01).line(`PICKUP ${fmtTime(o.pickupTime)}`).size(0).bold(false)
      .line(fmtDate(o.pickupDate, false));
  }
  r.align(0).hr();
  r.cols('Order', o.id);
  r.cols('Placed', `${pad(created.getHours())}:${pad(created.getMinutes())} ${pad(created.getDate())}/${pad(created.getMonth() + 1)}`);
  r.cols('Name', o.customer?.name || '-');
  if (o.customer?.phone) r.cols('Phone', o.customer.phone);
  r.hr();

  (o.items || []).forEach((it) => {
    r.bold(true).cols(`${it.qty}x ${it.name}`, money((it.unitPrice || 0) * (it.qty || 1))).bold(false);
    const v = variantText(it.variant);
    if (v) r.para(v, WIDTH, '   ');
    if (it.note) r.para(`Note: ${it.note}`, WIDTH, '   ');
  });
  if (o.specialRequest) { r.hr(); r.bold(true).line('Request:').bold(false).para(o.specialRequest); }

  r.hr();
  if (o.discount > 0) {
    r.cols('Subtotal', money(o.subtotal));
    r.cols(`Discount${o.promoCode ? ` (${o.promoCode})` : ''}`, `-${money(o.discount)}`);
  }
  r.bold(true).size(0x01).cols('TOTAL', money(o.total)).size(0).bold(false);
  const method = o.table && o.payment?.method === 'cash' ? 'Pay at Counter' : (PAY_LABEL?.[o.payment?.method] || o.payment?.method || '-');
  r.cols('Payment', method);
  r.cols('Status', o.payment?.status || '-');
  r.hr().align(1).line('Thank you!').feed(4);
  r.raw(GS, 0x56, 0x42, 0x00); // feed & cut (ignored by printers without a cutter)
  return Uint8Array.from(r.bytes);
}

function testReceipt() {
  const r = new Receipt();
  r.align(1).bold(true).size(0x11).line('TEST PRINT').size(0).bold(false)
    .line(Store.settings?.shopName || 'PICK UP N GO').feed(1).align(0)
    .hr().cols('Printer', printerState().name).cols('Paper', '58mm / 32 chars')
    .cols('Time', new Date().toLocaleTimeString('en-MY')).hr()
    .line('12345678901234567890123456789012')
    .align(1).line('Printer is ready :)').feed(4).raw(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(r.bytes);
}

// ---------------------------------------------------------------------------
// Sending (one job at a time)
// ---------------------------------------------------------------------------
let queue = Promise.resolve();

async function send(bytes) {
  if (!characteristic) {
    await reconnectSaved();
    if (!characteristic) throw Object.assign(new Error('Printer not connected'), { offline: true });
  }
  const ch = characteristic;
  const noResponse = ch.properties.writeWithoutResponse && typeof ch.writeValueWithoutResponse === 'function';
  const CHUNK = 20; // safe for every BLE printer
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.slice(i, i + CHUNK);
    if (noResponse) { await ch.writeValueWithoutResponse(part); await sleep(8); }
    else if (typeof ch.writeValueWithResponse === 'function') await ch.writeValueWithResponse(part);
    else await ch.writeValue(part);
  }
}

function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

export function printOrder(order, opts = {}) {
  return enqueue(() => send(orderReceipt(order, opts)));
}

export function testPrint() {
  return enqueue(() => send(testReceipt()));
}

function flushPending() {
  const jobs = pending;
  pending = [];
  jobs.forEach((id) => {
    const o = Store.order(id);
    if (o) printOrder(o).catch(() => { pending.push(id); emit(); });
  });
  emit();
}

// ---------------------------------------------------------------------------
// Auto-print new orders (staff devices with a paired printer)
// ---------------------------------------------------------------------------
const printed = () => readJSON(PRINTED_KEY, []);
function markPrinted(id) {
  const ids = printed();
  if (!ids.includes(id)) { ids.unshift(id); writeJSON(PRINTED_KEY, ids.slice(0, 300)); }
}

let known = null;

export function startAutoPrint() {
  if (!printerSupported()) return;
  known = new Set(Store.orders.map((o) => o.id));
  if (Store.isStaff()) reconnectSaved();

  Store.on((topic) => {
    if (topic === 'auth') {
      known = null; // staff order list loads next — snapshot it, don't print old orders
      if (Store.isStaff()) reconnectSaved();
      return;
    }
    if (!['orders', 'sync'].includes(topic)) return;
    const s = settings();
    if (known && Store.isStaff() && s.id && s.auto !== false) {
      Store.orders.forEach((o) => {
        if (known.has(o.id)) return;
        const recent = Date.now() - (o.createdAt || 0) < 10 * 60 * 1000;
        if (!recent || o.source === 'pos' || o.status !== 'Pending Confirmation') return;
        if (printed().includes(o.id)) return;
        markPrinted(o.id);
        printOrder(o).then(
          () => toast(`🖨️ Printed ${o.id}`, 'success', 2500),
          (e) => {
            pending.push(o.id);
            emit();
            toast(e.offline ? `Printer offline — ${o.id} will print when it reconnects` : `Print failed: ${e.message}`, 'error', 5000);
            if (e.offline) scheduleReconnect();
          }
        );
      });
    }
    known = new Set(Store.orders.map((o) => o.id));
  });

  // Tablet woke up / tab back in front: make sure the printer is still there.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Store.isStaff() && settings().id && !characteristic) reconnectSaved();
  });
}
