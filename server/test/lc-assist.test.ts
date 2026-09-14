// Phase 5.5 BRD alignment — LC PO-upload Virtual RM assistant, see docs/phase-5.5-lc-assistant.md.
import { assert, assertEqual, describe, test } from './test-runner';
import { analyzePo, buildLcDraftMessage } from '../src/services/po-analysis.service';
import { TestClient } from './security/http-client';
import { getCheckerClient, getMakerClient } from './security/fixtures';

describe('po-analysis.service — deterministic mock PO extraction (not real OCR/AI, confirmed with user)', () => {
  test('the same fileName + fileSizeBytes always produces the same result', () => {
    const a = analyzePo('don-hang-01.pdf', 245000);
    const b = analyzePo('don-hang-01.pdf', 245000);
    assertEqual(JSON.stringify(a), JSON.stringify(b));
  });

  test('a different file can produce a different template', () => {
    const results = new Set<string>();
    for (const [name, size] of [
      ['don-hang-may-moc.pdf', 245000],
      ['po-nhua.xlsx', 88000],
      ['linh-kien-dien-tu.docx', 512000],
    ] as const) {
      results.add(analyzePo(name, size).templateLabel);
    }
    assert(results.size > 1, 'expected at least 2 distinct templates across 3 differently-named files');
  });

  test('every extracted result has the required core fields non-empty', () => {
    const r = analyzePo('any-po.pdf', 1000);
    assert(!!r.extracted.beneficiary, 'expected a beneficiary');
    assert(!!r.extracted.currency, 'expected a currency');
    assert(r.extracted.amount > 0, 'expected a positive amount');
    assert(r.extracted.requiredDocuments.length > 0, 'expected at least one required document');
  });

  test('missingFields exactly matches which date fields came back undefined', () => {
    const r = analyzePo('any-po.pdf', 1000);
    assertEqual(r.missingFields.includes('latestShipmentDate'), r.extracted.latestShipmentDate === undefined);
    assertEqual(r.missingFields.includes('expiryDate'), r.extracted.expiryDate === undefined);
  });

  test('every template resolves at least one deterministic date field for a fixed anchor date', () => {
    const anchor = new Date('2026-09-14T00:00:00.000Z');
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = analyzePo(`file-${i}.pdf`, 1000 + i);
      seen.add(r.templateLabel);
    }
    assert(seen.size >= 2, 'expected the small file sample to have hit more than one template');
    const r = analyzePo('file-0.pdf', 1000, anchor);
    if (r.extracted.latestShipmentDate) assert(r.extracted.latestShipmentDate > '2026-09-14', 'shipment date should be after the anchor');
  });
});

describe('buildLcDraftMessage — plain template string, never a real SWIFT message', () => {
  test('always carries the DRAFT/ILLUSTRATIVE label', () => {
    const msg = buildLcDraftMessage({
      type: 'IMPORT',
      subType: 'SIGHT',
      beneficiary: 'ACME Corp',
      applicant: 'ABC Manufacturing JSC',
      issuingBank: 'MSB',
      currency: 'USD',
      amount: 100000,
      latestShipmentDate: '2026-10-01',
      expiryDate: '2026-10-15',
      requiredDocuments: ['COMMERCIAL_INVOICE'],
    });
    assert(msg.includes('BẢN NHÁP'), 'expected the draft label');
    assert(msg.includes('ACME Corp'), 'expected the beneficiary in the message');
    assert(msg.includes('100,000'), 'expected the formatted amount in the message');
  });
});

describe('POST /api/virtual-rm/lc/analyze-po — auth + validation', () => {
  test('an anonymous caller gets 401', async () => {
    const res = await new TestClient().post('/api/virtual-rm/lc/analyze-po', { fileName: 'po.pdf', fileSizeBytes: 1000 });
    assertEqual(res.status, 401);
  });

  test('a Checker is blocked (403) — same MAKER/ADMIN-only rule as actually creating an LC', async () => {
    const res = await getCheckerClient().post('/api/virtual-rm/lc/analyze-po', { fileName: 'po.pdf', fileSizeBytes: 1000 });
    assertEqual(res.status, 403);
  });

  test('a Maker gets a 200 with extracted fields, and applicant filled from the real customer record', async () => {
    const res = await getMakerClient().post<{ extracted: { applicant?: string; beneficiary: string }; templateLabel: string }>(
      '/api/virtual-rm/lc/analyze-po',
      { fileName: 'don-hang-thiet-bi.pdf', fileSizeBytes: 300000 },
    );
    assertEqual(res.status, 200);
    assert(!!res.body.templateLabel, 'expected a templateLabel');
    assert(!!res.body.extracted.beneficiary, 'expected a beneficiary');
    assertEqual(res.body.extracted.applicant, 'ABC Manufacturing JSC');
  });

  test('a missing fileName is rejected with 400', async () => {
    const res = await getMakerClient().post('/api/virtual-rm/lc/analyze-po', { fileSizeBytes: 1000 });
    assertEqual(res.status, 400);
  });

  test('an unsupported extension is rejected with 400', async () => {
    const res = await getMakerClient().post('/api/virtual-rm/lc/analyze-po', { fileName: 'malware.exe', fileSizeBytes: 1000 });
    assertEqual(res.status, 400);
  });

  test('an oversized fileSizeBytes is rejected with 400', async () => {
    const res = await getMakerClient().post('/api/virtual-rm/lc/analyze-po', { fileName: 'po.pdf', fileSizeBytes: 999_000_000 });
    assertEqual(res.status, 400);
  });
});

describe('POST /api/virtual-rm/lc/draft-message', () => {
  test('a Maker gets a 200 with a labeled draft message', async () => {
    const res = await getMakerClient().post<{ message: string }>('/api/virtual-rm/lc/draft-message', {
      type: 'IMPORT',
      subType: 'SIGHT',
      beneficiary: 'ACME Corp',
      applicant: 'ABC Manufacturing JSC',
      issuingBank: 'MSB',
      currency: 'USD',
      amount: 50000,
      latestShipmentDate: '2026-10-01',
      expiryDate: '2026-10-20',
      requiredDocuments: ['COMMERCIAL_INVOICE', 'BILL_OF_LADING'],
    });
    assertEqual(res.status, 200);
    assert(res.body.message.includes('BẢN NHÁP'), 'expected the draft label in the response');
  });

  test('missing required fields is rejected with 400', async () => {
    const res = await getMakerClient().post('/api/virtual-rm/lc/draft-message', { beneficiary: 'ACME Corp' });
    assertEqual(res.status, 400);
  });

  test('a Checker is blocked (403)', async () => {
    const res = await getCheckerClient().post('/api/virtual-rm/lc/draft-message', {
      beneficiary: 'ACME',
      applicant: 'ABC',
      issuingBank: 'MSB',
      currency: 'USD',
      amount: 1000,
    });
    assertEqual(res.status, 403);
  });
});
