import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/** Ensure we land under /admin/ when opened at site root in dev */
if (import.meta.env.DEV && window.location.pathname === '/') {
  window.location.replace('/admin/');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
