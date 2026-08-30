import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';

export type TalaLearningContext = {
  contextType: 'recovery';
  planId: number;
  competency: string;
  activityId: number;
  activityTitle: string;
  questionId?: number;
  questionPrompt?: string;
  selectedAnswer?: string;
  openChat?: boolean;
} | {
  contextType: 'learning_material';
  assignmentId: number;
  competency: string;
  activityTitle: string;
  questionId?: number;
  questionPrompt?: string;
  selectedAnswer?: string;
  openChat?: boolean;
};

export const TalaChatContext = createContext<{ learningContext: TalaLearningContext | null; setLearningContext: Dispatch<SetStateAction<TalaLearningContext | null>> }>({ learningContext: null, setLearningContext: () => undefined });
export const useTalaChatContext = () => useContext(TalaChatContext);
