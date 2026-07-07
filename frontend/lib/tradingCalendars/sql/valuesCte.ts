import type { CalendarHoliday } from "../core";

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildHolidayValuesSelect(
  holidays: CalendarHoliday[],
  columns: {
    dateColumn: string;
    nameColumn: string;
    sourceColumn?: string;
  }
): string {
  const uniqueHolidays = [...holidays].sort((left, right) =>
    left.date.localeCompare(right.date)
  );

  if (uniqueHolidays.length === 0) {
    const sourceProjection = columns.sourceColumn ? `, NULL::text AS ${columns.sourceColumn}` : "";
    return `  SELECT NULL::date AS ${columns.dateColumn}, NULL::text AS ${columns.nameColumn}${sourceProjection}
  WHERE FALSE`;
  }

  const rows = uniqueHolidays
    .map((holiday) => {
      const values = [`DATE ${sqlText(holiday.date)}`, sqlText(holiday.name)];
      if (columns.sourceColumn) {
        values.push(sqlText(holiday.source ?? ""));
      }
      return `    (${values.join(", ")})`;
    })
    .join(",\n");

  const selectedColumns = [
    columns.dateColumn,
    columns.nameColumn,
    ...(columns.sourceColumn ? [columns.sourceColumn] : []),
  ].join(", ");

  return `  SELECT *
  FROM (
    VALUES
${rows}
  ) AS t(${selectedColumns})`;
}
