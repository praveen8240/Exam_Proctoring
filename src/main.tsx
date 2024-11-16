import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import HeadMovements from './HeadMovements.js';


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeadMovements />
  </StrictMode>
);