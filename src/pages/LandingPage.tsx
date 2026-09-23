import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center justify-center p-4">
      <header className="text-center mb-12">
        <h1 className="text-6xl font-extrabold text-indigo-500 mb-4">HorizonVigil</h1>
        <p className="text-2xl text-gray-300 font-light">Your AI-powered sentinel for the digital frontier.</p>
      </header>

      <section className="max-w-2xl text-center mb-12">
        <p className="text-lg leading-relaxed mb-6">
          HorizonVigil provides cutting-edge AI solutions to monitor, analyze, and predict trends across vast digital landscapes.
          Empower your decisions with intelligent insights and stay ahead of the curve.
        </p>
        <p className="text-lg leading-relaxed">
          From real-time threat detection to market sentiment analysis, our platform offers unparalleled vigilance.
        </p>
      </section>

      <div className="mb-12">
        <img
          src="/architecture-placeholder.svg"
          alt="HorizonVigil Architecture"
          className="max-w-md w-full h-auto rounded-lg shadow-xl"
        />
      </div>

      <Link
        to="/auth"
        className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg
                   transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75"
      >
        Get Started - Secure Your Horizon
      </Link>

      <footer className="mt-20 text-sm text-gray-500">
        &copy; {new Date().getFullYear()} HorizonVigil. All rights reserved.
      </footer>
    </div>
  );
};

export default LandingPage;
