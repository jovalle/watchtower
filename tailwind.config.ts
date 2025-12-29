import type { Config } from "tailwindcss";
import { tokens } from "./app/lib/design/tokens";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: {
          primary: tokens.background.primary,
          secondary: tokens.background.secondary,
          elevated: tokens.background.elevated,
        },
        foreground: {
          primary: tokens.foreground.primary,
          secondary: tokens.foreground.secondary,
          muted: tokens.foreground.muted,
        },
        accent: {
          primary: tokens.accent.primary,
          hover: tokens.accent.hover,
          foreground: tokens.accent.foreground,
        },
        border: {
          subtle: tokens.border.subtle,
          emphasis: tokens.border.emphasis,
        },
        mango: {
          DEFAULT: '#FDBE02',
          hover: '#FD9E02',
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "Fira Sans",
          "Droid Sans",
          "Helvetica Neue",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
      spacing: {
        18: "4.5rem", // 72px
        22: "5.5rem", // 88px
        26: "6.5rem", // 104px
        30: "7.5rem", // 120px
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s ease-out",
        slideUp: "slideUp 0.4s ease-out",
        scaleIn: "scaleIn 0.2s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
