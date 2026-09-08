@AGENTS.md

## Bu depo tek başına değildir

`icmal-app`, `Desktop/icmal/` çalışma alanının parçasıdır. **Bağlayıcı kurallar,
görev kartları ve durum belgeleri bir üst klasördedir:**

- `../CLAUDE.md` — Değişmez kurallar (ayrıntılandırma kapısı, durum yazma,
  ortak modül zorunluluğu, para sözleşmesi)
- `../DURUM.md` — en üstteki girdi geçerli
- `../YAPILACAKLAR.md`, `../isler/`, `../KARARLAR.md`, `../KABUL_BEKLEYENLER.md`

Oturum doğrudan bu klasörde açıldıysa önce yukarıdaki kök belgeleri okuyun;
proje belleği de çalışma alanı köküne bağlıdır.

**`AGENTS.md` elle düzenlenmez** — `next dev` kendi bloğunu yeniden yazar.
Kalıcı kural gerekiyorsa bu dosyaya ya da kök `CLAUDE.md`'ye yazılır.
