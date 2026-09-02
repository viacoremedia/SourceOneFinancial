/**
 * Client-side Rep Display Name Resolution
 * Maps raw handles / emails to full readable display names.
 */

const REP_NAME_MAP: Record<string, string> = {
  gott: 'George Ott',
  george: 'George Ott',
  jharrington1: 'John Harrington',
  jharrington: 'John Harrington',
  johnh: 'John Harrington',
  johnharrington: 'John Harrington',
  jsmith: 'Jeff Smith',
  jweller: 'Janet Weller',
  janetweller: 'Janet Weller',
  janet: 'Janet Weller',
  jeff: 'Janet Weller',
  joe: 'Janet Weller',
  'janet harrington': 'John Harrington',
  'jeff weller': 'Janet Weller',
  'joe weller': 'Janet Weller',
  'john harrington': 'John Harrington',
  'john': 'John Harrington',
  wstoutimore: 'Ward Stoutimore',
  ward: 'Ward Stoutimore',
  wayne: 'Ward Stoutimore',
  waynestoutimore: 'Ward Stoutimore',
  'ward stoutimore': 'Ward Stoutimore',
  'wayne stoutimore': 'Ward Stoutimore',
  pcarter: 'Pam Carter',
  pam: 'Pam Carter',
  pamcarter: 'Pam Carter',
  'pam carter': 'Pam Carter',
  ljablonoski: 'Larry Jablonoski',
  larryj: 'Larry Jablonoski',
  larry: 'Larry Jablonoski',
  larryjablonoski: 'Larry Jablonoski',
  'larry jablonoski': 'Larry Jablonoski',
  jrubi: 'John Rubi',
  johnrubi: 'John Rubi',
  'john rubi': 'John Rubi',
  edominguez: 'Ericka Dominguez',
  ericka: 'Ericka Dominguez',
  erickadominguez: 'Ericka Dominguez',
  'ericka dominguez': 'Ericka Dominguez',
  gcoulombe: 'Genevieve Coulombe',
  genevieve: 'Genevieve Coulombe',
  gary: 'Genevieve Coulombe',
  garycoulombe: 'Genevieve Coulombe',
  'genevieve coulombe': 'Genevieve Coulombe',
  'gary coulombe': 'Genevieve Coulombe',
  dzilberchtein: 'Dan Zilberchtein',
  daniilz: 'Dan Zilberchtein',
  danillz: 'Dan Zilberchtein',
  danz: 'Dan Zilberchtein',
  dan: 'Dan Zilberchtein',
  daniil: 'Dan Zilberchtein',
  danzilberchtein: 'Dan Zilberchtein',
  'dan zilberchtein': 'Dan Zilberchtein',
  'daniil zilberchtein': 'Dan Zilberchtein',
  zilberchtein: 'Dan Zilberchtein',
  bsweere: 'Bruce Sweere',
  bruce: 'Bruce Sweere',
  tderouin: 'Tony DeRouin',
  tony: 'Tony DeRouin',
  skimble: 'Steve Kimble',
  steve: 'Steve Kimble',
  nboly: 'N Boly',
  mschultz1: 'Mandi Schultz',
  mandi: 'Mandi Schultz',
  mandy: 'Mandi Schultz',
  s1house: 'S1 House',
  house: 'S1 House',
  's1 house': 'S1 House',
};

export function resolveRepDisplayName(handle?: string | null): string {
  if (!handle) return 'Unassigned';
  const raw = handle.trim();
  const exactClean = raw.toLowerCase().replace(/@.*/, '');
  if (REP_NAME_MAP[exactClean]) return REP_NAME_MAP[exactClean];
  
  // Try matching with digits stripped (e.g. jharrington1 -> jharrington)
  const noNum = exactClean.replace(/[0-9]/g, '');
  if (REP_NAME_MAP[noNum]) return REP_NAME_MAP[noNum];

  // Fallback: capitalize if single word / short
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
