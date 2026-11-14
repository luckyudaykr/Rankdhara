import { useState, useRef, useCallback, useEffect } from 'react';
import { MCQOptionMap, MCQQuestion } from '../types';
import { translateQuestionOnDemand } from '../services/cloudStorageService';

export type ReviewDisplayLanguage = 'Default' | 'English' | 'Hindi';

interface LocalizableQuestion {
  question: string;
  options: MCQOptionMap;
  questionHindi?: string;
  questionEnglish?: string;
  optionsHindi?: MCQOptionMap;
  optionsEnglish?: MCQOptionMap;
}

const hasHindiChars = (str?: string) => /[\u0900-\u097F]/.test(str || '');

export function useBilingualReview() {
  const [reviewLang, setReviewLang] = useState<ReviewDisplayLanguage>('Default');
  const [isTranslating, setIsTranslating] = useState(false);
  const [, setRenderTick] = useState(0);
  const requestGenRef = useRef(0);

  useEffect(() => {
    return () => {
      requestGenRef.current += 1;
    };
  }, []);

  const switchReviewLanguage = useCallback(
    async (target: ReviewDisplayLanguage, questions: LocalizableQuestion[]) => {
      setReviewLang(target);
      const gen = ++requestGenRef.current;

      if (target === 'Default' || !Array.isArray(questions) || questions.length === 0) {
        setIsTranslating(false);
        return;
      }

      const missing = questions.filter((q) => {
        if (!q?.question) return false;
        if (target === 'Hindi') {
          return !hasHindiChars(q.questionHindi) && !hasHindiChars(q.question);
        }
        return (!q.questionEnglish || hasHindiChars(q.questionEnglish)) && hasHindiChars(q.question);
      });

      if (missing.length === 0) {
        setIsTranslating(false);
        return;
      }

      setIsTranslating(true);
      try {
        const BATCH_SIZE = 3;
        const cap = Math.min(missing.length, 30);
        for (let i = 0; i < cap; i += BATCH_SIZE) {
          if (requestGenRef.current !== gen) return;
          const chunk = missing.slice(i, i + BATCH_SIZE);
          await Promise.all(
            chunk.map((q) =>
              translateQuestionOnDemand(q as MCQQuestion, target).catch(() => null)
            )
          );
          if (requestGenRef.current !== gen) return;
          setRenderTick((v) => v + 1);
        }
      } finally {
        if (requestGenRef.current === gen) {
          setIsTranslating(false);
        }
      }
    },
    []
  );

  const getLocalizedQuestion = useCallback(
    (q: LocalizableQuestion): { questionText: string; options: MCQOptionMap } => {
      if (reviewLang === 'Hindi') {
        return {
          questionText: q.questionHindi || q.question,
          options: q.optionsHindi || q.options,
        };
      }
      if (reviewLang === 'English') {
        return {
          questionText: q.questionEnglish || q.question,
          options: q.optionsEnglish || q.options,
        };
      }
      return {
        questionText: q.question,
        options: q.options,
      };
    },
    [reviewLang]
  );

  return {
    reviewLang,
    isTranslating,
    switchReviewLanguage,
    getLocalizedQuestion,
  };
}
