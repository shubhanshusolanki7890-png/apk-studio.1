/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: {
          main: '#1d1d1f',
          sub: '#515154',
          accent: '#4c40e6'
        }
      },
      borderRadius: {
        glass: '28px',
        backdrop: '38px'
      }
    }
  },
  plugins: []
};
