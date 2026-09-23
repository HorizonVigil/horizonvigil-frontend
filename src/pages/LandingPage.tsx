import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/20/solid'; // Ensure @heroicons/react is installed

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col justify-center items-center p-4">
      <div className="text-center max-w-3xl">
        <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-tight">
          HorizonVigil
        </h1>
        <p className="mt-4 text-xl text-gray-300">
          The Unified AI Operations Platform for the Modern Enterprise.
        </p>
        <p className="mt-2 text-lg text-gray-400">
          Streamline, monitor, and optimize your AI workflows with unparalleled visibility and control.
        </p>
        <img
          src="/architecture-placeholder.svg"
          alt="HorizonVigil Architecture Placeholder"
          className="mx-auto mt-8 w-full max-w-md animate-fade-in-up"
        />
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/auth"
            className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-300 ease-in-out transform hover:scale-105"
          >
            Get Started
            <ArrowRightIcon className="ml-3 -mr-1 h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
