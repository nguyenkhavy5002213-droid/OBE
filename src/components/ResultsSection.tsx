import React, { useState } from 'react';
import { generateAdaptiveQuiz } from '../services/geminiService';
import { QuizQuestion } from '../data';
import { Trophy, AlertTriangle, RefreshCw, Loader2, BookOpen } from 'lucide-react';

interface ResultsSectionProps {
  score: number;
  total: number;
  weakTopics: string[];
  knowledgeBaseContext: string;
  onStartAdaptiveQuiz: (newQuestions: QuizQuestion[]) => void;
  onReset: () => void;
}

export function ResultsSection({ score, total, weakTopics, knowledgeBaseContext, onStartAdaptiveQuiz, onReset }: ResultsSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const percentage = Math.round((score / total) * 100);

  const handleGenerateAdaptive = async () => {
    setIsGenerating(true);
    try {
      const newQuestions = await generateAdaptiveQuiz(weakTopics.length > 0 ? weakTopics : ['General Review'], knowledgeBaseContext);
      if (newQuestions && newQuestions.length > 0) {
        onStartAdaptiveQuiz(newQuestions);
      } else {
        alert("Không thể tạo câu hỏi mới lúc này. Vui lòng thử lại.");
      }
    } catch (error) {
      console.error(error);
      alert("Đã có lỗi xảy ra khi tạo câu hỏi ôn tập.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full animate-in fade-in zoom-in-95 duration-500 transition-colors">
      <div className="p-8 flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-28 h-28 bg-gradient-to-br from-theme-yellow to-theme-pink text-slate-800 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-theme-yellow/30 rotate-3">
          <Trophy className="w-14 h-14" />
        </div>
        
        <h2 className="text-4xl font-black text-slate-900 dark:text-slate-100 mb-2 uppercase tracking-tight">Tuyệt vời!</h2>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 font-bold">
          Bạn đã trả lời đúng <strong className="text-emerald-500 text-3xl">{score}</strong> trên tổng số <strong className="text-slate-900 dark:text-slate-100 text-2xl">{total}</strong> câu hỏi ({percentage}%).
        </p>

        {weakTopics.length > 0 ? (
          <div className="w-full max-w-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold mb-3">
              <AlertTriangle className="w-5 h-5" />
              <span>Phân tích lỗ hổng kiến thức:</span>
            </div>
            <p className="text-amber-900 dark:text-amber-200 text-sm mb-3">Bạn cần ôn tập thêm các mảng kiến thức sau:</p>
            <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 text-sm space-y-1">
              {weakTopics.map((topic, i) => (
                <li key={i} className="font-medium">{topic}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="w-full max-w-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-semibold mb-2">
              <BookOpen className="w-5 h-5" />
              <span>Tuyệt vời!</span>
            </div>
            <p className="text-emerald-900 dark:text-emerald-200 text-sm">Bạn đã nắm vững toàn bộ kiến thức trong bài kiểm tra này.</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <button
            onClick={onReset}
            className="flex-1 py-3 px-6 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-slate-300 dark:hover:border-slate-500 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-5 h-5" /> Làm lại từ đầu
          </button>
          
          <button
            onClick={handleGenerateAdaptive}
            disabled={isGenerating}
            className="flex-1 py-4 px-8 bg-gradient-to-r from-theme-blue to-theme-purple hover:shadow-2xl hover:shadow-theme-blue/40 disabled:bg-slate-300 text-slate-800 rounded-2xl font-black text-lg uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            {isGenerating ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Đang tạo...</>
            ) : (
              <><BookOpen className="w-5 h-5" /> Ôn tập lỗ hổng</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
