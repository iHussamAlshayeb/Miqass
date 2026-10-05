import {
    Camera,
    Image as ImageIcon,
    MapPin,
    Palette,
} from 'lucide-react';

// 1. قسم الهوية والتواصل وتخصيص الواجهة
// الشعار المرفوع يصل كرابط داخلي (/logo/...) أو base64؛ حقل الرابط يعرض الروابط الخارجية فقط
const isExternalLogo = (value) => /^https?:\/\//i.test(value || '');

const IdentitySection = ({
    salonName,
    setSalonName,
    ownerName,
    setOwnerName,
    ownerPhone,
    setOwnerPhone,
    logoUrl,
    setLogoUrl,
    settings,
    setSettings,
    bio,
    setBio,
    socialLinks,
    setSocialLinks,
    themeColors,
    setThemeColors,
    activeSettingsTab,
    fileInputRef,
    handleLogoUpload,
}) => (
    <section role="tabpanel" data-settings-tab="identity" className={`${activeSettingsTab === 'identity' ? 'block' : 'hidden'} bg-white p-5 md:p-7 rounded-lg shadow-sm border border-slate-100`}>
        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-50 pb-4">
            الهوية، التواصل، وتخصيص الواجهة
        </h3>

        {/* الحقول الأساسية */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">اسم الصالون</label>
                <input type="text" value={salonName || ''} onChange={(e) => setSalonName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="مثال: صالون الأبطال" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">اسم المالك / المدير</label>
                <input type="text" value={ownerName || ''} onChange={(e) => setOwnerName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="مثال: أبو علي" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">رقم الجوال (للتواصل)</label>
                <input type="text" value={ownerPhone || ''} onChange={(e) => setOwnerPhone(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm tracking-wider" placeholder="0500000000" dir="ltr" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">رقم التواصل الظاهر للعملاء (اختياري)</label>
                <input type="text" inputMode="tel" value={settings?.contactPhone || ''} onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm tracking-wider" placeholder={ownerPhone || '0500000000'} dir="ltr" />
                <p className="mt-1 text-[10px] font-bold text-slate-400">يظهر في زر الاتصال بصفحة الحجز ورسائل واتساب. إذا تركته فارغاً يُستخدم رقم الجوال أعلاه.</p>
            </div>
            <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2">
                    <MapPin size={13} />
                    رابط خرائط جوجل
                </label>
                <input type="text" inputMode="url" value={settings?.locationUrl || ''} onChange={(e) => setSettings({ ...settings, locationUrl: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm" placeholder="https://maps.google.com/..." dir="ltr" />
            </div>

            <div className="md:col-span-2 bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-3">
                    <ImageIcon size={13} />
                    شعار الصالون
                </label>
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 overflow-hidden bg-white flex items-center justify-center flex-shrink-0 relative group hover:border-blue-400 transition-colors">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                            <Camera size={24} className="text-slate-300" />
                        )}
                    </div>
                    <div className="flex-1 space-y-2">
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" />
                        <button type="button" onClick={() => fileInputRef.current.click()} className="bg-white border border-slate-200 text-slate-700 font-black px-6 py-2.5 rounded-lg text-sm hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm">
                            رفع صورة من الجهاز
                        </button>
                        <input
                            type="text"
                            inputMode="url"
                            value={isExternalLogo(logoUrl) ? logoUrl : ''}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-500 outline-none focus:border-blue-400 text-xs"
                            placeholder={logoUrl && !isExternalLogo(logoUrl) ? 'تم رفع الشعار — أو ضع رابط صورة بدلاً منه' : 'أو ضع رابط الصورة مباشرة هنا...'}
                            dir="ltr"
                        />
                    </div>
                </div>
            </div>

            {/* الهوية الرقمية */}
            <div className="md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                <h4 className="text-md font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Palette size={17} className="text-pink-500" /> تخصيص صفحة الحجز
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-2">نبذة عن الصالون (Bio)</label>
                        <textarea
                            rows="2"
                            value={bio || ''}
                            onChange={(e) => setBio(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-400 transition-all text-sm font-bold text-slate-700 resize-none"
                            placeholder="مثال: أفضل صالون للحلاقة العصرية والعناية بالرجل..."
                        />
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">اللون الأساسي</label>
                            <p className="text-[10px] text-slate-400 font-bold">للأزرار والخلفيات</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">{themeColors?.primaryColor}</span>
                            <input
                                type="color"
                                value={themeColors?.primaryColor || '#3b82f6'}
                                onChange={(e) => setThemeColors({ ...themeColors, primaryColor: e.target.value })}
                                className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent p-0"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center justify-between">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">اللون الثانوي</label>
                            <p className="text-[10px] text-slate-400 font-bold">للمسات والظلال</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">{themeColors?.secondaryColor}</span>
                            <input
                                type="color"
                                value={themeColors?.secondaryColor || '#cbd5e1'}
                                onChange={(e) => setThemeColors({ ...themeColors, secondaryColor: e.target.value })}
                                className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent p-0"
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">إنستجرام</label>
                            <input type="text" inputMode="url" value={socialLinks?.instagram || ''} onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-400 transition-all text-sm font-bold text-slate-700" placeholder="https://instagram.com/..." dir="ltr" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">تيك توك</label>
                            <input type="text" inputMode="url" value={socialLinks?.tiktok || ''} onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-800 transition-all text-sm font-bold text-slate-700" placeholder="https://tiktok.com/@..." dir="ltr" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">سناب شات</label>
                            <input type="text" inputMode="url" value={socialLinks?.snapchat || ''} onChange={(e) => setSocialLinks({ ...socialLinks, snapchat: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-yellow-100 focus:border-yellow-400 transition-all text-sm font-bold text-slate-700" placeholder="https://snapchat.com/add/..." dir="ltr" />
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </section>
);

export default IdentitySection;
