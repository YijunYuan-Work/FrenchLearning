/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', '"Noto Sans SC"', '"Microsoft YaHei"', "system-ui", "sans-serif"],
        serif: ['"Newsreader"', '"Noto Serif SC"', '"Songti SC"', "SimSun", "Georgia", "serif"],
      },
      colors: {
        ink: "#2A241C",
        ink2: "#4E4639",
        mute: "#6F6656",
        paper: "#EFE9DF",
        sheet: "#F8F5EF",
        sheetBright: "#FCFAF6",
        sky: "#E7ECED",
        river: "#3F6670",
        wood: "#8A5F32",
        sage: "#55703F",
        rule: "#DDD3C3",
        ruleStrong: "#CDBFA9",
        // Compatibility aliases while later pages migrate to the approved tokens.
        inkSecondary: "#4E4639",
        inkMute: "#6F6656",
        cloud: "#EFE9DF",
        frenchBlue: "#3F6670",
        frenchRed: "#A0402F",
        brass: "#8A5F32",
        mint: "#E7ECDF",
        butter: "#E8E1D4",
        blush: "#F2E7D9",
        line: "#DDD3C3",
      },
      boxShadow: {
        soft: "0 1px 0 #DDD3C3",
        lift: "0 1px 0 #CDBFA9, 0 22px 40px -26px rgba(50,38,20,.45)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.85)",
      },
      transitionTimingFunction: { ink: "cubic-bezier(.2,.7,.2,1)" },
    },
  },
  plugins: [],
};
