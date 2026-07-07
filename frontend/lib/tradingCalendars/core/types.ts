export type CalendarDate = string;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarHoliday {
  date: CalendarDate;
  name: string;
  source?: string;
}

export type HolidayProvider = (year: number) => CalendarHoliday[];

export interface TradingCalendarConfig {
  calendarId: string;
  description: string;
  source?: string;
  weekendDays?: DayOfWeek[];
  holidaysForYear: HolidayProvider;
}

export interface TradingCalendar {
  calendarId: string;
  description: string;
  source?: string;
  getHolidays(startYear: number, endYear: number): CalendarHoliday[];
  getHoliday(date: CalendarDate): CalendarHoliday | null;
  isHoliday(date: CalendarDate): boolean;
  isWeekend(date: CalendarDate): boolean;
  isTradingDay(date: CalendarDate): boolean;
  getNextTradingDay(date: CalendarDate): CalendarDate;
  getPreviousTradingDay(date: CalendarDate): CalendarDate;
  getTradingDays(startDate: CalendarDate, endDate: CalendarDate): CalendarDate[];
  getNonTradingDays(startYear: number, endYear: number): CalendarHoliday[];
}
