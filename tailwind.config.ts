import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#102A56",
        sky: "#2B6EF2",
        mist: "#F5F8FC",
        line: "#E6ECF5",
      },
      boxShadow: {
        card: "0 10px 35px rgba(15, 42, 86, 0.08)",
        float: "0 18px 55px rgba(15, 42, 86, 0.14)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
