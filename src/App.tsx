import React from 'react';
import { RouterProvider } from 'react-router-dom';
import router from './router';
import './index.css'; // Assuming this file sets up Tailwind CSS or global styles

function App() {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
