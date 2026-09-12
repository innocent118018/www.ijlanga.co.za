import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const logoCss = `
/* IJ-LANGA-BRAND-LOGO: official logo in header and footer */
.brand-mark {
  background: #fff !important;
  background-image: url('/logo.svg') !important;
  background-repeat: no-repeat !important;
  background-position: center !important;
  background-size: contain !important;
  border: 0 !important;
  border-radius: 8px !important;
  box-shadow: none !important;
  color: transparent !important;
  font-size: 0 !important;
  overflow: hidden !important;
}
.footer-brand .brand-mark {
  background-color: rgba(255,255,255,.96) !important;
}
@media (max-width: 760px) {
  .brand { min-width: 0 !important; }
  .brand-mark { width: 40px !important; height: 40px !important; }
}
`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ijlanga-logo-branding',
      transform(code, id) {
        if (id.endsWith('/src/styles.css')) return `${code}\n${logoCss}`;
        return null;
      }
    }
  ]
});
