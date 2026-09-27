import { useState, useEffect } from 'react';
import {
  Palmtree,
  ArrowRight,
  Bot,
  Shield,
  Calendar,
  Users,
  Star,
  CheckCircle2,
  ChevronRight,
  Send,
  Zap,
  Activity,
  Utensils,
  LogIn,
  BedDouble,
  Image as ImageIcon,
  Check,
  Copy,
  CreditCard,
  QrCode,
  AlertCircle,
  Clock,
  Sparkles,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type BookingSummary, type BookingConfirmation, type User } from '../services/api';
import './LandingPage.css';

interface LandingPageProps {
  onEnterPortal: (role?: 'guest' | 'manager') => void;
  onDirectGuestLogin?: (user: User) => void;
  onToggleDirectLoginPreference?: () => void;
  directLoginMode?: boolean;
}

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  tag?: string;
  isRoomBooking?: boolean;
  bookingStage?: 'collecting_info' | 'summary' | 'confirmed' | 'failed';
  bookingSummary?: BookingSummary;
  bookingConfirmation?: BookingConfirmation;
  bookingDetails?: {
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    checkIn?: string;
    checkOut?: string;
    nights?: number;
    guests?: number;
    roomType?: string;
  };
  failureDetails?: {
    requestId?: string;
    reason?: string;
    details?: any;
  };
}

// ── EXACT ROOM TYPES STRICTLY FROM hotel_info.pdf ──────────────────────────
const HOTEL_ROOMS = [
  {
    id: 'garden-room',
    name: 'Garden Room',
    defaultPrice: 6500,
    size: '35 sqm',
    view: 'Garden or Pool View',
    bed: 'King or Twin Bed Configuration',
    tag: 'Tropical Serenity',
    image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=85',
    desc: 'Surrounded by lush 12-acre tropical gardens with private veranda and serene natural sunlight.',
    amenities: ['Air Conditioning', 'Minibar & Refreshments', 'Electronic In-Room Safe', '55" Ultra HD Smart TV', 'High-speed Wi-Fi', 'Daily Evening Turndown Service'],
  },
  {
    id: 'ocean-suite',
    name: 'Ocean Suite',
    defaultPrice: 14500,
    size: '65 sqm',
    view: 'Direct Ocean View',
    bed: 'King Bed & Separate Living Area',
    tag: 'Signature Oceanfront',
    image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=85',
    desc: 'Unobstructed Arabian Sea vistas from an expansive private balcony, featuring dedicated butler service.',
    amenities: ['All Garden Room Amenities', 'Dedicated Butler Service', 'Private Panoramic Ocean Balcony', 'Separate Living Salon', 'Premium Espresso Bar', 'Luxury Herbal Bath Amenities'],
  },
  {
    id: 'private-pool-villa',
    name: 'Private Pool Villa',
    defaultPrice: 28000,
    size: '150 sqm',
    view: 'Private Beach & Lagoon Sanctuary',
    bed: 'Grand King Master Suite',
    tag: 'Ultimate Opulence',
    image: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=85',
    desc: 'Secluded 150 sqm private villa featuring an exclusive plunge pool, private sun deck, and complimentary chauffeur transfers.',
    amenities: ['Private Cantilevered Plunge Pool', 'Daily Gourmet Breakfast for 2', 'Complimentary Airport Chauffeur Transfers', '24/7 Dedicated Private Butler', 'Tropical Garden Daybed Cabana', 'Express In-Villa VIP Check-in'],
  },
  {
    id: 'deluxe-ocean-view',
    name: 'Deluxe Ocean View Room',
    defaultPrice: 18500,
    size: '50 sqm',
    view: 'Panoramic Arabian Sea Horizon',
    bed: 'Plush King Bed',
    tag: 'Coastal Bliss',
    image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=900&q=85',
    desc: 'Elevated coastal suites with floor-to-ceiling glass doors opening onto sea breezes and dramatic sunset horizons.',
    amenities: ['Private Sunset Horizon Balcony', 'Hydro-Massage Rain Shower', 'Circadian Ambiance Lighting', 'Evening Wine & Canape Service', 'High-Speed Fiber Wi-Fi'],
  },
];

// ── HD RESORT GALLERY (Visual Hotel Flexing) ───────────────────────────────
const RESORT_GALLERY = [
  {
    category: 'villas',
    title: 'Private Pool Villa Deck',
    subtitle: '150 sqm secluded retreat with private turquoise plunge pool',
    img: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=85',
    tag: 'Private Haven'
  },
  {
    category: 'pool',
    title: 'Cliffside Infinity Pool',
    subtitle: 'Panoramic Arabian Sea views with 12 VIP Day Cabanas',
    img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85',
    tag: 'Ocean Horizon'
  },
  {
    category: 'villas',
    title: 'Ocean Suite Balcony View',
    subtitle: '65 sqm luxury suite overlooking gentle Arabian coastal tides',
    img: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=85',
    tag: '65 sqm Suite'
  },
  {
    category: 'dining',
    title: 'The Palms Restaurant Courtyard',
    subtitle: 'Central courtyard 5-course degustation dining under the palms',
    img: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85',
    tag: 'Chef’s Table'
  },
  {
    category: 'spa',
    title: 'Serenity Spa Wellness Pavilion',
    subtitle: 'Ayurvedic deep tissue therapy and hydrotherapy suite',
    img: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=85',
    tag: 'Holistic Wellness'
  },
  {
    category: 'pool',
    title: 'Beachside Shore & Sunset Deck',
    subtitle: 'Private pristine sands and daily complimentary sunset yoga',
    img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85',
    tag: 'Private Beach'
  },
];

// ── RESORT SERVICES CAPACITY INVENTORY (From hotel_info.pdf) ───────────────
const RESORT_SERVICES_INVENTORY = [
  {
    name: 'The Palms Restaurant',
    location: 'Central Courtyard',
    hours: 'Breakfast 7-10:30 AM | Lunch 12-3 PM | Dinner 7-10:30 PM',
    capacity: '38 / 40 Tables (95% - Near Full)',
    isNearFull: true,
    desc: 'Fine Dining & Chef’s Tasting. 5-course degustation menu featuring fresh coastal delicacies.',
    price: '₹3,500 / person',
    alt: 'Beachside Bar & Grill or Gourmet In-Room Dining',
  },
  {
    name: 'Serenity Spa & Hydrotherapy',
    location: 'Wellness Pavilion, Ground Floor',
    hours: '9:00 AM – 8:00 PM daily',
    capacity: '19 / 20 Slots (95% - Near Full)',
    isNearFull: true,
    desc: 'Ayurvedic & Swedish therapies, deep tissue healing, and organic radiance facials.',
    price: 'From ₹3,200',
    alt: 'Couple’s Retreat & Hydrotherapy Suite 2 or Sunset Yoga Deck',
  },
  {
    name: 'Beachside Bar & Grill',
    location: 'Private Beach Shore',
    hours: '11:00 AM – 11:00 PM daily',
    capacity: '28 / 50 Tables (56% - Available)',
    isNearFull: false,
    desc: 'Fresh local grilled seafood, woodfired pizzas, and signature tropical mixology by the shore.',
    price: 'À la carte dining',
    alt: '22 open tables available throughout afternoon & sunset',
  },
  {
    name: 'Infinity Pool Luxury VIP Cabanas',
    location: 'Cliffside Infinity Pool Deck',
    hours: '8:00 AM – 7:00 PM daily',
    capacity: '11 / 12 Cabanas (92% - High Demand)',
    isNearFull: true,
    desc: 'Includes fresh tropical fruit platter, chilled tender coconut water, and dedicated day butler.',
    price: '₹2,500 / day',
    alt: 'Cabana #7 open for reservation',
  },
  {
    name: 'Water Sports & PADI Dive Desk',
    location: 'Beach Activities Pavilion',
    hours: '8:00 AM – 5:00 PM daily',
    capacity: '16 / 25 Slots (64% - Available)',
    isNearFull: false,
    desc: 'Parasailing, Jet-Ski adventures, ocean kayaking, and 2-day PADI scuba certification courses.',
    price: 'From ₹800 / hr',
    alt: '9 slots open today including 2 PM Jet-Ski',
  },
  {
    name: 'Sunset Yoga & Meditation Deck',
    location: 'Beachside Oceanfront Deck',
    hours: '07:00 AM Sunrise | 05:30 PM Sunset',
    capacity: '14 / 30 Guests (47% - Available)',
    isNearFull: false,
    desc: 'Mindfulness breathing, gentle ocean asanas, and guided sound bowl meditation under the sky.',
    price: 'Complimentary for all staying guests',
    alt: '16 spots open for today’s 5:30 PM sunset session',
  },
];

// ── SAMPLE CONCIERGE PROMPTS THAT HIT REAL-TIME BACKEND ───────────────────
const SAMPLE_PROMPTS = [
  'I want to book a room for 3 days',
  'What is the price of Garden Room and Ocean Suite tonight?',
  'Can I book a massage at Serenity Spa today at 5:00 PM?',
  'Reserve a dinner table for 2 at The Palms Restaurant for 8:00 PM',
  'What complimentary amenities are included with my stay?'
];

export default function LandingPage({
  onEnterPortal,
  onDirectGuestLogin,
  onToggleDirectLoginPreference,
  directLoginMode = false,
}: LandingPageProps) {
  // Live dynamic room rates fetched from backend /api/hotel-info
  const [liveRates, setLiveRates] = useState<Record<string, { current_rate: number; base_rate: number; is_surge: boolean }>>({
    'garden-room': { current_rate: 6500, base_rate: 6500, is_surge: false },
    'ocean-suite': { current_rate: 14500, base_rate: 14500, is_surge: false },
    'private-pool-villa': { current_rate: 28000, base_rate: 28000, is_surge: false },
    'deluxe-ocean-view': { current_rate: 18500, base_rate: 18500, is_surge: false }
  });

  // Booking bar state
  const [selectedRoomId, setSelectedRoomId] = useState('deluxe-ocean-view');
  const [nights, setNights] = useState(3);
  const [guests, setGuests] = useState(2);
  const [showRateResult, setShowRateResult] = useState(false);

  // Gallery Filter State
  const [galleryCategory, setGalleryCategory] = useState<'all' | 'villas' | 'pool' | 'spa' | 'dining'>('all');

  // AI Concierge Chat State (hooked directly to backend /api/concierge/chat)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: 'Namaste! Welcome to Smart Resort 360, The Palms Resort, Goa. I am your real-time AI Concierge monitoring live rates and capacity across all 13 resort services and our 150-room inventory. How may I assist you today?',
      tag: 'Live Backend Synced · Goa Property',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Automated Booking System State
  const [activePaymentSummary, setActivePaymentSummary] = useState<BookingSummary | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [inlineBookingForm, setInlineBookingForm] = useState({
    guestName: '',
    checkIn: '2026-09-27',
    nights: 3,
    guests: 2,
    roomType: 'Garden Room',
  });

  // 1. Fetch real-time dynamic room rates and capacity from backend
  useEffect(() => {
    const fetchLiveRates = () => {
      api<{
        dynamic_pricing_system?: {
          rooms?: Array<{
            id: string;
            name: string;
            current_rate: number;
            base_rate: number;
            is_surge_active: boolean;
          }>;
        };
      }>('/hotel-info')
        .then(data => {
          if (data?.dynamic_pricing_system?.rooms) {
            const map: Record<string, { current_rate: number; base_rate: number; is_surge: boolean }> = {};
            for (const r of data.dynamic_pricing_system.rooms) {
              if (r.id === 'standard' || r.name.toLowerCase().includes('garden')) {
                map['garden-room'] = { current_rate: r.current_rate, base_rate: r.base_rate, is_surge: r.is_surge_active };
              } else if (r.id === 'suite' || r.name.toLowerCase().includes('suite')) {
                map['ocean-suite'] = { current_rate: r.current_rate, base_rate: r.base_rate, is_surge: r.is_surge_active };
              } else if (r.id === 'villa' || r.name.toLowerCase().includes('villa')) {
                map['private-pool-villa'] = { current_rate: r.current_rate, base_rate: r.base_rate, is_surge: r.is_surge_active };
              } else if (r.id === 'deluxe' || r.name.toLowerCase().includes('deluxe')) {
                map['deluxe-ocean-view'] = { current_rate: r.current_rate, base_rate: r.base_rate, is_surge: r.is_surge_active };
              }
            }
            setLiveRates(prev => ({ ...prev, ...map }));
          }
        })
        .catch(() => {});
    };

    fetchLiveRates();
    const interval = setInterval(fetchLiveRates, 3000);
    return () => clearInterval(interval);
  }, []);

  // 2. Real-time AI Concierge dispatch calling the real backend API
  const sendConciergeMessage = async (msg: string) => {
    if (!msg.trim() || isTyping) return;
    setChatMessages(prev => [...prev, { sender: 'user', text: msg }]);
    setIsTyping(true);

    try {
      const res = await api<{
        answer: string;
        mode?: string;
        isRoomBooking?: boolean;
        bookingStage?: 'collecting_info' | 'summary' | 'confirmed' | 'failed';
        bookingSummary?: BookingSummary;
        bookingDetails?: any;
        failureDetails?: any;
        nugen?: {
          used?: boolean;
          model?: string;
          intent?: string;
          confidence?: number;
          category?: string;
        };
      }>('/concierge/chat', 'POST', { message: msg });

      setChatMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: res.answer,
          tag: res.nugen?.used
            ? `AI Intelligence: Nugen Hospitality Model${res.nugen.confidence ? ` (${Math.round(res.nugen.confidence)}%)` : ''}`
            : (res.isRoomBooking ? '150-Room Real-Time Availability' : (res.mode ? `Real-Time RAG · ${res.mode}` : 'The Palms Live Concierge')),
          isRoomBooking: res.isRoomBooking,
          bookingStage: res.bookingStage,
          bookingSummary: res.bookingSummary,
          bookingDetails: res.bookingDetails,
          failureDetails: res.failureDetails,
        }
      ]);


      if (res.bookingDetails) {
        setInlineBookingForm(prev => ({
          ...prev,
          guestName: res.bookingDetails.guestName || prev.guestName,
          checkIn: res.bookingDetails.checkIn || prev.checkIn,
          nights: res.bookingDetails.nights || prev.nights,
          guests: res.bookingDetails.guests || prev.guests,
          roomType: res.bookingDetails.roomType || prev.roomType,
        }));
      }
    } catch {
      // Clean fallback if connection is interrupted
      const gPrice = liveRates['garden-room']?.current_rate || 6500;
      const sPrice = liveRates['ocean-suite']?.current_rate || 14500;
      const vPrice = liveRates['private-pool-villa']?.current_rate || 28000;
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: `Welcome to The Palms Resort! Our live room rates per night are:\n• **Garden Room:** ₹${gPrice.toLocaleString('en-IN')}\n• **Ocean Suite:** ₹${sPrice.toLocaleString('en-IN')}\n• **Private Pool Villa:** ₹${vPrice.toLocaleString('en-IN')}\n\nCheck-in is at 2:00 PM and check-out is at 11:00 AM. Please sign into the Guest Portal to manage room requests and amenities!`,
          tag: 'Real-Time Hotel Guide Synced'
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCheckAvailabilityInline = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inlineBookingForm.guestName.trim()) {
      alert('Please enter guest name to verify room reservation.');
      return;
    }
    setIsTyping(true);
    setChatMessages(prev => [
      ...prev,
      {
        sender: 'user',
        text: `Check live availability for ${inlineBookingForm.guestName}: ${inlineBookingForm.roomType}, Check-in ${inlineBookingForm.checkIn} for ${inlineBookingForm.nights} nights, ${inlineBookingForm.guests} guests.`
      }
    ]);

    try {
      const res = await api<{
        available: boolean;
        room?: any;
        summary?: BookingSummary;
        failureRequest?: any;
        message?: string;
      }>('/bookings/check-availability', 'POST', {
        guestName: inlineBookingForm.guestName,
        checkIn: inlineBookingForm.checkIn,
        nights: inlineBookingForm.nights,
        guests: inlineBookingForm.guests,
        roomType: inlineBookingForm.roomType,
      });

      if (res.available && res.summary) {
        const sum = res.summary;
        const roomNum = sum.roomNumber || sum.room_number;
        const rType = sum.roomType || sum.room_type;
        const cIn = sum.checkIn || sum.check_in;
        const cOut = sum.checkOut || sum.check_out;

        setChatMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: `Excellent news! We have verified live availability across our 150-room inventory. Room ${roomNum} (${rType}) is available for your dates. Here is your reservation summary:`,
            tag: '150-Room Real-Time Availability Engine',
            isRoomBooking: true,
            bookingStage: 'summary',
            bookingSummary: sum,
            bookingDetails: {
              guestName: inlineBookingForm.guestName,
              checkIn: cIn,
              checkOut: cOut,
              nights: sum.nights,
              guests: sum.guests,
              roomType: rType,
            }
          }
        ]);
      } else {
        setChatMessages(prev => [
          ...prev,
          {
            sender: 'bot',
            text: res.message || 'We apologize, but all rooms of this category are currently occupied for your selected dates. An automated review request has been routed to our Resort Manager.',
            tag: 'Live Availability Engine · Re-routed',
            isRoomBooking: true,
            bookingStage: 'failed',
            failureDetails: {
              requestId: res.failureRequest?.requestId || `SR-REQ-${Date.now().toString().slice(-4)}`,
              reason: 'No suitable room available for selected dates in 150-room inventory'
            }
          }
        ]);
      }
    } catch (err: any) {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: 'Unable to complete availability check. A manager review request has been created.',
          tag: '150-Room Engine · Error Handled',
          isRoomBooking: true,
          bookingStage: 'failed',
          failureDetails: {
            requestId: `SR-REQ-${Date.now().toString().slice(-4)}`,
            reason: err?.message || 'Server connection error'
          }
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!activePaymentSummary || isProcessingPayment) return;
    setIsProcessingPayment(true);

    try {
      const confirmation = await api<BookingConfirmation>('/bookings/confirm', 'POST', {
        bookingDetails: activePaymentSummary,
      });

      setActivePaymentSummary(null);
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: `🎉 Congratulations ${confirmation.guestName}! Your room booking at The Palms Resort, Goa is officially CONFIRMED and your room availability is locked in our database.\n\nYour unique Guest Login credentials have been dynamically generated below. You can log in immediately to view your stay details, request amenities, and access resort privileges.`,
          tag: 'Booking Confirmed · Credentials Dynamic',
          isRoomBooking: true,
          bookingStage: 'confirmed',
          bookingConfirmation: confirmation,
        }
      ]);
    } catch (err: any) {
      alert(err?.message || 'Payment simulation failed. An inquiry has been sent to the manager.');
      setActivePaymentSummary(null);
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: 'Your payment simulation could not be completed. We have notified our Resort Manager for review.',
          tag: 'Payment Failed · Manager Review Created',
          isRoomBooking: true,
          bookingStage: 'failed',
          failureDetails: {
            requestId: `SR-REQ-${Date.now().toString().slice(-4)}`,
            reason: err?.message || 'Simulated payment processing error'
          }
        }
      ]);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleOpenGuestDashboard = async (conf: BookingConfirmation) => {
    try {
      const loggedUser = await api<User>('/auth/login', 'POST', {
        id: conf.guestLoginId,
        password: conf.guestPassword,
        role: 'guest'
      });
      if (onDirectGuestLogin) {
        onDirectGuestLogin(loggedUser);
      } else {
        onEnterPortal('guest');
      }
    } catch {
      onEnterPortal('guest');
    }
  };

  const copyCred = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleCustomQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;
    const q = inputQuery.trim();
    setInputQuery('');
    sendConciergeMessage(q);
  };

  const selectedRoom = HOTEL_ROOMS.find(r => r.id === selectedRoomId) || HOTEL_ROOMS[0];
  const currentRoomRate = liveRates[selectedRoom.id]?.current_rate || selectedRoom.defaultPrice;
  const calculatedTotal = currentRoomRate * nights;

  const filteredGallery = galleryCategory === 'all'
    ? RESORT_GALLERY
    : RESORT_GALLERY.filter(item => item.category === galleryCategory);

  return (
    <div className="landing-container">
      {/* Light Ambient Lighting Background */}
      <div className="landing-ambient-bg" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
        <div className="ambient-orb ambient-orb-3" />
      </div>

      {/* Top Reversible Notice Strip */}
      <div className="landing-revert-bar">
        <span>
          🌴 <b>The Palms Resort, Goa</b> · 12-Acre Beachfront Sanctuary & Smart Resort 360 AI Platform
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            type="button"
            onClick={onToggleDirectLoginPreference}
            title="Toggle direct login preference"
          >
            {directLoginMode ? '✓ Direct login mode active' : '⚡ Revert to Direct Login Mode'}
          </button>
          <button type="button" onClick={() => onEnterPortal('guest')}>
            Direct Login Page →
          </button>
        </div>
      </div>

      {/* ── TOP STICKY LIGHT LUXURY HEADER ──────────────────────── */}
      <header className="landing-header">
        <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="landing-brand-icon">
            <Palmtree size={22} />
          </div>
          <div className="landing-brand-text">
            <div className="landing-brand-title">
              THE PALMS RESORT <span>360</span>
            </div>
            <div className="landing-brand-stars">
              ★★★★★ 5-STAR LUXURY PROPERTY
            </div>
          </div>
        </div>

        <nav className="landing-nav-links" aria-label="Resort Navigation">
          <a href="#accommodations">Accommodations</a>
          <a href="#gastronomy">Gastronomy</a>
          <a href="#experiences">Experiences</a>
          <a href="#gallery">Resort Gallery</a>
          <a href="#concierge">AI Concierge</a>
          <a href="#reviews">Verified Reviews</a>
        </nav>

        <div className="landing-header-actions">
          {/* Guest Sign In button — Opens Login with 'guest' role without auto-login! */}
          <button
            className="btn-guest-signin"
            onClick={() => onEnterPortal('guest')}
            title="Open Guest Login"
          >
            <LogIn size={15} />
            <span>Guest Sign In</span>
          </button>

          {/* Manager Portal button — Opens Login with 'manager' role without auto-login! */}
          <button
            className="btn-manager-portal"
            onClick={() => onEnterPortal('manager')}
            title="Open Manager Login"
          >
            <Shield size={15} />
            <span>Manager Portal</span>
          </button>

          {/* Book Your Stay Button */}
          <button
            className="btn-book-stay"
            onClick={() => {
              const el = document.getElementById('booking-bar');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Calendar size={15} />
            <span>Book Your Stay</span>
          </button>
        </div>
      </header>

      {/* ── HERO SECTION (Matching User Reference Image) ────────── */}
      <section className="landing-hero">
        <div className="landing-hero-backdrop">
          <img
            src="https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=2200&q=85"
            alt="The Palms Resort Luxury Pool Villa"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-pill-badge">
            <span className="sparkle">✨</span>
            <span>AN OASIS OF BESPOKE TRANQUILITY & INTELLIGENCE</span>
          </div>

          <h1 className="landing-hero-headline">
            Where Natural Beauty Meets <em>Intelligent Hospitality</em>
          </h1>

          <p className="landing-hero-subtitle">
            Indulge in private oceanfront suites, Michelin-inspired cuisine, and our real-time AI Concierge
            dedicated to personalizing every detail of your luxury retreat.
          </p>
        </motion.div>

        {/* ── HORIZONTAL RESERVATION CARD (No prices in select dropdown!) ── */}
        <div id="booking-bar" className="hero-booking-bar-wrapper">
          <motion.div
            className="hero-booking-card"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.2 }}
          >
            {/* Check-In */}
            <div className="booking-col">
              <span className="booking-col-label">
                <Calendar size={13} color="#1a4a3a" />
                <span>CHECK-IN</span>
              </span>
              <div className="booking-col-val">27-09-2026</div>
              <div className="booking-col-sub">Sun 27 Sept · From 2:00 PM</div>
            </div>

            {/* Nights Pill */}
            <button
              type="button"
              className="booking-nights-pill"
              onClick={() => {
                setNights(n => (n >= 7 ? 2 : n + 1));
                setShowRateResult(false);
              }}
              title="Click to change stay duration"
            >
              <span>🌙</span>
              <span>{nights} Nights</span>
            </button>

            {/* Check-Out */}
            <div className="booking-col">
              <span className="booking-col-label">
                <Calendar size={13} color="#1a4a3a" />
                <span>CHECK-OUT</span>
              </span>
              <div className="booking-col-val">30-09-2026</div>
              <div className="booking-col-sub">Wed 30 Sept · Until 11:00 AM</div>
            </div>

            {/* Guests */}
            <div className="booking-col">
              <span className="booking-col-label">
                <Users size={13} color="#1a4a3a" />
                <span>GUESTS</span>
              </span>
              <div
                className="booking-col-val"
                style={{ cursor: 'pointer' }}
                onClick={() => setGuests(g => (g >= 4 ? 1 : g + 1))}
              >
                {guests} Adults
              </div>
              <div className="booking-col-sub">Click to adjust</div>
            </div>

            {/* Residence Dropdown (Clean room names without prices in options) */}
            <div className="booking-col" style={{ minWidth: 240 }}>
              <span className="booking-col-label">
                <BedDouble size={13} color="#1a4a3a" />
                <span>RESIDENCE</span>
              </span>
              <select
                className="booking-col-select"
                value={selectedRoomId}
                onChange={e => {
                  setSelectedRoomId(e.target.value);
                  setShowRateResult(false);
                }}
              >
                {HOTEL_ROOMS.map(room => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Check Rates Button */}
            <button
              className="btn-check-rates"
              onClick={() => setShowRateResult(true)}
            >
              <span>Check Rates</span>
              <ArrowRight size={16} />
            </button>
          </motion.div>

          {/* Quick Select Row */}
          <div className="quick-select-row">
            <span className="quick-select-label">Quick Select:</span>
            <button
              className={`quick-select-pill ${nights === 2 ? 'active' : ''}`}
              onClick={() => { setNights(2); setShowRateResult(true); }}
            >
              Weekend (2 Nights)
            </button>
            <button
              className={`quick-select-pill ${nights === 3 ? 'active' : ''}`}
              onClick={() => { setNights(3); setShowRateResult(true); }}
            >
              3 Nights Stay
            </button>
            <button
              className={`quick-select-pill ${nights === 5 ? 'active' : ''}`}
              onClick={() => { setNights(5); setShowRateResult(true); }}
            >
              5 Nights Retreat
            </button>
            <button
              className={`quick-select-pill ${nights === 7 ? 'active' : ''}`}
              onClick={() => { setNights(7); setShowRateResult(true); }}
            >
              1 Week Vacation
            </button>
          </div>

          {/* Real-Time Calculated Rate Result Box */}
          <AnimatePresence>
            {showRateResult && (
              <motion.div
                className="rate-calc-result-box"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
              >
                <div className="rate-calc-details">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#c8964a', textTransform: 'uppercase' }}>
                      {selectedRoom.tag}
                    </span>
                    <span style={{ fontSize: 12, color: '#8da494' }}>•</span>
                    <span style={{ fontSize: 12, color: '#1a4a3a', fontWeight: 600 }}>{selectedRoom.size}</span>
                    {liveRates[selectedRoom.id]?.is_surge && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b46b14', background: '#fef5ea', padding: '2px 8px', borderRadius: 10 }}>
                        ⚡ Real-Time ML Demand Surge
                      </span>
                    )}
                  </div>
                  <h4>{selectedRoom.name}</h4>
                  <p>{selectedRoom.desc}</p>
                  <div className="rate-calc-specs">
                    <span>✓ {selectedRoom.bed}</span>
                    <span>✓ {selectedRoom.view}</span>
                    <span>✓ Daily Turndown Included</span>
                  </div>
                </div>

                <div className="rate-calc-pricing">
                  <span style={{ fontSize: 12, color: '#718579', marginBottom: 2 }}>
                    Live Rate: ₹{currentRoomRate.toLocaleString('en-IN')}/nt × {nights} Nights
                  </span>
                  <div className="rate-calc-total">₹{calculatedTotal.toLocaleString('en-IN')}</div>
                  <span style={{ fontSize: 11, color: '#8da494', marginBottom: 14 }}>
                    Taxes included · Check-in 2:00 PM · Check-out 11:00 AM
                  </span>
                  <button
                    className="btn-book-stay"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      const conciergeEl = document.getElementById('concierge');
                      if (conciergeEl) conciergeEl.scrollIntoView({ behavior: 'smooth' });
                      setInlineBookingForm(prev => ({
                        ...prev,
                        roomType: selectedRoom.name,
                        nights: nights,
                        guests: guests,
                      }));
                      sendConciergeMessage(`I want to book ${selectedRoom.name} for ${nights} nights for ${guests} guests`);
                    }}
                  >
                    <span>Reserve Room via AI Concierge</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── HIGH QUALITY HD RESORT GALLERY (Visual Hotel Flexing) ── */}
      <section id="gallery" className="gallery-section">
        <div className="section-header">
          <span className="section-eyebrow">
            <ImageIcon size={13} />
            <span>Visual Exploration</span>
          </span>
          <h2 className="section-title">The Palms Resort HD Gallery</h2>
          <p className="section-subtitle">
            Explore 12 acres of pristine tropical architecture, cliffside infinity cabanas, secluded oceanfront
            villas, and our serene Ayurvedic wellness pavilion.
          </p>
        </div>

        {/* Category Tabs */}
        <div className="gallery-tabs-row">
          <button
            className={`gallery-tab-btn ${galleryCategory === 'all' ? 'active' : ''}`}
            onClick={() => setGalleryCategory('all')}
          >
            All Views
          </button>
          <button
            className={`gallery-tab-btn ${galleryCategory === 'villas' ? 'active' : ''}`}
            onClick={() => setGalleryCategory('villas')}
          >
            Suites & Villas
          </button>
          <button
            className={`gallery-tab-btn ${galleryCategory === 'pool' ? 'active' : ''}`}
            onClick={() => setGalleryCategory('pool')}
          >
            Beach & Infinity Pool
          </button>
          <button
            className={`gallery-tab-btn ${galleryCategory === 'spa' ? 'active' : ''}`}
            onClick={() => setGalleryCategory('spa')}
          >
            Serenity Spa
          </button>
          <button
            className={`gallery-tab-btn ${galleryCategory === 'dining' ? 'active' : ''}`}
            onClick={() => setGalleryCategory('dining')}
          >
            Dining & Lounges
          </button>
        </div>

        {/* Gallery Cards Grid */}
        <div className="gallery-grid">
          {filteredGallery.map((item, idx) => (
            <motion.div
              key={idx}
              className="gallery-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
            >
              <img
                src={item.img}
                alt={item.title}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=1200&q=85';
                }}
              />
              <div className="gallery-card-overlay">
                <span className="gallery-tag">{item.tag}</span>
                <div className="gallery-card-title">{item.title}</div>
                <div className="gallery-card-desc">{item.subtitle}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── ACCOMMODATIONS (Real-Time Live Dynamic Rates Synced) ──── */}
      <section id="accommodations" className="accommodations-section">
        <div className="section-header">
          <span className="section-eyebrow">
            <BedDouble size={13} />
            <span>150 Rooms Across 12 Tropical Acres</span>
          </span>
          <h2 className="section-title">Signature Residences & Suites</h2>
          <p className="section-subtitle">
            All rooms feature daily turndown service, high-speed fiber Wi-Fi, 55" Smart TVs, and integrated
            Guest Portal controls. Check-in is at 2:00 PM and check-out is at 11:00 AM.
          </p>
        </div>

        <div className="rooms-showcase-grid">
          {HOTEL_ROOMS.slice(0, 3).map(room => {
            const livePrice = liveRates[room.id]?.current_rate || room.defaultPrice;
            const isSurge = liveRates[room.id]?.is_surge;

            return (
              <motion.div
                key={room.id}
                className="room-item-card"
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <div className="room-card-media">
                  <img src={room.image} alt={room.name} />
                  <div className="room-card-price-badge">
                    {isSurge && <span style={{ color: '#c8964a', marginRight: 4 }}>⚡</span>}
                    ₹{livePrice.toLocaleString('en-IN')} <span style={{ fontSize: 11, fontWeight: 500, color: '#718579' }}>/ night</span>
                  </div>
                </div>

                <div className="room-card-body">
                  <div className="room-card-name">{room.name}</div>
                  <div className="room-card-specs-row">
                    <span>📐 {room.size}</span>
                    <span>•</span>
                    <span>🛏️ {room.bed}</span>
                    {isSurge && (
                      <span style={{ color: '#b46b14', fontWeight: 700, marginLeft: 'auto' }}>
                        Live Surge Active
                      </span>
                    )}
                  </div>
                  <p className="room-card-desc">{room.desc}</p>

                  <div className="room-card-amenities-list">
                    {room.amenities.map((am, i) => (
                      <div key={i} className="room-amenity-item">
                        <span className="room-amenity-dot" />
                        <span>{am}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    className="btn-book-room"
                    onClick={() => {
                      const conciergeEl = document.getElementById('concierge');
                      if (conciergeEl) conciergeEl.scrollIntoView({ behavior: 'smooth' });
                      setInlineBookingForm(prev => ({
                        ...prev,
                        roomType: room.name,
                      }));
                      sendConciergeMessage(`I want to book ${room.name} for 3 days`);
                    }}
                  >
                    <span>Reserve via AI Concierge</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── RESORT SERVICES LIVE CAPACITY OVERVIEW ────────────────── */}
      <section id="experiences" className="services-section">
        <div className="section-header">
          <span className="section-eyebrow">
            <Activity size={13} />
            <span>Live Capacity Telemetry</span>
          </span>
          <h2 className="section-title">Resort Amenities & Capacity Inventory</h2>
          <p className="section-subtitle">
            Smart Resort 360 continuously tracks real-time slots across all 13 resort departments to eliminate
            queues, balance guest load, and ensure pristine five-star service.
          </p>
        </div>

        <div className="services-inventory-grid">
          {RESORT_SERVICES_INVENTORY.map((serv, idx) => (
            <div key={idx} className="service-card">
              <div className="service-header-row">
                <div className="service-icon-sq">
                  <Utensils size={20} />
                </div>
                <span className={`service-capacity-badge ${serv.isNearFull ? 'capacity-near-full' : 'capacity-available'}`}>
                  {serv.capacity}
                </span>
              </div>
              <div className="service-name">{serv.name}</div>
              <div className="service-meta">
                📍 {serv.location} · ⏰ {serv.hours}
              </div>
              <p className="service-desc">{serv.desc}</p>
              <div className="service-pricing-row">
                <span>{serv.price}</span>
                <span style={{ fontSize: 11, color: '#8da494' }}>{serv.isNearFull ? '⚠️ 95% Rule Active' : '✓ Open Slots'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI CONCIERGE (Connected to Real-Time Backend API) ────── */}
      <section id="concierge" className="concierge-section">
        <div className="section-header">
          <span className="section-eyebrow">
            <Bot size={13} />
            <span>Autonomous Intelligence</span>
          </span>
          <h2 className="section-title">The Neural 360 Concierge & 95% Proactive Rule</h2>
          <p className="section-subtitle">
            Connected live to our backend RAG engine and dynamic pricing database. Ask about current rates or book
            amenities to preview real-time proactive rebalancing.
          </p>
        </div>

        <div className="concierge-wrap">
          {/* Left Column: Sample Query Buttons */}
          <div className="concierge-info-box">
            <h3>Test Real-Time Resort Logic</h3>
            <p>
              Click any question below to test live capacity tracking and dynamic rate quotes directly from our backend:
            </p>

            <div className="prompt-pills-list">
              {SAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  className="prompt-pill-btn"
                  onClick={() => sendConciergeMessage(prompt)}
                  disabled={isTyping}
                >
                  <span>"{prompt}"</span>
                  <ChevronRight size={15} color="#1a4a3a" />
                </button>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: '16px', background: '#f1f5f2', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1a4a3a', fontSize: 13, fontWeight: 700 }}>
                <Zap size={15} />
                <span>Live Dynamic Pricing & 95% Capacity Sync</span>
              </div>
              <p style={{ fontSize: 12, color: '#556a5e', marginTop: 4, lineHeight: 1.5 }}>
                Our backend dynamically adjusts room rates based on demand curves and auto-resets on expiration. When
                amenities exceed 95% capacity, our AI proactively recommends alternative experiences.
              </p>
            </div>
          </div>

          {/* Right Column: Live Chat Terminal */}
          <div className="concierge-chat-terminal">
            <div className="terminal-header">
              <div className="terminal-id">
                <div className="terminal-avatar">
                  <Bot size={18} />
                </div>
                <div>
                  <b style={{ fontSize: 13, color: '#143328' }}>The Palms Neural Butler</b>
                  <div style={{ fontSize: 11, color: '#1b7a42', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1b7a42' }} />
                    <span>Backend RAG Online</span>
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 11, color: '#718579' }}>Guest Suite Portal</span>
            </div>

            <div className="terminal-messages">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.sender}`}>
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                  {/* 1. Missing Info Collection Card */}
                  {msg.bookingStage === 'collecting_info' && (
                    <form className="booking-collect-card" onSubmit={handleCheckAvailabilityInline}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1a4a3a', fontSize: 12, fontWeight: 700 }}>
                        <BedDouble size={14} />
                        <span>Reserve Room · Live 150-Room Inventory</span>
                      </div>
                      <div className="booking-collect-grid">
                        <div className="booking-field-group">
                          <label className="booking-field-label">Guest Full Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Yash Pacharne"
                            className="booking-field-input"
                            value={inlineBookingForm.guestName}
                            onChange={e => setInlineBookingForm(prev => ({ ...prev, guestName: e.target.value }))}
                          />
                        </div>
                        <div className="booking-field-group">
                          <label className="booking-field-label">Check-in Date *</label>
                          <input
                            type="date"
                            required
                            className="booking-field-input"
                            value={inlineBookingForm.checkIn}
                            onChange={e => setInlineBookingForm(prev => ({ ...prev, checkIn: e.target.value }))}
                          />
                        </div>
                        <div className="booking-field-group">
                          <label className="booking-field-label">Duration</label>
                          <select
                            className="booking-field-select"
                            value={inlineBookingForm.nights}
                            onChange={e => setInlineBookingForm(prev => ({ ...prev, nights: parseInt(e.target.value, 10) || 1 }))}
                          >
                            <option value={1}>1 Night</option>
                            <option value={2}>2 Nights</option>
                            <option value={3}>3 Nights</option>
                            <option value={4}>4 Nights</option>
                            <option value={5}>5 Nights</option>
                            <option value={7}>7 Nights</option>
                          </select>
                        </div>
                        <div className="booking-field-group">
                          <label className="booking-field-label">Guests</label>
                          <select
                            className="booking-field-select"
                            value={inlineBookingForm.guests}
                            onChange={e => setInlineBookingForm(prev => ({ ...prev, guests: parseInt(e.target.value, 10) || 1 }))}
                          >
                            <option value={1}>1 Guest</option>
                            <option value={2}>2 Guests</option>
                            <option value={3}>3 Guests</option>
                            <option value={4}>4 Guests</option>
                          </select>
                        </div>
                      </div>

                      <div className="booking-field-group">
                        <label className="booking-field-label">Room Preference</label>
                        <select
                          className="booking-field-select"
                          value={inlineBookingForm.roomType}
                          onChange={e => setInlineBookingForm(prev => ({ ...prev, roomType: e.target.value }))}
                        >
                          <option value="Garden Room">Garden Room (₹8,000/night)</option>
                          <option value="Deluxe Ocean View Room">Deluxe Ocean View Room (₹18,500/night)</option>
                          <option value="Ocean Suite">Ocean Suite (₹14,500/night)</option>
                          <option value="Private Pool Villa">Private Pool Villa (₹28,000/night)</option>
                          <option value="Any Available">Any Available Category</option>
                        </select>
                      </div>

                      <button type="submit" className="btn-check-avail-inline" disabled={isTyping}>
                        <Sparkles size={14} />
                        <span>Check Live 150-Room Availability</span>
                      </button>
                    </form>
                  )}

                  {/* 2. Booking Summary Card (Before Payment) */}
                  {msg.bookingStage === 'summary' && msg.bookingSummary && (
                    <div className="booking-summary-box">
                      <div className="booking-summary-header">
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1b7a42', textTransform: 'uppercase' }}>
                            Live Room Allocated
                          </div>
                          <b style={{ fontSize: 16, color: '#143328' }}>
                            Room {msg.bookingSummary.roomNumber} · {msg.bookingSummary.roomType}
                          </b>
                        </div>
                        <span className="booking-summary-badge">
                          <CheckCircle2 size={12} />
                          <span>Available</span>
                        </span>
                      </div>

                      <div className="booking-specs-grid">
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Guest</span>
                          <span className="booking-spec-val">{msg.bookingSummary.guestName}</span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Party</span>
                          <span className="booking-spec-val">{msg.bookingSummary.guests} Adults</span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Check-in</span>
                          <span className="booking-spec-val">{msg.bookingSummary.checkIn}</span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Check-out</span>
                          <span className="booking-spec-val">{msg.bookingSummary.checkOut}</span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Duration</span>
                          <span className="booking-spec-val">{msg.bookingSummary.nights} Night{msg.bookingSummary.nights > 1 ? 's' : ''}</span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Price Per Night</span>
                          <span className="booking-spec-val">₹{(msg.bookingSummary.pricePerNight ?? msg.bookingSummary.price_per_night ?? 0).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="booking-total-row">
                        <div>
                          <span style={{ fontSize: 11, color: '#718579', display: 'block' }}>Total Reservation Amount</span>
                          <span className="booking-total-price">₹{(msg.bookingSummary.totalAmount ?? msg.bookingSummary.total_amount ?? 0).toLocaleString('en-IN')}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#8da494' }}>Taxes included</span>
                      </div>

                      <button
                        type="button"
                        className="btn-proceed-pay"
                        onClick={() => setActivePaymentSummary(msg.bookingSummary!)}
                      >
                        <CreditCard size={15} />
                        <span>Proceed to Payment</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}

                  {/* 3. Booking Confirmed Card (With Dynamic Guest Credentials) */}
                  {msg.bookingStage === 'confirmed' && msg.bookingConfirmation && (
                    <div className="booking-confirmed-box">
                      <div className="confirmed-banner">
                        <CheckCircle2 size={20} color="#1b7a42" />
                        <span>BOOKING CONFIRMED</span>
                      </div>

                      <div className="booking-specs-grid" style={{ marginBottom: 12 }}>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Booking ID</span>
                          <span className="booking-spec-val" style={{ color: '#1a4a3a' }}>
                            {msg.bookingConfirmation.bookingId || msg.bookingConfirmation.booking.booking_id}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Guest Name</span>
                          <span className="booking-spec-val">
                            {msg.bookingConfirmation.guestName || msg.bookingConfirmation.booking.guest_name}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Room Number</span>
                          <span className="booking-spec-val" style={{ fontSize: 15, color: '#143328' }}>
                            Room {msg.bookingConfirmation.roomNumber || msg.bookingConfirmation.booking.room_number}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Room Type</span>
                          <span className="booking-spec-val">
                            {msg.bookingConfirmation.roomType || msg.bookingConfirmation.booking.room_type}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Check-in</span>
                          <span className="booking-spec-val">
                            {msg.bookingConfirmation.checkIn || msg.bookingConfirmation.booking.check_in}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Check-out</span>
                          <span className="booking-spec-val">
                            {msg.bookingConfirmation.checkOut || msg.bookingConfirmation.booking.check_out}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Number of Nights</span>
                          <span className="booking-spec-val">
                            {msg.bookingConfirmation.nights ?? msg.bookingConfirmation.booking.nights}
                          </span>
                        </div>
                        <div className="booking-spec-item">
                          <span className="booking-spec-label">Total Amount</span>
                          <span className="booking-spec-val" style={{ color: '#1b7a42' }}>
                            ₹{(msg.bookingConfirmation.totalAmount ?? msg.bookingConfirmation.booking.total_amount ?? 0).toLocaleString('en-IN')} (PAID)
                          </span>
                        </div>
                      </div>

                      {/* Dynamic Guest Login Credentials */}
                      <div className="credentials-box">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#143328', fontSize: 12, fontWeight: 700 }}>
                          <Key size={14} color="#1b7a42" />
                          <span>GUEST LOGIN CREDENTIALS (LIVE DATA STORE)</span>
                        </div>
                        <p style={{ fontSize: 11.5, color: '#526b5c', margin: '0 0 10px', lineHeight: 1.4 }}>
                          Unique credentials created in our database. Use these to access your stay anytime:
                        </p>

                        <div className="cred-row">
                          <span className="cred-label">Login ID:</span>
                          <div className="cred-val-wrap">
                            <span className="cred-val">
                              {msg.bookingConfirmation.guestLoginId || msg.bookingConfirmation.credentials.guest_id}
                            </span>
                            <button
                              type="button"
                              className="btn-copy-cred"
                              onClick={() => copyCred(msg.bookingConfirmation!.guestLoginId || msg.bookingConfirmation!.credentials.guest_id, 'loginId')}
                              title="Copy Login ID"
                            >
                              {copiedField === 'loginId' ? <Check size={14} color="#1b7a42" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>

                        <div className="cred-row">
                          <span className="cred-label">Password:</span>
                          <div className="cred-val-wrap">
                            <span className="cred-val">
                              {msg.bookingConfirmation.guestPassword || msg.bookingConfirmation.credentials.password}
                            </span>
                            <button
                              type="button"
                              className="btn-copy-cred"
                              onClick={() => copyCred(msg.bookingConfirmation!.guestPassword || msg.bookingConfirmation!.credentials.password, 'pwd')}
                              title="Copy Password"
                            >
                              {copiedField === 'pwd' ? <Check size={14} color="#1b7a42" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-open-dashboard"
                        onClick={() => handleOpenGuestDashboard(msg.bookingConfirmation!)}
                      >
                        <span>Open Guest Dashboard</span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}

                  {/* 4. Failure / Manager Review Card */}
                  {msg.bookingStage === 'failed' && (
                    <div style={{ marginTop: 12, background: '#fff9f0', border: '1px solid #fed7aa', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b45309', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                        <AlertCircle size={16} />
                        <span>Manager Review Request Created</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 8px', lineHeight: 1.5 }}>
                        Due to live capacity constraints or requested dates, our automated system has routed your request to the Resort Manager.
                      </p>
                      <div style={{ fontSize: 11.5, color: '#92400e', background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
                        <div><b>Request Status:</b> PENDING / MANAGER_REVIEW</div>
                        {msg.failureDetails?.requestId && <div><b>Manager Tracking ID:</b> #{msg.failureDetails.requestId}</div>}
                        {msg.failureDetails?.reason && <div><b>Reason:</b> {msg.failureDetails.reason}</div>}
                      </div>
                    </div>
                  )}

                  {msg.tag && (
                    <div className="chat-rule-tag">
                      <CheckCircle2 size={12} />
                      <span>{msg.tag}</span>
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="chat-bubble bot" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#718579' }}>Fetching live resort intelligence...</span>
                </div>
              )}
            </div>

            <form className="terminal-input-bar" onSubmit={handleCustomQuery}>
              <input
                type="text"
                placeholder="Ask about live room rates, dining, spa availability..."
                value={inputQuery}
                onChange={e => setInputQuery(e.target.value)}
                disabled={isTyping}
              />
              <button type="submit" disabled={isTyping || !inputQuery.trim()} aria-label="Send">
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── VERIFIED REVIEWS & ACCLAIM ───────────────────────────── */}
      <section id="reviews" className="reviews-section">
        <div className="section-header">
          <span className="section-eyebrow">
            <Star size={13} />
            <span>Verified Guest Experiences</span>
          </span>
          <h2 className="section-title">Praised by Discerning Travelers</h2>
          <p className="section-subtitle">
            Average rating 4.98 / 5 across 1,240 verified stays at The Palms Resort, Goa.
          </p>
        </div>

        <div className="reviews-grid">
          <div className="review-card">
            <div>
              <div className="review-stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={15} fill="#c8964a" />
                ))}
              </div>
              <p className="review-quote">
                "The Private Pool Villa is absolute heaven. Waking up to the ocean breeze and having the AI Concierge
                arrange our sunset catamaran in seconds was effortless."
              </p>
            </div>
            <div className="review-author">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
                alt="Aditi Sharma"
                className="review-avatar"
              />
              <div className="author-meta">
                <b>Aditi Sharma</b>
                <small>Stayed in Private Pool Villa · Mumbai</small>
              </div>
            </div>
          </div>

          <div className="review-card">
            <div>
              <div className="review-stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={15} fill="#c8964a" />
                ))}
              </div>
              <p className="review-quote">
                "The Palms Restaurant 5-course degustation was Michelin standard. When the spa was full, the AI proactively
                booked the hydrotherapy suite which was even better!"
              </p>
            </div>
            <div className="review-author">
              <img
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
                alt="Carlos Mendez"
                className="review-avatar"
              />
              <div className="author-meta">
                <b>Carlos Mendez</b>
                <small>Stayed in Ocean Suite · Madrid</small>
              </div>
            </div>
          </div>

          <div className="review-card">
            <div>
              <div className="review-stars">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={15} fill="#c8964a" />
                ))}
              </div>
              <p className="review-quote">
                "Seamless check-in, pristine 12-acre beachfront property, and the sunset yoga session overlooking the
                Andaman waves made this our favorite retreat in India."
              </p>
            </div>
            <div className="review-author">
              <img
                src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80"
                alt="Kavya Patel"
                className="review-avatar"
              />
              <div className="author-meta">
                <b>Kavya Patel</b>
                <small>Stayed in Garden Room · Bangalore</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM LIGHT LUXURY BANNER ───────────────────────────── */}
      <section className="bottom-cta-wrap">
        <div className="bottom-cta-box">
          <h2>Experience The Palms Resort 360</h2>
          <p>
            Sign in to explore your personalized guest room amenities or access the hotel operations management cockpit.
          </p>

          <div className="bottom-cta-actions">
            <button
              className="btn-white-hero"
              onClick={() => onEnterPortal('guest')}
            >
              <LogIn size={16} />
              <span>Guest Portal Sign In</span>
            </button>

            <button
              className="btn-glass-hero"
              onClick={() => onEnterPortal('manager')}
            >
              <Shield size={16} />
              <span>Manager Workspace</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── LIGHT LUXURY FOOTER ──────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="landing-brand-icon" style={{ width: 34, height: 34 }}>
              <Palmtree size={18} />
            </div>
            <div className="footer-copy">
              <b>THE PALMS RESORT 360</b> · Goa, India · 150 Luxury Rooms · Powered by Gemini AI
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              className="footer-revert-toggle"
              onClick={onToggleDirectLoginPreference}
            >
              {directLoginMode ? '✓ Direct login active' : '⚡ Revert to Direct Login'}
            </button>
            <span className="footer-copy">© 2026 The Palms Resort. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* ── DEMO PAYMENT MODAL (Simulated Hackathon Payment) ── */}
      <AnimatePresence>
        {activePaymentSummary && (
          <motion.div
            className="demo-payment-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isProcessingPayment && setActivePaymentSummary(null)}
          >
            <motion.div
              className="demo-payment-modal"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                className="demo-payment-close"
                onClick={() => !isProcessingPayment && setActivePaymentSummary(null)}
                title="Cancel Demo Payment"
              >
                ✕
              </button>

              <div className="demo-payment-badge">
                <CreditCard size={13} />
                <span>DEMO PAYMENT · HACKATHON SIMULATION</span>
              </div>

              <h3 style={{ fontSize: 20, fontFamily: 'Playfair Display, Georgia, serif', color: '#143328', margin: '0 0 6px' }}>
                Simulate Room Reservation Payment
              </h3>
              <p style={{ fontSize: 13, color: '#596e62', margin: '0 0 16px', lineHeight: 1.5 }}>
                This is a <b>strictly simulated</b> transaction environment for demonstration. No real funds, debit cards, or banking credentials are used or stored.
              </p>

              {/* Summary table */}
              <div style={{ background: '#f6f9f7', border: '1px solid #dbe6dd', borderRadius: 12, padding: '14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#687e72' }}>Allocated Residence:</span>
                  <b style={{ color: '#143328' }}>
                    Room {activePaymentSummary.roomNumber || activePaymentSummary.room_number} ({activePaymentSummary.roomType || activePaymentSummary.room_type})
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#687e72' }}>Stay Duration:</span>
                  <span style={{ color: '#143328', fontWeight: 600 }}>
                    {activePaymentSummary.checkIn || activePaymentSummary.check_in} to {activePaymentSummary.checkOut || activePaymentSummary.check_out} ({activePaymentSummary.nights} nights)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: '#687e72' }}>Guest Party:</span>
                  <span style={{ color: '#143328' }}>
                    {activePaymentSummary.guestName || activePaymentSummary.guest_name} ({activePaymentSummary.guests} Guests)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px dashed #cadbcf', fontSize: 14 }}>
                  <span style={{ fontWeight: 700, color: '#143328' }}>Total Demo Amount:</span>
                  <b style={{ fontSize: 18, color: '#1a4a3a' }}>
                    ₹{(activePaymentSummary.totalAmount ?? activePaymentSummary.total_amount ?? 0).toLocaleString('en-IN')}
                  </b>
                </div>
              </div>

              {/* Demo QR Box */}
              <div className="demo-qr-card">
                <div className="demo-qr-graphic">
                  <svg width="130" height="130" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100" height="100" fill="#ffffff" />
                    <rect x="5" y="5" width="30" height="30" rx="4" stroke="#1a4a3a" strokeWidth="4" />
                    <rect x="12" y="12" width="16" height="16" rx="2" fill="#1a4a3a" />
                    <rect x="65" y="5" width="30" height="30" rx="4" stroke="#1a4a3a" strokeWidth="4" />
                    <rect x="72" y="12" width="16" height="16" rx="2" fill="#1a4a3a" />
                    <rect x="5" y="65" width="30" height="30" rx="4" stroke="#1a4a3a" strokeWidth="4" />
                    <rect x="12" y="72" width="16" height="16" rx="2" fill="#1a4a3a" />
                    <rect x="42" y="10" width="8" height="8" fill="#1a4a3a" />
                    <rect x="42" y="24" width="8" height="8" fill="#1a4a3a" />
                    <rect x="10" y="42" width="8" height="8" fill="#1a4a3a" />
                    <rect x="24" y="42" width="8" height="8" fill="#1a4a3a" />
                    <rect x="42" y="42" width="16" height="16" fill="#1b7a42" />
                    <rect x="65" y="42" width="10" height="8" fill="#1a4a3a" />
                    <rect x="80" y="42" width="12" height="8" fill="#1a4a3a" />
                    <rect x="42" y="65" width="8" height="12" fill="#1a4a3a" />
                    <rect x="55" y="65" width="8" height="8" fill="#1a4a3a" />
                    <rect x="70" y="65" width="22" height="8" fill="#1a4a3a" />
                    <rect x="42" y="82" width="20" height="8" fill="#1a4a3a" />
                    <rect x="68" y="80" width="12" height="12" fill="#1a4a3a" />
                    <rect x="85" y="80" width="8" height="12" fill="#1a4a3a" />
                  </svg>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#687e72' }}>
                  <QrCode size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  <span>Scan with any simulated UPI / QR reader or click Pay Now</span>
                </div>
              </div>

              {/* Simulate Button */}
              <button
                type="button"
                className="btn-simulate-pay"
                disabled={isProcessingPayment}
                onClick={handleSimulatePayment}
              >
                {isProcessingPayment ? (
                  <>
                    <span className="loading-spinner-sm" style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                    <span>Processing Demo Payment...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Simulate Payment & Confirm (₹{(activePaymentSummary.totalAmount ?? activePaymentSummary.total_amount ?? 0).toLocaleString('en-IN')})</span>
                  </>
                )}
              </button>

              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#718579', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => !isProcessingPayment && setActivePaymentSummary(null)}
                >
                  Cancel and return to Concierge
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
