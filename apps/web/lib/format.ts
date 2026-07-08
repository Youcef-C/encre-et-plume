// Bytes → human-readable French units by magnitude: "512 o", "3,2 Ko", "2,4 Mo", "1,1 Go".
// 1024-base steps (matches the previous Mo math so displayed ≥1 Mo values don't change).
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'] as const;
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${units[i]}`;
}
