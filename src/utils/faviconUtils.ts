export const updateFavicon = (logoUrl: string) => {
  if (!logoUrl) return;
  
  const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
  link.type = 'image/x-icon';
  link.rel = 'shortcut icon';
  link.href = logoUrl;
  
  if (!document.querySelector("link[rel*='icon']")) {
    document.head.appendChild(link);
  }
};