"use client";

import DatePicker from "react-datepicker";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDate(value: Date | null): string {
  if (!value) return "";
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export function DatePickerField({
  label,
  id,
  name,
  value,
  onChange,
  onBlur,
  error,
  required
}: {
  label: string;
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
}) {
  const [dateValue, setDateValue] = useState(value);
  useEffect(() => setDateValue(value), [value]);
  const handleChange = (date: Date | null) => {
    const formatted = formatDate(date);
    setDateValue(formatted);
    onChange(formatted);
  };
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-ink">{label}{required && <span className="ml-1 text-rose-500">*</span>}</label>
    {name && <input type="hidden" name={name} value={dateValue} />}
    <DatePicker
      id={id}
      selected={parseDate(dateValue)}
      onChange={handleChange}
      selectsRange={false}
      selectsMultiple={false}
      onBlur={onBlur}
      showIcon
      icon={<CalendarDays size={20} />}
      calendarIconClassName={required ? "datepicker-calendar-icon" : "datepicker-calendar-icon-clearable"}
      toggleCalendarOnIconClick
      dateFormat="dd/MM/yyyy"
      placeholderText="DD/MM/YYYY"
      showPopperArrow={false}
      portalId="datepicker-portal"
      isClearable={!required}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10 ${error ? "border-rose-400" : "border-line"}`}
      wrapperClassName="w-full"
    />
    {error && <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p>}
  </div>;
}
