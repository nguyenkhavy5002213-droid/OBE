import ibm from './subjects/ibm';
import obe from './subjects/obe';
import { SubjectData, ChapterData, Section, QuizQuestion } from './types';

function buildSubjectData(id: string, name: string, subjectModule: any): SubjectData {
  const chapters: ChapterData[] = [];
  
  for (const key in subjectModule) {
    if (key.startsWith('chapter')) {
      const chapterModule = subjectModule[key];
      const chapterNumber = key.replace('chapter', '');
      const chapterId = isNaN(Number(chapterNumber)) ? chapterNumber : Number(chapterNumber);
      
      const theoryKey = `chapter${chapterNumber}Theory`;
      const quizKey = `chapter${chapterNumber}Quiz`;
      
      const theory = chapterModule[theoryKey] || [];
      const quiz = chapterModule[quizKey] || [];
      
      chapters.push({
        id: chapterId,
        title: `Chapter ${chapterNumber}`,
        theory,
        quiz
      });
    }
  }
  
  // Sort chapters by id
  chapters.sort((a, b) => {
    const numA = parseInt(a.id as string);
    const numB = parseInt(b.id as string);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a.id).localeCompare(String(b.id));
  });
  
  return {
    id,
    name,
    chapters
  };
}

export const subjects: SubjectData[] = [
  buildSubjectData('ibm', 'International Business Management (IBM)', ibm),
  buildSubjectData('obe', 'Organizational Behavior', obe)
];

export * from './types';
