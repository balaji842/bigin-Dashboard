/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          100: "#e7e9f5",
          950: "#0b1230",
          900: "#101a3d",
          800: "#172452",
          700: "#22316b",
          600: "#2f4086",
        },
        pink: {
          500: "#e94f8a",
          400: "#f172a1",
          300: "#f79cbe",
          100: "#fde4ee",
        },
        slate: {
          50: "#f6f7fb",
        },
      },
      fontFamily: {
        display: ["'Sora'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};