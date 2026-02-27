"use client";

import { useState } from "react";

type ReportPeriod = "quarter" | "semi_first" | "semi_second" | "annual" | "custom";

type ReportFiltersProps = {
  period: ReportPeriod;
  year: number;
  quarter: number;
  startInput: string;
  endInput: string;
};

export default function ReportFilters({
  period,
  year,
  quarter,
  startInput,
  endInput,
}: ReportFiltersProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>(period);

  return (
    <form
      action="/reports"
      method="get"
      className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 grid gap-3 md:grid-cols-6"
    >
      <label className="grid gap-1 md:col-span-2">
        <span className="text-xs text-neutral-400">Period</span>
        <select
          name="period"
          defaultValue={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as ReportPeriod)}
          className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
        >
          <option value="quarter">Quarter</option>
          <option value="semi_first">Semi-Annual (Jan–Jun)</option>
          <option value="semi_second">Semi-Annual (Jul–Dec)</option>
          <option value="annual">Annual</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      {selectedPeriod !== "custom" && (
        <label className="grid gap-1">
          <span className="text-xs text-neutral-400">Year</span>
          <input
            name="year"
            type="number"
            defaultValue={year}
            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
          />
        </label>
      )}

      {selectedPeriod === "quarter" && (
        <label className="grid gap-1">
          <span className="text-xs text-neutral-400">Quarter</span>
          <select
            name="quarter"
            defaultValue={String(quarter)}
            className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
          >
            <option value="1">Q1</option>
            <option value="2">Q2</option>
            <option value="3">Q3</option>
            <option value="4">Q4</option>
          </select>
        </label>
      )}

      <button
        type="submit"
        className="h-10 rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-100 hover:bg-neutral-800 md:self-end"
      >
        Run report
      </button>

      {selectedPeriod === "custom" && (
        <>
          <label className="grid gap-1 md:col-span-1 md:max-w-xs">
            <span className="text-xs text-neutral-400">Custom start</span>
            <input
              name="start"
              type="date"
              defaultValue={startInput}
              className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
            />
          </label>

          <label className="grid gap-1 md:col-span-1 md:max-w-xs">
            <span className="text-xs text-neutral-400">Custom end</span>
            <input
              name="end"
              type="date"
              defaultValue={endInput}
              className="h-10 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100"
            />
          </label>
        </>
      )}
    </form>
  );
}
