import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0a0e14",
          panel: "#111722",
          border: "#1e2738",
          muted: "#7d8aa3",
          text: "#d6deeb",
        },
        status: {
          achieved: "#34d399",
          developing: "#fbbf24",
          watching: "#64748b",
          concern: "#f43f5e",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      keyframes: {
        pulseConcern: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(244,63,94,0.5)" },
          "50%": { boxShadow: "0 0 0 6px rgba(244,63,94,0)" },
        },
      },
      animation: {
        pulseConcern: "pulseConcern 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
