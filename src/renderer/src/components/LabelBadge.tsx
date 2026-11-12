import { readableTextColor } from '../lib/color'

export default function LabelBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="label-badge" style={{ background: color, color: readableTextColor(color) }}>
      {name}
    </span>
  )
}
