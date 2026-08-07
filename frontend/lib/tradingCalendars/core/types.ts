export type CalendarDate = string;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CalendarTradingStatus = "open" | "modified" | "special" | "closed" | "non-trading";

export interface CalendarHoliday {
  date: CalendarDate;
  name: string;
  source?: string;
  sourceUrl?: string;
  category?: string;
  tradingStatus?: CalendarTradingStatus;
  isTradingDay?: boolean;
  notes?: string;
}

export type HolidayProvider = (year: number) => CalendarHoliday[];

export interface TradingCalendarConfig {
  calendarId: string;
  label?: string;
  category?: string;
  description: string;
  source?: string;
  sourceUrl?: string;
  coverageStartYear?: number;
  coverageEndYear?: number;
  notes?: string;
  weekendDays?: DayOfWeek[];
  weekendsAreTradingDays?: boolean;
  holidaysForYear: HolidayProvider;
}

export interface TradingCalendar {
  calendarId: string;
  label: string;
  category?: string;
  description: string;
  source?: string;
  sourceUrl?: string;
  coverageStartYear?: number;
  coverageEndYear?: number;
  notes?: string;
  getHolidays(startYear: number, endYear: number): CalendarHoliday[];
  getEvents(startYear: number, endYear: number): CalendarHoliday[];
  getHoliday(date: CalendarDate): CalendarHoliday | null;
  getEvent(date: CalendarDate): CalendarHoliday | null;
  isHoliday(date: CalendarDate): boolean;
  isWeekend(date: CalendarDate): boolean;
  isTradingDay(date: CalendarDate): boolean;
  getNextTradingDay(date: CalendarDate): CalendarDate;
  getPreviousTradingDay(date: CalendarDate): CalendarDate;
  getTradingDays(startDate: CalendarDate, endDate: CalendarDate): CalendarDate[];
  getNonTradingDays(startYear: number, endYear: number): CalendarHoliday[];
}
