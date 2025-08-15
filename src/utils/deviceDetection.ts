export const isMobileDevice = (): boolean => {
  // Check user agent for mobile patterns
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUserAgent = mobileRegex.test(navigator.userAgent);
  
  // Check screen width for mobile-like dimensions
  const isMobileWidth = window.innerWidth <= 768;
  
  // Check for touch capability
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Consider it mobile if user agent suggests mobile OR if it's a small touch screen
  return isMobileUserAgent || (isMobileWidth && isTouchDevice);
};

export const isTabletDevice = (): boolean => {
  const tabletRegex = /iPad|Android/i;
  const isTabletUserAgent = tabletRegex.test(navigator.userAgent);
  const isTabletWidth = window.innerWidth > 768 && window.innerWidth <= 1024;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return isTabletUserAgent && isTabletWidth && isTouchDevice;
};

export const isDesktopDevice = (): boolean => {
  return !isMobileDevice() && !isTabletDevice();
};

// Force mobile mode (useful for testing or user preference)
export const getForceMobileMode = (): boolean => {
  return localStorage.getItem('forceMobileMode') === 'true';
};

export const setForceMobileMode = (force: boolean): void => {
  if (force) {
    localStorage.setItem('forceMobileMode', 'true');
  } else {
    localStorage.removeItem('forceMobileMode');
  }
};

// Check if should use mobile layout
export const shouldUseMobileLayout = (): boolean => {
  return getForceMobileMode() || isMobileDevice();
};