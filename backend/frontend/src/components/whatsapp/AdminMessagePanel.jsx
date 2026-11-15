import { useCallback, useState } from 'react';
import { Activity, ChevronDown, MessageCircle } from 'lucide-react';
import API from '../../services/api';
import MessageLog from './MessageLog';

const adminHeaders = () => ({ 'x-admin-key': sessionStorage.getItem('superAdminKey') || '' });

/** لوحة السوبر أدمن: حالة خدمة واتساب، الصالونات الأكثر فشلاً، وسجل كل الرسائل */
const AdminMessagePanel = ({ salons = [] }) => {
    const [open, setOpen] = useState(false);
    const [service, setService] = useState(null);
    const [failing, setFailing] = useState([]);

    const load = useCallback((params) => API.get('/admin/whatsapp/messages', { params, headers: adminHeaders() }).then((res) => {
        setService(res.data.service);
        setFailing(res.data.failingSalons || []);
        return res.data;
    }), []);
    const resend = useCallback((id) => API.post(`/admin/whatsapp/messages/${id}/resend`, {}, { headers: adminHeaders() }).then((res) => res.data), []);

    const stalled = service && service.queued > 0 && service.oldestQueuedSeconds > 120;
    const header = (
        <div className="grid gap-2 sm:grid-cols-2">
            <div className={`flex items-center gap-3 rounded-lg border p-3 ${stalled ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                <Activity size={18} className={stalled ? 'text-red-600' : 'text-emerald-600'} />
                <div className="text-sm font-bold text-slate-700">
                    {service ? (
                        <>
                            <p className="font-black text-slate-900">
                                {service.mode === 'queue' ? 'الإرسال من خدمة whatsapp-service المستقلة' : 'الإرسال من الخادم مباشرة (inline)'}
                            </p>
                            <p className={stalled ? 'text-red-700' : 'text-slate-500'}>
                                في الطابور: {service.queued}{service.queued ? ` · أقدمها منذ ${Math.round(service.oldestQueuedSeconds / 60)} دقيقة` : ''}
                                {stalled ? ' · الخدمة لا ترسل! تحقق منها' : ''}
                            </p>
                        </>
                    ) : 'جاري التحميل...'}
                </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                <p className="font-black text-slate-900">الأكثر فشلاً (24 ساعة)</p>
                {failing.length === 0
                    ? <p className="text-slate-500">لا توجد رسائل فاشلة.</p>
                    : <p className="text-slate-500">{failing.map((row) => `${row.salonName || 'صالون'} (${row.count})`).join(' · ')}</p>}
            </div>
        </div>
    );

    return (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-5 py-4 text-right">
                <MessageCircle size={18} className="text-emerald-600" />
                <h2 className="flex-1 text-base font-black text-slate-900">رسائل واتساب</h2>
                <ChevronDown size={18} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="border-t border-slate-100 p-5">
                    <MessageLog load={load} resend={resend} showSalon salons={salons} extraHeader={header} />
                </div>
            )}
        </section>
    );
};

export default AdminMessagePanel;
