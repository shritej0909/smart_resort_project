import { Palmtree } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <motion.div
      className={`brand ${light ? 'brand-light' : ''}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <motion.span
        className="brand-icon"
        whileHover={{ rotate: 15, scale: 1.1 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <Palmtree size={25} />
      </motion.span>
      <span>
        smart resort <b>360</b>
        <small>A LITTLE MORE EXTRAORDINARY</small>
      </span>
    </motion.div>
  );
}

export function ResortArt() {
  return (
    <div className="resort-art-container">
      <img
        src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80"
        alt="Luxury resort pool at sunset"
        className="resort-art-image"
      />
      <div className="resort-art-overlay" />
    </div>
  );
}

export function HeroImage({ variant = 'pool' }: { variant?: 'pool' | 'lobby' | 'room' | 'beach' | 'spa' | 'dining' }) {
  const images: Record<string, string> = {
    pool: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80',
    lobby: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1920&q=80',
    room: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1920&q=80',
    beach: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1920&q=80',
    spa: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1920&q=80',
    dining: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1920&q=80',
  };

  return (
    <motion.img
      src={images[variant]}
      alt={`Resort ${variant}`}
      className="hero-image"
      initial={{ scale: 1.1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
    />
  );
}
