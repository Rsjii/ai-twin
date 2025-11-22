/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/views/**/*.ejs",
      "./src/public/**/*.html",
      "./src/utils/**/*.js",
    ],
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          primary: '#6366f1',
          secondary: '#4f46e5',
          accent: '#8b5cf6',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
        fontFamily: {
          sans: ['Inter', 'sans-serif'],
        },
        animation: {
          'fade-in': 'fadeIn 0.5s ease-in-out',
          'slide-up': 'slideUp 0.3s ease-out',
          'bounce-gentle': 'bounceGentle 2s infinite',
          'blink': 'blink 1s infinite',
          'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
          'skeleton-loading': 'skeletonLoading 1.5s ease-in-out infinite',
          'mobile-fade-in': 'mobileFadeIn 0.3s ease-in-out',
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0' },
            '100%': { opacity: '1' },
          },
          slideUp: {
            '0%': { transform: 'translateY(10px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
          },
          bounceGentle: {
            '0%, 100%': { transform: 'translateY(0)' },
            '50%': { transform: 'translateY(-5px)' },
          },
          blink: {
            '0%, 50%': { opacity: '1' },
            '51%, 100%': { opacity: '0' },
          },
          pulseGlow: {
            '0%, 100%': { 
              boxShadow: '0 0 5px rgba(99, 102, 241, 0.5)',
              transform: 'scale(1)',
            },
            '50%': { 
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.8)',
              transform: 'scale(1.02)',
            },
          },
          skeletonLoading: {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
          mobileFadeIn: {
            'from': { opacity: '0', transform: 'translateY(10px)' },
            'to': { opacity: '1', transform: 'translateY(0)' },
          },
        },
      },
    },
    plugins: [
      require('@tailwindcss/line-clamp'),
    ],
    corePlugins: {
      preflight: true,
    },
  }