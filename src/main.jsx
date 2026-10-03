import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/bangers/400.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import ThemedToaster from './components/ThemedToaster.jsx';
import SupportLauncher from './components/support/SupportLauncher.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/marketing.css';
import './styles/app.css';
import './styles/support.css';
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <App />
        <SupportLauncher />
        <ThemedToaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
