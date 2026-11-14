import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CatalogExam, ExamAlias, UnmappedExamTag, CustomTestFilter } from '../types';

export const DEFAULT_CATALOG_EXAMS: CatalogExam[] = [
  { id: 'bpsc', name: 'BPSC (Bihar Public Service Commission)', shortName: 'BPSC', categoryGroup: 'State PSC', active: true, order: 1 },
  { id: 'upsc', name: 'UPSC Civil Services (IAS)', shortName: 'UPSC (IAS)', categoryGroup: 'Civil Services', active: true, order: 2 },
  { id: 'bihar-police-si', name: 'Bihar Police SI (Daroga)', shortName: 'Bihar Police SI (Daroga)', categoryGroup: 'Police', active: true, order: 3 },
  { id: 'bihar-police-constable', name: 'Bihar Police Constable', shortName: 'Bihar Police Constable', categoryGroup: 'Police', active: true, order: 4 },
  { id: 'uppsc', name: 'UPPSC (Uttar Pradesh Public Service Commission)', shortName: 'UPPSC', categoryGroup: 'State PSC', active: true, order: 5 },
  { id: 'mppsc', name: 'MPPSC (Madhya Pradesh Public Service Commission)', shortName: 'MPPSC', categoryGroup: 'State PSC', active: true, order: 6 },
  { id: 'rpsc', name: 'RPSC (Rajasthan Administrative Services - RAS)', shortName: 'RPSC (RAS)', categoryGroup: 'State PSC', active: true, order: 7 },
  { id: 'jpsc', name: 'JPSC (Jharkhand Public Service Commission)', shortName: 'JPSC', categoryGroup: 'State PSC', active: true, order: 8 },
  { id: 'ukpsc', name: 'UKPSC (Uttarakhand Public Service Commission)', shortName: 'UKPSC', categoryGroup: 'State PSC', active: true, order: 9 },
  { id: 'cgpsc', name: 'CGPSC (Chhattisgarh Public Service Commission)', shortName: 'CGPSC', categoryGroup: 'State PSC', active: true, order: 10 },
  { id: 'ssc-cgl', name: 'SSC Combined Graduate Level (CGL)', shortName: 'SSC CGL', categoryGroup: 'SSC', active: true, order: 11 },
  { id: 'ssc-chsl', name: 'SSC Combined Higher Secondary Level (CHSL)', shortName: 'SSC CHSL', categoryGroup: 'SSC', active: true, order: 12 },
  { id: 'ssc-mts', name: 'SSC Multi Tasking Staff (MTS)', shortName: 'SSC MTS', categoryGroup: 'SSC', active: true, order: 13 },
  { id: 'ssc-gd', name: 'SSC General Duty Constable (GD)', shortName: 'SSC GD', categoryGroup: 'SSC', active: true, order: 14 },
  { id: 'ssc-cpo', name: 'SSC Central Police Organization (CPO)', shortName: 'SSC CPO', categoryGroup: 'SSC', active: true, order: 15 },
  { id: 'rrb-ntpc', name: 'RRB Non-Technical Popular Categories (NTPC)', shortName: 'RRB NTPC', categoryGroup: 'Railway', active: true, order: 16 },
  { id: 'rrb-group-d', name: 'RRB Group D Examination', shortName: 'RRB Group D', categoryGroup: 'Railway', active: true, order: 17 },
  { id: 'rrb-alp', name: 'RRB Assistant Loco Pilot (ALP)', shortName: 'RRB ALP', categoryGroup: 'Railway', active: true, order: 18 },
  { id: 'rrb-je', name: 'RRB Junior Engineer (JE)', shortName: 'RRB JE', categoryGroup: 'Railway', active: true, order: 19 },
  { id: 'bihar-teacher', name: 'Bihar School Teacher (TRE / STET)', shortName: 'Bihar Teacher (TRE/STET)', categoryGroup: 'Teaching', active: true, order: 20 },
  { id: 'ctet-tet', name: 'Central Teacher Eligibility Test (CTET / State TET)', shortName: 'CTET/TET', categoryGroup: 'Teaching', active: true, order: 21 },
  { id: 'banking', name: 'Banking Services (IBPS PO / Clerk / SBI)', shortName: 'Banking (IBPS/SBI)', categoryGroup: 'Banking', active: true, order: 22 },
  { id: 'defence', name: 'National Defence Academy & Combined Defence (NDA / CDS)', shortName: 'Defence (NDA/CDS)', categoryGroup: 'Defence', active: true, order: 23 },
];

export const DEFAULT_EXAM_ALIASES: Array<{ tag: string; examId: string; examName: string }> = [
  { tag: 'U.P.P.C.S.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P.P.S.C.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P. U.D.A./L.D.A.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P.U.D.A./L.D.A', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P. Lower Sub.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P. Lower Subordinate', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P.P.S.C. GIC', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P.P.S.C. R.I.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P. R.O./A.R.O.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P.R.O./A.R.O.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'U.P. P.C.S.', examId: 'uppsc', examName: 'UPPSC' },
  { tag: 'I.A.S.', examId: 'upsc', examName: 'UPSC (IAS)' },
  { tag: 'U.P.S.C.', examId: 'upsc', examName: 'UPSC (IAS)' },
  { tag: 'M.P.P.C.S.', examId: 'mppsc', examName: 'MPPSC' },
  { tag: 'M.P. P.C.S.', examId: 'mppsc', examName: 'MPPSC' },
  { tag: 'R.A.S./R.T.S.', examId: 'rpsc', examName: 'RPSC (RAS)' },
  { tag: 'R.A.S./R.T.S', examId: 'rpsc', examName: 'RPSC (RAS)' },
  { tag: 'R.P.S.C.', examId: 'rpsc', examName: 'RPSC (RAS)' },
  { tag: 'B.P.S.C.', examId: 'bpsc', examName: 'BPSC' },
  { tag: 'B.P.C.S.', examId: 'bpsc', examName: 'BPSC' },
  { tag: 'BPSC', examId: 'bpsc', examName: 'BPSC' },
  { tag: 'Jharkhand P.C.S.', examId: 'jpsc', examName: 'JPSC' },
  { tag: 'J.P.S.C.', examId: 'jpsc', examName: 'JPSC' },
  { tag: 'Uttarakhand P.C.S.', examId: 'ukpsc', examName: 'UKPSC' },
  { tag: 'Uttarakhand Lower Sub.', examId: 'ukpsc', examName: 'UKPSC' },
  { tag: 'U.K.P.C.S.', examId: 'ukpsc', examName: 'UKPSC' },
  { tag: 'Chhattisgarh P.C.S.', examId: 'cgpsc', examName: 'CGPSC' },
  { tag: 'C.G.P.C.S.', examId: 'cgpsc', examName: 'CGPSC' },
  { tag: 'Bihar Police SI', examId: 'bihar-police-si', examName: 'Bihar Police SI (Daroga)' },
  { tag: 'Bihar Daroga', examId: 'bihar-police-si', examName: 'Bihar Police SI (Daroga)' },
  { tag: 'Bihar Police', examId: 'bihar-police-constable', examName: 'Bihar Police Constable' },
  { tag: 'SSC CGL', examId: 'ssc-cgl', examName: 'SSC CGL' },
  { tag: 'S.S.C. CGL', examId: 'ssc-cgl', examName: 'SSC CGL' },
  { tag: 'SSC CHSL', examId: 'ssc-chsl', examName: 'SSC CHSL' },
  { tag: 'S.S.C. CHSL', examId: 'ssc-chsl', examName: 'SSC CHSL' },
  { tag: 'RRB NTPC', examId: 'rrb-ntpc', examName: 'RRB NTPC' },
  { tag: 'Railway NTPC', examId: 'rrb-ntpc', examName: 'RRB NTPC' },
];

/**
 * Normalizes raw tag text and matches against catalog exams and alias table.
 * Strips numeric prefixes like "66th B.P.S.C." or "48th to 52nd B.P.S.C.".
 */
export function matchExamTag(
  rawTag: string,
  aliases: ExamAlias[],
  catalog: CatalogExam[]
): { exam: CatalogExam; stage?: 'Pre' | 'Mains'; year?: string } | null {
  if (!rawTag || !rawTag.trim()) return null;
  const tag = rawTag.trim();

  // Extract stage if present
  let stage: 'Pre' | 'Mains' | undefined = undefined;
  if (/\b(?:mains|main)\b/i.test(tag)) stage = 'Mains';
  else if (/\b(?:pre|prelims|preliminary)\b/i.test(tag)) stage = 'Pre';

  // Extract year if present
  let year: string | undefined = undefined;
  const yearMatch = tag.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) year = yearMatch[1];

  // Clean tag for matching: strip out year, stage, brackets, prefix numbers (e.g. "66th", "47th")
  let clean = tag
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\b(pre|mains|main|prelims|spl|re\.?\s*exam|gic|r\.i\.)\b/gi, '')
    .replace(/^\s*\d+(?:st|nd|rd|th)?(?:\s*to\s*\d+(?:st|nd|rd|th)?)?\s*/i, '')
    .replace(/[\(\)\[\]\:\-\,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // 1. Direct match with alias table
  for (const a of aliases) {
    const aClean = a.tag.replace(/[\(\)\[\]\:\-\,\.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (clean === aClean || clean.includes(aClean) || aClean.includes(clean)) {
      const found = catalog.find((c) => c.id === a.examId || c.shortName.toLowerCase() === a.examName.toLowerCase());
      if (found) return { exam: found, stage, year };
    }
  }

  // 2. Direct match with catalog exams
  for (const ex of catalog) {
    const sClean = ex.shortName.replace(/[\(\)\[\]\:\-\,\.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (clean === sClean || clean.includes(sClean)) {
      return { exam: ex, stage, year };
    }
  }

  // 3. Regex checks for standard patterns
  if (/\b(?:bpsc|bpcs)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'bpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:uppsc|uppcs|u\.p\.\s*p\.c\.s|lower\s*sub)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'uppsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:mppsc|mppcs|m\.p\.\s*p\.c\.s)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'mppsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:rpsc|ras|r\.a\.s)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'rpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:upsc|ias|i\.a\.s)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'upsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:jpsc|jharkhand)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'jpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:ukpsc|uttarakhand)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'ukpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:cgpsc|chhattisgarh)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'cgpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:daroga|police\s*si)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'bihar-police-si');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:cgl)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'ssc-cgl');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:chsl)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'ssc-chsl');
    if (found) return { exam: found, stage, year };
  }
  if (/\b(?:ntpc)\b/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'rrb-ntpc');
    if (found) return { exam: found, stage, year };
  }

  // Hindi/Devanagari exam patterns
  if (/बीपीएससी|बिहार\s*लोक\s*सेवा/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'bpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/यूपीपीसीएस|यूपीपीएससी|उ\.?प्र\.?\s*पी\.?सी\.?एस/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'uppsc');
    if (found) return { exam: found, stage, year };
  }
  if (/एमपीपीसीएस|म\.?प्र\.?\s*पी\.?सी\.?एस/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'mppsc');
    if (found) return { exam: found, stage, year };
  }
  if (/आरएएस|आरपीएससी|राजस्थान\s*प्रशासनिक/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'rpsc');
    if (found) return { exam: found, stage, year };
  }
  if (/यूपीएससी|आईएएस|सिविल\s*सेवा/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'upsc');
    if (found) return { exam: found, stage, year };
  }
  if (/एसएससी\s*सीजीएल/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'ssc-cgl');
    if (found) return { exam: found, stage, year };
  }
  if (/रेलवे|आरआरबी/i.test(tag)) {
    const found = catalog.find((c) => c.id === 'rrb-ntpc');
    if (found) return { exam: found, stage, year };
  }

  return null;
}

const hasAnyKeyword = (text: string, keywords: string[]): boolean =>
  keywords.some((kw) => text.includes(kw));

/**
 * Intelligent topic / heading classification to determine Subject and Chapter (English + Hindi).
 */
export function inferSubjectAndChapter(text: string, titleHint = ''): { subject: string; chapter: string } {
  const combined = `${titleHint} ${text}`.toLowerCase();

  // 1. Indian Polity & Constitution
  if (
    hasAnyKeyword(combined, [
      'constitution',
      'fundamental right',
      'directive principle',
      'parliament',
      'article',
      'amendment',
      'supreme court',
      'president of india',
      'lok sabha',
      'rajya sabha',
      'संविधान',
      'मौलिक अधिकार',
      'मूल अधिकार',
      'नीति निर्देशक',
      'संसद',
      'अनुच्छेद',
      'संशोधन',
      'सर्वोच्च न्यायालय',
      'उच्च न्यायालय',
      'राष्ट्रपति',
      'लोकसभा',
      'राज्यसभा',
      'प्रस्तावना',
      'पंचायती राज',
      'राज्यपाल',
      'चुनाव आयोग',
      'नागरिकता',
      'राजनीति',
    ])
  ) {
    let chapter = 'Constitutional Framework & Principles';
    if (
      hasAnyKeyword(combined, [
        'fundamental right',
        'article 14',
        'article 19',
        'article 21',
        'article 32',
        'मौलिक अधिकार',
        'मूल अधिकार',
        'मूल कर्तव्य',
      ])
    ) {
      chapter = 'Fundamental Rights & Duties';
    } else if (
      hasAnyKeyword(combined, ['parliament', 'lok sabha', 'rajya sabha', 'संसद', 'लोकसभा', 'राज्यसभा', 'विधेयक'])
    ) {
      chapter = 'Union Parliament & Legislation';
    } else if (
      hasAnyKeyword(combined, ['judiciary', 'supreme court', 'high court', 'सर्वोच्च न्यायालय', 'उच्च न्यायालय', 'न्यायपालिका'])
    ) {
      chapter = 'Judiciary & Legal System';
    } else if (hasAnyKeyword(combined, ['preamble', 'प्रस्तावना', 'उद्देशिका'])) {
      chapter = 'Preamble & Philosophy of Constitution';
    } else if (hasAnyKeyword(combined, ['panchayat', 'municipality', 'पंचायत', 'पंचायती राज', 'नगरपालिका'])) {
      chapter = 'Local Self-Government & Panchayati Raj';
    }
    return { subject: 'Indian Polity & Constitution', chapter };
  }

  // 2. History of India (Ancient, Medieval, Modern - English & Hindi)
  if (
    hasAnyKeyword(combined, [
      'dynasty',
      'mughal',
      'british',
      'revolt',
      'gandhi',
      'maurya',
      'harappa',
      'ancient india',
      'chronicle',
      'sultanate',
      'guptas',
      'indus valley',
      'buddhis',
      'jain',
      'इतिहास',
      'प्राचीन',
      'मध्यकाल',
      'आधुनिक भारत',
      'हड़प्पा',
      'सिंधु',
      'वैदिक',
      'मौर्य',
      'गुप्त',
      'बौद्ध',
      'जैन',
      'जातक',
      'पांडुलिपि',
      'अभिलेख',
      'शिलालेख',
      'मुगल',
      'सल्तनत',
      'अकबर',
      'बाबर',
      'औरंगजेब',
      'अलाउद्दीन',
      'बरनी',
      'रहट',
      'राष्ट्रकूट',
      'दंतिदुर्ग',
      'त्रिपाठी संघर्ष',
      'कन्नौज',
      'राजवंश',
      'वंश',
      'सम्राट',
      'शिवाजी',
      'मराठा',
      'ब्रिटिश',
      'अंग्रेज',
      'गांधी',
      '1857',
      'विद्रोह',
      'स्वतंत्रता',
      'आंदोलन',
      'गवर्नर जनरल',
      'वायसराय',
      'ईस्ट इंडिया',
    ])
  ) {
    let chapter = 'Modern Indian History & Freedom Struggle';
    if (
      hasAnyKeyword(combined, [
        'harappa',
        'indus valley',
        'maurya',
        'ancient',
        'buddhis',
        'jain',
        'vedic',
        'हड़प्पा',
        'सिंधु',
        'वैदिक',
        'मौर्य',
        'गुप्त',
        'बौद्ध',
        'जैन',
        'जातक',
        'पांडुलिपि',
        'अभिलेख',
        'शिलालेख',
        'प्राचीन',
        'अशोक',
        'चोल',
        'हर्षवर्धन',
        'महाजनपद',
      ])
    ) {
      chapter = 'Ancient Indian History & Culture';
    } else if (
      hasAnyKeyword(combined, [
        'mughal',
        'sultanate',
        'chronicle',
        'मध्यकाल',
        'मुगल',
        'सल्तनत',
        'अकबर',
        'बाबर',
        'औरंगजेब',
        'अलाउद्दीन',
        'बरनी',
        'रहट',
        'राष्ट्रकूट',
        'दंतिदुर्ग',
        'त्रिपाठी संघर्ष',
        'कन्नौज',
        'शिवाजी',
        'मराठा',
        'भक्ति',
        'सूफी',
      ])
    ) {
      chapter = 'Medieval Indian History & Sultanate';
    }
    return { subject: 'History of India', chapter };
  }

  // 3. Geography (English & Hindi)
  if (
    hasAnyKeyword(combined, [
      'river',
      'mountain',
      'monsoon',
      'soil',
      'climate',
      'peninsula',
      'geography',
      'plateau',
      'latitude',
      'longitude',
      'भूगोल',
      'नदी',
      'नदियां',
      'पहाड़',
      'पहाड़ी',
      'पर्वत',
      'हिमालय',
      'गंगा',
      'ब्रह्मपुत्र',
      'मानसून',
      'मिट्टी',
      'मृदा',
      'जलवायु',
      'प्रायद्वीप',
      'पठार',
      'झील',
      'दर्रा',
      'अक्षांश',
      'देशांतर',
      'महासागर',
      'उपमहाद्वीप',
      'द्वीप',
      'बंदरगाह',
    ])
  ) {
    const chapter = hasAnyKeyword(combined, [
      'गंगा',
      'ब्रह्मपुत्र',
      'हिमालय',
      'उपमहाद्वीप',
      'पहाड़ी',
      'नदी',
      'प्रायद्वीप',
      'भारत',
      'river',
      'himalaya',
      'peninsula',
      'monsoon',
    ])
      ? 'Indian Geography & Drainage Systems'
      : 'Physical Geography & Climate Systems';
    return { subject: 'Geography', chapter };
  }

  // 4. Physics / General Science
  if (
    hasAnyKeyword(combined, [
      'unit of',
      'joule',
      'watt',
      'force',
      'velocity',
      'acceleration',
      'gravit',
      'sound',
      'light',
      'optics',
      'electric',
      'thermodynamic',
      'physics',
      'satellite',
      'cryogenic',
      'भौतिक',
      'मात्रक',
      'इकाई',
      'बल',
      'वेग',
      'त्वरण',
      'गुरुत्वाकर्षण',
      'ध्वनि',
      'प्रकाश',
      'विद्युत',
      'ऊष्मा',
      'ऊर्जा',
      'कार्य',
      'दाब',
      'चुंबक',
      'दर्पण',
      'लेंस',
      'उपग्रह',
    ])
  ) {
    let chapter = 'Units, Dimensions & Measurement';
    if (
      hasAnyKeyword(combined, [
        'unit of',
        'measured in',
        'dimension',
        'apparatus',
        'instrument',
        'मात्रक',
        'इकाई',
        'मापन',
        'यंत्र',
      ])
    ) {
      chapter = 'Units, Measurements & Measuring Instruments';
    } else if (
      hasAnyKeyword(combined, ['gravit', 'motion under gravity', 'pendulum', 'weightlessness', 'गुरुत्वाकर्षण', 'पलायन वेग'])
    ) {
      chapter = 'Gravitation & Planetary Motion';
    } else if (
      hasAnyKeyword(combined, [
        'velocity',
        'friction',
        'acceleration',
        'force',
        'momentum',
        'inertia',
        'newton',
        'बल',
        'वेग',
        'त्वरण',
        'संवेग',
        'जड़त्व',
        'न्यूटन',
      ])
    ) {
      chapter = 'Mechanics, Force & Motion';
    } else if (
      hasAnyKeyword(combined, ['sound', 'decibel', 'frequency', 'ultrasonic', 'echo', 'sonar', 'ध्वनि', 'आवृत्ति', 'तरंग'])
    ) {
      chapter = 'Sound, Waves & Oscillations';
    } else if (
      hasAnyKeyword(combined, ['satellite', 'cryogenic', 'orbit', 'space', 'chandrayaan', 'उपग्रह', 'अंतरिक्ष', 'कक्षा'])
    ) {
      chapter = 'Space Technology & Modern Physics';
    }
    return { subject: 'Physics', chapter };
  }

  // 5. Chemistry
  if (
    hasAnyKeyword(combined, [
      'acid',
      'reaction',
      'periodic table',
      'chemical',
      'metal',
      'polymer',
      'organic',
      'रसायन',
      'अम्ल',
      'क्षार',
      'लवण',
      'अभिक्रिया',
      'आवर्त सारणी',
      'धातु',
      'अधातु',
      'परमाणु',
      'अणु',
      'बहुलक',
      'कार्बनिक',
      'हाइड्रोजन',
      'ऑक्सीजन',
    ])
  ) {
    return { subject: 'Chemistry', chapter: 'Chemical Properties & Materials' };
  }

  // 6. Biology
  if (
    hasAnyKeyword(combined, [
      'cell',
      'vitamin',
      'disease',
      'organism',
      'photosynthesis',
      'hormone',
      'genetics',
      'जीव विज्ञान',
      'कोशिका',
      'विटामिन',
      'रोग',
      'बीमारी',
      'प्रकाश संश्लेषण',
      'हार्मोन',
      'आनुवंशिकी',
      'रक्त',
      'हृदय',
      'पाचन',
      'श्वसन',
      'मस्तिष्क',
      'पौधा',
    ])
  ) {
    return { subject: 'Biology', chapter: 'Human Physiology & Nutrition' };
  }

  // 7. Indian Economy
  if (
    hasAnyKeyword(combined, [
      'economy',
      'economics',
      'inflation',
      'gdp',
      'fiscal',
      'monetary policy',
      'reserve bank',
      'budget',
      'niti aayog',
      'अर्थव्यवस्था',
      'अर्थशास्त्र',
      'मुद्रास्फीति',
      'बजट',
      'जीडीपी',
      'राजकोषीय',
      'मौद्रिक नीति',
      'योजना आयोग',
      'नीति आयोग',
      'पंचवर्षीय योजना',
      'बैंकिंग',
      'कर प्रणाली',
    ])
  ) {
    return { subject: 'Indian Economy', chapter: 'Economic Planning, Banking & Fiscal Policy' };
  }

  // 8. Environment & Ecology
  if (
    hasAnyKeyword(combined, [
      'ecology',
      'ecosystem',
      'biodiversity',
      'national park',
      'biosphere',
      'ozone',
      'पर्यावरण',
      'पारिस्थितिकी',
      'जैव विविधता',
      'ओजोन',
      'प्रदूषण',
      'राष्ट्रीय उद्यान',
      'वन्यजीव',
      'जलवायु परिवर्तन',
    ])
  ) {
    return { subject: 'Environment & Ecology', chapter: 'Biodiversity, Climate & Conservation' };
  }

  return { subject: 'General Studies', chapter: 'General Knowledge & Current Perspectives' };
}

export interface QuestionMasterItem {
  id: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctOption: 'A' | 'B' | 'C' | 'D' | '';
  explanation: string;
  type: 'factual' | 'conceptual' | 'application';
  sourcePages?: string;
  examName?: string;
  year?: string;
  examTags: string[];
  stage?: 'Pre' | 'Mains' | string;
  subject: string;
  chapter: string;
  sourcePdfId?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  language: 'English' | 'Hindi';
}

/**
 * Initializes exams and alias JSON files with defaults if not present.
 */
export function seedExamsAndAliasesIfEmpty(
  examsFilePath: string,
  aliasesFilePath: string
): { exams: CatalogExam[]; aliases: ExamAlias[] } {
  let exams: CatalogExam[] = [];
  try {
    if (fs.existsSync(examsFilePath)) {
      exams = JSON.parse(fs.readFileSync(examsFilePath, 'utf-8')) || [];
    }
  } catch {}

  if (exams.length === 0) {
    exams = DEFAULT_CATALOG_EXAMS;
    try {
      fs.writeFileSync(examsFilePath, JSON.stringify(exams, null, 2), 'utf-8');
    } catch {}
  }

  let aliases: ExamAlias[] = [];
  try {
    if (fs.existsSync(aliasesFilePath)) {
      aliases = JSON.parse(fs.readFileSync(aliasesFilePath, 'utf-8')) || [];
    }
  } catch {}

  if (aliases.length === 0) {
    aliases = DEFAULT_EXAM_ALIASES.map((a, idx) => ({
      id: `alias_${idx + 1}`,
      ...a,
    }));
    try {
      fs.writeFileSync(aliasesFilePath, JSON.stringify(aliases, null, 2), 'utf-8');
    } catch {}
  }

  return { exams, aliases };
}

/**
 * Split an array of questions into chunks of at most 100 questions, rebalancing so every chunk has at least 5.
 */
export function chunkQuestionsBalanced<T>(questions: T[], maxPerTest = 100, minPerTest = 5): T[][] {
  const total = questions.length;
  if (total < minPerTest) return [];
  if (total <= maxPerTest) return [questions];

  const numChunks = Math.ceil(total / maxPerTest);
  const targetSize = Math.ceil(total / numChunks);
  const chunks: T[][] = [];

  for (let i = 0; i < total; i += targetSize) {
    chunks.push(questions.slice(i, i + targetSize));
  }

  if (chunks.length > 1 && chunks[chunks.length - 1].length < minPerTest) {
    const last = chunks.pop()!;
    const prev = chunks.pop()!;
    const combined = [...prev, ...last];
    const half = Math.floor(combined.length / 2);
    chunks.push(combined.slice(0, half));
    chunks.push(combined.slice(half));
  }

  return chunks;
}

/**
 * Normalizes all questions, organizes into single question store, maps exam aliases,
 * carries forward subject & chapter headings, builds ready-made tests (chapter, subject, exam, year),
 * and detects unmapped tags.
 */
export function organizeQuestionsAndBuildTests(
  existingTests: any[],
  exams: CatalogExam[],
  aliases: ExamAlias[],
  existingQuestionsStore: QuestionMasterItem[] = []
): {
  masterQuestions: QuestionMasterItem[];
  readyMadeTests: any[];
  unmappedTags: UnmappedExamTag[];
  unplacedQuestions: Array<{ id: string; question: string; rawExamName?: string }>;
} {
  const questionsMap = new Map<string, QuestionMasterItem>();

  // Add already saved questions in master store
  for (const q of existingQuestionsStore) {
    if (q && q.question) {
      const key = q.question.toLowerCase().trim().replace(/\s+/g, ' ');
      questionsMap.set(key, q);
    }
  }

  const unmappedTagCounts = new Map<string, { count: number; sample: string }>();
  const unplacedQuestions: Array<{ id: string; question: string; rawExamName?: string }> = [];

  let currentSubject = 'General Science';
  let currentChapter = 'Units, Measurements & Measuring Instruments';

  // Process all tests and their questions
  for (const test of existingTests) {
    const testTitleHint = test.title || '';
    const qs = Array.isArray(test.questions) ? test.questions : [];

    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q || !q.question) continue;
      const normKey = q.question.toLowerCase().trim().replace(/\s+/g, ' ');

      // Extract exam tags
      const rawTag = q.examName || test.examName || '';
      const matched = matchExamTag(rawTag, aliases, exams);

      const examTagsSet = new Set<string>();
      if (Array.isArray(q.examTags)) {
        q.examTags.forEach((t: string) => examTagsSet.add(t));
      }

      let stage: 'Pre' | 'Mains' | string = q.stage || (matched?.stage ? matched.stage : 'Pre');
      let year: string = q.year || matched?.year || test.year || '';

      if (matched) {
        examTagsSet.add(matched.exam.shortName);
      } else if (rawTag.trim()) {
        const cleanTag = rawTag.trim();
        // Ignore generic or non-exam phrases
        if (cleanTag.length < 40 && !cleanTag.includes('Watt') && !cleanTag.includes('1000 m')) {
          const currentCount = unmappedTagCounts.get(cleanTag) || { count: 0, sample: q.question };
          currentCount.count++;
          unmappedTagCounts.set(cleanTag, currentCount);
        }
      }

      // Check inline text in question or options for tags like "U.P.P.C.S. (Pre) 1996"
      const allText = `${q.question} ${q.options ? Object.values(q.options).join(' ') : ''}`;
      const inlineTagMatches = allText.match(/(?:\[|\()([^\]\)\n]*?\b(19\d{2}|20\d{2})\b[^\]\)\n]*?)(?:\]|\))/g);
      if (inlineTagMatches) {
        for (const it of inlineTagMatches) {
          const subMatch = matchExamTag(it, aliases, exams);
          if (subMatch) {
            examTagsSet.add(subMatch.exam.shortName);
            if (!year && subMatch.year) year = subMatch.year;
            if (subMatch.stage) stage = subMatch.stage;
          }
        }
      }

      // Fallback exam tag if none mapped yet: default to UPPSC or BPSC if mentioned in test
      if (examTagsSet.size === 0) {
        const testMatch = matchExamTag(testTitleHint, aliases, exams);
        if (testMatch) {
          examTagsSet.add(testMatch.exam.shortName);
        } else {
          // If completely unplaced, track it
          unplacedQuestions.push({
            id: q.id || `q_${questionsMap.size + 1}`,
            question: q.question,
            rawExamName: q.examName,
          });
          examTagsSet.add('General Studies');
        }
      }

      // Subject and chapter: detect or carry forward
      let subject = q.subject;
      let chapter = q.chapter;

      if (!subject || !chapter) {
        const inferred = inferSubjectAndChapter(q.question, testTitleHint);
        if (inferred.subject) {
          currentSubject = inferred.subject;
          currentChapter = inferred.chapter;
        }
        subject = inferred.subject || currentSubject;
        chapter = inferred.chapter || currentChapter;
      } else {
        currentSubject = subject;
        currentChapter = chapter;
      }

      // Format options
      const opts = q.options || { A: '', B: '', C: '', D: '' };
      const qItem: QuestionMasterItem = {
        id: String(q.id || `q_${questionsMap.size + 1}`),
        question: q.question.trim(),
        options: {
          A: opts.A || opts.a || '',
          B: opts.B || opts.b || '',
          C: opts.C || opts.c || '',
          D: opts.D || opts.d || '',
        },
        correctOption: q.correctOption || 'A',
        explanation: q.explanation || 'Refer to standard syllabus and previous year solution notes.',
        type: q.type || 'factual',
        sourcePages: q.sourcePages || 'Section 1',
        examName: Array.from(examTagsSet).join(', '),
        year: year || '2020',
        examTags: Array.from(examTagsSet),
        stage,
        subject,
        chapter,
        sourcePdfId: q.sourcePdfId || test.sourcePdfId || '',
        difficulty: (test.difficulty as any) || 'Medium',
        language: (test.language as any) || 'English',
      };

      questionsMap.set(normKey, qItem);
    }
  }

  const masterQuestions = Array.from(questionsMap.values());

  // -------------------------------------------------------------
  // Automatic Ready-Made Test Synthesis
  // -------------------------------------------------------------
  const readyMadeTests: any[] = [];
  const testIdSeen = new Set<string>();

  // 1. Chapter-wise tests
  const chapterGroups = new Map<string, QuestionMasterItem[]>();
  for (const q of masterQuestions) {
    const key = `${q.subject}___${q.chapter}`;
    if (!chapterGroups.has(key)) chapterGroups.set(key, []);
    chapterGroups.get(key)!.push(q);
  }

  chapterGroups.forEach((cQuestions, key) => {
    if (cQuestions.length < 5) return;
    const [subj, chap] = key.split('___');
    const chunks = chunkQuestionsBalanced(cQuestions, 100, 5);

    chunks.forEach((chunk, idx) => {
      const partSuffix = chunks.length > 1 ? ` (Part ${idx + 1})` : '';
      const testId = `test_chap_${crypto.createHash('md5').update(`${subj}_${chap}_${idx}`).digest('hex').slice(0, 10)}`;
      if (testIdSeen.has(testId)) return;
      testIdSeen.add(testId);

      readyMadeTests.push({
        id: testId,
        title: `${chap} - Chapter Practice${partSuffix}`,
        createdAt: new Date().toISOString(),
        status: 'published',
        language: chunk[0]?.language || 'English',
        difficulty: 'Medium',
        questionCount: chunk.length,
        durationMinutes: Math.max(10, Math.round(chunk.length * 0.9)),
        markingCorrect: 1.0,
        markingWrong: 0.25,
        sourcePageCount: 1,
        examName: Array.from(new Set(chunk.flatMap((q) => q.examTags))).slice(0, 3).join(', '),
        year: Array.from(new Set(chunk.map((q) => q.year).filter(Boolean))).sort().join('-'),
        subject: subj,
        chapter: chap,
        examTags: Array.from(new Set(chunk.flatMap((q) => q.examTags))),
        questions: chunk,
      });
    });
  });

  // 2. Subject-wise tests
  const subjectGroups = new Map<string, QuestionMasterItem[]>();
  for (const q of masterQuestions) {
    if (!subjectGroups.has(q.subject)) subjectGroups.set(q.subject, []);
    subjectGroups.get(q.subject)!.push(q);
  }

  subjectGroups.forEach((sQuestions, subj) => {
    if (sQuestions.length < 5) return;
    const chunks = chunkQuestionsBalanced(sQuestions, 100, 5);

    chunks.forEach((chunk, idx) => {
      const partSuffix = chunks.length > 1 ? ` (Part ${idx + 1})` : '';
      const testId = `test_subj_${crypto.createHash('md5').update(`${subj}_${idx}`).digest('hex').slice(0, 10)}`;
      if (testIdSeen.has(testId)) return;
      testIdSeen.add(testId);

      readyMadeTests.push({
        id: testId,
        title: `${subj} - Full Subject Mock${partSuffix}`,
        createdAt: new Date().toISOString(),
        status: 'published',
        language: chunk[0]?.language || 'English',
        difficulty: 'Medium',
        questionCount: chunk.length,
        durationMinutes: Math.max(10, Math.round(chunk.length * 0.9)),
        markingCorrect: 1.0,
        markingWrong: 0.25,
        sourcePageCount: 1,
        examName: Array.from(new Set(chunk.flatMap((q) => q.examTags))).slice(0, 3).join(', '),
        year: Array.from(new Set(chunk.map((q) => q.year).filter(Boolean))).sort().join('-'),
        subject: subj,
        examTags: Array.from(new Set(chunk.flatMap((q) => q.examTags))),
        questions: chunk,
      });
    });
  });

  // 3. Exam-wise tests
  for (const exam of exams) {
    const examQuestions = masterQuestions.filter((q) => q.examTags.includes(exam.shortName));
    if (examQuestions.length < 5) continue;

    const chunks = chunkQuestionsBalanced(examQuestions, 100, 5);
    chunks.forEach((chunk, idx) => {
      const partSuffix = chunks.length > 1 ? ` (Part ${idx + 1})` : '';
      const testId = `test_exam_${exam.id}_p${idx + 1}`;
      if (testIdSeen.has(testId)) return;
      testIdSeen.add(testId);

      readyMadeTests.push({
        id: testId,
        title: `${exam.shortName} - Comprehensive Mock Test${partSuffix}`,
        createdAt: new Date().toISOString(),
        status: 'published',
        language: 'English',
        difficulty: 'Medium',
        questionCount: chunk.length,
        durationMinutes: Math.max(10, Math.round(chunk.length * 0.85)),
        markingCorrect: 1.0,
        markingWrong: 0.25,
        sourcePageCount: 1,
        examName: exam.shortName,
        year: Array.from(new Set(chunk.map((q) => q.year).filter(Boolean))).sort().join('-'),
        subject: chunk[0]?.subject || 'General Studies',
        examTags: [exam.shortName],
        questions: chunk,
      });
    });
  }

  // 4. Year-wise tests per exam
  const examYearGroups = new Map<string, QuestionMasterItem[]>();
  for (const q of masterQuestions) {
    if (!q.year) continue;
    for (const exTag of q.examTags) {
      const key = `${exTag}___${q.year}`;
      if (!examYearGroups.has(key)) examYearGroups.set(key, []);
      examYearGroups.get(key)!.push(q);
    }
  }

  examYearGroups.forEach((yQuestions, key) => {
    if (yQuestions.length < 5) return;
    const [exTag, yr] = key.split('___');
    const chunks = chunkQuestionsBalanced(yQuestions, 100, 5);

    chunks.forEach((chunk, idx) => {
      const partSuffix = chunks.length > 1 ? ` (Part ${idx + 1})` : '';
      const testId = `test_year_${crypto.createHash('md5').update(`${exTag}_${yr}_${idx}`).digest('hex').slice(0, 10)}`;
      if (testIdSeen.has(testId)) return;
      testIdSeen.add(testId);

      readyMadeTests.push({
        id: testId,
        title: `${exTag} Prelims ${yr} Previous Year Paper${partSuffix}`,
        createdAt: new Date().toISOString(),
        status: 'published',
        language: 'English',
        difficulty: 'Medium',
        questionCount: chunk.length,
        durationMinutes: Math.max(10, Math.round(chunk.length * 0.9)),
        markingCorrect: 1.0,
        markingWrong: 0.25,
        sourcePageCount: 1,
        examName: exTag,
        year: yr,
        subject: chunk[0]?.subject || 'General Studies',
        examTags: [exTag],
        questions: chunk,
      });
    });
  });

  // Convert unmapped tags map to array
  const unmappedTags: UnmappedExamTag[] = Array.from(unmappedTagCounts.entries()).map(([tag, val]) => ({
    tag,
    questionCount: val.count,
    sampleQuestion: val.sample,
  }));

  return {
    masterQuestions,
    readyMadeTests,
    unmappedTags,
    unplacedQuestions,
  };
}

/**
 * Custom Test Builder query algorithm.
 * Filters questions by exam(s), subject, chapter(s), year range, difficulty, language,
 * prioritizes unattempted questions from user's attempt history, and builds a customized test.
 */
export function buildCustomTest(
  filters: CustomTestFilter,
  allQuestions: QuestionMasterItem[],
  userAttempts: any[] = []
): {
  test: any;
  notice?: string;
  totalAvailable: number;
} {
  const targetCount = Math.min(100, Math.max(5, filters.questionCount || 20));

  // Collect IDs/normalized texts of questions user has attempted
  const attemptedQuestionKeys = new Set<string>();
  userAttempts.forEach((att) => {
    if (Array.isArray(att.questionsData)) {
      att.questionsData.forEach((q: any) => {
        if (q.question) {
          attemptedQuestionKeys.add(q.question.toLowerCase().trim().replace(/\s+/g, ' '));
        }
      });
    }
  });

  // Filter questions matching criteria
  const matching = allQuestions.filter((q) => {
    // Exam filter
    if (filters.examNames && filters.examNames.length > 0 && !filters.examNames.includes('All')) {
      const hasAnyExam = filters.examNames.some((en) =>
        q.examTags.some((tag) => tag.toLowerCase() === en.toLowerCase())
      );
      if (!hasAnyExam) return false;
    }

    // Subject filter
    if (filters.subject && filters.subject !== 'All') {
      if (q.subject.toLowerCase() !== filters.subject.toLowerCase()) return false;
    }

    // Chapter filter
    if (filters.chapters && filters.chapters.length > 0 && !filters.chapters.includes('All')) {
      const hasChapter = filters.chapters.some(
        (chap) => q.chapter.toLowerCase() === chap.toLowerCase()
      );
      if (!hasChapter) return false;
    }

    // Year range filter
    if (filters.yearStart || filters.yearEnd) {
      const qYearNum = parseInt(q.year || '0', 10);
      if (qYearNum > 0) {
        if (filters.yearStart && qYearNum < filters.yearStart) return false;
        if (filters.yearEnd && qYearNum > filters.yearEnd) return false;
      }
    }

    // Difficulty filter
    if (filters.difficulty && filters.difficulty !== 'All') {
      if (q.difficulty.toLowerCase() !== filters.difficulty.toLowerCase()) return false;
    }

    // Language filter
    if (filters.language && filters.language !== 'All') {
      if (q.language.toLowerCase() !== filters.language.toLowerCase()) return false;
    }

    return true;
  });

  const totalAvailable = matching.length;
  if (totalAvailable === 0) {
    throw new Error('No questions found matching your customized criteria. Try widening your subject or exam selections.');
  }

  // Prioritize unattempted questions
  const unattempted: QuestionMasterItem[] = [];
  const alreadyAttempted: QuestionMasterItem[] = [];

  for (const q of matching) {
    const key = q.question.toLowerCase().trim().replace(/\s+/g, ' ');
    if (attemptedQuestionKeys.has(key)) {
      alreadyAttempted.push(q);
    } else {
      unattempted.push(q);
    }
  }

  // Shuffle both sets slightly for variety
  unattempted.sort(() => Math.random() - 0.5);
  alreadyAttempted.sort(() => Math.random() - 0.5);

  const selectedPool = [...unattempted, ...alreadyAttempted];
  const finalSelected = selectedPool.slice(0, targetCount);

  let notice: string | undefined = undefined;
  if (finalSelected.length < targetCount) {
    notice = `Found ${finalSelected.length} questions matching your criteria (requested ${targetCount}). Starting test with all ${finalSelected.length} available questions.`;
  }

  const testId = `custom_${crypto.randomBytes(6).toString('hex')}`;
  const examLabel = filters.examNames && filters.examNames.length > 0 && !filters.examNames.includes('All')
    ? filters.examNames.join(', ')
    : 'All Exams';
  const subjectLabel = filters.subject && filters.subject !== 'All' ? filters.subject : 'Mixed Subjects';

  const testTitle = `Custom Practice Test: ${subjectLabel} (${examLabel})`;

  const formattedQuestions = finalSelected.map((q, idx) => ({
    id: idx + 1,
    question: q.question,
    options: q.options,
    type: q.type,
    explanation: q.explanation,
    correctOption: q.correctOption,
    sourcePages: q.sourcePages || `Question ${idx + 1}`,
    examName: q.examTags.join(', '),
    year: q.year,
    examTags: q.examTags,
    stage: q.stage,
    subject: q.subject,
    chapter: q.chapter,
  }));

  const test = {
    id: testId,
    title: testTitle,
    createdAt: new Date().toISOString(),
    status: 'published',
    language: filters.language && filters.language !== 'All' ? filters.language : 'English',
    difficulty: filters.difficulty && filters.difficulty !== 'All' ? filters.difficulty : 'Medium',
    questionCount: formattedQuestions.length,
    durationMinutes: Math.max(5, Math.round(formattedQuestions.length * 1.0)),
    markingCorrect: 1.0,
    markingWrong: 0.25,
    examName: examLabel,
    year: filters.yearStart && filters.yearEnd ? `${filters.yearStart}-${filters.yearEnd}` : '',
    subject: subjectLabel,
    questions: formattedQuestions,
    isCustomTest: true,
  };

  return {
    test,
    notice,
    totalAvailable,
  };
}
