function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <span className={`badge badge-${slug(status)}`}>{status}</span>;
}
