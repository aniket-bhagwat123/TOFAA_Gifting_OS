import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#718096",
        brand: { DEFAULT: "#5B5CE2", dark: "#4849C7", soft: "#EEEEFF" },
        canvas: "#F6F7FB",
        line: "#E8EAF1"
      },
      boxShadow: {
        soft: "0 8px 30px rgba(24, 35, 66, 0.06)"
      }
    }
  },
  plugins: []
};
export default config;
