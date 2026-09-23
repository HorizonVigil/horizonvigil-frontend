import React from 'react';
import AppRouter from './router';
import './index.css'; // Assuming Tailwind CSS is imported here or in main.tsx/main.js

const App: React.FC = () => {
  return (
    <div id="app-container">
      <AppRouter />
    </div>
  );
};

export default App;
