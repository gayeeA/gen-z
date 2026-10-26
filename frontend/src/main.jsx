import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { AuthProvider } from './auth';
import { LiveProvider } from './live';

createRoot(document.getElementById('root')).render(
  <BrowserRouter><AuthProvider><LiveProvider><App /></LiveProvider></AuthProvider></BrowserRouter>
);
