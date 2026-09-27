import { useEffect, useState } from 'react';
import { LayoutDashboard, Bot, Utensils, Sparkles, ClipboardList, MessageSquare, TrendingUp, Users, Wrench, Package, Heart, LogOut, Menu, X, ChevronRight, MapPin, BedDouble, Calculator, CloudRain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Brand from './components/Brand';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import GuestPortal from './pages/GuestPortal';
import ManagerPortal from './pages/ManagerPortal';
import RoomsManagement from './pages/RoomsManagement';
import StaffScheduling from './pages/StaffScheduling';
import PredictiveMaintenance from './pages/PredictiveMaintenance';
import InventoryOptimization from './pages/InventoryOptimization';
import GuestExperience from './pages/GuestExperience';
import RevenueDashboard from './pages/RevenueDashboard';
import ServicesManagement from './pages/ServicesManagement';
import WeatherDigitalTwin from './pages/WeatherDigitalTwin';
import { api, type User } from './services/api';

// Landing Page Configuration switch:
// Set to false if you ever wish to completely disable the landing page and revert to direct login
const ENABLE_LANDING_PAGE = true;

const guestNav = [
  { id: 'stay', label: 'My stay', icon: LayoutDashboard },
  { id: 'concierge', label: 'AI concierge', icon: Bot },
  { id: 'dining', label: 'In-room dining', icon: Utensils },
  { id: 'services', label: 'Resort services', icon: Sparkles },
  { id: 'requests', label: 'My requests', icon: ClipboardList },
  { id: 'feedback', label: 'Share feedback', icon: MessageSquare },
];
const managerNav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'digital-twin', label: 'Weather Digital Twin', icon: CloudRain },
  { id: 'rooms', label: 'Rooms & Guests', icon: BedDouble },
  { id: 'requests', label: 'Service requests', icon: ClipboardList },
  { id: 'pricing', label: 'Dynamic pricing', icon: TrendingUp },
  { id: 'sentiment', label: 'Guest sentiment', icon: MessageSquare },
  { id: 'services', label: 'Resort services', icon: Sparkles },
  { id: 'revenue', label: 'Business & Revenue', icon: Calculator },
  { id: 'staff', label: 'Staff scheduling', icon: Users },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'guests', label: 'Guest experience', icon: Heart },
];

const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('');
  const [mobile, setMobile] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  // Landing page vs Direct Login mode
  const [viewMode, setViewMode] = useState<'landing' | 'login'>(() => {
    if (!ENABLE_LANDING_PAGE) return 'login';
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#login') return 'login';
      const saved = localStorage.getItem('sr360_direct_login');
      if (saved === 'true') return 'login';
    }
    return 'landing';
  });

  const [loginInitialRole, setLoginInitialRole] = useState<'guest' | 'manager'>('guest');

  useEffect(() => {
    // Ensure clean default day/light mode only
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('sr360_theme');
  }, []);

  const navigate = (value: string) => {
    window.location.hash = value;
    setPage(value);
    setMobile(false);
  };

  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const expire = () => { setUser(null); setPage(''); window.location.hash = ''; };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);

  useEffect(() => {
    if (!user) return;
    const nav = user.role === 'guest' ? guestNav : managerNav;
    const read = () => {
      const requested = window.location.hash.slice(1);
      const next = nav.some(item => item.id === requested) ? requested : nav[0].id;
      setPage(next);
      if (requested !== next) window.history.replaceState(null, '', `#${next}`);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [user]);

  const quickDemoLogin = async (role: 'guest' | 'manager') => {
    try {
      const credentials = role === 'guest'
        ? { email: 'guest@smartresort.demo', password: 'Guest@360!', role: 'guest' }
        : { email: 'manager@smartresort.demo', password: 'Manager@360!', role: 'manager' };
      const loggedUser = await api<User>('/auth/login', 'POST', credentials);
      setUser(loggedUser);
      navigate(loggedUser.role === 'guest' ? 'stay' : 'overview');
    } catch {
      setLoginInitialRole(role);
      setViewMode('login');
    }
  };

  const toggleDirectLoginPreference = () => {
    const current = localStorage.getItem('sr360_direct_login') === 'true';
    const next = !current;
    if (next) {
      localStorage.setItem('sr360_direct_login', 'true');
      setViewMode('login');
    } else {
      localStorage.removeItem('sr360_direct_login');
      setViewMode('landing');
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', 'POST');
    } catch (e) {
      console.warn('Logout notification error:', e);
    } finally {
      setUser(null);
      setPage('');
      window.location.hash = '';
      setLogoutError('');
      const direct = localStorage.getItem('sr360_direct_login') === 'true';
      setViewMode(direct ? 'login' : 'landing');
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="loading-content"
      >
        <Brand />
        <motion.div
          className="loading-spinner"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Preparing your space...
        </motion.p>
      </motion.div>
    </div>
  );

  if (!user) {
    if (viewMode === 'landing') {
      return (
        <LandingPage
          onEnterPortal={(targetRole) => {
            if (targetRole) setLoginInitialRole(targetRole);
            setViewMode('login');
          }}
          onDirectGuestLogin={(loggedUser) => {
            setUser(loggedUser);
            navigate('stay');
          }}
          onToggleDirectLoginPreference={toggleDirectLoginPreference}
          directLoginMode={localStorage.getItem('sr360_direct_login') === 'true'}
        />
      );
    }

    return (
      <Login
        initialRole={loginInitialRole}
        onBackToLanding={() => setViewMode('landing')}
        onLogin={value => {
          setUser(value);
          navigate(value.role === 'guest' ? 'stay' : 'overview');
        }}
      />
    );
  }

  const nav = user.role === 'guest' ? guestNav : managerNav;
  const legacyPages: Record<string, JSX.Element> = {
    'digital-twin': <WeatherDigitalTwin navigate={navigate} />,
    rooms: <RoomsManagement navigate={navigate} />,
    services: <ServicesManagement navigate={navigate} />,
    revenue: <RevenueDashboard navigate={navigate} />,
    staff: <StaffScheduling />,
    maintenance: <PredictiveMaintenance />,
    inventory: <InventoryOptimization />,
    guests: <GuestExperience navigate={navigate} />,
  };

  return (
    <div className="app-shell">
      <AnimatePresence>
        {mobile && (
          <motion.button
            className="sidebar-overlay"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button className="mobile-close icon-btn" aria-label="Close menu" onClick={() => setMobile(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="workspace-label">
          {user.role === 'guest' ? 'THE GUEST EXPERIENCE' : 'MANAGEMENT WORKSPACE'}
        </div>

        <nav aria-label={`${user.role} navigation`}>
          {nav.map((item, index) => (
            <motion.button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              whileHover={{ x: 4 }}
            >
              <item.icon size={19} />
              {item.label}
              {page === item.id && (
                <motion.span
                  className="nav-dot"
                  layoutId="nav-indicator"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </motion.button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="resort-location">
            <span className="location-icon"><MapPin size={19} /></span>
            <div>
              <b>The Palms Resort</b>
              <small>Smart Resort 360 - Demo property</small>
            </div>
          </div>

          <div className="profile">
            <motion.span
              className="avatar"
              whileHover={{ scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {user.name.split(' ').map(x => x[0]).join('')}
            </motion.span>
            <div>
              <b>{user.name}</b>
              <small>{user.role === 'guest' ? `Guest - Room ${user.room}` : 'Resort manager'}</small>
            </div>
            <motion.button
              className="icon-btn"
              title="Sign out"
              aria-label="Sign out"
              onClick={logout}
              whileHover={{ scale: 1.1, rotate: -10 }}
              whileTap={{ scale: 0.9 }}
            >
              <LogOut size={18} />
            </motion.button>
          </div>
          {logoutError && <p className="error" role="alert">{logoutError}</p>}
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <button className="mobile-menu icon-btn" aria-label="Open menu" onClick={() => setMobile(true)}>
              <Menu size={21} />
            </button>
            <span className="breadcrumb">{user.role === 'guest' ? 'Guest portal' : 'Manager portal'}</span>
            <ChevronRight size={14} />
            <b>{nav.find(x => x.id === page)?.label}</b>
          </div>
          <div className="topbar-actions">
            <span className="status-dot" />
            <span className="topbar-demo">{user.role === 'guest' ? `Room ${user.room}` : 'Demo property'}</span>
            <span className="header-date">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <motion.button
              className="topbar-logout-btn"
              title="Sign out"
              aria-label="Sign out"
              onClick={logout}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </motion.button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={page}
            className="portal-content"
            {...pageTransition}
          >
            {user.role === 'guest'
              ? <GuestPortal user={user} page={page} navigate={navigate} />
              : page in legacyPages
                ? legacyPages[page]
                : <ManagerPortal user={user} page={page} navigate={navigate} />
            }
          </motion.main>
        </AnimatePresence>

        <footer className="workspace-footer">
          <span>Smart Resort 360 - PS-4 Hackathon Prototype</span>
          <span>Powered by Gemini AI - RAG + ML Pipeline</span>
        </footer>
      </div>
    </div>
  );
}
