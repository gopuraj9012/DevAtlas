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
      },
      animation: {
        "collapsible-down": "collapsible-down 180ms ease-out",
        "collapsible-up": "collapsible-up 180ms ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
