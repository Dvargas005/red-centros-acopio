import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta sobria y de alto contraste, optimizada para pantalla oscura (ahorro de bateria).
        base: "#0b0f14",
        surface: "#141a22",
        line: "#26303b",
        accent: "#ff6b35",   // naranja emergencia
        ok: "#3fb27f",
        warn: "#e8b04b",
        danger: "#e5484d",
      },
    },
  },
  plugins: [],
} satisfies Config;
