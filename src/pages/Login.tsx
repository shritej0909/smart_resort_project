import { useState, useEffect, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles, User, Briefcase, Crown, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Brand from '../components/Brand';
import { api, type User as PortalUser } from '../services/api';

const loginImages = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80',
  'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1920&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1920&q=80',
];

const fadeUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const features = [
  { icon: Star, text: 'AI-Powered Concierge' },
  { icon: Sparkles, text: 'Smart Room Controls' },
  { icon: Crown, text: 'Personalized Experiences' },
];

interface LoginProps {
  onLogin: (user: PortalUser) => void;
  onBackToLanding?: () => void;
  initialRole?: 'guest' | 'manager';
}

export default function Login({ onLogin, onBackToLanding, initialRole = 'guest' }: LoginProps) {
  const [role, setRole] = useState<'guest' | 'manager'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    if (initialRole) setRole(initialRole);
  }, [initialRole]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api<PortalUser>('/auth/login', 'POST', { email, password, role }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Cycle background images
  useState(() => {
    const interval = setInterval(() => setImgIdx(i => (i + 1) % loginImages.length), 6000);
    return () => clearInterval(interval);
  });

  return (
    <div className="login-page">
      {/* Left side - Visual story */}
      <section className="login-story">
        <AnimatePresence mode="wait">
          <motion.img
            key={imgIdx}
            src={loginImages[imgIdx]}
            alt="Luxury resort"
            className="login-bg-image"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
          />
        </AnimatePresence>

        <div className="login-story-overlay" />

        <div className="story-top">
          <Brand light />
          <motion.span
            className="outline-pill"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            THE SMARTER WAY TO STAY
          </motion.span>
        </div>

        <div className="story-copy">
          <motion.span
            className="eyebrow light"
            custom={0}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            <span className="eyebrow-dot" /> INTELLIGENCE MEETS HOSPITALITY
          </motion.span>

          <motion.h1
            custom={1}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            Every stay.<br />
            A little more<br />
            <em>extraordinary.</em>
          </motion.h1>

          <motion.p
            custom={2}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            Thoughtful experiences for our guests.<br />
            A clearer picture for the people behind them.
          </motion.p>

          <motion.div
            className="story-features"
            custom={3}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            {features.map((f, i) => (
              <motion.div
                key={i}
                className="feature-chip"
                whileHover={{ scale: 1.05, y: -2 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <f.icon size={14} />
                <span>{f.text}</span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="story-footer"
            custom={4}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            <span><Sparkles size={17} /> Personalized by intelligence. Delivered with care.</span>
            <small>SMART RESORT 360</small>
          </motion.div>
        </div>
      </section>

      {/* Right side - Login panel */}
      <section className="login-panel">
        <motion.div
          className="login-top"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {onBackToLanding && (
            <button
              type="button"
              className="pill"
              onClick={onBackToLanding}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--green)',
                fontWeight: 600,
                border: '1px solid var(--line)',
                background: 'white'
              }}
            >
              ← Back to Resort Showcase
            </button>
          )}
          <span>YOUR RESORT, CONNECTED</span>
          <span className="pill">PS-4 Prototype</span>
        </motion.div>

        <motion.div
          className="login-form-wrap"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          <span className="eyebrow">WELCOME TO SMART RESORT 360</span>
          <h2>Your stay starts here.</h2>
          <p className="muted">Choose your portal and make yourself at home.</p>

          {/* Role switch - Guest vs Customer */}
          <div className="role-switch" aria-label="Choose your portal">
            <motion.button
              type="button"
              aria-pressed={role === 'guest'}
              onClick={() => { setRole('guest'); setEmail(''); setPassword(''); setError(''); }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <User size={19} />
              <span>
                Guest
                <small>Quick access for walk-ins</small>
              </span>
            </motion.button>
            <motion.button
              type="button"
              aria-pressed={role === 'manager'}
              onClick={() => { setRole('manager'); setEmail(''); setPassword(''); setError(''); }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Briefcase size={19} />
              <span>
                Manager
                <small>Operations & analytics hub</small>
              </span>
            </motion.button>
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={role}
              onSubmit={submit}
              initial={{ opacity: 0, x: role === 'guest' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: role === 'guest' ? 20 : -20 }}
              transition={{ duration: 0.3 }}
            >
              <label htmlFor="email">{role === 'guest' ? 'Email or Guest Login ID' : 'Email address'}</label>
              <input
                id="email"
                type={role === 'guest' ? 'text' : 'email'}
                autoComplete="username"
                required
                maxLength={254}
                placeholder={role === 'guest' ? 'you@example.com or GUEST-XXXXX' : 'manager@example.com'}
                value={email}
                onChange={e => setEmail(e.target.value)}
              />

              <div className="label-row">
                <label htmlFor="password">Password</label>
                <span>Contact reception for access</span>
              </div>
              <div className="password-field">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn password-toggle"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow(s => !s)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    className="error"
                    role="alert"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                className="primary login-submit"
                disabled={busy}
                whileHover={{ scale: busy ? 1 : 1.02 }}
                whileTap={{ scale: busy ? 1 : 0.98 }}
                type="submit"
              >
                {busy ? (
                  <span className="login-spinner" />
                ) : (
                  <>
                    {role === 'guest' ? 'Enter as guest' : 'Open manager portal'}
                    <ArrowRight size={18} />
                  </>
                )}
              </motion.button>

              <p className="security-note">
                <ShieldCheck size={16} />
                <span>Session protected · Data stored locally in this demo</span>
              </p>
            </motion.form>
          </AnimatePresence>

          <div className="credential-hints">
            <h3>Demo credentials</h3>
            <div className="hint-cards">
              <motion.div
                className="hint-card"
                whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              >
                <span className="hint-icon guest">
                  <User size={16} />
                </span>
                <div>
                  <b>Guest portal</b>
                  <code>guest@smartresort.demo</code>
                  <code>Guest@360!</code>
                </div>
              </motion.div>
              <motion.div
                className="hint-card"
                whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
              >
                <span className="hint-icon manager">
                  <Briefcase size={16} />
                </span>
                <div>
                  <b>Manager portal</b>
                  <code>manager@smartresort.demo</code>
                  <code>Manager@360!</code>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        <div className="login-bottom">
          <span>Smart Resort 360 · Hackathon Prototype</span>
          <span>PS-4 · v2.0</span>
        </div>
      </section>
    </div>
  );
}
