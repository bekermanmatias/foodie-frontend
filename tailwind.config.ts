import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#FF5A00",
          ink: "#1F1F21",
          cloud: "#F7F7F5",
          line: "#E7E3DE"
        }
      },
      boxShadow: {
        panel: "0 18px 40px rgba(31, 31, 33, 0.08)"
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"]
      },
      borderRadius: {
        panel: "24px"
      }
    }
  },
  plugins: []
};

export default config;
