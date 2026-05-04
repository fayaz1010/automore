import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0a0c10', 900: '#11141c', 800: '#1a1f2a', 700: '#252b38' },
        road: { 500: '#f59e0b', 400: '#fbbf24', 300: '#fcd34d' },
        mist: '#94a3b8',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        lift: '0 24px 80px -20px rgba(0,0,0,.55)',
        card: '0 4px 24px rgba(0,0,0,.35)',
      },
    },
  },
  plugins: [],
};

export default config;
