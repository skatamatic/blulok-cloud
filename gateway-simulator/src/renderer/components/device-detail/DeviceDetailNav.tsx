import {
  DEVICE_DETAIL_TABS,
  type DeviceDetailTabId,
} from '../../utils/device-detail.utils';

type Props = {
  active: DeviceDetailTabId;
  visibleTabs: DeviceDetailTabId[];
  onChange: (tab: DeviceDetailTabId) => void;
};

export function DeviceDetailNav({ active, visibleTabs, onChange }: Props) {
  const tabs = DEVICE_DETAIL_TABS.filter((tab) => visibleTabs.includes(tab.id));

  return (
    <nav className="device-detail-sidebar" aria-label="Device detail sections">
      <ul className="device-detail-nav-list" role="tablist">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                role="tab"
                id={`device-detail-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`device-detail-panel-${tab.id}`}
                title={tab.hint}
                className={`device-detail-nav-item${isActive ? ' device-detail-nav-item-active' : ''}`}
                onClick={() => onChange(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
