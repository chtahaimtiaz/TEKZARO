interface PakistanImpactCalloutProps {
  text: string;
}

export function PakistanImpactCallout({ text }: PakistanImpactCalloutProps) {
  return (
    <aside className="my-6 rounded-lg border border-pakistan/30 bg-pakistan-soft/50 p-5">
      <p className="eyebrow eyebrow-pakistan mb-2">What This Means for Pakistan</p>
      <p className="text-ink-soft">{text}</p>
    </aside>
  );
}
