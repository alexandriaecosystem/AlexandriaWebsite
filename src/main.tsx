import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import './ui-overrides.css';
import './i18n.css';
import './ux-system.css';
import './qa-responsive.css';
import './knowledge-analytics-ux.css';
import './premium-palette.css';
import './dashboard-usability.css';

const root = document.getElementById('root');

if (!root) throw new Error('Missing #root mount point');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
