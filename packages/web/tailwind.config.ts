/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Apple System Colors
        apple: {
          blue: '#007AFF',
          green: '#34C759',
          indigo: '#5856D6',
          orange: '#FF9500',
          pink: '#FF2D55',
          purple: '#AF52DE',
          red: '#FF3B30',
          teal: '#5AC8FA',
          yellow: '#FFCC00',
        },
        foreground: {
          DEFAULT: '#1D1D1F',
          dark: '#F5F5F7',
        },
        background: {
          DEFAULT: '#FFFFFF',
          secondary: '#F5F5F7',
          tertiary: '#E8E8ED',
          dark: '#000000',
          'dark-secondary': '#1C1C1E',
          'dark-tertiary': '#2C2C2E',
        },
        'system-gray': {
          50: '#F5F5F7',
          100: '#E8E8ED',
          200: '#D2D2D7',
          300: '#AFB1B6',
          400: '#86868B',
          500: '#6E6E73',
          600: '#424245',
          700: '#1D1D1F',
          800: '#1C1C1E',
        }
      },
      borderRadius: {
        'apple': '10px',
        'apple-lg': '12px',
        'apple-xl': '16px',
        'apple-2xl': '20px',
      },
      boxShadow: {
        'apple-sm': '0 1px 2px rgba(0,0,0,0.05)',
        'apple-md': '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'apple-lg': '0 10px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        'apple-card': '0 2px 4px rgba(0,0,0,0.02), 0 10px 20px rgba(0,0,0,0.04)',
      },
      backdropBlur: {
        'apple': '20px',
      }
    },
  },
  plugins: [],
};
