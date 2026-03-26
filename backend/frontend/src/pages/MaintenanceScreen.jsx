import React from 'react';
import { motion } from 'framer-motion';

const MaintenanceScreen = () => {
    return (
        <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 font-arabic text-center relative overflow-hidden" dir="rtl">
            {/* 🎨 تأثيرات الإضاءة الخلفية (Glow Effects) */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] -ml-20 -mb-20 pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative z-10 max-w-lg w-full bg-slate-800/50 backdrop-blur-xl p-10 rounded-[40px] border border-slate-700/50 shadow-2xl flex flex-col items-center"
            >
                {/* ⚙️ أيقونة الترس المتحركة */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                    className="text-8xl block mb-8 opacity-90"
                >
                    ⚙️
                </motion.div>

                <h1 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-wide">
                    النظام تحت الصيانة 🛠️
                </h1>

                <p className="text-slate-400 font-bold text-sm md:text-base leading-relaxed mb-10">
                    نقوم حالياً بإجراء تحديثات هامة لخوادم <span className="text-blue-400">مِقَص</span> لإضافة ميزات جديدة وتحسين سرعة الأداء.
                    <br className="hidden md:block" />سنعود للعمل خلال دقائق معدودة. شكراً لتفهمكم وصبركم! ✨
                </p>

                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full bg-blue-600 text-white font-black px-8 py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-95 flex items-center justify-center gap-3"
                >
                    <span>العودة للنظام</span>
                    <span className="text-xl">🔄</span>
                </button>
            </motion.div>

            {/* 🏷️ حقوق النظام */}
            <div className="absolute bottom-8 text-slate-500 text-xs font-bold tracking-widest uppercase">
                نظام مِقَص السحابي © {new Date().getFullYear()}
            </div>
        </div>
    );
};

export default MaintenanceScreen;