const mongoose = require("mongoose");
const dotenv = require("dotenv");

// تحميل ملف المتغيرات البيئية (للوصول لقاعدة البيانات)
dotenv.config();

// استيراد الموديلات
const Tenant = require("./src/models/Tenant");
const Appointment = require("./src/models/Appointment");
const Customer = require("./src/models/Customer");
const Barber = require("./src/models/Barber");

const runMigration = async () => {
  try {
    console.log("⏳ جاري الاتصال بقاعدة البيانات...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ تم الاتصال بنجاح. نبدأ عملية نقل البيانات وتنظيفها...\n");

    // جلب جميع الصالونات
    const tenants = await Tenant.find();
    console.log(`🔍 تم العثور على ${tenants.length} صالونات.`);

    for (const tenant of tenants) {
      console.log(`\n🚀 جاري معالجة بيانات صالون: ${tenant.salonName}`);

      // نستخدم collection.find لنجلب البيانات "الخام" شاملة الحقول القديمة
      const appointmentsCollection =
        mongoose.connection.collection("appointments");
      const rawAppointments = await appointmentsCollection
        .find({ tenantId: tenant._id })
        .toArray();

      if (rawAppointments.length === 0) {
        console.log("   - لا توجد مواعيد لهذا الصالون.");
        continue;
      }

      console.log(`   - تم العثور على ${rawAppointments.length} موعد قديم.`);

      // ==========================================
      // 1. استخراج وتجميع العملاء (الآباء والأطفال والولاء)
      // ==========================================
      const customersMap = {};

      rawAppointments.forEach((app) => {
        const phone = app.customerPhone; // الحقل القديم
        if (!phone) return;

        if (!customersMap[phone]) {
          customersMap[phone] = {
            children: new Set(),
            visits: 0,
            lastVisit: null,
          };
        }

        // إضافة اسم الطفل للقائمة (بدون تكرار)
        if (app.childName) customersMap[phone].children.add(app.childName);

        // حساب زيارات الولاء
        if (app.status === "Completed") {
          customersMap[phone].visits += 1;
          const appDate = new Date(app.date);
          if (
            !customersMap[phone].lastVisit ||
            appDate > customersMap[phone].lastVisit
          ) {
            customersMap[phone].lastVisit = appDate;
          }
        }
      });

      // حفظ العملاء في الجدول الجديد
      for (const [phone, data] of Object.entries(customersMap)) {
        await Customer.findOneAndUpdate(
          { tenantId: tenant._id, phone: phone },
          {
            parentName: "عميل قديم",
            children: Array.from(data.children),
            totalVisits: data.visits,
            lastVisitDate: data.lastVisit,
          },
          { upsert: true, new: true },
        );
      }
      console.log(
        `   ✅ تم ترحيل وتجميع ${Object.keys(customersMap).length} عملاء فريدين.`,
      );

      // ==========================================
      // 2. استخراج الحلاقين (الكراسي) من المواعيد
      // ==========================================
      const uniqueBarbers = [
        ...new Set(
          rawAppointments.map((a) => a.chair || a.barberName).filter(Boolean),
        ),
      ];

      for (const barberName of uniqueBarbers) {
        await Barber.findOneAndUpdate(
          { tenantId: tenant._id, name: barberName },
          { pin: "1234", isActive: true }, // إعطاء رمز سري افتراضي
          { upsert: true },
        );
      }
      console.log(`   ✅ تم ترحيل ${uniqueBarbers.length} حلاقين/كراسي.`);

      // ==========================================
      // 3. تحديث المواعيد (إضافة الـ IDs الجديدة + حذف الحقول القديمة)
      // ==========================================
      let updatedAppointmentsCount = 0;

      for (const app of rawAppointments) {
        const phone = app.customerPhone;
        const barberName = app.chair || app.barberName;

        const customer = await Customer.findOne({
          tenantId: tenant._id,
          phone,
        });
        const barber = await Barber.findOne({
          tenantId: tenant._id,
          name: barberName,
        });

        if (customer && barber) {
          // 💡 السحر هنا: نستخدم $set للإضافة، و $unset للحذف النهائي!
          await appointmentsCollection.updateOne(
            { _id: app._id },
            {
              $set: {
                customerId: customer._id,
                barberId: barber._id,
                barberName: barberName,
              },
              $unset: {
                customerPhone: "", // مسح رقم الجوال من الموعد
                chair: "", // مسح كلمة chair من الموعد
              },
            },
          );
          updatedAppointmentsCount++;
        }
      }
      console.log(
        `   ✅ تم التحديث والتنظيف الشامل لـ ${updatedAppointmentsCount} موعد بنجاح.`,
      );
    }

    console.log(
      "\n🎉🎉 تمت عملية الهجرة (Migration) وتنظيف قاعدة البيانات بنجاح تام!",
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ حدث خطأ أثناء الترحيل:", error);
    process.exit(1);
  }
};

runMigration();
