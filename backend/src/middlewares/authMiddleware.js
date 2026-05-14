const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "غير مصرح لك، لا يوجد توكن عبور." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.tenantId = decoded.tenantId;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.",
        isExpired: true, // مفتاح إضافي للفرونت إند لعمل Redirect تلقائي
      });
    }

    return res
      .status(401)
      .json({ message: "غير مصرح لك، التوكن غير صالح أو تم التلاعب به." });
  }
};

module.exports = { protect };
