// ---------------------------------------------------------------------------
// Pickup scheduling rules: business hours, blocked dates, slot capacity,
// preparation time. Used by checkout (customer) and validated again on save.
// ---------------------------------------------------------------------------
import { Store } from './store.js';
import { todayStr, addDays, parseDate, timeToMin, minToTime, fmtTime, fmtDate } from './utils.js';

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export function dayInfo(date) {
  const s = Store.settings;
  const today = todayStr();
  if (date < today) return { closed: true, reason: 'Past date' };
  if (date > addDays(today, s.maxAdvanceDays)) return { closed: true, reason: 'Too far ahead' };
  if ((s.blockedDates || []).includes(date)) return { closed: true, reason: 'Unavailable' };
  const hours = s.businessHours[parseDate(date).getDay()];
  if (!hours || hours.closed) return { closed: true, reason: 'Closed' };
  return { closed: false, open: hours.open, close: hours.close };
}

/** Every configured slot for a date with its live availability. */
export function slotsForDate(date) {
  const s = Store.settings;
  const info = dayInfo(date);
  const isToday = date === todayStr();
  const earliest = nowMinutes() + Number(s.prepTime || 0);
  return [...(s.slots || [])].sort().map((time) => {
    const t = timeToMin(time);
    const used = Store.slotCount(date, time);
    const left = Math.max(0, s.maxPerSlot - used);
    let state = 'available';
    let note = left <= 2 ? `${left} left` : 'Available';
    if (info.closed) { state = 'closed'; note = info.reason; }
    else if ((s.disabledSlots || []).includes(time)) { state = 'disabled'; note = 'Unavailable'; }
    else if (t < timeToMin(info.open) || t > timeToMin(info.close)) { state = 'closed'; note = 'Outside hours'; }
    else if (isToday && t < earliest) { state = 'past'; note = 'Too soon'; }
    else if (left <= 0) { state = 'full'; note = 'Full'; }
    return { time, state, left, used, note, label: fmtTime(time) };
  });
}

export function upcomingDates() {
  const out = [];
  for (let i = 0; i <= Store.settings.maxAdvanceDays; i++) {
    const date = addDays(todayStr(), i);
    const info = dayInfo(date);
    const slots = info.closed ? [] : slotsForDate(date);
    const open = slots.filter((x) => x.state === 'available').length;
    const anyFull = slots.some((x) => x.state === 'full');
    if (!info.closed && open === 0 && !anyFull) { info.closed = true; info.reason = 'No slots'; }
    out.push({ date, ...info, openSlots: open, full: !info.closed && open === 0 });
  }
  return out;
}

/** Earliest available slot for an "Immediate" pickup (today only). */
export function immediateSlot() {
  const today = todayStr();
  const slot = slotsForDate(today).find((x) => x.state === 'available');
  return slot ? { date: today, time: slot.time } : null;
}

export function firstAvailable() {
  for (const d of upcomingDates()) {
    if (d.closed) continue;
    const slot = slotsForDate(d.date).find((x) => x.state === 'available');
    if (slot) return { date: d.date, time: slot.time };
  }
  return null;
}

/** Throws a friendly error if the slot cannot be booked right now. */
export function assertSlotBookable(date, time) {
  if (!date || !time) throw new Error('Please choose a pickup date and time.');
  const slot = slotsForDate(date).find((x) => x.time === time);
  if (!slot) throw new Error('That pickup time is not offered.');
  if (slot.state === 'full') throw new Error(`Sorry, ${fmtTime(time)} on ${fmtDate(date, false)} just became full. Please pick another time.`);
  if (slot.state !== 'available') throw new Error(`${fmtTime(time)} on ${fmtDate(date, false)} is not available (${slot.note}).`);
}

/** Helper for admins: generate slots between open/close at an interval. */
export function generateSlots(open, close, interval) {
  const out = [];
  for (let t = timeToMin(open); t <= timeToMin(close); t += Number(interval)) out.push(minToTime(t));
  return out;
}
