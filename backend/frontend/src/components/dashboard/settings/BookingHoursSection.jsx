import {
    Clock3,
    X,
} from 'lucide-react';

// 2. قسم أوقات العمل
const BookingHoursSection = ({
    settings,
    setSettings,
    newClosedDate,
    setNewClosedDate,
    activeSettingsTab,
}) => (
    <section role="tabpanel" className={`${activeSettingsTab === 'booking' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
            أوقات العمل والجدولة
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">وقت الافتتاح</label>
                <input type="time" value={settings?.startTime || ''} onChange={(e) => setSettings({ ...settings, startTime: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">وقت الإغلاق</label>
                <input type="time" value={settings?.endTime || ''} onChange={(e) => setSettings({ ...settings, endTime: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">مدة الموعد الواحد</label>
                <select value={settings?.slotDuration || 30} onChange={(e) => setSettings({ ...settings, slotDuration: parseInt(e.target.value) })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-black text-slate-800 outline-none focus:border-blue-400 appearance-none cursor-pointer">
                    <option value={15}>15 دقيقة (سريع)</option>
                    <option value={20}>20 دقيقة</option>
                    <option value={30}>30 دقيقة (قياسي)</option>
                    <option value={45}>45 دقيقة</option>
                    <option value={60}>ساعة كاملة</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-red-500 mb-2">إيقاف الحجوزات بعد تاريخ (اختياري)</label>
                <div className="flex gap-2">
                    <input type="date" value={settings?.maxBookingDate || ''} onChange={(e) => setSettings({ ...settings, maxBookingDate: e.target.value })} className="flex-1 p-4 bg-red-50 border border-red-100 rounded-lg font-bold text-red-600 outline-none focus:border-red-400 text-sm" />
                    {settings?.maxBookingDate && <button type="button" onClick={() => setSettings({ ...settings, maxBookingDate: '' })} className="bg-red-100 text-red-600 font-black px-4 rounded-lg hover:bg-red-200 inline-flex items-center justify-center"><X size={16} /></button>}
                </div>
            </div>
        </div>

        <div className="bg-orange-50 p-5 rounded-lg border border-orange-100 mb-6">
            <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-black text-orange-700 flex items-center gap-2">
                    <Clock3 size={16} />
                    وقت الاستراحة (مغلق للحجز)
                </h4>
                {(settings?.breakStart || settings?.breakEnd) && (
                    <button type="button" onClick={() => setSettings({ ...settings, breakStart: '', breakEnd: '' })} className="text-xs text-orange-500 hover:text-orange-700 font-bold bg-white px-3 py-1 rounded-lg shadow-sm">إلغاء الاستراحة</button>
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-orange-600/70 mb-2">من الساعة</label><input type="time" value={settings?.breakStart || ''} onChange={(e) => setSettings({ ...settings, breakStart: e.target.value })} className="w-full p-3 bg-white border border-orange-200 rounded-lg font-black text-orange-700 outline-none" /></div>
                <div><label className="block text-xs font-bold text-orange-600/70 mb-2">إلى الساعة</label><input type="time" value={settings?.breakEnd || ''} onChange={(e) => setSettings({ ...settings, breakEnd: e.target.value })} className="w-full p-3 bg-white border border-orange-200 rounded-lg font-black text-orange-700 outline-none" /></div>
            </div>
        </div>

        <div>
            <label className="block text-sm font-black text-slate-700 mb-3">أيام الإجازات (تواريخ محددة يغلق فيها الصالون)</label>
            <div className="flex gap-2 mb-4">
                <input type="date" value={newClosedDate} onChange={(e) => setNewClosedDate(e.target.value)} className="flex-1 max-w-xs p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-600 outline-none focus:border-blue-400 text-sm" />
                <button type="button" onClick={() => { if (newClosedDate && !settings?.closedDates?.includes(newClosedDate)) { setSettings({ ...settings, closedDates: [...(settings?.closedDates || []), newClosedDate] }); setNewClosedDate(''); } }} className="bg-slate-800 text-white font-black px-6 rounded-lg hover:bg-slate-700 text-sm transition-all shadow-sm">إضافة إجازة</button>
            </div>
            <div className="flex flex-wrap gap-2">
                {settings?.closedDates?.map((date) => (
                    <div key={date} className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-3 shadow-sm">
                        <span dir="ltr">{date}</span>
                        <button type="button" onClick={() => setSettings({ ...settings, closedDates: settings.closedDates.filter(d => d !== date) })} className="bg-white w-5 h-5 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors">×</button>
                    </div>
                ))}
            </div>
        </div>
    </section>
);

export default BookingHoursSection;
