import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface FilterDropdownProps<T extends string = string> {
  /** Label shown on the dropdown button */
  label: string;
  /** Available options */
  options: FilterOption<T>[];
  /** Currently selected values */
  selected: T[];
  /** Called when selection changes */
  onChange: (selected: T[]) => void;
  /** Value that represents "all" (will be exclusive with other options) */
  allValue?: T;
}

/**
 * Multi-select filter dropdown with checkboxes.
 * Selecting "all" clears other selections; selecting specific options clears "all".
 */
export function FilterDropdown<T extends string = string>({
  label,
  options,
  selected,
  onChange,
  allValue,
}: FilterDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = (value: T) => {
    if (allValue && value === allValue) {
      // Selecting "all" clears everything and selects only "all"
      onChange([allValue]);
    } else if (allValue && selected.includes(allValue)) {
      // Selecting a specific option when "all" is selected
      onChange([value]);
    } else if (selected.includes(value)) {
      // Deselecting an option
      const newSelected = selected.filter((v) => v !== value);
      // If nothing is selected, default to "all"
      if (newSelected.length === 0 && allValue) {
        onChange([allValue]);
      } else {
        onChange(newSelected);
      }
    } else {
      // Selecting a new option
      onChange([...selected, value]);
    }
  };

  // Build display text
  const getDisplayText = () => {
    if (allValue && selected.includes(allValue)) {
      return 'All';
    }
    if (selected.length === 0) {
      return 'All';
    }
    if (selected.length === 1) {
      const option = options.find((o) => o.value === selected[0]);
      return option?.label ?? 'All';
    }
    return `${selected.length} selected`;
  };

  // Check if anything other than "all" is selected
  const hasActiveFilter = allValue ? !selected.includes(allValue) && selected.length > 0 : selected.length > 0;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
          hasActiveFilter
            ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
            : 'border-border-subtle bg-background-elevated text-foreground-secondary hover:text-foreground-primary'
        }`}
      >
        <span>{label}</span>
        <span className="text-foreground-muted">·</span>
        <span className={hasActiveFilter ? 'text-accent-primary' : ''}>{getDisplayText()}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border-subtle bg-background-elevated py-1 shadow-xl">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => handleToggle(option.value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-background-hover"
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? 'border-accent-primary bg-accent-primary text-white'
                      : 'border-border-subtle bg-background-primary'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                <span className="flex-1 text-foreground-primary">{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-foreground-muted">({option.count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
