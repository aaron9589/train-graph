import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CrewMobile } from './components/CrewMobile';
import './index.css';

const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');
const isMobilePath = window.location.pathname === `${base}/mobile` ||
  window.location.pathname === '/mobile';
const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const forceDesktop = new URLSearchParams(window.location.search).has('desktop');
const isMobile = isMobilePath || (isMobileUA && !forceDesktop);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMobile ? <CrewMobile /> : <App />}
  </React.StrictMode>
);
