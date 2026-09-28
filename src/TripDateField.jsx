import React from 'react'
import { CalendarDays } from 'lucide-react'

export default function TripDateField({ label, value, min, max, onChange, onFocus }) {
  const displayValue = value ? value.replaceAll('-', '.') : '选择日期'

  function openDatePicker(event) {
    // Keep the native date control as the full touch target, including on iOS.
    // Some browsers only open its picker when the calendar indicator is tapped.
    try {
      event.currentTarget.showPicker?.()
    } catch {
      // Safari versions without showPicker retain their native focus behavior.
    }
  }

  return <label className="trip-date-field">
    <span className="trip-date-label">{label}</span>
    <span className={`trip-date-control${value ? ' has-value' : ''}`}>
      <span className="trip-date-value" aria-hidden="true">{displayValue}</span>
      <CalendarDays aria-hidden="true"/>
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        onFocus={onFocus}
        onClick={openDatePicker}
      />
    </span>
  </label>
}
