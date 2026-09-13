import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0d0e12",
        surface: "#14161d",
        surfaceBorder: "#232733",
        brandGold: "#E5A93C",
        brandGoldHover: "#f5b746",
      },
    },
  },
  plugins: [],
};
export default config;
