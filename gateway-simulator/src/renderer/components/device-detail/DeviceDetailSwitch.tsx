import { ToggleSwitch } from '../forms/ToggleSwitch';

type Props = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  labelOn: string;
  labelOff: string;
};

export function DeviceDetailSwitch({ label, checked, onChange, labelOn, labelOff }: Props) {
  return (
    <label className="device-detail-switch">
      <span className="device-detail-switch-label">{label}</span>
      <ToggleSwitch compact checked={checked} labelOn={labelOn} labelOff={labelOff} onChange={onChange} />
    </label>
  );
}
