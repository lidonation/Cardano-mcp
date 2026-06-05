/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cardano: {
          DEFAULT: "#0033AD",
          dark:    "#002285",
          light:   "#3366FF",
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
    },
  },
  plugins: [],
};
