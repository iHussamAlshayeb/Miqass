const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");
const { listServices, createService, updateService, deleteService } = require("../controllers/servicesController");

router.use(protect);

router.get("/", listServices);
router.post("/", createService);
router.put("/:serviceId", updateService);
router.delete("/:serviceId", deleteService);

module.exports = router;
