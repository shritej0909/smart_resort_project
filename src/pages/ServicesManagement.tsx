import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Search, RefreshCw, X, Clock, MapPin, Users,
  CheckCircle2, AlertTriangle, AlertCircle, Plus, Minus,
  ChevronRight, Calendar, ArrowRight, ShieldAlert, Award,
  Flame, Check
} from 'lucide-react';
import { api, money, type ResortServiceRecord, type ServicesOverview, type ServiceRequest } from '../services/api';
import { PageHeading } from './GuestPortal';

interface ServicesManagementProps {
  navigate: (page: string) => void;
}

export default function ServicesManagement({ navigate }: ServicesManagementProps) {
  const [data, setData] = useState<ServicesOverview | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeService, setActiveService] = useState<ResortServiceRecord | null>(null);

  // Modal edit state
  const [editCapacity, setEditCapacity] = useState<number>(0);
  const [editBooked, setEditBooked] = useState<number>(0);
  const [guestBookRoom, setGuestBookRoom] = useState('204');
  const [guestBookSlot, setGuestBookSlot] = useState('');

  const fetchServices = async () => {
    try {
      setError('');
      const [res, reqList] = await Promise.all([
        api<ServicesOverview>('/services'),
        api<ServiceRequest[]>('/requests').catch(() => [])
      ]);
      setData(res);
      setRequests(reqList);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 12000);
    return () => clearInterval(interval);
  }, []);

  const openServiceModal = (svc: ResortServiceRecord) => {
    setActiveService(svc);
    setEditCapacity(svc.total_capacity);
    setEditBooked(svc.booked_slots);
    const availableSlot = svc.slots.find(s => s.status === 'Available')?.time || svc.timing;
    setGuestBookSlot(availableSlot);
  };

  const handleUpdateCapacity = async () => {
    if (!activeService) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await api<{ ok: boolean; service: ResortServiceRecord }>(
        `/services/${activeService.id}/capacity`,
        'PATCH',
        { total_capacity: editCapacity, booked_slots: editBooked }
      );
      setSuccess(`Capacity for ${activeService.name} updated successfully.`);
      setActiveService(res.service);
      await fetchServices();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickBook = async () => {
    if (!activeService) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api('/services/book', 'POST', {
        service_id: activeService.id,
        slot_time: guestBookSlot || activeService.timing,
        notes: `Booked by Manager for Room ${guestBookRoom}`
      });
      setSuccess(`Booking confirmed for Room ${guestBookRoom} on ${activeService.name}. Dispatched to service requests.`);
      await fetchServices();
      // Update local modal view
      const updated = (await api<ServicesOverview>('/services')).services.find(s => s.id === activeService.id);
      if (updated) {
        setActiveService(updated);
        setEditBooked(updated.booked_slots);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const categories = useMemo(() => {
    if (!data) return ['All'];
    const cats = Array.from(new Set(data.services.map(s => s.category)));
    return ['All', ...cats];
  }, [data]);

  const filteredServices = useMemo(() => {
    if (!data) return [];
    return data.services.filter(s => {
      const matchCat = selectedCategory === 'All' || s.category === selectedCategory;
      const matchStatus =
        selectedStatus === 'All' ||
        (selectedStatus === 'NearCapacity' && s.occupancyRate >= 95) ||
        (selectedStatus === 'HighDemand' && s.occupancyRate >= 80 && s.occupancyRate < 95) ||
        (selectedStatus === 'Available' && s.occupancyRate < 80);

      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.timing.toLowerCase().includes(q);

      return matchCat && matchStatus && matchSearch;
    });
  }, [data, selectedCategory, selectedStatus, searchQuery]);

  const stats = data?.stats || {
    totalServices: 12,
    totalCapacity: 279,
    totalBooked: 187,
    availableSlots: 92,
    overallOccupancy: 67,
    highCapacityCount: 2,
    activeAlertsCount: 2,
  };

  const highCapacityList = (data?.services || []).filter(s => s.occupancyRate >= 95);

  return (
    <div className="rooms-management-page services-management-page">
      <div className="overview-heading">
        <PageHeading
          eyebrow="LIVE RESORT SERVICES & CAPACITY INTELLIGENCE"
          title="Resort Services & Amenities Capacity"
          subtitle="Real-time capacity tracking, operational slots, live demand monitoring, and instant booking synchronization across all resort experiences."
        />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="live-pulse-badge" title="Live synchronized with AI Concierge and RAG pipeline">
            <span className="live-dot" />
            <span>AI ML Sync Active</span>
          </div>
          <motion.button
            className="secondary"
            disabled={loading || busy}
            onClick={fetchServices}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </motion.button>
          <motion.button
            className="light-button"
            onClick={() => navigate('overview')}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Overview &rarr;
          </motion.button>
        </div>
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {error && (
          <motion.div className="error" role="alert" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AlertCircle size={18} /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div className="success" role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Check size={18} /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Real-time Metrics Grid */}
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <motion.article
          className="metric clickable-metric"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
          onClick={() => { setSelectedCategory('All'); setSelectedStatus('All'); }}
          style={{ cursor: 'pointer' }}
        >
          <div>
            <span>Total Resort Services</span>
            <Sparkles size={19} color="#8a5340" />
          </div>
          <strong>{stats.totalServices} Facilities</strong>
          <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
            Spa, Dining, Cabanas, Water Sports & Activities
          </p>
        </motion.article>

        <motion.article
          className="metric clickable-metric"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
        >
          <div>
            <span>Live Services Occupancy</span>
            <Users size={19} color="#2d5a27" />
          </div>
          <strong style={{ color: stats.overallOccupancy >= 80 ? '#b45309' : '#2d5a27' }}>
            {stats.overallOccupancy}%
          </strong>
          <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
            {stats.totalBooked} of {stats.totalCapacity} daily slots reserved
          </p>
        </motion.article>

        <motion.article
          className="metric clickable-metric"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
          onClick={() => setSelectedStatus('Available')}
          style={{ cursor: 'pointer' }}
        >
          <div>
            <span>Available Open Slots</span>
            <CheckCircle2 size={19} color="#059669" />
          </div>
          <strong style={{ color: '#059669' }}>{stats.availableSlots} Slots</strong>
          <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
            Ready for instant guest reservation
          </p>
        </motion.article>

        <motion.article
          className="metric clickable-metric"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
          onClick={() => setSelectedStatus('NearCapacity')}
          style={{
            cursor: 'pointer',
            border: stats.highCapacityCount > 0 ? '1px solid rgba(220, 38, 38, 0.4)' : undefined,
            backgroundColor: stats.highCapacityCount > 0 ? 'rgba(254, 242, 242, 0.6)' : undefined
          }}
        >
          <div>
            <span>≥95% Capacity Alerts</span>
            <ShieldAlert size={19} color="#dc2626" />
          </div>
          <strong style={{ color: '#dc2626' }}>
            {stats.highCapacityCount} At Peak
          </strong>
          <p style={{ color: '#991b1b', fontWeight: 600, fontSize: '0.82rem' }}>
            AI Concierge auto-rebalancing active &rarr;
          </p>
        </motion.article>
      </div>

      {/* 95% Proactive ML Alert Banner */}
      {highCapacityList.length > 0 && (
        <motion.div
          className="notice"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
            border: '1px solid #fecdd3',
            color: '#881337',
            padding: '16px 20px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: '0 4px 15px rgba(225, 29, 72, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '8px', background: '#e11d48', borderRadius: '10px', color: 'white' }}>
              <Flame size={20} />
            </div>
            <div>
              <b style={{ display: 'block', fontSize: '0.98rem', marginBottom: '2px', color: '#9f1239' }}>
                Machine Learning 95% Capacity Rule Active:
              </b>
              <span style={{ fontSize: '0.88rem' }}>
                {highCapacityList.map(s => `${s.name} (${s.occupancyRate}% full)`).join(' and ')} are currently running at peak capacity.
                The AI Concierge is automatically redirecting inquiring guests to alternate available experiences in real time!
              </span>
            </div>
          </div>
          <button
            className="secondary"
            onClick={() => setSelectedStatus('NearCapacity')}
            style={{ whiteSpace: 'nowrap', borderColor: '#f43f5e', color: '#be123c' }}
          >
            Filter Peak Services &rarr;
          </button>
        </motion.div>
      )}

      {/* Toolbar: Category Filters, Status Filters, Search */}
      <motion.section className="panel" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
        <div className="request-toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
          {/* Category Tabs */}
          <div className="tabs" style={{ margin: 0, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <motion.button
                key={cat}
                className={selectedCategory === cat ? 'selected' : ''}
                onClick={() => setSelectedCategory(cat)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                {cat}
              </motion.button>
            ))}
          </div>

          {/* Status Tabs */}
          <div className="tabs" style={{ margin: 0 }}>
            {[
              { id: 'All', label: 'All Status' },
              { id: 'Available', label: 'Available (<80%)' },
              { id: 'HighDemand', label: 'High Demand (80-94%)' },
              { id: 'NearCapacity', label: 'Near Capacity (≥95%)' },
            ].map(tab => (
              <button
                key={tab.id}
                className={selectedStatus === tab.id ? 'selected' : ''}
                onClick={() => setSelectedStatus(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="search-field" style={{ minWidth: '240px', flex: 1 }}>
            <Search size={17} />
            <input
              aria-label="Search resort services"
              placeholder="Search spa, dining, fitness, water sports..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Services Cards Grid */}
        {loading ? (
          <p className="loading-copy">Synchronizing live resort services...</p>
        ) : filteredServices.length === 0 ? (
          <div className="empty-state">
            <Sparkles size={32} />
            <h3>No services found</h3>
            <p>Try resetting the category filter or search query.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '20px',
              marginTop: '16px'
            }}
          >
            {filteredServices.map(svc => {
              const isPeak = svc.occupancyRate >= 95;
              const isHigh = svc.occupancyRate >= 80 && svc.occupancyRate < 95;

              return (
                <motion.article
                  key={svc.id}
                  className="service-inventory-card"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.1)' }}
                  style={{
                    background: '#fff',
                    borderRadius: '18px',
                    border: isPeak ? '2px solid #f43f5e' : '1px solid #e2e8f0',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.25s ease'
                  }}
                >
                  {/* Card Media Header */}
                  <div style={{ position: 'relative', height: '170px', overflow: 'hidden' }}>
                    <img
                      src={svc.image}
                      alt={svc.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%)'
                      }}
                    />

                    {/* Category Tag */}
                    <span
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        padding: '4px 10px',
                        background: 'rgba(255,255,255,0.92)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#1e293b'
                      }}
                    >
                      {svc.category}
                    </span>

                    {/* Status Pill Badge */}
                    <span
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#fff',
                        backgroundColor: isPeak
                          ? '#e11d48'
                          : isHigh
                            ? '#d97706'
                            : '#059669',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                      }}
                    >
                      {svc.status}
                    </span>

                    {/* Bottom Title on Image */}
                    <div style={{ position: 'absolute', bottom: '12px', left: '14px', right: '14px', color: '#fff' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                        {svc.name}
                      </h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', opacity: 0.9 }}>
                        {svc.tagline}
                      </p>
                    </div>
                  </div>

                  {/* Card Content Body */}
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '14px' }}>
                    {/* Location & Timings */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#64748b' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={14} color="#8a5340" /> {svc.location}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} color="#64748b" /> {svc.timing}
                      </span>
                    </div>

                    {/* Price and Unit */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                          {svc.price === 0 ? 'Complimentary' : money(svc.price)}
                        </span>
                        <small style={{ color: '#64748b', marginLeft: '6px' }}>/ {svc.unit}</small>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#d97706', fontWeight: 700 }}>
                        ★ {svc.popular_score} Guest Rating
                      </span>
                    </div>

                    {/* Real-time Capacity Progress Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>
                          Live Capacity ({svc.booked_slots}/{svc.total_capacity} Slots)
                        </span>
                        <b style={{ color: isPeak ? '#e11d48' : isHigh ? '#d97706' : '#059669' }}>
                          {svc.occupancyRate}% Booked
                        </b>
                      </div>
                      <div
                        style={{
                          height: '9px',
                          background: '#e2e8f0',
                          borderRadius: '6px',
                          overflow: 'hidden'
                        }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, svc.occupancyRate)}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{
                            height: '100%',
                            background: isPeak
                              ? 'linear-gradient(90deg, #f43f5e 0%, #be123c 100%)'
                              : isHigh
                                ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                                : 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                            borderRadius: '6px'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.78rem', color: '#64748b' }}>
                        <span>
                          {svc.available_slots === 0 ? 'No slots remaining' : `${svc.available_slots} slots available right now`}
                        </span>
                        {isPeak && <span style={{ color: '#e11d48', fontWeight: 700 }}>95% Threshold Alert</span>}
                      </div>
                    </div>

                    {/* Working Slots Breakdown preview */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Live Slot Inventory:
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {svc.slots.slice(0, 5).map((sl, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: sl.status === 'Available' ? '#ecfdf5' : '#f1f5f9',
                              color: sl.status === 'Available' ? '#065f46' : '#64748b',
                              border: sl.status === 'Available' ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                              fontWeight: sl.status === 'Available' ? 600 : 400
                            }}
                          >
                            {sl.time} {sl.status === 'Available' ? '• Open' : ''}
                          </span>
                        ))}
                        {svc.slots.length > 5 && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', padding: '2px 4px' }}>
                            +{svc.slots.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                      <motion.button
                        className="secondary"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                        onClick={() => openServiceModal(svc)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Adjust Capacity
                      </motion.button>
                      <motion.button
                        className="primary"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                        disabled={svc.available_slots === 0}
                        onClick={() => openServiceModal(svc)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {svc.available_slots === 0 ? 'Sold Out' : 'Book for Guest'}
                      </motion.button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* Recent AI Concierge Bookings & Requests Queue */}
      <motion.section
        className="panel"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{ marginTop: '24px' }}
      >
        <div className="section-title">
          <div>
            <h2>Recent AI Concierge & Services Queue</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
              Service requests and spa bookings dispatched in real time from AI Concierge
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate('requests')}
            style={{ fontWeight: 600 }}
          >
            Open All Requests Queue &rarr;
          </button>
        </div>

        {requests.filter(r => r.category === 'Spa' || r.title.includes('Booking') || r.title.includes('Spa')).length === 0 ? (
          <p className="loading-copy">No recent spa or service bookings.</p>
        ) : (
          <div className="request-list">
            {requests
              .filter(r => r.category === 'Spa' || r.title.includes('Booking') || r.title.includes('Spa'))
              .slice(0, 5)
              .map((r, i) => (
                <article key={r.id} className="request-row">
                  <span className="request-icon peach">
                    <Sparkles size={20} />
                  </span>
                  <div className="request-info">
                    <div className="request-title">
                      <b>{r.title}</b>
                      <span className={`status status-${r.status.toLowerCase().replace(' ', '-')}`}>
                        {r.status}
                      </span>
                    </div>
                    <p>{r.detail}</p>
                    <small>
                      {r.guest_name} • Room {r.room} • {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} • {r.total > 0 ? money(r.total) : 'Complimentary'}
                    </small>
                  </div>
                </article>
              ))}
          </div>
        )}
      </motion.section>

      {/* Capacity & Slot Adjustment Modal */}
      <AnimatePresence>
        {activeService && (
          <div className="room-modal-backdrop" onClick={() => setActiveService(null)}>
            <motion.div
              className="room-detail-modal"
              style={{ maxWidth: '640px', width: '92%' }}
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
                <div>
                  <span className="eyebrow">{activeService.category}</span>
                  <h2 style={{ fontSize: '1.35rem', margin: '4px 0' }}>{activeService.name}</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    {activeService.location} • {activeService.timing}
                  </p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => setActiveService(null)}
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Real-time Status Card */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: activeService.occupancyRate >= 95 ? '#fff1f2' : '#f8fafc',
                    border: activeService.occupancyRate >= 95 ? '1px solid #fecdd3' : '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Live Status
                    </span>
                    <h3 style={{ margin: '2px 0 0 0', color: activeService.occupancyRate >= 95 ? '#e11d48' : '#1e293b' }}>
                      {activeService.status} ({activeService.booked_slots} of {activeService.total_capacity} Slots)
                    </h3>
                  </div>
                  <span
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      background: activeService.occupancyRate >= 95 ? '#e11d48' : '#059669',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.88rem'
                    }}
                  >
                    {activeService.occupancyRate}% Capacity
                  </span>
                </div>

                {/* Adjust Capacity Form */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700 }}>
                    Manager Dynamic Capacity Controls
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Total Daily Capacity (Slots)
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={editCapacity <= 1 || busy}
                          onClick={() => setEditCapacity(c => Math.max(1, c - 1))}
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={editCapacity}
                          onChange={e => setEditCapacity(Number(e.target.value))}
                          style={{
                            width: '80px',
                            textAlign: 'center',
                            padding: '6px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontWeight: 700
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={busy}
                          onClick={() => setEditCapacity(c => c + 1)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Currently Booked Slots
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={editBooked <= 0 || busy}
                          onClick={() => setEditBooked(b => Math.max(0, b - 1))}
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={editCapacity}
                          value={editBooked}
                          onChange={e => setEditBooked(Number(e.target.value))}
                          style={{
                            width: '80px',
                            textAlign: 'center',
                            padding: '6px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontWeight: 700
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={editBooked >= editCapacity || busy}
                          onClick={() => setEditBooked(b => Math.min(editCapacity, b + 1))}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                    <motion.button
                      className="secondary"
                      disabled={busy}
                      onClick={handleUpdateCapacity}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {busy ? 'Saving...' : 'Apply Live Capacity Changes'}
                    </motion.button>
                  </div>
                </div>

                {/* Direct Booking for Guest (Dispatches to Manager Queue) */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700 }}>
                    Book Service Slot for Guest (Real-Time Sync)
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Guest Room Number
                      </label>
                      <input
                        type="text"
                        value={guestBookRoom}
                        onChange={e => setGuestBookRoom(e.target.value)}
                        placeholder="e.g. 204"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Preferred Slot / Time
                      </label>
                      <input
                        type="text"
                        value={guestBookSlot}
                        onChange={e => setGuestBookSlot(e.target.value)}
                        placeholder="e.g. 06:00 PM"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                    <motion.button
                      className="primary"
                      disabled={busy || activeService.available_slots === 0}
                      onClick={handleQuickBook}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {busy ? 'Dispatching...' : 'Confirm & Dispatch to Manager Queue'}
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
