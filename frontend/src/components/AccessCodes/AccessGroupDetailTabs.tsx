import { SegmentedTabs, type SegmentedTab } from '@/components/Common/SegmentedTabs';

interface AccessGroupDetailTab extends SegmentedTab {}

interface AccessGroupDetailTabsProps {
  tabs: AccessGroupDetailTab[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
}

export function AccessGroupDetailTabs({
  tabs,
  activeTab,
  onChange,
  className = '',
}: AccessGroupDetailTabsProps) {
  return (
    <SegmentedTabs
      tabs={tabs}
      activeTab={activeTab}
      onChange={onChange}
      className={className}
      ariaLabel="Group detail sections"
    />
  );
}
