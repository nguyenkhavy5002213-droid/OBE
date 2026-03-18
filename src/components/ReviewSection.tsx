import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Lightbulb, BookMarked, Target, BrainCircuit } from 'lucide-react';
import { Section, SubSection } from '../data';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function removeCitations(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/\[cite:[^\]]*\]/g, '');
}

interface ReviewSectionProps {
  highlightedId: string | null;
  selectedChapter: number | string;
  onStartSpecificQuiz: (sectionId: string, topic: string) => void;
  knowledgeBase: Section[];
}

export function ReviewSection({ highlightedId, selectedChapter, onStartSpecificQuiz, knowledgeBase }: ReviewSectionProps) {
  const filteredKnowledge = knowledgeBase.filter(section => String(section.chapter) === String(selectedChapter));

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full transition-colors duration-300">
      <div className="p-6 bg-pastel-offwhite-1 dark:bg-slate-900/50 border-b border-pastel-mint-1 dark:border-slate-700">
        <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <BookMarked className="w-6 h-6 text-pastel-teal-2" />
          Hệ thống Ôn tập Kiến thức - Chương {selectedChapter}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
          Hệ thống lại toàn bộ kiến thức từ tài liệu. Nhấn vào các mục để xem chi tiết và ví dụ.
        </p>
      </div>
      <div className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
        {filteredKnowledge.length > 0 ? (
          filteredKnowledge.map((section) => (
            <SectionItem 
              key={section.id} 
              section={section} 
              highlightedId={highlightedId} 
              onStartSpecificQuiz={onStartSpecificQuiz}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <BookMarked className="w-12 h-12 mb-2 opacity-20" />
            <p>Không có nội dung cho chương này.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionItem({ section, highlightedId, onStartSpecificQuiz }: { section: Section; highlightedId: string | null; onStartSpecificQuiz: (sectionId: string, topic: string) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const isHighlighted = highlightedId === section.id;
  const isAnySubHighlighted = section.subsections?.some(sub => sub.id === highlightedId) ?? false;

  useEffect(() => {
    if ((isHighlighted || isAnySubHighlighted) && sectionRef.current) {
      setIsOpen(true);
      // Wait for the expansion animation
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [isHighlighted, isAnySubHighlighted]);

  return (
    <div 
      ref={sectionRef}
      id={section.id}
      className={cn(
        "border-l-4 rounded-r-xl overflow-hidden transition-all duration-500 shadow-sm",
        (isHighlighted || isAnySubHighlighted)
          ? "border-l-pastel-teal-2 ring-2 ring-pastel-teal-2/50 bg-pastel-cyan-1/30 dark:bg-sky-900/20" 
          : "border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
      )}
    >
      <div className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center justify-between p-4 text-left"
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 pr-4">{removeCitations(section.title)}</h3>
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600">
            {isOpen ? <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-500 dark:text-slate-400" />}
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartSpecificQuiz(section.id, removeCitations(section.title));
          }}
          className="mr-4 px-3 py-1.5 bg-pastel-teal-2 hover:bg-pastel-teal-1 text-slate-800 text-xs font-extrabold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm border border-pastel-teal-2/50"
          title="Làm bài tập riêng cho phần này"
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          Làm Quiz
        </button>
      </div>
      
      {isOpen && (
        <div className="p-5 border-t border-slate-100 dark:border-slate-700">
          {section.content && (
            <div className="markdown-body text-slate-700 dark:text-slate-300 mb-5 leading-relaxed">
              <ReactMarkdown>{removeCitations(section.content)}</ReactMarkdown>
            </div>
          )}
          <div className="space-y-4 pl-2 border-l-2 border-slate-100 dark:border-slate-700 ml-2">
            {section.subsections?.map((sub) => (
              <SubSectionItem key={sub.id} sub={sub} highlightedId={highlightedId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubSectionItem({ sub, highlightedId }: { sub: SubSection; highlightedId: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const subRef = useRef<HTMLDivElement>(null);
  const isHighlighted = highlightedId === sub.id;

  useEffect(() => {
    if (isHighlighted && subRef.current) {
      setIsOpen(true);
      if (sub.example) setShowExample(true);
      // Wait for the expansion animation
      setTimeout(() => {
        subRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [isHighlighted, sub.example]);

  return (
    <div 
      ref={subRef}
      id={sub.id}
      className={cn(
        "relative rounded-xl overflow-hidden transition-all duration-500 border",
        isHighlighted 
          ? "border-emerald-400 ring-1 ring-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/20" 
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80"
      )}
    >
      {/* Decorative connector line to parent */}
      <div className="absolute -left-3 top-6 w-3 h-0.5 bg-slate-200 dark:bg-slate-700"></div>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-start justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left gap-4"
      >
        <div className="flex items-start gap-3">
          <Target className="w-5 h-5 text-pastel-seafoam-1 mt-0.5 flex-shrink-0" />
          <h4 className="font-extrabold text-slate-800 dark:text-slate-200 leading-snug">{removeCitations(sub.title)}</h4>
        </div>
        {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />}
      </button>
      
      {isOpen && (
        <div className="p-4 pt-0">
          <div className="pl-8">
            <div className="markdown-body text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
              <ReactMarkdown>{removeCitations(sub.content)}</ReactMarkdown>
            </div>
            
            {sub.example && (
              <div className="mt-4">
                <button
                  onClick={() => setShowExample(!showExample)}
                  className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                >
                  <Lightbulb className={cn("w-4 h-4 transition-transform", showExample ? "text-amber-500" : "text-slate-400")} />
                  {showExample ? 'Ẩn ví dụ' : 'Xem ví dụ thực tế'}
                </button>
                
                {showExample && (
                  <div className="mt-3 p-4 bg-pastel-yellow-1/30 dark:bg-amber-900/20 text-slate-800 dark:text-amber-100 rounded-xl text-sm border border-pastel-yellow-1/60 dark:border-amber-700/50 leading-relaxed shadow-sm">
                    <div className="markdown-body">
                      <ReactMarkdown>{removeCitations(sub.example)}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
