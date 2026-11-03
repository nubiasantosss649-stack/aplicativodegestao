import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { env } from './env';

/**
 * Integração com o SDK do RevenueCat (Google Play Billing / Apple IAP).
 * - Disponível apenas em builds nativos com as chaves públicas configuradas.
 * - O app NUNCA concede Pro sozinho: a liberação vem do servidor (webhook/sync).
 */

type PurchasesModule = typeof import('react-native-purchases');

let mod: PurchasesModule | null = null;
let configuredFor: string | null = null;

function apiKey(): string {
  if (Platform.OS === 'ios') return env.revenueCatIosKey;
  if (Platform.OS === 'android') return env.revenueCatAndroidKey;
  return '';
}

export function isBillingAvailable(): boolean {
  return Platform.OS !== 'web' && apiKey().length > 0;
}

function load(): PurchasesModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod ??= require('react-native-purchases') as PurchasesModule;
  return mod;
}

/** Configura/identifica o usuário no RevenueCat com o mesmo id do Supabase. */
export async function identifyPurchasesUser(userId: string): Promise<void> {
  if (!isBillingAvailable()) return;
  const Purchases = load().default;
  if (configuredFor === userId) return;
  if (configuredFor == null && !(await Purchases.isConfigured())) {
    if (env.appEnv !== 'production') await Purchases.setLogLevel(load().LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: apiKey(), appUserID: userId });
  } else {
    await Purchases.logIn(userId);
  }
  configuredFor = userId;
}

export async function resetPurchasesUser(): Promise<void> {
  if (!isBillingAvailable() || configuredFor == null) return;
  try {
    await load().default.logOut();
  } catch {
    // usuário anônimo: nada a fazer
  }
  configuredFor = null;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isBillingAvailable()) return null;
  const offerings = await load().default.getOfferings();
  return offerings.current;
}

/** Pacote mensal da oferta atual (configurada no painel do RevenueCat). */
export function monthlyPackage(offering: PurchasesOffering | null): PurchasesPackage | null {
  if (!offering) return null;
  return offering.monthly ?? offering.availablePackages[0] ?? null;
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending';

export async function purchase(pkg: PurchasesPackage): Promise<{ outcome: PurchaseOutcome; customerInfo?: CustomerInfo }> {
  const m = load();
  try {
    const { customerInfo } = await m.default.purchasePackage(pkg);
    return { outcome: 'purchased', customerInfo };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === m.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { outcome: 'cancelled' };
    if (code === m.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { outcome: 'pending' };
    throw e;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return load().default.restorePurchases();
}

/** URL da loja para gerenciar/cancelar a assinatura. */
export async function managementUrl(): Promise<string> {
  if (isBillingAvailable()) {
    try {
      const info = await load().default.getCustomerInfo();
      if (info.managementURL) return info.managementURL;
    } catch {
      // usa o padrão abaixo
    }
  }
  return Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
}

/** Elegibilidade do teste grátis (iOS informa; Android aplica automaticamente pela loja). */
export async function isEligibleForIntro(productId: string): Promise<boolean | null> {
  if (!isBillingAvailable() || Platform.OS !== 'ios') return null;
  const m = load();
  const result = await m.default.checkTrialOrIntroductoryPriceEligibility([productId]);
  const status = result[productId]?.status;
  if (status === m.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) return true;
  if (status === m.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE) return false;
  return null;
}

/** Oferta introdutória do produto (iOS: introPrice; Android: fase gratuita da opção padrão). */
export function introOfferOf(pkg: PurchasesPackage | null): { price: number; periodUnit: string; periodNumberOfUnits: number } | null {
  if (!pkg) return null;
  const p = pkg.product;
  if (p.introPrice) return p.introPrice;
  const free = p.defaultOption?.freePhase;
  if (free) return { price: 0, periodUnit: free.billingPeriod.unit, periodNumberOfUnits: free.billingPeriod.value };
  return null;
}
