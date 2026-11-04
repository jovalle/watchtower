import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { buttonStyles } from './Button';
import { usePopupBounds } from '~/hooks/usePopupBounds';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  const panel = usePopupBounds(isOpen, "menu");

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
        triggerRef.current?.focus();
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
    return `${selected.length} Selected`;
  };

  // Check if anything other than "all" is selected
  const hasActiveFilter = allValue ? !selected.includes(allValue) && selected.length > 0 : selected.length > 0;

  return (
    <div ref={dropdownRef} className="relative max-w-full" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={optionsId}
        onClick={() => setIsOpen(!isOpen)}
        className={buttonStyles({ variant: 'ghost', size: 'sm', className: `max-w-full gap-1.5 border ${
          hasActiveFilter
            ? 'border-accent-primary !bg-accent-primary/20 !text-accent-primary'
            : 'border-border-subtle !bg-background-elevated !text-foreground-secondary hover:!text-foreground-primary'
        }` })}
      >
        <span>{label}</span>
        <span className="text-foreground-muted">·</span>
        <span className={hasActiveFilter ? 'text-accent-primary' : ''}>{getDisplayText()}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div ref={panel} id={optionsId} className="absolute left-0 top-full z-50 mt-1 w-full overflow-y-auto overscroll-contain rounded-lg border border-border-subtle bg-background-elevated py-1 shadow-xl">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleToggle(option.value)}
                className={buttonStyles({ variant: 'ghost', size: 'sm', className: 'w-full gap-2 text-left' })}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? 'border-accent-primary bg-accent-primary text-accent-foreground'
                      : 'border-border-subtle bg-background-primary'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                <span className="min-w-0 flex-1 break-words text-foreground-primary">{option.label}</span>
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
