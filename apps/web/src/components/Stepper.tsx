import { parseAmount } from "@swolltech/metrics";
import { useId, type ReactNode } from "react";

interface StepperProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  decimals?: number;
  extra?: ReactNode;
  testId?: string;
}

export function Stepper({ label, value, onChange, step, min = 0, decimals = 2, extra, testId }: StepperProps) {
  const id = useId();
  function nudge(direction: 1 | -1) {
    const current = parseAmount(value) ?? 0;
    const next = Math.max(min, Math.round((current + direction * step) * 1000) / 1000);
    onChange(String(Number(next.toFixed(decimals))));
  }
  return (
    <div className="stepper">
      <div className="stepper-label">
        <label htmlFor={id}>{label}</label>
        {extra}
      </div>
      <div className="stepper-body">
        <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={() => nudge(-1)}>
          −
        </button>
        <input
          id={id}
          data-testid={testId}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
        />
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => nudge(1)}>
          +
        </button>
      </div>
    </div>
  );
}
