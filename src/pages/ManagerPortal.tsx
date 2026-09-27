import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, ClipboardList, MessageSquare, TrendingUp, BedDouble,
  RefreshCw, Search, Sparkles, Check, AlertTriangle, Star, Heart, Clock, Calendar,
  RotateCcw, Zap, History, FileText, CheckCircle2, Eye, X, ChevronRight, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api, money, type User, type ServiceRequest, type Feedback, type Rate, type PricingTimelineEvent } from '../services/api';
import { PageHeading, RequestList } from './GuestPortal';

type Room = { id: string; name: string; base: number; recommended: number; change: number };
type AnalyticsData = {
  occupancyRate: number;
  occupiedCount: number;
  totalRooms: number;
  dailyRevenue: string;
  dailyRevenueRaw: number;
  trend: { day: string; occupancy: number; occupiedRooms: number; revenueLakhs: number }[];
};

const sampleDemand = [
  { day: 'Mon', occupancy: 65 }, { day: 'Tue', occupancy: 72 }, { day: 'Wed', occupancy: 69 },
  { day: 'Thu', occupancy: 81 }, { day: 'Fri', occupancy: 86 }, { day: 'Sat', occupancy: 94 }, { day: 'Sun', occupancy: 87 },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function ManagerPortal({ user, page, navigate }: { user: User; page: string; navigate: (page: string) => void }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [occupancy, setOccupancy] = useState(86);
  const [season, setSeason] = useState(1.1);
  const [scenario, setScenario] = useState({ occupancy: 86, season: 1.1 });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [isCustomCalendar, setIsCustomCalendar] = useState<boolean>(false);
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    return d.toISOString().slice(0, 16);
  });
  const [timelineLogs, setTimelineLogs] = useState<PricingTimelineEvent[]>([]);
  const [showHotelInfoModal, setShowHotelInfoModal] = useState<boolean>(false);
  const [hotelInfoData, setHotelInfoData] = useState<any>(null);
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'forecast'>('week');
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    occupancyRate: 86,
    occupiedCount: 129,
    totalRooms: 150,
    dailyRevenue: 'Rs.23.9L',
    dailyRevenueRaw: 2386500,
    trend: sampleDemand.map(d => ({ ...d, occupiedRooms: Math.round(d.occupancy * 1.5), revenueLakhs: Number((d.occupancy * 0.28).toFixed(1)) })),
  });

  const refresh = async () => {
    const [r, f, a] = await Promise.all([
      api<ServiceRequest[]>('/requests'),
      api<Feedback[]>('/feedback'),
      api<AnalyticsData>('/analytics/occupancy').catch(() => null),
    ]);
    setRequests(r);
    setFeedback(f);
    if (a) setAnalytics(a);
  };

  useEffect(() => {
    refresh().catch(e => setError(e.message)).finally(() => setLoading(false));
    const interval = setInterval(() => {
      refresh().catch(e => setError(e.message));
      if (page === 'pricing') {
        Promise.all([
          api<Rate[]>('/pricing'),
          api<PricingTimelineEvent[]>('/pricing/timeline').catch(() => [])
        ]).then(([saved, logs]) => {
          setRates(saved);
          setTimelineLogs(logs);
        }).catch(() => {});
      }
    }, 5000);

    if (page === 'pricing') {
      Promise.all([
        api<{ rooms: Room[] }>('/pricing/scenario', 'POST', { occupancy: 86, season: 1.1 }),
        api<Rate[]>('/pricing'),
        api<PricingTimelineEvent[]>('/pricing/timeline').catch(() => [])
      ]).then(([result, saved, logs]) => {
        setRooms(result.rooms);
        setRates(saved);
        setTimelineLogs(logs);
      }).catch(e => setError(e.message));
    }
    return () => clearInterval(interval);
  }, [page]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const updateStatus = (id: string, status: string) => {
    void perform(async () => {
      await api(`/requests/${id}`, 'PATCH', { status });
      await refresh();
      setSuccess('Request updated. The guest can see the new status.');
    });
  };

  const calculate = () => perform(async () => {
    const result = await api<{ rooms: Room[] }>('/pricing/scenario', 'POST', { occupancy, season });
    setRooms(result.rooms);
    setScenario({ occupancy, season });
    setSuccess('Scenario updated. Review recommendations and choose dynamic timeline before applying.');
  });

  const apply = (id: string) => perform(async () => {
    let finalDuration = durationHours;
    let expiresAtIso: string | undefined = undefined;

    if (isCustomCalendar && customDate) {
      const targetTime = new Date(customDate).getTime();
      if (isNaN(targetTime) || targetTime <= Date.now()) {
        throw new Error('Please select a future date and time for dynamic pricing expiration.');
      }
      expiresAtIso = new Date(customDate).toISOString();
      finalDuration = Math.max(1, Math.round((targetTime - Date.now()) / (1000 * 3600)));
    } else {
      expiresAtIso = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
    }

    const res = await api<{ ok: boolean; rate: number; duration_hours: number; expires_at: string; type: string }>('/pricing/apply', 'POST', {
      id,
      ...scenario,
      duration_hours: finalDuration,
      expires_at: expiresAtIso
    });

    const [savedRates, logs] = await Promise.all([
      api<Rate[]>('/pricing'),
      api<PricingTimelineEvent[]>('/pricing/timeline').catch(() => [])
    ]);
    setRates(savedRates);
    setTimelineLogs(logs);
    setSuccess(`Dynamic rate ${money(res.rate)} activated for ${res.duration_hours}h! Auto-resets back to base price on ${new Date(res.expires_at).toLocaleString('en-IN')}. Synced with hotel_info.json & AI Concierge in real time.`);
  });

  const resetRate = (id: string) => perform(async () => {
    await api('/pricing/reset', 'POST', { id });
    const [savedRates, logs] = await Promise.all([
      api<Rate[]>('/pricing'),
      api<PricingTimelineEvent[]>('/pricing/timeline').catch(() => [])
    ]);
    setRates(savedRates);
    setTimelineLogs(logs);
    setSuccess(id === 'all' ? 'All room rates reset back to original base prices! Synced with hotel_info and AI Concierge.' : 'Room rate reset back to original base price! Synced with hotel_info and AI Concierge.');
  });

  const viewHotelInfo = async () => {
    try {
      setBusy(true);
      const data = await api<any>('/hotel-info');
      setHotelInfoData(data);
      setShowHotelInfoModal(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = requests.filter(item => item.status !== 'Completed').length;
  const newCount = requests.filter(item => item.status === 'New').length;
  const needsAttention = feedback.filter(item => item.analysis.sentiment === 'negative' || item.analysis.sentiment === 'mixed');
  const average = feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : '---';

  const alerts = (
    <>
      <AnimatePresence>
        {error && (
          <motion.div className="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {error}
            <button className="text-button" onClick={() => void perform(refresh)}>Retry loading</button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {success && (
          <motion.div className="success" role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Check size={18} />{success}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // ── Requests page ───────────────────────────────────────────
  if (page === 'requests') return (
    <>
      <PageHeading eyebrow="SERVICE, WITH FOLLOW-THROUGH" title="Every request deserves a response." subtitle="A shared queue for the little details that make a great stay." />
      {alerts}
      <motion.section className="panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <div className="request-toolbar">
          <div className="tabs">
            {['All', 'New', 'In progress', 'Completed'].map(value => (
              <motion.button
                key={value}
                className={filter === value ? 'selected' : ''}
                onClick={() => setFilter(value)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {value}
              </motion.button>
            ))}
          </div>
          <div className="search-field">
            <Search size={17} />
            <input aria-label="Search requests" placeholder="Guest, room or request..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <motion.button className="icon-btn" aria-label="Refresh requests" disabled={busy} onClick={() => void perform(refresh)} whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}>
            <RefreshCw size={18} />
          </motion.button>
        </div>
        <fieldset disabled={busy}>
          {loading ? <p className="loading-copy">Loading requests...</p> : (
            <RequestList
              manager
              onStatus={updateStatus}
              requests={requests.filter(item =>
                (filter === 'All' || item.status === filter) &&
                `${item.guest_name} ${item.room} ${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())
              )}
            />
          )}
        </fieldset>
      </motion.section>
    </>
  );

  // ── Sentiment page ──────────────────────────────────────────
  if (page === 'sentiment') {
    const posReviews = feedback.filter(item => item.analysis.sentiment === 'positive');
    const neuReviews = feedback.filter(item => item.analysis.sentiment === 'neutral');
    const negReviews = feedback.filter(item => item.analysis.sentiment === 'negative');
    const totalFb = feedback.length || 1;

    return (
      <>
        <PageHeading eyebrow="LISTEN CLOSELY. ACT THOUGHTFULLY." title="Guest Feedback & Sentiment Intelligence" subtitle="Categorized strictly into Positive, Neutral, and Negative sentiments parsed from guest feedback." />
        {alerts}

        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Metric icon={TrendingUp} label="Average Guest Rating" value={`${average}${feedback.length ? ' / 5' : ''}`} note={`Calculated from ${feedback.length} guest reviews`} delay={0} />
          <Metric icon={Check} label="Positive Feedback" value={`${posReviews.length} (${Math.round(posReviews.length / totalFb * 100)}%)`} note="Praise for service, dining & perks" delay={0.08} onClick={() => setFilter('positive')} />
          <Metric icon={MessageSquare} label="Neutral Feedback" value={`${neuReviews.length} (${Math.round(neuReviews.length / totalFb * 100)}%)`} note="Standard stays & balanced remarks" delay={0.16} onClick={() => setFilter('neutral')} />
          <Metric icon={AlertTriangle} label="Negative Feedback" value={`${negReviews.length} (${Math.round(negReviews.length / totalFb * 100)}%)`} note="Service recovery alerts" delay={0.24} onClick={() => setFilter('negative')} />
        </div>

        <motion.section className="panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="section-title" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2>Guest Feedback Queue</h2>
            <div className="tabs" style={{ margin: 0 }}>
              {[
                { id: 'All', label: `All (${feedback.length})` },
                { id: 'positive', label: `Positive (${posReviews.length})` },
                { id: 'neutral', label: `Neutral (${neuReviews.length})` },
                { id: 'negative', label: `Negative (${negReviews.length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  className={filter === tab.id ? 'selected' : ''}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="loading-copy">Loading feedback...</p> : (
            feedback.filter(item => filter === 'All' || item.analysis.sentiment === filter).length ? (
              feedback.filter(item => filter === 'All' || item.analysis.sentiment === filter).map((item, i) => {
                const s = item.analysis.sentiment === 'positive' ? 'positive' : item.analysis.sentiment === 'negative' ? 'negative' : 'neutral';
                const sLabel = s === 'positive' ? 'Positive Feedback' : s === 'negative' ? 'Negative Feedback' : 'Neutral Feedback';

                return (
                  <motion.article
                    className={`manager-feedback feedback-item-card ${s}`}
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div className="feedback-top">
                      <span className="avatar">{item.guest_name.split(' ').map(x => x[0]).join('')}</span>
                      <div>
                        <b>{item.guest_name}</b>
                        <small>Room {item.room} &bull; {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                      </div>
                      <span className={`sentiment-badge-pill ${s}`}>{sLabel}</span>
                      <div className="stars-visual" style={{ marginLeft: 'auto' }}>
                        {[1, 2, 3, 4, 5].map(st => (
                          <Star
                            key={st}
                            size={14}
                            fill={st <= item.rating ? '#f59e0b' : 'none'}
                            stroke={st <= item.rating ? '#f59e0b' : '#cbd5e1'}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="review-comment">"{item.comment}"</p>
                    <div className="aspect-tags">
                      {(item.analysis.aspects || []).map((aspect: string) => <span key={aspect} className="aspect-badge-tag">{aspect}</span>)}
                    </div>
                    {item.analysis.recommendation && (
                      <div className="recommendation">
                        <Sparkles size={16} />
                        <span>{item.analysis.recommendation}</span>
                      </div>
                    )}
                  </motion.article>
                );
              })
            ) : (
              <div className="empty-state"><MessageSquare size={30} /><p>No feedback matching this category.</p></div>
            )
          )}
        </motion.section>
      </>
    );
  }

  // ── Pricing page ────────────────────────────────────────────
  if (page === 'pricing') return (
    <>
      <PageHeading
        eyebrow="MACHINE LEARNING REVENUE INTELLIGENCE"
        title="Dynamic Pricing with Automated Reset Timeline"
        subtitle="Forecast demand scenarios, schedule dynamic rate timelines, and automate transparent reversion to original base prices."
      />
      {alerts}

      {/* Real-time synchronization indicator banner */}
      <motion.div
        className="dynamic-sync-banner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="sync-status-indicator">
          <span className="live-dot" />
          <div>
            <strong>Real-Time Synchronized</strong>
            <span>Rate transitions dynamically reflect in <code>hotel_info.json</code>, PDF knowledge base, and AI Concierge chats</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <motion.button
            className="secondary"
            style={{ padding: '7px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={viewHotelInfo}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FileText size={15} /> View hotel_info.json
          </motion.button>
          <motion.button
            className="secondary"
            style={{ padding: '7px 14px', fontSize: '12px', borderColor: '#fca5a5', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => resetRate('all')}
            disabled={busy}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title="Immediately resets all rooms back to their original baseline prices"
          >
            <RotateCcw size={15} /> Reset All to Base
          </motion.button>
        </div>
      </motion.div>

      <div className="pricing-layout">
        {/* Left Column: Scenario & Duration Controls */}
        <motion.section className="panel scenario-panel" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}>
          <h2>Build a scenario</h2>
          <p className="muted">Simulate demand & choose how long the dynamic rate remains active before reverting to base price.</p>

          <label htmlFor="occupancy">Expected occupancy <b>{occupancy}%</b></label>
          <input id="occupancy" type="range" min="0" max="100" value={occupancy} onChange={e => setOccupancy(Number(e.target.value))} />
          <div className="range-labels"><span>0%</span><span>100%</span></div>

          <label htmlFor="season">Seasonality factor</label>
          <select id="season" value={season} onChange={e => setSeason(Number(e.target.value))}>
            <option value="0.7">Low season - 0.7x</option>
            <option value="1">Regular season - 1.0x</option>
            <option value="1.1">High season - 1.1x</option>
            <option value="1.5">Peak season - 1.5x</option>
          </select>

          {/* Timeline & Calendar Selector */}
          <div className="timeline-schedule-box">
            <span className="timeline-schedule-label">
              <Clock size={15} style={{ color: 'var(--green)' }} />
              Dynamic Rate Duration & Auto-Reset Timeline
            </span>
            <div className="timeline-pills">
              {[
                { label: '24 Hours', hours: 24, custom: false },
                { label: '48 Hours', hours: 48, custom: false },
                { label: '72 Hours', hours: 72, custom: false },
                { label: '7 Days', hours: 168, custom: false },
                { label: 'Custom Calendar', hours: 0, custom: true },
              ].map(opt => (
                <button
                  type="button"
                  key={opt.label}
                  className={`timeline-pill ${(opt.custom && isCustomCalendar) || (!opt.custom && !isCustomCalendar && durationHours === opt.hours) ? 'active' : ''}`}
                  onClick={() => {
                    if (opt.custom) {
                      setIsCustomCalendar(true);
                    } else {
                      setIsCustomCalendar(false);
                      setDurationHours(opt.hours);
                    }
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {isCustomCalendar ? (
              <div className="custom-calendar-field">
                <label htmlFor="custom-date-picker">
                  <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
                  Select Auto-Reset Date & Time (Calendar)
                </label>
                <input
                  id="custom-date-picker"
                  type="datetime-local"
                  value={customDate}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => setCustomDate(e.target.value)}
                />
                <small style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
                  Rate will automatically revert to base price at this exact timestamp.
                </small>
              </div>
            ) : (
              <small style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                ⚡ Auto-Reset Policy: Price reverts back to baseline automatically after <b>{durationHours} hours</b>.
              </small>
            )}
          </div>

          <motion.button className="primary" onClick={calculate} disabled={busy} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ width: '100%', marginTop: '16px' }}>
            {busy ? 'Working...' : 'Calculate scenario'}<ArrowRight size={16} />
          </motion.button>

          <div className="guardrail">
            <Check size={17} />
            <p>
              <b>Automated Reversion Guardrail</b>
              Dynamic rates remain bounded within -20% to +35% and automatically return to original base prices once the selected timeline concludes.
            </p>
          </div>
        </motion.section>

        {/* Right Column: Rate recommendations & Live Price Flow */}
        <motion.section className="panel" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
          <div className="section-title">
            <div>
              <h2>Rate recommendations & Live Flow</h2>
              <p className="muted" style={{ fontSize: '12px', margin: '2px 0 0' }}>Real-time transition tracking from base rate to ML surge and auto-reversion.</p>
            </div>
            <span className="pill">{scenario.occupancy}% occupancy</span>
          </div>

          {occupancy !== scenario.occupancy || season !== scenario.season ? (
            <p className="notice">Inputs changed. Click "Calculate scenario" to update suggested recommendations.</p>
          ) : null}

          {rooms.map((room, i) => {
            const savedRate = rates.find(r => r.id === room.id);
            const isSurge = Boolean(savedRate?.is_surge);
            const currentAmount = savedRate ? savedRate.amount : room.base;
            const baseAmount = savedRate?.base_amount || room.base;
            const remainingFormatted = savedRate?.remaining_formatted;

            return (
              <motion.article
                className="rate-card"
                key={room.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                style={{ position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span className="eyebrow">PER ROOM / NIGHT</span>
                    <h3>{room.name}</h3>
                  </div>
                  <div>
                    {isSurge ? (
                      <span className="badge-surge-active" title={`Active until ${savedRate?.expires_at || ''}`}>
                        <Zap size={13} /> ML Surge Active · Resets in {remainingFormatted || (savedRate?.duration_hours ? `${savedRate.duration_hours}h` : '24h')}
                      </span>
                    ) : (
                      <span className="badge-base-active">
                        <CheckCircle2 size={13} style={{ color: 'var(--green)' }} /> Base Rate Active ({money(baseAmount)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Price Flow Visualizer: Base -> ML Surge -> Auto-Reset */}
                <div className="price-flow-container">
                  <div className={`price-flow-box ${!isSurge ? 'active-phase' : ''}`}>
                    <span className="price-flow-phase-tag">Phase 1: Base</span>
                    <span className="price-flow-val">{money(baseAmount)}</span>
                    <span className="price-flow-note">{!isSurge ? '● Active Rate' : 'Standard'}</span>
                  </div>

                  <span className="price-flow-arrow"><ChevronRight size={16} /></span>

                  <div className={`price-flow-box ${isSurge ? 'active-phase' : ''}`}>
                    <span className="price-flow-phase-tag">Phase 2: ML Surge</span>
                    <span className="price-flow-val">{money(isSurge ? currentAmount : room.recommended)}</span>
                    <span className="price-flow-note">
                      {isSurge ? `Active · ${remainingFormatted || '24h'}` : `Timeline: ${isCustomCalendar ? 'Custom' : `${durationHours}h`}`}
                    </span>
                  </div>

                  <span className="price-flow-arrow"><ChevronRight size={16} /></span>

                  <div className="price-flow-box">
                    <span className="price-flow-phase-tag">Phase 3: Auto-Reset</span>
                    <span className="price-flow-val">{money(baseAmount)}</span>
                    <span className="price-flow-note">
                      {isSurge && savedRate?.expires_at ? `At ${new Date(savedRate.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'When time ends'}
                    </span>
                  </div>
                </div>

                {/* Rate details grid */}
                <div className="rate-comparison">
                  <div>
                    <small>Original Base</small>
                    <b>{money(baseAmount)}</b>
                  </div>
                  <div>
                    <small>ML Suggested</small>
                    <b style={{ color: 'var(--green)' }}>{money(room.recommended)}</b>
                  </div>
                  <span className={`rate-change ${room.change >= 0 ? 'rate-up' : 'rate-down'}`}>
                    {room.change >= 0 ? '+' : ''}{room.change}%
                  </span>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <small>Current Live Rate</small>
                    <b style={{ color: isSurge ? '#b45309' : 'var(--ink)' }}>{money(currentAmount)}</b>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {(isSurge || currentAmount !== baseAmount) && (
                    <motion.button
                      className="secondary"
                      disabled={busy}
                      onClick={() => resetRate(room.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={{ borderColor: '#fca5a5', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}
                      title="Reset this room back to original base price"
                    >
                      <RotateCcw size={14} /> Reset to Base ({money(baseAmount)})
                    </motion.button>
                  )}
                  <motion.button
                    className="primary"
                    disabled={busy}
                    onClick={() => apply(room.id)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Zap size={14} /> Apply ML Rate ({isCustomCalendar ? 'Scheduled' : `${durationHours}h`})
                  </motion.button>
                </div>
              </motion.article>
            );
          })}
        </motion.section>
      </div>

      {/* Real-time Pricing Flow & Audit History Section */}
      <motion.section
        className="pricing-timeline-section"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} style={{ color: 'var(--green)' }} />
              <h2 style={{ margin: 0, fontSize: '18px' }}>Dynamic Pricing Flow & Transition History</h2>
            </div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '12.5px' }}>
              Real-time audit log of room rate movements from past baseline to ML dynamic surge and automated reset.
            </p>
          </div>
          <span className="pill" style={{ background: '#f8fafc' }}>
            {timelineLogs.length} events logged
          </span>
        </div>

        {timelineLogs.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="pricing-timeline-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Room Category</th>
                  <th>Action</th>
                  <th>Price Flow Transition</th>
                  <th>Timeline Duration & Expiry</th>
                </tr>
              </thead>
              <tbody>
                {timelineLogs.map((log) => {
                  const isSurgeAction = log.action === 'ML_SURGE_APPLIED';
                  const isAutoReset = log.action === 'AUTO_RESET_EXPIRED';
                  const badgeClass = isSurgeAction ? 'surge' : isAutoReset ? 'autoreset' : 'manualreset';
                  const badgeLabel = isSurgeAction ? '⚡ ML Surge Applied' : isAutoReset ? '⏱️ Auto-Reset (Expired)' : '🔄 Manual Reset to Base';

                  return (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })}
                      </td>
                      <td><b>{log.room_name}</b></td>
                      <td>
                        <span className={`action-badge ${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{money(log.from_price)}</span>
                        <span style={{ margin: '0 6px', color: '#94a3b8' }}>&rarr;</span>
                        <span style={{ fontWeight: 700, color: isSurgeAction ? '#047857' : 'var(--ink)' }}>{money(log.to_price)}</span>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {log.duration_hours ? `${log.duration_hours} Hours` : isAutoReset ? 'Timeline Ended (Reverted to Base)' : 'Immediate Base Reversion'}
                        {log.expires_at ? ` · Expires: ${new Date(log.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '28px', color: 'var(--muted)', fontSize: '13px' }}>
            <CheckCircle size={32} style={{ color: 'var(--green)', margin: '0 auto 8px', display: 'block' }} />
            All rooms are currently operating at baseline rates. Apply an ML dynamic rate above to view real-time timeline flow events.
          </div>
        )}
      </motion.section>

      {/* Hotel Info JSON Real-Time Sync Modal */}
      <AnimatePresence>
        {showHotelInfoModal && hotelInfoData && (
          <div className="modal-overlay" onClick={() => setShowHotelInfoModal(false)}>
            <motion.div
              className="modal-content"
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>hotel_info.json — Real-Time Knowledge Base</h3>
                  <small style={{ color: 'var(--muted)' }}>Synced dynamically with PDF generator & AI Concierge</small>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowHotelInfoModal(false)}
                  style={{ cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="modal-body">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(hotelInfoData, null, 2)}
                </pre>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  // ── Overview (default) ──────────────────────────────────────
  return (
    <>
      <div className="overview-heading">
        <PageHeading eyebrow="YOUR RESORT AT A GLANCE" title={`A clearer day, ${user.name.split(' ')[0]}.`} subtitle="The big picture. The small details. Everything that needs you." />
        <motion.button className="secondary" disabled={busy} onClick={() => void perform(refresh)} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <RefreshCw size={16} /> Refresh
        </motion.button>
      </div>
      {alerts}

      <motion.div
        className="manager-welcome"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div>
          <span className="eyebrow light">LET'S MAKE TODAY EXCEPTIONAL</span>
          <h2>{newCount ? `${newCount} new request${newCount > 1 ? 's' : ''}. A chance to make a difference.` : 'Your next great guest experience starts here.'}</h2>
          <p>{newCount ? 'Your guests have reached out. Give their requests a little attention.' : 'Guest requests and feedback appear here as soon as they are submitted.'}</p>
        </div>
        <motion.button className="light-button" onClick={() => navigate('requests')} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          Open service queue <ArrowRight size={17} />
        </motion.button>
      </motion.div>

      <div className="metric-grid">
        <motion.article
          className="metric clickable-metric"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
          onClick={() => navigate('rooms')}
          style={{ cursor: 'pointer', border: '1px solid #d0dfc8' }}
          title="Click to view all 150 rooms and customer stay details"
        >
          <div>
            <span>Live occupancy</span>
            <BedDouble size={19} />
          </div>
          <strong>{analytics.occupancyRate}%</strong>
          <p className="clickable-metric-hint" style={{ color: 'var(--green-light)', fontWeight: 600 }}>
            {analytics.occupiedCount} of {analytics.totalRooms} rooms &bull; View rooms &rarr;
          </p>
        </motion.article>

        <Metric icon={ClipboardList} label="Open requests" value={loading ? '...' : String(open)} note={`${newCount} awaiting a first response`} delay={0.08} onClick={() => navigate('requests')} />
        <Metric icon={Sparkles} label="Resort Services" value="Live Capacity" note="Spa & Dining 95% full • View slots" delay={0.12} onClick={() => navigate('services')} />
        <Metric icon={MessageSquare} label="Guest rating" value={loading ? '...' : average} note={feedback.length ? `From ${feedback.length} submitted reviews` : 'No guest feedback yet'} delay={0.16} onClick={() => navigate('sentiment')} />
        <Metric icon={TrendingUp} label="Daily resort revenue" value={analytics.dailyRevenue} note="Dynamic active stays + room service" delay={0.24} onClick={() => navigate('revenue')} />
      </div>


      <div className="dashboard-grid">
        <motion.section className="panel demand-panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="section-title">
            <div>
              <h2>Occupancy & Demand Outlook</h2>
              <p className="muted">
                {timeframe === 'week' ? 'Active 7-day occupancy curve from live bookings' : timeframe === 'month' ? '4-week trailing occupancy performance' : '14-day forward AI demand forecast'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="pill" style={{ color: 'var(--green-light)', borderColor: '#cfe0c8' }}>
                &bull; Live Dynamic Data
              </span>
              <div className="tabs" style={{ margin: 0 }}>
                {(['week', 'month', 'forecast'] as const).map(tf => (
                  <button
                    key={tf}
                    className={timeframe === tf ? 'selected' : ''}
                    onClick={() => setTimeframe(tf)}
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                  >
                    {tf === 'week' ? '7 Days' : tf === 'month' ? '4 Weeks' : 'Forecast'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={
                  timeframe === 'month' ? [
                    { day: 'Week 1', occupancy: 78, revenueLakhs: 21.6 },
                    { day: 'Week 2', occupancy: 82, revenueLakhs: 22.8 },
                    { day: 'Week 3', occupancy: 86, revenueLakhs: 23.9 },
                    { day: 'Week 4', occupancy: 91, revenueLakhs: 25.2 },
                  ] : timeframe === 'forecast' ? [
                    { day: 'Next Mon', occupancy: 72, revenueLakhs: 19.8 },
                    { day: 'Next Tue', occupancy: 76, revenueLakhs: 21.0 },
                    { day: 'Next Wed', occupancy: 80, revenueLakhs: 22.1 },
                    { day: 'Next Thu', occupancy: 89, revenueLakhs: 24.6 },
                    { day: 'Next Fri', occupancy: 97, revenueLakhs: 26.8 },
                    { day: 'Next Sat', occupancy: 99, revenueLakhs: 27.4 },
                    { day: 'Next Sun', occupancy: 93, revenueLakhs: 25.7 },
                  ] : analytics.trend
                }
                margin={{ left: -24, right: 10, top: 14, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2d6b54" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2d6b54" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef1e9" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" fontSize={11} stroke="#9ca88d" />
                <YAxis domain={[40, 100]} fontSize={11} stroke="#9ca88d" unit="%" />
                <Tooltip
                  formatter={(val: number, name: string) => [
                    name === 'occupancy' ? `${val}% (${Math.round((val / 100) * analytics.totalRooms)} rooms occupied)` : val,
                    'Occupancy Rate'
                  ]}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e8ede5',
                    borderRadius: '10px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="occupancy" stroke="#2d6b54" strokeWidth={2.5} fill="url(#chartFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section className="panel attention-panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <div className="section-title">
            <h2><Sparkles size={18} /> Needs attention</h2>
          </div>
          {needsAttention.length ? needsAttention.slice(0, 3).map((item, i) => (
            <motion.button
              key={item.id}
              onClick={() => navigate('sentiment')}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              whileHover={{ x: 4 }}
            >
              <span className={`feature-icon ${item.analysis.sentiment === 'negative' ? 'peach' : 'gold'}`}>
                <AlertTriangle size={18} />
              </span>
              <div>
                <b>{item.guest_name} - Room {item.room}</b>
                <p>{item.comment.slice(0, 80)}{item.comment.length > 80 ? '...' : ''}</p>
              </div>
              <ArrowUpRight size={16} />
            </motion.button>
          )) : (
            <div className="empty-state">
              <Check size={24} />
              <p>No items flagged for attention right now.</p>
            </div>
          )}
          <button className="text-button" onClick={() => navigate('sentiment')} style={{ marginTop: '12px' }}>
            View all feedback <ArrowRight size={15} />
          </button>
        </motion.section>
      </div>
    </>
  );
}

function Metric({ icon: Icon, label, value, note, delay = 0, onClick }: { icon: typeof TrendingUp; label: string; value: string; note: string; delay?: number; onClick?: () => void }) {
  return (
    <motion.article
      className={`metric ${onClick ? 'clickable-metric' : ''}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div>
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </motion.article>
  );
}
