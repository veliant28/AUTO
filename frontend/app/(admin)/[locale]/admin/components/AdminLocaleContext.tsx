'use client';

import React, { createContext, useContext, useState } from 'react';

interface AdminLocaleContextType {
  activeLocale: string;
  setActiveLocale: (locale: string) => void;
}

const AdminLocaleContext = createContext<AdminLocaleContextType>({
  activeLocale: 'ru',
  setActiveLocale: () => {},
});

export function AdminLocaleProvider({ children }: { children: React.ReactNode }) {
  const [activeLocale, setActiveLocale] = useState('ru');
  return (
    <AdminLocaleContext.Provider value={{ activeLocale, setActiveLocale }}>
      {children}
    </AdminLocaleContext.Provider>
  );
}

export const useAdminLocale = () => useContext(AdminLocaleContext);
