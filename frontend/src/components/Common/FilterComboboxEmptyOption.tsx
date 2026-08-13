interface FilterComboboxEmptyOptionProps {
  label: string;
  onSelect: () => void;
}

/** First row in searchable unit/device/user filters — clears the selection (All …). */
export function FilterComboboxEmptyOption({ label, onSelect }: FilterComboboxEmptyOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {label}
    </button>
  );
}
