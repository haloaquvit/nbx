import { useState, useEffect } from 'react';
import { shouldUseMobileLayout, isMobileDevice } from '@/utils/deviceDetection';

export const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(shouldUseMobileLayout());
  const [isActualMobile, setIsActualMobile] = useState(isMobileDevice());

  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(shouldUseMobileLayout());
      setIsActualMobile(isMobileDevice());
    };

    // Check on resize
    window.addEventListener('resize', checkDevice);
    
    // Check on storage change (in case force mobile mode is toggled)
    window.addEventListener('storage', checkDevice);

    // Initial check
    checkDevice();

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('storage', checkDevice);
    };
  }, []);

  return {
    isMobile,
    isActualMobile,
    shouldUseMobileLayout: isMobile
  };
};