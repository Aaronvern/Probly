import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bnb: "#F0B90B",
        "bnb-dark": "#C99A09",
        terminal: {
          bg: "#0A0A0F",
          surface: "#111118",
          border: "#1E1E2E",
          text: "#E2E8F0",
          muted: "#64748B",
          green: "#00FF88",
          red: "#FF4466",
          yellow: "#F0B90B",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "monospace"],
      },
      animation: {
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 8px 0 rgba(0,255,136,0.4)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(0,255,136,0.7)" },
        },
        slideUp: {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
  safelist: ["pb-safe"],
};

export default config;
