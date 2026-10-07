// Recalled batches published by Nestlé Russia.
// Source: https://www.nestlebaby.ru/official-answer-otzyv
// Batch number = 10-character code on the bottom of the can.

export interface RecalledProduct {
  name: string;
  weight: string;
  lots: string[];
}

export const SOURCE_URL = 'https://www.nestlebaby.ru/official-answer-otzyv';
/** Date the list below was last checked against the source page. */
export const DATA_CHECKED_AT = '2026-10-07';
export const PRODUCTION_PERIOD = { from: '15.04.2025', to: '27.11.2025' };
export const HOTLINE = '8 800 700 7979';

export const RECALLED_PRODUCTS: RecalledProduct[] = [
  { name: 'NAN 1 OPTIPRO', weight: '400 г', lots: ['51510346AB'] },
  {
    name: 'NAN 1 OPTIPRO',
    weight: '800 г',
    lots: ['51490346AA', '51750346AB', '51760346AC', '51800346AB', '51810346AA', '51910346AA', '52180346AC'],
  },
  {
    name: 'NAN 1 OPTIPRO',
    weight: '1050 г',
    lots: ['51740346BA', '51750346BB', '51910346BB', '51920346BA', '52190346BA', '52200346BA'],
  },
  {
    name: 'NESTOGEN КОМФОРТ PLUS',
    weight: '600 г',
    lots: ['5124080611', '5125080611', '5185080611', '5228080611', '5331080611'],
  },
  { name: 'NAN SUPREME', weight: '400 г', lots: ['52790742C1'] },
  { name: 'NAN SUPREME', weight: '800 г', lots: ['52750742F1'] },
  { name: 'NAN 2 OPTIPRO', weight: '400 г', lots: ['51550017A1', '52920017A1', '53130017A1'] },
  {
    name: 'NAN 2 OPTIPRO',
    weight: '800 г',
    lots: [
      '51240017C1', '51240017C2', '51420017C6', '51430017C2', '51570017C1', '51660017C5',
      '51670017C1', '52800017C2', '52940017C3', '52950017C1', '53130017C1', '53140017C1',
    ],
  },
  {
    name: 'NAN 2 OPTIPRO',
    weight: '1050 г',
    lots: [
      '5200167811', '5200167821', '5201167811', '5201167821', '5218167821', '5219167811',
      '5219167821', '5220167821', '5240167821', '5241167821', '5256167811',
    ],
  },
  { name: 'NAN КИСЛОМОЛОЧНЫЙ', weight: '400 г', lots: ['51220017A2', '51230017A1'] },
  { name: 'PRENAN', weight: '400 г', lots: ['52560346AA'] },
  {
    name: 'ALFARÉ AMINO',
    weight: '400 г',
    lots: ['51050017Y2', '51470017Y1', '51480017Y1', '52730017Y1', '52870017Y3'],
  },
  { name: 'NAN БЕЗЛАКТОЗНЫЙ', weight: '400 г', lots: ['51400346AA', '51410346AA'] },
];

/** Products the source explicitly lists as not affected. */
export const NOT_AFFECTED = [
  'NESTOGEN 1–4',
  'NAN 3 OPTIPRO и NAN 4 OPTIPRO',
  'каши NESTLÉ и GERBER (Вологда)',
  'другие партии NAN, NESTOGEN КОМФОРТ PLUS и ALFARÉ AMINO',
];
