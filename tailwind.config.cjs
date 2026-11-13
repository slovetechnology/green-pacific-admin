/** Scoped to the customer portal only — admin pages use hand-authored app.css. */
module.exports = {
  content: [
    "./src/features/portal/**/*.{ts,tsx}",
  ],
  prefix: "tw-",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: "#0C2733",
        "ink-soft": "#16404F",
        paper: "#EDF1F2",
        live: "#0E7A5F",
        soon: "#B27400",
        lapsed: "#A3311F",
      },
      fontFamily: {
        display: ["Newsreader", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
