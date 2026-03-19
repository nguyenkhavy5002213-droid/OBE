import React, { useState, useRef, useEffect } from 'react';
import { chatWithAI } from '../services/geminiService';
import { MessageSquare, X, Send, Loader2, Bot, User } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface ChatBoxProps {
  knowledgeBaseContext: string;
}

export function ChatBox({ knowledgeBaseContext }: ChatBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: 'Chào bạn! Mình là trợ lý AI. Bạn có câu hỏi nào về nội dung ôn tập OB không?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await chatWithAI(userMsg, messages, knowledgeBaseContext);
      setMessages(prev => [...prev, { role: 'model', content: response }]);
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMessage = error.message || 'Xin lỗi, đã có lỗi xảy ra khi kết nối với AI. Vui lòng thử lại sau.';
      setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 p-5 rounded-2xl shadow-2xl bg-gradient-to-br from-theme-pink to-theme-purple text-slate-800 transition-all duration-300 z-40 hover:scale-110 active:scale-95 hover:rotate-6",
          isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <MessageSquare className="w-7 h-7" />
      </button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 w-[400px] h-[600px] max-h-[80vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 z-50 overflow-hidden",
          isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-8 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-theme-pink to-theme-purple text-slate-800 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-slate-800" />
            </div>
            <h3 className="font-black uppercase tracking-widest text-sm">AI Assistant</h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900 custom-scrollbar">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex gap-3 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm",
                msg.role === 'user' ? "bg-theme-pink text-slate-800" : "bg-theme-blue text-slate-800"
              )}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div
                className={cn(
                  "p-4 rounded-2xl text-sm shadow-sm",
                  msg.role === 'user' 
                    ? "bg-gradient-to-br from-theme-pink to-theme-purple text-slate-800 rounded-tr-sm font-bold" 
                    : "bg-white dark:bg-slate-800 border-2 border-theme-blue/10 text-slate-700 dark:text-slate-200 rounded-tl-sm"
                )}
              >
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <div className="markdown-body prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-50 dark:prose-invert">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-spin" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Đang suy nghĩ...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white dark:bg-slate-800 border-t-2 border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border-2 border-theme-pink/20 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-theme-pink focus-within:border-theme-pink transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Hỏi AI về kiến thức..."
              className="flex-1 bg-transparent border-none focus:outline-none text-sm px-3 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 font-bold"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-3 bg-gradient-to-br from-theme-pink to-theme-purple hover:shadow-lg text-slate-800 rounded-xl transition-all active:scale-90"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
