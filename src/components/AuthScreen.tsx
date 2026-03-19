import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, ArrowRight, ShieldCheck, Loader2, AlertTriangle, BookOpen, ChevronLeft } from 'lucide-react';

interface Subject {
  id: string;
  name: string;
}

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const { login, authError, clearError } = useAuth();

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = await fetch('/api/subjects');
        const data = await res.json();
        setSubjects(data.subjects || []);
      } catch (error) {
        console.error("Lỗi khi tải danh sách môn học:", error);
      } finally {
        setIsLoadingSubjects(false);
      }
    };
    fetchSubjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !selectedSubject) return;
    
    setIsSubmitting(true);
    clearError();
    
    try {
      await login(email, selectedSubject.id);
    } catch (error: any) {
      console.error("Lỗi đăng nhập:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-yellow dark:bg-slate-900 flex items-center justify-center p-4 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-theme-blue dark:border-slate-700 overflow-hidden">
        <div className="p-8">
          <div className="w-16 h-16 bg-theme-blue text-slate-700 rounded-2xl flex items-center justify-center mb-6 shadow-inner mx-auto">
            {selectedSubject ? <ShieldCheck className="w-8 h-8" /> : <BookOpen className="w-8 h-8" />}
          </div>
          
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 text-center mb-2">
            {selectedSubject ? `Đăng nhập ${selectedSubject.name}` : 'Chọn môn học'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8 text-sm">
            {selectedSubject 
              ? 'Vui lòng đăng nhập bằng email để tiếp tục.' 
              : 'Hệ thống quản lý học tập chuyên nghiệp. Vui lòng chọn môn học để bắt đầu.'}
          </p>

          {authError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-800 dark:text-red-200">{authError}</p>
            </div>
          )}

          {!selectedSubject ? (
            <div className="space-y-3">
              {isLoadingSubjects ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-theme-blue" />
                </div>
              ) : subjects.length > 0 ? (
                subjects.map(subject => (
                  <button
                    key={subject.id}
                    onClick={() => {
                      setSelectedSubject(subject);
                      clearError();
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-theme-blue hover:bg-theme-blue/10 dark:hover:bg-slate-700 transition-all text-left"
                  >
                    <span className="font-bold text-slate-800 dark:text-slate-200">{subject.name}</span>
                    <ArrowRight className="w-5 h-5 text-slate-400" />
                  </button>
                ))
              ) : (
                <p className="text-center text-slate-500">Chưa có môn học nào được cấu hình.</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Địa chỉ Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    id="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-theme-blue focus:border-theme-blue transition-all sm:text-sm font-bold"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubject(null);
                    clearError();
                  }}
                  className="px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !email}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-extrabold text-slate-800 bg-theme-blue hover:bg-theme-purple focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-theme-blue disabled:bg-slate-400 dark:disabled:bg-slate-700 transition-colors"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Đang kiểm tra...</>
                  ) : (
                    <>Đăng nhập <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3 text-sm text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-500" />
              <p>
                Hệ thống áp dụng chính sách bảo mật: <strong>1 tài khoản - 1 thiết bị</strong>. 
                Đăng nhập trên thiết bị mới sẽ tự động đăng xuất khỏi thiết bị cũ.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
