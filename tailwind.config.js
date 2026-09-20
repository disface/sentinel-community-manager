/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Нейтральная современная палитра интерфейса Sentinel CM
        surface: {
          950: '#0A0D14', // Глубокий фоновый цвет
          900: '#10141F', // Поля ввода, сайдбар
          850: '#151A28', // Разделители, вторичные панели
          800: '#1E2438', // Карточки сообщений и списки
          700: '#2A334E', // Бордеры и обводки
          600: '#434F75', // Неактивные иконки
          500: '#64748B', // Приглушенный текст
          400: '#94A3B8', // Вторичный текст
          300: '#CBD5E1', // Читаемый текст
          200: '#E2E8F0', // Яркий текст
          100: '#F8FAFC', // Чистый белый акцент
        },
        // Динамический акцентный цвет (Theme Engine)
        accent: {
          DEFAULT: 'var(--accent-color, #2787F5)',
          hover: 'var(--accent-hover, #1E6DD0)',
          subtle: 'var(--accent-subtle, rgba(39, 135, 245, 0.15))',
          border: 'var(--accent-border, rgba(39, 135, 245, 0.4))',
          glow: 'var(--accent-glow, rgba(39, 135, 245, 0.25))',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
};
