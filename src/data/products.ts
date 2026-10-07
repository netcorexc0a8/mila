import type { RecalledProduct } from './recall';

export type CanTone = 'blue' | 'teal' | 'green' | 'gold' | 'purple';

export interface ProductInfo {
  title: string;
  description: string;
  /** Big number printed on the can (stage), if any. */
  stage?: string;
  /** Short line name printed on the can art. */
  brand: string;
  tone: CanTone;
}

const INFO: Record<string, Omit<ProductInfo, 'description'> & { kind: string }> = {
  'NAN 1 OPTIPRO': { title: 'NAN 1 Optipro', kind: 'Сухая молочная смесь для детей с рождения', stage: '1', brand: 'NAN', tone: 'blue' },
  'NAN 2 OPTIPRO': { title: 'NAN 2 Optipro', kind: 'Сухая молочная смесь для детей с 6 месяцев', stage: '2', brand: 'NAN', tone: 'blue' },
  'NESTOGEN КОМФОРТ PLUS': { title: 'Nestogen Комфорт Plus', kind: 'Сухая молочная смесь', brand: 'NESTOGEN', tone: 'green' },
  'NAN SUPREME': { title: 'NAN Supreme', kind: 'Сухая молочная смесь', brand: 'NAN', tone: 'gold' },
  'NAN КИСЛОМОЛОЧНЫЙ': { title: 'NAN Кисломолочный', kind: 'Сухая кисломолочная смесь', brand: 'NAN', tone: 'teal' },
  PRENAN: { title: 'PreNAN', kind: 'Смесь для недоношенных детей', brand: 'PreNAN', tone: 'blue' },
  'ALFARÉ AMINO': { title: 'Alfaré Amino', kind: 'Аминокислотная смесь, специальное питание', brand: 'ALFARÉ', tone: 'purple' },
  'NAN БЕЗЛАКТОЗНЫЙ': { title: 'NAN Безлактозный', kind: 'Безлактозная сухая смесь', brand: 'NAN', tone: 'teal' },
};

export function productInfo(p: RecalledProduct): ProductInfo {
  const i = INFO[p.name];
  if (!i) return { title: p.name, description: p.weight, brand: '', tone: 'blue' };
  return { title: i.title, description: `${i.kind}, ${p.weight}`, stage: i.stage, brand: i.brand, tone: i.tone };
}

/** Shown when the batch is not recalled: the product cannot be told from the batch number alone. */
export const UNKNOWN_PRODUCT: ProductInfo = {
  title: 'Детская смесь',
  description: 'Номер партии не входит в список отзыва Nestlé',
  brand: '',
  tone: 'blue',
};
