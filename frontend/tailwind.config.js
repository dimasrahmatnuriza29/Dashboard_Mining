/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        copper: {
          50: '#FFF8EB', 100: '#FEEFC7', 200: '#FDDF8E', 300: '#FCC855',
          400: '#FBAD24', 500: '#F58A0B', 600: '#D96406', 700: '#B44409',
          800: '#92350E', 900: '#782C0F',
        },
        mine: {
          50: '#F0F7FF', 100: '#E0EEFE', 200: '#B9DBFE', 300: '#7CC1FD',
          400: '#36A2F9', 500: '#0C85E9', 600: '#0068C7', 700: '#0153A1',
          800: '#064785', 900: '#0B3C6F',
        },
        navy: { 700: '#123a63', 800: '#0d2d4f', 900: '#0a2240', 950: '#071a33' },
      },
    },
  },
  plugins: [],
}
