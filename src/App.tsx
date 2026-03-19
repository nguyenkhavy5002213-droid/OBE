import React, { useState, useMemo, useEffect } from 'react';
import { ReviewSection } from './components/ReviewSection';
import { QuizSection } from './components/QuizSection';
import { ResultsSection } from './components/ResultsSection';
import { ChatBox } from './components/ChatBox';
import { AuthScreen } from './components/AuthScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminPanel } from './components/AdminPanel';
import { subjects, SubjectData, ChapterData, Section, QuizQuestion } from './data';
import { generateAdaptiveQuiz } from './services/geminiService';
import { BookOpen, BrainCircuit, Moon, Sun, LogOut, Loader2, Shield } from 'lucide-react';

function AppContent() {
  const { user, isAdmin, loading, logout } = useAuth();
  const [dynamicContent, setDynamicContent] = useState<any>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [quizState, setQuizState] = useState<'playing' | 'results'>('playing');
  const [selectedChapter, setSelectedChapter] = useState<number | string>(1);

  useEffect(() => {
    const fetchDynamicContent = async () => {
      if (!user?.subjectId) return;
      setIsLoadingContent(true);
      try {
        const res = await fetch(`/api/subjects/content/${user.subjectId}`);
        const data = await res.json();
        if (data.content) {
          setDynamicContent(data.content);
        }
      } catch (error) {
        console.error("Error fetching dynamic content:", error);
      } finally {
        setIsLoadingContent(false);
      }
    };
    fetchDynamicContent();
  }, [user?.subjectId]);

  const currentSubject = useMemo(() => {
    if (!user) return null;
    const baseSubject = subjects.find(s => s.id === user.subjectId) || subjects.find(s => s.id === 'obe');
    
    if (dynamicContent && baseSubject) {
      // Merge dynamic content into base subject
      return {
        ...baseSubject,
        chapters: dynamicContent.chapters || baseSubject.chapters
      };
    }
    
    return baseSubject;
  }, [user, dynamicContent]);

  const chapters = useMemo(() => {
    if (!currentSubject) return [];
    return currentSubject.chapters.map(c => c.id);
  }, [currentSubject]);

  useEffect(() => {
    if (chapters.length > 0 && !chapters.map(String).includes(String(selectedChapter))) {
      setSelectedChapter(chapters[0]);
    }
  }, [chapters, selectedChapter]);

  const currentChapterData = useMemo(() => {
    if (!currentSubject) return null;
    return currentSubject.chapters.find(c => String(c.id) === String(selectedChapter));
  }, [currentSubject, selectedChapter]);

  const filteredKnowledgeBase = useMemo(() => {
    if (!currentSubject) return [];
    return currentSubject.chapters.flatMap(c => c.theory);
  }, [currentSubject]);

  const filteredInitialQuiz = useMemo(() => {
    if (!currentSubject) return [];
    return currentSubject.chapters.flatMap(c => c.quiz);
  }, [currentSubject]);

  const chapterQuestions = useMemo(() => {
    return currentChapterData?.quiz || [];
  }, [currentChapterData]);

  const [currentQuestions, setCurrentQuestions] = useState<QuizQuestion[]>([]);
  const [score, setScore] = useState(0);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [activeQuizFilter, setActiveQuizFilter] = useState<string | null>(null);

  useEffect(() => {
    setCurrentQuestions(chapterQuestions);
    setQuizState('playing');
    setScore(0);
    setWeakTopics([]);
    setActiveQuizFilter(null);
  }, [chapterQuestions]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Stringify knowledge base for AI context
  const knowledgeBaseContext = useMemo(() => {
    const filteredKB = filteredKnowledgeBase.filter(s => s.chapter === selectedChapter);
    return JSON.stringify(filteredKB, null, 2);
  }, [selectedChapter, filteredKnowledgeBase]);

  const handleLocateKnowledge = (sectionId: string) => {
    setHighlightedId(sectionId);
    // Clear highlight after 5 seconds
    setTimeout(() => setHighlightedId(null), 5000);
  };

  const handleQuizComplete = (finalScore: number, topics: string[]) => {
    setScore(finalScore);
    setWeakTopics(topics);
    setQuizState('results');
  };

  const handleStartAdaptiveQuiz = (newQuestions: QuizQuestion[]) => {
    setCurrentQuestions(newQuestions);
    setQuizState('playing');
    setScore(0);
    setWeakTopics([]);
    setActiveQuizFilter('Ôn tập AI (Adaptive)');
  };

  const handleReset = () => {
    setCurrentQuestions(chapterQuestions);
    setQuizState('playing');
    setScore(0);
    setWeakTopics([]);
    setActiveQuizFilter(null);
  };

  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  const handleStartSpecificQuiz = async (sectionId: string, topic: string) => {
    // Scroll to quiz section
    const quizElement = document.getElementById('quiz-section');
    if (quizElement) {
      quizElement.scrollIntoView({ behavior: 'smooth' });
    }

    setQuizState('playing');
    setScore(0);
    setWeakTopics([]);
    setActiveQuizFilter(topic);
    
    // 1. Try to find existing questions for this section in the 50 questions
    const existingQuestions = filteredInitialQuiz.filter(q => q.relatedSectionId === sectionId || q.relatedSectionId.startsWith(sectionId + '.'));
    
    if (existingQuestions.length > 0) {
      setCurrentQuestions(existingQuestions);
    } else {
      // 2. Fallback: Generate questions for this specific topic using AI
      setIsGeneratingQuiz(true);
      setCurrentQuestions([]); // Clear current questions while loading
      try {
        const newQuestions = await generateAdaptiveQuiz([topic], knowledgeBaseContext);
        if (newQuestions && newQuestions.length > 0) {
          setCurrentQuestions(newQuestions);
        }
      } catch (error) {
        console.error("Error generating specific quiz:", error);
      } finally {
        setIsGeneratingQuiz(false);
      }
    }
  };

  const handleClearFilter = () => {
    setActiveQuizFilter(null);
    setCurrentQuestions(chapterQuestions);
    setQuizState('playing');
    setScore(0);
    setWeakTopics([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-theme-blue animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-theme-yellow dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans selection:bg-theme-blue/50 dark:selection:bg-sky-900 selection:text-slate-900 dark:selection:text-sky-100 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-theme-blue dark:border-slate-700 sticky top-0 z-30 shadow-sm transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-theme-green">
              {currentSubject?.name || user.subjectName || 'OBE Revision'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 pl-4">
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-sky-400 bg-theme-blue rounded-lg hover:bg-theme-purple transition-colors"
                  title="Quản lý truy cập"
                >
                  <Shield className="w-4 h-4" />
                  Admin
                </button>
              )}
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300 hidden md:block">
                {user.email}
              </span>
              <button
                onClick={logout}
                className="p-2 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors rounded-lg hover:bg-theme-pink dark:hover:bg-slate-700"
                title="Đăng xuất"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Chapter Selection */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-theme-purple dark:border-slate-700 flex flex-wrap items-center gap-4">
          <label htmlFor="chapter-select" className="text-sm font-extrabold text-slate-500 dark:text-theme-blue uppercase tracking-wider">
            Chọn Chương:
          </label>
          <div className="relative flex-1 max-w-xs">
            <select
              id="chapter-select"
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              className="w-full appearance-none bg-theme-yellow dark:bg-slate-700 text-slate-800 dark:text-theme-yellow font-extrabold px-4 py-2 pr-8 rounded-xl border border-theme-purple dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-theme-blue cursor-pointer transition-colors"
            >
              {chapters.map((ch) => (
                <option key={ch} value={ch}>
                  Chương {ch}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700 dark:text-theme-yellow">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Review Section */}
        <div className="min-h-[600px]">
          <ReviewSection 
            highlightedId={highlightedId} 
            selectedChapter={selectedChapter} 
            onStartSpecificQuiz={handleStartSpecificQuiz}
            knowledgeBase={filteredKnowledgeBase}
          />
        </div>

        {/* Quiz / Results Section */}
        <div id="quiz-section" className="min-h-[600px] scroll-mt-20">
          {quizState === 'playing' ? (
            <QuizSection 
              key={`${selectedChapter}-${activeQuizFilter || 'all'}`}
              questions={currentQuestions} 
              onLocateKnowledge={handleLocateKnowledge}
              onComplete={handleQuizComplete}
              isLoading={isGeneratingQuiz}
              activeFilter={activeQuizFilter}
              onClearFilter={handleClearFilter}
            />
          ) : (
            <ResultsSection 
              score={score}
              total={currentQuestions.length}
              weakTopics={weakTopics}
              knowledgeBaseContext={knowledgeBaseContext}
              onStartAdaptiveQuiz={handleStartAdaptiveQuiz}
              onReset={handleReset}
            />
          )}
        </div>
      </main>

      {/* Floating Theme Toggle */}
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="fixed bottom-6 right-24 p-4 rounded-full shadow-xl bg-white dark:bg-slate-800 border border-theme-pink dark:border-slate-700 text-slate-700 dark:text-amber-400 hover:scale-110 transition-all duration-300 z-40"
        title="Toggle Dark/Light Mode"
      >
        {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      {/* Floating AI Chat */}
      <ChatBox knowledgeBaseContext={knowledgeBaseContext} />

      {/* Admin Panel Modal */}
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
