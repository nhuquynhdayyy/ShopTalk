/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#5B3FE0',
          green: '#14F195',
          darkBg: '#0B0E14',
          cardBg: '#151B26',
          border: '#243042',
          textMuted: '#8F9CAE'
        }
      }
    },
  },
  plugins: [],
}
