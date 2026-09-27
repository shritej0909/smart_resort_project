import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ragAnswer, invalidateRagIndex } from './rag.mjs';
import { analyzeFeedback } from './sentiment.mjs';
import { pricingScenario, priceScenario } from './pricing.mjs';
import { sbInsert, sbSelect } from './supabase.mjs';
import { seedResortData } from './seedData.mjs';
import { classifyAndRouteHospitalityRequest, getNugenStatus, isNugenConfigured } from './nugen.mjs';
import { getLiveWeather } from './weatherService.mjs';
import { getPublicSignals } from './publicSignals.mjs';
import { getDigitalTwinState, calculateWeatherImpact } from './digitalTwin.mjs';


const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, 'data'), { recursive: true });

const hotelInfoJsonPath = path.join(here, 'data', 'hotel_info.json');

function readHotelInfoData() {
  if (existsSync(hotelInfoJsonPath)) {
    try {
      const content = readFileSync(hotelInfoJsonPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error('[HotelInfo] Error reading hotel_info.json:', e.message);
    }
  }
  return {
    resort_name: "Smart Resort 360",
    tagline: "Luxury 5-Star Beachfront Resort Goa",
    last_updated: new Date().toISOString(),
    dynamic_pricing_system: {
      engine: "Machine Learning Demand & Seasonality Engine with Auto-Reset Timeline",
      reset_timeline_options: ["24h", "48h", "72h", "168h", "custom_calendar"],
      rooms: [
        { id: "standard", name: "Garden Room", current_rate: 6500, base_rate: 6500, is_surge_active: false, price_flow: "Original Base Rate (₹6,500) [Active - No Surge]" },
        { id: "suite", name: "Ocean Suite", current_rate: 14500, base_rate: 14500, is_surge_active: false, price_flow: "Original Base Rate (₹14,500) [Active - No Surge]" },
        { id: "villa", name: "Private Pool Villa", current_rate: 28000, base_rate: 28000, is_surge_active: false, price_flow: "Original Base Rate (₹28,000) [Active - No Surge]" }
      ],
      recent_pricing_timeline_events: []
    }
  };
}

function writeHotelInfoData(data) {
  try {
    data.last_updated = new Date().toISOString();
    writeFileSync(hotelInfoJsonPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[HotelInfo] Error writing hotel_info.json:', e.message);
  }
}

function getSyncedHotelInfo() {
  const data = readHotelInfoData();
  const now = Date.now();
  let changed = false;

  // 1. Check auto-reset for expired surge rates
  if (data.dynamic_pricing_system?.rooms) {
    for (const r of data.dynamic_pricing_system.rooms) {
      if (r.is_surge_active && r.expires_at) {
        const expTime = new Date(r.expires_at).getTime();
        if (expTime <= now) {
          const fromPrice = r.current_rate;
          r.current_rate = r.base_rate;
          r.is_surge_active = false;
          r.applied_at = null;
          r.expires_at = null;
          r.duration_hours = null;
          r.remaining_seconds = 0;
          r.remaining_time = null;
          r.price_flow = `Original Base Rate (₹${r.base_rate.toLocaleString('en-IN')}) [Active - No Surge]`;

          // Sync to SQLite rates & rooms
          db.prepare('INSERT OR REPLACE INTO rates (id, amount, updated_at, updated_by) VALUES (?, ?, ?, ?)').run(
            r.id, r.base_rate, new Date().toISOString(), 'system_auto_reset'
          );
          const typeMap = { standard: 'Garden Room', suite: 'Ocean Suite', villa: 'Private Pool Villa' };
          if (typeMap[r.id]) {
            db.prepare('UPDATE rooms SET price_per_night = ? WHERE type = ?').run(r.base_rate, typeMap[r.id]);
          }

          data.dynamic_pricing_system.recent_pricing_timeline_events = data.dynamic_pricing_system.recent_pricing_timeline_events || [];
          data.dynamic_pricing_system.recent_pricing_timeline_events.unshift({
            id: randomUUID(),
            room_id: r.id,
            room_name: r.name,
            from_price: fromPrice,
            to_price: r.base_rate,
            action: 'AUTO_RESET_EXPIRED',
            duration_hours: null,
            expires_at: null,
            created_at: new Date().toISOString()
          });
          changed = true;
        } else {
          r.remaining_seconds = Math.max(0, Math.floor((expTime - now) / 1000));
          const h = Math.floor(r.remaining_seconds / 3600);
          const m = Math.floor((r.remaining_seconds % 3600) / 60);
          r.remaining_time = `${h}h ${m}m`;
        }
      } else {
        r.remaining_seconds = 0;
        r.remaining_time = null;
      }
    }
  }

  // 2. Synchronize current rates with SQLite rates table
  try {
    const dbRates = db.prepare('SELECT * FROM rates').all();
    const ratesMap = Object.fromEntries(dbRates.map(r => [r.id, r.amount]));
    if (data.dynamic_pricing_system?.rooms) {
      for (const r of data.dynamic_pricing_system.rooms) {
        if (ratesMap[r.id] !== undefined && ratesMap[r.id] !== r.current_rate) {
          r.current_rate = ratesMap[r.id];
          r.is_surge_active = r.current_rate > r.base_rate;
          if (!r.is_surge_active) {
            r.price_flow = `Original Base Rate (₹${r.base_rate.toLocaleString('en-IN')}) [Active - No Surge]`;
          }
          changed = true;
        }
      }
    }
  } catch (e) {
    console.error('[HotelInfo] Error reading db rates:', e.message);
  }

  if (changed) {
    writeHotelInfoData(data);
    invalidateRagIndex();
  }

  return data;
}

// ── SQLite ────────────────────────────────────────────────────────────────────
const db = new DatabaseSync(process.env.DB_PATH || path.join(here, 'data', 'portal.sqlite'));
db.exec(`PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users     (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, room TEXT, salt TEXT, password TEXT);
CREATE TABLE IF NOT EXISTS sessions  (token TEXT PRIMARY KEY, user_id TEXT, expires INTEGER);
CREATE TABLE IF NOT EXISTS requests  (id TEXT PRIMARY KEY, user_id TEXT, category TEXT, title TEXT, detail TEXT, total INTEGER, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS bookings  (
  id TEXT PRIMARY KEY,
  guest_id TEXT,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  room_number TEXT,
  room_type TEXT,
  check_in TEXT,
  check_out TEXT,
  nights INTEGER,
  guests INTEGER,
  price_per_night INTEGER,
  total_amount INTEGER,
  payment_status TEXT,
  booking_status TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS feedback  (id TEXT PRIMARY KEY, user_id TEXT, rating INTEGER, comment TEXT, analysis TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS rates     (id TEXT PRIMARY KEY, amount INTEGER, updated_at TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS concierge_logs (id TEXT PRIMARY KEY, user_id TEXT, question TEXT, answer TEXT, mode TEXT, model TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS pricing_logs   (id TEXT PRIMARY KEY, user_id TEXT, inputs TEXT, result TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS rooms     (
  room_number TEXT PRIMARY KEY, floor INTEGER, type TEXT, price_per_night INTEGER, status TEXT,
  guest_name TEXT, guest_age INTEGER, guest_gender TEXT, guest_email TEXT, guest_phone TEXT,
  check_in TEXT, check_out TEXT, guest_count INTEGER, vip_tier TEXT, special_requests TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS maintenance_equipment (
  id TEXT PRIMARY KEY, name TEXT, location TEXT, type TEXT, status TEXT, health INTEGER,
  last_maintenance TEXT, next_due TEXT, failure_probability INTEGER, issue TEXT, estimated_cost TEXT
);
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id TEXT PRIMARY KEY, equipment_id TEXT, equipment_name TEXT, task TEXT, priority TEXT,
  technician TEXT, scheduled_date TEXT, duration TEXT, status TEXT, estimated_cost TEXT, notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS staff_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, role TEXT, department TEXT, status TEXT, shift TEXT,
  hours INTEGER, efficiency INTEGER, avatar TEXT, phone TEXT, email TEXT,
  experience_years INTEGER, assigned_area TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS staff_recommendations (
  id INTEGER PRIMARY KEY,
  type TEXT, title TEXT, description TEXT, impact TEXT, action TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, category TEXT, stock REAL, unit TEXT, min_stock REAL, max_stock REAL,
  status TEXT, trend TEXT, demand REAL, cost REAL, supplier TEXT, last_restocked TEXT
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  supplier TEXT, items_count INTEGER, total_amount TEXT, numeric_amount INTEGER,
  status TEXT, expected_date TEXT, created_at TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS inventory_insights (
  id INTEGER PRIMARY KEY,
  priority TEXT, title TEXT, description TEXT, recommendation TEXT, savings TEXT,
  status TEXT, action_type TEXT
);
CREATE TABLE IF NOT EXISTS revenue_calculations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  calculation_data TEXT,
  daily_revenue INTEGER,
  weekly_revenue INTEGER,
  monthly_revenue INTEGER,
  created_at TEXT
);
`);


// ── Seed users & resort data ──────────────────────────────────────────────────
function seedUser(id, email, name, role, room, password) {
  if (db.prepare('SELECT id FROM users WHERE id = ?').get(id)) return;
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, name, role, room, salt, scryptSync(password, salt, 64).toString('hex'));
}
const defaultGuestPass = process.env.GUEST_PASSWORD || 'Guest@360!';
const defaultManagerPass = process.env.MANAGER_PASSWORD || 'Manager@360!';
if (process.env.NODE_ENV === 'production' && (!process.env.GUEST_PASSWORD || !process.env.MANAGER_PASSWORD)) {
  console.warn('[Security] GUEST_PASSWORD or MANAGER_PASSWORD not set in environment. Using standard demo credentials (Guest@360! / Manager@360!).');
}
seedUser('guest-1',   'guest@smartresort.demo',   'Alex Morgan',   'guest',   '204', defaultGuestPass);
seedUser('guest-2',   'guest2@smartresort.demo',  'Jamie Lee',     'guest',   '308', defaultGuestPass);
seedUser('manager-1', 'manager@smartresort.demo', 'Priya Sharma',  'manager', '',    defaultManagerPass);
seedResortData(db);

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Cache-control + CSRF header check on all /api routes
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-SR360') !== 'portal')
    return res.status(403).json({ error: 'Request verification failed.' });
  next();
});

// ── Auth helpers ──────────────────────────────────────────────────────────────
const digest = token => token ? createHash('sha256').update(token).digest('hex') : '';
const tokenOf = req => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('sr360='))?.slice(6);
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' };
const publicUser = row => ({ id: row.id, email: row.email, name: row.name, role: row.role, room: row.room });
const textValid = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const attempts = new Map();

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const key = req.ip;
  const now = Date.now();
  const attempt = attempts.get(key);
  if (attempt && attempt.until > now && attempt.count >= 10)
    return res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' });
  const identifier = (typeof req.body.email === 'string' ? req.body.email : (typeof req.body.id === 'string' ? req.body.id : '')).trim();
  const { password, role } = req.body;
  if (!identifier || typeof password !== 'string' || password.length > 256 || !['guest', 'manager'].includes(role))
    return res.status(400).json({ error: 'Enter your email or Guest Login ID, password and portal.' });
  const user = db.prepare('SELECT * FROM users WHERE (LOWER(email) = LOWER(?) OR id = ? OR UPPER(id) = UPPER(?)) AND role = ?').get(identifier, identifier, identifier, role);
  const actual = scryptSync(password, user?.salt || 'invalid-user-salt', 64);
  const expected = user ? Buffer.from(user.password, 'hex') : Buffer.alloc(64);
  if (!timingSafeEqual(actual, expected) || !user || user.role !== role) {
    const current = attempt && attempt.until > now ? attempt : { count: 0, until: now + 900000 };
    current.count++; attempts.set(key, current);
    return res.status(401).json({ error: 'The credentials do not match this portal.' });
  }
  attempts.delete(key);
  const oldToken = tokenOf(req);
  if (oldToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(oldToken));
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), user.id, now + 8 * 3600000);
  res.cookie('sr360', token, { ...cookieOptions, maxAge: 8 * 3600000 }).json(publicUser(user));
});

// Always allow logout regardless of current session expiration state
app.post('/api/auth/logout', (req, res) => {
  const token = tokenOf(req);
  if (token) {
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(token));
    } catch {
      // Ignore if session already deleted
    }
  }
  res.clearCookie('sr360', cookieOptions).json({ ok: true });
});

// ── Room Booking & Real-Time 150-Room Inventory Architecture ──────────────────
function normalizeDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m1) {
    const d = m1[1].padStart(2, '0');
    const m = m1[2].padStart(2, '0');
    const y = m1[3];
    return `${y}-${m}-${d}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function addDays(dateStr, days) {
  const norm = normalizeDate(dateStr) || '2026-09-27';
  const [y, m, d] = norm.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(startStr, endStr) {
  const d1 = new Date(normalizeDate(startStr) || '2026-09-27');
  const d2 = new Date(normalizeDate(endStr) || '2026-09-30');
  const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 1;
}

function normalizeRoomType(input) {
  if (!input) return null;
  const s = String(input).toLowerCase();
  if (s.includes('deluxe') || s.includes('ocean view')) return 'Deluxe Ocean View';
  if (s.includes('presidential')) return 'Presidential Suite';
  if (s.includes('pool villa') || s.includes('private pool')) return 'Private Pool Suite';
  if (s.includes('garden villa')) return 'Garden Villa';
  if (s.includes('garden') || s.includes('standard king') || s.includes('standard')) return 'Standard King';
  if (s.includes('suite') || s.includes('ocean suite')) return 'Private Pool Suite';
  return null;
}

// Seed room 047 booked from 2026-09-27 to 2026-09-30 as benchmark demo case
try {
  const existing047 = db.prepare('SELECT id FROM bookings WHERE room_number = ?').get('047');
  if (!existing047) {
    db.prepare(`
      INSERT INTO bookings (
        id, guest_id, guest_name, guest_email, guest_phone,
        room_number, room_type, check_in, check_out,
        nights, guests, price_per_night, total_amount,
        payment_status, booking_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'SR-2026-00047', 'GUEST-47DEMO', 'Vikram Malhotra', 'vikram.m@smartresort.demo', '+91 98200 11047',
      '047', 'Deluxe Ocean View', '2026-09-27', '2026-09-30',
      3, 2, 18500, 55500, 'SUCCESS', 'CONFIRMED', '2026-09-26T10:00:00.000Z'
    );
  }
} catch (e) {
  console.warn('[Seed 047]', e.message);
}

function checkRoomAvailability(checkIn, checkOut, requestedType = null, roomNumberPreference = null) {
  const normCheckIn = normalizeDate(checkIn);
  const normCheckOut = normalizeDate(checkOut);
  if (!normCheckIn || !normCheckOut || normCheckIn >= normCheckOut) {
    return { available: false, reason: 'Invalid check-in and check-out dates.' };
  }

  // 1. Fetch all 150 rooms
  const allRooms = db.prepare('SELECT * FROM rooms WHERE status != ?').all('Maintenance');

  // 2. Fetch all confirmed bookings with overlapping dates:
  // Overlap condition: (booking.check_in < normCheckOut AND booking.check_out > normCheckIn)
  const overlappingBookings = db.prepare(`
    SELECT room_number, check_in, check_out 
    FROM bookings 
    WHERE booking_status = 'CONFIRMED' 
      AND check_in < ? 
      AND check_out > ?
  `).all(normCheckOut, normCheckIn);

  const unavailableRoomNumbers = new Set(overlappingBookings.map(b => String(b.room_number)));

  // 3. Also check current room records in rooms table:
  for (const r of allRooms) {
    if (r.status === 'Occupied' && r.check_in && r.check_out) {
      const occStart = normalizeDate(r.check_in);
      const occEnd = normalizeDate(r.check_out);
      if (occStart && occEnd) {
        if (occStart < normCheckOut && occEnd > normCheckIn) {
          unavailableRoomNumbers.add(String(r.room_number));
        }
      } else {
        unavailableRoomNumbers.add(String(r.room_number));
      }
    }
  }

  // 4. Available rooms
  const available = allRooms.filter(r => !unavailableRoomNumbers.has(String(r.room_number)));

  // 5. If specific room number preference requested (e.g. '047' or '105')
  if (roomNumberPreference) {
    const pref = String(roomNumberPreference).trim();
    if (unavailableRoomNumbers.has(pref) || unavailableRoomNumbers.has(pref.padStart(3, '0'))) {
      return {
        available: false,
        reason: `Room ${pref} is already booked for dates ${normCheckIn} to ${normCheckOut}.`,
        totalChecked: allRooms.length,
        unavailableCount: unavailableRoomNumbers.size,
        availableCount: available.length,
        alternativeRooms: available.slice(0, 3)
      };
    }
    const foundPref = available.find(r => r.room_number === pref || r.room_number === pref.padStart(3, '0'));
    if (foundPref) {
      return {
        available: true,
        room: foundPref,
        availableCount: available.length,
        allAvailable: available
      };
    }
  }

  // 6. Filter by requested room type
  const normType = normalizeRoomType(requestedType);
  let matchedRooms = available;
  if (normType) {
    const exact = available.filter(r => r.type.toLowerCase() === normType.toLowerCase());
    if (exact.length > 0) {
      matchedRooms = exact;
    } else {
      const partial = available.filter(r => r.type.toLowerCase().includes(normType.toLowerCase()) || normType.toLowerCase().includes(r.type.toLowerCase()));
      if (partial.length > 0) matchedRooms = partial;
    }
  }

  if (matchedRooms.length === 0) {
    return {
      available: false,
      reason: normType ? `All rooms of type "${normType}" are fully booked between ${normCheckIn} and ${normCheckOut}.` : 'No rooms available for the selected dates.',
      totalChecked: allRooms.length,
      unavailableCount: unavailableRoomNumbers.size,
      availableCount: 0,
      allAvailable: [],
      alternativeRooms: available.slice(0, 3)
    };
  }

  return {
    available: true,
    room: matchedRooms[0],
    availableCount: matchedRooms.length,
    allAvailable: matchedRooms,
    totalChecked: allRooms.length,
    unavailableCount: unavailableRoomNumbers.size
  };
}

function generateGuestCredentials(guestName, roomNumber) {
  const randNum = String(Math.floor(10000 + Math.random() * 90000));
  const bookingId = `SR-2026-${randNum}`;
  const randCode = randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  const guestId = `GUEST-${randCode}`;
  const pwSuffix = randomBytes(2).toString('hex').slice(0, 2);
  const password = `Palms@${randNum.slice(0, 3)}!${pwSuffix}`;
  return { bookingId, guestId, password };
}

// ── Room Booking API Endpoints ────────────────────────────────────────────────
app.post('/api/bookings/check-availability', (req, res) => {
  const { check_in, check_out, nights, room_type, guests, room_number } = req.body;
  const start = normalizeDate(check_in) || '2026-09-27';
  const numNights = Number(nights) || (check_out ? daysBetween(start, normalizeDate(check_out)) : 3);
  const end = check_out ? normalizeDate(check_out) : addDays(start, numNights);

  const result = checkRoomAvailability(start, end, room_type, room_number);
  if (!result.available) {
    return res.json({
      available: false,
      reason: result.reason,
      check_in: start,
      check_out: end,
      nights: numNights,
      alternativeRooms: result.alternativeRooms || []
    });
  }

  const room = result.room;
  const pricePerNight = room.price_per_night;
  const totalAmount = pricePerNight * numNights;
  const gName = (req.body.guestName || req.body.guest_name || 'Resort Guest').trim();
  const gEmail = req.body.guestEmail || req.body.guest_email || `${gName.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.smartresort.demo`;
  const gPhone = req.body.guestPhone || req.body.guest_phone || '+91 98200 55321';

  const summary = {
    room_number: room.room_number,
    room_type: room.type,
    roomNumber: room.room_number,
    roomType: room.type,
    floor: room.floor,
    check_in: start,
    check_out: end,
    checkIn: start,
    checkOut: end,
    nights: numNights,
    guests: Number(guests) || 2,
    guest_name: gName,
    guestName: gName,
    guest_email: gEmail,
    guestEmail: gEmail,
    guest_phone: gPhone,
    guestPhone: gPhone,
    price_per_night: pricePerNight,
    pricePerNight: pricePerNight,
    total_amount: totalAmount,
    totalAmount: totalAmount,
  };

  res.json({
    available: true,
    room: {
      room_number: room.room_number,
      room_type: room.type,
      floor: room.floor,
      price_per_night: pricePerNight,
    },
    summary,
    check_in: start,
    check_out: end,
    checkIn: start,
    checkOut: end,
    nights: numNights,
    guests: Number(guests) || 2,
    total_amount: totalAmount,
    totalAmount: totalAmount,
    available_count: result.availableCount
  });
});

app.post('/api/bookings/confirm', (req, res) => {
  const details = req.body.bookingDetails || req.body || {};
  let room_number = details.room_number || details.roomNumber;
  let room_type = details.room_type || details.roomType;
  let check_in = details.check_in || details.checkIn;
  let check_out = details.check_out || details.checkOut;
  let nights = details.nights;
  let guests = details.guests;
  let guest_name = details.guest_name || details.guestName;
  let guest_email = details.guest_email || details.guestEmail;
  let guest_phone = details.guest_phone || details.guestPhone;
  let price_per_night = details.price_per_night || details.pricePerNight;
  let total_amount = details.total_amount || details.totalAmount;

  if (!guest_name || !guest_name.trim()) guest_name = 'Resort Guest';
  if (!guest_email || !guest_email.trim()) guest_email = `${guest_name.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.smartresort.demo`;
  if (!guest_phone || !guest_phone.trim()) guest_phone = '+91 98200 55321';

  const start = normalizeDate(check_in) || '2026-09-27';
  const numNights = Number(nights) || 3;
  const end = check_out ? normalizeDate(check_out) : addDays(start, numNights);

  // 1. Strict concurrency / double-booking check
  const availCheck = checkRoomAvailability(start, end, room_type, room_number);
  if (!availCheck.available) {
    if (availCheck.allAvailable && availCheck.allAvailable.length > 0) {
      room_number = availCheck.allAvailable[0].room_number;
      room_type = availCheck.allAvailable[0].type;
      price_per_night = availCheck.allAvailable[0].price_per_night;
      total_amount = price_per_night * numNights;
    } else {
      return res.status(409).json({
        error: 'No rooms are available for the selected dates. Double-booking prevented.',
        reason: availCheck.reason
      });
    }
  } else {
    room_number = availCheck.room.room_number;
    room_type = availCheck.room.type;
    price_per_night = availCheck.room.price_per_night;
    total_amount = price_per_night * numNights;
  }

  // 2. Generate unique guest credentials & booking ID
  const { bookingId, guestId, password } = generateGuestCredentials(guest_name, room_number);

  // 3. Store credentials in users table
  const salt = randomBytes(16).toString('hex');
  const hashedPassword = scryptSync(password, salt, 64).toString('hex');

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(guest_email.toLowerCase());
  let finalEmail = guest_email.toLowerCase();
  if (existingUser) {
    const parts = finalEmail.split('@');
    finalEmail = `${parts[0]}+${guestId.toLowerCase().slice(-4)}@${parts[1] || 'smartresort.demo'}`;
  }

  db.prepare(`
    INSERT INTO users (id, email, name, role, room, salt, password)
    VALUES (?, ?, ?, 'guest', ?, ?, ?)
  `).run(guestId, finalEmail, guest_name.trim(), room_number, salt, hashedPassword);

  // 4. Store booking in bookings table
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO bookings (
      id, guest_id, guest_name, guest_email, guest_phone,
      room_number, room_type, check_in, check_out,
      nights, guests, price_per_night, total_amount,
      payment_status, booking_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', 'CONFIRMED', ?)
  `).run(
    bookingId, guestId, guest_name.trim(), finalEmail, guest_phone,
    room_number, room_type, start, end,
    numNights, Number(guests) || 2, price_per_night, total_amount,
    nowIso
  );

  // 5. Update rooms table
  db.prepare(`
    UPDATE rooms 
    SET status = 'Occupied',
        guest_name = ?,
        guest_email = ?,
        guest_phone = ?,
        check_in = ?,
        check_out = ?,
        guest_count = ?,
        special_requests = ?,
        notes = ?
    WHERE room_number = ?
  `).run(
    guest_name.trim(),
    finalEmail,
    guest_phone,
    start,
    end,
    Number(guests) || 2,
    `Confirmed Reservation #${bookingId}`,
    `Guest Login ID: ${guestId}. Payment: SUCCESS (Demo). Total: ₹${total_amount}`,
    room_number
  );

  // 6. Transmit to Manager Workspace requests queue
  const reqId = randomUUID();
  const reqDetail = `Confirmed Booking ${bookingId} · Room ${room_number} (${room_type}) · Dates: ${start} to ${end} (${numNights} nights, ${guests || 2} guests) · Total: ₹${total_amount.toLocaleString('en-IN')} · Payment: SUCCESS (Demo) · Guest Login: ${guestId}`;
  db.prepare(`
    INSERT INTO requests (id, user_id, category, title, detail, total, status, created_at)
    VALUES (?, ?, 'Special request', ?, ?, ?, 'New', ?)
  `).run(reqId, guestId, `New Room Booking: ${bookingId}`, reqDetail, total_amount, nowIso);

  res.json({
    ok: true,
    booking: {
      booking_id: bookingId,
      guest_name: guest_name.trim(),
      room_number: room_number,
      room_type: room_type,
      check_in: start,
      check_out: end,
      nights: numNights,
      guests: Number(guests) || 2,
      price_per_night: price_per_night,
      total_amount: total_amount,
      payment_status: 'SUCCESS',
      booking_status: 'CONFIRMED'
    },
    credentials: {
      guest_id: guestId,
      email: finalEmail,
      password: password
    },
    bookingId: bookingId,
    guestName: guest_name.trim(),
    roomNumber: room_number,
    roomType: room_type,
    checkIn: start,
    checkOut: end,
    nights: numNights,
    guests: Number(guests) || 2,
    pricePerNight: price_per_night,
    totalAmount: total_amount,
    guestLoginId: guestId,
    guestPassword: password
  });
});

app.post('/api/bookings/failure-request', (req, res) => {
  const { guest_name, check_in, check_out, nights, guests, room_type, reason } = req.body;
  const reqId = randomUUID();
  const start = normalizeDate(check_in) || '2026-09-27';
  const numNights = Number(nights) || 3;
  const end = check_out ? normalizeDate(check_out) : addDays(start, numNights);
  const gName = (guest_name || '').trim() || 'Guest';

  const detail = `Automated room booking could not be completed: ${reason || 'Capacity exceeded / availability check failed'}. Requested: ${room_type || 'Room'} for ${start} to ${end} (${numNights} nights, ${guests || 2} guests). Status: PENDING / MANAGER_REVIEW.`;

  db.prepare(`
    INSERT INTO requests (id, user_id, category, title, detail, total, status, created_at)
    VALUES (?, 'guest-1', 'Special request', ?, ?, 0, 'New', ?)
  `).run(reqId, `Room Booking Request (PENDING / MANAGER_REVIEW)`, detail, new Date().toISOString());

  res.json({
    ok: true,
    requestId: reqId,
    status: 'PENDING / MANAGER_REVIEW',
    message: `Your booking request has been forwarded to our Resort Management team (Request #${reqId.slice(0, 8)}). A manager will review and contact you shortly.`
  });
});

app.get('/api/bookings/:id', (req, res, next) => {
  if (req.params.id === 'my-stay') return next();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking });
});

// ── Nugen Domain Intelligence Endpoints (HackCelestial 3.0 Task 2) ───────────
app.get('/api/nugen/status', (req, res) => {
  res.json(getNugenStatus());
});

app.post('/api/nugen/classify', async (req, res) => {
  const message = req.body?.message || req.body?.text || '';
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const result = await classifyAndRouteHospitalityRequest(message);
  res.json(result);
});

// ── Weather & Digital Twin Endpoints (HackCelestial 3.0 Challenge 1) ─────────
app.get('/api/weather/current', async (req, res) => {
  try {
    const weather = await getLiveWeather();
    res.json(weather.current);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve live weather' });
  }
});

app.get('/api/weather/forecast', async (req, res) => {
  try {
    const weather = await getLiveWeather();
    res.json(weather);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve weather forecast' });
  }
});

app.get('/api/weather/signals', async (req, res) => {
  try {
    const weather = await getLiveWeather();
    const signals = getPublicSignals(weather.current);
    res.json(signals);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve public signals' });
  }
});

app.get('/api/digital-twin/weather/state', async (req, res) => {
  try {
    const state = await getDigitalTwinState(db);
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve digital twin state: ' + e.message });
  }
});

app.post('/api/digital-twin/weather/simulate', (req, res) => {
  try {
    const { rainfall, temperature, wind, duration } = req.body || {};
    const totalRooms = 150;
    const occupiedRows = db.prepare("SELECT COUNT(*) AS count FROM rooms WHERE status = 'Occupied'").get();
    const occupied = occupiedRows?.count || 117;

    const simulation = calculateWeatherImpact(
      { rainfall, temperature, wind, duration },
      { totalRooms, occupiedRooms: occupied }
    );
    res.json(simulation);
  } catch (e) {
    res.status(500).json({ error: 'Digital twin simulation failed: ' + e.message });
  }
});

// ── AI Concierge — open to all (no session required) ─────────────────────────
app.post('/api/concierge/chat', async (req, res) => {

  if (!textValid(req.body.message, 2000))
    return res.status(400).json({ error: 'Ask a question up to 2,000 characters.' });

  // Fetch current live dynamic rates from rates table
  const rateRows = db.prepare('SELECT id, amount FROM rates').all();
  const liveRates = {
    standard: { name: 'Garden Room', amount: rateRows.find(r => r.id === 'standard')?.amount || 6500 },
    suite:    { name: 'Ocean Suite', amount: rateRows.find(r => r.id === 'suite')?.amount || 14500 },
    villa:    { name: 'Private Pool Villa', amount: rateRows.find(r => r.id === 'villa')?.amount || 28000 },
  };

  const userMsg = req.body.message.trim();
  const token = tokenOf(req);
  const sessionUser = token && db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND expires > ?').get(digest(token), Date.now());
  const userId = sessionUser ? sessionUser.id : 'anonymous';

  // ── 0. NUGEN HOSPITALITY DOMAIN INTELLIGENCE ────────────────────────────────
  const nugenDomain = await classifyAndRouteHospitalityRequest(userMsg);

  // If Nugen identifies maintenance request:
  if (nugenDomain.action === 'create_maintenance_request' || nugenDomain.intent === 'maintenance_request') {
    const roomNum = nugenDomain.room_number || (sessionUser?.room || '204');
    const equipName = nugenDomain.entities?.equipment || 'Air Conditioner';
    const issueText = nugenDomain.entities?.issue || userMsg;
    const priority = nugenDomain.priority === 'critical' ? 'Critical' : 'High';
    const taskId = 'task-' + randomUUID().slice(0, 8);
    const reqId = randomUUID();
    const now = new Date().toISOString();

    // 1. Insert into requests table so it appears in Manager Workspace -> Requests queue
    db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      reqId, userId, 'Maintenance', `Room ${roomNum} - ${equipName} Maintenance`,
      `[Nugen AI Intelligence] Priority: ${priority}. Issue: ${issueText}. Room: ${roomNum}.`,
      0, 'New', now
    );

    // 2. Insert into maintenance_tasks table
    db.prepare(`
      INSERT INTO maintenance_tasks (
        id, equipment_id, equipment_name, task, priority, technician, scheduled_date, duration, status, estimated_cost, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId, 'eq-room-' + roomNum, equipName, `Repair and test ${equipName} in Room ${roomNum}: ${issueText}`,
      priority, 'Engineering & Maintenance Specialist', 'Immediate Dispatch', '45 mins', 'Scheduled',
      '₹0 (In-House Guest Service)', `Auto-generated by Nugen Domain Intelligence (Score: ${nugenDomain.confidence_score || 99}%)`, now
    );

    // 3. Decrement maintenance inventory stock
    try {
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 0.5) WHERE name = 'Pool Chemicals'").run();
    } catch {}

    const ans = `🔧 **Maintenance Request Dispatched — Room ${roomNum}**\n\nNugen Hospitality Model identified an operational maintenance request for **${equipName}** in **Room ${roomNum}** (Priority: **${priority.toUpperCase()}**).\n\n• **Work Order:** #${taskId.slice(0, 8)}\n• **Request Ticket:** #${reqId.slice(0, 8)}\n• **Assigned Team:** Engineering & Rapid Maintenance Specialist\n• **Status:** Dispatched to Manager Workspace\n\nOur duty technician has been notified and is proceeding to Room ${roomNum}.`;

    const id = randomUUID();
    db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, userId, userMsg, ans, 'nugen-maintenance-ops', nugenDomain.model, now
    );

    return res.json({
      answer: ans,
      mode: 'nugen-hospitality-ops',
      model: nugenDomain.model,
      sources: [
        { id: 'nugen-intelligence', title: `Nugen Model · ${nugenDomain.model}` },
        { id: 'maintenance-ops', title: 'Live Resort Engineering Pipeline' }
      ],
      nugen: {
        used: true,
        model: nugenDomain.model,
        intent: nugenDomain.intent,
        category: nugenDomain.category,
        priority: nugenDomain.priority,
        room_number: roomNum,
        action: nugenDomain.action,
        confidence: nugenDomain.confidence_score,
        entities: nugenDomain.entities
      }
    });
  }

  // If Nugen identifies housekeeping request:
  if (nugenDomain.action === 'create_housekeeping_request' || nugenDomain.intent === 'housekeeping_request') {
    const roomNum = nugenDomain.room_number || (sessionUser?.room || '108');
    const items = nugenDomain.entities?.items || ['towels and amenities'];
    const itemsStr = Array.isArray(items) ? items.join(', ') : String(items);
    const reqId = randomUUID();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      reqId, userId, 'Housekeeping', `Room ${roomNum} - Housekeeping Service`,
      `[Nugen AI Intelligence] Guest requested: ${itemsStr}. Room: ${roomNum}.`,
      0, 'New', now
    );

    try {
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 1) WHERE name = 'Toilet Paper'").run();
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 1) WHERE name = 'Shampoo Bottles'").run();
    } catch {}

    const ans = `🧹 **Housekeeping Request Confirmed — Room ${roomNum}**\n\nNugen Hospitality Model has logged your housekeeping request for **${itemsStr}**.\n\n• **Request Ticket:** #${reqId.slice(0, 8)}\n• **Room Number:** ${roomNum}\n• **Status:** Dispatched to Floor Housekeeping\n\nOur floor attendant will deliver your items within 15 minutes.`;

    const id = randomUUID();
    db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, userId, userMsg, ans, 'nugen-housekeeping-ops', nugenDomain.model, now
    );

    return res.json({
      answer: ans,
      mode: 'nugen-housekeeping-ops',
      model: nugenDomain.model,
      sources: [
        { id: 'nugen-intelligence', title: `Nugen Model · ${nugenDomain.model}` },
        { id: 'housekeeping-ops', title: 'Live Floor Housekeeping' }
      ],
      nugen: {
        used: true,
        model: nugenDomain.model,
        intent: nugenDomain.intent,
        category: nugenDomain.category,
        priority: nugenDomain.priority,
        room_number: roomNum,
        action: nugenDomain.action,
        confidence: nugenDomain.confidence_score,
        entities: nugenDomain.entities
      }
    });
  }

  // If Nugen identifies guest complaint / high-urgency service escalation:
  if (nugenDomain.action === 'create_service_request' || nugenDomain.intent === 'guest_complaint') {
    const roomNum = nugenDomain.room_number || (sessionUser?.room || 'Guest Room');
    const reqId = randomUUID();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      reqId, userId, 'Special request', `URGENT GUEST CONCERN — Room ${roomNum}`,
      `[Nugen AI Escalation] High-priority guest complaint: "${userMsg}". Immediate duty manager intervention required.`,
      0, 'New', now
    );

    const ans = `⭐ **Resort Management Immediate Priority Alert**\n\nWe sincerely apologize for any inconvenience caused. Nugen Hospitality Intelligence has escalated this directly to our **Duty General Manager** with **CRITICAL PRIORITY**.\n\n• **Incident Ticket:** #${reqId.slice(0, 8)}\n• **Escalated To:** Front Office & Executive Housekeeping Manager\n• **Resolution Target:** Under 10 minutes\n\nA senior team leader will attend to Room ${roomNum} immediately to ensure your stay is completely rectified.`;

    const id = randomUUID();
    db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, userId, userMsg, ans, 'nugen-complaint-escalation', nugenDomain.model, now
    );

    return res.json({
      answer: ans,
      mode: 'nugen-complaint-escalation',
      model: nugenDomain.model,
      sources: [
        { id: 'nugen-intelligence', title: `Nugen Model · ${nugenDomain.model}` },
        { id: 'manager-escalation', title: 'Executive Duty Manager Queue' }
      ],
      nugen: {
        used: true,
        model: nugenDomain.model,
        intent: nugenDomain.intent,
        category: nugenDomain.category,
        priority: 'high',
        room_number: roomNum,
        action: nugenDomain.action,
        confidence: nugenDomain.confidence_score,
        entities: nugenDomain.entities
      }
    });
  }

  // If Nugen identifies weather impact / digital twin analysis:
  if (nugenDomain.action === 'weather_impact_analysis' || nugenDomain.intent === 'weather_impact') {
    const liveWeather = await getLiveWeather().catch(() => null);
    const tempStr = liveWeather ? `${liveWeather.current.temperature}°C (${liveWeather.current.condition})` : '29°C (Coastal Goa)';
    const rainStr = liveWeather ? `${liveWeather.current.precipitation} mm` : '0.0 mm';
    const tomorrowStr = liveWeather ? `${liveWeather.forecast_tomorrow.condition}, ${liveWeather.forecast_tomorrow.rain_probability}% rain probability` : 'Passing showers';

    const ans = `🌦️ **Smart Resort 360 — Digital Twin Live Weather Advisory**\n\nNugen Domain Intelligence has evaluated your inquiry against our **Digital Twin Micro-Climate Telemetry** (Current: **${tempStr}**, Rain: **${rainStr}**, Tomorrow: **${tomorrowStr}**):\n\n• **Outdoor Infinity Pool & Sunbeds:** Outdoor pool recreation is temporarily suspended during active precipitation for guest safety.\n• **Beach Water Sports:** Jet-skiing, parasailing, and catamaran sailing are safely rescheduled to tomorrow afternoon.\n• **Protected Indoor Experiences:**\n  • **Serenity Hydrotherapy Suite & Spa:** Open until 09:00 PM with heated jacuzzi and Swedish massage therapy.\n  • **Oceanfront Covered Yoga Pavilion:** Complimentary indoor sunset mindfulness session at 05:30 PM.\n  • **The Palms Fine Dining & In-Room Artisan Dining:** Operating normally with 24/7 service.\n\nWould you like me to book a Serenity Spa package or reserve an indoor table at The Palms for you today?`;

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, userId, userMsg, ans, 'nugen-weather-digital-twin', nugenDomain.model, now
    );

    return res.json({
      answer: ans,
      mode: 'nugen-weather-digital-twin',
      model: nugenDomain.model,
      sources: [
        { id: 'nugen-intelligence', title: `Nugen Model · ${nugenDomain.model}` },
        { id: 'digital-twin', title: 'Digital Twin Micro-Climate Simulator' }
      ],
      nugen: {
        used: true,
        model: nugenDomain.model,
        intent: nugenDomain.intent,
        category: nugenDomain.category,
        priority: nugenDomain.priority,
        action: nugenDomain.action,
        confidence: nugenDomain.confidence_score,
        entities: nugenDomain.entities
      }
    });
  }

  // If Nugen identifies dynamic pricing query:
  if (nugenDomain.action === 'query_pricing_system' || nugenDomain.intent === 'pricing_request') {
    const gRate = (liveRates.standard?.amount || 6500).toLocaleString('en-IN');
    const sRate = (liveRates.suite?.amount || 14500).toLocaleString('en-IN');
    const vRate = (liveRates.villa?.amount || 28000).toLocaleString('en-IN');

    const ans = `🏷️ **Smart Resort 360 — Live Dynamic Pricing Intelligence**\n\nNugen Domain Model evaluated current demand curves and live inventory rates:\n\n• **Garden Room:** **₹${gRate}** / night (Best value accommodation with pool access)\n• **Ocean Suite:** **₹${sRate}** / night (Direct Arabian Sea view & private balcony)\n• **Private Pool Villa:** **₹${vRate}** / night (Plunge pool, butler service, breakfast included)\n\n✨ **Savings Insight:** Weekday stays (Monday through Thursday) offer our lowest rate tier. For maximum savings tomorrow, our **Garden Room** at ₹${gRate} offers full resort luxury amenities at our most accessible tariff.\n\nWould you like me to check availability and start your reservation for the Garden Room?`;

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, userId, userMsg, ans, 'nugen-dynamic-pricing', nugenDomain.model, now
    );

    return res.json({
      answer: ans,
      mode: 'nugen-dynamic-pricing',
      model: nugenDomain.model,
      sources: [
        { id: 'nugen-intelligence', title: `Nugen Model · ${nugenDomain.model}` },
        { id: 'dynamic-pricing', title: 'Live Dynamic Revenue System' }
      ],
      nugen: {
        used: true,
        model: nugenDomain.model,
        intent: nugenDomain.intent,
        category: nugenDomain.category,
        priority: nugenDomain.priority,
        action: nugenDomain.action,
        confidence: nugenDomain.confidence_score,
        entities: nugenDomain.entities
      }
    });
  }

  // ── 1. ROOM BOOKING INTENT DETECTION ──────────────────────────────────────────
  const roomBookingAction = req.body.roomBookingAction || null; // 'check' | 'confirm' | 'fail'
  const hasRoomBookingIntent = Boolean(
    roomBookingAction ||
    req.body.isRoomBooking ||
    nugenDomain.action === 'start_booking_workflow' ||
    nugenDomain.intent === 'room_booking' ||
    (/\b(book|reserve|reservation|stay)\b/i.test(userMsg) &&
     (/\b(room|suite|villa|night|nights|days|residence|deluxe|presidential|king|staying)\b/i.test(userMsg) ||
      /\b(for\s+\d+\s+(days|nights))\b/i.test(userMsg)))
  );


  if (hasRoomBookingIntent) {
    // Parameter extraction
    let nights = req.body.nights || null;
    if (!nights) {
      const nm = userMsg.match(/(\d+)\s*(?:night|nights|day|days)/i);
      if (nm) nights = parseInt(nm[1], 10);
    }

    let checkIn = req.body.check_in || req.body.checkIn || null;
    if (!checkIn) {
      const dm = userMsg.match(/(?:from|on|check-?in|date[:\s]+)\s*(\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|\d{4}-\d{2}-\d{2})/i) ||
                 userMsg.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i) ||
                 userMsg.match(/(\d{4}-\d{2}-\d{2})/i);
      if (dm) checkIn = normalizeDate(dm[1]);
    }

    let guests = req.body.guests || null;
    if (!guests) {
      const gm = userMsg.match(/(\d+)\s*(?:guest|guests|adult|adults|person|people)/i);
      if (gm) guests = parseInt(gm[1], 10);
    }

    let roomType = req.body.room_type || req.body.roomType || normalizeRoomType(userMsg);

    let guestName = req.body.guest_name || req.body.guestName || null;
    if (!guestName) {
      const nam = userMsg.match(/(?:my name is|i am|name[:\s]+)\s*([A-Za-z\s]+?)(?:,|\.|\sand\s|\sfor\s|$)/i);
      if (nam && nam[1].trim().length >= 2 && !/^(booking|room|reserving|looking|wanting)$/i.test(nam[1].trim())) {
        guestName = nam[1].trim();
      }
    }

    const defaultNights = nights || 3;
    const defaultGuests = guests || 2;
    const normType = roomType || 'Deluxe Ocean View';

    // If critical fields (guestName or checkIn) are missing:
    if (!guestName || !checkIn) {
      const missing = [];
      if (!guestName) missing.push('guest_name');
      if (!checkIn) missing.push('check_in');

      const ans = `I would be delighted to assist you with booking your stay at The Palms Resort!\n\n` +
        `To check our live 150-room inventory, please confirm your:\n` +
        `• **Guest Name** ${guestName ? `(✓ ${guestName})` : '(e.g., Alex Morgan)'}\n` +
        `• **Check-in Date** ${checkIn ? `(✓ ${checkIn})` : '(e.g., 27-09-2026)'}\n` +
        `• **Duration** (✓ ${defaultNights} nights)\n` +
        `• **Number of Guests** (✓ ${defaultGuests} adults)\n` +
        `• **Room Preference** (✓ ${normType})\n\n` +
        `You can reply with your details, or confirm via the interactive reservation card below.`;

      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, userId, userMsg, ans, 'room-booking-collecting', 'booking-engine', now
      );

      return res.json({
        answer: ans,
        isRoomBooking: true,
        bookingStage: 'collecting_info',
        bookingDetails: {
          guest_name: guestName,
          check_in: checkIn,
          nights: defaultNights,
          guests: defaultGuests,
          room_type: normType
        },
        missingFields: missing,
        mode: 'live-booking-engine',
        sources: [{ id: 'live-inventory', title: 'Live 150-Room Real-Time Data Store' }]
      });
    }

    // Both name and check-in date are present: Check availability against live 150-room inventory!
    const start = checkIn;
    const end = addDays(start, defaultNights);
    const avail = checkRoomAvailability(start, end, normType);

    if (!avail.available) {
      // Create request in existing requests queue for Manager Workspace
      const reqId = randomUUID();
      db.prepare(`
        INSERT INTO requests (id, user_id, category, title, detail, total, status, created_at)
        VALUES (?, 'guest-1', 'Special request', ?, ?, 0, 'New', ?)
      `).run(
        reqId,
        'Room Booking Request (PENDING / MANAGER_REVIEW)',
        `Automated check found no room available for ${guestName}: ${avail.reason}. Dates: ${start} to ${end} (${defaultNights} nights, ${defaultGuests} guests, type: ${normType}). Status: PENDING / MANAGER_REVIEW.`,
        new Date().toISOString()
      );

      const ans = `⚠️ **Live Inventory Notice: Transmitted for Manager Review**\n\nOur live 150-room inventory indicates that all rooms in category "${normType}" are currently unavailable between **${start}** and **${end}**.\n\nDon't worry — I have automatically logged **Reservation Review Request #${reqId.slice(0, 8)}** in the **Manager Workspace → Requests** queue with your details. Our resort manager will review alternate room options and assist you promptly.`;

      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, userId, userMsg, ans, 'room-booking-failed', 'booking-engine', now
      );

      return res.json({
        answer: ans,
        isRoomBooking: true,
        bookingStage: 'failed',
        failureDetails: {
          requestId: reqId,
          reason: avail.reason,
          check_in: start,
          check_out: end,
          status: 'PENDING / MANAGER_REVIEW'
        },
        mode: 'live-booking-engine',
        sources: [{ id: 'live-inventory', title: 'Live 150-Room Real-Time Data Store' }]
      });
    }

    // Room is Available! Return Booking Summary
    const room = avail.room;
    const pricePerNight = room.price_per_night;
    const totalAmount = pricePerNight * defaultNights;

    const ans = `✨ **Room Available in Live Inventory!**\n\nWe have verified real-time availability across all 150 rooms and selected **Room ${room.room_number} (${room.type})** for you from **${start}** to **${end}** (${defaultNights} nights).\n\n• **Room Number:** ${room.room_number}\n• **Room Type:** ${room.type}\n• **Check-In:** ${start} (From 2:00 PM)\n• **Check-Out:** ${end} (Until 11:00 AM)\n• **Rate:** ₹${pricePerNight.toLocaleString('en-IN')} / night\n• **Total Amount:** ₹${totalAmount.toLocaleString('en-IN')} (Taxes included)\n\nPlease review your booking summary below and click **Proceed to Payment** to complete your reservation.`;

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, userId, userMsg, ans, 'room-booking-summary', 'booking-engine', now
    );

    return res.json({
      answer: ans,
      isRoomBooking: true,
      bookingStage: 'summary',
      bookingSummary: {
        room_number: room.room_number,
        room_type: room.type,
        floor: room.floor,
        check_in: start,
        check_out: end,
        nights: defaultNights,
        guests: defaultGuests,
        guest_name: guestName,
        guest_email: req.body.guest_email || `${guestName.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.smartresort.demo`,
        guest_phone: req.body.guest_phone || '+91 98200 55321',
        price_per_night: pricePerNight,
        total_amount: totalAmount
      },
      mode: 'live-booking-engine',
      sources: [{ id: 'live-inventory', title: 'Live 150-Room Real-Time Data Store' }]
    });
  }

  // ── 2. Standard Resort RAG pipeline ──────────────────────────────────────────
  const result = await ragAnswer(userMsg, liveRates);
  result.nugen = {
    used: true,
    model: nugenDomain.model,
    intent: nugenDomain.intent,
    category: nugenDomain.category,
    priority: nugenDomain.priority,
    action: nugenDomain.action,
    confidence: nugenDomain.confidence_score,
    entities: nugenDomain.entities
  };
  if (result.sources && !result.sources.some(s => s.id === 'nugen-intelligence')) {
    result.sources.unshift({ id: 'nugen-intelligence', title: `Nugen Model · ${nugenDomain.model}` });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO concierge_logs VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, userId, userMsg, result.answer, result.mode, result.model || null, now
  );
  sbInsert('concierge_logs', { id, user_id: userId, question: userMsg, answer: result.answer, mode: result.mode, model: result.model, created_at: now });
  res.json(result);

});

// ── Hotel Info JSON endpoint — open to landing page & manager ────────────────
app.get('/api/hotel-info', (req, res) => {
  try {
    const info = getSyncedHotelInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve hotel info: ' + e.message });
  }
});

// Require session for all subsequent /api routes
app.use('/api', (req, res, next) => {
  const token = tokenOf(req);
  const user = token && db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND expires > ?').get(digest(token), Date.now());
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = publicUser(user); next();
});

app.get('/api/auth/me', (req, res) => res.json(req.user));

const role = required => (req, res, next) => req.user.role === required ? next() : res.status(403).json({ error: 'You do not have access to this workspace.' });

app.get('/api/bookings/my-stay', role('guest'), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE guest_id = ? OR room_number = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id, req.user.room);
  res.json({ booking: booking || null });
});

// ── Menu & requests ───────────────────────────────────────────────────────────
const menu = [
  {
    id: 'podi_dosa',
    name: 'Crispy Podi Ghee Dosa',
    description: 'Golden fermented crepe roasted in spiced gun powder & A2 cow ghee, served with fresh coconut & tomato chutneys with piping hot drumstick sambar',
    price: 480,
    kind: 'South Indian Special',
    symbol: '🥞',
    badge: 'Chef Signature',
    category: 'South Indian',
    image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'italian_pizza',
    name: 'Artisan Italian Margherita Pizza',
    description: 'Wood-fired sourdough crust, San Marzano tomato coulis, fresh hand-pulled buffalo mozzarella, sweet garden basil & cold-pressed EVOO',
    price: 890,
    kind: 'Italian Wood-Fired',
    symbol: '🍕',
    badge: 'House Favorite',
    category: 'Italian',
    image: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'truffle_burger',
    name: 'Smoked Portobello & Truffle Burger',
    description: 'Grilled brioche bun, caramelized shallots, sautéed portobello mushrooms, aged English cheddar, black truffle aioli & rosemary fries',
    price: 780,
    kind: 'Gourmet Mains',
    symbol: '🍔',
    badge: 'Popular',
    category: 'Mains',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'pasta',
    name: 'Wild Basil Pesto & Burrata Penne',
    description: 'Bronze-die penne tossed in fragrant pine nut basil pesto, roasted heirloom cherry tomatoes, creamy burrata & aged parmigiano',
    price: 850,
    kind: 'Italian Pasta',
    symbol: '🍝',
    badge: 'Vegetarian',
    category: 'Italian',
    image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'bowl',
    name: 'Harvest Superfood Buddha Bowl',
    description: 'Organic tri-color quinoa, Hass avocado ribbons, spicy roasted chickpeas, charred baby broccoli, edamame & citrus tahini drizzle',
    price: 650,
    kind: 'Healthy & Fresh',
    symbol: '🥗',
    badge: 'Vegan / Healthy',
    category: 'Healthy',
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'fish',
    name: 'Coastal Herb-Crusted Grilled Fish',
    description: 'Fresh local sea bass filet grilled with garlic-lemon herb butter, served over saffron wild rice and charred asparagus spears',
    price: 1150,
    kind: 'Catch of the Day',
    symbol: '🐟',
    badge: 'Fresh Catch',
    category: 'Seafood',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'butter_chicken',
    name: 'Old Delhi Style Butter Chicken & Naan',
    description: 'Tandoor-charred chicken simmered in a velvet tomato butter makhani gravy with fenugreek, served with piping hot garlic butter naan',
    price: 950,
    kind: 'Royal North Indian',
    symbol: '🍲',
    badge: 'Must Try',
    category: 'Mains',
    image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'royal_biryani',
    name: 'Royal Awadhi Dum Mutton Biryani',
    description: 'Fragrant aged basmati rice layered with tender marinated meat, saffron milk, caramelized onions, kewra and cooling cucumber raita',
    price: 880,
    kind: 'Royal Specialty',
    symbol: '🍚',
    badge: 'Signature',
    category: 'Mains',
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'malabar_prawns',
    name: 'Malabar Coastal Tiger Prawn Curry',
    description: 'Jumbo coastal tiger prawns poached in rich coconut cream, crushed black mustard, curry leaves, raw mango & fluffy appams',
    price: 1190,
    kind: 'Coastal Seafood',
    symbol: '🍤',
    badge: 'Seafood Special',
    category: 'Seafood',
    image: 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'avocado_toast',
    name: 'Artisan Sourdough Avocado Tartine',
    description: 'Toasted country sourdough smeared with crushed Hass avocado, Danish feta crumbles, toasted hemp seeds, radish curls & microgreens',
    price: 540,
    kind: 'Artisan Breakfast',
    symbol: '🥑',
    badge: 'All-Day',
    category: 'Healthy',
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'juice',
    name: 'Cold-Pressed Tropical Gold Elixir',
    description: 'Freshly pressed coastal pineapple, Valencia orange, passion fruit, fresh mint leaves and a crisp zesty touch of young ginger',
    price: 320,
    kind: 'Freshly Pressed',
    symbol: '🍹',
    badge: 'Cold Pressed',
    category: 'Beverages',
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'lava_cake',
    name: 'Warm Molten Dark Chocolate Fondant',
    description: 'Single-origin 70% dark chocolate cake with a molten flowing ganache center, Madagascar vanilla bean gelato & raspberry dust',
    price: 490,
    kind: 'Decadent Dessert',
    symbol: '🍫',
    badge: 'Sweet Finish',
    category: 'Desserts',
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80'
  }
];
app.get('/api/menu', (req, res) => res.json(menu));

app.get('/api/requests', (req, res) => {
  const q = "SELECT requests.*, COALESCE(users.name, requests.title, 'Guest') AS guest_name, COALESCE(users.room, 'N/A') AS room FROM requests LEFT JOIN users ON users.id = requests.user_id";
  res.json(
    req.user.role === 'manager'
      ? db.prepare(q + ' ORDER BY created_at DESC').all()
      : db.prepare(q + ' WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
  );
});

app.post('/api/requests', role('guest'), (req, res) => {
  let { category, title, detail = '', items } = req.body;
  if (!['Dining', 'Housekeeping', 'Maintenance', 'Spa', 'Special request'].includes(category)
      || !textValid(title, 120) || typeof detail !== 'string' || detail.length > 2000)
    return res.status(400).json({ error: 'Choose a service and describe your request (up to 2,000 characters).' });
  let total = 0;
  if (category === 'Dining') {
    if (!Array.isArray(items) || items.length < 1 || items.length > 20
        || items.some(item => !menu.some(m => m.id === item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10))
      return res.status(400).json({ error: 'Choose valid menu items and quantities.' });
    total = items.reduce((sum, item) => sum + menu.find(m => m.id === item.id).price * item.quantity, 0);
    title = 'In-room dining order';
    detail = items.map(item => `${item.quantity} × ${menu.find(m => m.id === item.id).name}`).join(', ') + (detail ? ` · Note: ${detail}` : '');
  }
  const id = randomUUID();
  db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.user.id, category, title.trim(), detail.trim(), total, 'New', new Date().toISOString());

  // ── Interconnect with Live Inventory Stock ─────────────────────────────────
  try {
    if (category === 'Dining') {
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 2) WHERE name = 'Fresh Milk'").run();
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 1.5) WHERE name = 'Chicken Breast'").run();
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 2) WHERE name = 'Rice Basmati'").run();
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 1) WHERE name = 'Fresh Vegetables'").run();
      db.prepare("UPDATE inventory_items SET status = CASE WHEN stock <= min_stock * 0.5 THEN 'Critical' WHEN stock <= min_stock THEN 'Low' ELSE 'Optimal' END WHERE category IN ('Dairy', 'Meat', 'Grains', 'Produce')").run();
    } else if (category === 'Housekeeping') {
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 2) WHERE name = 'Toilet Paper'").run();
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 1) WHERE name = 'Shampoo Bottles'").run();
      db.prepare("UPDATE inventory_items SET status = CASE WHEN stock <= min_stock * 0.5 THEN 'Critical' WHEN stock <= min_stock THEN 'Low' ELSE 'Optimal' END WHERE category IN ('Housekeeping', 'Amenities')").run();
    } else if (category === 'Maintenance') {
      db.prepare("UPDATE inventory_items SET stock = MAX(0, stock - 0.5) WHERE name = 'Pool Chemicals'").run();
      db.prepare("UPDATE inventory_items SET status = CASE WHEN stock <= min_stock * 0.5 THEN 'Critical' WHEN stock <= min_stock THEN 'Low' ELSE 'Optimal' END WHERE category = 'Maintenance'").run();
    }
  } catch (err) {
    console.error('[Inventory Sync Error]', err.message);
  }

  res.status(201).json({ id });
});

app.patch('/api/requests/:id', role('manager'), (req, res) => {
  if (!['New', 'In progress', 'Completed'].includes(req.body.status))
    return res.status(400).json({ error: 'Invalid request status.' });
  const result = db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(req.body.status, req.params.id);
  res.status(result.changes ? 200 : 404).json(result.changes ? { ok: true } : { error: 'Request not found.' });
});

// ── Resort Services & Live Capacity Management ──────────────────────────────
const RESORT_SERVICES = [
  {
    id: 'serenity_spa',
    category: 'Spa & Wellness',
    name: 'Serenity Spa (Ayurvedic & Swedish)',
    tagline: 'Ancient healing therapies & organic radiance facials',
    location: 'Wellness Pavilion, Ground Floor',
    timing: '09:00 AM – 08:00 PM',
    price: 4500,
    unit: 'session',
    total_capacity: 20,
    booked_slots: 19,
    status: 'Near Capacity (95%)',
    description: 'Ayurvedic deep tissue massage, Swedish relaxation, organic facials, and hot stone hydrotherapy.',
    slots: [
      { time: '09:00 AM', status: 'Booked', room: '104' },
      { time: '11:00 AM', status: 'Booked', room: '202' },
      { time: '02:00 PM', status: 'Booked', room: '305' },
      { time: '04:00 PM', status: 'Booked', room: '112' },
      { time: '06:00 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Ananya Deshmukh (Lead Therapist)',
    popular_score: 98,
    image: 'https://images.unsplash.com/photo-1540555700478-4be289fbec6e?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'couples_retreat',
    category: 'Spa & Wellness',
    name: "Couple's Retreat & Hydrotherapy Suite",
    tagline: 'Private jacuzzi, aromatic oils & sparkling wine',
    location: 'Serenity Spa Suite 2',
    timing: '10:00 AM – 08:00 PM',
    price: 8000,
    unit: 'couple',
    total_capacity: 8,
    booked_slots: 5,
    status: 'Available',
    description: 'Exclusive 2-hour private hydrotherapy sanctuary with aromatherapy, heated plunge tub & champagne.',
    slots: [
      { time: '10:00 AM', status: 'Booked', room: '101' },
      { time: '02:00 PM', status: 'Available', room: null },
      { time: '04:30 PM', status: 'Available', room: null },
      { time: '06:30 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Dr. Rohan Mehra (Ayurveda Vaidya)',
    popular_score: 92,
    image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'sunset_yoga',
    category: 'Spa & Wellness',
    name: 'Sunset Yoga & Mindfulness Meditation',
    tagline: 'Oceanfront deck pranayama and guided sound bowls',
    location: 'Beachside Oceanfront Deck',
    timing: '05:30 PM – 06:30 PM',
    price: 0,
    unit: 'guest',
    total_capacity: 30,
    booked_slots: 14,
    status: 'Available',
    description: 'Complimentary sunset wellness session led by certified yogis overlooking the Arabian Sea tides.',
    slots: [
      { time: '05:30 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Acharya Devendra',
    popular_score: 89,
    image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'palms_dining',
    category: 'Dining & Culinary',
    name: 'The Palms Restaurant (Chef’s Degustation)',
    tagline: '5-course coastal degustation dinner with paired wines',
    location: 'Central Courtyard',
    timing: '07:00 PM – 10:30 PM',
    price: 3500,
    unit: 'person',
    total_capacity: 40,
    booked_slots: 38,
    status: 'Near Capacity (95%)',
    description: 'Celebrated fine dining courtyard showcasing coastal seafood, Portuguese influences & vintage wines.',
    slots: [
      { time: '07:00 PM', status: 'Booked', room: '201' },
      { time: '08:00 PM', status: 'Booked', room: '204' },
      { time: '09:30 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Chef Jean-Luc & Sommelier',
    popular_score: 97,
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'beachside_grill',
    category: 'Dining & Culinary',
    name: 'Beachside Bar & Oceanfront Grill',
    tagline: 'Catch of the day, woodfired pizzas & sundowners',
    location: 'Private Beach Shore',
    timing: '11:00 AM – 11:00 PM',
    price: 1800,
    unit: 'table',
    total_capacity: 50,
    booked_slots: 28,
    status: 'Available',
    description: 'Open-air beachfront dining with live acoustic jazz, charcoal barbecued lobster & artisanal cocktails.',
    slots: [
      { time: '01:00 PM', status: 'Available', room: null },
      { time: '07:30 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Chef Vikramaditya',
    popular_score: 91,
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'in_room_dining',
    category: 'Dining & Culinary',
    name: 'In-Room Gourmet Dining & Midnight Bar',
    tagline: '24-hour curated room service delivered in 30 mins',
    location: 'All 150 Guest Rooms & Villas',
    timing: '24 Hours Daily',
    price: 950,
    unit: 'order',
    total_capacity: 100,
    booked_slots: 42,
    status: 'Available',
    description: '24/7 in-villa culinary service bringing hot chef signatures and chilled champagnes right to your door.',
    slots: [
      { time: 'Immediate (24/7)', status: 'Available', room: null }
    ],
    staff_assigned: 'Room Service Dispatch Unit',
    popular_score: 88,
    image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'pool_cabana',
    category: 'Leisure & Recreation',
    name: 'Infinity Pool Luxury VIP Cabanas',
    tagline: 'Fresh tropical fruit platter, coconuts & dedicated butler',
    location: 'Cliffside Infinity Pool Deck',
    timing: '08:00 AM – 07:00 PM',
    price: 2500,
    unit: 'day',
    total_capacity: 12,
    booked_slots: 11,
    status: 'Near Capacity (92%)',
    description: 'Private poolside daybed cabana overlooking the sea with chilled towels, sunscreen bar and butler.',
    slots: [
      { time: 'Full Day (Cabana #7)', status: 'Available', room: null }
    ],
    staff_assigned: 'Poolside Butler Team',
    popular_score: 96,
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'watersports',
    category: 'Activities & Sports',
    name: 'Water Sports & Beach Adventure Desk',
    tagline: 'Parasailing, Jet-Ski sprint & sea kayaking',
    location: 'Beach Activities Pavilion',
    timing: '08:00 AM – 05:00 PM',
    price: 2500,
    unit: 'activity',
    total_capacity: 25,
    booked_slots: 16,
    status: 'Available',
    description: 'High-adrenaline water sports including high-speed Sea-Doo jet skis, parasailing flights, and reef kayaks.',
    slots: [
      { time: '02:00 PM', status: 'Available', room: null },
      { time: '03:30 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Capt. Sunil Ramos (Coast Guard Cert)',
    popular_score: 93,
    image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'scuba_diving',
    category: 'Activities & Sports',
    name: 'PADI Scuba Diving & Marine Lagoon',
    tagline: 'Coral reef discovery dives & 2-day certifications',
    location: 'Dive Center & Marine Lagoon',
    timing: '09:00 AM – 04:00 PM',
    price: 4500,
    unit: 'diver',
    total_capacity: 10,
    booked_slots: 6,
    status: 'Available',
    description: 'Explore the vibrant Goa marine ecosystem guided by certified PADI master dive instructors.',
    slots: [
      { time: '09:30 AM', status: 'Available', room: null },
      { time: '01:30 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Elena Vance (PADI Master Diver)',
    popular_score: 90,
    image: 'https://images.unsplash.com/photo-1682687220063-4742bd7fd538?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'personal_fitness',
    category: 'Fitness & Health',
    name: 'Private Fitness & 1-on-1 Personal Training',
    tagline: 'Oceanview TechnoGym training & customized HIIT',
    location: '2nd Floor Oceanview Gym',
    timing: '06:00 AM – 09:00 PM',
    price: 2000,
    unit: 'hour',
    total_capacity: 14,
    booked_slots: 8,
    status: 'Available',
    description: 'Tailored strength conditioning, mobility recovery, and functional cardio coaching with master trainers.',
    slots: [
      { time: '02:00 PM', status: 'Available', room: null },
      { time: '05:00 PM', status: 'Available', room: null }
    ],
    staff_assigned: 'Coach Marcus Fernandes',
    popular_score: 86,
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'chef_masterclass',
    category: 'Activities & Sports',
    name: 'Executive Chef Culinary Masterclass',
    tagline: 'Goan spice blending, coastal seafood & wine pairing',
    location: 'Open Culinary Theatre',
    timing: '11:00 AM – 01:00 PM',
    price: 3500,
    unit: 'person',
    total_capacity: 15,
    booked_slots: 15,
    status: 'Sold Out (100%)',
    description: 'Interactive cooking workshop with Executive Chef creating classic Goan prawn caldine & dessert pairing.',
    slots: [
      { time: '11:00 AM', status: 'Sold Out', room: 'Waitlist' }
    ],
    staff_assigned: 'Executive Chef Jean-Luc',
    popular_score: 99,
    image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'kids_club',
    category: 'Family & Kids',
    name: 'Little Explorers Kids’ Club & Day Camp',
    tagline: 'Eco beach treasure hunts, pottery & nature arts',
    location: 'Children’s Activity Hub, Wing B',
    timing: '09:00 AM – 06:00 PM',
    price: 0,
    unit: 'child',
    total_capacity: 35,
    booked_slots: 18,
    status: 'Available',
    description: 'Complimentary supervised activities, marine biology games, and storytelling for young resort guests.',
    slots: [
      { time: 'Full Day Access', status: 'Available', room: null }
    ],
    staff_assigned: 'Maya Shenoy (Child Specialist)',
    popular_score: 87,
    image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'chauffeur_transfer',
    category: 'Transport & Concierge',
    name: 'Luxury Airport Chauffeur & VIP Transfer',
    tagline: 'Mercedes-Benz E-Class & BMW luxury transfers',
    location: 'Lobby Concierge',
    timing: '24 Hours On Demand',
    price: 2500,
    unit: 'transfer',
    total_capacity: 20,
    booked_slots: 12,
    status: 'Available',
    description: 'Private chauffeur airport pickup and drop-off with Wi-Fi, chilled water, and luggage assistance.',
    slots: [
      { time: 'On Demand (24/7)', status: 'Available', room: null }
    ],
    staff_assigned: 'Concierge Fleet Dispatch',
    popular_score: 94,
    image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80'
  }
];

function buildServicesOverview() {
  let totalCapacity = 0;
  let totalBooked = 0;
  let highCapacityCount = 0;

  const services = RESORT_SERVICES.map(svc => {
    const occupancyRate = Math.min(100, Math.round((svc.booked_slots / (svc.total_capacity || 1)) * 100));
    const available_slots = Math.max(0, svc.total_capacity - svc.booked_slots);
    const isNearCapacity = occupancyRate >= 95;
    const isSoldOut = occupancyRate >= 100;

    totalCapacity += svc.total_capacity;
    totalBooked += svc.booked_slots;
    if (isNearCapacity) highCapacityCount++;

    return {
      ...svc,
      occupancyRate,
      available_slots,
      isNearCapacity,
      isSoldOut
    };
  });

  const availableSlots = Math.max(0, totalCapacity - totalBooked);
  const overallOccupancy = Math.round((totalBooked / (totalCapacity || 1)) * 100);

  return {
    stats: {
      totalServices: services.length,
      totalCapacity,
      totalBooked,
      availableSlots,
      overallOccupancy,
      highCapacityCount,
      activeAlertsCount: highCapacityCount
    },
    services
  };
}

app.get('/api/services', (req, res) => {
  res.json(buildServicesOverview());
});

app.patch('/api/services/:id/capacity', role('manager'), (req, res) => {
  const svc = RESORT_SERVICES.find(s => s.id === req.params.id);
  if (!svc) return res.status(404).json({ error: 'Service not found.' });

  const { total_capacity, booked_slots } = req.body;
  if (Number.isFinite(total_capacity) && total_capacity >= 1) svc.total_capacity = Number(total_capacity);
  if (Number.isFinite(booked_slots) && booked_slots >= 0) svc.booked_slots = Number(booked_slots);

  const updated = buildServicesOverview().services.find(s => s.id === svc.id);
  res.json({ ok: true, service: updated });
});

app.post('/api/services/book', (req, res) => {
  const { service_id, slot_time, notes = '' } = req.body;
  const svc = RESORT_SERVICES.find(s => s.id === service_id);
  if (!svc) return res.status(404).json({ error: 'Service not found.' });

  if (svc.booked_slots >= svc.total_capacity) {
    return res.status(400).json({ error: `${svc.name} is currently sold out.` });
  }

  svc.booked_slots += 1;
  const reqId = randomUUID();
  const userName = req.user?.name || 'Resort Guest';
  const userRoom = req.user?.room || '204';
  const detail = `${userName} (Room ${userRoom}) · Confirmed slot: ${slot_time || svc.timing} · Price: ₹${svc.price.toLocaleString('en-IN')} · Note: ${notes || 'Booked via Services Portal'}`;

  db.prepare(`
    INSERT INTO requests (id, user_id, category, title, detail, total, status, created_at)
    VALUES (?, ?, 'Spa', ?, ?, ?, 'New', ?)
  `).run(reqId, req.user?.id || 'guest-1', `${svc.name} Reservation`, detail, svc.price, new Date().toISOString());

  const updated = buildServicesOverview().services.find(s => s.id === svc.id);
  res.json({
    ok: true,
    message: `Reservation confirmed for ${svc.name} (${slot_time || svc.timing})!`,
    service: updated
  });
});

// ── Feedback + AI sentiment ───────────────────────────────────────────────────
app.post('/api/feedback', role('guest'), async (req, res) => {
  const { rating, comment } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !textValid(comment, 3000))
    return res.status(400).json({ error: 'Please add a rating from 1 to 5 and feedback up to 3,000 characters.' });
  const analysis = await analyzeFeedback(comment.trim(), rating);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, rating, comment.trim(), JSON.stringify(analysis), now);
  // Mirror to Supabase for real-time dashboard queries
  sbInsert('feedback', { id, user_id: req.user.id, rating, comment: comment.trim(), analysis, created_at: now });
  res.status(201).json({ id, analysis });
});

app.get('/api/feedback', async (req, res) => {
  const q = 'SELECT feedback.*, users.name AS guest_name, users.room FROM feedback JOIN users ON users.id = feedback.user_id';
  const rows = req.user.role === 'manager'
    ? db.prepare(q + ' ORDER BY created_at DESC').all()
    : db.prepare(q + ' WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows.map(row => ({ ...row, analysis: JSON.parse(row.analysis) })));
});

// ── Dynamic pricing ───────────────────────────────────────────────────────────
app.get('/api/pricing', role('manager'), (req, res) => res.json(db.prepare('SELECT * FROM rates').all()));

app.get('/api/pricing/timeline', role('manager'), (req, res) => {
  const info = getSyncedHotelInfo();
  res.json(info.dynamic_pricing_system?.recent_pricing_timeline_events || []);
});

app.post('/api/pricing/scenario', role('manager'), async (req, res) => {
  const { occupancy, season, dow, lead_days, competitor_avg, local_events, review_score } = req.body;
  if (!Number.isFinite(occupancy) || occupancy < 0 || occupancy > 100
      || !Number.isFinite(season) || season < 0.5 || season > 1.5)
    return res.status(400).json({ error: 'Invalid occupancy or season factor.' });

  const result = await pricingScenario({
    occupancy, season,
    dow: Number.isFinite(dow) ? dow : new Date().getDay(),
    lead_days: Number.isFinite(lead_days) ? lead_days : 14,
    competitor_avg: Number.isFinite(competitor_avg) ? competitor_avg : 15000,
    local_events: local_events ? 1 : 0,
    review_score: Number.isFinite(review_score) ? review_score : 4.2,
  });

  const logId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO pricing_logs VALUES (?, ?, ?, ?, ?)').run(logId, req.user.id, JSON.stringify(result.inputs), JSON.stringify(result), now);
  sbInsert('pricing_logs', { id: logId, user_id: req.user.id, inputs: result.inputs, result, created_at: now });

  res.json(result);
});

app.post('/api/pricing/apply', role('manager'), async (req, res) => {
  const { id, occupancy, season, duration_hours, expires_at } = req.body;
  if (!Number.isFinite(occupancy) || occupancy < 0 || occupancy > 100
      || !Number.isFinite(season) || season < 0.5 || season > 1.5)
    return res.status(400).json({ error: 'Invalid scenario.' });
  const result = await pricingScenario({ occupancy, season });
  const room = result.rooms.find(r => r.id === id);
  if (!room) return res.status(400).json({ error: 'Invalid room.' });

  const finalDuration = Number(duration_hours) || 24;
  const expiresAtIso = expires_at || new Date(Date.now() + finalDuration * 3600 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Save to rates table
  db.prepare('INSERT OR REPLACE INTO rates (id, amount, updated_at, updated_by) VALUES (?, ?, ?, ?)').run(id, room.recommended, nowIso, req.user.id);

  // Sync live rate to rooms table in SQLite
  const typeMap = {
    standard: 'Garden Room',
    suite: 'Ocean Suite',
    villa: 'Private Pool Villa'
  };
  const typeName = typeMap[id] || room.name;
  db.prepare('UPDATE rooms SET price_per_night = ? WHERE type = ?').run(room.recommended, typeName);

  // Sync to hotel_info.json
  const hotelData = readHotelInfoData();
  if (hotelData.dynamic_pricing_system?.rooms) {
    const targetRoom = hotelData.dynamic_pricing_system.rooms.find(r => r.id === id);
    if (targetRoom) {
      const fromPrice = targetRoom.current_rate || targetRoom.base_rate;
      targetRoom.current_rate = room.recommended;
      targetRoom.is_surge_active = true;
      targetRoom.applied_at = nowIso;
      targetRoom.expires_at = expiresAtIso;
      targetRoom.duration_hours = finalDuration;
      targetRoom.remaining_seconds = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
      const h = Math.floor(targetRoom.remaining_seconds / 3600);
      const m = Math.floor((targetRoom.remaining_seconds % 3600) / 60);
      targetRoom.remaining_time = `${h}h ${m}m`;
      const diffPct = Math.round(((room.recommended - targetRoom.base_rate) / targetRoom.base_rate) * 100);
      targetRoom.price_flow = `Dynamic ML Surge (₹${room.recommended.toLocaleString('en-IN')}) [Active Surge ${diffPct >= 0 ? '+' : ''}${diffPct}%]`;

      hotelData.dynamic_pricing_system.recent_pricing_timeline_events = hotelData.dynamic_pricing_system.recent_pricing_timeline_events || [];
      hotelData.dynamic_pricing_system.recent_pricing_timeline_events.unshift({
        id: randomUUID(),
        room_id: id,
        room_name: typeName,
        from_price: fromPrice,
        to_price: room.recommended,
        action: 'ML_SURGE_APPLIED',
        duration_hours: finalDuration,
        expires_at: expiresAtIso,
        created_at: nowIso
      });
    }
  }
  writeHotelInfoData(hotelData);
  invalidateRagIndex();

  res.json({ ok: true, rate: room.recommended, duration_hours: finalDuration, expires_at: expiresAtIso, type: typeName });
});

app.post('/api/pricing/reset', role('manager'), (req, res) => {
  const { id } = req.body;
  const BASE_CONFIG = {
    standard: { name: 'Garden Room', base: 6500 },
    suite: { name: 'Ocean Suite', base: 14500 },
    villa: { name: 'Private Pool Villa', base: 28000 }
  };

  const targetIds = (id === 'all' || !id) ? Object.keys(BASE_CONFIG) : [id];
  const hotelData = readHotelInfoData();
  const nowIso = new Date().toISOString();

  for (const targetId of targetIds) {
    const cfg = BASE_CONFIG[targetId];
    if (!cfg) continue;

    // Save to rates table
    db.prepare('INSERT OR REPLACE INTO rates (id, amount, updated_at, updated_by) VALUES (?, ?, ?, ?)').run(
      targetId, cfg.base, nowIso, req.user.id
    );

    // Sync to rooms table
    db.prepare('UPDATE rooms SET price_per_night = ? WHERE type = ?').run(cfg.base, cfg.name);

    // Sync to hotelData
    if (hotelData.dynamic_pricing_system?.rooms) {
      const room = hotelData.dynamic_pricing_system.rooms.find(r => r.id === targetId);
      if (room) {
        const fromPrice = room.current_rate;
        room.current_rate = room.base_rate || cfg.base;
        room.is_surge_active = false;
        room.applied_at = null;
        room.expires_at = null;
        room.duration_hours = null;
        room.remaining_seconds = 0;
        room.remaining_time = null;
        room.price_flow = `Original Base Rate (₹${(room.base_rate || cfg.base).toLocaleString('en-IN')}) [Active - No Surge]`;

        hotelData.dynamic_pricing_system.recent_pricing_timeline_events = hotelData.dynamic_pricing_system.recent_pricing_timeline_events || [];
        hotelData.dynamic_pricing_system.recent_pricing_timeline_events.unshift({
          id: randomUUID(),
          room_id: targetId,
          room_name: room.name || cfg.name,
          from_price: fromPrice,
          to_price: room.base_rate || cfg.base,
          action: 'MANUAL_RESET_BASE',
          duration_hours: null,
          expires_at: null,
          created_at: nowIso
        });
      }
    }
  }

  writeHotelInfoData(hotelData);
  invalidateRagIndex();

  res.json({ ok: true, id, message: id === 'all' ? 'All room rates reset to base' : 'Room rate reset to base' });
});

// Sentiment stats endpoint (manager only — strictly 3 categories: positive, neutral, negative)
app.get('/api/sentiment/stats', role('manager'), (req, res) => {
  const rows = db.prepare('SELECT analysis FROM feedback ORDER BY created_at DESC LIMIT 200').all();
  const analyses = rows.map(r => { try { return JSON.parse(r.analysis); } catch { return null; } }).filter(Boolean);
  const counts = { positive: 0, neutral: 0, negative: 0 };
  const aspects = {};
  for (const a of analyses) {
    const s = a.sentiment === 'positive' ? 'positive' : a.sentiment === 'negative' ? 'negative' : 'neutral';
    counts[s] = (counts[s] || 0) + 1;
    for (const asp of (a.aspects || [])) aspects[asp] = (aspects[asp] || 0) + 1;
  }
  const total = analyses.length || 1;
  res.json({
    total: analyses.length,
    counts,
    distribution: Object.entries(counts).map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) })),
    topAspects: Object.entries(aspects).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count })),
    avgUrgency: analyses.filter(a => a.urgency === 'high').length,
    method: analyses[0]?.method || 'nlp-text-analyzer',
  });
});

// ── Guest Experience Dynamic & Synced Endpoint (Manager only) ────────────────
let guestOffers = [
  { id: 'off-1', room: '204', guest: 'Alex Morgan', offer: 'Complimentary Sunset Champagne & Truffles', reason: 'Anniversary celebration detected • VIP Platinum', expires: 'Today', status: 'Pending' },
  { id: 'off-2', room: '308', guest: 'Jamie Lee', offer: 'Complimentary 30-min Spa Hydrotherapy Extension', reason: 'Wellness spa preference detected • VIP Gold', expires: 'Tomorrow', status: 'Accepted' },
  { id: 'off-3', room: '205', guest: 'David Chen Family', offer: 'Kids Beach Adventure Safari (50% off)', reason: 'Family with 2 children preference', expires: '28 Sept', status: 'Pending' },
  { id: 'off-4', room: '102', guest: 'Sarah Jenkins', offer: "Chef's Table Wine Pairing Tasting Experience", reason: 'Fine dining culinary preference', expires: '30 Sept', status: 'Redeemed' },
];

app.get('/api/guest-experience/overview', role('manager'), (req, res) => {
  const roomStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'Occupied' THEN guest_count ELSE 0 END) as total_guests
    FROM rooms
  `).get();

  const totalRooms = roomStats.total || 150;
  const occupiedRooms = roomStats.occupied || 129;
  const occupancyRate = Math.round((occupiedRooms / totalRooms) * 100);

  const feedbackRows = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
  const feedbackCount = feedbackRows.length;
  const avgRating = feedbackCount > 0
    ? (feedbackRows.reduce((sum, f) => sum + f.rating, 0) / feedbackCount).toFixed(1)
    : '4.8';

  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const f of feedbackRows) {
    try {
      const a = JSON.parse(f.analysis);
      const s = a.sentiment === 'positive' ? 'positive' : a.sentiment === 'negative' ? 'negative' : 'neutral';
      counts[s]++;
    } catch {}
  }

  const categoryAspects = {
    'Room Quality': ['housekeeping', 'cleaning', 'toilet', 'room quality', 'bed'],
    'Service': ['service', 'staff', 'concierge'],
    'F&B': ['dining', 'food', 'restaurant', 'breakfast'],
    'Amenities': ['facilities', 'pool', 'spa', 'wifi'],
    'Value': ['value', 'price']
  };

  const satisfactionByCategory = Object.entries(categoryAspects).map(([cat, keywords]) => {
    const matching = feedbackRows.filter(f => {
      const lower = (f.comment || '').toLowerCase();
      try {
        const a = JSON.parse(f.analysis);
        const asp = (a.aspects || []).join(' ').toLowerCase();
        return keywords.some(k => lower.includes(k) || asp.includes(k));
      } catch {
        return keywords.some(k => lower.includes(k));
      }
    });

    let score = 90;
    if (matching.length > 0) {
      const catAvg = matching.reduce((sum, m) => sum + m.rating, 0) / matching.length;
      score = Math.round((catAvg / 5) * 100);
    } else {
      score = cat === 'Room Quality' ? 92 : cat === 'Service' ? 88 : cat === 'F&B' ? 85 : cat === 'Amenities' ? 90 : 86;
    }
    return { category: cat, score };
  });

  const occupiedList = db.prepare(`
    SELECT * FROM rooms WHERE status = 'Occupied' ORDER BY CAST(room_number AS INTEGER) ASC LIMIT 24
  `).all();

  const profiles = occupiedList.map(r => {
    const reqCount = db.prepare('SELECT COUNT(*) as count FROM requests JOIN users ON users.id = requests.user_id WHERE users.room = ?').get(r.room_number)?.count || 0;
    const guestFb = feedbackRows.filter(f => f.room === r.room_number);
    let sentiment = 'positive';
    let score = 92;
    if (guestFb.length > 0) {
      try {
        const a = JSON.parse(guestFb[0].analysis);
        sentiment = a.sentiment || 'positive';
        score = sentiment === 'positive' ? 96 : sentiment === 'neutral' ? 82 : 68;
      } catch {}
    } else {
      score = r.vip_tier === 'Platinum' ? 96 : r.vip_tier === 'Gold' ? 91 : 87;
      sentiment = 'positive';
    }

    const prefs = [];
    if (r.special_requests) {
      const sr = r.special_requests.toLowerCase();
      if (sr.includes('anniversary') || sr.includes('celebrating')) prefs.push('Anniversary');
      if (sr.includes('pillow') || sr.includes('towel') || sr.includes('linens')) prefs.push('Luxury Linens');
      if (sr.includes('late check-out')) prefs.push('Late Checkout');
      if (sr.includes('quiet')) prefs.push('Quiet Suite');
      if (sr.includes('crib') || sr.includes('family')) prefs.push('Family Care');
      if (sr.includes('dining') || sr.includes('fruit') || sr.includes('espresso')) prefs.push('Gourmet Dining');
    }
    if (prefs.length === 0) prefs.push('Spa & Wellness', 'Ocean View');

    return {
      id: r.room_number,
      name: r.guest_name,
      room: r.room_number,
      type: r.type,
      floor: r.floor,
      stay: r.check_in && r.check_out ? `${new Date(r.check_in).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${new Date(r.check_out).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '24 Sept - 29 Sept',
      preferences: prefs,
      sentiment,
      score,
      requests: reqCount,
      avatar: (r.guest_name || 'Guest').split(' ').map(x => x[0]).join(''),
      vip: r.vip_tier === 'Platinum' || r.vip_tier === 'Gold',
      vip_tier: r.vip_tier,
      age: r.guest_age,
      gender: r.guest_gender,
      email: r.guest_email,
      phone: r.guest_phone,
      special_requests: r.special_requests,
      notes: r.notes
    };
  });

  const preferenceTrends = [
    { name: 'Spa & Wellness', guests: 48, trend: '+14%' },
    { name: 'Adventure & Water Sports', guests: 34, trend: '+9%' },
    { name: 'Fine Dining & Sunset Bar', guests: 72, trend: '+18%' },
    { name: 'Kids Club & Family Activities', guests: 29, trend: '+11%' },
    { name: 'Executive & Quiet Lounges', guests: 22, trend: '+3%' },
  ];

  res.json({
    occupancy: {
      totalRooms,
      occupiedRooms,
      occupancyRate,
      activeGuestsCount: occupiedRooms
    },
    guestSatisfaction: `${avgRating}/5`,
    guestSatisfactionScore: Number(avgRating),
    totalFeedback: feedbackCount,
    sentimentBreakdown: counts,
    satisfactionByCategory,
    preferenceTrends,
    guestProfiles: profiles,
    personalizedOffers: guestOffers,
    offersRedeemedCount: guestOffers.filter(o => o.status === 'Accepted' || o.status === 'Redeemed').length
  });
});

app.post('/api/guest-experience/offers/:id/action', role('manager'), (req, res) => {
  const { action } = req.body;
  const offer = guestOffers.find(o => o.id === req.params.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found.' });

  if (action === 'redeem') offer.status = 'Redeemed';
  else if (action === 'send') offer.status = 'Accepted';
  else offer.status = 'Accepted';

  res.json({ ok: true, offer });
});

// ── Rooms & Guests (Manager only) ──────────────────────────────────────────
app.get('/api/rooms', role('manager'), (req, res) => {
  const { status, floor, search } = req.query;
  let query = 'SELECT * FROM rooms WHERE 1=1';
  const params = [];
  if (status && status !== 'All') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (floor && floor !== 'All') {
    query += ' AND floor = ?';
    params.push(Number(floor));
  }
  if (search && search.trim()) {
    query += ' AND (room_number LIKE ? OR guest_name LIKE ? OR type LIKE ?)';
    const s = `%${search.trim()}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY CAST(room_number AS INTEGER) ASC';
  const rooms = db.prepare(query).all(...params);

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'Cleaning' THEN 1 ELSE 0 END) as cleaning,
      SUM(CASE WHEN status = 'Maintenance' THEN 1 ELSE 0 END) as maintenance
    FROM rooms
  `).get();

  const total = stats.total || 150;
  const occupied = stats.occupied || 129;
  const occupancyRate = Math.round((occupied / total) * 100);

  res.json({
    stats: {
      total,
      occupied,
      available: stats.available || 0,
      cleaning: stats.cleaning || 0,
      maintenance: stats.maintenance || 0,
      occupancyRate
    },
    rooms
  });
});

app.get('/api/rooms/overview', role('manager'), (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY CAST(room_number AS INTEGER) ASC').all();
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'Cleaning' THEN 1 ELSE 0 END) as cleaning,
      SUM(CASE WHEN status = 'Maintenance' THEN 1 ELSE 0 END) as maintenance
    FROM rooms
  `).get();
  res.json({
    stats: {
      total: stats.total || 150,
      occupied: stats.occupied || 129,
      available: stats.available || 0,
      cleaning: stats.cleaning || 0,
      maintenance: stats.maintenance || 0,
      occupancyRate: Math.round(((stats.occupied || 129) / (stats.total || 150)) * 100)
    },
    rooms
  });
});

app.get('/api/rooms/:room_number', role('manager'), (req, res, next) => {
  if (req.params.room_number === 'overview') return next();
  const room = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(req.params.room_number);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const requests = db.prepare(`
    SELECT requests.*, users.name as guest_name 
    FROM requests 
    JOIN users ON users.id = requests.user_id 
    WHERE users.room = ? 
    ORDER BY requests.created_at DESC
  `).all(req.params.room_number);

  res.json({ room, requests });
});

app.patch('/api/rooms/:room_number', role('manager'), (req, res) => {
  const { status, notes, special_requests } = req.body;
  const room = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(req.params.room_number);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const newStatus = status || room.status;
  const newNotes = notes !== undefined ? notes : room.notes;
  const newReq = special_requests !== undefined ? special_requests : room.special_requests;

  db.prepare('UPDATE rooms SET status = ?, notes = ?, special_requests = ? WHERE room_number = ?')
    .run(newStatus, newNotes, newReq, req.params.room_number);

  res.json({ ok: true, room: db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(req.params.room_number) });
});

// ── Dynamic Analytics for Overview ──────────────────────────────────────────
app.get('/api/analytics/occupancy', role('manager'), (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'Occupied' THEN price_per_night ELSE 0 END) as room_revenue
    FROM rooms
  `).get();

  const total = stats.total || 150;
  const occupied = stats.occupied || 129;
  const currentPct = Math.round((occupied / total) * 100);

  // Dynamic 7-day occupancy curve calibrated around current active occupancy
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const basePercentages = [65, 72, 69, 81, 86, 94, 87];
  const delta = currentPct - 86;

  const trend = days.map((day, i) => {
    const rawPct = Math.min(100, Math.max(30, basePercentages[i] + delta));
    const estOccupied = Math.round((rawPct / 100) * total);
    const dayRevenue = Number(((estOccupied * 18500) / 100000).toFixed(1));
    return {
      day,
      occupancy: rawPct,
      occupiedRooms: estOccupied,
      revenueLakhs: dayRevenue
    };
  });

  const dailyRoomRevenue = stats.room_revenue || (occupied * 18500);
  const diningTotal = db.prepare("SELECT COALESCE(SUM(total), 0) as sum FROM requests WHERE category = 'Dining'").get()?.sum || 0;
  const totalDailyRevenue = dailyRoomRevenue + diningTotal;
  const revenueLakhsStr = `Rs.${(totalDailyRevenue / 100000).toFixed(1)}L`;

  res.json({
    occupancyRate: currentPct,
    occupiedCount: occupied,
    totalRooms: total,
    dailyRevenue: revenueLakhsStr,
    dailyRevenueRaw: totalDailyRevenue,
    trend
  });
});

// ── Predictive Maintenance — Cumulative Fatigue & Degradation Engine (Manager only) ─
const CORE_MAINTENANCE_SERVICES = [
  {
    id: 'hvac_central',
    name: 'Central Chilled Water HVAC & Air Circulation',
    category: 'Climate & Air Quality',
    location: 'Central Utility Plant & Rooftops',
    icon: 'Wind',
    wearThreshold: 50,
    weightHigh: 1.00,
    weightNeutral: 0.40,
    weightLow: 0.20,
    aiMechanism: 'Continuous thermal expansion cycling on dual centrifugal chillers. 90%+ occupancy maintains 100% compressor load without standby dwell time, accelerating bearing degradation.',
    lastMaintenance: '28 July 2026',
    technicianTeam: 'HVAC Climate & Mechanical Unit',
    estimatedCost: '₹65,000',
    priority: 'Critical',
    standardRuntime: '24/7 Continuous'
  },
  {
    id: 'pool_pumps',
    name: 'Main Plunge & Horizon Pool Hydro-Pumps',
    category: 'Water Treatment & Aquatics',
    location: 'Pool Plant Room',
    icon: 'Droplets',
    wearThreshold: 45,
    weightHigh: 0.85,
    weightNeutral: 0.35,
    weightLow: 0.15,
    aiMechanism: 'High swimmer density increases organic filtration backpressure, causing cavitation vibration in mechanical impeller seals and thermal winding strain.',
    lastMaintenance: '12 Aug 2026',
    technicianTeam: 'Aquatics Engineering Unit',
    estimatedCost: '₹38,000',
    priority: 'High',
    standardRuntime: '18 hrs / day'
  },
  {
    id: 'kitchen_exhaust',
    name: 'Commercial Kitchen Flue Exhaust & Degreaser',
    category: 'Culinary Safety & Ventilation',
    location: 'Main Kitchen & Dining Courtyard',
    icon: 'Flame',
    wearThreshold: 60,
    weightHigh: 0.90,
    weightNeutral: 0.30,
    weightLow: 0.10,
    aiMechanism: 'High cooking volumes deposit vaporized lipids inside duct vanes. Airflow velocity drops proportionally to lipid depth, increasing motor static head resistance.',
    lastMaintenance: '05 Aug 2026',
    technicianTeam: 'Kitchen & Fire Safety Specialist',
    estimatedCost: '₹42,000',
    priority: 'Medium',
    standardRuntime: '16 hrs / day'
  },
  {
    id: 'guest_elevators',
    name: 'Guest Wings Traction Elevators & Shuttles',
    category: 'Vertical Transport & Mobility',
    location: 'Main Pavilion & Guest Wings A/B',
    icon: 'ArrowUpDown',
    wearThreshold: 70,
    weightHigh: 0.75,
    weightNeutral: 0.30,
    weightLow: 0.10,
    aiMechanism: 'Start-stop mechanical traction cycles during guest check-in/out surges. Counterweight cable elongation and brake pad friction adhere to expected fatigue curves.',
    lastMaintenance: '18 Aug 2026',
    technicianTeam: 'Schindler Vertical Transit Team',
    estimatedCost: '₹25,000',
    priority: 'Routine',
    standardRuntime: '24/7 On Demand'
  }
];

let activeMaintenanceScenario = 'scenario-60';
let activeSessionMix = {
  highDays: 45,
  neutralDays: 10,
  lowDays: 5
};
const maintenanceResetMap = new Map();
const maintenanceActionLogs = [
  {
    id: 'log-init-1',
    service_id: 'hvac_central',
    service_name: 'Central Chilled Water HVAC & Air Circulation',
    action_type: 'Scenario Evaluated',
    performed_by: 'Predictive Fatigue Engine',
    notes: 'Evaluated Scenario 1 (60-Day Window: 45 High / 10 Neutral / 5 Low). Central AC 50-unit threshold reached at Day 60.',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'log-init-2',
    service_id: 'pool_pumps',
    service_name: 'Main Plunge & Horizon Pool Hydro-Pumps',
    action_type: 'Maintenance Certified',
    performed_by: 'Chief Engineer & Technical Unit',
    notes: 'Certified mechanical impeller seal lubrication and chemical backwash test. Reset wear to 0.',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

function buildGroupedMaintenanceOverview(scenario = activeMaintenanceScenario, customMix = null) {
  let mix = { highDays: 45, neutralDays: 10, lowDays: 5 };
  let scenarioTitle = 'Scenario 1 • 60-Day Window';

  if (scenario === 'scenario-90') {
    mix = { highDays: 45, neutralDays: 0, lowDays: 45 };
    scenarioTitle = 'Scenario 2 • 90-Day Window';
  } else if (scenario === 'scenario-offpeak') {
    mix = { highDays: 15, neutralDays: 15, lowDays: 45 };
    scenarioTitle = 'Scenario 3 • Conservation';
  } else if (scenario === 'custom' && customMix) {
    mix = {
      highDays: Math.max(0, Number(customMix.highDays) || 0),
      neutralDays: Math.max(0, Number(customMix.neutralDays) || 0),
      lowDays: Math.max(0, Number(customMix.lowDays) || 0)
    };
    scenarioTitle = 'Custom Session Mix Simulator';
  }

  const totalDays = Math.max(1, mix.highDays + mix.neutralDays + mix.lowDays);
  const highPct = Math.round((mix.highDays / totalDays) * 100);
  const neutralPct = Math.round((mix.neutralDays / totalDays) * 100);
  const lowPct = Math.max(0, 100 - highPct - neutralPct);

  let dueImmediatelyCount = 0;
  let warningCount = 0;
  let operationalCount = 0;
  let totalWearPctSum = 0;
  let totalCycleDaysSum = 0;

  const services = CORE_MAINTENANCE_SERVICES.map(base => {
    const isReset = maintenanceResetMap.has(base.id);
    const rawWear = isReset
      ? 0.0
      : (mix.highDays * base.weightHigh) + (mix.neutralDays * base.weightNeutral) + (mix.lowDays * base.weightLow);

    const currentWearUnits = Number(Math.min(base.wearThreshold, rawWear).toFixed(1));
    const wearPercentage = isReset ? 0 : Math.min(100, Math.round((rawWear / base.wearThreshold) * 100));

    const totalCalculatedWear = ((mix.highDays * base.weightHigh) + (mix.neutralDays * base.weightNeutral) + (mix.lowDays * base.weightLow));
    const dailyBurnRate = Number((totalCalculatedWear / totalDays).toFixed(2));
    const projectedCycleDays = dailyBurnRate > 0 ? Math.round(base.wearThreshold / dailyBurnRate) : 180;
    const daysElapsed = isReset ? 0 : totalDays;
    const daysRemaining = isReset ? projectedCycleDays : Math.max(0, projectedCycleDays - daysElapsed);

    let urgencyBadge = 'optimal';
    let urgencyStatus = 'Operational / Safe';

    if (wearPercentage >= 100 || daysRemaining === 0) {
      urgencyBadge = 'critical';
      urgencyStatus = 'Service Due (100%)';
      dueImmediatelyCount++;
    } else if (wearPercentage >= 80 || daysRemaining <= 10) {
      urgencyBadge = 'warning';
      urgencyStatus = `Approaching Threshold (${wearPercentage}%)`;
      warningCount++;
    } else {
      urgencyBadge = 'optimal';
      urgencyStatus = `Operational (${wearPercentage}%)`;
      operationalCount++;
    }

    totalWearPctSum += wearPercentage;
    totalCycleDaysSum += projectedCycleDays;

    const mathFormula = isReset
      ? `W_cum = 0.0 / ${base.wearThreshold.toFixed(1)} Units (Recently Certified & Reset)`
      : `W_cum = (${mix.highDays} × ${base.weightHigh.toFixed(2)}) + (${mix.neutralDays} × ${base.weightNeutral.toFixed(2)}) + (${mix.lowDays} × ${base.weightLow.toFixed(2)}) = ${rawWear.toFixed(1)} / ${base.wearThreshold.toFixed(1)} Units`;

    const lastServiced = isReset ? 'Today' : base.lastMaintenance;
    const nextDue = wearPercentage >= 100 ? 'Immediate (Threshold Reached)' : `${daysRemaining} Days`;

    return {
      ...base,
      currentWearUnits,
      wearPercentage,
      dailyBurnRate,
      projectedCycleDays,
      daysElapsed,
      daysRemaining,
      urgencyStatus,
      urgencyBadge,
      mathFormula,
      lastMaintenance: lastServiced,
      nextDueDate: nextDue
    };
  });

  const averageWearIndex = Math.round(totalWearPctSum / services.length);
  const averageCycleDays = Math.round(totalCycleDaysSum / services.length);

  return {
    activeScenario: scenario,
    activeScenarioTitle: scenarioTitle,
    sessionMix: {
      totalDays,
      highDays: mix.highDays,
      neutralDays: mix.neutralDays,
      lowDays: mix.lowDays,
      highPct,
      neutralPct,
      lowPct
    },
    services,
    stats: {
      totalMonitoredServices: services.length,
      dueImmediatelyCount,
      warningCount,
      operationalCount,
      averageWearIndex,
      averageCycleDays
    },
    actionLogs: maintenanceActionLogs
  };
}

app.get('/api/maintenance/overview', role('manager'), (req, res) => {
  const equipment = db.prepare('SELECT * FROM maintenance_equipment ORDER BY failure_probability DESC').all();
  const tasks = db.prepare('SELECT * FROM maintenance_tasks ORDER BY created_at DESC').all();
  const overview = buildGroupedMaintenanceOverview(activeMaintenanceScenario, activeSessionMix);

  res.json({
    ...overview,
    equipment,
    tasks,
    criticalCount: overview.stats.dueImmediatelyCount,
    scheduledCount: tasks.filter(t => t.status === 'Scheduled').length,
    overallHealthPct: Math.max(0, 100 - overview.stats.averageWearIndex)
  });
});

app.post('/api/maintenance/scenario', role('manager'), (req, res) => {
  const { scenario = 'scenario-60', highDays, neutralDays, lowDays } = req.body;
  activeMaintenanceScenario = scenario;
  if (scenario === 'custom' && (highDays !== undefined || neutralDays !== undefined || lowDays !== undefined)) {
    activeSessionMix = {
      highDays: Number(highDays) || 0,
      neutralDays: Number(neutralDays) || 0,
      lowDays: Number(lowDays) || 0
    };
  }

  const overview = buildGroupedMaintenanceOverview(scenario, activeSessionMix);

  maintenanceActionLogs.unshift({
    id: 'log-' + randomUUID().slice(0, 8),
    service_id: 'fleet_overview',
    service_name: 'Fleet Predictive Engine',
    action_type: 'Scenario Evaluated',
    performed_by: req.user?.name || 'Chief Engineer',
    notes: `Evaluated ${overview.activeScenarioTitle} (${overview.sessionMix.highDays} High / ${overview.sessionMix.neutralDays} Neutral / ${overview.sessionMix.lowDays} Low). Average fleet wear: ${overview.stats.averageWearIndex}%.`,
    created_at: new Date().toISOString()
  });

  res.json({
    ok: true,
    message: `Evaluated ${overview.activeScenarioTitle}`,
    ...overview
  });
});

app.post('/api/maintenance/perform', role('manager'), (req, res) => {
  const { serviceId, notes = '', performedBy = 'Chief Engineer & Technical Unit' } = req.body;
  const service = CORE_MAINTENANCE_SERVICES.find(s => s.id === serviceId);
  if (!service) return res.status(404).json({ error: 'Service not found.' });

  maintenanceResetMap.set(serviceId, Date.now());

  maintenanceActionLogs.unshift({
    id: 'log-' + randomUUID().slice(0, 8),
    service_id: serviceId,
    service_name: service.name,
    action_type: 'Maintenance Certified',
    performed_by: performedBy.trim() || 'Chief Engineer & Technical Unit',
    notes: notes.trim() || 'Certified preventative maintenance completed. Cumulative fatigue reset to 0.0 units.',
    created_at: new Date().toISOString()
  });

  const overview = buildGroupedMaintenanceOverview(activeMaintenanceScenario, activeSessionMix);

  res.json({
    ok: true,
    message: `Certified maintenance completed for ${service.name}. Cumulative fatigue reset to 0.0 units!`,
    overview
  });
});

app.post('/api/maintenance/schedule', role('manager'), (req, res) => {
  const { equipmentId, task, priority = 'Critical', technician, scheduledDate, duration = '3 hours', estimatedCost, notes = '' } = req.body;
  if (!equipmentId || !task) return res.status(400).json({ error: 'Equipment and task description are required.' });

  const eq = db.prepare('SELECT * FROM maintenance_equipment WHERE id = ?').get(equipmentId);
  if (!eq) return res.status(404).json({ error: 'Equipment not found.' });

  const taskId = 'task-' + randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  // Create scheduled work order task
  db.prepare(`
    INSERT INTO maintenance_tasks (
      id, equipment_id, equipment_name, task, priority, technician, scheduled_date, duration, status, estimated_cost, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId, eq.id, eq.name, task, priority, technician || 'Emergency Engineering Team',
    scheduledDate || 'Tomorrow 9:00 AM', duration, 'Scheduled', estimatedCost || eq.estimated_cost || '₹50K', notes, now
  );

  // Update equipment status: improve health, decrease failure probability, set status to Repair Scheduled
  const newHealth = Math.min(88, eq.health + 30);
  const newFailureProb = Math.max(12, eq.failure_probability - 45);
  const newStatus = 'Repair Scheduled';

  db.prepare('UPDATE maintenance_equipment SET status = ?, health = ?, failure_probability = ?, next_due = ? WHERE id = ?')
    .run(newStatus, newHealth, newFailureProb, scheduledDate || 'Scheduled', eq.id);

  res.status(201).json({
    ok: true,
    taskId,
    message: `Repair successfully scheduled for ${eq.name}. Work order #${taskId} created.`,
    updatedEquipment: db.prepare('SELECT * FROM maintenance_equipment WHERE id = ?').get(eq.id)
  });
});

app.post('/api/maintenance/equipment', role('manager'), (req, res) => {
  const { name, location, type, status = 'Healthy', health = 90, failureProbability = 10, estimatedCost = null } = req.body;
  if (!textValid(name, 100)) return res.status(400).json({ error: 'Equipment name is required.' });

  const id = 'eq-' + randomUUID().slice(0, 8);
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT INTO maintenance_equipment (
      id, name, location, type, status, health, last_maintenance, next_due, failure_probability, issue, estimated_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), location || 'Resort Grounds', type || 'General', status, health, today, today, failureProbability, null, estimatedCost);

  res.status(201).json({ ok: true, id });
});

app.patch('/api/maintenance/tasks/:id', role('manager'), (req, res) => {
  const { status, scheduled_date } = req.body;
  const task = db.prepare('SELECT * FROM maintenance_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  db.prepare('UPDATE maintenance_tasks SET status = COALESCE(?, status), scheduled_date = COALESCE(?, scheduled_date) WHERE id = ?')
    .run(status || null, scheduled_date || null, req.params.id);

  res.json({ ok: true, task: db.prepare('SELECT * FROM maintenance_tasks WHERE id = ?').get(req.params.id) });
});

// ── Staff Scheduling API ──────────────────────────────────────────────────────
app.get('/api/staff', role('manager'), (req, res) => {
  const staff = db.prepare('SELECT * FROM staff_members ORDER BY id ASC').all();
  const recs = db.prepare("SELECT * FROM staff_recommendations WHERE status = 'active'").all();

  const totalStaff = staff.length || 54;
  const onShift = staff.filter(s => s.status === 'On Shift').length;
  const avgEfficiency = staff.length ? Math.round(staff.reduce((acc, s) => acc + s.efficiency, 0) / staff.length) : 91;
  const hoursToday = staff.reduce((acc, s) => acc + s.hours, 0) || 298;

  // Real occupancy and requests link to dynamic department workloads
  const occupiedCount = db.prepare("SELECT COUNT(*) as c FROM rooms WHERE status = 'Occupied'").get().c;
  const pendingRequests = db.prepare("SELECT category, COUNT(*) as c FROM requests WHERE status != 'Completed' GROUP BY category").all();
  const reqMap = Object.fromEntries(pendingRequests.map(r => [r.category, r.c]));

  const housekeepingLoad = Math.min(99, Math.round(76 + (occupiedCount / 150) * 18 + (reqMap['Housekeeping'] || 0) * 2));
  const frontOfficeLoad = Math.min(95, Math.round(62 + (occupiedCount / 150) * 12));
  const fbLoad = Math.min(95, Math.round(68 + (occupiedCount / 150) * 16 + (reqMap['Dining'] || 0) * 3));
  const engLoad = Math.min(90, Math.round(58 + (reqMap['Maintenance'] || 0) * 5));

  const workloadData = [
    { department: 'Housekeeping', current: housekeepingLoad, optimal: 80, staff: staff.filter(s => s.department === 'Housekeeping').length || 12 },
    { department: 'Front Office', current: frontOfficeLoad, optimal: 75, staff: staff.filter(s => s.department === 'Front Office').length || 6 },
    { department: 'F&B', current: fbLoad, optimal: 80, staff: staff.filter(s => s.department === 'F&B').length || 18 },
    { department: 'Engineering', current: engLoad, optimal: 70, staff: staff.filter(s => s.department === 'Engineering').length || 8 },
    { department: 'Spa', current: 45, optimal: 60, staff: staff.filter(s => s.department.includes('Spa')).length || 4 },
    { department: 'Security', current: 88, optimal: 85, staff: staff.filter(s => s.department === 'Security').length || 6 },
  ];

  const efficiencyTrend = [
    { day: 'Mon', efficiency: 85 },
    { day: 'Tue', efficiency: 88 },
    { day: 'Wed', efficiency: 82 },
    { day: 'Thu', efficiency: 90 },
    { day: 'Fri', efficiency: 87 },
    { day: 'Sat', efficiency: 91 },
    { day: 'Sun', efficiency: 89 },
  ];

  const shiftSchedule = [
    { time: '06:00', label: 'Early Morning', staff: staff.filter(s => s.shift === 'Morning' && s.hours >= 8).length || 8, color: 'bg-orange-100 text-orange-700' },
    { time: '09:00', label: 'Morning Peak', staff: onShift || 24, color: 'bg-blue-100 text-blue-700' },
    { time: '14:00', label: 'Afternoon', staff: staff.filter(s => s.shift === 'Morning' || s.shift === 'Afternoon').length || 18, color: 'bg-green-100 text-green-700' },
    { time: '18:00', label: 'Evening', staff: staff.filter(s => s.shift === 'Evening').length || 22, color: 'bg-purple-100 text-purple-700' },
    { time: '22:00', label: 'Night', staff: staff.filter(s => s.shift === 'Night').length || 6, color: 'bg-slate-100 text-slate-700' },
  ];

  res.json({
    metrics: {
      totalStaff,
      onShift,
      avgEfficiency,
      hoursToday,
      activeWorkforcePct: Math.round((onShift / (totalStaff || 1)) * 100)
    },
    recommendations: recs,
    workloadData,
    efficiencyTrend,
    shiftSchedule,
    staffMembers: staff
  });
});

app.post('/api/staff', role('manager'), (req, res) => {
  const { name, role: staffRole, department, shift = 'Morning', hours = 8, phone = '', email = '', assigned_area = '' } = req.body;
  if (!textValid(name, 100) || !textValid(staffRole, 100))
    return res.status(400).json({ error: 'Name and role are required.' });

  const avatar = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const efficiency = 88 + Math.floor(Math.random() * 10);
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO staff_members (
      name, role, department, status, shift, hours, efficiency, avatar, phone, email, experience_years, assigned_area, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(), staffRole.trim(), department || 'Front Office', 'On Shift', shift,
    Number(hours) || 8, efficiency, avatar, phone, email, 3, assigned_area || 'Resort Premises', now
  );

  const created = db.prepare('SELECT * FROM staff_members WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, staff: created });
});

app.put('/api/staff/:id', role('manager'), (req, res) => {
  const { status, shift, hours, department } = req.body;
  const staff = db.prepare('SELECT * FROM staff_members WHERE id = ?').get(req.params.id);
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });

  db.prepare(`
    UPDATE staff_members
    SET status = COALESCE(?, status),
        shift = COALESCE(?, shift),
        hours = COALESCE(?, hours),
        department = COALESCE(?, department)
    WHERE id = ?
  `).run(status || null, shift || null, hours ? Number(hours) : null, department || null, req.params.id);

  res.json({ ok: true, staff: db.prepare('SELECT * FROM staff_members WHERE id = ?').get(req.params.id) });
});

app.post('/api/staff/recommendations/:id/action', role('manager'), (req, res) => {
  const { id } = req.params;
  const rec = db.prepare('SELECT * FROM staff_recommendations WHERE id = ?').get(id);
  if (!rec) return res.status(404).json({ error: 'Recommendation not found.' });

  if (rec.action.includes('Redeploy')) {
    db.prepare("UPDATE staff_members SET department = 'Housekeeping', role = 'Cross-Support Room Turnover' WHERE department = 'Spa & Wellness'").run();
    db.prepare("UPDATE staff_recommendations SET status = 'completed' WHERE id = ?").run(id);
    return res.json({ ok: true, message: '2 Spa staff members redeployed to Housekeeping. Turnover efficiency improved by 35%!' });
  }

  if (rec.action.includes('Overtime')) {
    db.prepare("UPDATE staff_members SET hours = hours + 2 WHERE department = 'Security'").run();
    db.prepare("UPDATE staff_recommendations SET status = 'completed' WHERE id = ?").run(id);
    return res.json({ ok: true, message: 'Night shift coverage gap resolved. 2 overtime hours scheduled for security team.' });
  }

  if (rec.action.includes('Training')) {
    db.prepare("UPDATE staff_members SET role = role || ' (Pool Certified)' WHERE department = 'F&B'").run();
    db.prepare("UPDATE staff_recommendations SET status = 'completed' WHERE id = ?").run(id);
    return res.json({ ok: true, message: 'Cross-training module initiated for F&B staff in pool safety operations.' });
  }

  db.prepare("UPDATE staff_recommendations SET status = 'completed' WHERE id = ?").run(id);
  res.json({ ok: true, message: 'Action executed successfully.' });
});

// ── Inventory Optimization API ────────────────────────────────────────────────
app.get('/api/inventory', role('manager'), (req, res) => {
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY id ASC').all();
  const purchaseOrders = db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all();
  const insights = db.prepare("SELECT * FROM inventory_insights WHERE status = 'active'").all();

  const lowStockCount = items.filter(i => i.status === 'Low' || i.status === 'Critical').length;
  const pendingOrders = purchaseOrders.filter(po => po.status === 'Pending');
  const pendingOrdersCount = pendingOrders.length;
  const pendingOrdersSum = pendingOrders.reduce((sum, po) => sum + (po.numeric_amount || 0), 0);
  const pendingOrdersValue = `₹${pendingOrdersSum.toLocaleString('en-IN')}`;

  const demandForecast = [
    { day: 'Mon', predicted: 85, actual: 82 },
    { day: 'Tue', predicted: 90, actual: 88 },
    { day: 'Wed', predicted: 75, actual: 78 },
    { day: 'Thu', predicted: 95, actual: 92 },
    { day: 'Fri', predicted: 110, actual: 108 },
    { day: 'Sat', predicted: 125, actual: 130 },
    { day: 'Sun', predicted: 115, actual: 112 },
  ];

  const categoryBreakdown = [
    { name: 'F&B', value: 45, color: '#3b82f6' },
    { name: 'Housekeeping', value: 25, color: '#8b5cf6' },
    { name: 'Amenities', value: 15, color: '#10b981' },
    { name: 'Maintenance', value: 15, color: '#f59e0b' },
  ];

  res.json({
    metrics: {
      totalItems: 1247,
      lowStockCount,
      pendingOrdersCount,
      pendingOrdersValue,
      forecastAccuracy: 94
    },
    insights,
    demandForecast,
    categoryBreakdown,
    items,
    purchaseOrders
  });
});

app.post('/api/inventory/items/:id/order', role('manager'), (req, res) => {
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });

  const orderUnits = req.body.units || Math.max(20, Math.round(item.max_stock - item.stock));
  const numericCost = Math.round(orderUnits * item.cost);
  const poId = `PO-2026-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO purchase_orders (id, supplier, items_count, total_amount, numeric_amount, status, expected_date, created_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    poId, item.supplier || 'Primary Supplier', orderUnits,
    `₹${numericCost.toLocaleString('en-IN')}`, numericCost, 'Pending',
    'Tomorrow', now, `Replenishment order for ${item.name} (${orderUnits} ${item.unit})`
  );

  db.prepare("UPDATE inventory_items SET trend = 'up' WHERE id = ?").run(item.id);

  res.status(201).json({
    ok: true,
    poId,
    message: `Purchase Order ${poId} dispatched to ${item.supplier || 'supplier'} for ${orderUnits} ${item.unit} of ${item.name}.`,
    updatedItem: db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.id)
  });
});

app.post('/api/inventory/insights/:id/action', role('manager'), (req, res) => {
  const insight = db.prepare('SELECT * FROM inventory_insights WHERE id = ?').get(req.params.id);
  if (!insight) return res.status(404).json({ error: 'Insight not found.' });

  const now = new Date().toISOString();
  let poId = `PO-2026-AI-${Math.floor(100 + Math.random() * 900)}`;
  let message = '';

  if (insight.action_type === 'order_milk') {
    db.prepare(`
      INSERT INTO purchase_orders (id, supplier, items_count, total_amount, numeric_amount, status, expected_date, created_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(poId, 'Heritage Dairy Farms', 60, '₹3,120', 3120, 'Approved', 'Tomorrow 6:00 AM', now, 'Emergency breakfast dairy replenishment');
    db.prepare("UPDATE inventory_items SET stock = stock + 60, status = 'Optimal', trend = 'up' WHERE name = 'Fresh Milk'").run();
    message = 'Emergency Milk order (60 Liters) placed and approved. Delivered by 6:00 AM tomorrow.';
  } else if (insight.action_type === 'increase_chicken') {
    db.prepare(`
      INSERT INTO purchase_orders (id, supplier, items_count, total_amount, numeric_amount, status, expected_date, created_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(poId, 'Meat Masters Wholesalers', 15, '₹4,200', 4200, 'Approved', 'Friday 8:00 AM', now, 'Weekend buffet booking poultry spike allocation');
    db.prepare("UPDATE inventory_items SET stock = stock + 15, status = 'Optimal', trend = 'up' WHERE name = 'Chicken Breast'").run();
    message = 'Chicken order increased by 15kg for Friday delivery. Buffet capacity secured.';
  } else if (insight.action_type === 'bulk_rice') {
    db.prepare(`
      INSERT INTO purchase_orders (id, supplier, items_count, total_amount, numeric_amount, status, expected_date, created_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(poId, 'Royal Grains Exporters', 500, '₹37,400', 37400, 'Approved', 'End of Month', now, 'Bulk order for 500kg Basmati Rice with 12% supplier discount');
    db.prepare("UPDATE inventory_items SET stock = stock + 100, trend = 'up' WHERE name = 'Rice Basmati'").run();
    message = 'Bulk purchase authorized for 500kg Basmati Rice at 12% discount. Saving ₹4,200 monthly.';
  } else {
    message = 'Optimization recommendation executed.';
  }

  db.prepare("UPDATE inventory_insights SET status = 'completed' WHERE id = ?").run(insight.id);

  res.json({ ok: true, poId, message });
});

app.post('/api/inventory/purchase-orders', role('manager'), (req, res) => {
  const { supplier, itemsCount = 1, amount = 10000, notes = '' } = req.body;
  if (!textValid(supplier, 100)) return res.status(400).json({ error: 'Supplier is required.' });

  const poId = `PO-2026-${Math.floor(200 + Math.random() * 800)}`;
  const numericAmount = Number(amount) || 10000;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO purchase_orders (id, supplier, items_count, total_amount, numeric_amount, status, expected_date, created_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    poId, supplier.trim(), Number(itemsCount) || 1,
    `₹${numericAmount.toLocaleString('en-IN')}`, numericAmount,
    'Pending', 'In 2 days', now, notes || 'Standard procurement order'
  );

  res.status(201).json({
    ok: true,
    poId,
    order: db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId)
  });
});

app.patch('/api/inventory/purchase-orders/:id/status', role('manager'), (req, res) => {
  const { status } = req.body;
  if (!['Pending', 'Approved', 'Shipped', 'Received'].includes(status))
    return res.status(400).json({ error: 'Invalid status.' });

  const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  db.prepare('UPDATE purchase_orders SET status = ? WHERE id = ?').run(status, req.params.id);

  if (status === 'Received') {
    if (order.supplier.includes('Dairy') || (order.notes && order.notes.toLowerCase().includes('milk'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 60, status = 'Optimal', trend = 'up' WHERE name = 'Fresh Milk'").run();
    } else if (order.supplier.includes('Meat') || (order.notes && order.notes.toLowerCase().includes('chicken'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 25, status = 'Optimal', trend = 'up' WHERE name = 'Chicken Breast'").run();
    } else if (order.supplier.includes('Farms') || (order.notes && order.notes.toLowerCase().includes('vegetable'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 50, status = 'Optimal', trend = 'up' WHERE name = 'Fresh Vegetables'").run();
    } else if (order.supplier.includes('Chemical') || (order.notes && order.notes.toLowerCase().includes('pool'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 20, status = 'Optimal', trend = 'up' WHERE name = 'Pool Chemicals'").run();
    } else if (order.supplier.includes('CleanLiving') || (order.notes && order.notes.toLowerCase().includes('toilet'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 150, status = 'Optimal', trend = 'up' WHERE name = 'Toilet Paper'").run();
    } else if (order.supplier.includes('Botanica') || (order.notes && order.notes.toLowerCase().includes('shampoo'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 60, status = 'Optimal', trend = 'up' WHERE name = 'Shampoo Bottles'").run();
    } else if (order.supplier.includes('Grains') || (order.notes && order.notes.toLowerCase().includes('rice'))) {
      db.prepare("UPDATE inventory_items SET stock = stock + 200, status = 'Optimal', trend = 'up' WHERE name = 'Rice Basmati'").run();
    }
  }

  res.json({ ok: true, order: db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) });
});

// ── Business & Revenue Intelligence Dashboard (Manager only) ────────────────
app.get('/api/revenue/overview', role('manager'), (req, res) => {
  // 1. Grouped room calculation: cost of room * occupied room
  const roomTypes = db.prepare(`
    SELECT 
      type,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'Cleaning' THEN 1 ELSE 0 END) as cleaning,
      SUM(CASE WHEN status = 'Maintenance' THEN 1 ELSE 0 END) as maintenance,
      MIN(price_per_night) as price_per_night
    FROM rooms 
    GROUP BY type 
    ORDER BY price_per_night ASC
  `).all();

  const roomCalculations = roomTypes.map(r => {
    const total = r.total || 0;
    const occupied = r.occupied || 0;
    const price = r.price_per_night || 0;
    const subtotal = occupied * price;
    const potentialMax = total * price;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return {
      type: r.type,
      total,
      occupied,
      available: r.available || 0,
      cleaning: r.cleaning || 0,
      maintenance: r.maintenance || 0,
      pricePerNight: price,
      subtotal, // Cost of room * occupied room
      potentialMax,
      occupancyRate,
      utilizationGap: potentialMax - subtotal
    };
  });

  const totalRooms = roomCalculations.reduce((acc, r) => acc + r.total, 0) || 150;
  const totalOccupied = roomCalculations.reduce((acc, r) => acc + r.occupied, 0) || 125;
  const overallOccupancy = Math.round((totalOccupied / totalRooms) * 100);
  const dailyRoomRevenue = roomCalculations.reduce((acc, r) => acc + r.subtotal, 0);

  // Dining and ancillary revenue from requests
  const diningTotal = db.prepare(`
    SELECT SUM(total) as dining_rev, COUNT(*) as orders_count 
    FROM requests 
    WHERE category = 'Dining' OR total > 0
  `).get()?.dining_rev || 14090;

  const spaAndServicesRev = 45000; // Spa wellness, airport transfers & amenities
  const dailyTotalRevenue = dailyRoomRevenue + diningTotal + spaAndServicesRev;
  const adr = totalOccupied > 0 ? Math.round(dailyRoomRevenue / totalOccupied) : 0;
  const revpar = totalRooms > 0 ? Math.round(dailyRoomRevenue / totalRooms) : 0;

  // 1-Day Business Tracker (Today breakdown by shifts & day parts)
  const oneDayTracker = {
    today: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    totalRevenue: dailyTotalRevenue,
    roomRevenue: dailyRoomRevenue,
    diningRevenue: diningTotal,
    servicesRevenue: spaAndServicesRev,
    occupancyPct: overallOccupancy,
    occupiedRooms: totalOccupied,
    adr,
    revpar,
    shifts: [
      { shift: 'Morning (06:00 - 12:00)', label: 'Buffet Breakfast & Morning Check-ins', rooms: Math.round(dailyRoomRevenue * 0.15), dining: Math.round(diningTotal * 0.4), services: 12000, total: Math.round(dailyRoomRevenue * 0.15 + diningTotal * 0.4 + 12000) },
      { shift: 'Afternoon (12:00 - 17:00)', label: 'Pool Lounge, Lunch & Spa Therapies', rooms: Math.round(dailyRoomRevenue * 0.10), dining: Math.round(diningTotal * 0.3), services: 21000, total: Math.round(dailyRoomRevenue * 0.10 + diningTotal * 0.3 + 21000) },
      { shift: 'Evening (17:00 - 22:00)', label: 'Sunset Bar, Dinner & Night Audit Charges', rooms: Math.round(dailyRoomRevenue * 0.65), dining: Math.round(diningTotal * 0.25), services: 9000, total: Math.round(dailyRoomRevenue * 0.65 + diningTotal * 0.25 + 9000) },
      { shift: 'Night (22:00 - 06:00)', label: 'Late In-Room Dining & Overnight Stays', rooms: Math.round(dailyRoomRevenue * 0.10), dining: Math.round(diningTotal * 0.05), services: 3000, total: Math.round(dailyRoomRevenue * 0.10 + diningTotal * 0.05 + 3000) }
    ]
  };

  // 7-Days Business Tracker
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const past7Days = [];
  let sevenDaysTotalRevenue = 0;
  let sevenDaysRoomNights = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayLabel = dayNames[d.getDay()];
    const dateFormatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const isWeekend = d.getDay() === 0 || d.getDay() === 6 || d.getDay() === 5;
    const occ = i === 0 ? totalOccupied : Math.round(totalOccupied * (isWeekend ? 1.05 : 0.94));
    const roomsRev = Math.round(occ * adr);
    const diningRev = Math.round(diningTotal * (isWeekend ? 1.35 : 0.92));
    const dayTotal = roomsRev + diningRev + spaAndServicesRev;
    sevenDaysTotalRevenue += dayTotal;
    sevenDaysRoomNights += occ;

    past7Days.push({
      date: dateFormatted,
      day: dayLabel,
      occupiedRooms: occ,
      occupancyPct: Math.round((occ / totalRooms) * 100),
      roomRevenue: roomsRev,
      diningRevenue: diningRev,
      servicesRevenue: spaAndServicesRev,
      totalRevenue: dayTotal,
      adr: Math.round(roomsRev / occ)
    });
  }

  // 30-Days Business Tracker (Trend over 30 days & 4-week groupings)
  const thirtyDaysTrend = [];
  let thirtyDaysTotalRevenue = 0;
  let thirtyDaysRoomNights = 0;

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayNum = 30 - i;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6 || d.getDay() === 5;
    const occ = i === 0 ? totalOccupied : Math.round(totalOccupied * (isWeekend ? (1 + (Math.sin(i) * 0.07)) : (0.94 + (Math.cos(i) * 0.04))));
    const clampedOcc = Math.min(totalRooms, Math.max(85, occ));
    const dayRev = Math.round((clampedOcc * adr) + diningTotal + spaAndServicesRev);
    thirtyDaysTotalRevenue += dayRev;
    thirtyDaysRoomNights += clampedOcc;

    thirtyDaysTrend.push({
      dayIndex: dayNum,
      date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      weekday: dayNames[d.getDay()],
      occupiedRooms: clampedOcc,
      occupancyPct: Math.round((clampedOcc / totalRooms) * 100),
      revenueLakhs: Number((dayRev / 100000).toFixed(2)),
      totalRevenue: dayRev
    });
  }

  const weeklySummary = [
    { week: 'Week 1 (Days 1–7)', revenue: thirtyDaysTrend.slice(0, 7).reduce((s, x) => s + x.totalRevenue, 0), avgOcc: Math.round(thirtyDaysTrend.slice(0, 7).reduce((s, x) => s + x.occupancyPct, 0) / 7) },
    { week: 'Week 2 (Days 8–14)', revenue: thirtyDaysTrend.slice(7, 14).reduce((s, x) => s + x.totalRevenue, 0), avgOcc: Math.round(thirtyDaysTrend.slice(7, 14).reduce((s, x) => s + x.occupancyPct, 0) / 7) },
    { week: 'Week 3 (Days 15–21)', revenue: thirtyDaysTrend.slice(14, 21).reduce((s, x) => s + x.totalRevenue, 0), avgOcc: Math.round(thirtyDaysTrend.slice(14, 21).reduce((s, x) => s + x.occupancyPct, 0) / 7) },
    { week: 'Week 4 (Days 22–30)', revenue: thirtyDaysTrend.slice(21, 30).reduce((s, x) => s + x.totalRevenue, 0), avgOcc: Math.round(thirtyDaysTrend.slice(21, 30).reduce((s, x) => s + x.occupancyPct, 0) / 9) }
  ];

  // Seed initial calculations if table is empty
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM revenue_calculations').get()?.count || 0;
    if (count === 0) {
      db.prepare(`
        INSERT INTO revenue_calculations (id, user_id, title, calculation_data, daily_revenue, weekly_revenue, monthly_revenue, created_at)
        VALUES 
        ('calc-seed-1', 'manager-1', 'Peak Season Surge Strategy (+18% ADR)', ?, 4125000, 28875000, 123750000, ?),
        ('calc-seed-2', 'manager-1', 'Monsoon Retreat Baseline (78% Target)', ?, 3240000, 22680000, 97200000, ?)
      `).run(
        JSON.stringify({ targetOccupancy: 94, customRates: { 'Deluxe Ocean View': 21000, 'Garden Villa': 27500, 'Presidential Suite': 65000, 'Private Pool Suite': 38000, 'Standard King': 14000 }, diningPerGuest: 1800, notes: 'Targeting luxury holiday inbound travelers with bundled spa credits.' }),
        new Date(Date.now() - 86400000 * 2).toISOString(),
        JSON.stringify({ targetOccupancy: 78, customRates: { 'Deluxe Ocean View': 16500, 'Garden Villa': 21000, 'Presidential Suite': 52000, 'Private Pool Suite': 30000, 'Standard King': 10500 }, diningPerGuest: 1400, notes: 'Value-led domestic corporate retreat package.' }),
        new Date(Date.now() - 86400000 * 5).toISOString()
      );
    }
  } catch (seedErr) {
    console.error('[Revenue Calc Seed Error]', seedErr.message);
  }

  let savedCalculations = [];
  try {
    savedCalculations = db.prepare('SELECT * FROM revenue_calculations ORDER BY created_at DESC LIMIT 20').all().map(c => ({
      ...c,
      calculation_data: JSON.parse(c.calculation_data)
    }));
  } catch (parseErr) {
    console.error('[Revenue Calc Parse Error]', parseErr.message);
  }

  res.json({
    kpis: {
      totalRooms,
      occupiedRooms: totalOccupied,
      overallOccupancy,
      dailyRoomRevenue,
      dailyDiningRevenue: diningTotal,
      dailyServicesRevenue: spaAndServicesRev,
      dailyTotalRevenue,
      adr,
      revpar,
      sevenDaysTotalRevenue,
      sevenDaysRoomNights,
      sevenDaysAvgDaily: Math.round(sevenDaysTotalRevenue / 7),
      thirtyDaysTotalRevenue,
      thirtyDaysRoomNights,
      thirtyDaysAvgOccupancy: Math.round(thirtyDaysTrend.reduce((s, x) => s + x.occupancyPct, 0) / 30)
    },
    roomCalculations,
    oneDayTracker,
    sevenDaysTracker: {
      totalRevenue: sevenDaysTotalRevenue,
      roomNights: sevenDaysRoomNights,
      days: past7Days
    },
    thirtyDaysTracker: {
      totalRevenue: thirtyDaysTotalRevenue,
      roomNights: thirtyDaysRoomNights,
      weeklySummary,
      days: thirtyDaysTrend
    },
    savedCalculations
  });
});

app.post('/api/revenue/calculations', role('manager'), (req, res) => {
  const { title, calculation_data, daily_revenue, weekly_revenue, monthly_revenue } = req.body;
  if (!textValid(title, 120)) return res.status(400).json({ error: 'Title required (up to 120 characters).' });

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO revenue_calculations (id, user_id, title, calculation_data, daily_revenue, weekly_revenue, monthly_revenue, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.user.id,
    title.trim(),
    JSON.stringify(calculation_data || {}),
    Math.round(Number(daily_revenue) || 0),
    Math.round(Number(weekly_revenue) || 0),
    Math.round(Number(monthly_revenue) || 0),
    now
  );

  const item = db.prepare('SELECT * FROM revenue_calculations WHERE id = ?').get(id);
  res.status(201).json({
    ok: true,
    calculation: {
      ...item,
      calculation_data: JSON.parse(item.calculation_data)
    }
  });
});

app.delete('/api/revenue/calculations/:id', role('manager'), (req, res) => {
  const result = db.prepare('DELETE FROM revenue_calculations WHERE id = ?').run(req.params.id);
  res.json({ ok: result.changes > 0 });
});

// ── Catch-all & Production Static File Serving ────────────────────────────────
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

const distPath = path.join(here, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(err.message);
  res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? 'Invalid request.' : 'Something went wrong. Please try again.' });
});

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(Number(process.env.PORT || 5000), '0.0.0.0', () =>
  console.log(`Smart Resort 360 ready → port ${process.env.PORT || 5000}`)
);
