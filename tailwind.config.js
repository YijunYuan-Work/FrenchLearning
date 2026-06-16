/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#172033",
        cloud: "#f7f4ed",
        paper: "#fffdf8",
        frenchBlue: "#1f3a5f",
        frenchRed: "#b33a3a",
        brass: "#b9893d",
        sage: "#5c7c67",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(31, 58, 95, 0.10)",
      },
    },
  },
  plugins: [],
};
