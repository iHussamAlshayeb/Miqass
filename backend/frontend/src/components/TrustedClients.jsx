import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaExternalLinkAlt } from 'react-icons/fa';
import API from '../services/api'; // تأكد أن مسار الـ API صحيح حسب مشروعك

const TrustedClients = () => {
    const [clients, setClients] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTopClients = async () => {
            try {
                // 🚀 استدعاء المسار الجديد الذي برمجناه
                const response = await API.get('/public/top-clients');
                setClients(Array.isArray(response.data) ? response.data : []);
            } catch (error) {
                console.error("Failed to fetch top clients", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTopClients();
    }, []);

    // إذا لم يكتمل التحميل أو لا يوجد عملاء بعد، لا نعرض القسم أو نعرض واجهة انتظار (Skeleton)
    if (isLoading || !Array.isArray(clients) || clients.length === 0) {
        return null;
    }

    return (
        <section className="py-24 bg-white relative overflow-hidden" dir="rtl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
                <div className="absolute top-20 right-10 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-50"></div>
                <div className="absolute bottom-10 left-10 w-80 h-80 bg-slate-50 rounded-full blur-3xl opacity-50"></div>
            </div>

            <div className="max-w-7xl mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-4xl font-black text-slate-800 mb-4 tracking-tight">
                        شركاء النجاح 🤝
                    </h2>
                    <p className="text-slate-500 font-bold max-w-2xl mx-auto">
                        نفخر بثقة نخبة من أكثر الصالونات نشاطاً التي تعتمد على نظام "مِقَص" لإدارة مئات الحجوزات شهرياً.
                    </p>
                </motion.div>

                {/* شبكة عرض العملاء (تعرض 4 أو 8 حسب العدد الراجع من الباك إند) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                    {clients.map((client, index) => (
                        <motion.a
                            href={`/${client.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            key={client.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: index * 0.1 }}
                            whileHover={{ y: -5 }}
                            className="group block bg-white border border-slate-100 rounded-3xl p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.08)] transition-all duration-300"
                        >
                            <div className="relative w-20 h-20 mx-auto mb-4">
                                <img
                                    src={client.logo}
                                    alt={`شعار ${client.name}`}
                                    className="w-full h-full object-cover rounded-2xl shadow-sm group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute -top-2 -right-2 bg-blue-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-md">
                                    <FaExternalLinkAlt className="text-[10px]" />
                                </div>
                            </div>
                            <h3 className="font-black text-slate-800 text-sm md:text-base mb-1 truncate">
                                {client.name}
                            </h3>
                            <p className="text-xs text-blue-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                احجز موعدك &larr;
                            </p>
                        </motion.a>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default TrustedClients;