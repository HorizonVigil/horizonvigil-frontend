import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
  return (
    <div className="text-center py-20 px-4">
      <h1 className="text-6xl font-extrabold text-blue-400 mb-6 leading-tight">
        Welcome to HorizonVigil
      </h1>
      <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-10">
        Empowering your projects with intelligent monitoring and actionable insights.
        HorizonVigil keeps an watchful eye, so you can focus on building.
      </p>
      <div className="mb-16">
        <Link
          to="/auth"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-10 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Get Started
        </Link>
      </div>

      <div className="max-w-5xl mx-auto">
        <h2 className="text-4xl font-bold text-gray-200 mb-8">Our Vision</h2>
        <p className="text-lg text-gray-400 mb-12 leading-relaxed">
          HorizonVigil provides a comprehensive platform for real-time system health checks,
          performance metrics, and alert management. Our goal is to simplify complex
          monitoring tasks, offering clarity and control over your digital infrastructure.
          We believe that proactive monitoring is key to maintaining robust and reliable applications.
        </p>

        <h2 className="text-4xl font-bold text-gray-200 mb-8">How It Works (Architecture Placeholder)</h2>
        <div className="bg-gray-800 p-10 rounded-lg shadow-inner border border-gray-700 flex flex-col items-center justify-center h-80 text-gray-500 italic">
          <p className="text-xl mb-4">
            [Placeholder for an Architecture Diagram / Key Features Graphic]
          </p>
          <p className="text-md">
            Imagine a flow from your services, through our intelligent analysis engine, to your personalized dashboard and notification channels.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
