# Template: Key Insights + Next Steps — Zero Waste Intelligence

> Template untuk ditambahkan ke `waste-to-value-mockup.html` supaya ada section
> **Key Insights** dengan posisi & gaya sama seperti Production Intelligence
> (dua card gelap di baris paling bawah, sebelum footer).

---

## 1. Perubahan Layout

- Card `Detailed View by PT` diperlebar: `col-span-9` → `col-span-12` (full-width).
- Card `Next Steps` lama (putih, `col-span-3`) **dihapus** — kontennya dipindah
  ke card gelap kanan di baris baru.
- Baris baru ditambahkan **setelah ROW 4, sebelum `</main>`**:
  `Key Insights` (kiri) + `Next Steps` (kanan), `grid grid-cols-2`.
- Card gelap memakai class baru `.dark-card` (navy gradient seperti `rail-card`
  di production). Aksen **hijau** agar match tema Zero Waste.

---

## 2. CSS (tambahkan ke dalam `<style>`)

```css
.dark-card { background: linear-gradient(160deg, #0d2d4f, #0a2240); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; color: #e6eef7; }
```

---

## 3. HTML (baris baru sebelum `</main>`)

```html
<!-- KEY INSIGHTS + NEXT STEPS -->
<section class="grid grid-cols-2 gap-3.5">
  <div class="dark-card fade-in p-4">
    <p class="flex items-center gap-2 text-[13px] font-bold text-white">
      <i data-lucide="lightbulb" class="h-4 w-4 text-amber-300"></i>Key Insights</p>
    <ul class="mt-2.5 space-y-2 text-[11.5px] leading-relaxed text-slate-200">
      <li class="flex gap-2"><i data-lucide="circle-check" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400"></i>Total waste utilized YTD mencapai 76%, tumbuh 22% YoY.</li>
      <li class="flex gap-2"><i data-lucide="circle-check" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400"></i>ANTAM dan INALUM menjadi kontributor utama revenue dari waste valorization.</li>
      <li class="flex gap-2"><i data-lucide="triangle-alert" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"></i>Utilisasi red mud INALUM masih di bawah target holding.</li>
      <li class="flex gap-2"><i data-lucide="circle-check" class="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400"></i>Potensi revenue terbesar dari slag dan tailings recovery.</li>
    </ul>
  </div>
  <div class="dark-card fade-in flex flex-col p-4">
    <p class="flex items-center gap-2 text-[13px] font-bold text-white">
      <i data-lucide="target" class="h-4 w-4 text-green-300"></i>Next Steps</p>
    <ol class="mt-2.5 flex-1 space-y-2 text-[11.5px] leading-relaxed text-slate-200">
      <li class="flex gap-2"><span class="grid shrink-0 place-items-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-300" style="height:18px;width:18px">1</span>Scale up slag processing (ANTAM).</li>
      <li class="flex gap-2"><span class="grid shrink-0 place-items-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-300" style="height:18px;width:18px">2</span>Optimize material recovery from tailings (ANTAM).</li>
      <li class="flex gap-2"><span class="grid shrink-0 place-items-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-300" style="height:18px;width:18px">3</span>Accelerate red mud utilization (INALUM).</li>
      <li class="flex gap-2"><span class="grid shrink-0 place-items-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-300" style="height:18px;width:18px">4</span>Explore strategic partner for tin slag (TIMAH).</li>
      <li class="flex gap-2"><span class="grid shrink-0 place-items-center rounded-full bg-green-500/25 text-[9px] font-bold text-green-300" style="height:18px;width:18px">5</span>Implement waste tracking system company-wide.</li>
    </ol>
    <button class="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-green-600 px-5 py-1.5 text-[11px] font-bold text-white shadow-md shadow-green-600/30 transition hover:bg-green-700">View Action Plan <i data-lucide="arrow-right" class="h-3.5 w-3.5"></i></button>
  </div>
</section>
```

---

## 4. Catatan

- Isi teks Key Insights di atas masih **draft** — silakan disesuaikan.
- Ikon `circle-check`, `triangle-alert`, `lightbulb`, `target` sudah dipakai di
  production mockup (nama lucide versi terbaru).
- Setelah disetujui, file template ini bisa dihapus.
