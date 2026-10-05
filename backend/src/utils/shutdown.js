/**
 * إغلاق منظم: إيقاف المهام المجدولة ← إغلاق الخادم بعد إكمال الطلبات الجارية
 * ← إغلاق اتصالات MongoDB وRedis. مع حد أقصى للوقت حتى لا يعلق الإيقاف.
 */
const createShutdown = ({
  server,
  stopCronJobs,
  mongoose,
  redisClient,
  timeoutMs = 25000,
  exit = (code) => process.exit(code),
  log = console,
}) => {
  let shuttingDown = null;

  const closeServer = () =>
    new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
      // اتصالات keep-alive الخاملة لا تُغلق تلقائياً
      server.closeIdleConnections?.();
    });

  const steps = async () => {
    if (stopCronJobs) {
      const drained = await stopCronJobs(Math.min(15000, timeoutMs - 5000));
      log.log(drained ? "⏹️ توقفت المهام المجدولة." : "⚠️ انتهت مهلة انتظار المهام المجدولة.");
    }
    await closeServer();
    log.log("⏹️ أُغلق الخادم بعد إكمال الطلبات الجارية.");
    if (mongoose?.connection?.readyState) await mongoose.connection.close();
    if (redisClient?.isOpen) {
      // quit() ينتظر اتصالاً جاهزاً؛ إن كان Redis منقطعاً نغلق مباشرة
      await (redisClient.isReady ? redisClient.quit() : redisClient.disconnect()).catch(() => {});
    }
    log.log("🏁 أُغلقت اتصالات قاعدة البيانات وRedis.");
  };

  return (reason, code = 0) => {
    if (shuttingDown) return shuttingDown;
    log.log(`⚠️ بدء الإغلاق المنظم (${reason})...`);

    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        log.error(`⚠️ تجاوز الإغلاق ${timeoutMs}ms، خروج إجباري.`);
        resolve("timeout");
      }, timeoutMs);
    });

    shuttingDown = Promise.race([steps(), timeout])
      .catch((error) => {
        log.error("خطأ أثناء الإغلاق:", error);
        code = code || 1;
      })
      .finally(() => {
        clearTimeout(timer);
        exit(code);
      });
    return shuttingDown;
  };
};

module.exports = { createShutdown };
