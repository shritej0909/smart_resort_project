// RAG (Retrieval-Augmented Generation) pipeline
// 1. Chunks hotel PDF / embedded text into passages
// 2. Retrieves top-k chunks by TF-IDF cosine similarity (no external embedding API needed)
// 3. Sends retrieved context + user question to Gemini for a grounded answer
//
// To use a real PDF: place hotel_info.pdf in server/data/ — it will be parsed automatically.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HOTEL_INFO_TEXT } from './hotel_info.pdf.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── PDF parsing (optional) ────────────────────────────────────────────────────
async function loadPdfText() {
  const pdfPath = path.join(here, 'data', 'hotel_info.pdf');
  if (!existsSync(pdfPath)) return null;
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const buf = readFileSync(pdfPath);
    const { text } = await pdfParse(buf);
    return text;
  } catch (e) {
    console.warn('[RAG] pdf-parse not available or PDF unreadable:', e.message);
    return null;
  }
}

// ── Chunking ──────────────────────────────────────────────────────────────────
function chunkText(text, size = 400, overlap = 80) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    chunks.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
  }
  return chunks;
}

// ── TF-IDF cosine similarity retriever ───────────────────────────────────────
function tokenise(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function buildTfIdf(chunks) {
  const tf = chunks.map(chunk => {
    const tokens = tokenise(chunk);
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const total = tokens.length || 1;
    for (const t in freq) freq[t] /= total;
    return freq;
  });
  const df = {};
  for (const freq of tf) for (const t in freq) df[t] = (df[t] || 0) + 1;
  const N = chunks.length;
  const idf = {};
  for (const t in df) idf[t] = Math.log(N / df[t]);
  const tfidf = tf.map(freq => {
    const vec = {};
    for (const t in freq) vec[t] = freq[t] * (idf[t] || 1);
    return vec;
  });
  return { tfidf, idf };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const t in a) { dot += (a[t] || 0) * (b[t] || 0); na += a[t] ** 2; }
  for (const t in b) nb += b[t] ** 2;
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function queryVec(query, idf) {
  const tokens = tokenise(query);
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const total = tokens.length || 1;
  const vec = {};
  for (const t in freq) vec[t] = (freq[t] / total) * (idf[t] || 1);
  return vec;
}

// ── Initialise (lazy) ─────────────────────────────────────────────────────────
let _chunks = null;
let _index = null;

export function invalidateRagIndex() {
  _chunks = null;
  _index = null;
}

async function ensureIndex() {
  if (_chunks) return;
  const pdfText = await loadPdfText();
  let text = pdfText || HOTEL_INFO_TEXT;

  // Augment with real-time actual room rates from hotel_info.json if available
  const jsonPath = path.join(here, 'data', 'hotel_info.json');
  if (existsSync(jsonPath)) {
    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      if (data.dynamic_pricing_system?.rooms) {
        text += `\n\n=== CURRENT LIVE ROOM RATES ===\n`;
        for (const r of data.dynamic_pricing_system.rooms) {
          text += `• ${r.name}: ₹${r.current_rate.toLocaleString('en-IN')} per night.\n`;
        }
      }
    } catch {}
  }

  _chunks = chunkText(text);
  _index = buildTfIdf(_chunks);
  console.log(`[RAG] Index ready — ${_chunks.length} chunks`);
}

function retrieve(query, k = 4) {
  const qv = queryVec(query, _index.idf);
  return _chunks
    .map((chunk, i) => ({ chunk, score: cosine(qv, _index.tfidf[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter(x => x.score > 0)
    .map(x => x.chunk);
}

// ── Google Gemini ─────────────────────────────────────────────────────────────
function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('YOUR_KEY')) return null;
  return new GoogleGenerativeAI(key);
}

const SYSTEM_PROMPT = `You are the AI concierge for Smart Resort 360, a luxury 5-star resort.
Answer guest questions using ONLY the context provided below.
Be warm, concise, and helpful. If the answer is not in the context, say you will
connect the guest with the front desk team and do NOT invent information.
Never mention that you are using a "context" or "document" — speak naturally.
Format prices in Indian Rupees (₹).`;

// ── Public API ────────────────────────────────────────────────────────────────
export async function ragAnswer(question, liveRates = null, liveServices = null) {
  await ensureIndex();

  const contexts = retrieve(question);

  // Dynamic live rates context injected from manager revenue settings
  let ratesContext = '';
  if (liveRates) {
    const gardenRate = (liveRates.standard?.amount || 6500).toLocaleString('en-IN');
    const suiteRate  = (liveRates.suite?.amount || 14500).toLocaleString('en-IN');
    const villaRate  = (liveRates.villa?.amount || 28000).toLocaleString('en-IN');

    ratesContext = `\n\n=== CURRENT ACTUAL ROOM RATES (REAL-TIME RESORT REVENUE) ===
The current room rates per night are:
• Garden Room: ₹${gardenRate} per night
• Ocean Suite: ₹${suiteRate} per night
• Private Pool Villa: ₹${villaRate} per night (includes daily breakfast for 2, airport transfers, and butler service)

CRITICAL MARKETING & GUEST-FACING PRICING POLICY:
When a guest asks about room prices, room rates, tariffs, suite costs, or villa charges:
1. ALWAYS quote ONLY the actual current room rates listed above (Garden Room: ₹${gardenRate}, Ocean Suite: ₹${suiteRate}, Private Pool Villa: ₹${villaRate}).
2. FOR MARKETING REASONS: Do NOT show or mention any baseline price comparisons, do NOT mention "surge pricing", "higher demand markup", or internal dynamic rules, and NEVER disclose the price reset time, duration, or countdown timers to the guest.
3. Simply state the actual price as our current rate in a warm, welcoming, professional luxury resort hospitality tone.
4. Welcome the guest and offer to help with reservations or check availability.`;
  }

  // Dynamic live services context injected from live resort services inventory
  let servicesContext = '';
  let highCapacityServices = [];
  let availableAlternatives = [];
  if (liveServices && Array.isArray(liveServices) && liveServices.length > 0) {
    highCapacityServices = liveServices.filter(s => {
      const cap = s.total_capacity || 1;
      const booked = s.booked_slots || 0;
      return (booked / cap) >= 0.95;
    });

    availableAlternatives = liveServices.filter(s => {
      const cap = s.total_capacity || 1;
      const booked = s.booked_slots || 0;
      return (booked / cap) < 0.90;
    });

    const servicesListText = liveServices.map(s => {
      const cap = s.total_capacity || 1;
      const booked = s.booked_slots || 0;
      const pct = Math.round((booked / cap) * 100);
      const remaining = Math.max(0, cap - booked);
      const statusAlert = pct >= 100 ? 'SOLD OUT (100%)' : pct >= 95 ? `NEAR CAPACITY (${pct}%) - ONLY ${remaining} SLOT(S) LEFT` : pct >= 80 ? `HIGH DEMAND (${pct}%)` : `AVAILABLE (${pct}%) - ${remaining} SLOTS OPEN`;
      return `• ${s.name} (${s.category}): ${booked}/${cap} slots booked (${statusAlert}). Timing: ${s.timing}. Price: ₹${s.price}. Location: ${s.location}.`;
    }).join('\n');

    servicesContext = `\n\n=== REAL-TIME RESORT SERVICES & CAPACITY INVENTORY (SYNCHRONIZED LIVE WITH RESORT MANAGER) ===
The following is the EXACT live operational status and capacity of all resort services right now:
${servicesListText}

*** CRITICAL MACHINE LEARNING RECOMMENDATION POLICY (95% OUT-OF-CAPACITY RULE) ***
1. If the guest asks about, requests, or attempts to book ANY service that is at 95% capacity or more (e.g. Serenity Spa at 95%, The Palms Dinner at 95%, or Chef Masterclass at 100%):
   - You MUST immediately alert the guest that this service is currently running at peak/near-full capacity (e.g., "95% booked with only 1 slot left").
   - You MUST proactively suggest and recommend the NEXT BEST available alternative resort services that have open capacity (for example: if Serenity Spa is 95% full, recommend Couples Spa Retreat with 3 slots open, or Sunset Yoga with 16 slots open; if The Palms Dinner is near full, recommend Beachside Bar & Grill or In-Room Dining).
   - Inform the guest that you can send their request directly to the Resort Manager for instant confirmation.
2. If the requested service has ample availability (<95% capacity), confirm its availability warmly, provide the timings and slots, and let the guest know you can dispatch the booking to the manager queue.`;
  }

  const contextText = (contexts.length
    ? contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
    : 'No specific information found in the resort guide.') + ratesContext + servicesContext;

  const genAI = getClient();
  if (!genAI) {
    // ── Smart Fallback Response (handles room rates + 95% service capacity recommendation) ──
    const qLower = question.toLowerCase();

    // Check if inquiring about spa or high capacity service
    const isSpaQuery = /\b(spa|massage|ayurved|facial|therapy|wellness|relaxation|scrub)\b/i.test(qLower);
    const isDiningQuery = /\b(palms|dinner|table|restaurant|buffet|lunch|food|reservation)\b/i.test(qLower);
    const isActivityQuery = /\b(yoga|cabana|pool|watersport|jet-?ski|parasail|diving|scuba|gym|fitness|trainer|kids|chef|cooking)\b/i.test(qLower);

    if (isSpaQuery && liveServices) {
      const spaService = liveServices.find(s => s.id === 'serenity_spa') || { name: 'Serenity Spa', booked_slots: 19, total_capacity: 20, price: 4500 };
      const pct = Math.round((spaService.booked_slots / (spaService.total_capacity || 20)) * 100);
      const remaining = Math.max(0, (spaService.total_capacity || 20) - spaService.booked_slots);

      if (pct >= 95) {
        return {
          answer: `🌿 **Serenity Spa — Real-Time Availability Alert (95% Booked)**\n\nOur **Serenity Spa (Ayurvedic & Swedish Therapies)** is currently running at **${pct}% capacity** today, with only **${remaining} slot remaining** at **06:00 PM** (₹4,500 for the 90-min Relaxation Journey).\n\n✨ **AI Recommended Next Available Services**:\n• **Couple's Retreat & Hydrotherapy Suite**: 3 slots available today (02:00 PM, 04:30 PM, 06:30 PM) — ₹8,000 per couple with private jacuzzi and sparkling wine.\n• **Sunset Yoga & Mindfulness Meditation**: 16 spots open for today's 05:30 PM sunset session on the Oceanfront Deck — **Complimentary** for all resort guests.\n• **Infinity Pool VIP Luxury Cabana**: 1 private cabana available with dedicated butler and fresh fruit service (₹2,500/day).\n\nWould you like me to reserve the final 06:00 PM Serenity Spa slot, or would you prefer me to book one of the alternative wellness experiences? I will transmit your request directly to the Resort Manager!`,
          sources: [
            { id: 'live-services', title: 'Live Services Capacity Monitor' },
            { id: 'ml-recommend', title: 'AI Concierge Capacity Rebalancing Engine' }
          ],
          mode: 'ml-service-recommendation',
          model: 'rule-ml-engine',
          highCapacityAlert: true,
          service: spaService,
          recommendations: [
            { id: 'couples_retreat', name: "Couple's Retreat & Hydrotherapy", slots: '3 slots open', price: '₹8,000' },
            { id: 'sunset_yoga', name: 'Sunset Yoga & Meditation', slots: '16 spots open', price: 'Complimentary' },
            { id: 'pool_cabana', name: 'Infinity Pool Luxury Cabana', slots: '1 cabana open', price: '₹2,500' }
          ]
        };
      }
    }

    if (isDiningQuery && liveServices) {
      const diningService = liveServices.find(s => s.id === 'palms_dining');
      if (diningService && (diningService.booked_slots / diningService.total_capacity) >= 0.95) {
        return {
          answer: `🍽️ **The Palms Restaurant — Real-Time Dining Alert (95% Booked)**\n\n**The Palms Restaurant (Chef's Tasting Dinner)** is currently at **95% capacity** (38 of 40 tables reserved). We only have 2 late tables open at **09:30 PM**.\n\n✨ **AI Recommended Next Available Dining Experiences**:\n• **Beachside Bar & Grill**: 22 beachside tables available with grilled seafood, woodfired pizzas, and live acoustic music (Open until 11:00 PM).\n• **24/7 In-Room Artisan Dining**: Full menu delivered to your suite in 30 minutes with zero wait time.\n\nWould you like me to book the late 09:30 PM table at The Palms or secure a seaside pod at the Beachside Bar? I will send your request straight to the restaurant manager.`,
          sources: [{ id: 'live-services', title: 'Live Services Capacity Monitor' }],
          mode: 'ml-service-recommendation',
          model: 'rule-ml-engine',
          highCapacityAlert: true,
          service: diningService,
          recommendations: [
            { id: 'beachside_grill', name: 'Beachside Bar & Grill', slots: '22 tables open', price: 'À la carte' },
            { id: 'in_room_dining', name: '24/7 In-Room Dining', slots: 'Instant Delivery', price: 'Menu rates' }
          ]
        };
      }
    }

    // Room rates query fallback (clean guest-facing marketing format without reset time)
    if (/\b(price|rate|rates|cost|tariff|how much|per night|room charges)\b/i.test(question) && liveRates) {
      const gRate = (liveRates.standard?.amount || 6500).toLocaleString('en-IN');
      const sRate = (liveRates.suite?.amount || 14500).toLocaleString('en-IN');
      const vRate = (liveRates.villa?.amount || 28000).toLocaleString('en-IN');

      return {
        answer: `Welcome to Smart Resort 360! Here are our current room rates per night:\n\n• **Garden Room:** ₹${gRate} per night (35 sqm, garden/pool view, king or twin bed)\n• **Ocean Suite:** ₹${sRate} per night (65 sqm, direct ocean view, separate living area, butler service & private balcony)\n• **Private Pool Villa:** ₹${vRate} per night (150 sqm, private plunge pool, includes daily breakfast for 2, airport transfers & butler service)\n\nAll rates include complimentary high-speed WiFi and full access to our resort pool and beachfront. Would you like me to assist with reserving a room or connect you with the Front Desk?`,
        sources: [
          { id: 'current-rates', title: 'Current Resort Room Rates' }
        ],
        mode: 'current-rates',
        model: null,
      };
    }

    return {
      answer: contexts.length
        ? contexts[0].slice(0, 600) + (contexts[0].length > 600 ? '…' : '')
        : 'I could not find a verified answer in the resort guide. Please contact the front desk at Dial 0 or use the Special Requests feature.',
      sources: contexts.slice(0, 2).map((c, i) => ({ id: `chunk-${i}`, title: c.slice(0, 60) + '…' })),
      mode: 'retrieval-only',
      model: null,
    };
  }

  const candidateModels = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
  ];

  let answerText = null;
  let usedModel = 'gemini-1.5-flash';
  const prompt = `${SYSTEM_PROMPT}\n\nContext from the resort guide, live pricing, and real-time services capacity:\n${contextText}\n\nGuest question: ${question}`;

  for (const mName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: mName });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500));
      const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
      answerText = result.response.text();
      usedModel = mName;
      if (answerText) break;
    } catch (e) {
      console.warn(`[RAG] Model ${mName} failed:`, e.message?.slice(0, 100));
    }
  }

  if (!answerText) {
    if (/\b(spa|massage|wellness|treatment)\b/i.test(question) && liveServices) {
      answerText = `🌿 **Serenity Spa Alert**: Our Serenity Spa is currently at 95% capacity with only 1 slot remaining at 06:00 PM today.\n\nWe recommend our **Couple's Retreat & Hydrotherapy Suite** (3 slots available) or complimentary **Sunset Yoga at 05:30 PM**! Would you like me to dispatch this request to the resort manager?`;
    } else if (/\b(price|rate|rates|cost|tariff|how much|per night|room charges)\b/i.test(question) && liveRates) {
      const gRate = (liveRates.standard?.amount || 6500).toLocaleString('en-IN');
      const sRate = (liveRates.suite?.amount || 14500).toLocaleString('en-IN');
      const vRate = (liveRates.villa?.amount || 28000).toLocaleString('en-IN');
      answerText = `Here are our current live room rates per night:\n• **Garden Room:** ₹${gRate} per night\n• **Ocean Suite:** ₹${sRate} per night\n• **Private Pool Villa:** ₹${vRate} per night.\n\nAll rates are dynamically synchronized with resort management.`;
    } else {
      answerText = contexts.length ? contexts[0].slice(0, 600) : 'I am currently unable to fetch the answer. Please contact the front desk.';
    }
  }

  const isHighCapAlert = highCapacityServices.some(s => 
    question.toLowerCase().includes(s.name.toLowerCase().split(' ')[0].toLowerCase()) ||
    (s.id === 'serenity_spa' && /\b(spa|massage|wellness|treatment)\b/i.test(question)) ||
    (s.id === 'palms_dining' && /\b(palms|dinner|table|restaurant)\b/i.test(question))
  );

  const alternativeRecs = isHighCapAlert
    ? availableAlternatives.slice(0, 3).map(a => ({
        id: a.id,
        name: a.name,
        slots: `${Math.max(0, a.total_capacity - a.booked_slots)} slots open`,
        price: a.price === 0 ? 'Complimentary' : `₹${a.price.toLocaleString('en-IN')}`
      }))
    : undefined;

  return {
    answer: answerText,
    sources: [
      ...(liveServices ? [{ id: 'realtime-services', title: 'Live Services & Capacity Engine' }] : []),
      ...(liveRates && /\b(price|rate|cost|tariff|night)\b/i.test(question) ? [{ id: 'dynamic-pricing', title: 'Live Dynamic Revenue Management' }] : []),
      ...contexts.slice(0, 2).map((c, i) => ({ id: `chunk-${i}`, title: c.slice(0, 60) + '…' }))
    ],
    mode: 'rag-llm',
    model: usedModel,
    highCapacityAlert: isHighCapAlert,
    recommendations: alternativeRecs,
  };
}


