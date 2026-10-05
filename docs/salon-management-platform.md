# Miqass Salon Management Platform

## الهدف

تحويل مِقَص من نظام حجوزات إلى نظام إدارة صالون متكامل، مع بقاء الحجز والكشك والبوابات الحالية تعمل بدون كسر. التوسع يتم تدريجيا داخل نفس الباك إند الحالي بأسلوب modular monolith، بحيث تكون كل وحدة مستقلة من ناحية الموديلات والراوتات والمنطق، لكنها تشارك نفس قاعدة البيانات ونفس نظام المستأجرين `tenantId`.

## المبادئ

- كل بيانات تشغيلية يجب أن تكون مربوطة بـ `tenantId`.
- الحجز يصبح مصدر بيع محتمل، وليس هو الفاتورة نفسها.
- لا يتم تعديل المخزون مباشرة من شاشة المنتج. كل تغيير مخزون يجب أن يمر عبر حركة مخزون.
- الفاتورة المالية يجب أن تعتمد على `Sale` مستقبلا، سواء كان البيع من موعد، walk-in، أو بيع منتج مباشر.
- أي ميزة جديدة يجب أن تعمل بدون تعطيل المسارات الحالية: `/appointments`, `/tenants`, `/reviews`, `/zatca`.

## الوحدات المستهدفة

### 1. Bookings

الوحدة الحالية تبقى مسؤولة عن:

- المواعيد.
- الكشك.
- الحجز العام.
- الحلاقة المباشرة `kiosk_walk_in`.
- الطابور وبوابة الطاقم.
- التذكيرات والتقييمات.

التعديل المستقبلي: عند إكمال الموعد أو تسجيل walk-in، يمكن إنشاء `Sale` مرتبط بالموعد بدلا من الاكتفاء بسجل `Appointment`.

### 2. POS and Sales

هذه أول وحدة يجب تنفيذها لأنها أساس بقية النظام.

الموديلات المقترحة:

- `Sale`
- `SaleItem`
- `Payment`

`Sale`:

- `tenantId`
- `customerId`
- `appointmentId`
- `source`: `appointment`, `walk_in`, `pos`
- `status`: `Draft`, `Paid`, `Partially_Paid`, `Refunded`, `Cancelled`
- `subtotal`
- `discountAmount`
- `vatAmount`
- `totalAmount`
- `paidAmount`
- `invoiceNumber`
- `createdBy`
- `createdAt`

`SaleItem`:

- `tenantId`
- `saleId`
- `itemType`: `service`, `product`, `custom`
- `serviceId`
- `productId`
- `name`
- `quantity`
- `unitPrice`
- `unitCost`
- `discountAmount`
- `vatRate`
- `totalAmount`

`Payment`:

- `tenantId`
- `saleId`
- `method`: `cash`, `card`, `transfer`, `online`
- `amount`
- `status`: `Paid`, `Pending`, `Failed`, `Refunded`
- `provider`
- `providerPaymentId`
- `paidAt`

Endpoints:

- `GET /api/sales`
- `GET /api/sales/:id`
- `POST /api/sales`
- `POST /api/sales/:id/items`
- `POST /api/sales/:id/payments`
- `POST /api/sales/:id/cancel`
- `GET /api/sales/:id/invoice`

### 3. Products and Inventory

الموديلات المقترحة:

- `Product`
- `ProductCategory`
- `Supplier`
- `StockMovement`

`Product`:

- `tenantId`
- `name`
- `sku`
- `barcode`
- `categoryId`
- `supplierId`
- `salePrice`
- `costPrice`
- `lowStockThreshold`
- `isActive`

`StockMovement`:

- `tenantId`
- `productId`
- `type`: `purchase`, `sale`, `return`, `adjustment`, `waste`
- `quantity`
- `unitCost`
- `referenceType`: `sale`, `purchase`, `manual_adjustment`
- `referenceId`
- `note`
- `createdBy`

قاعدة مهمة: كمية المنتج الحالية يجب أن تكون ناتجة من `StockMovement`. يمكن حفظ `currentStock` داخل `Product` لتحسين الأداء، لكن تحديثه يتم فقط داخل خدمة المخزون.

Endpoints:

- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `POST /api/inventory/movements`
- `GET /api/inventory/movements`
- `GET /api/inventory/low-stock`

### 4. Expenses

الموديلات المقترحة:

- `Expense`
- `ExpenseCategory`

`Expense`:

- `tenantId`
- `categoryId`
- `amount`
- `vatAmount`
- `paymentMethod`
- `paidAt`
- `description`
- `attachmentUrl`
- `createdBy`

Endpoints:

- `GET /api/expenses`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/expense-categories`

### 5. Reports

تعتمد على `Sale`, `Payment`, `Expense`, `StockMovement`.

التقارير المطلوبة:

- مبيعات اليوم.
- مبيعات حسب الفترة.
- مبيعات حسب الحلاق.
- أكثر الخدمات مبيعا.
- أكثر المنتجات مبيعا.
- هامش ربح المنتجات.
- المصروفات حسب التصنيف.
- صافي الربح.
- العملاء الأكثر زيارة وشراء.

Endpoints:

- `GET /api/reports/summary`
- `GET /api/reports/sales`
- `GET /api/reports/products`
- `GET /api/reports/expenses`
- `GET /api/reports/customers`

### 6. Roles and Audit

الموديلات المقترحة:

- `StaffUser`
- `AuditLog`

الأدوار:

- `owner`
- `manager`
- `cashier`
- `barber`
- `inventory`

أمثلة صلاحيات:

- `sales.create`
- `sales.refund`
- `products.manage`
- `inventory.adjust`
- `expenses.manage`
- `reports.view`
- `settings.manage`

## هيكلة الملفات المقترحة

المرحلة الحالية تستخدم `controllers`, `routes`, `models`. نستمر بنفس النمط أولا لتقليل المخاطر:

```text
backend/src/models/Sale.js
backend/src/models/SaleItem.js
backend/src/models/Payment.js
backend/src/models/Product.js
backend/src/models/ProductCategory.js
backend/src/models/Supplier.js
backend/src/models/StockMovement.js
backend/src/models/Expense.js
backend/src/models/ExpenseCategory.js

backend/src/controllers/salesController.js
backend/src/controllers/productsController.js
backend/src/controllers/inventoryController.js
backend/src/controllers/expensesController.js
backend/src/controllers/reportsController.js

backend/src/routes/salesRoutes.js
backend/src/routes/productsRoutes.js
backend/src/routes/inventoryRoutes.js
backend/src/routes/expensesRoutes.js
backend/src/routes/reportsRoutes.js
```

لاحقا يمكن نقل المنطق المتكرر إلى services:

```text
backend/src/services/salesService.js
backend/src/services/inventoryService.js
backend/src/services/accountingService.js
```

## خطة التنفيذ

### المرحلة 1: Sales Foundation

الهدف: إنشاء أساس البيع والفاتورة بدون تغيير تجربة الحجز الحالية.

- إضافة `Sale`, `SaleItem`, `Payment`.
- إضافة routes/controllers للمبيعات.
- إنشاء sale يدوي من لوحة التحكم.
- دعم عناصر خدمة من `Service`.
- دعم عنصر مخصص `custom`.
- تسجيل دفعة نقدية أو بطاقة.
- إصدار invoice من `Sale`.

قبول المرحلة:

- يمكن إنشاء بيع مباشر من لوحة التحكم.
- يمكن إضافة أكثر من بند.
- يمكن تسجيل دفع.
- يمكن عرض فاتورة البيع.
- لا تتأثر الحجوزات الحالية.

### المرحلة 2: Link Bookings to Sales

الهدف: ربط الموعد والـ walk-in بالمبيعات.

- عند إكمال appointment يمكن إنشاء sale من الخدمات.
- عند `kiosk_walk_in` يمكن إنشاء sale اختياري لاحقا من شاشة POS.
- توحيد بيانات الفاتورة حول `Sale`.
- إبقاء `Appointment.invoiceNumber` للتوافق مؤقتا.

### المرحلة 3: Products and Inventory

الهدف: بيع المنتجات وتتبع المخزون.

- CRUD المنتجات والتصنيفات.
- إضافة حركة مخزون يدوية.
- بيع منتج من POS.
- إنشاء `StockMovement` من نوع `sale` عند دفع البيع.
- تنبيه انخفاض المخزون.

### المرحلة 4: Expenses

الهدف: تسجيل المصروفات وتشغيل تقرير الربحية.

- CRUD تصنيفات المصروفات.
- تسجيل مصروف.
- فلترة حسب التاريخ والتصنيف.
- ربط التقرير المالي بالمصروفات.

### المرحلة 5: Reports and Permissions

الهدف: نقل النظام من تشغيل يومي إلى إدارة وتحليل.

- تقارير ملخصة.
- صلاحيات أولية.
- Audit log للعمليات المالية والمخزنية.

## أول MVP مقترح

تنفيذ شاشة POS بسيطة في لوحة التحكم:

- اختيار عميل اختياري.
- إضافة خدمة من خدمات الصالون.
- إضافة بند مخصص.
- دفع نقدي أو بطاقة.
- حفظ sale.
- عرض فاتورة.

هذه الخطوة تفتح الطريق لبيع المنتجات والمخزون بدون إعادة بناء لاحقة.

## ملاحظات ترحيل

- لا نحذف `Invoice` الحالي الآن.
- لا نغير webhook Moyasar في المرحلة الأولى.
- لا نغير ZATCA حتى يصبح `Sale` مستقرا.
- أي `Sale` جديد يجب أن يحمل `tenantId` وفهارس مناسبة.
- أي endpoint مالي يجب أن يكون محميا بـ auth middleware.
