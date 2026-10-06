// ترتيب الباقات: هل الباقة الحالية تساوي المطلوبة أو أعلى منها؟
const PLAN_RANK = { Free: 0, Pro: 1, Premium: 2 };

export const isPlanAtLeast = (currentPlan, requiredPlan) =>
    (PLAN_RANK[currentPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
