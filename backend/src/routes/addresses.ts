import { Router } from "express";
import {
  getProvinces,
  getCommunesByProvince,
  getAllCommunes,
} from "../controllers/addressController";

const router = Router();

router.get("/provinces", getProvinces);
router.get("/provinces/:provinceId/communes", getCommunesByProvince);
router.get("/communes", getAllCommunes);

export default router;
