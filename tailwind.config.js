/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#081026", 2: "#2a3550", 3: "#6b7c99", 4: "#a4acc4" },
        line: "#e6e8ef",
        canvas: "#f6f5f3",
        wine: {
          50: "#fbf3f5", 100: "#f6e3e8", 200: "#ecc4cf", 300: "#d993a6",
          400: "#bf5d79", 500: "#a03657", 600: "#8a2546", 700: "#7b1e3a", 800: "#5e1630", 900: "#3d0e1f",
        },
        iris: { DEFAULT: "#4b5bfc", soft: "#7ea1f3" },
        ok: "#12805c", warn: "#b45309", bad: "#c2264b",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Geist", "Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(8,16,38,.04), 0 0 0 1px rgba(8,16,38,.06)",
        pop: "0 12px 32px -8px rgba(8,16,38,.18), 0 0 0 1px rgba(8,16,38,.06)",
      },
    },
  },
  plugins: [],
};
