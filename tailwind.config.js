/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Satoshi", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
      },
      colors: {
        brand: {
          // MSB brand palette (warm orange-red), replacing the earlier indigo placeholder.
          50: "#fff4ed",
          100: "#ffe4d3",
          200: "#ffc6a6",
          300: "#ff9f6e",
          400: "#f97545",
          500: "#ef4b2a",
          600: "#d6331c",
          700: "#b02417",
          800: "#8a1e17",
          900: "#5c1512",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        positive: "#0d9488",
        negative: "#dc2626",
        warn: "#d97706",
      },
      borderRadius: {
        xl2: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        pop: "0 8px 24px -4px rgb(15 23 42 / 0.12)",
      },
    },
  },
  plugins: [],
};
