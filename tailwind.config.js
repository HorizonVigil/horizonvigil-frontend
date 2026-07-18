/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff', 100: '#d9ebff', 200: '#bcdcff', 300: '#8ec5ff', 400: '#59a4ff',
          500: '#3382ff', 600: '#1d63f5', 700: '#164ce0', 800: '#193fb5', 900: '#1a398f',
        },
      },
    },
  },
  plugins: [],
};
