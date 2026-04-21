/**
 * Tailwind configuration for Sepia.
 * Dark-theme palette mapped to CSS variables defined in src/index.css so
 * components can reference tokens like `bg-app`, `text-primary`, `accent`.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'var(--bg-app)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          hover: 'var(--bg-surface-hover)',
          elevated: 'var(--bg-elevated)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          accent: 'var(--border-accent)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        danger: 'var(--danger)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: ['Inter', '"SF Pro Display"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', '"Cascadia Code"', '"Consolas"', 'monospace'],
      },
      borderRadius: {
        card: '8px',
        button: '6px',
        modal: '12px',
      },
    },
  },
  plugins: [],
};
