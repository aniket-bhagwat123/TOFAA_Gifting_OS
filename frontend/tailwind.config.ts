import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "system-ui", "Roboto", "sans-serif"]
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
