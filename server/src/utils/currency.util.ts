/** Formats a VND amount into a short Vietnamese business phrase, e.g. 12500000000 -> "12,5 tỷ". */
export function formatShortVnd(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${trimZero(abs / 1_000_000_000)} tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${trimZero(abs / 1_000_000)} triệu`;
  }
  return `${sign}${abs.toLocaleString('vi-VN')} đ`;
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '').replace('.', ',');
}

export function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' VNĐ';
}
