import * as pdfjsLib from 'pdfjs-dist';
import { ExtractedPdfData } from '../types';

// Configure pdfjs worker using unpkg CDN matching installed version or fallback
try {
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const version = pdfjsLib.version || '4.10.38';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('Could not set workerSrc automatically', e);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file into base64 format'));
    reader.readAsDataURL(file);
  });
}

export async function extractTextFromPdf(
  file: File,
  onProgress?: (currentPage: number, totalPages: number, message: string) => void
): Promise<ExtractedPdfData> {
  // Validate file size (max 20 MB)
  const MAX_SIZE_BYTES = 20 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('File size exceeds the 20 MB limit. Please upload a smaller PDF.');
  }

  // Validate MIME type / extension
  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new Error('Invalid file type. Please upload a valid PDF document (.pdf).');
  }

  onProgress?.(0, 1, 'Loading PDF document into memory...');

  const arrayBuffer = await file.arrayBuffer();

  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    });
    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    throw new Error(
      `Unable to parse PDF: ${err.message || 'The PDF file may be corrupted or password protected.'}`
    );
  }

  const totalPages = pdfDoc.numPages;
  if (totalPages === 0) {
    throw new Error('The uploaded PDF has 0 pages.');
  }

  let fullText = '';
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(
      pageNum,
      totalPages,
      `Extracting text from page ${pageNum} of ${totalPages}...`
    );

    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageStr = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageStr) {
        pageTexts.push(`--- Page ${pageNum} ---\n${pageStr}`);
      }
    } catch (pageErr) {
      console.warn(`Error reading page ${pageNum}:`, pageErr);
    }
  }

  fullText = pageTexts.join('\n\n');

  // Check if document is scanned (scanned or image-only PDFs yield little or no text)
  const isScanned = fullText.trim().length < 150;

  let base64Data: string | undefined = undefined;
  if (isScanned) {
    onProgress?.(
      totalPages,
      totalPages,
      'Little text detected. Preparing inline PDF scan data for Gemini multimodal engine...'
    );
    base64Data = await fileToBase64(file);
  }

  return {
    text: fullText,
    isScanned,
    pageCount: totalPages,
    fileName: file.name,
    fileSizeBytes: file.size,
    base64Data,
  };
}

// Sample mock document contents for rapid instant testing
export const SAMPLE_DOCUMENTS: {
  title: string;
  description: string;
  category: string;
  text: string;
}[] = [
  {
    title: 'Indian Constitution & Polity Fundamentals',
    description: 'Fundamental Rights, Directive Principles, Parliament, Supreme Court & Federal Structure',
    category: 'Polity & Governance',
    text: `
THE CONSTITUTION OF INDIA: CORE DOCTRINE AND INSTITUTIONAL FRAMEWORK

Part I: The Union and Its Territory (Articles 1-4)
Article 1 describes India, that is Bharat, as a 'Union of States' rather than a 'Federation of States'. This signifies two key aspects: first, the Indian federation is not the result of an agreement among the states like the American federation; second, the states have no right to secede from the federation. The Parliament under Article 2 may admit into the Union or establish new states on terms and conditions it thinks fit. Under Article 3, Parliament can form a new state, increase or diminish the area of any state, alter the boundaries, or alter the name of any state by a simple majority.

Part III: Fundamental Rights (Articles 12-35)
The Fundamental Rights are enshrined in Part III from Articles 12 to 35. Inspired by the US Bill of Rights, they are justifiable and enforceable by courts.
1. Right to Equality (Articles 14-18): Article 14 guarantees equality before the law and equal protection of the laws. Article 15 prohibits discrimination on grounds only of religion, race, caste, sex, or place of birth. Article 16 provides equality of opportunity in public employment. Article 17 abolishes untouchability. Article 18 abolishes titles except military and academic distinctions.
2. Right to Freedom (Articles 19-22): Article 19 guarantees six basic freedoms: speech and expression, peaceful assembly without arms, forming associations, free movement throughout India, residing and settling anywhere in India, and practicing any profession. Article 21 guarantees the protection of life and personal liberty, which the Supreme Court in the landmark Maneka Gandhi case (1978) declared must be 'just, fair, and reasonable'. Article 21A, inserted by the 86th Constitutional Amendment Act 2002, made free and compulsory education for children between 6 and 14 years a fundamental right.
3. Right to Constitutional Remedies (Article 32): Dr. B.R. Ambedkar termed Article 32 the 'Heart and Soul of the Constitution'. The Supreme Court under Article 32 and High Courts under Article 226 can issue five types of prerogative writs: Habeas Corpus ('to have the body'), Mandamus ('we command'), Prohibition (to stop lower courts exceeding jurisdiction), Certiorari ('to be certified' / quashing orders), and Quo-Warranto ('by what authority').

Part IV: Directive Principles of State Policy (Articles 36-51)
Borrowed from the Irish Constitution, the DPSPs are non-justiciable in nature but fundamental in the governance of the country. Article 38 seeks to promote the welfare of people by securing a social order permeated by social, economic, and political justice. Article 40 directs the state to organize village panchayats. Article 44 aspires for a Uniform Civil Code for all citizens throughout India. Article 45 deals with early childhood care. Article 50 directs the separation of the judiciary from the executive.

Part IVA: Fundamental Duties (Article 51A)
Added by the 42nd Constitutional Amendment Act 1976 on the recommendation of the Swaran Singh Committee. Originally 10 duties were added; an 11th duty (to provide educational opportunities for children aged 6 to 14) was added by the 86th Amendment Act 2002.

The Union Executive and Parliament
The President of India is the head of state and indirect elections are held by an electoral college consisting of elected members of both houses of Parliament and elected members of legislative assemblies of states (and UTs of Delhi and Puducherry). Under Article 74, there shall be a Council of Ministers with the Prime Minister at the head to aid and advise the President, whose advice is binding.
Parliament consists of the President, Rajya Sabha (Council of States, maximum 250 members, permanent body not subject to dissolution with one-third retiring every second year), and Lok Sabha (House of the People, max 550 elected members, normal tenure 5 years). Money Bills under Article 110 can only be introduced in the Lok Sabha with prior recommendation of the President, and the Rajya Sabha has only 14 days to return it with or without recommendations.

The Union Judiciary: Supreme Court of India
Established under Article 124, the Supreme Court is the guardian of the Constitution. Its jurisdiction spans Original (disputes between Centre and States under Article 131), Appellate, and Advisory (Article 143, when President consults the Court). In Kesavananda Bharati v. State of Kerala (1973), the Supreme Court propounded the 'Basic Structure Doctrine', ruling that Parliament's constituent power under Article 368 cannot alter the basic structure of the Constitution.
    `.trim(),
  },
  {
    title: 'General Science: Modern Physics & Cell Biology',
    description: 'Photoelectric effect, DNA replication, Thermodynamics, and Periodic Trends',
    category: 'General Science',
    text: `
FUNDAMENTALS OF MODERN SCIENCE: PHYSICS AND CELLULAR BIOLOGY

Section 1: Quantum Physics and Thermodynamics
Light behaves as both a wave and a particle, an essential concept termed wave-particle duality. In 1905, Albert Einstein explained the Photoelectric Effect using Max Planck's quantum hypothesis, proving that light consists of discrete energy packets called photons. The energy of each photon is given by E = hν, where h is Planck's constant (6.626 × 10^-34 J·s) and ν is frequency. The threshold frequency is the minimum frequency of incident radiation below which no photoelectrons are emitted from a metal surface, regardless of intensity.

The Laws of Thermodynamics govern energy transformations:
- Zeroth Law: If two systems are in thermal equilibrium with a third system, they are in thermal equilibrium with each other. This defines temperature.
- First Law: Energy cannot be created or destroyed, only transformed (ΔU = Q - W, where ΔU is change in internal energy, Q is heat added, and W is work done by the system).
- Second Law: The total entropy of an isolated system always increases over time. Heat cannot spontaneously flow from a colder body to a hotter body without external work.
- Third Law: As the temperature of a system approaches absolute zero (0 Kelvin or -273.15 °C), the entropy approaches a constant minimum.

Section 2: Chemistry and Periodic Trends
The modern periodic table is organized by increasing atomic number (Moseley's Law) rather than atomic mass (Mendeleev's periodic law).
Periodic Trends across a period (left to right):
1. Atomic Radius decreases due to increasing effective nuclear charge pulling electrons closer.
2. Ionization Energy (energy required to remove an electron from a gaseous atom) generally increases.
3. Electronegativity (tendency of an atom to attract shared electrons) increases, with Fluorine being the most electronegative element (Pauling scale 4.0).
4. Metallic character decreases, while non-metallic character increases.

Section 3: Cell Biology and Genetics
All living organisms are composed of cells, the basic structural and functional units of life (Cell Theory formulated by Schleiden and Schwann, with Virchow adding 'omnis cellula e cellula').
Organelles and Functions:
- Nucleus: Contains genetic material (chromatin/DNA) and nucleolus (ribosome assembly).
- Mitochondria: The 'powerhouse of the cell', responsible for cellular respiration and generating ATP (adenosine triphosphate) via oxidative phosphorylation and the Krebs cycle. It contains its own circular DNA and 70S ribosomes (endosymbiotic theory).
- Ribosomes: Non-membrane bound sites of protein synthesis (translation).
- Endoplasmic Reticulum (ER): Rough ER possesses ribosomes for protein folding and transport; Smooth ER synthesizes lipids, phospholipids, and steroid hormones, and detoxifies drugs.
- Golgi Apparatus: Modifies, sorts, and packages proteins for secretion.
- Lysosomes: Contain hydrolytic enzymes for intracellular digestion ('suicide bags').

DNA (Deoxyribonucleic Acid) has a double-helix structure discovered by Watson and Crick (1953). DNA consists of deoxyribose sugar, phosphate group, and four nitrogenous bases: Adenine (A), Thymine (T), Guanine (G), and Cytosine (C). In RNA, Uracil (U) replaces Thymine. By Chargaff's rule, A pairs with T via two hydrogen bonds (A=T), and G pairs with C via three hydrogen bonds (G≡C). DNA replication is semi-conservative, as proved by Meselson and Stahl in 1958.
    `.trim(),
  },
];
