// VisionLab – High-contrast accessibility mode hook

import { useEffect, useState } from 'react';

export function useHighContrast() {
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    return localStorage.getItem('visionlab_high_contrast') === 'true';
  });

  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    localStorage.setItem('visionlab_high_contrast', String(highContrast));
  }, [highContrast]);

  return { highContrast, toggleHighContrast: () => setHighContrast((v) => !v) };
}
