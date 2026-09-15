// Agent mock tools (spec §10) — registered into agent-tool-registry.ts. Every read tool here is
// a thin wrapper over the EXISTING tools/index.ts (never re-reads a repository directly); every
// write tool that already has a real backend (LC/guarantee/collection) calls the EXISTING
// trade-finance.service.ts, never re-implements creation logic. The one genuinely new piece is
// the transfer tools — this app had no backend for "chuyển tiền" at all before this file (see
// docs/GEMINI_AGENT_AUDIT.md §4) — built to match the exact same
// readAll()->build record->writeAll() shape trade-finance.service.ts::createLc already
// established, plus a matching ApprovalRecord so the new order shows up in the existing
// Checker "chờ duyệt" queue exactly like a real one would.

import { randomUUID } from 'crypto';
import { UserContext } from '../ai/types';
import { getAccountBalance, getAccounts, getLetterOfCredits, getBankGuarantees, getCollections, getProducts, getRecommendations, getTransactions } from '../tools';
import { tradeFinanceService } from '../services/trade-finance.service';
import { getAnchorDates } from '../services/transactions.service';
import { approvalsRepository, paymentOrdersRepository, transactionsRepository } from '../repositories';
import { ApprovalRecord, PaymentOrder, Transaction } from '../models';
import { AgentTool, registerAgentTool } from './agent-tool-registry';
import { AgentEntities, EntityValue } from './schemas/semantic-understanding.schema';

const ALL_ROLES = ['MAKER', 'CHECKER', 'ADMIN'] as const;
// Write tools follow the exact same rule as the real trade-finance creation endpoints (spec
// §14/§26 in the earlier BRD work): a Checker prepares nothing, they only approve — see
// trade-finance.controller.ts::createLc's own comment for the precedent this mirrors.
const MAKER_ADMIN = ['MAKER', 'ADMIN'] as const;

function entityString(e: EntityValue | undefined): string | undefined {
  if (e === undefined) return undefined;
  return String(e.value);
}
function entityNumber(e: EntityValue | undefined): number | undefined {
  if (e === undefined) return undefined;
  const n = typeof e.value === 'number' ? e.value : Number(e.value);
  return Number.isFinite(n) ? n : undefined;
}

// ---- Read tools (riskLevel READ, no approval) ------------------------------------------------

export const getBalanceTool: AgentTool<{ accountNumber?: string }, ReturnType<typeof getAccountBalance.execute>> = registerAgentTool({
  name: 'get_balance',
  description: 'Số dư một tài khoản (mặc định tài khoản đầu tiên nếu không nêu rõ số tài khoản)',
  riskLevel: 'READ',
  requiresApproval: false,
  allowedRoles: [...ALL_ROLES],
  execute: (ctx: UserContext, params) => getAccountBalance.execute(ctx, { accountNo: params.accountNumber }),
});

export const searchTransactionTool: AgentTool<{ transactionId?: string }, { found: boolean; transaction?: Transaction; recent?: Transaction[] }> = registerAgentTool({
  name: 'search_transaction',
  description: 'Tra cứu một giao dịch theo mã, hoặc liệt kê các giao dịch gần đây nếu không nêu mã',
  riskLevel: 'READ',
  requiresApproval: false,
  allowedRoles: [...ALL_ROLES],
  execute: (ctx: UserContext, params) => {
    const all = getTransactions.execute(ctx, {});
    if (params.transactionId) {
      const transaction = all.find((t) => t.id.toLowerCase() === params.transactionId!.toLowerCase());
      return { found: !!transaction, transaction };
    }
    return { found: all.length > 0, recent: all.slice(0, 10) };
  },
});

export const checkLcStatusTool: AgentTool<{ lcNumber?: string }, ReturnType<typeof getLetterOfCredits.execute>> = registerAgentTool({
  name: 'check_lc_status',
  description: 'Trạng thái một LC theo số LC, hoặc toàn bộ LC nếu không nêu số',
  riskLevel: 'READ',
  requiresApproval: false,
  allowedRoles: [...ALL_ROLES],
  execute: (ctx, params) => {
    const all = getLetterOfCredits.execute(ctx, {});
    return params.lcNumber ? all.filter((l) => l.lcNumber === params.lcNumber) : all;
  },
});

export const checkGuaranteeStatusTool: AgentTool<{ bgNumber?: string }, ReturnType<typeof getBankGuarantees.execute>> = registerAgentTool({
  name: 'check_guarantee_status',
  description: 'Trạng thái một bảo lãnh theo số BG, hoặc toàn bộ nếu không nêu số',
  riskLevel: 'READ',
  requiresApproval: false,
  allowedRoles: [...ALL_ROLES],
  execute: (ctx, params) => {
    const all = getBankGuarantees.execute(ctx, {});
    return params.bgNumber ? all.filter((g) => g.bgNumber === params.bgNumber) : all;
  },
});

export const checkCollectionStatusTool: AgentTool<{ collectionNumber?: string }, ReturnType<typeof getCollections.execute>> = registerAgentTool({
  name: 'check_collection_status',
  description: 'Trạng thái một bộ nhờ thu theo số, hoặc toàn bộ nếu không nêu số',
  riskLevel: 'READ',
  requiresApproval: false,
  allowedRoles: [...ALL_ROLES],
  execute: (ctx, params) => {
    const all = getCollections.execute(ctx, {});
    return params.collectionNumber ? all.filter((c) => c.collectionNumber === params.collectionNumber) : all;
  },
});

export const searchProductInformationTool: AgentTool<Record<string, never>, { products: ReturnType<typeof getProducts.execute>; recommendations: ReturnType<typeof getRecommendations.execute> }> =
  registerAgentTool({
    name: 'search_product_information',
    description: 'Thông tin sản phẩm ngân hàng và gợi ý sản phẩm hiện đang phù hợp',
    riskLevel: 'READ',
    requiresApproval: false,
    allowedRoles: [...ALL_ROLES],
    execute: (ctx) => ({ products: getProducts.execute(ctx, {}), recommendations: getRecommendations.execute(ctx, {}) }),
  });

export const contactRmTool: AgentTool<Record<string, never>, { message: string }> = registerAgentTool({
  name: 'contact_rm',
  description: 'Chuyển hướng khách hàng tới liên hệ với RM thật (human handoff, không tự xử lý)',
  riskLevel: 'READ',
  requiresApproval: false,
  allowedRoles: [...ALL_ROLES],
  execute: () => ({ message: 'Em đã ghi nhận yêu cầu — bộ phận Quan hệ khách hàng MSB Business sẽ liên hệ lại với anh/chị sớm nhất.' }),
});

// ---- create_transfer: draft (PREPARE) + execute (EXECUTE, real write) ------------------------

export interface TransferDraft {
  amount: number;
  currency: string;
  beneficiaryName: string;
  sourceAccountId: string;
  sourceAccountLabel: string;
  fee: number;
}

export const createTransferDraftTool: AgentTool<{ entities: AgentEntities }, TransferDraft> = registerAgentTool({
  name: 'create_transfer_draft',
  description: 'Chuẩn bị bản nháp lệnh chuyển tiền để khách hàng xác nhận trước khi thực hiện',
  riskLevel: 'PREPARE',
  requiresApproval: false,
  allowedRoles: [...MAKER_ADMIN],
  execute: (ctx, { entities }) => {
    const amount = entityNumber(entities.amount);
    const beneficiaryName = entityString(entities.beneficiaryName);
    if (!amount || !beneficiaryName) {
      throw new Error('create_transfer_draft requires amount and beneficiaryName — caller must check missingFields first');
    }
    const currency = entityString(entities.currency) ?? 'VND';
    const accounts = getAccounts.execute(ctx, {});
    const sourceAccountNo = entityString(entities.sourceAccount);
    const account = (sourceAccountNo && accounts.find((a) => a.accountNumber.endsWith(sourceAccountNo))) ?? accounts.find((a) => a.currency === currency) ?? accounts[0];
    if (!account) throw new Error('No source account available');
    return { amount, currency, beneficiaryName, sourceAccountId: account.id, sourceAccountLabel: `${account.accountName} — ${account.accountNumber}`, fee: 0 };
  },
});

export interface TransferResult {
  paymentOrderId: string;
  transactionId: string;
  status: PaymentOrder['status'];
}

/** The one genuinely new mutating mock tool (spec §4/§11 flow's final "Execute mock tool" step)
 * — see this file's header comment on why "chuyển tiền" needed a real backend at all. Writes a
 * Transaction (DEBIT, PENDING_APPROVAL) + a linked PaymentOrder + a matching ApprovalRecord, so
 * the new transfer immediately shows up in the EXISTING Checker "chờ duyệt" queue exactly like
 * one created through the normal payments UI would — the Agent's own approval gate (this tool
 * only ever runs after WAITING_APPROVAL) is a separate, additional checkpoint, not a
 * replacement for that real Maker->Checker approval (see docs/GEMINI_AGENT_AUDIT.md §8). */
export const executeTransferTool: AgentTool<TransferDraft, TransferResult> = registerAgentTool({
  name: 'execute_transfer',
  description: 'Thực hiện lệnh chuyển tiền đã được khách hàng xác nhận (ghi thật vào payment-orders.json/transactions.json)',
  riskLevel: 'EXECUTE',
  requiresApproval: true,
  allowedRoles: [...MAKER_ADMIN],
  execute: (ctx, draft) => {
    const anchorToday = getAnchorDates().today;
    const nowIso = new Date().toISOString();

    const transaction: Transaction = {
      id: `txn-agent-${randomUUID()}`,
      accountId: draft.sourceAccountId,
      date: anchorToday,
      type: 'DEBIT',
      category: 'Chuyển khoản',
      amount: draft.amount,
      currency: draft.currency,
      counterparty: draft.beneficiaryName,
      description: `Chuyển tiền qua Virtual RM AI Agent tới ${draft.beneficiaryName}`,
      status: 'PENDING_APPROVAL',
    };
    transactionsRepository.writeAll([...transactionsRepository.readAll(), transaction]);

    const paymentOrder: PaymentOrder = {
      id: `po-agent-${randomUUID()}`,
      transactionId: transaction.id,
      type: 'SINGLE_TRANSFER',
      initiatedBy: ctx.userId,
      initiatedAt: nowIso,
      amount: draft.amount,
      currency: draft.currency,
      beneficiary: draft.beneficiaryName,
      status: 'PENDING_APPROVAL',
      description: `Chuyển tiền qua Virtual RM AI Agent tới ${draft.beneficiaryName}`,
    };
    paymentOrdersRepository.writeAll([...paymentOrdersRepository.readAll(), paymentOrder]);

    const approval: ApprovalRecord = {
      id: `apr-agent-${randomUUID()}`,
      paymentOrderId: paymentOrder.id,
      approverUserId: null,
      decision: 'PENDING',
      decidedAt: null,
    };
    approvalsRepository.writeAll([...approvalsRepository.readAll(), approval]);

    return { paymentOrderId: paymentOrder.id, transactionId: transaction.id, status: paymentOrder.status };
  },
});

// ---- create_lc: draft (PREPARE) + submit (EXECUTE, reuses existing tradeFinanceService) ------

export interface LcDraft {
  type: 'IMPORT' | 'EXPORT';
  subType: 'SIGHT' | 'USANCE';
  beneficiary: string;
  currency: string;
  amount: number;
  expiryDate: string;
}

export const createLcDraftTool: AgentTool<{ entities: AgentEntities }, LcDraft> = registerAgentTool({
  name: 'create_lc_draft',
  description: 'Chuẩn bị bản nháp yêu cầu mở LC để khách hàng xác nhận',
  riskLevel: 'PREPARE',
  requiresApproval: false,
  allowedRoles: [...MAKER_ADMIN],
  execute: (_ctx, { entities }) => {
    const beneficiary = entityString(entities.beneficiary);
    const amount = entityNumber(entities.lcAmount);
    if (!beneficiary || !amount) {
      throw new Error('create_lc_draft requires beneficiary and lcAmount — caller must check missingFields first');
    }
    const currency = entityString(entities.lcCurrency) ?? 'USD';
    const typeRaw = entityString(entities.lcType)?.toUpperCase();
    const subType = typeRaw === 'USANCE' ? 'USANCE' : 'SIGHT';
    const expiry = entityString(entities.expiryDate);
    const fallbackExpiry = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    return { type: 'IMPORT', subType, beneficiary, currency, amount, expiryDate: expiry ?? fallbackExpiry };
  },
});

export const submitLcMockTool: AgentTool<LcDraft, ReturnType<typeof tradeFinanceService.createLc>> = registerAgentTool({
  name: 'submit_lc_mock',
  description: 'Gửi yêu cầu mở LC đã xác nhận (tái dùng trade-finance.service.ts::createLc có sẵn — trạng thái PENDING_APPROVAL, không phát hành LC thật)',
  riskLevel: 'EXECUTE',
  requiresApproval: true,
  allowedRoles: [...MAKER_ADMIN],
  execute: (_ctx, draft) => {
    const fallbackExpiry = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    const fallbackShipment = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    return tradeFinanceService.createLc({
      type: draft.type,
      subType: draft.subType,
      beneficiary: draft.beneficiary,
      currency: draft.currency,
      amount: draft.amount,
      latestShipmentDate: fallbackShipment,
      expiryDate: draft.expiryDate ?? fallbackExpiry,
    });
  },
});

// ---- create_guarantee: draft (PREPARE) + submit (EXECUTE) -------------------------------------

export interface GuaranteeDraft {
  type: 'BID_BOND' | 'PERFORMANCE_BOND' | 'ADVANCE_PAYMENT' | 'PAYMENT_GUARANTEE';
  beneficiary: string;
  currency: string;
  amount: number;
  expiryDate: string;
}

export const createGuaranteeDraftTool: AgentTool<{ entities: AgentEntities }, GuaranteeDraft> = registerAgentTool({
  name: 'create_guarantee_draft',
  description: 'Chuẩn bị bản nháp yêu cầu phát hành bảo lãnh để khách hàng xác nhận',
  riskLevel: 'PREPARE',
  requiresApproval: false,
  allowedRoles: [...MAKER_ADMIN],
  execute: (_ctx, { entities }) => {
    const amount = entityNumber(entities.guaranteeAmount);
    if (!amount) throw new Error('create_guarantee_draft requires guaranteeAmount — caller must check missingFields first');
    const beneficiary = entityString(entities.beneficiary) ?? entityString(entities.beneficiaryName) ?? 'Beneficiary (demo)';
    const currency = entityString(entities.currency) ?? 'VND';
    const typeRaw = entityString(entities.guaranteeType)?.toUpperCase();
    const type = typeRaw === 'PERFORMANCE_BOND' || typeRaw === 'ADVANCE_PAYMENT' || typeRaw === 'PAYMENT_GUARANTEE' ? typeRaw : 'BID_BOND';
    const fallbackExpiry = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    return { type, beneficiary, currency, amount, expiryDate: entityString(entities.expiryDate) ?? fallbackExpiry };
  },
});

export const submitGuaranteeMockTool: AgentTool<GuaranteeDraft, ReturnType<typeof tradeFinanceService.createGuarantee>> = registerAgentTool({
  name: 'submit_guarantee_mock',
  description: 'Gửi yêu cầu phát hành bảo lãnh đã xác nhận (tái dùng trade-finance.service.ts::createGuarantee có sẵn)',
  riskLevel: 'EXECUTE',
  requiresApproval: true,
  allowedRoles: [...MAKER_ADMIN],
  execute: (_ctx, draft) =>
    tradeFinanceService.createGuarantee({
      type: draft.type,
      beneficiary: draft.beneficiary,
      currency: draft.currency,
      amount: draft.amount,
      expiryDate: draft.expiryDate,
    }),
});

// ---- create_collection: draft (PREPARE) + submit (EXECUTE) ------------------------------------

export interface CollectionDraft {
  type: 'IMPORT' | 'EXPORT';
  subType: 'DP' | 'DA';
  direction: 'INWARD' | 'OUTWARD';
  drawer: string;
  drawee: string;
  currency: string;
  amount: number;
  dueDate: string;
}

export const createCollectionDraftTool: AgentTool<{ entities: AgentEntities }, CollectionDraft> = registerAgentTool({
  name: 'create_collection_draft',
  description: 'Chuẩn bị bản nháp yêu cầu tạo bộ nhờ thu để khách hàng xác nhận',
  riskLevel: 'PREPARE',
  requiresApproval: false,
  allowedRoles: [...MAKER_ADMIN],
  execute: (_ctx, { entities }) => {
    const amount = entityNumber(entities.amount);
    if (!amount) throw new Error('create_collection_draft requires amount — caller must check missingFields first');
    const currency = entityString(entities.currency) ?? 'USD';
    const counterparty = entityString(entities.beneficiaryName) ?? entityString(entities.beneficiary) ?? 'Đối tác (demo)';
    const fallbackDue = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    return {
      type: 'EXPORT',
      subType: 'DP',
      direction: 'OUTWARD',
      drawer: 'ABC Manufacturing JSC',
      drawee: counterparty,
      currency,
      amount,
      dueDate: entityString(entities.date) ?? fallbackDue,
    };
  },
});

export const submitCollectionMockTool: AgentTool<CollectionDraft, ReturnType<typeof tradeFinanceService.createCollection>> = registerAgentTool({
  name: 'submit_collection_mock',
  description: 'Gửi yêu cầu tạo bộ nhờ thu đã xác nhận (tái dùng trade-finance.service.ts::createCollection có sẵn)',
  riskLevel: 'EXECUTE',
  requiresApproval: true,
  allowedRoles: [...MAKER_ADMIN],
  execute: (_ctx, draft) =>
    tradeFinanceService.createCollection({
      type: draft.type,
      subType: draft.subType,
      direction: draft.direction,
      drawer: draft.drawer,
      drawee: draft.drawee,
      currency: draft.currency,
      amount: draft.amount,
      dueDate: draft.dueDate,
    }),
});
