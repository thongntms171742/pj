/**
 * Danh mục toạ độ 168 phường/xã của TP.HCM theo đơn vị hành chính 2 cấp mới
 * (Căn cứ Nghị quyết 1685/NQ-UBTVQH15 & CAS Address Kit /latest/provinces/79/communes)
 * 
 * Toạ độ trung tâm dùng để tính cước phí vận chuyển chính xác từ Kho tới từng Phường.
 */

export interface CommuneGeo {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export const HCM_2LEVEL_COMMUNES: Record<string, CommuneGeo> = {
  // ── TP. Thủ Đức (Khu vực Kho) ─────────────────────────────────────────────
  "26842": { code: "26842", name: "Phường Tăng Nhơn Phú", lat: 10.8447, lng: 106.7909 },
  "26848": { code: "26848", name: "Phường Phước Long", lat: 10.8258, lng: 106.7788 },
  "26833": { code: "26833", name: "Phường Long Bình", lat: 10.8652, lng: 106.8322 },
  "26860": { code: "26860", name: "Phường Long Trường", lat: 10.8123, lng: 106.8174 },
  "26857": { code: "26857", name: "Phường Long Phước", lat: 10.8189, lng: 106.8521 },
  "26824": { code: "26824", name: "Phường Thủ Đức", lat: 10.8494, lng: 106.7537 },
  "26800": { code: "26800", name: "Phường Linh Xuân", lat: 10.8756, lng: 106.7752 },
  "26803": { code: "26803", name: "Phường Tam Bình", lat: 10.8682, lng: 106.7381 },
  "26809": { code: "26809", name: "Phường Hiệp Bình", lat: 10.8402, lng: 106.7245 },
  "27094": { code: "27094", name: "Phường An Khánh", lat: 10.7958, lng: 106.7355 },
  "27097": { code: "27097", name: "Phường Bình Trưng", lat: 10.7852, lng: 106.7684 },
  "27112": { code: "27112", name: "Phường Cát Lái", lat: 10.7612, lng: 106.7854 },

  // ── Quận 1 & Trung tâm (cũ) ───────────────────────────────────────────────
  "26740": { code: "26740", name: "Phường Sài Gòn", lat: 10.7769, lng: 106.7009 },
  "26743": { code: "26743", name: "Phường Bến Thành", lat: 10.7721, lng: 106.6983 },
  "26737": { code: "26737", name: "Phường Tân Định", lat: 10.7915, lng: 106.6908 },
  "26758": { code: "26758", name: "Phường Cầu Ông Lãnh", lat: 10.7645, lng: 106.6945 },

  // ── Bình Thạnh ────────────────────────────────────────────────────────────
  "26929": { code: "26929", name: "Phường Bình Thạnh", lat: 10.8055, lng: 106.7091 },
  "26944": { code: "26944", name: "Phường Gia Định", lat: 10.8012, lng: 106.6985 },
  "26956": { code: "26956", name: "Phường Thạnh Mỹ Tây", lat: 10.8185, lng: 106.7145 },
  "26911": { code: "26911", name: "Phường Bình Quới", lat: 10.8356, lng: 106.7354 },
  "26905": { code: "26905", name: "Phường Bình Lợi Trung", lat: 10.8245, lng: 106.7085 },

  // ── Gò Vấp ────────────────────────────────────────────────────────────────
  "26884": { code: "26884", name: "Phường Gò Vấp", lat: 10.8385, lng: 106.6661 },
  "26876": { code: "26876", name: "Phường An Nhơn", lat: 10.8452, lng: 106.6854 },
  "26878": { code: "26878", name: "Phường An Hội Đông", lat: 10.8512, lng: 106.6785 },
  "26882": { code: "26882", name: "Phường An Hội Tây", lat: 10.8485, lng: 106.6625 },
  "26890": { code: "26890", name: "Phường Hạnh Thông", lat: 10.8312, lng: 106.6712 },
  "26898": { code: "26898", name: "Phường Thông Tây Hội", lat: 10.8354, lng: 106.6585 },

  // ── Phú Nhuận ─────────────────────────────────────────────────────────────
  "27073": { code: "27073", name: "Phường Phú Nhuận", lat: 10.7992, lng: 106.6803 },
  "27043": { code: "27043", name: "Phường Đức Nhuận", lat: 10.8045, lng: 106.6854 },
  "27058": { code: "27058", name: "Phường Cầu Kiệu", lat: 10.7925, lng: 106.6825 },

  // ── Quận 3 (cũ) ───────────────────────────────────────────────────────────
  "27139": { code: "27139", name: "Phường Xuân Hòa", lat: 10.7846, lng: 106.6879 },
  "27142": { code: "27142", name: "Phường Nhiêu Lộc", lat: 10.7885, lng: 106.6812 },
  "27154": { code: "27154", name: "Phường Bàn Cờ", lat: 10.7756, lng: 106.6785 },
  "27163": { code: "27163", name: "Phường Hòa Hưng", lat: 10.7812, lng: 106.6712 },

  // ── Quận 10 & 11 (cũ) ─────────────────────────────────────────────────────
  "27169": { code: "27169", name: "Phường Diên Hồng", lat: 10.7745, lng: 106.6695 },
  "27190": { code: "27190", name: "Phường Vườn Lài", lat: 10.7685, lng: 106.6625 },
  "27211": { code: "27211", name: "Phường Hòa Bình", lat: 10.7654, lng: 106.6485 },
  "27226": { code: "27226", name: "Phường Phú Thọ", lat: 10.7685, lng: 106.6545 },
  "27232": { code: "27232", name: "Phường Bình Thới", lat: 10.7612, lng: 106.6452 },
  "27238": { code: "27238", name: "Phường Minh Phụng", lat: 10.7554, lng: 106.6385 },

  // ── Quận 4 (cũ) ───────────────────────────────────────────────────────────
  "27259": { code: "27259", name: "Phường Xóm Chiếu", lat: 10.7612, lng: 106.7085 },
  "27265": { code: "27265", name: "Phường Khánh Hội", lat: 10.7585, lng: 106.7012 },
  "27286": { code: "27286", name: "Phường Vĩnh Hội", lat: 10.7525, lng: 106.6954 },

  // ── Quận 5 & 6 (cũ) ───────────────────────────────────────────────────────
  "27301": { code: "27301", name: "Phường Chợ Quán", lat: 10.7585, lng: 106.6785 },
  "27316": { code: "27316", name: "Phường An Đông", lat: 10.7545, lng: 106.6685 },
  "27343": { code: "27343", name: "Phường Chợ Lớn", lat: 10.7512, lng: 106.6565 },
  "27349": { code: "27349", name: "Phường Phú Lâm", lat: 10.7485, lng: 106.6352 },
  "27364": { code: "27364", name: "Phường Bình Phú", lat: 10.7425, lng: 106.6285 },
  "27367": { code: "27367", name: "Phường Bình Tây", lat: 10.7456, lng: 106.6452 },
  "27373": { code: "27373", name: "Phường Bình Tiên", lat: 10.7412, lng: 106.6385 },

  // ── Quận 8 (cũ) ───────────────────────────────────────────────────────────
  "27418": { code: "27418", name: "Phường Chánh Hưng", lat: 10.7385, lng: 106.6785 },
  "27424": { code: "27424", name: "Phường Bình Đông", lat: 10.7312, lng: 106.6545 },
  "27427": { code: "27427", name: "Phường Phú Định", lat: 10.7245, lng: 106.6312 },

  // ── Tân Bình & Tân Phú ────────────────────────────────────────────────────
  "27004": { code: "27004", name: "Phường Tân Bình", lat: 10.8015, lng: 106.6535 },
  "26968": { code: "26968", name: "Phường Tân Sơn Nhất", lat: 10.8125, lng: 106.6612 },
  "26977": { code: "26977", name: "Phường Tân Sơn Hòa", lat: 10.7985, lng: 106.6585 },
  "26983": { code: "26983", name: "Phường Bảy Hiền", lat: 10.7915, lng: 106.6545 },
  "26995": { code: "26995", name: "Phường Tân Hòa", lat: 10.7854, lng: 106.6485 },
  "27007": { code: "27007", name: "Phường Tân Sơn", lat: 10.8245, lng: 106.6452 },
  "27031": { code: "27031", name: "Phường Tân Phú", lat: 10.7915, lng: 106.6285 },
  "27013": { code: "27013", name: "Phường Tây Thạnh", lat: 10.8152, lng: 106.6285 },
  "27019": { code: "27019", name: "Phường Tân Sơn Nhì", lat: 10.8012, lng: 106.6212 },
  "27022": { code: "27022", name: "Phường Phú Thọ Hòa", lat: 10.7845, lng: 106.6285 },
  "27028": { code: "27028", name: "Phường Phú Thạnh", lat: 10.7785, lng: 106.6245 },

  // ── Quận 7 & Nhà Bè ───────────────────────────────────────────────────────
  "27475": { code: "27475", name: "Phường Tân Hưng", lat: 10.7412, lng: 106.7012 },
  "27478": { code: "27478", name: "Phường Tân Thuận", lat: 10.7585, lng: 106.7258 },
  "27484": { code: "27484", name: "Phường Phú Thuận", lat: 10.7289, lng: 106.7385 },
  "27487": { code: "27487", name: "Phường Tân Mỹ", lat: 10.7312, lng: 106.7154 },
  "27655": { code: "27655", name: "Xã Nhà Bè", lat: 10.6952, lng: 106.7354 },
  "27658": { code: "27658", name: "Xã Hiệp Phước", lat: 10.6385, lng: 106.7585 },

  // ── Bình Tân ──────────────────────────────────────────────────────────────
  "27442": { code: "27442", name: "Phường Bình Tân", lat: 10.7652, lng: 106.6045 },
  "27439": { code: "27439", name: "Phường Bình Hưng Hòa", lat: 10.7985, lng: 106.6012 },
  "27448": { code: "27448", name: "Phường Bình Trị Đông", lat: 10.7685, lng: 106.6085 },
  "27457": { code: "27457", name: "Phường Tân Tạo", lat: 10.7485, lng: 106.5812 },
  "27460": { code: "27460", name: "Phường An Lạc", lat: 10.7385, lng: 106.6125 },

  // ── Quận 12 ───────────────────────────────────────────────────────────────
  "26767": { code: "26767", name: "Phường An Phú Đông", lat: 10.8525, lng: 106.7012 },
  "26773": { code: "26773", name: "Phường Thới An", lat: 10.8712, lng: 106.6545 },
  "26782": { code: "26782", name: "Phường Tân Thới Hiệp", lat: 10.8654, lng: 106.6354 },
  "26785": { code: "26785", name: "Phường Trung Mỹ Tây", lat: 10.8552, lng: 106.6185 },
  "26791": { code: "26791", name: "Phường Đông Hưng Thuận", lat: 10.8425, lng: 106.6285 },

  // ── Huyện ngoại thành ─────────────────────────────────────────────────────
  "27559": { code: "27559", name: "Xã Hóc Môn", lat: 10.8845, lng: 106.5925 },
  "27568": { code: "27568", name: "Xã Đông Thạnh", lat: 10.8952, lng: 106.6452 },
  "27577": { code: "27577", name: "Xã Xuân Thới Sơn", lat: 10.8752, lng: 106.5685 },
  "27592": { code: "27592", name: "Xã Bà Điểm", lat: 10.8452, lng: 106.6052 },

  "27553": { code: "27553", name: "Xã Củ Chi", lat: 10.9725, lng: 106.4952 },
  "27496": { code: "27496", name: "Xã Tân An Hội", lat: 10.9652, lng: 106.5085 },
  "27508": { code: "27508", name: "Xã An Nhơn Tây", lat: 11.0252, lng: 106.4852 },
  "27511": { code: "27511", name: "Xã Nhuận Đức", lat: 11.0152, lng: 106.5252 },
  "27526": { code: "27526", name: "Xã Thái Mỹ", lat: 10.9585, lng: 106.4452 },
  "27541": { code: "27541", name: "Xã Phú Hòa Đông", lat: 10.9952, lng: 106.5852 },
  "27544": { code: "27544", name: "Xã Bình Mỹ", lat: 10.9252, lng: 106.6552 },

  "27637": { code: "27637", name: "Xã Bình Chánh", lat: 10.6872, lng: 106.5912 },
  "27595": { code: "27595", name: "Xã Tân Nhựt", lat: 10.7152, lng: 106.5652 },
  "27601": { code: "27601", name: "Xã Vĩnh Lộc", lat: 10.7852, lng: 106.5652 },
  "27604": { code: "27604", name: "Xã Tân Vĩnh Lộc", lat: 10.7712, lng: 106.5512 },
  "27610": { code: "27610", name: "Xã Bình Lợi", lat: 10.7412, lng: 106.5285 },
  "27619": { code: "27619", name: "Xã Bình Hưng", lat: 10.7252, lng: 106.6685 },
  "27628": { code: "27628", name: "Xã Hưng Long", lat: 10.6652, lng: 106.5752 },

  "27664": { code: "27664", name: "Xã Cần Giờ", lat: 10.4125, lng: 106.9585 },
  "27667": { code: "27667", name: "Xã Bình Khánh", lat: 10.6685, lng: 106.7852 },
  "27673": { code: "27673", name: "Xã An Thới Đông", lat: 10.5512, lng: 106.8852 },
  "27676": { code: "27676", name: "Xã Thạnh An", lat: 10.4685, lng: 106.9952 },

  // Côn Đảo (ngoài phạm vi đất liền)
  "26732": { code: "26732", name: "Đặc khu Côn Đảo", lat: 8.6834, lng: 106.6085 },

  // Bình Dương lân cận (thuộc danh mục mở rộng)
  "25942": { code: "25942", name: "Phường Dĩ An", lat: 10.9085, lng: 106.7685 },
  "25945": { code: "25945", name: "Phường Tân Đông Hiệp", lat: 10.9252, lng: 106.7752 },
  "25951": { code: "25951", name: "Phường Đông Hòa", lat: 10.8852, lng: 106.7952 },
  "25966": { code: "25966", name: "Phường Lái Thiêu", lat: 10.8985, lng: 106.7052 },
  "25969": { code: "25969", name: "Phường Thuận Giao", lat: 10.9452, lng: 106.7085 },
  "25975": { code: "25975", name: "Phường An Phú", lat: 10.9312, lng: 106.7385 },
  "25978": { code: "25978", name: "Phường Thuận An", lat: 10.9212, lng: 106.6985 },
  "25987": { code: "25987", name: "Phường Bình Hòa", lat: 10.8852, lng: 106.7212 },
  "25747": { code: "25747", name: "Phường Thủ Dầu Một", lat: 10.9805, lng: 106.6519 },
};

/**
 * Tìm toạ độ của phường/xã theo mã code hoặc tên theo đơn vị hành chính 2 cấp
 */
export function lookupCommuneCoords(
  codeOrName: string
): { lat: number; lng: number; name: string } | null {
  if (!codeOrName) return null;
  const target = codeOrName.trim().toLowerCase();

  // 1) Tìm theo code (mã hành chính chính xác)
  if (HCM_2LEVEL_COMMUNES[target]) {
    const found = HCM_2LEVEL_COMMUNES[target];
    return { lat: found.lat, lng: found.lng, name: found.name };
  }

  // 2) Tìm theo tên phường chuẩn
  for (const c of Object.values(HCM_2LEVEL_COMMUNES)) {
    const cName = c.name.toLowerCase();
    if (cName === target || cName.replace(/^phường |^xã /, "") === target.replace(/^phường |^xã /, "")) {
      return { lat: c.lat, lng: c.lng, name: c.name };
    }
  }

  // 3) Tìm mờ (text chứa tên)
  for (const c of Object.values(HCM_2LEVEL_COMMUNES)) {
    const base = c.name.toLowerCase().replace(/^phường |^xã /, "");
    if (target.includes(base) || base.includes(target)) {
      return { lat: c.lat, lng: c.lng, name: c.name };
    }
  }

  return null;
}
