import axios from "axios";

// اتصال نقطة البيع: توكن الكاشير إن سجّل دخوله على هذا الجهاز، وإلا توكن المالك من لوحة التحكم.
const posApi = axios.create({ baseURL: import.meta.env.VITE_BASE_URL || "/api" });

const read = (key) => { try { return localStorage.getItem(key) || ""; } catch { return ""; } };
const write = (key, value) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* تجاهل */ } };

export const POS_TOKEN_KEY = "pos_token";
export const POS_SLUG_KEY = "pos_salon_slug";
export const POS_DEVICE_KEY = "pos_device_token";

export const hasPosSession = () => Boolean(read(POS_TOKEN_KEY) || read("token"));
export const isCashierSession = () => Boolean(read(POS_TOKEN_KEY));
export const savedSalonSlug = () => read(POS_SLUG_KEY);
export const startCashierSession = (token) => write(POS_TOKEN_KEY, token);
export const endCashierSession = () => write(POS_TOKEN_KEY, "");
// توكن الجهاز المفعّل: يبقى على الجهاز ولا يُعرض للمستخدم
export const deviceToken = () => read(POS_DEVICE_KEY);
export const thisDeviceId = () => read("pos_device_id");
export const saveDeviceToken = (token, id = "") => { write(POS_DEVICE_KEY, token); write("pos_device_id", id); };
export const forgetDevice = () => { write(POS_DEVICE_KEY, ""); write("pos_device_id", ""); write(POS_TOKEN_KEY, ""); };
export const isDeviceNotActivated = (error) => error?.response?.data?.code === "POS_DEVICE_NOT_ACTIVATED";

posApi.interceptors.request.use((req) => {
  const token = read(POS_TOKEN_KEY) || read("token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

posApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 503 && error.response.data?.isMaintenance) {
      window.location.href = "/maintenance";
      return new Promise(() => {});
    }
    return Promise.reject(error);
  },
);

export default posApi;
