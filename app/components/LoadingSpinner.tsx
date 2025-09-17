import React from 'react';
import Image from 'next/image';

const LoadingSpinner = () => {
  return (
    <div className="spinner-overlay">
      <div className="spinner flex justify-center items-center">
        <Image src="/assets/saxophone-svgrepo-com.svg" alt="Saxophone" width={48} height={48} />
      </div>
    </div>
  );
};

export default LoadingSpinner;
