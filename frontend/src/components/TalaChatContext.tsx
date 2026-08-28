import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

export type TalaLearningContext = {
  planId: number;
  competency: string;
  activityId: number;
  activityTitle: string;
  questionId?: number;
  questionPrompt?: string;
  selectedAnswer?: string;
};

export const TalaChatContext = createContext<{ learningContext: TalaLearningContext | null; setLearningContext: Dispatch<SetStateAction<TalaLearningContext | null>> }>({ learningContext: null, setLearningContext: () => undefined });
export const useTalaChatContext = () => useContext(TalaChatContext);
