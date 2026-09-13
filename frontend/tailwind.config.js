export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0f5964',
          hover: '#0c4952',
          light: '#edf7f7',
          border: '#197280',
          dark: '#09363d',
        },
        'petroleum-blue': '#0f5964',
        'teal-green': '#197280',
        'brand-orange': '#ea8c28',
        'light-gray': '#f8fafc',
        canvas: '#f8fafc',
        surface: '#ffffff',
        'border-light': '#e2e8f0',
      },
      borderRadius: {
        DEFAULT: '8px',
        md: '6px',
        lg: '8px',
        xl: '10px',
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        soft: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
