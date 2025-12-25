import React, { createContext, useContext, useMemo } from 'react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getOfficeTime, formatOfficeDate, formatOfficeTime, formatOfficeTimeOnly } from '@/utils/officeTime';

interface TimezoneContextType {
  timezone: string;
  getOfficeDate: () => Date;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatDateTime: (date: Date) => string;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useCompanySettings();
  const timezone = settings?.timezone || 'Asia/Jakarta';

  const value = useMemo(() => ({
    timezone,
    getOfficeDate: () => getOfficeTime(timezone),
    formatDate: (date: Date) => formatOfficeDate(date, timezone),
    formatTime: (date: Date) => formatOfficeTimeOnly(date, timezone),
    formatDateTime: (date: Date) => formatOfficeTime(date, timezone),
  }), [timezone]);

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    // Return default values jika di luar provider
    return {
      timezone: 'Asia/Jakarta',
      getOfficeDate: () => getOfficeTime('Asia/Jakarta'),
      formatDate: (date: Date) => formatOfficeDate(date, 'Asia/Jakarta'),
      formatTime: (date: Date) => formatOfficeTimeOnly(date, 'Asia/Jakarta'),
      formatDateTime: (date: Date) => formatOfficeTime(date, 'Asia/Jakarta'),
    };
  }
  return context;
}
