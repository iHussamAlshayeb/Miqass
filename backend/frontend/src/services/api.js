import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL, // تأكد أن هذا هو رابط الباك إند الخاص بك
});

// ==========================================
// 🛡️ 1. معترض الطلبات (Request Interceptor)
// ==========================================
// يقرأ التوكن من المتصفح ويضعه في كل طلب قبل إرساله
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

// ==========================================
// 🛑 2. معترض الاستجابات (Response Interceptor)
// ==========================================
// يراقب الأخطاء القادمة من السيرفر لاصطياد "وضع الصيانة"
API.interceptors.response.use(
  (response) => {
    // إذا كان الرد سليماً، يمرر البيانات بشكل طبيعي
    return response;
  },
  (error) => {
    // 💡 السحر هنا: إذا كان السيرفر في وضع الصيانة (كود 503)
    if (
      error.response &&
      error.response.status === 503 &&
      error.response.data?.isMaintenance
    ) {
      // توجيه المستخدم فوراً إلى شاشة الصيانة
      window.location.href = "/maintenance";

      // نوقف تمرير الخطأ لكي لا تنهار باقي الشاشات
      return new Promise(() => {});
    }

    // إذا كان خطأ آخر (مثل 404 أو 401)، نمرره كالمعتاد
    return Promise.reject(error);
  },
);

export default API;
