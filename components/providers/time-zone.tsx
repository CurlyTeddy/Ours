"use client";

import { createContext, useContext } from "react";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const TimeZoneContext = createContext<string>(timeZone);

function TimeZoneProvider({ children }: { children: React.ReactNode }) {
  return <TimeZoneContext value={timeZone}>{children}</TimeZoneContext>;
}

function useTimeZone() {
  return useContext(TimeZoneContext);
}

export { TimeZoneProvider, useTimeZone };
