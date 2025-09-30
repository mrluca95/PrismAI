/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        prism: {
          purple: '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
};
