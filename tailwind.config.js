/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "Nunito Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        ink: "#102033",
        cloud: "#f5f9ff",
        paper: "#ffffff",
        frenchBlue: "#2563eb",
        frenchRed: "#ef5d5d",
        brass: "#f4b740",
        sage: "#2faf7b",
        sky: "#dceeff",
        mint: "#dff8ef",
        butter: "#fff2bc",
        blush: "#ffe8e3",
        line: "#d8e5f5",
      },
      boxShadow: {
        soft: "0 10px 24px rgba(37, 99, 235, 0.10)",
        lift: "0 14px 34px rgba(16, 32, 51, 0.10)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.85)",
      },
    },
  },
  plugins: [],
};
