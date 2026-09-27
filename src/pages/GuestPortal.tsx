
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Bot, Check, Clock, Coffee, Send, Sparkles, Star, Utensils, Waves, Plus, Minus, ClipboardList, Sun, MapPin, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroImage } from '../components/Brand';
import { api, money, type User, type MenuItem, type ServiceRequest, type Feedback, type ResortServiceRecord, type ServicesOverview, type BookingRecord } from '../services/api';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <motion.div
      className="page-heading"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </motion.div>
  );
}

export function RequestList({ requests, manager = false, onStatus }: { requests: ServiceRequest[]; manager?: boolean; onStatus?: (id: string, status: string) => void }) {
  return requests.length ? (
    <div className="request-list">
      {requests.map((request, index) => (
        <motion.article
          key={request.id}
          className="request-row"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
        >
          <span className={`request-icon ${request.category === 'Dining' ? 'peach' : ''}`}>
            {request.category === 'Dining' ? <Utensils size={20} /> : <ClipboardList size={20} />}
          </span>
          <div className="request-info">
            <div className="request-title">
              <b>{request.title}</b>
              <span className={`status status-${request.status.toLowerCase().replace(' ', '-')}`}>{request.status}</span>
            </div>
            <p>{request.detail || request.category}</p>
            <small>
              {manager && `${request.guest_name} - Room ${request.room} - `}
              {new Date(request.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} - #{request.id.slice(0, 8)}
              {request.total > 0 && ` - ${money(request.total)}`}
            </small>
          </div>
          {manager && (
            <select
              className="request-status-select"
              aria-label={`Status for ${request.title} ${request.id.slice(0, 8)}`}
              value={request.status}
              onChange={e => onStatus?.(request.id, e.target.value)}
            >
              <option>New</option>
              <option>In progress</option>
              <option>Completed</option>
            </select>
          )}
        </motion.article>
      ))}
    </div>
  ) : (
    <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <ClipboardList size={30} />
      <h3>Nothing here just yet</h3>
      <p>{manager ? 'Guest requests will appear here as they arrive.' : 'Your dining orders and service requests will appear here.'}</p>
    </motion.div>
  );
}

type Chat = {
  role: 'assistant' | 'user';
  text: string;
  sources?: { id: string; title: string }[];
  highCapacityAlert?: boolean;
  bookingCreated?: {
    id: string;
    service_id: string;
    service_name: string;
    slot_time: string;
    price: number;
    status: string;
  };
  recommendations?: { id: string; name: string; slots: string; price: string }[];
  nugen?: {
    used?: boolean;
    model?: string;
    intent?: string;
    confidence?: number;
    category?: string;
  };
};


export default function GuestPortal({ user, page, navigate }: { user: User; page: string; navigate: (page: string) => void }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [services, setServices] = useState<ResortServiceRecord[]>([]);
  const [stayBooking, setStayBooking] = useState<BookingRecord | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [diningTab, setDiningTab] = useState('All');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [category, setCategory] = useState('Housekeeping');
  const [detail, setDetail] = useState('');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<Chat[]>([{
    role: 'assistant',
    text: `Welcome, ${user.name.split(' ')[0]}! I'm your resort concierge. Ask me about spa bookings, wellness, activities, dining or anything for your stay.`
  }]);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const [r, f, m, s, b] = await Promise.all([
      api<ServiceRequest[]>('/requests'),
      api<Feedback[]>('/feedback'),
      api<MenuItem[]>('/menu'),
      api<ServicesOverview>('/services').catch(() => null),
      api<{ booking: BookingRecord | null }>('/bookings/my-stay').catch(() => null),
    ]);
    setRequests(r);
    setFeedback(f);
    setMenu(m);
    if (s?.services) setServices(s.services);
    if (b?.booking) setStayBooking(b.booking);
  };

  useEffect(() => {
    let active = true;
    refresh()
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    const interval = window.setInterval(() => {
      if (page === 'requests' || page === 'stay') refresh().catch(e => { if (active) setError(e.message); });
    }, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [page]);

  useEffect(() => {
    if (chat.length > 1) chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chat]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const order = () => perform(async () => {
    await api('/requests', 'POST', {
      category: 'Dining',
      title: 'In-room dining order',
      detail,
      items: Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => ({ id, quantity })),
    });
    setCart({}); setDetail('');
    setSuccess('Order sent to dining team & synced with Manager Workspace. Track progress in My requests.');
    await refresh();
  });

  const service = (e: FormEvent) => {
    e.preventDefault();
    void perform(async () => {
      await api('/requests', 'POST', { category, title: `${category} request`, detail });
      setDetail('');
      setSuccess('Request sent. The resort team will confirm the details with you.');
      await refresh();
    });
  };

  const sendFeedback = (e: FormEvent) => {
    e.preventDefault();
    if (!rating) { setError('Please choose a star rating.'); return; }
    void perform(async () => {
      await api('/feedback', 'POST', { rating, comment: detail });
      setDetail(''); setRating(0);
      setSuccess('Thank you. Your feedback has been shared with the resort manager.');
      await refresh();
    });
  };

  const sendChat = async (text: string, bookServiceId?: string, slotTime?: string) => {
    if (!text.trim() || busy) return;
    setMessage('');
    setChat(old => [...old, { role: 'user', text }]);
    await perform(async () => {
      const result = await api<{
        answer: string;
        sources: Chat['sources'];
        highCapacityAlert?: boolean;
        bookingCreated?: Chat['bookingCreated'];
        recommendations?: Chat['recommendations'];
        nugen?: Chat['nugen'];
      }>('/concierge/chat', 'POST', {
        message: text,
        bookService: bookServiceId,
        slotTime: slotTime
      });
      setChat(old => [...old, {
        role: 'assistant',
        text: result.answer,
        sources: result.sources,
        highCapacityAlert: result.highCapacityAlert,
        bookingCreated: result.bookingCreated,
        recommendations: result.recommendations,
        nugen: result.nugen
      }]);

      if (result.bookingCreated) {
        setSuccess(`Booking confirmed! ${result.bookingCreated.service_name} sent directly to Manager end.`);
        await refresh();
      }
    });
  };

  const bookResortService = async (serviceId: string, slotTime?: string) => {
    await perform(async () => {
      const res = await api<{ ok: boolean; message: string; service: ResortServiceRecord }>('/services/book', 'POST', {
        service_id: serviceId,
        slot_time: slotTime,
        notes: `Booked directly via Guest Portal for Room ${user.room}`
      });
      setSuccess(`${res.message} Dispatched directly to Resort Manager queue.`);
      await refresh();
    });
  };

  const total = menu.reduce((sum, item) => sum + item.price * (cart[item.id] || 0), 0);

  const alerts = (
    <>
      <AnimatePresence>
        {error && (
          <motion.div className="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {error}
            <button className="text-button" onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Retry loading</button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {success && (
          <motion.div className="success" role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Check size={18} />
            <span>{success}</span>
            {page === 'dining' && (
              <button
                type="button"
                className="text-button"
                onClick={() => navigate('requests')}
                style={{ marginLeft: '10px', fontWeight: 700, textDecoration: 'underline' }}
              >
                View in My Requests &rarr;
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // ── Stay page ───────────────────────────────────────────────
  if (page === 'stay') return (
    <>
      <PageHeading eyebrow="MAKE YOURSELF AT HOME" title={`Welcome back, ${user.name.split(' ')[0]}.`} subtitle="Less planning. More moments worth remembering." />
      {alerts}

      <motion.section
        className="stay-hero"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <HeroImage variant="pool" />
        <div>
          <span className="outline-pill">YOUR LITTLE CORNER OF PARADISE</span>
          <h2>Unwind. We'll take<br />care of the details.</h2>
          <p>Room {user.room} - {stayBooking?.room_type || 'Deluxe Ocean View'} · {stayBooking ? `${stayBooking.check_in} to ${stayBooking.check_out} (${stayBooking.nights} nights)` : 'The Palms Luxury Stay'}</p>
          <motion.button
            className="light-button"
            onClick={() => navigate('concierge')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            Meet your concierge <ArrowRight size={17} />
          </motion.button>
        </div>
        <span className="stay-chip"><Waves size={18} /> THE PALMS RESORT</span>
      </motion.section>

      <div className="section-title">
        <h2>How can we make your day?</h2>
      </div>

      <div className="quick-grid">
        {[
          { title: 'Something delicious', text: 'Fresh flavors, delivered to you', icon: Utensils, page: 'dining', color: 'peach' },
          { title: 'A little extra comfort', text: 'Housekeeping, spa & more', icon: Sparkles, page: 'services', color: 'sage' },
          { title: 'Ask your concierge', text: 'Your guide to a better stay', icon: Bot, page: 'concierge', color: 'lavender' },
        ].map((item, i) => (
          <motion.button
            key={item.page}
            className="quick-card"
            onClick={() => navigate(item.page)}
            custom={i}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            whileHover={{ y: -6, boxShadow: '0 12px 40px rgba(0,0,0,0.1)' }}
          >
            <span className={`feature-icon ${item.color}`}><item.icon size={23} /></span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <ArrowRight className="card-arrow" size={18} />
          </motion.button>
        ))}
      </div>

      <div className="two-columns">
        <motion.section className="panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="section-title">
            <h2>Your requests</h2>
            <button className="text-button" onClick={() => navigate('requests')}>View all <ArrowRight size={15} /></button>
          </div>
          {loading ? <p className="loading-copy">Loading requests...</p> : <RequestList requests={requests.slice(0, 3)} />}
        </motion.section>

        <motion.section className="panel today-panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <span className="eyebrow">A MOMENT FOR YOU</span>
          <h2>Slow down.<br />Soak it all in.</h2>
          <div className="daily-item">
            <Coffee size={20} />
            <div><b>Breakfast at The Palms</b><p>7:00-10:30 - Restaurant</p></div>
          </div>
          <div className="daily-item">
            <Sun size={20} />
            <div><b>Sunrise yoga</b><p>7:00 - Beachside deck</p></div>
          </div>
          <div className="daily-item">
            <Waves size={20} />
            <div><b>Sunset bonfire</b><p>18:30 - Private beach</p></div>
          </div>
          <small>Demo schedule - The Palms Resort</small>
        </motion.section>
      </div>
    </>
  );

  // ── Concierge page ──────────────────────────────────────────
  if (page === 'concierge') return (
    <>
      <PageHeading eyebrow="YOUR PERSONAL RESORT GUIDE" title="AI Concierge & Live Experience Assistant" subtitle="Real-time assistance, proactive ML service recommendations, and instant booking sent directly to the Resort Manager." />

      <div className="concierge-layout">
        <motion.section className="panel chat-panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="chat-header">
            <span className="feature-icon sage"><Bot size={24} /></span>
            <div>
              <h2>AI Concierge</h2>
              <p><span className="status-dot" /> Live Services Capacity & ML Rebalancing Connected</p>
            </div>
            <span className="pill">RAG + ML Engine</span>
          </div>

          <div className="chat-messages" aria-live="polite">
            {chat.map((entry, i) => (
              <motion.div
                className={`chat-bubble ${entry.role}`}
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <small style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span>{entry.role === 'assistant' ? 'AI CONCIERGE' : 'YOU'}</span>
                  {entry.nugen?.used && (
                    <span style={{ color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Sparkles size={11} color="#059669" /> AI Intelligence: Nugen Hospitality Model{entry.nugen.confidence ? ` (${Math.round(entry.nugen.confidence)}%)` : ''}
                    </span>
                  )}
                </small>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>

                  {entry.text}
                </div>

                {/* AI Concierge Proactive Recommendation Chips */}
                {entry.recommendations && entry.recommendations.length > 0 && (
                  <div style={{ marginTop: '12px', background: '#faf5ff', padding: '12px', borderRadius: '12px', border: '1px solid #e9d5ff' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <Sparkles size={14} color="#a855f7" /> AI Suggested Next Available Resort Services:
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {entry.recommendations.map(rec => (
                        <div
                          key={rec.id}
                          style={{
                            background: '#fff',
                            border: '1px solid #d8b4fe',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <b style={{ display: 'block', fontSize: '0.84rem', color: '#1e293b' }}>{rec.name}</b>
                            <small style={{ color: '#7c3aed' }}>{rec.slots} • {rec.price}</small>
                          </div>
                          <motion.button
                            type="button"
                            className="secondary"
                            style={{ padding: '4px 10px', fontSize: '0.76rem', borderColor: '#a855f7', color: '#7e22ce' }}
                            onClick={() => sendChat(`Please reserve ${rec.name} for Room ${user.room}`, rec.id)}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                          >
                            Book &rarr;
                          </motion.button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dispatched to Manager Confirmation Badge */}
                {entry.bookingCreated && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Check size={18} color="#059669" />
                    <div style={{ flex: 1, fontSize: '0.82rem', color: '#065f46' }}>
                      <b>Dispatched to Manager Queue (#REQ-{entry.bookingCreated.id.slice(0, 6).toUpperCase()})</b>
                      <p style={{ margin: 0 }}>Room {user.room} • {entry.bookingCreated.service_name} • {entry.bookingCreated.slot_time}</p>
                    </div>
                    <button type="button" className="text-button" onClick={() => navigate('requests')} style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700 }}>
                      View requests &rarr;
                    </button>
                  </div>
                )}

                {!!entry.sources?.length && (
                  <div className="sources" style={{ marginTop: '8px' }}>
                    {entry.sources.map(source => <span key={source.id}>Source: {source.title}</span>)}
                  </div>
                )}
              </motion.div>
            ))}
            {busy && <p className="muted" style={{ padding: '8px' }}>Checking real-time services capacity...</p>}
            <div ref={chatEnd} />
          </div>

          {alerts}

          <form className="chat-compose" onSubmit={e => { e.preventDefault(); void sendChat(message); }}>
            <input
              aria-label="Message your concierge"
              placeholder="Ask about spa availability, dining, or request a booking..."
              maxLength={2000}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <motion.button
              className="primary"
              aria-label="Send message"
              disabled={busy || !message.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Send size={18} />
            </motion.button>
          </form>
          <p className="chat-disclaimer">Real-time availability synced with resort manager queue. Bookings instantly notify the front desk.</p>
        </motion.section>

        <aside className="concierge-side">
          <span className="eyebrow">POPULAR QUERIES & BOOKINGS</span>
          <h2>Leave the details<br />to us.</h2>
          {[
            'What are the current room rates and pricing?',
            'Is the Serenity Spa available today?',
            'Book Serenity Spa at 06:00 PM',
            "Tell me about Couple's Retreat",
            'What dinner options are available tonight?',
            'Sunset yoga and meditation deck',
            'Can I request late checkout?'
          ].map((text, i) => (
            <motion.button
              key={text}
              disabled={busy}
              onClick={() => void sendChat(text)}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
              whileHover={{ x: 4 }}
            >
              {text}
              <ArrowRight size={16} />
            </motion.button>
          ))}
          <div className="help-card">
            <Sparkles size={22} />
            <h3>Direct Service Catalog</h3>
            <p>Browse live working slots for all resort services and spa treatments.</p>
            <button className="text-button" onClick={() => navigate('services')}>View Resort Services &rarr;</button>
          </div>
        </aside>
      </div>
    </>
  );

  // ── Dining page ─────────────────────────────────────────────
  if (page === 'dining') {
    const categories = ['All', 'South Indian', 'Italian', 'Mains', 'Healthy', 'Seafood', 'Beverages & Desserts'];
    const filteredMenu = menu.filter(item => {
      if (diningTab === 'All') return true;
      if (diningTab === 'South Indian') return item.category === 'South Indian';
      if (diningTab === 'Italian') return item.category === 'Italian';
      if (diningTab === 'Mains') return item.category === 'Mains';
      if (diningTab === 'Healthy') return item.category === 'Healthy';
      if (diningTab === 'Seafood') return item.category === 'Seafood';
      if (diningTab === 'Beverages & Desserts') return item.category === 'Beverages' || item.category === 'Desserts';
      return true;
    });

    return (
      <>
        <PageHeading
          eyebrow="FRESH FLAVORS, ZERO EFFORT"
          title="Good food. Your own space."
          subtitle={`In-room dining for Room ${user.room} - Artisan Resort Selection (${menu.length} Dishes) - 24/7 Service`}
        />
        {alerts}

        <div className="dining-tabs-wrap">
          <div className="dining-filter-tabs">
            {categories.map(tab => {
              const count = tab === 'All'
                ? menu.length
                : menu.filter(m => {
                    if (tab === 'Beverages & Desserts') return m.category === 'Beverages' || m.category === 'Desserts';
                    return m.category === tab;
                  }).length;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`dining-tab-btn ${diningTab === tab ? 'active' : ''}`}
                  onClick={() => setDiningTab(tab)}
                >
                  {tab}
                  <span className="tab-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="dining-layout">
          <div className="food-grid">
            {loading ? <p className="loading-copy">Loading menu...</p> : filteredMenu.map((item, i) => (
              <motion.article
                className="food-card"
                key={item.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                whileHover={{ y: -6, boxShadow: '0 16px 36px rgba(0,0,0,0.1)' }}
              >
                <div className="food-art real-food-art">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="food-photo-img"
                      loading="lazy"
                    />
                  ) : (
                    <span className="fallback-food-symbol">{item.symbol}</span>
                  )}
                  <div className="food-art-overlay" />
                  {item.badge && <span className="food-badge-pill">{item.badge}</span>}
                  <span className="food-kind-tag">{item.kind}</span>
                </div>
                <div className="food-info">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div>
                    <b>{money(item.price)}</b>
                    <span className="quantity">
                      <button aria-label={`Remove ${item.name}`} disabled={!cart[item.id]} onClick={() => setCart(old => ({ ...old, [item.id]: Math.max(0, (old[item.id] || 0) - 1) }))}>
                        <Minus size={15} />
                      </button>
                      <span>{cart[item.id] || 0}</span>
                      <button aria-label={`Add ${item.name}`} disabled={(cart[item.id] || 0) >= 10} onClick={() => setCart(old => ({ ...old, [item.id]: (old[item.id] || 0) + 1 }))}>
                        <Plus size={15} />
                      </button>
                    </span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          <motion.section
            className="panel order-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2>Your order</h2>
            <p className="muted">Delivered to Room {user.room}</p>
            {total ? (
              <div className="order-items-scroll">
                {menu.filter(item => cart[item.id]).map(item => (
                  <div className="order-line" key={item.id}>
                    <span>{cart[item.id]} × {item.name}</span>
                    <b>{money(item.price * cart[item.id])}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="order-empty">A little something delicious?<br />Add a dish to get started.</p>
            )}
            <label htmlFor="order-note">Dietary needs or special chef note</label>
            <textarea
              id="order-note"
              placeholder="E.g. Extra spicy, no onions, gluten-free prep, or delivery time..."
              maxLength={1000}
              value={detail}
              onChange={e => setDetail(e.target.value)}
            />
            <div className="order-total">
              <span>Estimated total</span>
              <b>{money(total)}</b>
            </div>
            <div className="sync-notice-box">
              <span className="sync-pulse-dot" />
              <span>Directly synchronized with Manager Workspace & Kitchen Service Queue</span>
            </div>
            <motion.button
              className="primary"
              disabled={!total || busy}
              onClick={order}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ width: '100%', marginTop: '14px' }}
            >
              {busy ? 'Placing order...' : 'Place order'}
              <ArrowRight size={17} />
            </motion.button>
          </motion.section>
        </div>
      </>
    );
  }

  // ── Services page ───────────────────────────────────────────
  if (page === 'services') return (
    <>
      <PageHeading eyebrow="THE LITTLE THINGS MATTER" title="Resort Services & Amenities" subtitle="Book spa treatments, wellness sessions, and activities in real time — or submit custom requests directly to resort management." />
      {alerts}

      {/* Real-time Services Catalog */}
      <motion.section className="panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '24px' }}>
        <div className="section-title">
          <div>
            <h2>Featured Resort Services & Working Slots</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
              Live availability synced directly with the Resort Management Workspace
            </p>
          </div>
          <span className="pill" style={{ color: '#059669', borderColor: '#a7f3d0' }}>
            ● Real-Time Sync
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', marginTop: '12px' }}>
          {services.map(svc => {
            const isPeak = svc.occupancyRate >= 95;
            const isFull = svc.available_slots === 0;

            return (
              <motion.article
                key={svc.id}
                style={{
                  background: '#fff',
                  border: isPeak ? '2px solid #f43f5e' : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
                whileHover={{ y: -4, boxShadow: '0 10px 24px rgba(0,0,0,0.08)' }}
              >
                <div style={{ position: 'relative', height: '140px' }}>
                  <img src={svc.image} alt={svc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  <span style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,255,255,0.9)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {svc.category}
                  </span>
                  <span style={{ position: 'absolute', top: '10px', right: '10px', background: isPeak ? '#e11d48' : '#059669', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {svc.status}
                  </span>
                </div>

                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>{svc.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{svc.tagline}</p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                    <span><b>{svc.price === 0 ? 'Complimentary' : money(svc.price)}</b> / {svc.unit}</span>
                    <span style={{ color: isPeak ? '#e11d48' : '#059669', fontWeight: 600 }}>
                      {svc.available_slots} slots left
                    </span>
                  </div>

                  <motion.button
                    className="primary"
                    disabled={isFull || busy}
                    style={{ marginTop: 'auto', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.82rem' }}
                    onClick={() => bookResortService(svc.id, svc.timing)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isFull ? 'Sold Out' : 'Book Slot (Direct to Manager)'} &rarr;
                  </motion.button>
                </div>
              </motion.article>
            );
          })}
        </div>
      </motion.section>

      <div className="two-columns">
        <motion.form className="panel service-form" onSubmit={service} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <h2>Custom Resort Request</h2>
          <label htmlFor="service-category">How can we help?</label>
          <select id="service-category" value={category} onChange={e => setCategory(e.target.value)}>
            {['Housekeeping', 'Maintenance', 'Spa', 'Special request'].map(value => <option key={value}>{value}</option>)}
          </select>
          <label htmlFor="request-detail">A few details</label>
          <textarea id="request-detail" required maxLength={2000} rows={5} placeholder={category === 'Housekeeping' ? 'For example, two fresh towels and an extra pillow...' : 'Tell us what you need and your preferred time...'} value={detail} onChange={e => setDetail(e.target.value)} />
          <p className="muted">For {user.name} - Room {user.room}</p>
          <motion.button className="primary" disabled={busy || !detail.trim()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            {busy ? 'Sending...' : 'Send custom request'}<ArrowRight size={17} />
          </motion.button>
        </motion.form>

        <motion.div className="service-aside" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <span className="feature-icon sage"><Sparkles size={25} /></span>
          <h2>A more comfortable stay,<br />one detail at a time.</h2>
          <p>From fresh linens to a spa sanctuary booking, we're happy to take care of every detail.</p>
          <div className="daily-item">
            <Clock size={21} />
            <div>
              <b>Direct Manager Queue Sync</b>
              <p>Every booking and request is dispatched in real time to the Resort Manager Workspace.</p>
            </div>
          </div>
          <button className="text-button" onClick={() => navigate('requests')}>View my requests <ArrowRight size={16} /></button>
          <p className="fine-print">For urgent safety issues, please contact the front desk directly.</p>
        </motion.div>
      </div>
    </>
  );

  // ── Feedback page ───────────────────────────────────────────
  if (page === 'feedback') return (
    <>
      <PageHeading eyebrow="YOUR EXPERIENCE SHAPES OURS" title="How was your stay?" subtitle="The best improvements begin with your honest feedback." />
      {alerts}
      <div className="two-columns">
        <motion.form className="panel feedback-form" onSubmit={sendFeedback} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <h2>Every detail helps.</h2>
          <p className="muted">How would you rate your experience?</p>
          <div className="stars" role="group" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(value => (
              <motion.button
                key={value}
                type="button"
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
                whileHover={{ scale: 1.25 }}
                whileTap={{ scale: 0.9 }}
              >
                <Star size={32} fill={value <= rating ? 'currentColor' : 'none'} />
              </motion.button>
            ))}
          </div>
          <label htmlFor="feedback-comment">What stood out? What could be better?</label>
          <textarea id="feedback-comment" rows={6} required maxLength={3000} value={detail} onChange={e => setDetail(e.target.value)} placeholder="We'd love to hear about your experience..." />
          <motion.button className="primary" disabled={busy || !detail.trim()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            {busy ? 'Sharing...' : 'Share feedback'}<ArrowRight size={17} />
          </motion.button>
        </motion.form>

        <motion.section className="panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <div className="section-title">
            <h2>Your previous feedback</h2>
            <span className="pill">{feedback.length} Submitted</span>
          </div>
          {feedback.length ? feedback.map((item, i) => {
            const rawSentiment = item.analysis?.sentiment || (item.rating >= 4 ? 'positive' : item.rating <= 2 ? 'negative' : 'neutral');
            const sentiment = rawSentiment === 'positive' ? 'positive' : rawSentiment === 'negative' ? 'negative' : 'neutral';
            const sentimentLabel = sentiment === 'positive' ? 'Positive Feedback' : sentiment === 'negative' ? 'Negative Feedback' : 'Neutral Feedback';

            return (
              <motion.article
                className={`feedback-item-card ${sentiment}`}
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="feedback-card-header">
                  <div className="stars-visual">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        size={15}
                        fill={s <= item.rating ? '#f59e0b' : 'none'}
                        stroke={s <= item.rating ? '#f59e0b' : '#cbd5e1'}
                      />
                    ))}
                    <span className="rating-score-num">{item.rating}/5</span>
                  </div>
                  <span className={`sentiment-badge-pill ${sentiment}`}>
                    {sentimentLabel}
                  </span>
                </div>

                <p className="feedback-body-comment">"{item.comment}"</p>

                {item.analysis?.aspects && item.analysis.aspects.length > 0 && (
                  <div className="feedback-aspects-list">
                    {item.analysis.aspects.map((asp: string) => (
                      <span key={asp} className="aspect-badge-tag">{asp}</span>
                    ))}
                  </div>
                )}

                <div className="feedback-card-footer">
                  <small>{new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} &bull; Synced with Management Workspace</small>
                </div>
              </motion.article>
            );
          }) : (
            <div className="empty-state">
              <Star size={30} />
              <p>Your feedback will appear here once shared.</p>
            </div>
          )}
        </motion.section>
      </div>
    </>
  );

  // ── Requests page (default) ─────────────────────────────────
  return (
    <>
      <PageHeading eyebrow="WE'RE ON IT" title="Your requests, all in one place." subtitle="Follow your orders and requests from the first hello to the final detail." />
      {alerts}
      <motion.section className="panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <div className="section-title">
          <h2>Request history <span className="count">{requests.length}</span></h2>
          <button className="text-button" onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Refresh</button>
        </div>
        {loading ? <p className="loading-copy">Loading requests...</p> : <RequestList requests={requests} />}
      </motion.section>
    </>
  );
}
