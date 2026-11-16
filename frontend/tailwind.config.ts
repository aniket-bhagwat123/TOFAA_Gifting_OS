import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // DESIGN.md §3: 11 badge/th, 12 label, 13 body, 14 card heading, 16 section, 20 page title.
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }], sm: ["13px", { lineHeight: "18px" }], base: ["14px", { lineHeight: "20px" }],
        lg: ["16px", { lineHeight: "22px" }], xl: ["20px", { lineHeight: "28px" }], "2xl": ["24px", { lineHeight: "30px" }], "3xl": ["28px", { lineHeight: "34px" }]
      },
      // DESIGN.md §6/§10/§13: controls 6-7px, cards 8px, modals/drawers 10px.
      borderRadius: { sm: "4px", md: "6px", lg: "8px", xl: "10px", "2xl": "10px", "3xl": "10px" },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "Segoe UI", "Arial", "sans-serif"]
      },
      colors: {
        ink: "#161B26",
        muted: "#5E6678",
        brand: { DEFAULT: "#0B6B57", dark: "#085746", soft: "#E6F2EF" },
        canvas: "#F5F7F9",
        line: "#E3E5EB"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(20,24,40,0.04), 0 8px 24px rgba(20,24,40,0.05)",
        float: "0 24px 64px rgba(20,24,40,0.22)"
      },
      transitionTimingFunction: {
        // Apple's sheet/drawer curve: fast start, long gentle settle
        sheet: "cubic-bezier(0.32, 0.72, 0, 1)"
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-in": { from: { opacity: "0", transform: "translateY(24px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "drawer-in": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } }
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out both",
        "sheet-in": "sheet-in 380ms cubic-bezier(0.32,0.72,0,1) both",
        "drawer-in": "drawer-in 380ms cubic-bezier(0.32,0.72,0,1) both",
        "rise-in": "rise-in 420ms cubic-bezier(0.32,0.72,0,1) both"
      }
    }
  },
  plugins: []
};
export default config;
