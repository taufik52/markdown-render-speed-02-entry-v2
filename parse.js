// SpeedyMark — a fast CommonMark 0.31.2 + GFM renderer.
// parse(markdown) returns exactly the HTML marked 18.1.3 renders with its
// default options (GFM on). Written from scratch against the CommonMark and
// GFM specs; no third-party code, no dependencies.

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape &, <, >, ", ' for text and attribute values. */
function escapeText(s) {
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const e = ESCAPE_MAP[s[i]];
    if (e !== undefined) {
      if (i > start) out += s.slice(start, i);
      out += e;
      start = i + 1;
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

/** marked's cleanUrl: encodeURI, then un-escape %25 back to %. null on failure. */
function cleanUrl(href) {
  try {
    return encodeURI(href).replace(/%25/g, '%');
  } catch {
    return null;
  }
}

function isSpaceOrTab(c) { return c === 32 || c === 9; }
function isWhitespace(c) { return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13; }
function isDigit(c) { return c >= 48 && c <= 57; }
function isAlpha(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
function isAlnum(c) { return isAlpha(c) || isDigit(c); }
/** ASCII punctuation per CommonMark: ! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~ */
function isAsciiPunct(c) {
  return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126);
}
function isPunctChar(ch) {
  if (!ch) return false;
  const c = ch.codePointAt(0);
  if (c < 128) return isAsciiPunct(c);
  // Unicode punctuation (general categories P* plus symbols S* count as punctuation
  // for flanking purposes in CommonMark; approximated by a broad check).
  return /\p{P}|\p{S}/u.test(ch);
}

// ---------------------------------------------------------------------------
// HTML entities
// ---------------------------------------------------------------------------
// Named entities (HTML5). A lookup table for the entities that occur in the
// CommonMark/GFM spec examples and in generated documents, plus the common
// Latin/Greek/symbol set. Unknown names stay literal, exactly like marked.

const ENTITIES = {
  amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"',
  apos: "'", nbsp: '\u00A0', iexcl: '\u00A1', cent: '\u00A2', pound: '\u00A3',
  curren: '\u00A4', yen: '\u00A5', brvbar: '\u00A6', sect: '\u00A7', uml: '\u00A8',
  copy: '\u00A9', COPY: '\u00A9', ordf: '\u00AA', laquo: '\u00AB', not: '\u00AC',
  shy: '\u00AD', reg: '\u00AE', REG: '\u00AE', macr: '\u00AF', deg: '\u00B0',
  plusmn: '\u00B1', sup2: '\u00B2', sup3: '\u00B3', acute: '\u00B4', micro: '\u00B5',
  para: '\u00B6', middot: '\u00B7', cedil: '\u00B8', sup1: '\u00B9', ordm: '\u00BA',
  raquo: '\u00BB', frac14: '\u00BC', frac12: '\u00BD', frac34: '\u00BE',
  iquest: '\u00BF', Agrave: '\u00C0', Aacute: '\u00C1', Acirc: '\u00C2',
  Atilde: '\u00C3', Auml: '\u00C4', Aring: '\u00C5', AElig: '\u00C6',
  Ccedil: '\u00C7', Egrave: '\u00C8', Eacute: '\u00C9', Ecirc: '\u00CA',
  Euml: '\u00CB', Igrave: '\u00CC', Iacute: '\u00CD', Icirc: '\u00CE',
  Iuml: '\u00CF', ETH: '\u00D0', Ntilde: '\u00D1', Ograve: '\u00D2',
  Oacute: '\u00D3', Ocirc: '\u00D4', Otilde: '\u00D5', Ouml: '\u00D6',
  times: '\u00D7', Oslash: '\u00D8', Ugrave: '\u00D9', Uacute: '\u00DA',
  Ucirc: '\u00DB', Uuml: '\u00DC', Yacute: '\u00DD', THORN: '\u00DE',
  szlig: '\u00DF', agrave: '\u00E0', aacute: '\u00E1', acirc: '\u00E2',
  atilde: '\u00E3', auml: '\u00E4', aring: '\u00E5', aelig: '\u00E6',
  ccedil: '\u00E7', egrave: '\u00E8', eacute: '\u00E9', ecirc: '\u00EA',
  euml: '\u00EB', igrave: '\u00EC', iacute: '\u00ED', icirc: '\u00EE',
  iuml: '\u00EF', eth: '\u00F0', ntilde: '\u00F1', ograve: '\u00F2',
  oacute: '\u00F3', ocirc: '\u00F4', otilde: '\u00F5', ouml: '\u00F6',
  divide: '\u00F7', oslash: '\u00F8', ugrave: '\u00F9', uacute: '\u00FA',
  ucirc: '\u00FB', uuml: '\u00FC', yacute: '\u00FD', thorn: '\u00FE',
  yuml: '\u00FF', OElig: '\u0152', oelig: '\u0153', Scaron: '\u0160',
  scaron: '\u0161', Yuml: '\u0178', fnof: '\u0192', circ: '\u02C6',
  tilde: '\u02DC', Alpha: '\u0391', Beta: '\u0392', Gamma: '\u0393',
  Delta: '\u0394', Epsilon: '\u0395', Zeta: '\u0396', Eta: '\u0397',
  Theta: '\u0398', Iota: '\u0399', Kappa: '\u039A', Lambda: '\u039B',
  Mu: '\u039C', Nu: '\u039D', Xi: '\u039E', Omicron: '\u039F', Pi: '\u03A0',
  Rho: '\u03A1', Sigma: '\u03A3', Tau: '\u03A4', Upsilon: '\u03A5',
  Phi: '\u03A6', Chi: '\u03A7', Psi: '\u03A8', Omega: '\u03A9',
  alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', delta: '\u03B4',
  epsilon: '\u03B5', zeta: '\u03B6', eta: '\u03B7', theta: '\u03B8',
  iota: '\u03B9', kappa: '\u03BA', lambda: '\u03BB', mu: '\u03BC', nu: '\u03BD',
  xi: '\u03BE', omicron: '\u03BF', pi: '\u03C0', rho: '\u03C1',
  sigmaf: '\u03C2', sigma: '\u03C3', tau: '\u03C4', upsilon: '\u03C5',
  phi: '\u03C6', chi: '\u03C7', psi: '\u03C8', omega: '\u03C9',
  thetasym: '\u03D1', upsih: '\u03D2', piv: '\u03D6', ensp: '\u2002',
  emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200C', zwj: '\u200D',
  lrm: '\u200E', rlm: '\u200F', ndash: '\u2013', mdash: '\u2014',
  lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201A', ldquo: '\u201C',
  rdquo: '\u201D', bdquo: '\u201E', dagger: '\u2020', Dagger: '\u2021',
  bull: '\u2022', hellip: '\u2026', permil: '\u2030', prime: '\u2032',
  Prime: '\u2033', lsaquo: '\u2039', rsaquo: '\u203A', oline: '\u203E',
  frasl: '\u2044', euro: '\u20AC', image: '\u2111', weierp: '\u2118',
  real: '\u211C', trade: '\u2122', TRADE: '\u2122', alefsym: '\u2135',
  larr: '\u2190', uarr: '\u2191', rarr: '\u2192', darr: '\u2193', harr: '\u2194',
  crarr: '\u21B5', lArr: '\u21D0', uArr: '\u21D1', rArr: '\u21D2',
  dArr: '\u21D3', hArr: '\u21D4', forall: '\u2200', part: '\u2202',
  exist: '\u2203', empty: '\u2205', nabla: '\u2207', isin: '\u2208',
  notin: '\u2209', ni: '\u220B', prod: '\u220F', sum: '\u2211',
  minus: '\u2212', lowast: '\u2217', radic: '\u221A', prop: '\u221D',
  infin: '\u221E', ang: '\u2220', and: '\u2227', or: '\u2228', cap: '\u2229',
  cup: '\u222A', int: '\u222B', there4: '\u2234', sim: '\u223C',
  cong: '\u2245', asymp: '\u2248', ne: '\u2260', equiv: '\u2261',
  le: '\u2264', ge: '\u2265', sub: '\u2282', sup: '\u2283', nsub: '\u2284',
  sube: '\u2286', supe: '\u2287', oplus: '\u2295', otimes: '\u2297',
  perp: '\u22A5', sdot: '\u22C5', lceil: '\u2308', rceil: '\u2309',
  lfloor: '\u230A', rfloor: '\u230B', lang: '\u2329', rang: '\u232A',
  loz: '\u25CA', spades: '\u2660', clubs: '\u2663', hearts: '\u2665',
  diams: '\u2666', Dcaron: '\u010E', dcaron: '\u010F', HilbertSpace: '\u210B',
  DifferentialD: '\u2146', ClockwiseContourIntegral: '\u2232',
  CounterClockwiseContourIntegral: '\u2233', Aacute2: '\u00C1',
  Abreve: '\u0102', abreve: '\u0103', Acy: '\u0410', acy: '\u0430',
  Afr: '\u{1D504}', afr: '\u{1D51E}', Agrave2: '\u00C0',
  aleph: '\u2135', Alpha2: '\u0391', Amacr: '\u0100', amacr: '\u0101',
  And: '\u2A53', andand: '\u2A55', andd: '\u2A5C', andslope: '\u2A58',
  andv: '\u2A5A', angmsd: '\u2221', angsph: '\u2222', angst: '\u00C5',
  Aogon: '\u0104', aogon: '\u0105', ap: '\u2248', apE: '\u2A70',
  ape: '\u224A', apid: '\u224B', apos2: "'", ApplyFunction: '\u2061',
  approx: '\u2248', approxeq: '\u224A', Aring2: '\u00C5', Ascr: '\u{1D49C}',
  ascr: '\u{1D4B6}', Assign: '\u2254', ast: '\u002A', asympeq: '\u224D',
  Atilde2: '\u00C3', Backslash: '\u2216', barv: '\u2AE7', Barv: '\u2AE7',
  barwed: '\u2305', bbrk: '\u23B5', bcy: '\u0431', Bcy: '\u0411',
  because: '\u2235', becaus: '\u2235', bemptyv: '\u29B0', bepsi: '\u03F6',
  bernoul: '\u212C', Bernoullis: '\u212C', bgr: '\u0431', bigcap: '\u22C2',
  bigcirc: '\u25EF', bigcup: '\u22C3', bigodot: '\u2A00', bigoplus: '\u2A01',
  bigotimes: '\u2A02', bigsqcup: '\u2A06', bigstar: '\u2605', bigtriangledown: '\u25BD',
  bigtriangleup: '\u25B3', biguplus: '\u2A04', bigvee: '\u22C1', bigwedge: '\u22C0',
  bkarow: '\u290D', blacklozenge: '\u29EB', blacksquare: '\u25AA',
  blacktriangle: '\u25B4', blacktriangledown: '\u25BE', blacktriangleleft: '\u25C2',
  blacktriangleright: '\u25B8', blank: '\u2423', blk12: '\u2592', blk14: '\u2591',
  blk34: '\u2593', block: '\u2588', bne: '=\u20E5', bnequiv: '\u2261\u20E5',
  bnot: '\u2310', bopf: '\u{1D553}', Bopf: '\u{1D539}', bot: '\u22A5',
  bottom: '\u22A5', bowtie: '\u22C8', boxbox: '\u29C9', boxdl: '\u2510',
  boxdL: '\u2555', boxDl: '\u2556', boxdL2: '\u2557', boxDr: '\u250C',
  boxdR: '\u2552', boxDr2: '\u2553', boxDR: '\u2554', boxh: '\u2500',
  boxH: '\u2550', boxhd: '\u252C', boxhD: '\u2565', boxHd: '\u2564',
  boxHD: '\u2566', boxhu: '\u2534', boxhU: '\u2568', boxHu: '\u2567',
  boxHU: '\u2569', boxminus: '\u229F', boxplus: '\u229E', boxtimes: '\u22A0',
  boxul: '\u2518', boxuL: '\u255B', boxUl: '\u255C', boxuL2: '\u255D',
  boxur: '\u2514', boxuR: '\u2558', boxUr: '\u2559', boxUR: '\u255A',
  boxv: '\u2502', boxV: '\u2551', boxvh: '\u253C', boxvH: '\u256A',
  boxVh: '\u256B', boxVH: '\u256C', boxvl: '\u2524', boxvL: '\u2561',
  boxVl: '\u2562', boxVL: '\u2563', boxvr: '\u251C', boxvR: '\u255E',
  boxVr: '\u255F', boxVR: '\u2560', bprime: '\u2035', breve: '\u02D8',
  Bscr: '\u212C', bscr: '\u{1D4B7}', bsemi: '\u204F', bsol: '\u005C',
  bsolb: '\u29C5', bsolhsub: '\u27C8', bull2: '\u2022', bump: '\u224E',
  bumpE: '\u2AAE', bumpe: '\u224F', Bumpeq: '\u224E', bumpeq: '\u224F',
  Cacute: '\u0106', cacute: '\u0107', Cap: '\u22D2', capand: '\u2A44',
  capbrcup: '\u2A49', capcap: '\u2A4B', capcup: '\u2A47', capdot: '\u2A40',
  CapitalDifferentialD: '\u2145', caps: '\u2229\uFE00', caret: '\u2041',
  caron: '\u02C7', Cayleys: '\u212D', ccaps: '\u2A4D', Ccaron: '\u010C',
  ccaron: '\u010D', Ccedil2: '\u00C7', Ccirc: '\u0108', ccirc: '\u0109',
  Cconint: '\u2230', ccup: '\u2A4C', ccups: '\u2A4C', Cdot: '\u010A',
  cdot: '\u010B', cedil2: '\u00B8', Cedilla: '\u00B8', cemptyv: '\u29B2',
  cent2: '\u00A2', CenterDot: '\u00B7', cfr: '\u{1D520}', Cfr: '\u212D',
  CHcy: '\u0427', chcy: '\u0447', check: '\u2713', checkmark: '\u2713',
  Chi: '\u03A7', chi: '\u03C7', circ2: '\u02C6', circeq: '\u2257',
  circledast: '\u229B', circledcirc: '\u229A', circleddash: '\u229D',
  CircleDot: '\u2299', circledR: '\u00AE', circledS: '\u24C8',
  CircleMinus: '\u2296', CirclePlus: '\u2295', CircleTimes: '\u2297',
  cir: '\u25CB', cire: '\u2257', cirE: '\u29C3', cirmid: '\u2AEF',
  cirscir: '\u29C2', clubs2: '\u2663', colon: '\u003A', Colon: '\u2237',
  Colone: '\u2A74', colone: '\u2254', coloneq: '\u2254', comma: '\u002C',
  commat: '\u0040', comp: '\u2201', compfn: '\u2218', complement: '\u2201',
  complexes: '\u2102', congdot: '\u2A6D', Congruent: '\u2261',
  conint: '\u222E', Conint: '\u222F', ContourIntegral: '\u222E',
  copf: '\u{1D554}', Copf: '\u2102', coprod: '\u2210', Coproduct: '\u2210',
  copy2: '\u00A9', copysr: '\u2117', CounterClockwiseContourIntegral2: '\u2233',
  crarr2: '\u21B5', cross: '\u2717', Cross: '\u2A2F', Cscr: '\u{1D49E}',
  cscr: '\u{1D4B8}', csub: '\u2ACF', csube: '\u2AD1', csup: '\u2AD0',
  csupe: '\u2AD2', ctdot: '\u22EF', cudarrl: '\u2938', cudarrr: '\u2935',
  cuepr: '\u22DE', cuesc: '\u22DF', cularr: '\u21B6', cularrp: '\u293D',
  cupbrcap: '\u2A48', cupcap: '\u2A46', CupCap: '\u224D', cupcup: '\u2A4A',
  cupdot: '\u2A4A', cupor: '\u2A45', cups: '\u222A\uFE00', curarr: '\u21B7',
  curarrm: '\u293C', curlyeqprec: '\u22DE', curlyeqsucc: '\u22DF',
  curlyvee: '\u22CE', curlywedge: '\u22CF', curren2: '\u00A4', curvearrowleft: '\u21B6',
  curvearrowright: '\u21B7', cuvee: '\u22CE', cuwed: '\u22CF', cwconint: '\u2232',
  cwint: '\u2231', cylcty: '\u232D', Dagger2: '\u2021', dagger2: '\u2020',
  daleth: '\u2138', Darr: '\u21A1', dArr2: '\u21D3', darr2: '\u2193',
  dash: '\u2010', Dashv: '\u2AE4', dashv: '\u22A3', dbkarow: '\u290F',
  dblac: '\u02DD', Dcaron2: '\u010E', dcy: '\u0434', Dcy: '\u0414',
  DD: '\u2145', dd: '\u2146', ddotseq: '\u2A77', deg2: '\u00B0',
  Del: '\u2207', Delta2: '\u0394', delta2: '\u03B4', demptyv: '\u29B1',
  dfisht: '\u297F', Dfr: '\u{1D507}', dfr: '\u{1D521}', dHar: '\u2965',
  dharl: '\u21C3', dharr: '\u21C2', DiacriticalAcute: '\u00B4',
  DiacriticalDot: '\u02D9', DiacriticalDoubleAcute: '\u02DD',
  DiacriticalGrave: '\u0060', DiacriticalTilde: '\u02DC', diam: '\u22C4',
  Diamond: '\u22C4', diamond: '\u22C4', diamondsuit: '\u2666', diams2: '\u2666',
  die: '\u00A8', DifferentialD2: '\u2146', digamma: '\u03DD', disin: '\u22F2',
  div: '\u00F7', divideontimes: '\u22C7', divonx: '\u22C7', DJcy: '\u0402',
  djcy: '\u0452', dlcorn: '\u231E', dlcrop: '\u230D', dollar: '\u0024',
  Dopf: '\u{1D53B}', dopf: '\u{1D555}', Dot: '\u00A8', dot: '\u02D9',
  DotDot: '\u20DC', doteq: '\u2250', doteqdot: '\u2251', DotEqual: '\u2250',
  dotminus: '\u2238', dotplus: '\u2214', dotsquare: '\u22A1',
  doublebarwedge: '\u2306', DoubleContourIntegral: '\u222F',
  DoubleDot: '\u00A8', DoubleDownArrow: '\u21D3', DoubleLeftArrow: '\u21D0',
  DoubleLeftRightArrow: '\u21D4', DoubleLeftTee: '\u2AE4',
  DoubleLongLeftArrow: '\u27F8', DoubleLongLeftRightArrow: '\u27FA',
  DoubleLongRightArrow: '\u27F9', DoubleRightArrow: '\u21D2',
  DoubleRightTee: '\u22A8', DoubleUpArrow: '\u21D1',
  DoubleUpDownArrow: '\u21D5', DoubleVerticalBar: '\u2225',
  DownArrow: '\u2193', Downarrow: '\u21D3', downarrow: '\u2193',
  DownArrowBar: '\u2913', DownArrowUpArrow: '\u21F5', DownBreve: '\u0311',
  downdownarrows: '\u21CA', downharpoonleft: '\u21C3',
  downharpoonright: '\u21C2', DownLeftRightVector: '\u2950',
  DownLeftTeeVector: '\u295E', DownLeftVector: '\u21BD',
  DownLeftVectorBar: '\u2956', DownRightTeeVector: '\u295F',
  DownRightVector: '\u21C1', DownRightVectorBar: '\u2957',
  DownTee: '\u22A4', DownTeeArrow: '\u21A7', drbkarow: '\u2910',
  drcorn: '\u231F', drcrop: '\u230C', Dscr: '\u{1D49F}', dscr: '\u{1D4B9}',
  DScy: '\u0405', dscy: '\u0455', dsol: '\u29F6', Dstrok: '\u0110',
  dstrok: '\u0111', dtdot: '\u22F1', dtri: '\u25BF', dtrif: '\u25BE',
  duarr: '\u21F5', duhar: '\u296F', dwangle: '\u29A6', DZcy: '\u040F',
  dzcy: '\u045F', dzigrarr: '\u27FF', Eacute2: '\u00C9', easter: '\u2A6E',
  Ecaron: '\u011A', ecaron: '\u011B', Ecirc2: '\u00CA', ecir: '\u2256',
  ecolon: '\u2255', Ecy: '\u042D', ecy: '\u044D', eDDot: '\u2A77',
  Edot: '\u0116', eDot: '\u2251', edot: '\u0117', ee: '\u2147',
  efDot: '\u2252', Efr: '\u{1D508}', efr: '\u{1D522}', eg: '\u2A9A',
  Egrave2: '\u00C8', egs: '\u2A96', egsdot: '\u2A98', el: '\u2A99',
  elinters: '\u23E7', ell: '\u2113', els: '\u2A95', elsdot: '\u2A97',
  Emacr: '\u0112', emacr: '\u0113', emptyv: '\u2205', EmptySmallSquare: '\u25FB',
  EmptyVerySmallSquare: '\u25AB', emsp2: '\u2003', ensp2: '\u2002',
  Eogon: '\u0118', eogon: '\u0119', Eopf: '\u{1D53C}', eopf: '\u{1D556}',
  epar: '\u22D5', eparsl: '\u29E3', eplus: '\u2A71', epsi: '\u03B5',
  Epsilon2: '\u0395', epsilon2: '\u03B5', epsiv: '\u03F5', eqcirc: '\u2256',
  eqcolon: '\u2255', eqsim: '\u2242', eqslantgtr: '\u2A96',
  eqslantless: '\u2A95', Equal: '\u2A75', equals: '\u003D', EqualTilde: '\u2242',
  equest: '\u225F', Equilibrium: '\u21CC', equivDD: '\u2A78', eqvparsl: '\u29E5',
  erarr: '\u2971', erDot: '\u2253', Escr: '\u2130', escr: '\u212F',
  esdot: '\u2250', Esim: '\u2A73', esim: '\u2242', Eta2: '\u0397',
  eta2: '\u03B7', ETH2: '\u00D0', eth2: '\u00F0', Euml2: '\u00CB',
  euml2: '\u00EB', euro2: '\u20AC', excl: '\u0021', exist2: '\u2203',
  expectation: '\u2130', exponentiale: '\u2147', fallingdotseq: '\u2252',
  Fcy: '\u0424', fcy: '\u0444', female: '\u2640', ffilig: '\uFB03',
  fflig: '\uFB00', ffllig: '\uFB04', Ffr: '\u{1D509}', ffr: '\u{1D523}',
  filig: '\uFB01', fjlig: 'fj', flat: '\u266D', fllig: '\uFB02',
  fltns: '\u25B1', fnof2: '\u0192', Fopf: '\u{1D53D}', fopf: '\u{1D557}',
  fork: '\u22D4', forkv: '\u2AD9', fpartint: '\u2A0D', frac12_2: '\u00BD',
  frac13: '\u2153', frac15: '\u2155', frac16: '\u2159', frac18: '\u215B',
  frac23: '\u2154', frac25: '\u2156', frac35: '\u2157', frac38: '\u215C',
  frac45: '\u2158', frac56: '\u215A', frac58: '\u215D', frac78: '\u215E',
  frasl2: '\u2044', frown: '\u2322', Fscr: '\u2131', fscr: '\u{1D4BB}',
  gacute: '\u01F5', Gamma2: '\u0393', gamma2: '\u03B3', Gammad: '\u03DC',
  gammad: '\u03DD', gap: '\u2A86', Gbreve: '\u011E', gbreve: '\u011F',
  Gcedil: '\u0122', Gcirc: '\u011C', gcirc: '\u011D', Gcy: '\u0413',
  gcy: '\u0433', Gdot: '\u0120', gdot: '\u0121', ge2: '\u2265',
  gel: '\u22DB', geq: '\u2265', geqq: '\u2267', geqslant: '\u2A7E',
  ges: '\u2A7E', gescc: '\u2AA9', gesdot: '\u2A80', gesdoto: '\u2A82',
  gesdotol: '\u2A84', gesl: '\u22DB\uFE00', gesles: '\u2A94',
  Gfr: '\u{1D50A}', gfr: '\u{1D524}', gg: '\u226B', Gg: '\u22D9',
  ggg: '\u22D9', gimel: '\u2137', GJcy: '\u0403', gjcy: '\u0453',
  gla: '\u2AA5', gl: '\u2277', glE: '\u2A92', glj: '\u2AA4',
  gnap: '\u2A8A', gnapprox: '\u2A8A', gnE: '\u2269', gne: '\u2A88',
  gneq: '\u2269', gneqq: '\u2269', gnsim: '\u22E7', Gopf: '\u{1D53E}',
  gopf: '\u{1D558}', grave: '\u0060', GreaterEqual: '\u2265',
  GreaterEqualLess: '\u22DB', GreaterFullEqual: '\u2267',
  GreaterGreater: '\u2AA2', GreaterLess: '\u2277', GreaterSlantEqual: '\u2A7E',
  GreaterTilde: '\u2273', Gscr: '\u{1D4A2}', gscr: '\u210A',
  gsim: '\u2273', gsime: '\u2A8E', gsiml: '\u2A90', Gt: '\u226B',
  GT: '\u003E', Gt2: '\u226B', gt2: '\u003E', gtcc: '\u2AA7',
  gtcir: '\u2A7A', gtdot: '\u22D7', gtlPar: '\u2995', gtquest: '\u2A7C',
  gtrapprox: '\u2A86', gtrarr: '\u2978', gtrdot: '\u22D7', gtreqless: '\u22DB',
  gtreqqless: '\u2A88', gtrless: '\u2277', gtrsim: '\u2273', gvertneqq: '\u2269\uFE00',
  gvnE: '\u2269\uFE00', Hacek: '\u02C7', hairsp: '\u200A', half: '\u00BD',
  hamilt: '\u210B', HARDcy: '\u042A', hardcy: '\u044A', harr2: '\u2194',
  harrcir: '\u2948', hArr2: '\u21D4', harrw: '\u21AD', Hat: '\u005E',
  hbar: '\u210F', Hcirc: '\u0124', hcirc: '\u0125', hearts2: '\u2665',
  heartsuit: '\u2665', hellip2: '\u2026', hercon: '\u22B9', Hfr: '\u210C',
  hfr: '\u{1D525}', HilbertSpace2: '\u210B', hksearow: '\u2925', hkswarow: '\u2926',
  hoarr: '\u21FF', homtht: '\u223B', hookleftarrow: '\u21A9',
  hookrightarrow: '\u21AA', hopf: '\u{1D559}', Hopf: '\u210D',
  horbar: '\u2015', HorizontalLine: '\u2500', Hscr: '\u210B', hscr: '\u{1D4BD}',
  hslash: '\u210F', Hstrok: '\u0126', hstrok: '\u0127', HumpDownHump: '\u224E',
  HumpEqual: '\u224F', hybull: '\u2043', hyphen: '\u2010', Iacute2: '\u00CD',
  ic: '\u2063', Icirc2: '\u00CE', icirc2: '\u00EE', Icy: '\u0418',
  icy: '\u0438', Idot: '\u0130', iecy: '\u0435', IEE: '\u2148',
  iexcl2: '\u00A1', iff: '\u21D4', Ifr: '\u2111', ifr: '\u{1D526}',
  Igrave2: '\u00CC', ii: '\u2148', iiiint: '\u2A0C', iiint: '\u222D',
  iinfin: '\u29DC', iiota: '\u2129', IJlig: '\u0132', ijlig: '\u0133',
  Im: '\u2111', Imacr: '\u012A', imacr: '\u012B', image2: '\u2111',
  imagline: '\u2110', imagpart: '\u2111', imath: '\u0131', imof: '\u22B7',
  imped: '\u01B5', Implies: '\u21D2', in: '\u2208', incare: '\u2105',
  inf: '\u221E', infin2: '\u221E', infintie: '\u29DD', inodot: '\u0131',
  intcal: '\u22BA', Integers: '\u2124', Integral: '\u222B', intlarhk: '\u2A17',
  intprod: '\u2A3C', Iogon: '\u012E', iogon: '\u012F', Iopf: '\u{1D540}',
  iopf: '\u{1D55A}', Iota2: '\u0399', iota2: '\u03B9', iprod: '\u2A3C',
  iquest2: '\u00BF', iscr: '\u{1D4BE}', Iscr: '\u2110', isin2: '\u2208',
  isindot: '\u22F5', isinE: '\u22F9', isins: '\u22F4', isinsv: '\u22F3',
  isinv: '\u2208', it: '\u2062', Itilde: '\u0128', itilde: '\u0129',
  Iukcy: '\u0406', iukcy: '\u0456', Iuml2: '\u00CF', iuml2: '\u00EF',
  Jcirc: '\u0134', jcirc: '\u0135', Jcy: '\u0419', jcy: '\u0439',
  Jfr: '\u{1D50D}', jfr: '\u{1D527}', jmath: '\u0237', Jopf: '\u{1D541}',
  jopf: '\u{1D55B}', Jscr: '\u{1D4A5}', jscr: '\u{1D4BF}', Jsercy: '\u0408',
  jsercy: '\u0458', Jukcy: '\u0404', jukcy: '\u0444', Kappa2: '\u039A',
  kappa2: '\u03BA', kappav: '\u03F0', Kcedil: '\u0136', kcedil: '\u0137',
  Kcy: '\u041A', kcy: '\u043A', Kfr: '\u{1D50E}', kfr: '\u{1D528}',
  kgreen: '\u0138', KHcy: '\u0425', khcy: '\u0445', KJcy: '\u040C',
  kjcy: '\u045C', Kopf: '\u{1D542}', kopf: '\u{1D55C}', Kscr: '\u{1D4A6}',
  kscr: '\u{1D4C0}', lAarr: '\u21DA', Lacute: '\u0139', lacute: '\u013A',
  laemptyv: '\u29B4', lagran: '\u2112', Lambda2: '\u039B', lambda2: '\u03BB',
  Lang: '\u27EA', lang2: '\u2329', langd: '\u2991', langle: '\u27E8',
  lap: '\u2A85', Laplacetrf: '\u2112', laquo2: '\u00AB', larr2: '\u2190',
  Larr: '\u219E', lArr2: '\u21D0', larrb: '\u21E4', larrbfs: '\u291F',
  larrfs: '\u291D', larrhk: '\u21A9', larrlp: '\u21AB', larrpl: '\u2939',
  larrsim: '\u2973', larrtl: '\u21A2', latail: '\u291B', lAtail: '\u291B',
  lat: '\u2AAB', late: '\u2AAD', lates: '\u2AAD\uFE00', lbarr: '\u290C',
  lBarr: '\u290E', lbbrk: '\u2772', lbrace: '\u007B', lbrack: '\u005B',
  lbrke: '\u298B', lbrksld: '\u298F', lbrkslu: '\u298D', Lcaron: '\u013D',
  lcaron: '\u013E', Lcedil: '\u013B', lcedil: '\u013C', lceil2: '\u2308',
  lcub: '\u007B', Lcy: '\u041B', lcy: '\u0440', ldca: '\u2936',
  ldquo2: '\u201C', ldquor: '\u201E', ldrdhar: '\u2967', ldrushar: '\u296B',
  ldsh: '\u21B2', le2: '\u2264', LeftAngleBracket: '\u27E8',
  LeftArrow: '\u2190', Leftarrow: '\u21D0', leftarrow: '\u2190',
  LeftArrowBar: '\u21E4', LeftArrowRightArrow: '\u21C6',
  leftarrowtail: '\u21A2', LeftCeiling: '\u2308', LeftDoubleBracket: '\u27E6',
  LeftDownTeeVector: '\u2961', LeftDownVector: '\u21BD',
  LeftDownVectorBar: '\u2956', LeftFloor: '\u230A',
  leftharpoondown: '\u21BD', leftharpoonup: '\u21BC', leftleftarrows: '\u21C7',
  LeftRightArrow: '\u2194', Leftrightarrow: '\u21D4', leftrightarrow: '\u2194',
  leftrightarrows: '\u21C6', leftrightharpoons: '\u21CB',
  leftrightsquigarrow: '\u21AD', LeftRightVector: '\u294E',
  LeftTee: '\u22A3', LeftTeeArrow: '\u21A4', LeftTeeVector: '\u295A',
  leftthreetimes: '\u22CB', LeftTriangle: '\u22B2', LeftTriangleBar: '\u29CF',
  LeftTriangleEqual: '\u22B4', LeftUpDownVector: '\u2951',
  LeftUpTeeVector: '\u2960', LeftUpVector: '\u21BF', LeftUpVectorBar: '\u2958',
  LeftVector: '\u21BC', LeftVectorBar: '\u2952', leg: '\u22DA',
  leq: '\u2264', leqq: '\u2266', leqslant: '\u2A7D', les: '\u2A7D',
  lescc: '\u2AA8', lesdot: '\u2A7F', lesdoto: '\u2A81', lesdotor: '\u2A83',
  lesg: '\u22DA\uFE00', lesges: '\u2A93', lessapprox: '\u2A85',
  lessdot: '\u22D6', lesseqgtr: '\u22DA', lesseqqgtr: '\u2A8B',
  LessEqualGreater: '\u22DA', LessFullEqual: '\u2266', LessGreater: '\u2276',
  lessgtr: '\u2276', LessLess: '\u226A', lesssim: '\u2272', LessSlantEqual: '\u2A7D',
  LessTilde: '\u2272', lfisht: '\u297C', lfloor2: '\u230A', Lfr: '\u{1D50F}',
  lfr: '\u{1D529}', lg: '\u2276', lgE: '\u2A91', lHar: '\u2962',
  lhard: '\u21BD', lharu: '\u21BC', lharul: '\u296A', lhblk: '\u2584',
  LJcy: '\u0409', ljcy: '\u0459', Ll: '\u22D8', ll: '\u226A',
  llarr: '\u21C7', llcorner: '\u231E', Lleftarrow: '\u21DA', llhard: '\u296B',
  lltri: '\u25FA', Lmidot: '\u013F', lmidot: '\u0140', lmoust: '\u23B0',
  lmoustache: '\u23B0', lnap: '\u2A89', lnapprox: '\u2A89', lne: '\u2A87',
  lnE: '\u2268', lneq: '\u2A87', lneqq: '\u2268', lnsim: '\u22E6',
  loang: '\u27EC', loarr: '\u21FD', lobrk: '\u27E6', LongLeftArrow: '\u27F5',
  Longleftarrow: '\u27F8', longleftarrow: '\u27F5',
  LongLeftRightArrow: '\u27F7', Longleftrightarrow: '\u27FA',
  longleftrightarrow: '\u27F7', longmapsto: '\u27FC', LongRightArrow: '\u27F6',
  Longrightarrow: '\u27F9', longrightarrow: '\u27F6', looparrowleft: '\u21AB',
  looparrowright: '\u21AA', lopar: '\u2985', Lopf: '\u{1D543}',
  lopf: '\u{1D55D}', loplus: '\u2A2D', lot: '\u2A34', lowast2: '\u2217',
  lowbar: '\u005F', LowerLeftArrow: '\u2199', LowerRightArrow: '\u2198',
  loz2: '\u25CA', lozenge: '\u25CA', lozf: '\u29EB', lpar: '\u0028',
  lparlt: '\u2993', lrarr: '\u21C6', lrcorn: '\u231F', lrhar: '\u21CB',
  lrhard: '\u296D', lrm2: '\u200E', lrtri: '\u22BF', lsaquo2: '\u2039',
  Lscr: '\u2112', lscr: '\u{1D4C1}', lsh: '\u21B0', Lsh: '\u21B0',
  lsim: '\u2272', lsime: '\u2A8D', lsimg: '\u2A8F', lsqb: '\u005B',
  lsquo: '\u2018', lsquor: '\u201A', Lstrok: '\u0141', lstrok: '\u0142',
  Lt: '\u226A', LT2: '\u003C', lt2: '\u003C', ltcc: '\u2AA6',
  ltcir: '\u2A79', ltdot: '\u22D6', lthree: '\u22CB', ltimes: '\u22C9',
  ltlarr: '\u2976', ltquest: '\u2A7B', ltri: '\u25C3', ltrif: '\u25C2',
  ltrPar: '\u2996', lurdshar: '\u2966', luruhar: '\u2966', lvertneqq: '\u2268\uFE00',
  lvnE: '\u2268\uFE00', macr2: '\u00AF', male: '\u2642', malt: '\u2720',
  maltese: '\u2720', Map: '\u2905', map: '\u21A6', mapsto: '\u21A6',
  mapstodown: '\u21A7', mapstoleft: '\u21A4', mapstoup: '\u21A5',
  marker: '\u25AE', mcomma: '\u2A29', Mcy: '\u041C', mcy: '\u043C',
  mdash2: '\u2014', mDDot: '\u223A', measuredangle: '\u2221',
  MediumSpace: '\u205F', Mellintrf: '\u2133', Mfr: '\u{1D510}',
  mfr: '\u{1D52A}', mho: '\u2127', micro2: '\u00B5', mid: '\u2223',
  midast: '\u002A', midcir: '\u2AF0', middot2: '\u00B7', minus2: '\u2212',
  minusb: '\u229F', minusd: '\u2238', minusdu: '\u2A2A', MinusPlus: '\u2213',
  mlcp: '\u2ADB', mldr: '\u2026', mnplus: '\u2213', models: '\u22A7',
  Mopf: '\u{1D544}', mopf: '\u{1D55E}', mp: '\u2213', Mscr: '\u2133',
  mscr: '\u{1D4C2}', mstpos: '\u223E', Mu2: '\u039C', mu2: '\u03BC',
  multimap: '\u22B8', mumap: '\u22B8', nabla2: '\u2207', Nacute: '\u0143',
  nacute: '\u0144', nang: '\u2220\u20D2', nap: '\u2249', napE: '\u2A70\u0338',
  napid: '\u224B\u0338', napos: '\u0149', napprox: '\u2249', natur: '\u266E',
  natural: '\u266E', naturals: '\u2115', nbsp2: '\u00A0', nbump: '\u224E\u0338',
  nbumpe: '\u224F\u0338', ncap: '\u2A43', Ncaron: '\u0147', ncaron: '\u0148',
  Ncedil: '\u0145', ncedil: '\u0146', ncong: '\u2247', ncongdot: '\u2A6D\u0338',
  ncup: '\u2A42', Ncy: '\u041D', ncy: '\u044D', ndash2: '\u2013',
  ne2: '\u2260', nearhk: '\u2924', nearr: '\u2197', neArr: '\u21D7',
  nearrow: '\u2197', neDot: '\u2250\u0338', nedot: '\u2250\u0338',
  NegativeMediumSpace: '\u200B', NegativeThickSpace: '\u200B',
  NegativeThinSpace: '\u200B', NegativeVeryThinSpace: '\u200B',
  nequiv: '\u2262', nesear: '\u2928', nesim: '\u2242\u0338', NestedGreaterGreater: '\u226B',
  NestedLessLess: '\u226A', NewLine: '\u000A', nexist: '\u2204',
  nexists: '\u2204', Nfr: '\u{1D511}', nfr: '\u{1D52B}', ngE2: '\u2267\u0338',
  nge: '\u2271', ngE3: '\u2267\u0338', ngeq: '\u2271', ngeqq: '\u2267\u0338',
  ngeqslant: '\u2A7E\u0338', nges: '\u2A7E\u0338', nGg: '\u22D9\u0338',
  ngsim: '\u2275', nGt: '\u226B\u20D2', ngt: '\u226F', ngtr: '\u226F',
  nGtv: '\u226B\u0338', nharr: '\u21AE', nhArr: '\u21CE', nhpar: '\u2AF2',
  ni2: '\u220B', nis: '\u22FC', nisd: '\u22FA', niv: '\u220B',
  NJcy: '\u040A', njcy: '\u045A', nlarr: '\u219A', nlArr: '\u21CD',
  nldr: '\u2025', nle: '\u2270', nlE: '\u2266\u0338', nleq: '\u2270',
  nleqq: '\u2266\u0338', nleqslant: '\u2A7D\u0338', nles: '\u2A7D\u0338',
  nless: '\u2276', nLl: '\u22D8\u0338', nlsim: '\u2274', nLt: '\u226A\u20D2',
  nlt: '\u226E', nltri: '\u22EA', nltrie: '\u22EC', nLtv: '\u226A\u0338',
  nmid: '\u2224', NoBreak: '\u2060', NonBreakingSpace: '\u00A0',
  Nopf: '\u2115', nopf: '\u{1D55F}', Not: '\u2AEC', not2: '\u00AC',
  NotCongruent: '\u2262', NotCupCap: '\u226D', NotDoubleVerticalBar: '\u2226',
  NotElement: '\u2209', NotEqual: '\u2260', NotEqualTilde: '\u2242\u0338',
  NotExists: '\u2204', NotGreater: '\u226F', NotGreaterEqual: '\u2271',
  NotGreaterFullEqual: '\u2267\u0338', NotGreaterGreater: '\u226B\u0338',
  NotGreaterLess: '\u2279', NotGreaterSlantEqual: '\u2A7E\u0338',
  NotGreaterTilde: '\u2275', NotHumpDownHump: '\u224E\u0338',
  NotHumpEqual: '\u224F\u0338', notin2: '\u2209', notindot: '\u22F5\u0338',
  notinE: '\u22F9\u0338', notinva: '\u2209', notinvb: '\u22F7',
  notinvc: '\u22F6', NotLeftTriangle: '\u22EA', NotLeftTriangleBar: '\u29CF\u0338',
  NotLeftTriangleEqual: '\u22EC', NotLess: '\u226E', NotLessEqual: '\u2270',
  NotLessFullEqual: '\u2266\u0338', NotLessGreater: '\u2278',
  NotLessLess: '\u226A\u0338', NotLessSlantEqual: '\u2A7D\u0338',
  NotLessTilde: '\u2274', NotNestedGreaterGreater: '\u2AA2\u0338',
  NotNestedLessLess: '\u2AAA\u0338', notni: '\u220C', notniva: '\u220C',
  notnivb: '\u22FE', notnivc: '\u22FD', NotPrecedes: '\u2280',
  NotPrecedesEqual: '\u2AAF\u0338', NotPrecedesSlantEqual: '\u22E0',
  NotReverseElement: '\u220C', NotRightTriangle: '\u22EB',
  NotRightTriangleBar: '\u29D0\u0338', NotRightTriangleEqual: '\u22ED',
  NotSquareSubset: '\u228F\u0338', NotSquareSubsetEqual: '\u22E2',
  NotSquareSuperset: '\u2290\u0338', NotSquareSupersetEqual: '\u22E3',
  NotSubset: '\u2282\u20D2', NotSubsetEqual: '\u2288', NotSucceeds: '\u2281',
  NotSucceedsEqual: '\u2AB0\u0338', NotSucceedsSlantEqual: '\u22E1',
  NotSucceedsTilde: '\u227F\u0338', NotSuperset: '\u2283\u20D2',
  NotSupersetEqual: '\u2289', NotTilde: '\u2241', NotTildeEqual: '\u2244',
  NotTildeFullEqual: '\u2247', NotTildeTilde: '\u2249',
  NotVerticalBar: '\u2224', npar: '\u2226', nparallel: '\u2226',
  nparsl: '\u2AFD\u20E5', npart: '\u2202\u0338', npolint: '\u2A14',
  npr: '\u2280', nprcue: '\u22E0', npre: '\u2AAF\u0338', nprec: '\u2280',
  npreceq: '\u2AAF\u0338', nrarr: '\u219B', nrArr: '\u21CF', nrarrc: '\u2933\u0338',
  nrarrw: '\u219D\u0338', nrightarrow: '\u219B', nRrightarrow: '\u21CF',
  nrtri: '\u22EB', nrtrie: '\u22ED', nsc: '\u2281', nsccue: '\u22E1',
  nsce: '\u2AB0\u0338', Nscr: '\u{1D4A9}', nscr: '\u{1D4C3}',
  nshortmid: '\u2224', nshortparallel: '\u2226', nsim: '\u2241',
  nsime: '\u2244', nsimeq: '\u2244', nsmid: '\u2224', nspar: '\u2226',
  nsqsube: '\u22E2', nsqsupe: '\u22E3', nsub: '\u2284', nsubE: '\u2AC5\u0338',
  nsube: '\u2288', nsubset: '\u2282\u20D2', nsubseteq: '\u2288',
  nsubseteqq: '\u2AC5\u0338', nsucc: '\u2281', nsucceq: '\u2AB0\u0338',
  nsup: '\u2285', nsupE: '\u2AC6\u0338', nsupe: '\u2289',
  nsupset: '\u2283\u20D2', nsupseteq: '\u2289', nsupseteqq: '\u2AC6\u0338',
  ntgl: '\u2279', Ntilde2: '\u00D1', ntilde2: '\u00F1', ntlg: '\u2278',
  ntriangleleft: '\u22EA', ntrianglelefteq: '\u22EC', ntriangleright: '\u22EB',
  ntrianglerighteq: '\u22ED', Nu2: '\u039D', nu2: '\u03BD', num: '\u0023',
  numero: '\u2116', numsp: '\u2007', nvap: '\u224D\u20D2', nvdash: '\u22AC',
  nvDash: '\u22AD', nVdash: '\u22AE', nVDash: '\u22AF', nvge: '\u2265\u20D2',
  nvgt: '\u003E\u20D2', nvHarr: '\u2904', nvinfin: '\u29DE', nvlArr: '\u2902',
  nvle: '\u2264\u20D2', nvlt: '\u003C\u20D2', nvltrie: '\u22B4\u20D2',
  nvrArr: '\u2903', nvrtrie: '\u22B5\u20D2', nvsim: '\u223C\u20D2',
  nwarhk: '\u2923', nwarr: '\u2196', nwArr: '\u21D6', nwarrow: '\u2196',
  nwnear: '\u2927', Oacute2: '\u00D3', Ocirc2: '\u00D4', Ocy: '\u041E',
  ocy: '\u043E', Odblac: '\u0150', odblac: '\u0151', odiv: '\u2A38',
  odot: '\u2299', odsold: '\u29BC', OElig2: '\u0152', oelig2: '\u0153',
  ofcir: '\u29BF', Ofr: '\u{1D512}', ofr: '\u{1D52C}', ogon: '\u02DB',
  Ograve2: '\u00D2', ogt: '\u29C1', ohbar: '\u29B5', ohm: '\u03A9',
  oint: '\u222E', olarr: '\u21BA', olcir: '\u29BE', olcross: '\u29BB',
  oline2: '\u203E', olt: '\u29C0', Omacr: '\u014C', omacr: '\u014D',
  Omega2: '\u03A9', omega2: '\u03C9', Omicron2: '\u039F', omicron2: '\u03BF',
  omid: '\u29BC', omin: '\u29B6', Oopf: '\u{1D546}', oopf: '\u{1D560}',
  opar: '\u29B7', OpenCurlyDoubleQuote: '\u201C', OpenCurlyQuote: '\u2018',
  operp: '\u29B9', oplus2: '\u2295', Or: '\u2A54', or2: '\u2228',
  orarr: '\u21BB', ord: '\u2A5D', order: '\u2134', orderof: '\u2134',
  ordf2: '\u00AA', ordm2: '\u00BA', origof: '\u22B6', oror: '\u2A56',
  orslope: '\u2A57', orv: '\u2A5B', oS: '\u24C8', Oscr: '\u{1D4AA}',
  oscr: '\u2134', Oslash2: '\u00D8', oslash2: '\u00F8', osol: '\u2298',
  Otilde2: '\u00D5', otilde2: '\u00F5', Otimes: '\u2A37', otimes: '\u2297',
  otimesas: '\u2A36', Ouml2: '\u00D6', ouml2: '\u00F6', ovbar: '\u233D',
  OverBar: '\u203E', OverBrace: '\u23DE', OverBracket: '\u23B4',
  OverParenthesis: '\u23DC', par: '\u2225', para2: '\u00B6', parallel: '\u2225',
  parsim: '\u2AF3', parsl: '\u2AFD', part2: '\u2202', PartialD: '\u2202',
  Pcy: '\u041F', pcy: '\u043F', percnt: '\u0025', period: '\u002E',
  permil2: '\u2030', perp2: '\u22A5', pertenk: '\u2031', Pfr: '\u{1D513}',
  pfr: '\u{1D52D}', Phi2: '\u03A6', phi2: '\u03C6', phiv: '\u03D5',
  phmmat: '\u2133', phone: '\u260E', Pi2: '\u03A0', pi2: '\u03C0',
  pitchfork: '\u22D4', piv2: '\u03D6', planck: '\u210F', planckh: '\u210E',
  plankv: '\u210F', plus: '\u002B', plusacir: '\u2A23', plusb: '\u229E',
  pluscir: '\u2A22', plusdo: '\u2214', plusdu: '\u2A25', pluse: '\u2A72',
  PlusMinus: '\u00B1', plusmn2: '\u00B1', plussim: '\u2A26', plustwo: '\u2A27',
  pm: '\u00B1', pointint: '\u2A15', Popf: '\u2119', popf: '\u{1D561}',
  pound2: '\u00A3', pr: '\u227A', Pr: '\u2ABB', prap: '\u2AB7',
  prcue: '\u227C', prE: '\u2AB3', pre: '\u2AAF', prec: '\u227A',
  precapprox: '\u2AB7', preccurlyeq: '\u227C', Precedes: '\u227A',
  PrecedesEqual: '\u2AAF', PrecedesSlantEqual: '\u227C',
  PrecedesTilde: '\u227E', preceq: '\u2AAF', precnapprox: '\u2AB9',
  precneqq: '\u2AB5', precnsim: '\u22E8', pre: '\u2AAF', prE2: '\u2AB3',
  precsim: '\u227E', Prime2: '\u2033', prime2: '\u2032', primes: '\u2119',
  prnap: '\u2AB9', prnE: '\u2AB5', prnsim: '\u22E8', prod2: '\u220F',
  Product: '\u220F', profalar: '\u232E', profline: '\u2312', profsurf: '\u2313',
  prop2: '\u221D', Proportion: '\u2237', Proportional: '\u221D',
  propto: '\u221D', prsim: '\u227E', prurel: '\u22B0', Pscr: '\u{1D4AB}',
  pscr: '\u{1D4C5}', Psi2: '\u03A8', psi2: '\u03C8', puncsp: '\u2008',
  Qfr: '\u{1D514}', qfr: '\u{1D52E}', qint: '\u2A0C', Qopf: '\u211A',
  qopf: '\u{1D562}', qprime: '\u2057', Qscr: '\u{1D4AC}', qscr: '\u{1D4C6}',
  quaternions: '\u210D', quatint: '\u2A16', quest: '\u003F', questeq: '\u225F',
  QUOT2: '\u0022', quot2: '\u0022', rAarr: '\u21DB', race: '\u223D\u0331',
  Racute: '\u0154', racute: '\u0155', radic2: '\u221A', raemptyv: '\u29B3',
  rang2: '\u232A', Rang: '\u27EB', rangd: '\u2992', range: '\u29A5',
  rangle: '\u27E9', raquo2: '\u00BB', Rarr: '\u21A0', rArr2: '\u21D2',
  rarr2: '\u2192', rarrap: '\u2975', rarrb: '\u21E5', rarrbfs: '\u2920',
  rarrc: '\u2933', rarrfs: '\u291E', rarrhk: '\u21AA', rarrlp: '\u21AC',
  rarrpl: '\u2945', rarrsim: '\u2974', Rarrtl: '\u21A3', rarrtl2: '\u21A3',
  rarrw: '\u219D', ratail: '\u291A', rAtail: '\u291A', ratio: '\u2236',
  rationals: '\u211A', RBarr: '\u290F', rBarr: '\u290E', rbarr: '\u290D',
  rbbrk: '\u2773', rbrace: '\u007D', rbrack: '\u005D', rbrke: '\u298C',
  rbrksld: '\u298E', rbrkslu: '\u2990', Rcaron: '\u0158', rcaron: '\u0159',
  Rcedil: '\u0156', rcedil: '\u0157', rceil2: '\u2309', rcub: '\u007D',
  Rcy: '\u0420', rcy: '\u0440', rdca: '\u2937', rdldhar: '\u2969',
  rdquo2: '\u201D', rdquor: '\u201D', rdsh: '\u21B3', Re: '\u211C',
  real2: '\u211C', realine: '\u211B', realpart: '\u211C', reals: '\u211D',
  Reals: '\u211D', rect: '\u25AD', REG2: '\u00AE', reg2: '\u00AE',
  ReverseElement: '\u220B', ReverseEquilibrium: '\u21CB',
  ReverseUpEquilibrium: '\u296F', rfisht: '\u297D', rfloor2: '\u230B',
  Rfr: '\u211C', rfr: '\u{1D52F}', rHar: '\u2964', rhard: '\u21C1',
  rharu: '\u21C0', rharul: '\u296C', Rho2: '\u03A1', rho2: '\u03C1',
  rhov: '\u03F1', RightAngleBracket: '\u27E9', RightArrow: '\u2192',
  Rightarrow: '\u21D2', rightarrow: '\u2192', RightArrowBar: '\u21E5',
  RightArrowLeftArrow: '\u21C4', rightarrowtail: '\u21A3',
  RightCeiling: '\u2309', RightDoubleBracket: '\u27E7',
  RightDownTeeVector: '\u295D', RightDownVector: '\u21C1',
  RightDownVectorBar: '\u2957', RightFloor: '\u230B',
  rightharpoondown: '\u21C1', rightharpoonup: '\u21C0',
  rightleftarrows: '\u21C4', rightleftharpoons: '\u21CC',
  rightrightarrows: '\u21C9', rightsquigarrow: '\u219D',
  RightTee: '\u22A2', RightTeeArrow: '\u21A6', RightTeeVector: '\u295B',
  rightthreetimes: '\u22CC', RightTriangle: '\u22B3',
  RightTriangleBar: '\u29D0', RightTriangleEqual: '\u22B5',
  RightUpDownVector: '\u294F', RightUpTeeVector: '\u295C',
  RightUpVector: '\u21BE', RightUpVectorBar: '\u2954', RightVector: '\u21C0',
  RightVectorBar: '\u2953', ring: '\u02DA', risingdotseq: '\u2253',
  rlarr: '\u21C4', rlhar: '\u21CC', rlm2: '\u200F', rmoust: '\u23B1',
  rmoustache: '\u23B1', rnmid: '\u2AEE', roang: '\u27ED', roarr: '\u21FE',
  robrk: '\u27E7', ropar: '\u2986', Ropf: '\u211D', ropf: '\u{1D563}',
  roplus: '\u2A2E', rotimes: '\u2A35', RoundImplies: '\u2970',
  rpar: '\u0029', rpargt: '\u2994', rppolint: '\u2A12', rrarr: '\u21C9',
  Rrightarrow: '\u21DB', rsaquo2: '\u203A', Rscr: '\u211B', rscr: '\u{1D4C7}',
  Rsh: '\u21B1', rsh: '\u21B1', rsqb: '\u005D', rsquo: '\u2019',
  rsquor: '\u2019', rthree: '\u22CC', rtimes: '\u22CA', rtri: '\u25B9',
  rtrif: '\u25B8', rtriltri: '\u29CE', RuleDelayed: '\u29F4', ruluhar: '\u2968',
  rx: '\u211E', Sacute: '\u015A', sacute: '\u015B', sbquo2: '\u201A',
  Sc: '\u2ABC', sc: '\u227B', scap: '\u2AB8', Scaron2: '\u0160',
  scaron2: '\u0161', Scirc: '\u015C', scirc: '\u015D', scnE: '\u2AB6',
  scnap: '\u2ABA', scnsim: '\u22E9', scpolint: '\u2A13', scsim: '\u227F',
  Scy: '\u0421', scy: '\u0441', sdot2: '\u22C5', sdotb: '\u22A1',
  sdote: '\u2A66', searhk: '\u2925', searr: '\u2198', seArr: '\u21D8',
  searrow: '\u2198', sect2: '\u00A7', semi: '\u003B', seswar: '\u2929',
  setminus: '\u2216', setmn: '\u2216', sext: '\u2736', Sfr: '\u{1D516}',
  sfr: '\u{1D530}', sfrown: '\u2322', sharp: '\u266F', SHCHcy: '\u0429',
  shchcy: '\u0449', SHcy: '\u0428', shcy: '\u0448', ShortDownArrow: '\u2193',
  ShortLeftArrow: '\u2190', shortmid: '\u2223', shortparallel: '\u2225',
  ShortRightArrow: '\u2192', ShortUpArrow: '\u2191', shy2: '\u00AD',
  Sigma2: '\u03A3', sigma2: '\u03C3', sigmaf2: '\u03C2', sigmav: '\u03C2',
  sim2: '\u223C', simdot: '\u2A6A', sime: '\u2243', simeq: '\u2243',
  simg: '\u2A9E', simgE: '\u2AA0', siml: '\u2A9D', simlE: '\u2A9F',
  simne: '\u2246', simplus: '\u2A24', simrarr: '\u2972', slarr: '\u2190',
  SmallCircle: '\u2218', smallsetminus: '\u2216', smashp: '\u2A33',
  smeparsl: '\u29E4', smid: '\u2223', smile: '\u2323', smt: '\u2AAA',
  smte: '\u2AAC', smtes: '\u2AAC\uFE00', SOFTcy: '\u042C', softcy: '\u044C',
  sol: '\u002F', solb: '\u29C4', solbar: '\u233F', Sopf: '\u{1D54A}',
  sopf: '\u{1D564}', spades2: '\u2660', spadesuit: '\u2660', spar: '\u2225',
  sqcap: '\u2293', sqcaps: '\u2293\uFE00', sqcup: '\u2294', sqcups: '\u2294\uFE00',
  Sqrt: '\u221A', sqsub: '\u228F', sqsube: '\u2291', sqsubset: '\u228F',
  sqsubseteq: '\u2291', sqsup: '\u2290', sqsupe: '\u2292', sqsupset: '\u2290',
  sqsupseteq: '\u2292', square: '\u25A1', Square: '\u25A1',
  SquareIntersection: '\u2293', SquareSubset: '\u228F',
  SquareSubsetEqual: '\u2291', SquareSuperset: '\u2290',
  SquareSupersetEqual: '\u2292', SquareUnion: '\u2294', squarf: '\u25AA',
  squ: '\u25A1', squf: '\u25AA', srarr: '\u2192', Sscr: '\u{1D4AE}',
  sscr: '\u{1D4C8}', ssetmn: '\u2216', ssmile: '\u2323', sstarf: '\u22C6',
  Star: '\u22C6', star: '\u2606', starf: '\u2605', straightepsilon: '\u03F5',
  straightphi: '\u03D5', strns: '\u00AF', Sub: '\u22D0', sub2: '\u2282',
  subdot: '\u2ABD', subE: '\u2AC5', sube2: '\u2286', subedot: '\u2AC3',
  submult: '\u2AC1', subnE: '\u2ACB', subne: '\u228A', subplus: '\u2ABF',
  subrarr: '\u2979', Subset: '\u22D0', subset: '\u2282', subseteq: '\u2286',
  subseteqq: '\u2AC5', SubsetEqual: '\u2286', subsetneq: '\u228A',
  subsetneqq: '\u2ACB', succ: '\u227B', succapprox: '\u2AB8',
  succcurlyeq: '\u227D', Succeeds: '\u227B', SucceedsEqual: '\u2AB0',
  SucceedsSlantEqual: '\u227D', SucceedsTilde: '\u2280', succeq: '\u2AB0',
  succnapprox: '\u2ABA', succneqq: '\u2AB6', succnsim: '\u22E9',
  succsim: '\u2280', SuchThat: '\u220B', Sum2: '\u2211', sum2: '\u2211',
  sung: '\u266A', Sup: '\u22D1', sup2: '\u2283', supdot: '\u2ABE',
  supdsub: '\u2AD8', supE: '\u2AC6', supe2: '\u2287', supedot: '\u2AC4',
  Superset: '\u2283', SupersetEqual: '\u2287', suphsol: '\u27C9',
  suphsub: '\u2AD7', suplarr: '\u297B', supmult: '\u2AC2', supnE: '\u2ACC',
  supne: '\u228B', supplus: '\u2AC0', Supset: '\u22D1', supset: '\u2283',
  supseteq: '\u2287', supseteqq: '\u2AC6', supsetneq: '\u228B',
  supsetneqq: '\u2ACC', supsim: '\u2AC7', supsub: '\u2AD4', supsup: '\u2AD6',
  swarhk: '\u2926', swarr: '\u2199', swArr: '\u21D9', swarrow: '\u2199',
  swnwar: '\u292A', szlig2: '\u00DF', Tab: '\u0009', target: '\u2316',
  Tau2: '\u03A4', tau2: '\u03C4', tbrk: '\u23B4', Tcaron: '\u0164',
  tcaron: '\u0165', Tcedil: '\u0162', tcedil: '\u0163', Tcy: '\u0422',
  tcy: '\u0442', tdot: '\u20DB', Tel: '\u2121', tel: '\u2121',
  Tfr: '\u{1D517}', tfr: '\u{1D531}', there4_2: '\u2234', therefore: '\u2234',
  Theta2: '\u0398', theta2: '\u03B8', thetasym2: '\u03D1', thetav: '\u03D1',
  thickapprox: '\u2248', thicksim: '\u223C', ThickSpace: '\u205F\u200A',
  thinsp2: '\u2009', ThinSpace: '\u2009', thkap: '\u2248', thksim: '\u223C',
  THORN2: '\u00DE', thorn2: '\u00FE', Tilde: '\u223C', tilde2: '\u02DC',
  TildeEqual: '\u2243', TildeFullEqual: '\u2245', TildeTilde: '\u2248',
  times2: '\u00D7', timesb: '\u22A0', timesbar: '\u2A31', timesd: '\u2A30',
  tint: '\u222D', toea: '\u2928', top: '\u22A4', Top: '\u22A4',
  topbot: '\u2336', topcir: '\u2AF1', Topf: '\u{1D54B}', topf: '\u{1D565}',
  topfork: '\u2ADA', tosa: '\u2929', tprime: '\u2034', TRADE2: '\u2122',
  trade2: '\u2122', triangle: '\u25B5', triangledown: '\u25BF',
  triangleleft: '\u25C3', trianglelefteq: '\u22B4', triangleq: '\u225C',
  triangleright: '\u25B9', trianglerighteq: '\u22B5', tridot: '\u25EC',
  trie: '\u225C', triminus: '\u2A3A', TripleDot: '\u20DB', triplus: '\u2A39',
  trisb: '\u29CD', tritime: '\u2A3B', trpezium: '\u23E2', Tscr: '\u{1D4AF}',
  tscr: '\u{1D4C9}', TScy: '\u0426', tscy: '\u0446', TSHcy: '\u040B',
  tshcy: '\u045B', Tstrok: '\u0166', tstrok: '\u0167', twixt: '\u226C',
  twoheadleftarrow: '\u219E', twoheadrightarrow: '\u21A0',
  Uacute2: '\u00DA', uacute2: '\u00FA', uarr2: '\u2191', Uarr: '\u219F',
  uArr2: '\u21D1', Uarrocir: '\u2949', Ubrcy: '\u040E', ubrcy: '\u045E',
  Ubreve: '\u016C', ubreve: '\u016D', Ucirc2: '\u00DB', ucirc2: '\u00FB',
  Ucy: '\u0423', ucy: '\u0443', udarr: '\u21C5', Udblac: '\u0170',
  udblac: '\u0171', udhar: '\u296E', ufisht: '\u297E', Ufr: '\u{1D518}',
  ufr: '\u{1D532}', Ugrave2: '\u00D9', ugrave2: '\u00F9', uHar: '\u2963',
  uharl: '\u21BF', uharr: '\u21BE', uhblk: '\u2580', ulcorn: '\u231C',
  ulcorner: '\u231C', ulcrop: '\u230F', ultri: '\u25F8', Umacr: '\u016A',
  umacr: '\u016B', uml2: '\u00A8', UnderBar: '\u005F', UnderBrace: '\u23DF',
  UnderBracket: '\u23B5', UnderParenthesis: '\u23DD', Union: '\u22C3',
  UnionPlus: '\u228E', Uogon: '\u0172', uogon: '\u0173', Uopf: '\u{1D54C}',
  uopf: '\u{1D566}', UpArrow: '\u2191', Uparrow: '\u21D1', uparrow: '\u2191',
  UpArrowBar: '\u2912', UpArrowDownArrow: '\u21C5', UpDownArrow: '\u2195',
  Updownarrow: '\u21D5', updownarrow: '\u2195', UpEquilibrium: '\u296E',
  upharpoonleft: '\u21BF', upharpoonright: '\u21BE', uplus: '\u228E',
  UpperLeftArrow: '\u2196', UpperRightArrow: '\u2197', upsi: '\u03C5',
  Upsi: '\u03D2', upsih2: '\u03D2', Upsilon2: '\u03A5', upsilon2: '\u03C5',
  UpTee: '\u22A5', UpTeeArrow: '\u21A5', upuparrows: '\u21C8',
  urcorn: '\u231D', urcorner: '\u231D', urcrop: '\u230E', Uring: '\u016E',
  uring: '\u016F', urtri: '\u25F9', Uscr: '\u{1D4B0}', uscr: '\u{1D4CA}',
  utdot: '\u22F0', Utilde: '\u0168', utilde: '\u0169', utri: '\u25B5',
  utrif: '\u25B4', uuarr: '\u21C8', Uuml2: '\u00DC', uuml2: '\u00FC',
  uwangle: '\u29A7', vangrt: '\u299C', varepsilon: '\u03F5',
  varkappa: '\u03F0', varnothing: '\u2205', varphi: '\u03D5', varpi: '\u03D6',
  varpropto: '\u221D', varr: '\u2195', vArr: '\u21D5', varrho: '\u03F1',
  varsigma: '\u03C2', varsubsetneq: '\u228A\uFE00', varsubsetneqq: '\u2ACB\uFE00',
  varsupsetneq: '\u228B\uFE00', varsupsetneqq: '\u2ACC\uFE00',
  vartheta: '\u03D1', vartriangleleft: '\u22B2', vartriangleright: '\u22B3',
  Vbar: '\u2AEB', vBar: '\u2AE8', vBarv: '\u2AE9', Vcy: '\u0412',
  vcy: '\u0432', vdash: '\u22A2', vDash: '\u22A8', Vdash: '\u22A9',
  VDash: '\u22AB', Vdashl: '\u2AE6', veebar: '\u22BB', Vee: '\u22C1',
  vee: '\u2228', Vee2: '\u22C1', vee2: '\u2228', veeeq: '\u225A',
  vellip: '\u22EE', Verbar: '\u2016', verbar: '\u007C', Vert: '\u2016',
  vert: '\u007C', VerticalBar: '\u2223', VerticalLine: '\u007C',
  VerticalSeparator: '\u2758', VerticalTilde: '\u2240', VeryThinSpace: '\u200A',
  Vfr: '\u{1D519}', vfr: '\u{1D533}', vltri: '\u22B2', vnsub: '\u2282\u20D2',
  vnsup: '\u2283\u20D2', Vopf: '\u{1D54D}', vopf: '\u{1D567}', vprop: '\u221D',
  vrtri: '\u22B3', Vscr: '\u{1D4B1}', vscr: '\u{1D4CB}', vsubnE: '\u2ACB\uFE00',
  vsubne: '\u228A\uFE00', vsupnE: '\u2ACC\uFE00', vsupne: '\u228B\uFE00',
  Vvdash: '\u22AA', vzigzag: '\u299A', Wcirc: '\u0174', wcirc: '\u0175',
  wedbar: '\u2A5F', Wedge: '\u22C0', wedge: '\u2227', wedgeq: '\u2259',
  weierp2: '\u2118', Wfr: '\u{1D51A}', wfr: '\u{1D534}', Wopf: '\u{1D54E}',
  wopf: '\u{1D568}', wp: '\u2118', wr: '\u2240', wreath: '\u2240',
  Wscr: '\u{1D4B2}', wscr: '\u{1D4CC}', xcap: '\u22C2', xcirc: '\u25EF',
  xcup: '\u22C3', xdtri: '\u25BD', Xfr: '\u{1D51B}', xfr: '\u{1D535}',
  xharr: '\u27F7', xhArr: '\u27FA', Xi2: '\u039E', xi2: '\u03BE',
  xlarr: '\u27F5', xlArr: '\u27F8', xmap: '\u27FC', xnis: '\u22FB',
  xodot: '\u2A00', Xopf: '\u{1D54F}', xopf: '\u{1D569}', xoplus: '\u2A01',
  xotime: '\u2A02', xrarr: '\u27F6', xrArr: '\u27F9', Xscr: '\u{1D4B3}',
  xscr: '\u{1D4CD}', xsqcup: '\u2A06', xuplus: '\u2A04', xutri: '\u25B3',
  xvee: '\u22C1', xwedge: '\u22C0', Yacute2: '\u00DD', yacute2: '\u00FD',
  Ycirc: '\u0176', ycirc: '\u0177', Ycy: '\u042B', ycy: '\u044B',
  Yfr: '\u{1D51C}', yfr: '\u{1D536}', Yopf: '\u{1D550}', yopf: '\u{1D56A}',
  Yscr: '\u{1D4B4}', yscr: '\u{1D4CE}', Yuml2: '\u0178', yuml2: '\u00FF',
  Zacute: '\u0179', zacute: '\u017A', Zcaron: '\u017D', zcaron: '\u017E',
  Zcy: '\u0417', zcy: '\u0437', Zdot: '\u017B', zdot: '\u017C',
  zeetrf: '\u2128', ZeroWidthSpace: '\u200B', Zeta2: '\u0396', zeta2: '\u03B6',
  Zfr: '\u2128', zfr: '\u{1D537}', ZHcy: '\u0416', zhcy: '\u0436',
  zigrarr: '\u21DD', Zopf: '\u{1D551}', zopf: '\u{1D56B}', Zscr: '\u{1D4B5}',
  zscr: '\u{1D4CF}', zwj2: '\u200D', zwnj2: '\u200C',
};

/**
 * Try to parse an entity at s[i] === '&'. Returns [decodedChar, lengthConsumed]
 * or null. Numeric: &#123; &#x1F600; &#X41;. Named: &name; (must end with ';').
 * Invalid code points (0, surrogates, > 0x10FFFF) become U+FFFD.
 */
function parseEntityAt(s, i) {
  if (s[i] !== '&' || i + 1 >= s.length) return null;
  const c1 = s[i + 1];
  if (c1 === '#') {
    let j = i + 2;
    let hex = false;
    if (j < s.length && (s[j] === 'x' || s[j] === 'X')) { hex = true; j++; }
    const start = j;
    while (j < s.length) {
      const c = s.charCodeAt(j);
      if (hex ? (isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)) : isDigit(c)) j++;
      else break;
    }
    if (j === start || j >= s.length || s[j] !== ';') return null;
    const num = parseInt(s.slice(start, j), hex ? 16 : 10);
    let ch;
    if (!num || num > 0x10FFFF || (num >= 0xD800 && num <= 0xDFFF)) ch = '\uFFFD';
    else ch = String.fromCodePoint(num);
    return [ch, j + 1 - i];
  }
  let j = i + 1;
  while (j < s.length) {
    const c = s.charCodeAt(j);
    if (isAlnum(c)) j++;
    else break;
  }
  if (j >= s.length || s[j] !== ';' || j === i + 1) return null;
  const name = s.slice(i + 1, j);
  const val = ENTITIES[name];
  if (val === undefined) return null;
  return [val, j + 1 - i];
}

/** Decode entities and backslash escapes in a string (for labels/titles/alt). */
function unescapeStr(s) {
  if (s.indexOf('\\') === -1 && s.indexOf('&') === -1) return s;
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && isAsciiPunct(s.charCodeAt(i + 1))) {
      if (i > start) out += s.slice(start, i);
      out += s[i + 1];
      i++;
      start = i + 1;
    } else if (ch === '&') {
      const e = parseEntityAt(s, i);
      if (e) {
        if (i > start) out += s.slice(start, i);
        out += e[0];
        i += e[1] - 1;
        start = i + 1;
      }
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

// ---------------------------------------------------------------------------
// Escaping (marked's rules, verified against the reference outputs)
// ---------------------------------------------------------------------------
// marked escapes & < > " ' — but an & that starts something shaped like an
// entity reference (&name; &#123; &#x1F;) is left alone (escapeTestNoEncode).
// Code content escapes every & (encode=true).

const ESC_RE_ENCODE = /[&<>"']/g;
const ESC_RE_NOENCODE = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;

function escapeHtml(s, encode) {
  if (encode) return s.replace(ESC_RE_ENCODE, (ch) => ESCAPE_MAP[ch]);
  return s.replace(ESC_RE_NOENCODE, (ch) => ESCAPE_MAP[ch]);
}

/** Decode numeric character references only (&#65; &#x41;). Named entities
 *  are NOT decoded by marked: they stay literal in the output. Invalid code
 *  points (0, surrogates, > 0x10FFFF) become U+FFFD. */
function decodeNumeric(s) {
  if (s.indexOf('&#') === -1) return s;
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '&' && s[i + 1] === '#') {
      let j = i + 2;
      let hex = false;
      if (j < s.length && (s[j] === 'x' || s[j] === 'X')) { hex = true; j++; }
      const ds = j;
      while (j < s.length) {
        const c = s.charCodeAt(j);
        if (hex ? (isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)) : isDigit(c)) j++;
        else break;
      }
      if (j > ds && j < s.length && s[j] === ';') {
        const num = parseInt(s.slice(ds, j), hex ? 16 : 10);
        let ch;
        if (!num || num > 0x10FFFF || (num >= 0xD800 && num <= 0xDFFF)) ch = '\uFFFD';
        else ch = String.fromCodePoint(num);
        if (i > start) out += s.slice(start, i);
        out += ch;
        i = j;
        start = j + 1;
      }
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

/** Process backslash escapes only (backslash + ASCII punctuation -> the char).
 *  Used for link destinations, titles and info strings. */
function unescBs(s) {
  if (s.indexOf('\\') === -1) return s;
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length && isAsciiPunct(s.charCodeAt(i + 1))) {
      if (i > start) out += s.slice(start, i);
      out += s[i + 1];
      i++;
      start = i + 1;
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

/** Render a run of plain text: decode numeric entities (with digit limits),
 *  escape HTML. A numeric entity is decoded and the result re-escaped, so
 *  &#38;copy; becomes &amp;copy; (the & produced by decoding is NOT treated
 *  as the start of a named entity). Named entities stay literal. */
function renderText(s) {
  if (s.indexOf('&') === -1) return escapeHtml(s, false);
  let out = '';
  let start = 0;
  const n = s.length;
  let i = 0;
  while (i < n) {
    if (s[i] !== '&') { i++; continue; }
    let j = i + 1;
    let decoded = null;
    if (s[j] === '#') {
      j++;
      let hex = false;
      if (s[j] === 'x' || s[j] === 'X') { hex = true; j++; }
      const ds = j;
      while (j < n) {
        const cc = s.charCodeAt(j);
        if (hex ? (isDigit(cc) || (cc >= 65 && cc <= 70) || (cc >= 97 && cc <= 102)) : isDigit(cc)) j++;
        else break;
      }
      const digits = j - ds;
      if (digits > 0 && digits <= (hex ? 6 : 7) && j < n && s[j] === ';') {
        const num = parseInt(s.slice(ds, j), hex ? 16 : 10);
        decoded = (!num || num > 0x10FFFF || (num >= 0xD800 && num <= 0xDFFF)) ? '\uFFFD' : String.fromCodePoint(num);
        j++;
      }
    }
    if (decoded !== null) {
      if (i > start) out += escapeHtml(s.slice(start, i), false);
      out += escapeHtml(decoded, true);
      i = j;
      start = i;
      continue;
    }
    // named entity shape &word; -> leave literal
    let j2 = i + 1;
    while (j2 < n) {
      const cc = s.charCodeAt(j2);
      if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || isDigit(cc)) j2++;
      else break;
    }
    if (j2 > i + 1 && j2 < n && s[j2] === ';') {
      if (i > start) out += escapeHtml(s.slice(start, i), false);
      out += s.slice(i, j2 + 1);
      i = j2 + 1;
      start = i;
      continue;
    }
    // bare & -> escape it
    if (i > start) out += escapeHtml(s.slice(start, i), false);
    out += '&amp;';
    i++;
    start = i;
  }
  if (start < n) out += escapeHtml(s.slice(start), false);
  return out;
}

/** Normalize a link label for reference lookup: collapse whitespace runs
 *  (including newlines) to one space, trim, lowercase. No entity decoding. */
function normalizeLabel(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/ß/g, 'ss');
}

// ---------------------------------------------------------------------------
// Link destination / title parsing (operate on a string + index)
// ---------------------------------------------------------------------------

/** Parse a link destination at s[i]. Returns [dest, nextIndex] or null.
 *  <angle> form: no <, no newline, backslash escapes allowed.
 *  bare form: no spaces/control chars, balanced parens, backslash escapes. */
function parseDest(s, i) {
  const n = s.length;
  if (i >= n) return null;
  if (s[i] === '<') {
    let j = i + 1;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (c === 10 || c === 60) return null; // newline or <
      if (c === 62) return [s.slice(i + 1, j), j + 1]; // >
      if (c === 92) j++; // backslash: skip next char
      j++;
    }
    return null;
  }
  let j = i;
  let depth = 0;
  while (j < n) {
    const c = s.charCodeAt(j);
    if (c <= 32 || c === 127) break; // space or control
    if (c === 92) { j += 2; continue; } // backslash escape
    if (c === 40) depth++; // (
    else if (c === 41) { // )
      if (depth === 0) break;
      depth--;
    }
    j++;
  }
  if (j === i) return null;
  return [s.slice(i, j), j];
}

/** Parse a link title at s[i] (after optional whitespace). The caller passes
 *  the index of the opening quote/paren. Returns [title, nextIndex] or null.
 *  "..." and '...' may span lines; (...) may nest one level. A title may
 *  not contain a blank line. */
function parseTitle(s, i) {
  const n = s.length;
  if (i >= n) return null;
  const q = s[i];
  if (q === '"' || q === "'") {
    let j = i + 1;
    while (j < n) {
      const c = s[j];
      if (c === '\n' && s[j + 1] === '\n') return null; // blank line in title
      if (c === '\\' && j + 1 < n && isAsciiPunct(s.charCodeAt(j + 1))) { j += 2; continue; }
      if (c === q) return [s.slice(i + 1, j), j + 1];
      j++;
    }
    return null;
  }
  if (q === '(') {
    let j = i + 1;
    let depth = 1;
    while (j < n) {
      const c = s[j];
      if (c === '\n' && s[j + 1] === '\n') return null; // blank line in title
      if (c === '\\' && j + 1 < n && isAsciiPunct(s.charCodeAt(j + 1))) { j += 2; continue; }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return [s.slice(i + 1, j), j + 1];
      }
      j++;
    }
    return null;
  }
  return null;
}

/** Skip spaces/tabs/newlines. Returns new index. */
function skipWs(s, i) {
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10) i++;
    else break;
  }
  return i;
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

function isWSCode(c) {
  return c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 0x85 || c === 0xA0;
}

function punctAt(s, i) {
  if (i < 0 || i >= s.length) return false;
  const cp = s.codePointAt(i);
  const ch = String.fromCodePoint(cp);
  return /[\p{P}\p{S}]/u.test(ch);
}

function wsAt(s, i) {
  if (i < 0 || i >= s.length) return false;
  const cp = s.codePointAt(i);
  const ch = String.fromCodePoint(cp);
  return /\s/u.test(ch);
}

/** Strip HTML tags (for image alt text). */
function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}

/** Plain-text rendering of inline source (for image alt): parse inline,
 *  drop all tags. Numeric entities decode, named stay literal. A nested
 *  image contributes its alt text (not nothing) to the outer alt. */
function plainTextInline(src, refs) {
  const savedMaskEnd = maskEnd;
  const savedStrayTickLen = strayTickLen;
  const html = parseInline(src, refs);
  maskEnd = savedMaskEnd;
  strayTickLen = savedStrayTickLen;
  const withAlt = html.replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, (m, alt) =>
    alt.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  return stripTags(withAlt);
}

/** Parse an inline HTML tag at s[i] === '<'. Returns [raw, nextIndex] or null.
 *  Handles open tags (with attributes, quoted values may contain >),
 *  closing tags, comments, processing instructions, declarations, CDATA. */
function parseHtmlTag(s, i) {
  const n = s.length;
  if (s[i] !== '<' || i + 1 >= n) return null;
  let j = i + 1;
  const c1 = s[j];
  if (c1 === '!') {
    // abrupt-closing empty comments
    if (s.startsWith('<!-->', i)) return [s.slice(i, i + 5), i + 5];
    if (s.startsWith('<!--->', i)) return [s.slice(i, i + 6), i + 6];
    if (s.startsWith('<!--', i)) {
      const k = s.indexOf('-->', i + 4);
      if (k === -1) return null;
      return [s.slice(i, k + 3), k + 3];
    }
    if (s.startsWith('<![CDATA[', i)) {
      const k = s.indexOf(']]>', i + 9);
      if (k === -1) return null;
      return [s.slice(i, k + 3), k + 3];
    }
    // declaration <!A ...> : letter after !
    if (j + 1 < n && isAlpha(s.charCodeAt(j + 1))) {
      const k = s.indexOf('>', j + 1);
      if (k === -1) return null;
      return [s.slice(i, k + 1), k + 1];
    }
    return null;
  }
  if (c1 === '?') {
    const k = s.indexOf('?>', j + 1);
    if (k === -1) return null;
    return [s.slice(i, k + 2), k + 2];
  }
  if (c1 === '/') {
    j++;
    if (j >= n || !isAlpha(s.charCodeAt(j))) return null;
    while (j < n && (isAlnum(s.charCodeAt(j)) || s[j] === '-')) j++;
    while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
    if (j >= n || s[j] !== '>') return null;
    return [s.slice(i, j + 1), j + 1];
  }
  if (!isAlpha(s.charCodeAt(j))) return null;
  while (j < n && (isAlnum(s.charCodeAt(j)) || s[j] === '-')) j++;
  // attributes
  while (j < n) {
    let ws = 0;
    while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) { j++; ws++; }
    if (j >= n) return null;
    if (s[j] === '>') return [s.slice(i, j + 1), j + 1];
    if (s[j] === '/' && s[j + 1] === '>') return [s.slice(i, j + 2), j + 2];
    // a '/' not immediately followed by '>' is not a valid tag end
    if (s[j] === '/') return null;
    // an attribute name must be preceded by whitespace (a tag name or a
    // value followed directly by a name, like <a href='x'title=y>, is not
    // a tag; neither is <http:...> where ':' follows the tag name)
    if (ws === 0) return null;
    // attribute name
    if (!(isAlpha(s.charCodeAt(j)) || s[j] === '_' || s[j] === ':')) return null;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (isAlnum(c) || c === 95 || c === 58 || c === 46 || c === 45) j++;
      else break;
    }
    // whitespace before '=' is only consumed when '=' actually follows;
    // otherwise it still separates this (valueless) attribute from the next
    let k = j;
    while (k < n && (s[k] === ' ' || s[k] === '\t' || s[k] === '\n')) k++;
    if (k < n && s[k] === '=') {
      j = k + 1;
      while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
      if (j >= n) return null;
      const q = s[j];
      if (q === '"' || q === "'") {
        j++;
        while (j < n && s[j] !== q) j++;
        if (j >= n) return null;
        j++;
      } else {
        while (j < n) {
          const c = s[j];
          if (c === ' ' || c === '\t' || c === '\n' || c === '"' || c === "'" || c === '=' || c === '<' || c === '>' || c === '`') break;
          j++;
        }
      }
    }
  }
  return null;
}

const AUTOLINK_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:/;
const AUTOLINK_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/;

/** Try an <...> autolink at s[i] === '<'. Returns [html, nextIndex] or null. */
function parseAutolink(s, i) {
  const n = s.length;
  const rest = s.slice(i + 1);
  const m = AUTOLINK_SCHEME.exec(rest);
  if (m) {
    const end = rest.indexOf('>');
    if (end !== -1) {
      const url = rest.slice(0, end);
      if (url.indexOf(' ') === -1 && url.indexOf('<') === -1 && url.indexOf('\n') === -1) {
        const href = escapeHtml(cleanUrl(url) || url, false);
        return [`<a href="${href}">${escapeHtml(url, false)}</a>`, i + 1 + end + 1, url];
      }
    }
    return null;
  }
  const em = AUTOLINK_EMAIL.exec(rest);
  if (em) {
    const email = em[0];
    const after = i + 1 + email.length;
    if (after < n && s[after] === '>') {
      const href = escapeHtml(cleanUrl('mailto:' + email) || ('mailto:' + email), false);
      return [`<a href="${href}">${escapeHtml(email, false)}</a>`, after + 1, email];
    }
  }
  return null;
}

/** Trim trailing punctuation off an extended autolink URL (GFM rules). */
function trimUrlEnd(url) {
  let end = url.length;
  // a trailing &word; (entity-like) is not part of the URL
  const em = /&[A-Za-z0-9]+;$/.exec(url);
  if (em) end -= em[0].length;
  const TRAIL = new Set(['?', '!', '.', ',', ':', ';', '*', '_', '~', "'", '"']);
  while (end > 0) {
    const ch = url[end - 1];
    if (TRAIL.has(ch)) { end--; continue; }
    if (ch === ')') {
      // keep a trailing ')' when it closes an open '(' (depth just
      // before it > 0, with depth clamped at 0 so an unmatched ')'
      // earlier in the URL cannot consume the '('); otherwise trim it
      let depth = 0;
      for (let k = 0; k < end - 1; k++) {
        if (url[k] === '(') depth++;
        else if (url[k] === ')' && depth > 0) depth--;
      }
      if (depth <= 0) { end--; continue; }
      break;
    }
    break;
  }
  return url.slice(0, end);
}

const EMAIL_LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+/;
// fast lookup table for email-local chars (avoids a regex test per char)
const EMAIL_LOCAL_TAB = new Uint8Array(128);
for (const _c of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.!#$%&'*+/=?^_`{|}~-") EMAIL_LOCAL_TAB[_c.charCodeAt(0)] = 1;

/** Try a GFM extended autolink (www. / http(s) / ftp / email) at s[i].
 *  Returns [html, nextIndex] or null. */
function parseExtendedAutolink(s, i, inUnderscore, inBracket) {
  const n = s.length;
  // www. — must be lowercase and not preceded by an alphanumeric
  if (s.startsWith('www.', i)) {
    if (i > 0) {
      const pc = s.charCodeAt(i - 1);
      if (isAlnum(pc)) return null;
    }
    let j = i + 4;
    while (j < n) {
      const c = s[j];
      // stop at ']' only when it closes a label that is followed by a
      // link destination "(...)" or a reference "[...]" — otherwise ']'
      // is part of the URL
      if (c === ' ' || c === '\t' || c === '\n' || c === '<' || (c === ']' && inBracket && (s[j + 1] === '(' || s[j + 1] === '['))) break;
      // a '(' only continues the URL when a matching ')' follows before
      // the URL ends (marked's backpedal matches balanced (...) groups);
      // an unbalanced '(' ends the URL here (doc-08)
      if (c === '(') {
        let k = j + 1, hasClose = false;
        while (k < n) {
          const cc = s[k];
          if (cc === ' ' || cc === '\t' || cc === '\n' || cc === '<') break;
          if (cc === ')') { hasClose = true; break; }
          k++;
        }
        if (!hasClose) break;
      }
      j++;
    }
    if (j === i + 4) return null;
    const url = trimUrlEnd(s.slice(i, j));
    if (!url || url.length <= 4) return null;
    const href = escapeHtml(cleanUrl('http://' + url) || ('http://' + url), false);
    return [`<a href="${href}">${escapeHtml(url, false)}</a>`, i + url.length, url];
  }
  // scheme:// — only http, https, ftp link (marked's set)
  const sm = /^(https?|ftp):\/\//i.exec(s.slice(i, i + 8));
  if (sm) {
    if (i > 0) {
      const pc = s.charCodeAt(i - 1);
      if (isAlnum(pc)) return null;
    }
    let j = i + sm[0].length;
    while (j < n) {
      const c = s[j];
      if (c === ' ' || c === '\t' || c === '\n' || c === '<' || (c === ']' && inBracket && (s[j + 1] === '(' || s[j + 1] === '['))) break;
      // a '(' only continues the URL when a matching ')' follows before
      // the URL ends (marked's backpedal matches balanced (...) groups);
      // an unbalanced '(' ends the URL here (doc-08)
      if (c === '(') {
        let k = j + 1, hasClose = false;
        while (k < n) {
          const cc = s[k];
          if (cc === ' ' || cc === '\t' || cc === '\n' || cc === '<') break;
          if (cc === ')') { hasClose = true; break; }
          k++;
        }
        if (!hasClose) break;
      }
      j++;
    }
    if (j === i + sm[0].length) return null;
    const url = trimUrlEnd(s.slice(i, j));
    if (url.length <= sm[0].length) return null;
    const href = escapeHtml(cleanUrl(url) || url, false);
    return [`<a href="${href}">${escapeHtml(url, false)}</a>`, i + url.length, url];
  }
  // scheme:email[/path] — mailto:, xmpp:, etc. ('//' is only for
  // http/https/ftp, handled above; other schemes with '//' are not links)
  const schm = /^([A-Za-z][A-Za-z0-9+.-]{1,31}):/.exec(s.slice(i));
  if (schm) {
    if (i > 0 && isAlnum(s.charCodeAt(i - 1))) return null;
    const afterColon = i + schm[0].length;
    if (!s.startsWith('//', afterColon)) {
      const rest = s.slice(afterColon);
      const lm = EMAIL_LOCAL.exec(rest);
      if (lm && afterColon + lm[0].length < n && s[afterColon + lm[0].length] === '@') {
        const domRest = s.slice(afterColon + lm[0].length + 1);
        const dm = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/.exec(domRest);
        if (dm) {
          let end = afterColon + lm[0].length + 1 + dm[0].length;
          // a domain ending in '-' or '_' invalidates the whole link —
          // unless the '_' is the closer of an open '_' emphasis
          if (end < n && (s[end] === '-' || (s[end] === '_' && !inUnderscore))) return null;
          // one optional path segment (/txt, not /txt/bin)
          if (end < n && s[end] === '/') {
            let k = end + 1;
            while (k < n && s[k] !== ' ' && s[k] !== '\t' && s[k] !== '\n' && s[k] !== '<' && s[k] !== '/') k++;
            if (k > end + 1) end = k;
          }
          const url = trimUrlEnd(s.slice(i, end));
          if (!url || url.length <= schm[0].length) return null;
          const href = escapeHtml(cleanUrl(url) || url, false);
          return [`<a href="${href}">${escapeHtml(url, false)}</a>`, i + url.length, url];
        }
      }
    }
  }
  // email — local part must not be preceded by a local-part char
  if (i === 0 || !EMAIL_LOCAL.test(s[i - 1])) {
    const lm = EMAIL_LOCAL.exec(s.slice(i));
    if (lm && i + lm[0].length < n && s[i + lm[0].length] === '@') {
      const rest = s.slice(i + lm[0].length + 1);
      const dm = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/.exec(rest);
      if (dm) {
        const email = lm[0] + '@' + dm[0];
        // a domain ending in '-' or '_' invalidates the whole link —
        // unless the '_' is the closer of an open '_' emphasis
        const afterEmail = i + email.length;
        if (afterEmail < n && (s[afterEmail] === '-' || (s[afterEmail] === '_' && !inUnderscore))) return null;
        const href = escapeHtml(cleanUrl('mailto:' + email) || ('mailto:' + email), false);
        return [`<a href="${href}">${escapeHtml(email, false)}</a>`, i + email.length, email];
      }
    }
  }
  return null;
}

/** The inline parser: src -> HTML. refs is a Map of normalized label ->
 *  {dest, title}. */
// marked quirk: the lexer's inLink state is set by a raw <a ...> tag
// (matching /^<a /i) and cleared only by </a>; while set, GFM extended
// autolinks (bare URLs and emails) are suppressed — and the state leaks
// across blocks, so one unclosed <a> silences autolinks for the rest of
// the document (e.g. <a  /> before a bare URL, or <a href="foo"> before
// an email). It does not affect <...> autolinks or [text](url) links.
let inLinkState = false;
// set after a multi-backtick code-span opener fails inside a link label:
// the next single backtick in that label is its literal trailing tick
let leftoverTick = false;
// marked's emStrongMask (blockSkip) pairs a stray backtick left in a link
// label by a failed/mismatched code span (e.g. ``url`) with the opening
// backtick of the next code span, masking everything between them as one
// giant code span — so emphasis between that link and the next code span
// stays literal (e.g. [a ``b`](x) __m__ `__i__` -> __m__ literal).
// maskEnd is the source offset where that masking region ends (-1: none);
// strayTickLen is the length of the failed code-span opener in the label
// currently being scanned (0: none).
let maskEnd = -1;
let strayTickLen = 0;

function parseInline(src, refs) {
  leftoverTick = false;
  maskEnd = -1;
  strayTickLen = 0;
  const n = src.length;
  const F = []; // fragments: {k:'t',s} text | {k:'h',s} html | {k:'d',ch,len,open,close} delim | {k:'b',img,active,bang,srcStart} bracket
  const delims = []; // delimiter fragment objects, in document order

  function pushText(s) {
    if (!s) return;
    const last = F[F.length - 1];
    if (last && last.k === 't' && !last.bang) { last.s += s; return; }
    F.push({ k: 't', s });
  }

  let i = 0;
  while (i < n) {
    const c = src[i];
    // backslash escape / hard break
    if (c === '\\') {
      if (i + 1 < n && src[i + 1] === '\n') {
        F.push({ k: 'h', s: '<br>' });
        i += 2;
        // leading spaces/tabs of the next line are dropped after a break
        while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
        continue;
      }
      if (i + 1 < n && isAsciiPunct(src.charCodeAt(i + 1))) {
        // an escaped & must render as &amp; even before a word; (it is not
        // the start of an entity reference)
        if (src[i + 1] === '&') F.push({ k: 'h', s: '&amp;' });
        else pushText(src[i + 1]);
        i += 2;
        continue;
      }
      pushText('\\');
      i++;
      continue;
    }
    // code span
    if (c === '`') {
      let L = 0;
      while (i + L < n && src[i + L] === '`') L++;
      // trailing single tick of a failed ``...` opener: literal
      if (leftoverTick) {
        leftoverTick = false;
        if (L === 1) { pushText('`'); i += 1; continue; }
      }
      // marked parses the link first and isolates its label, so a
      // multi-backtick code span opener inside a link label cannot pair
      // with a closer past the label's '](' / '][' boundary (e.g.
      // [issue ``small`](url) forms the link with ``small` literal).
      // Single-backtick openers are exempt: cm-342/525/537 need them to
      // pair across '](' (the code span then blocks the link).
      let limit = n;
      if (L >= 2) {
        for (let bi = F.length - 1; bi >= 0; bi--) {
          if (F[bi].k === 'b' && F[bi].active) {
            let k = i + L;
            while (k < n) {
              if (src[k] === ']' && (src[k + 1] === '(' || src[k + 1] === '[')) { limit = k; break; }
              k++;
            }
            break;
          }
        }
      }
      let j = i + L;
      let found = -1;
      while (j < limit) {
        if (src[j] === '`') {
          let r = 0;
          while (j + r < n && src[j + r] === '`') r++;
          // marked's code-span regex requires the content to end with a
          // non-backtick char, so a run of L backticks preceded by a
          // backtick is not a valid closer (e.g. ``url` ... `` a ` b ``)
          if (r === L && src[j - 1] !== '`') { found = j; break; }
          j += r;
        } else j++;
      }
      if (found === -1) {
        // a failed multi-backtick opener leaves its trailing single
        // backtick (if any, before the label's ']') literal as well:
        // ``small` is literal, the trailing ` must not pair with a
        // distant backtick to form a code span across the link
        if (L >= 2) {
          for (let bi = F.length - 1; bi >= 0; bi--) {
            if (F[bi].k === 'b' && F[bi].active) { leftoverTick = true; break; }
          }
        }
        // record the first failed code-span opener inside a label: its
        // stray backtick starts an emStrongMask region when the link forms
        if (strayTickLen === 0) {
          for (let bi = F.length - 1; bi >= 0; bi--) {
            if (F[bi].k === 'b' && F[bi].active) { strayTickLen = L; break; }
          }
        }
        pushText('`'.repeat(L));
        i += L;
        continue;
      }
      let content = src.slice(i + L, found).replace(/\n/g, ' ');
      if (content.length > 1 && content[0] === ' ' && content[content.length - 1] === ' ' && content.trim() !== '') {
        content = content.slice(1, -1);
      }
      F.push({ k: 'h', s: '<code>' + escapeHtml(content, true) + '</code>' });
      i = found + L;
      continue;
    }
    // autolink / html tag
    if (c === '<') {
      const al = parseAutolink(src, i);
      if (al) {
        F.push({ k: 'h', s: al[0], auto: 'angle', txt: al[2] });
        i = al[1];
        continue;
      }
      const tag = parseHtmlTag(src, i);
      if (tag) {
        // track marked's inLink lexer state (see inLinkState above)
        const t0 = tag[0];
        if (!inLinkState && /^<a[\s]/i.test(t0)) inLinkState = true;
        else if (inLinkState && /^<\/a[\s>]/i.test(t0)) inLinkState = false;
        F.push({ k: 'h', s: tag[0] });
        i = tag[1];
        continue;
      }
      pushText('<');
      i++;
      continue;
    }
    // image / link opener
    if (c === '!' && src[i + 1] === '[') {
      const bang = { k: 't', s: '!', bang: true };
      F.push(bang);
      F.push({ k: 'b', img: true, active: true, bang, srcStart: i + 2 });
      i += 2;
      continue;
    }
    if (c === '[') {
      F.push({ k: 'b', img: false, active: true, bang: null, srcStart: i + 1 });
      i++;
      continue;
    }
    // link/image closer
    if (c === ']') {
      let bi = -1;
      for (let k = F.length - 1; k >= 0; k--) {
        if (F[k].k === 'b' && F[k].active) { bi = k; break; }
      }
      if (bi === -1) {
        pushText(']');
        i++;
        continue;
      }
      const opener = F[bi];
      const labelSrc = src.slice(opener.srcStart, i);
      let dest = null, title = null, end = -1, isInline = false;
      const after = i + 1;
      // 1. inline link: [label](dest "title") — an empty () is a valid
      //    empty destination
      if (after < n && src[after] === '(') {
        let j = skipWs(src, after + 1);
        let d;
        if (src[j] === ')') d = ['', j];
        else d = parseDest(src, j);
        if (d) {
          let k = skipWs(src, d[1]);
          let t = null;
          let k2 = k;
          if (k < n && (src[k] === '"' || src[k] === "'" || src[k] === '(')) {
            const tp = parseTitle(src, k);
            if (tp) { t = tp[0]; k2 = tp[1]; }
          }
          k = skipWs(src, k2);
          if (k < n && src[k] === ')') {
            dest = d[0]; title = t; end = k + 1; isInline = true;
          }
        }
      }
      // 2. full reference: [label][ref] (only if inline failed)
      if (dest === null && after < n && src[after] === '[') {
        // full reference: [label] — balanced brackets inside
        let j = after + 1;
        let depth = 0;
        let close = -1;
        while (j < n) {
          const ch = src[j];
          if (ch === '\\') { j += 2; continue; }
          if (ch === '[') depth++;
          else if (ch === ']') {
            if (depth === 0) { close = j; break; }
            depth--;
          }
          j++;
        }
        if (close !== -1) {
          const lab = src.slice(after + 1, close);
          const key = normalizeLabel(lab === '' ? labelSrc : lab);
          const ref = refs.get(key);
          if (ref) { dest = ref.dest; title = ref.title; end = close + 1; }
        }
      }
      // 3. shortcut reference: [label] (only if inline/full failed, and
      //    not when a full reference was attempted and failed: [foo][bar]
      //    with no [bar] ref leaves [foo] literal, it is not a shortcut)
      if (dest === null && !(after < n && src[after] === '[')) {
        const key = normalizeLabel(labelSrc);
        const ref = refs.get(key);
        if (ref) { dest = ref.dest; title = ref.title; end = after; }
      }
      if (dest === null) {
        // a failed closer deactivates its opener (nested brackets unwind
        // outward, so [link [foo [bar]]] resolves to the outermost link)
        opener.active = false;
        pushText(']');
        i++;
        continue;
      }
      // a link cannot contain another *explicit* (markdown) link; a raw
      // HTML <a> tag inside the label does NOT block the outer link, and
      // an autolink inside the text is demoted to plain text when the
      // outer link forms
      let hasLink = false;
      if (!opener.img) {
        for (let fi = bi + 1; fi < F.length; fi++) {
          const ff = F[fi];
          if (ff.k === 'h' && ff.link) { hasLink = true; break; }
        }
      }
      // marked quirk: a link does not form when its label holds a code
      // span whose content contains a backtick, unless that span is the
      // last thing in the label (its label regex can match trailing
      // backticks before ']', e.g. [quote `` a ` b ``](url) forms)
      let badCodeSpan = false;
      if (!opener.img) {
        for (let fi = bi + 1; fi < F.length; fi++) {
          const ff = F[fi];
          if (ff.k === 'h' && ff.s.startsWith('<code>') && ff.s.endsWith('</code>') && ff.s.slice(6, -7).includes('`') && fi < F.length - 1) { badCodeSpan = true; break; }
        }
      }
      if (hasLink || badCodeSpan) {
        // when a link fails because its label holds a code span with a
        // backtick, marked also leaves any emphasis inside that label
        // unformed (its emphasis masking covers the whole label)
        if (badCodeSpan) {
          for (let fi = bi + 1; fi < F.length; fi++) {
            const ff = F[fi];
            if (ff.k === 'd' && (ff.ch === '*' || ff.ch === '_' || ff.ch === '~')) { ff.open = false; ff.close = false; }
          }
        }
        strayTickLen = 0;
        opener.active = false;
        pushText(']');
        i++;
        continue;
      }
      // demote bare (extended) autolinks inside the link text to plain
      // text; angle-bracket autolinks stay links (nested <a> in the output)
      if (!opener.img) {
        for (let fi = bi + 1; fi < F.length; fi++) {
          const ff = F[fi];
          if (ff.k === 'h' && ff.auto === 'ext') { ff.k = 't'; ff.s = ff.txt; delete ff.auto; delete ff.txt; }
        }
      }
      const href = cleanUrl(unescBs(dest));
      if (href === null) {
        strayTickLen = 0;
        opener.active = false;
        pushText(']');
        i++;
        continue;
      }
      const hrefAttr = escapeHtml(href, false);
      const titleAttr = title !== null && title !== undefined
        ? ' title="' + escapeHtml(unescBs(title), false) + '"' : '';
      // bracket openers inside the link text can no longer form links
      for (let fi = bi + 1; fi < F.length; fi++) {
        if (F[fi].k === 'b') F[fi].active = false;
      }
      // a stray backtick in the label (from a failed/mismatched code span,
      // e.g. ``url`) starts a masking region in marked's emStrongMask:
      // anyPunctuationOutsideCode pairs the stray opener run with the next
      // run of the same length, else blockSkip pairs the trailing single
      // tick with the next single tick. Emphasis before that point stays
      // literal; with no such run in this inline text there is no mask
      // (e.g. doc-06: no backtick after the link in the paragraph).
      // Reference links are exempt: marked's reflink masking hides their
      // whole [label][ref] before blockSkip runs, so the stray never pairs.
      if (isInline && strayTickLen > 0) {
        const sl = strayTickLen;
        let me = -1;
        let p = end;
        while (p < n) {
          if (src[p] === '\\') { p += 2; continue; }
          if (src[p] === '`') {
            let r = 0;
            while (p + r < n && src[p + r] === '`') r++;
            if (r === sl) { me = p; break; }
            p += r;
            continue;
          }
          p++;
        }
        if (me === -1) {
          p = end;
          while (p < n) {
            if (src[p] === '\\') { p += 2; continue; }
            if (src[p] === '`') {
              let r = 0;
              while (p + r < n && src[p + r] === '`') r++;
              if (r === 1) { me = p; break; }
              p += r;
              continue;
            }
            p++;
          }
        }
        if (me !== -1) maskEnd = me;
      }
      strayTickLen = 0;
      if (opener.img) {
        const alt = escapeHtml(plainTextInline(labelSrc, refs), false);
        const imgTag = `<img src="${hrefAttr}" alt="${alt}"${titleAttr}>`;
        if (opener.bang) opener.bang.s = '';
        F[bi] = { k: 'h', s: imgTag };
        // drop everything after the opener (the link text nodes)
        F.length = bi + 1;
        for (let d = delims.length - 1; d >= 0; d--) {
          if (F.indexOf(delims[d]) === -1) delims.splice(d, 1);
        }
      } else {
        // delimiters inside a link can only pair within the same link
        const linkContainer = {};
        for (let fi = bi + 1; fi < F.length; fi++) {
          const ff = F[fi];
          if (ff.k === 'd' && ff.container === undefined) ff.container = linkContainer;
        }
        F[bi] = { k: 'h', s: `<a href="${hrefAttr}"${titleAttr}>`, link: true };
        F.push({ k: 'h', s: '</a>' });
      }
      opener.active = false;
      i = end;
      continue;
    }
    // emphasis / strikethrough delimiter runs
    if (c === '*' || c === '_' || c === '~') {
      let L = 0;
      while (i + L < n && src[i + L] === c) L++;
      // three or more tildes in a row are not a strikethrough delimiter
      if (c === '~' && L >= 3) {
        pushText('~'.repeat(L));
        i += L;
        continue;
      }
      const beforePunct = punctAt(src, i - 1);
      const afterPunct = punctAt(src, i + L);
      const beforeWS = i === 0 || wsAt(src, i - 1);
      const afterWS = i + L >= n || wsAt(src, i + L);
      const leftFlank = !afterWS && (!afterPunct || beforeWS || beforePunct);
      const rightFlank = !beforeWS && (!beforePunct || afterWS || afterPunct);
      let open, close;
      if (c === '_') {
        open = leftFlank && (!rightFlank || beforePunct);
        close = rightFlank && (!leftFlank || afterPunct);
      } else {
        open = leftFlank;
        close = rightFlank;
      }
      // inside a masking region started by a stray backtick in an earlier
      // link label (see maskEnd), emphasis delimiters stay literal until
      // the region ends; past the end the mask is over
      if (maskEnd !== -1) {
        if (i < maskEnd) { open = false; close = false; }
        else maskEnd = -1;
      }
      const frag = { k: 'd', ch: c, len: L, open, close };
      F.push(frag);
      delims.push(frag);
      i += L;
      continue;
    }
    // extended autolinks (www. / scheme / email)
    if (c === 'w' || c === 'h' || c === 'f' || isAlnum(c.charCodeAt(0)) || c === '.' || c === '+' || c === '-' || c === '_') {
      // a trailing '_' does not invalidate an email when it closes an
      // open '_' emphasis delimiter
      let inU = false;
      let inB = false;
      for (let di = delims.length - 1; di >= 0; di--) {
        if (delims[di].ch === '_' && delims[di].open && delims[di].len > 0) { inU = true; break; }
      }
      // inB: an autolink stops at ']' only when the innermost active
      // bracket's label could still form a link (no explicit link inside
      // it yet); when the label already holds a link, the outer link
      // cannot form, so the URL runs on through ](dest)
      for (let fi = F.length - 1; fi >= 0; fi--) {
        if (F[fi].k === 'b' && F[fi].active) {
          let hasLink = false;
          for (let fj = fi + 1; fj < F.length; fj++) {
            const ff = F[fj];
            if (ff.k === 'h' && ff.link) { hasLink = true; break; }
          }
          inB = !hasLink;
          break;
        }
      }
      const ea = inLinkState ? null : parseExtendedAutolink(src, i, inU, inB);
      if (ea) {
        F.push({ k: 'h', s: ea[0], auto: 'ext', txt: ea[2] });
        i = ea[1];
        continue;
      }
    }
    // newline: hard break (2+ trailing spaces) or soft break
    if (c === '\n') {
      const last = F[F.length - 1];
      if (last && last.k === 't') {
        let sp = 0;
        while (sp < last.s.length && last.s[last.s.length - 1 - sp] === ' ') sp++;
        if (sp >= 2) {
          last.s = last.s.slice(0, last.s.length - sp);
          F.push({ k: 'h', s: '<br>' });
          i++;
          // leading spaces/tabs of the next line are dropped after a break
          while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
          continue;
        }
      }
      pushText('\n');
      i++;
      continue;
    }
    // ordinary text run — stop at any char the scanner handles specially,
    // and at any position where an extended autolink could start
    let j = i;
    while (j < n) {
      const ch = src[j];
      if (ch === '\\' || ch === '`' || ch === '<' || ch === '[' || ch === ']' || ch === '*' || ch === '_' || ch === '~' || ch === '\n' || (ch === '!' && src[j + 1] === '[')) break;
      if (ch === 'w' && j > i && src.startsWith('www.', j)) break;
      // https?:// and ftp:// — direct char compare, no slice/regex
      if ((ch === 'h' || ch === 'H') && j > i) {
        const c1 = src[j + 1], c2 = src[j + 2], c3 = src[j + 3], c4 = src[j + 4];
        if ((c1 === 't' || c1 === 'T') && (c2 === 't' || c2 === 'T') && (c3 === 'p' || c3 === 'P')) {
          if (c4 === ':' && src[j + 5] === '/' && src[j + 6] === '/') break;
          if ((c4 === 's' || c4 === 'S') && src[j + 5] === ':' && src[j + 6] === '/' && src[j + 7] === '/') break;
        }
      }
      if ((ch === 'f' || ch === 'F') && j > i) {
        const c1 = src[j + 1], c2 = src[j + 2], c3 = src[j + 3];
        if ((c1 === 't' || c1 === 'T') && (c2 === 'p' || c2 === 'P') && c3 === ':' && src[j + 4] === '/' && src[j + 5] === '/') break;
      }
      if (j > i) {
        const cc = src.charCodeAt(j);
        if (cc < 128 && EMAIL_LOCAL_TAB[cc]) {
          const pc = src.charCodeAt(j - 1);
          if (!(pc < 128 && EMAIL_LOCAL_TAB[pc])) {
            // possible email start: break only if a @ follows the local run
            let k = j;
            while (k < n) { const kc = src.charCodeAt(k); if (kc < 128 && EMAIL_LOCAL_TAB[kc]) k++; else break; }
            if (k < n && src[k] === '@') break;
          }
        }
      }
      j++;
    }
    pushText(src.slice(i, j));
    i = j;
  }

  processEmphasis(F, delims);

  let out = '';
  for (const f of F) {
    if (f.k === 't') out += renderText(f.s);
    else if (f.k === 'h') out += f.s;
    else if (f.k === 'd') out += f.ch.repeat(f.len);
    else if (f.k === 'b') out += '[';
  }
  return out;
}

/** CommonMark delimiter-stack emphasis processing over the fragment list.
 *  A delimiter inside a formed emphasis or link can only pair with a
 *  delimiter inside the same container (tracked via frag.container). */
function processEmphasis(F, delims) {
  // marked quirk: a single-* em does not form when its content holds
  // a **strong** that is preceded by whitespace and immediately
  // followed by an alphanumeric character, with the closing * after
  // it and no ** in between
  // (e.g. *a **b**c* stays literal, but *a **b** c*, *a **b**-c* and
  // *foo**bar**baz* do form em, and *a **b**c** d* does too)
  function badSingleEm(opener, closer) {
    if (opener.len !== 1) return false;
    const oIdx0 = F.indexOf(opener);
    const cIdx0 = F.indexOf(closer);
    if (oIdx0 === -1 || cIdx0 === -1) return false;
    let lastStrongOpen = -1;
    for (let fi = oIdx0 + 1; fi < cIdx0; fi++) {
      if (F[fi].k === 'h' && F[fi].s === '<strong>') { lastStrongOpen = fi; continue; }
      if (F[fi].k === 'h' && F[fi].s === '</strong>') {
        const nx = F[fi + 1];
        if (nx && nx.k === 't' && nx.s.length > 0 && /[A-Za-z0-9]/.test(nx.s[0])) {
          // the ** must be preceded by whitespace (a space before
          // the opening <strong>); *foo**bar**baz* forms em
          const beforeOpen = lastStrongOpen > 0 ? F[lastStrongOpen - 1] : null;
          const precededByWs = beforeOpen && beforeOpen.k === 't' && /[\s]$/.test(beforeOpen.s);
          if (precededByWs) {
            let hasStar2 = false;
            for (let fj = fi + 2; fj < cIdx0; fj++) {
              if (F[fj].k === 'd' && F[fj].ch === '*' && F[fj].len >= 2) { hasStar2 = true; break; }
            }
            if (!hasStar2) return true;
          }
        }
      }
    }
    return false;
  }
  for (let di = 0; di < delims.length; di++) {
    const closer = delims[di];
    if (closer.k !== 'd' || !closer.close || closer.len === 0) continue;
    // find nearest preceding opener of the same char that can open
    let oi = -1;
    for (let dj = di - 1; dj >= 0; dj--) {
      const cand = delims[dj];
      if (cand.k !== 'd' || cand.ch !== closer.ch || !cand.open || cand.len === 0) continue;
      // a delimiter inside a formed emphasis/link cannot pair across it
      if (cand.container !== closer.container) continue;
      // rule of 3: when either delimiter can both open and close, the sum
      // of the run lengths must not be a multiple of 3 unless both are
      const candBoth = cand.open && cand.close;
      const closerBoth = closer.open && closer.close;
      if ((candBoth || closerBoth) && (cand.len + closer.len) % 3 === 0
        && !((cand.len % 3 === 0) && (closer.len % 3 === 0))) continue;
      // a single * closer must not steal a delimiter from a ** opener
      // when a later ** closer could form a strong with that opener
      // (e.g. **a *b*c* d** — the * after c stays literal). A *** opener
      // may still give one delimiter to an em and two to a strong
      // (cm-430 ***foo* bar**).
      if (closer.ch === '*' && closer.len === 1 && cand.len === 2) {
        let laterStrong = false;
        for (let dk = di + 1; dk < delims.length; dk++) {
          const dd = delims[dk];
          if (dd.k === 'd' && dd.ch === '*' && dd.len >= 2 && dd.close && dd.container === cand.container) { laterStrong = true; break; }
        }
        if (laterStrong) continue;
      }
      // an em (use === 1) from a single-* opener is blocked by the
      // **X**Y* quirk above; try the next opener instead
      const useCand = (cand.len >= 2 && closer.len >= 2) ? 2 : 1;
      if (closer.ch === '*' && useCand === 1 && badSingleEm(cand, closer)) continue;
      oi = dj;
      break;
    }
    if (oi === -1) continue;
    const opener = delims[oi];
    const use = (opener.len >= 2 && closer.len >= 2) ? 2 : 1;
    let openTag, closeTag;
    if (closer.ch === '*') { openTag = use === 2 ? '<strong>' : '<em>'; closeTag = use === 2 ? '</strong>' : '</em>'; }
    else if (closer.ch === '_') { openTag = use === 2 ? '<strong>' : '<em>'; closeTag = use === 2 ? '</strong>' : '</em>'; }
    else { openTag = '<del>'; closeTag = '</del>'; }
    // replace opener fragment with tag (+ leftover literal chars before it)
    let oIdx = F.indexOf(opener);
    if (oIdx === -1) continue;
    // delimiters between opener and closer now live inside this emphasis
    const emContainer = {};
    for (let fi = oIdx + 1; fi < F.length; fi++) {
      const ff = F[fi];
      if (ff === closer) break;
      if (ff.k === 'd' && ff.container === closer.container) ff.container = emContainer;
    }
    opener.len -= use;
    if (opener.len > 0) {
      F.splice(oIdx + 1, 0, { k: 'h', s: openTag, emCh: closer.ch });
    } else {
      F[oIdx] = { k: 'h', s: openTag, emCh: closer.ch };
    }
    // replace closer fragment with tag (+ leftover literal chars after it)
    let cIdx = F.indexOf(closer);
    if (cIdx === -1) continue;
    closer.len -= use;
    if (closer.len > 0) {
      // A leftover delimiter normally renders AFTER the close tag, so it
      // can pair with an earlier opener (outer em). But a leftover '*' of
      // a '*' strong whose content ends in a nested '*' em followed only
      // by plain text belongs INSIDE the strong (e.g. **a *b*c*** ->
      // <strong>a <em>b</em>c*</strong>), and only then — and only when
      // it cannot pair with any earlier opener (dead).
      let moveInside = false;
      if (use === 2 && closer.ch === '*') {
        // find the last nested em in this strong's content
        let lastEmClose = -1;
        for (let fi = oIdx + 1; fi < cIdx; fi++) {
          if (F[fi].k === 'h' && F[fi].s === '</em>' && F[fi].emCh === '*') lastEmClose = fi;
        }
        if (lastEmClose !== -1) {
          let onlyText = true;
          for (let fi = lastEmClose + 1; fi < cIdx; fi++) {
            if (F[fi].k !== 't') { onlyText = false; break; }
          }
          if (onlyText) {
            let canPair = false;
            for (let dj = di - 1; dj >= 0 && !canPair; dj--) {
              const cand = delims[dj];
              if (cand.k !== 'd' || cand.ch !== closer.ch || !cand.open || cand.len === 0) continue;
              if (cand.container !== closer.container) continue;
              const candBoth = cand.open && cand.close;
              const closerBoth = closer.open && closer.close;
              if ((candBoth || closerBoth) && (cand.len + closer.len) % 3 === 0
                && !((cand.len % 3 === 0) && (closer.len % 3 === 0))) continue;
              if (closer.ch === '*' && closer.len === 1 && cand.len === 2) {
                let laterStrong = false;
                for (let dk = di + 1; dk < delims.length; dk++) {
                  const dd = delims[dk];
                  if (dd.k === 'd' && dd.ch === '*' && dd.len >= 2 && dd.close && dd.container === cand.container) { laterStrong = true; break; }
                }
                if (laterStrong) continue;
              }
              const useCand = (cand.len >= 2 && closer.len >= 2) ? 2 : 1;
              if (closer.ch === '*' && useCand === 1 && badSingleEm(cand, closer)) continue;
              canPair = true;
            }
            if (!canPair) moveInside = true;
          }
        }
      }
      if (moveInside) {
        F.splice(cIdx + 1, 0, { k: 'h', s: closeTag, emCh: closer.ch });
        closer.container = emContainer;
        closer.close = false;
      } else {
        F.splice(cIdx, 0, { k: 'h', s: closeTag, emCh: closer.ch });
      }
    } else {
      F[cIdx] = { k: 'h', s: closeTag, emCh: closer.ch };
    }
    // if the closer still has delimiters left, it may match another opener
    if (closer.len > 0 && closer.close) { di--; }
  }
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------
// Lines are {s, eol}: the raw text and whether it was newline-terminated.

/** Expand leading tabs to spaces (tab = to next multiple of 4, from col 0).
 *  Only the leading whitespace run is expanded; tabs later in the line are
 *  preserved. Used when a container strips a line: marked expands a leading
 *  tab by its absolute column, so after stripping the container prefix the
 *  remainder is spaces, not a tab. */
function expandLeadingTabs(s) {
  let i = 0, col = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) { col += 4 - (col % 4); i++; }
    else break;
  }
  if (i === 0) return s;
  return ' '.repeat(col) + s.slice(i);
}

/** Strip for a lazy continuation line inside a list item: I = the line's
 *  indent in columns, R = the item's content indent. A line indented less
 *  than min(R,4) keeps its spaces; a line indented between min(R,4) and R
 *  loses all of them; a line between R and R+4 loses R; a line at or past
 *  R+4 loses R+4. */
function lazyListStrip(I, R) {
  if (I < Math.min(R, 4)) return 0;
  if (I < R) return I;
  if (I < R + 4) return R;
  return R + 4;
}

function isBlankStr(s) {
  return /^[ \t]*$/.test(s);
}

/** Leading whitespace width in columns (tab = to next multiple of 4) and
 *  the char index where it ends. */
function lineIndent(s) {
  let col = 0, i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) { col += 4 - (col % 4); i++; }
    else break;
  }
  return [col, i];
}

/** Remove n columns of leading indent; a tab straddling the boundary
 *  becomes spaces. */
/** Strip up to n columns of leading indent. A tab that would overshoot n
 *  is normally replaced by the remaining spaces; with dropTab it is
 *  removed entirely (fenced code content: the tab is indent, not content). */
function stripIndentCols(s, n, dropTab) {
  let col = 0, i = 0;
  while (i < s.length && col < n) {
    const c = s.charCodeAt(i);
    if (c === 32) { col++; i++; }
    else if (c === 9) {
      const w = 4 - (col % 4);
      if (col + w > n) {
        if (dropTab) return s.slice(i + 1);
        return ' '.repeat(col + w - n) + s.slice(i + 1);
      }
      col += w; i++;
    } else break;
  }
  return s.slice(i);
}

/** Join content lines, each contributing its line ending when it had one. */
function joinContent(lines) {
  let out = '';
  for (const l of lines) out += l.s + (l.eol ? '\n' : '');
  return out;
}

function matchAtx(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return null;
  let p = idx, level = 0;
  while (p < s.length && s[p] === '#' && level < 7) { level++; p++; }
  if (level === 0 || level > 6) return null;
  if (p < s.length && s[p] !== ' ' && s[p] !== '\t') return null;
  // strip a closing sequence of #s BEFORE trimming: '### ###' is empty
  const text = s.slice(p).replace(/[ \t]+#+[ \t]*$/, '').trim();
  return { level, text };
}

function matchFence(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return null;
  const ch = s[idx];
  if (ch !== '`' && ch !== '~') return null;
  let p = idx, len = 0;
  while (p < s.length && s[p] === ch) { len++; p++; }
  if (len < 3) return null;
  const info = s.slice(p);
  if (ch === '`' && info.indexOf('`') !== -1) return null;
  return { ch, len, indent: ind, info };
}

function matchHr(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return null;
  const rest = s.slice(idx).replace(/[ \t]/g, '');
  if (rest.length < 3) return null;
  const c = rest[0];
  if (c !== '-' && c !== '*' && c !== '_') return null;
  for (let k = 1; k < rest.length; k++) if (rest[k] !== c) return null;
  return true;
}

function matchSetext(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return 0;
  const rest = s.slice(idx);
  if (/^=+[ \t]*$/.test(rest)) return 1;
  if (/^-+[ \t]*$/.test(rest)) return 2;
  return 0;
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(' '));

/** HTML block start: returns type 1-7 or 0. */
function matchHtmlStart(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return 0;
  const rest = s.slice(idx);
  if (/^<(script|pre|style|textarea)([\s>]|$)/i.test(rest)) return 1;
  if (rest.startsWith('<!--')) return 2;
  if (rest.startsWith('<?')) return 3;
  if (/^<![A-Za-z]/.test(rest)) return 4;
  if (rest.startsWith('<![CDATA[')) return 5;
  const m6 = /^<\/?([A-Za-z][A-Za-z0-9-]*)(\s|\/?>|$)/.exec(rest);
  if (m6 && BLOCK_TAGS.has(m6[1].toLowerCase())) return 6;
  const tag = parseHtmlTag(rest, 0);
  if (tag && rest.slice(tag[1]).trim() === '') return 7;
  return 0;
}

function matchBlockquote(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return null;
  if (s[idx] !== '>') return null;
  const p = idx + 1;
  // the whitespace after '>' is expanded to spaces on absolute columns,
  // then exactly one column of it is consumed; a tab loses one column and
  // its remainder becomes spaces (e.g. '>\t\tfoo' leaves 6 spaces)
  let col = ind + 1, spaces = 0, q = p;
  while (q < s.length && (s[q] === ' ' || s[q] === '\t')) {
    if (s[q] === ' ') { col++; spaces++; q++; }
    else { const w = 4 - (col % 4); col += w; spaces += w; q++; }
  }
  if (q === p) return { rest: s.slice(p) };
  return { rest: ' '.repeat(spaces - 1) + s.slice(q) };
}

function matchListMarker(s) {
  const [ind, idx] = lineIndent(s);
  if (ind > 3) return null;
  let p = idx;
  let ordered = false, num = 0, delim = '';
  const c = s.charCodeAt(p);
  if (c === 45 || c === 43 || c === 42) {
    delim = s[p];
    p++;
  } else if (isDigit(c)) {
    let q = p;
    while (q < s.length && isDigit(s.charCodeAt(q))) q++;
    if (q - p > 9) return null;
    const d = s[q];
    if (d !== '.' && d !== ')') return null;
    num = parseInt(s.slice(p, q), 10);
    delim = d;
    ordered = true;
    p = q + 1;
  } else return null;
  if (p < s.length && s[p] !== ' ' && s[p] !== '\t') return null;
  let col = ind + (p - idx);
  let q = p;
  let wcol = col;
  while (q < s.length && (s[q] === ' ' || s[q] === '\t')) {
    if (s[q] === ' ') wcol++;
    else wcol += 4 - (wcol % 4);
    q++;
  }
  const W = wcol - col;
  let contentIndent;
  if (q >= s.length) contentIndent = col + 1;
  else if (W >= 1 && W <= 4) contentIndent = wcol;
  else contentIndent = col + 1;
  const hasContent = s.slice(p).trim() !== '';
  return { ordered, num, delim, indent: ind, markerLen: p - idx, contentIndent, hasContent, afterMarker: q, wsCols: W };
}

/** Split a table row on unescaped | (marked's de(): no code-span
 *  detection — a | inside a code span splits unless escaped as \|). */
function splitTableRow(s) {
  const t = s.trim();
  let marked = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '|') {
      let bs = 0, p = i - 1;
      while (p >= 0 && t[p] === '\\') { bs++; p--; }
      marked += (bs % 2 === 1) ? '|' : ' |';
    } else marked += t[i];
  }
  const cells = marked.split(' |');
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map(c => c.trim().replace(/\\\|/g, '|'));
}

/** Table delimiter row -> array of alignments (null|'left'|'right'|'center'), or null. */
function matchTableDelim(s) {
  const cells = splitTableRow(s);
  if (!cells || cells.length === 0) return null;
  const aligns = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    aligns.push(left && right ? 'center' : left ? 'left' : right ? 'right' : null);
  }
  return aligns;
}

/** Skip spaces/tabs then at most one newline + spaces/tabs; -1 on blank line. */
function skipWs1(t, i) {
  let j = i;
  while (j < t.length && (t[j] === ' ' || t[j] === '\t')) j++;
  if (j < t.length && t[j] === '\n') {
    j++;
    while (j < t.length && (t[j] === ' ' || t[j] === '\t')) j++;
    if (j < t.length && t[j] === '\n') return -1;
  }
  return j;
}

/** Try to parse a link reference definition starting at line i (may span
 *  lines: the title can be on the next line or span lines). A definition
 *  never spans a blank line. Returns {label, dest, title, lines} or null. */
function tryRefDef(L, i) {
  // join lines until a blank line (a def never spans one), capped
  let t = '';
  let nlines = 0;
  for (let k = i; k < L.length && nlines < 20; k++) {
    if (k > i && isBlankStr(L[k].s)) break;
    t += L[k].s + (k < L.length - 1 ? '\n' : '');
    nlines++;
  }
  if (nlines === 0) return null;
  const [ind, idx] = lineIndent(L[i].s);
  if (ind > 3) return null;
  let p = idx;
  if (t[p] !== '[') return null;
  let q = p + 1;
  let label = '';
  while (q < t.length) {
    const ch = t[q];
    if (ch === '\\' && q + 1 < t.length) { label += t.slice(q, q + 2); q += 2; continue; }
    if (ch === '[') return null;
    if (ch === ']') break;
    label += ch;
    q++;
    if (label.length > 999) return null;
  }
  if (q >= t.length || t[q] !== ']') return null;
  if (label.trim() === '') return null;
  q++;
  if (t[q] !== ':') return null;
  q++;
  q = skipWs1(t, q);
  if (q === -1) return null;
  const d = parseDest(t, q);
  if (!d) return null;
  q = d[1];
  // The destination must be followed by whitespace (or end of line) before
  // any title; a title glued to the destination invalidates the definition.
  const destEnd = q;
  let title = null;
  let titleEnd = destEnd;
  // skip spaces/tabs on the destination's line
  let r = destEnd;
  while (r < t.length && (t[r] === ' ' || t[r] === '\t')) r++;
  if (r < t.length && (t[r] === '"' || t[r] === "'" || t[r] === '(')) {
    // title on the same line as the destination (only when whitespace
    // separates it from the destination)
    if (r === destEnd) return null;
    const tp = parseTitle(t, r);
    if (!tp) return null; // malformed title on the def line: no definition
    title = tp[0];
    titleEnd = tp[1];
    // after the title only spaces/tabs may follow on its line
    let s2 = titleEnd;
    while (s2 < t.length && (t[s2] === ' ' || t[s2] === '\t')) s2++;
    if (s2 < t.length && t[s2] !== '\n') return null;
    q = titleEnd;
  } else if (r < t.length && t[r] === '\n') {
    // destination line ends here; a title may be on the next line, but
    // only if it is the only thing on that line
    let r2 = r + 1;
    while (r2 < t.length && (t[r2] === ' ' || t[r2] === '\t')) r2++;
    if (r2 < t.length && (t[r2] === '"' || t[r2] === "'" || t[r2] === '(')) {
      const tp = parseTitle(t, r2);
      if (tp) {
        let s2 = tp[1];
        while (s2 < t.length && (t[s2] === ' ' || t[s2] === '\t')) s2++;
        if (s2 >= t.length || t[s2] === '\n') {
          title = tp[0];
          titleEnd = tp[1];
          q = titleEnd;
        }
        // else: trailing text after the title -> dest-only definition
      }
      // else: malformed title on the next line -> dest-only definition
    }
    // else: no title on the next line -> dest-only definition
    if (title === null) q = destEnd;
  } else if (r < t.length) {
    return null; // trailing non-whitespace after the destination
  } else {
    q = destEnd; // end of the joined text: dest-only definition
  }
  const lines = t.slice(0, q).split('\n').length;
  return { label: normalizeLabel(label), dest: d[0], title, lines };
}

/** Is this line a paragraph text line (not a block start)? Used for the
 *  lazy-continuation heuristic: a paragraph stays open after such a line. */
function isParaTextLine(s) {
  const [ind, idx] = lineIndent(s);
  if (ind >= 4) return false;
  const rest = s.slice(idx);
  if (rest === '') return false;
  if (rest[0] === '>') return isParaTextLine(rest.slice(1).replace(/^[ \t]/, ''));
  if (matchAtx(s) || matchFence(s) || matchHr(s)) return false;
  if (matchSetext(s)) return false;
  const ht = matchHtmlStart(s);
  if (ht && ht !== 7) return false;
  const lm = matchListMarker(s);
  if (lm) return lm.hasContent;
  return true;
}

/** Can this line start a block that interrupts a paragraph? (Setext underlines
 *  and table delimiters are not interruptions — they belong to the paragraph.)
 *  An ordered list may only interrupt a paragraph when it starts with 1 —
 *  except inside a list item, where any number may start a nested list. */
function isInterruptBlock(s, anyNum) {
  const [ind] = lineIndent(s);
  if (ind >= 4) return false;
  if (matchAtx(s) || matchFence(s) || matchHr(s)) return true;
  if (matchBlockquote(s) !== null) return true;
  const ht = matchHtmlStart(s);
  if (ht && ht !== 7) return true;
  const lm = matchListMarker(s);
  if (lm && lm.hasContent && (!lm.ordered || lm.num === 1 || anyNum)) return true;
  return false;
}

/** Parse a blockquote starting at line i. Returns {blocks, next}. A blank
 *  line with no > ends the blockquote. A lazy continuation line (no >) is
 *  included while a paragraph is open; its indent is stripped by 4 columns
 *  when it has at least 4, and a line that would be a setext underline is
 *  given 4 spaces so it stays paragraph text. */
function parseBlockquote(L, i, i1, refs) {
  const content = [];
  let j = i;
  let paraOpen = false;
  // a fenced code block inside the quote: lazy lines (no '>') cannot
  // continue it, they end the quote instead — so track the fence state
  // and keep paraOpen false while a fence is open
  let fence = null;
  while (j < i1) {
    const lj = L[j];
    const s = expandLeadingTabs(lj.s);
    const bqm = matchBlockquote(s);
    if (bqm !== null) {
      content.push({ s: bqm.rest, eol: lj.eol, sp: bqm.rest !== '' && /^[ ]+$/.test(bqm.rest) });
      if (fence) {
        const fr = bqm.rest;
        const [find, fidx] = lineIndent(fr);
        let k = fidx;
        while (k < fr.length && fr[k] === fence.ch) k++;
        if (find <= 3 && k - fidx >= fence.len && fr.slice(k).trim() === '') fence = null;
      } else {
        const fm = matchFence(bqm.rest);
        if (fm) fence = fm;
      }
      // an empty '>' line ends the paragraph inside the quote
      paraOpen = fence ? false : (bqm.rest === '' ? false : (paraOpen && !isInterruptBlock(bqm.rest)) || isParaTextLine(bqm.rest));
      j++;
      continue;
    }
    if (isBlankStr(s)) break;
    if (paraOpen && !isInterruptBlock(s)) {
      // lazy continuation: strip 4 columns of indent when present
      const [ind] = lineIndent(s);
      let text = ind >= 4 ? s.slice(4) : s;
      const t = text.replace(/^[ \t]+/, '');
      if (/^(=+|-+)[ \t]*$/.test(t)) text = '    ' + t;
      content.push({ s: text, eol: lj.eol, lazy: true });
      paraOpen = (paraOpen && !isInterruptBlock(text)) || isParaTextLine(text);
      j++;
      continue;
    }
    break;
  }
  return { blocks: parseBlocks(content, 0, content.length, refs), next: j };
}

/** Parse a list starting at line i. Returns {list, next}. */
function parseList(L, i, i1, refs) {
  const first = matchListMarker(expandLeadingTabs(L[i].s));
  const ordered = first.ordered;
  const delim = first.delim;
  const items = [];
  let loose = false;
  let j = i;
  while (j < i1) {
    const lj = L[j];
    const s = expandLeadingTabs(lj.s);
    if (isBlankStr(s)) {
      let k = j + 1;
      while (k < i1 && isBlankStr(L[k].s)) k++;
      if (k < i1) {
        const mk = matchListMarker(expandLeadingTabs(L[k].s));
        if (mk && mk.ordered === ordered && mk.delim === delim && !matchHr(L[k].s)) {
          loose = true;
          j = k;
          continue;
        }
      }
      break;
    }
    // an hr line ends the list (it also matches a list marker)
    if (matchHr(s)) break;
    const m = matchListMarker(s);
    if (!m || m.ordered !== ordered || m.delim !== delim) break;
    const ci = m.contentIndent;
    const itemLines = [];
    if (m.hasContent) {
      let fc;
      if (m.wsCols >= 5) fc = ' '.repeat(m.wsCols - 1) + s.slice(m.afterMarker);
      else fc = s.slice(m.afterMarker);
      itemLines.push({ s: fc, eol: lj.eol });
    } else {
      itemLines.push({ s: '', eol: lj.eol });
    }
    let paraOpen = m.hasContent;
    let k = j + 1;
    while (k < i1) {
      const lk = L[k];
      const ls = expandLeadingTabs(lk.s);
      if (isBlankStr(ls)) {
        let m2 = k + 1;
        while (m2 < i1 && isBlankStr(L[m2].s)) m2++;
        if (m2 >= i1) break;
        const [ind2] = lineIndent(expandLeadingTabs(L[m2].s));
        const mk2 = matchListMarker(expandLeadingTabs(L[m2].s));
        // an empty item cannot continue past a blank line
        if (itemLines.some(x => x.s.trim() !== '') && ((mk2 && mk2.ordered === ordered && mk2.delim === delim && !matchHr(L[m2].s)) || ind2 >= ci)) {
          // a marker at indent < ci is a new item of this list: the blank
          // line separates items, so the list is loose; an indented
          // continuation is handled by the item's own blankSep below
          if (mk2 && mk2.ordered === ordered && mk2.delim === delim && !matchHr(L[m2].s) && ind2 < ci) loose = true;
          for (let b = k; b < m2; b++) itemLines.push({ s: '', eol: L[b].eol });
          paraOpen = false;
          k = m2;
          continue;
        }
        break;
      }
      const [indk] = lineIndent(ls);
      if (indk >= ci) {
        // a continuation at or beyond the content indent loses ci columns
        const stripped = stripIndentCols(ls, ci);
        itemLines.push({ s: stripped, eol: lk.eol });
        paraOpen = (paraOpen && !isInterruptBlock(stripped)) || isParaTextLine(stripped);
        k++;
        continue;
      }
      // any list marker ends this item (a different delimiter starts a
      // new list, handled by the outer loop)
      const mk3 = matchListMarker(ls);
      if (mk3) break;
      if (paraOpen && !isInterruptBlock(ls)) {
        const text = stripIndentCols(ls, lazyListStrip(indk, ci));
        itemLines.push({ s: text, eol: lk.eol, lazy: true });
        paraOpen = (paraOpen && !isInterruptBlock(text)) || isParaTextLine(text);
        k++;
        continue;
      }
      break;
    }
    // drop leading/trailing blank lines of the item
    while (itemLines.length && itemLines[0].s === '') itemLines.shift();
    while (itemLines.length && itemLines[itemLines.length - 1].s === '') itemLines.pop();
    const out = {};
    const itemBlocks = parseBlocks(itemLines, 0, itemLines.length, refs, out, false, true);
    // a list is loose when an item directly contains two blocks separated
    // by a blank line (blank lines inside a nested list do not loosen the
    // outer lists)
    if (out.blankSep) loose = true;
    items.push({ blocks: itemBlocks });
    j = k;
  }
  return { list: { t: 'list', ordered, start: first.num, tight: !loose, items }, next: j };
}

/** Collect a paragraph starting at line i. Returns
 *  {kind:'para'|'setext'|'table', ... , next}. */
function collectParagraph(L, i, i1, inList) {
  const lines = [];
  let j = i;
  while (j < i1) {
    const lj = L[j];
    // a spaces-only line from a blockquote (">  ") is paragraph text, not blank
    if (isBlankStr(lj.s) && !lj.sp) break;
    if (j > i) {
      // a lazy continuation line is paragraph text, never a setext underline
      const se = lj.lazy ? 0 : matchSetext(lj.s);
      if (se) return { kind: 'setext', level: se, lines, next: j + 1 };
      if (lines.length === 1) {
        const [dind] = lineIndent(lj.s);
        if (dind <= 3) {
          const delim = matchTableDelim(lj.s);
          if (delim) {
            const head = splitTableRow(lines[0].s);
            if (head && head.length === delim.length) {
              return { kind: 'table', aligns: delim, head, next: j + 1 };
            }
          }
        }
      }
      if (isInterruptBlock(lj.s, inList) && !lj.lazy) break;
    }
    lines.push(lj);
    j++;
  }
  return { kind: 'para', lines, next: j };
}

/** Parse the block structure of lines L[i0..i1). refs collects link refs.
 *  inList: this range is a list item's content — any ordered-list number
 *  may interrupt a paragraph here (nested list). */
function parseBlocks(L, i0, i1, refs, out, docEnd, inList) {
  const blocks = [];
  let i = i0;
  // blankSep: a blank line separated two top-level blocks of this range
  // (blanks inside a nested block do not count). A block pushed after a
  // blank line sets it; a line that pushes no block (refdef) does not.
  let blankSincePush = false;
  let lastPushLen = 0;
  while (i < i1) {
    if (blocks.length > lastPushLen) {
      if (blankSincePush && out) out.blankSep = true;
      blankSincePush = false;
      lastPushLen = blocks.length;
    }
    const line = L[i];
    if (isBlankStr(line.s)) { if (blocks.length) blankSincePush = true; i++; continue; }
    const [ind] = lineIndent(line.s);
    // indented code
    if (ind >= 4) {
      const content = [];
      let j = i;
      while (j < i1) {
        const lj = L[j];
        if (isBlankStr(lj.s)) {
          let k = j + 1;
          while (k < i1 && isBlankStr(L[k].s)) k++;
          if (k < i1 && lineIndent(L[k].s)[0] >= 4) {
            // a whitespace-only line indented >= 4 is code content, not blank
            for (let b = j; b < k; b++) {
              const [bind] = lineIndent(L[b].s);
              content.push(bind >= 4 ? { s: stripIndentCols(L[b].s, 4), eol: L[b].eol } : { s: '', eol: L[b].eol });
            }
            j = k;
            continue;
          }
          break;
        }
        if (lineIndent(lj.s)[0] < 4) break;
        content.push({ s: stripIndentCols(lj.s, 4), eol: lj.eol });
        j++;
      }
      blocks.push({ t: 'icode', text: joinContent(content) });
      i = j;
      continue;
    }
    // ATX heading
    const atx = matchAtx(line.s);
    if (atx) {
      blocks.push({ t: 'heading', level: atx.level, text: atx.text });
      i++;
      continue;
    }
    // fenced code
    const fence = matchFence(line.s);
    if (fence) {
      const content = [];
      let j = i + 1;
      let closed = false;
      while (j < i1) {
        const lj = L[j];
        const [indj, idxj] = lineIndent(lj.s);
        const restj = lj.s.slice(idxj);
        if (indj <= 3) {
          let k = 0;
          while (k < restj.length && restj[k] === fence.ch) k++;
          if (k >= fence.len && restj.slice(k).trim() === '') { j++; closed = true; break; }
        }
        // marked quirk: a ~~~ fence does not strip the fence indent from
        // its content lines, only a ``` fence does
        const stripN = fence.ch === '~' ? 0 : Math.min(fence.indent, 3);
        content.push({ s: stripIndentCols(lj.s, stripN, true), eol: lj.eol });
        j++;
      }
      let lang = '';
      const info = fence.info.trim();
      if (info) lang = info.split(/[ \t]+/)[0];
      // a closing fence drops one trailing blank line of the content
      let ftext = joinContent(content);
      if (closed && (ftext === '\n' || ftext.endsWith('\n\n'))) ftext = ftext.slice(0, -1);
      blocks.push({ t: 'fcode', lang, text: ftext });
      i = j;
      continue;
    }
    // thematic break
    if (matchHr(line.s)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    // HTML block
    const htype = matchHtmlStart(line.s);
    if (htype) {
      const content = [line];
      let j = i + 1;
      const endRe = htype === 1 ? /<\/(script|pre|style|textarea)/i
        : htype === 2 ? /-->/
        : htype === 3 ? /\?>/
        : htype === 4 ? />/
        : htype === 5 ? /\]\]>/
        : null;
      // the start line itself may already satisfy the end condition
      // (e.g. '<!-- -->' ends a type-2 block on its own line)
      let endedByEndRe = false;
      if (!(endRe && endRe.test(line.s))) {
        while (j < i1) {
          if (htype >= 6 && isBlankStr(L[j].s)) break;
          content.push(L[j]);
          j++;
          if (endRe && endRe.test(L[j - 1].s)) { endedByEndRe = true; break; }
        }
      } else {
        endedByEndRe = true;
      }
      // the trailing newline of the last line is dropped when the block
      // ends at a blank line or at the end of its container range; a block
      // that ends by its end condition keeps the newline unless the next
      // line is a truly empty blank line (a whitespace-only blank line
      // does not strip it)
      let htmlText = joinContent(content);
      let strip = false;
      if (endedByEndRe) {
        if (j < i1 && L[j].s === '') strip = true;
        else if (j >= i1 && !docEnd) strip = true;
      } else {
        const endsAtBlank = j < i1 && isBlankStr(L[j].s);
        const endsAtRange = j >= i1 && !docEnd;
        strip = endsAtBlank || endsAtRange;
      }
      if (strip && htmlText.endsWith('\n')) htmlText = htmlText.slice(0, -1);
      blocks.push({ t: 'html', text: htmlText });
      i = j;
      continue;
    }
    // blockquote
    if (matchBlockquote(line.s) !== null) {
      const bq = parseBlockquote(L, i, i1, refs);
      blocks.push({ t: 'bq', blocks: bq.blocks });
      i = bq.next;
      continue;
    }
    // list
    const lm = matchListMarker(line.s);
    if (lm) {
      const lst = parseList(L, i, i1, refs);
      blocks.push(lst.list);
      i = lst.next;
      continue;
    }
    // link reference definition
    const def = tryRefDef(L, i);
    if (def) {
      // a refdef is a block-level element: after a blank line it separates
      // the preceding block from what follows (loose-list rule, cm-317)
      if (blankSincePush && out) out.blankSep = true;
      blankSincePush = false;
      if (!refs.has(def.label)) refs.set(def.label, { dest: def.dest, title: def.title });
      i += def.lines;
      continue;
    }
    // paragraph / setext heading / table
    const para = collectParagraph(L, i, i1, inList);
    if (para.kind === 'setext') {
      blocks.push({ t: 'heading', level: para.level, text: para.lines.map(l => l.s).join('\n').trim() });
      i = para.next;
      continue;
    }
    if (para.kind === 'table') {
      const rows = [];
      let j = para.next;
      // a whitespace-only line ends the table, EXCEPT a line containing
      // a tab (marked quirk: a tab-only line is an empty table row)
      while (j < i1 && (!isBlankStr(L[j].s) || L[j].s.includes('\t'))) {
        // a block start (blockquote, heading, fence, HTML block, list,
        // hr) is not a table row
        if (isInterruptBlock(L[j].s, false)) break;
        const cells = splitTableRow(L[j].s);
        const row = [];
        for (let c = 0; c < para.head.length; c++) row.push(c < cells.length ? cells[c] : '');
        rows.push(row);
        j++;
      }
      blocks.push({ t: 'table', aligns: para.aligns, head: para.head, rows });
      i = j;
      continue;
    }
    blocks.push({ t: 'para', text: para.lines.map(l => l.s).join('\n') });
    i = para.next;
  }
  if (blocks.length > lastPushLen && blankSincePush && out) out.blankSep = true;
  return blocks;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBlocks(blocks, refs) {
  let out = '';
  for (const b of blocks) {
    if (b.t === 'para') {
      out += '<p>' + parseInline(b.text, refs) + '</p>\n';
    } else if (b.t === 'heading') {
      out += '<h' + b.level + '>' + parseInline(b.text, refs) + '</h' + b.level + '>\n';
    } else if (b.t === 'fcode') {
      const lang = b.lang ? ' class="language-' + escapeHtml(unescBs(b.lang), false) + '"' : '';
      out += '<pre><code' + lang + '>' + escapeHtml(b.text, true) + '</code></pre>\n';
    } else if (b.t === 'icode') {
      out += '<pre><code>' + escapeHtml(b.text, true) + '</code></pre>\n';
    } else if (b.t === 'hr') {
      out += '<hr>\n';
    } else if (b.t === 'html') {
      out += b.text;
    } else if (b.t === 'bq') {
      out += '<blockquote>\n' + renderBlocks(b.blocks, refs) + '</blockquote>\n';
    } else if (b.t === 'list') {
      out += renderList(b, refs);
    } else if (b.t === 'table') {
      out += renderTable(b, refs);
    }
  }
  return out;
}

function renderListItem(item, tight, refs) {
  let blocks = item.blocks;
  let prefix = '';
  if (blocks.length && blocks[0].t === 'para') {
    const m = /^\[([ xX])\]( |$)/.exec(blocks[0].text);
    if (m) {
      const checked = m[1] === 'x' || m[1] === 'X';
      const box = checked
        ? '<input checked="" disabled="" type="checkbox">'
        : '<input disabled="" type="checkbox">';
      if (tight) {
        prefix = box;
        blocks = [{ t: 'para', text: blocks[0].text.slice(3) }].concat(blocks.slice(1));
      } else {
        // in a loose list the checkbox lives inside the <p>
        blocks = [{ t: 'para', text: box + blocks[0].text.slice(3) }].concat(blocks.slice(1));
      }
    }
  }
  let inner = '';
  if (tight) {
    for (const b of blocks) {
      if (b.t === 'para') inner += parseInline(b.text, refs);
      else inner += renderBlocks([b], refs);
    }
  } else {
    inner += renderBlocks(blocks, refs);
  }
  return '<li>' + prefix + inner + '</li>\n';
}

function renderList(b, refs) {
  const tag = b.ordered
    ? (b.start !== 1 ? `<ol start="${b.start}">` : '<ol>')
    : '<ul>';
  let out = tag + '\n';
  for (const item of b.items) out += renderListItem(item, b.tight, refs);
  out += b.ordered ? '</ol>\n' : '</ul>\n';
  return out;
}

function renderTable(b, refs) {
  let out = '<table>\n<thead>\n<tr>\n';
  for (let c = 0; c < b.head.length; c++) {
    const a = b.aligns[c] ? ` align="${b.aligns[c]}"` : '';
    out += `<th${a}>` + parseInline(b.head[c], refs) + '</th>\n';
  }
  out += '</tr>\n</thead>\n';
  if (b.rows.length) {
    out += '<tbody>';
    for (const row of b.rows) {
      out += '<tr>\n';
      for (let c = 0; c < row.length; c++) {
        const a = b.aligns[c] ? ` align="${b.aligns[c]}"` : '';
        out += `<td${a}>` + parseInline(row[c], refs) + '</td>\n';
      }
      out += '</tr>\n';
    }
    out += '</tbody>';
  }
  out += '</table>\n';
  return out;
}

/** parse(markdown) returns exactly the HTML marked 18.1.3 renders with its
 *  default options (GFM on). */
export function parse(markdown) {
  inLinkState = false;
  const src = String(markdown).replace(/\r\n?/g, '\n');
  const raw = src.split('\n');
  const L = [];
  for (let k = 0; k < raw.length; k++) L.push({ s: raw[k], eol: k < raw.length - 1 });
  if (L.length && L[L.length - 1].s === '' && !L[L.length - 1].eol) L.pop();
  const refs = new Map();
  const blocks = parseBlocks(L, 0, L.length, refs, undefined, true);
  return renderBlocks(blocks, refs);
}
