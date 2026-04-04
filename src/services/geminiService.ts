/// <reference types="vite/client" />
import { GoogleGenAI } from "@google/genai";

// 1. Khai báo danh sách API Keys
const API_KEYS = [
  "AIzaSyAUwMZuoZGgBwnsxSkI2nDn0gs4Cp1cWsc",
  "AIzaSyAU0826A38CCbqLmEowZ8aVFng-opYuQqI",
  "AIzaSyBHweJxoPBNCeeL9DXatebf-7ajs449USM",
  "AIzaSyBKshPP4I_x5IJX-WFQ9sveYnQiaBCcuoA"
];

// Biến lưu trữ index của Key hiện tại đang được sử dụng
let currentKeyIndex = 0;

function getAIInstance() {
  const apiKey = API_KEYS[currentKeyIndex];
  if (!apiKey) {
    throw new Error("Không tìm thấy cấu hình API Key.");
  }
  return new GoogleGenAI({ apiKey });
}

function rotateKey() {
  // Chuyển sang key tiếp theo, nếu đến cuối mảng thì quay lại key đầu tiên (vòng lặp)
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`🔄 Đã xoay vòng sang API Key thứ ${currentKeyIndex + 1}`);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 2. Hàm Wrapper: Xử lý cơ chế tự động thử lại khi gặp lỗi Quota
async function executeWithRotation<T>(operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  let attempts = 0;
  const maxAttempts = API_KEYS.length; // Số lần thử tối đa bằng tổng số key

  while (attempts < maxAttempts) {
    const ai = getAIInstance();
    try {
      // Thực thi logic gọi API
      return await operation(ai);
    } catch (error: any) {
      console.error(`Lỗi ở Key thứ ${currentKeyIndex + 1}:`, error?.message || error);

      // Kiểm tra xem lỗi có phải do hết quota không (429 hoặc RESOURCE_EXHAUSTED)
      const isQuotaError = error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("429");

      if (isQuotaError) {
        console.warn(`⚠️ Key thứ ${currentKeyIndex + 1} đã hết hạn mức. Đang thử Key dự phòng...`);
        rotateKey(); // Đổi key
        attempts++;  // Tăng số lần đã thử
        await delay(1000); // Nghỉ 1 giây trước khi thử lại để tránh spam
      } 
      // Kiểm tra lỗi do key bị leak/khóa
      else if (error?.message?.includes("leaked") || error?.status === "PERMISSION_DENIED") {
        console.warn(`❌ Key thứ ${currentKeyIndex + 1} bị vô hiệu hóa do rò rỉ. Đang bỏ qua và thử Key khác...`);
        rotateKey();
        attempts++;
      } 
      // Nếu là lỗi khác (ví dụ: mất mạng, model lỗi) thì ném lỗi ra ngoài luôn, không xoay key nữa
      else {
        throw new Error(error?.message || "Không thể kết nối với AI. Vui lòng thử lại sau.");
      }
    }
  }

  // Nếu vòng lặp chạy hết mà không return được kết quả nghĩa là mọi Key đều thất bại
  throw new Error("Tất cả các API Key đều đã hết hạn mức hoặc bị khóa. Vui lòng thử lại sau.");
}

// ==========================================
// CÁC HÀM TÍNH NĂNG CHÍNH (Đã bọc qua executeWithRotation)
// ==========================================

export async function chatWithAI(message: string, history: any[], knowledgeBaseContext: string) {
  return executeWithRotation(async (ai) => {
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const contents = [...formattedHistory, { role: 'user', parts: [{ text: message }] }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        systemInstruction: `You are an expert tutor in Organizational Behavior (OB). 
        Your goal is to help the user understand the concepts provided in the knowledge base.
        Always refer back to the knowledge base context when answering questions.
        If the user asks something outside of the provided context, politely inform them that you can only answer based on the provided material.
        Be encouraging, clear, and use formatting (like bolding and bullet points) to make your answers easy to read.
        
        Knowledge Base Context:
        ${knowledgeBaseContext}`,
      },
    });

    if (!response.text) {
      throw new Error("AI trả về phản hồi rỗng.");
    }
    return response.text;
  });
}

export async function generateAdaptiveQuiz(weakTopics: string[], knowledgeBaseContext: string): Promise<any[]> {
  return executeWithRotation(async (ai) => {
    const prompt = `Based on the following knowledge base context, generate at least 5 new multiple-choice questions for EACH of these weak topics: ${weakTopics.join(', ')}.
    For example, if there are 2 weak topics, you must generate at least 10 questions in total.
    
    The questions MUST follow this exact JSON schema:
    [
      {
        "id": "unique_string_id",
        "questionEn": "Question in English",
        "questionVi": "Question translated to Vietnamese",
        "options": {
          "A": { "en": "Option A in English", "vi": "Option A in Vietnamese" },
          "B": { "en": "Option B in English", "vi": "Option B in Vietnamese" },
          "C": { "en": "Option C in English", "vi": "Option C in Vietnamese" },
          "D": { "en": "Option D in English", "vi": "Option D in Vietnamese" }
        },
        "correctAnswer": "A" | "B" | "C" | "D",
        "explanationEn": "Detailed explanation of the correct answer and why others are wrong in English",
        "explanationVi": "Detailed explanation translated to Vietnamese",
        "relatedSectionId": "The ID of the relevant section from the knowledge base (e.g., '5.1.1')",
        "topic": "The specific topic this question covers"
      }
    ]
    
    Knowledge Base Context:
    ${knowledgeBaseContext}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const jsonStr = response.text?.trim() || "[]";
    let parsedJson = [];
    try {
      let cleanJsonStr = jsonStr;
      if (cleanJsonStr.startsWith('```json')) {
        cleanJsonStr = cleanJsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (cleanJsonStr.startsWith('```')) {
        cleanJsonStr = cleanJsonStr.replace(/^```\n/, '').replace(/\n```$/, '');
      }
      parsedJson = JSON.parse(cleanJsonStr);
    } catch (parseError) {
      throw new Error("AI trả về dữ liệu JSON không hợp lệ.");
    }
    return parsedJson;
  });
}