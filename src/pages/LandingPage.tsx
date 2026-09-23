import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '@heroicons/react/20/solid'; // Or '/24/solid' depending on desired size

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="text-center max-w-4xl">
        <img
          className="mx-auto h-48 w-auto mb-8 animate-fade-in-down"
          src="/architecture-placeholder.svg" // Ensure this file exists in your public folder
          alt="HorizonVigil Architecture Placeholder"
        />
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl animate-fade-in">
          HorizonVigil
        </h1>
        <p className="mt-6 text-xl text-gray-600 leading-8 animate-fade-in-up">
          Unlock actionable insights and proactive security for your cloud infrastructure.
          Monitor, analyze, and protect your digital assets with unparalleled clarity and control.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6 animate-fade-in-up delay-200">
          <Link
            to="/auth"
            className="rounded-md bg-indigo-600 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors duration-200"
          >
            Get started <ArrowRightIcon className="inline-block h-6 w-6 ml-2 -mr-1" aria-hidden="true" />
          </Link>
          <Link to="#"
                className="text-lg font-semibold leading-6 text-gray-900 hover:text-indigo-600 transition-colors duration-200">
            Learn more <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
