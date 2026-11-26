import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true },
    extend: {
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground"), deep: token("primary-deep") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        sidebar: { DEFAULT: token("sidebar"), foreground: token("sidebar-foreground") },
        legacy: { DEFAULT: token("legacy"), soft: token("legacy-soft"), foreground: token("legacy-foreground") },
        modern: { DEFAULT: token("primary"), soft: token("accent") },
        success: token("success"),
        warning: token("warning"),
        code: { DEFAULT: token("code"), foreground: token("code-foreground") },
      },
      borderRadius: { lg: "10px", xl: "14px", "2xl": "16px", md: "8px", sm: "6px" },
      boxShadow: {
        soft: "var(--shadow-md)",
        lift: "var(--shadow-lg)",
      },
      keyframes: {
        "collapsible-down": { from: { height: "0" }, to: { height: "var(--radix-collapsible-content-height)" } },
        "collapsible-up": { from: { height: "var(--radix-collapsible-content-height)" }, to: { height: "0" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        "glow-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)", opacity: "0.9" },
          "50%": { transform: "translate(-6%, 8%) scale(1.12)", opacity: "0.6" },
        },
        "grid-pan": { from: { backgroundPosition: "0 0, 0 0" }, to: { backgroundPosition: "0 40px, 40px 0" } },
        "line-in": { from: { opacity: "0", transform: "translateX(-6px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        caret: { "0%, 49%": { opacity: "1" }, "50%, 100%": { opacity: "0" } },
        "ping-soft": { "0%": { transform: "scale(1)", opacity: "0.7" }, "80%, 100%": { transform: "scale(2.6)", opacity: "0" } },
      },
      animation: {
        "collapsible-down": "collapsible-down 180ms ease-out",
        "collapsible-up": "collapsible-up 180ms ease-out",
        "fade-up": "fade-up 600ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 800ms ease-out both",
        float: "float 6s ease-in-out infinite",
        "glow-drift": "glow-drift 14s ease-in-out infinite",
        "grid-pan": "grid-pan 6s linear infinite",
        "line-in": "line-in 400ms ease-out both",
        caret: "caret 1s step-end infinite",
        "ping-soft": "ping-soft 2s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
