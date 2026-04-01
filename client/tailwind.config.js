/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0a0f1e',
          800: '#0f172a',
          700: '#1e293b',
          600: '#263348',
          500: '#334155',
        },
      },
    },
  },
  plugins: [],
};
