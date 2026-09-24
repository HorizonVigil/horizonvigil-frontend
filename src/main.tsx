import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const ROOT_ELEMENT_ID = 'root';

const rootElement = document.getElementById(ROOT_ELEMENT_ID);

if (!(rootElement instanceof HTMLElement)) {
  throw new Error(
    `HorizonVigil failed to start: the application root element (#${ROOT_ELEMENT_ID}) was not found.`,
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
