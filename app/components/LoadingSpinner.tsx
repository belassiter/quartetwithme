import React from 'react';

const LoadingSpinner = () => {
  return (
    <div className="spinner-overlay">
      <div className="spinner flex justify-center items-center">
        <img src="/assets/saxophone-svgrepo-com.svg" alt="Saxophone" className="w-12 h-12" />
      </div>
    </div>
  );
};

export default LoadingSpinner;
