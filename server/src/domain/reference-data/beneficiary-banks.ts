// Mock beneficiary bank list for the Transfer banking form (spec §6.2 — "có tối thiểu 7 ngân
// hàng, dropdown, không cho nhập tự do nếu đã có dropdown"). Static reference data, not backed
// by a repository — same category as fx-rates.json's own "static, no admin edit path" note in
// repositories/index.ts.

export interface BeneficiaryBank {
  code: string;
  name: string;
}

export const BENEFICIARY_BANKS: BeneficiaryBank[] = [
  { code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)' },
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)' },
  { code: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)' },
  { code: 'CTG', name: 'Ngân hàng TMCP Công thương Việt Nam (VietinBank)' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ thương Việt Nam (Techcombank)' },
  { code: 'MBB', name: 'Ngân hàng TMCP Quân đội (MB Bank)' },
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu (ACB)' },
];

const BANK_BY_CODE = new Map(BENEFICIARY_BANKS.map((b) => [b.code, b]));

export function isKnownBeneficiaryBank(code: string | undefined): boolean {
  return !!code && BANK_BY_CODE.has(code);
}

export function beneficiaryBankName(code: string | undefined): string | undefined {
  return code ? BANK_BY_CODE.get(code)?.name : undefined;
}
