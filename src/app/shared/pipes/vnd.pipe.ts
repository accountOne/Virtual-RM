import { Pipe, PipeTransform } from '@angular/core';

/** Formats a number as Vietnamese currency, e.g. 12500000000 -> "12.500.000.000 VNĐ". */
@Pipe({ name: 'vnd', standalone: true })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined, currency = 'VND'): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const formatted = value.toLocaleString('vi-VN');
    return currency === 'VND' ? `${formatted} VNĐ` : `${formatted} ${currency}`;
  }
}

/** Formats a number in short Vietnamese business notation, e.g. 12500000000 -> "12,5 tỷ". */
@Pipe({ name: 'vndShort', standalone: true })
export class VndShortPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}${trimZero(abs / 1_000_000_000)} tỷ`;
    if (abs >= 1_000_000) return `${sign}${trimZero(abs / 1_000_000)} triệu`;
    return `${sign}${abs.toLocaleString('vi-VN')} đ`;
  }
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '').replace('.', ',');
}
