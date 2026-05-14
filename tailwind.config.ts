import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: "#2D9D9F",
          50: "#E0F2F1",
          100: "#B2DFDB",
          200: "#80CBC9",
          400: "#4DB6B5",
          600: "#2D9D9F",
          700: "#00897B",
          900: "#004D40",
        },
        ink: {
          DEFAULT: "#0B1220",
          900: "#0B1220",
          800: "#1F2937",
          600: "#4B5563",
          400: "#9CA3AF",
        },
        verified: {
          DEFAULT: "#0F9D58",
          bg: "#ECFDF5",
          text: "#047857",
        },
        warning: {
          DEFAULT: "#F59E0B",
          bg: "#FFFBEB",
          text: "#92400E",
        },
        danger: {
          DEFAULT: "#DC2626",
          bg: "#FEF2F2",
          text: "#991B1B",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.6rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1" }],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 0 rgb(0 0 0 / 0.05)",
        cardHover:
          "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
      },
      maxWidth: {
        prose: "65ch",
        container: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
