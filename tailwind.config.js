/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        ink: "#0d253d",
        inkSecondary: "#273951",
        inkMute: "#64748d",
        cloud: "#f6f9fc",
        paper: "#ffffff",
        frenchBlue: "#533afd",
        frenchRed: "#ea2261",
        brass: "#9b6829",
        sage: "#188b63",
        sky: "#ecebff",
        mint: "#e6f8ef",
        butter: "#f5e9d4",
        blush: "#ffe7f0",
        line: "#e3e8ee",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0, 55, 112, 0.08)",
        lift: "0 8px 24px rgba(0, 55, 112, 0.08), 0 2px 6px rgba(0, 55, 112, 0.04)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.85)",
      },
    },
  },
  plugins: [],
};
