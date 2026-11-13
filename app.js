/**
 * ===================================================================
 * APP.JS - SISTEM ABSENSI SEKOLAH
 * Frontend Logic & REST API Wrapper
 * ===================================================================
 */

// ===============================================
// 1. KONFIGURASI WEB APP URL 
// ===============================================
// WAJIB GANTI URL DI BAWAH INI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyQHq9Gw2aUajk2s9yhEQ8P7tlUAFxP7MmT4gIWkRNEJUC17t67Ot3aqVyHaY5J_6Zeeg/exec'; 
const SCAN_PAGE_URL = 'https://sdn1-sumbermulya.github.io/absen.html';

// ===============================================
// 2. FUNGSI FETCH (PENGGANTI google.script.run)
// ===============================================
async function fetchAPI(action, payload = {}) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            // Gunakan text/plain untuk menghindari error preflight CORS di browser
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: action, data: payload })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("API Error:", error);
        throw new Error('Gagal menghubungi server. Periksa koneksi internet Anda.');
    }
}

// ===============================================
// 3. GLOBAL VARIABLES
// ===============================================
let TOKEN = null;
let html5QrCode = null;
let chartAbsensi = null;
let chartJumlahSiswa = null;
let dataSemuaSiswa = [];
let sheetPengaturan = {};
let jumlahTotalSiswa = 0;
let dataSiswaGlobal = [];
let halamanSaatIni = 1;
let siswaPerHalaman = 10;
const qrCache = {};

// ===============================================
// 4. INIT / BOOTSTRAP APP (DOM Content Loaded)
// ===============================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Cek Token Login
    const savedToken = sessionStorage.getItem('loginToken');
    if (savedToken) {
        try {
            const res = await fetchAPI('checkSession', { token: savedToken });
            if (res.success) {
                TOKEN = savedToken;
                showApp(res.nama, res.role);
            } else {
                sessionStorage.removeItem('loginToken');
                sessionStorage.removeItem('activeTab');
                showLoginScreen();
            }
        } catch(e) {
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }

    // 2. Listener Password Enter
    document.getElementById('passuser').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // 3. Setup Tanggal Default
    const today = new Date();
    document.getElementById('manual-tanggal').valueAsDate = today;
    document.getElementById('tanggal').valueAsDate = today;

    // 4. Setup Navigasi Tab
    initTabs();

    // 5. Setup Listener Data Siswa
    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'tampilPerHalaman') {
            siswaPerHalaman = parseInt(e.target.value, 10);
            renderTabelSiswa();
        }
    });

    document.getElementById('filter-kelas').addEventListener('change', function() {
        const val = this.value;
        if (val === '') {
            tabelSiswa(dataSemuaSiswa);
            return;
        }
        const hasil = dataSemuaSiswa.filter(s => String(s.kelas || '').includes(val));
        tabelSiswa(hasil);
    });

    document.getElementById('cariSiswa').addEventListener('input', function () {
        const keyword = this.value.toLowerCase().trim();
        if (keyword === '') {
            tabelSiswa(dataSemuaSiswa);
            return;
        }
        const hasil = dataSemuaSiswa.filter(s => {
            return String(s.nama || '').toLowerCase().includes(keyword) ||
                   String(s.id || '').includes(keyword) ||
                   String(s.nis || '').includes(keyword);
        });
        tabelSiswa(hasil);
    });

    // 6. Setup PDF Download Listener
    document.getElementById("downloadPDF").addEventListener("click", downloadKartuPDF);
});

// ===============================================
// 5. AUTH & APP VISIBILITY
// ===============================================
function showLoginScreen() {
    setTimeout(() => {
        const loader = document.getElementById('loader');
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
        }, 500);
    }, 1000);
}

function showApp(nama, role) {
    // Jalankan pengambilan data inti berurutan
    getSemuaSiswa('', () => {
        loadDaftarKelas();
        //loadSiswaBelumAbsen();
    });
    bukaSetting();
    //loadJumlahStatus();

    document.getElementById('loader').classList.add('hidden');
    
    // Tampilkan Tab Terakhir
    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab) {
        const activeTabBtn = document.querySelector(`[aria-controls="${savedTab.trim()}"]`);
        if(activeTabBtn) activeTabBtn.click();
    }
    
    // Header Info
    const words = nama ? nama.split(/\s+/) : ["Admin"];
    const initials = words.length >= 2 ? words[0].charAt(0) + words[1].charAt(0) : words[0].substring(0, 2);
    document.getElementById('user-avatar').innerText = initials.toUpperCase();
    document.getElementById('user-name-display').innerText = words.join(" ");
    document.getElementById('user-role-display').innerText = role || "Administrator";
    
    // Transisi masuk dashboard
    setTimeout(() => {
        document.getElementById('login-screen').classList.add('hidden');
        const dashboard = document.getElementById('dashboard-wrapper');
        dashboard.classList.remove('hidden');
        dashboard.classList.add('flex');
    }, 500);
}

async function handleLogin() {
    const username = document.getElementById('namauser').value.trim();
    const password = document.getElementById('passuser').value;
    const btn = document.getElementById('login-btn');
    const btnText = document.getElementById('login-text');
    const btnIcon = document.getElementById('login-icon');

    if (!username || !password) {
        showToast('Username dan password wajib diisi.', 'error');
        return;
    }

    btnText.textContent = 'Memproses...';
    btnIcon.className = 'ph ph-spinner animate-spin text-lg mr-3';
    btn.disabled = true;

    try {
        const res = await fetchAPI('login', { username, password });
        if (res.success) {
            TOKEN = res.token;
            sessionStorage.setItem('loginToken', TOKEN);
            showApp(res.nama, res.role);
            btnText.textContent = 'Login Berhasil';
            btnIcon.className = 'ph ph-check-circle text-lg mr-3';
        } else {
            showToast(res.message, 'error');
            btnText.textContent = 'Masuk Sekarang';
            btnIcon.className = 'ph ph-sign-in text-lg mr-3';
        }
    } catch (err) {
        showToast(err.message, 'error');
        btnText.textContent = 'Masuk Sekarang';
        btnIcon.className = 'ph ph-sign-in text-lg mr-3';
    }
    btn.disabled = false;
}

function showLogoutConfirm() {
    const modal = document.getElementById('logout-confirm');
    const content = document.getElementById('logout-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    void modal.offsetWidth; // trigger reflow
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
}

function hideLogoutConfirm() {
    const modal = document.getElementById('logout-confirm');
    const content = document.getElementById('logout-modal-content');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

async function executeLogout() {
    hideLogoutConfirm();
    setTimeout(() => {
        const dashboard = document.getElementById('dashboard-wrapper');
        dashboard.classList.add('hidden');
        dashboard.classList.remove('flex');
        
        const loginScreen = document.getElementById('login-screen');
        loginScreen.classList.remove('hidden');
        
        document.getElementById('login-text').textContent = 'Masuk Sekarang';
        document.getElementById('login-icon').className = 'ph ph-sign-in text-lg mr-3';

        if (window.innerWidth < 768 && !document.getElementById('sidebar').classList.contains('hidden')) {
            toggleSidebar();
        }
    }, 300);
    
    // Background logout
    fetchAPI('logout', { token: TOKEN }).catch(console.error);
    
    sessionStorage.removeItem('loginToken');
    sessionStorage.removeItem('activeTab');
    TOKEN = null;
    
    if (html5QrCode) {
        html5QrCode.stop().catch(() => {});
    }
}

// ===============================================
// 6. UI & NAVIGATION HELPERS
// ===============================================
function initTabs() {
    const tabs = document.querySelectorAll('[role="tab"]');
    const tabPanels = document.querySelectorAll('[role="tabpanel"]');
    const headerTitle = document.getElementById('header-title');
    document.getElementById('subheader').textContent = document.title;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.setAttribute('aria-selected', 'false');
                t.classList.remove('bg-green-800', 'text-white', 'border-green-400', 'shadow-sm');
                t.classList.add('text-green-100', 'border-transparent');
            });

            tab.setAttribute('aria-selected', 'true');
            tab.classList.remove('text-green-100', 'border-transparent');
            tab.classList.add('bg-green-800', 'text-white', 'border-green-400', 'shadow-sm');
            headerTitle.textContent = tab.innerText.trim();

            tabPanels.forEach(panel => panel.classList.add('hidden'));

            const targetPanelId = tab.getAttribute('aria-controls');
            const targetPanel = document.getElementById(targetPanelId);
            if (targetPanel) {
                targetPanel.classList.remove('hidden');
                sessionStorage.setItem('activeTab', targetPanelId);

                targetPanel.style.opacity = '0';
                targetPanel.style.transform = 'translateY(10px)';
                setTimeout(() => {
                    targetPanel.style.transition = 'all 0.3s ease-out';
                    targetPanel.style.opacity = '1';
                    targetPanel.style.transform = 'translateY(0)';
                }, 10);
            }

            if (window.innerWidth < 768) {
                const sidebar = document.getElementById('sidebar');
                if (!sidebar.classList.contains('hidden')) toggleSidebar();
            }
        });
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('flex', 'fixed', 'inset-y-0', 'left-0', 'z-40');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('flex', 'fixed', 'inset-y-0', 'left-0', 'z-40');
        overlay.classList.add('hidden');
    }
}

window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        sidebar.classList.remove('hidden', 'fixed', 'inset-y-0', 'left-0', 'z-40');
        sidebar.classList.add('flex', 'relative');
        overlay.classList.add('hidden');
    } else {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('relative')) {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex', 'relative');
        }
    }
});

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-message');
    const toast = document.createElement('div');
    
    let bgColor = 'bg-green-900';
    let icon = 'ph-check-circle text-green-400';
    if (type === 'error') { icon = 'ph-x-circle text-red-400'; bgColor = 'bg-red-900'; }
    if (type === 'warning') { icon = 'ph-warning text-orange-400'; bgColor = 'bg-orange-900'; }
    if (type === 'info') { icon = 'ph-info text-blue-400'; bgColor = 'bg-blue-900'; }
    
    toast.className = `w-80 fixed bottom-5 right-5 ${bgColor} text-white px-5 py-3 rounded-lg shadow-lg transform transition-all duration-300 z-[9999] flex items-center`;
    toast.innerHTML = `<i class="mr-3 text-2xl ph-fill ${icon}"></i> <span class="text-sm font-medium">${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showAlert({
    type = "info",
    title = "Informasi",
    message = "",
    okText = "OK",
    cancelText = "Batal",
    showCancel = false,
    onOk = null,
    onCancel = null
} = {}) {
    const modal = document.getElementById("alertModal");
    const box = document.getElementById("alertBox");
    const iconBox = document.getElementById("alertIcon");
    const icon = iconBox.querySelector("i");
    const titleEl = document.getElementById("alertTitle");
    const messageEl = document.getElementById("alertMessage");
    const okBtn = document.getElementById("alertOk");
    const cancelBtn = document.getElementById("alertCancel");

    const config = {
        success: { icon: "ph ph-check-circle", iconClass: "bg-green-100 text-green-600", buttonClass: "bg-green-600 hover:bg-green-700" },
        error: { icon: "ph ph-x-circle", iconClass: "bg-red-100 text-red-600", buttonClass: "bg-red-600 hover:bg-red-700" },
        warning: { icon: "ph ph-warning", iconClass: "bg-yellow-100 text-yellow-600", buttonClass: "bg-yellow-500 hover:bg-yellow-600" },
        info: { icon: "ph ph-info", iconClass: "bg-blue-100 text-blue-600", buttonClass: "bg-blue-600 hover:bg-blue-700" },
        question: { icon: "ph ph-question", iconClass: "bg-green-100 text-green-600", buttonClass: "bg-green-600 hover:bg-green-700" }
    };

    const selected = config[type] || config.info;

    iconBox.className = "flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center " + selected.iconClass;
    icon.className = "text-2xl " + selected.icon;
    okBtn.className = "rounded-lg px-6 py-2 text-sm font-semibold text-white transition shadow-sm " + selected.buttonClass;

    titleEl.textContent = title;
    messageEl.innerHTML = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    if (showCancel) cancelBtn.classList.remove("hidden");
    else cancelBtn.classList.add("hidden");

    okBtn.onclick = function () {
        closeAlert();
        if (typeof onOk === "function") onOk();
    };

    cancelBtn.onclick = function () {
        closeAlert();
        if (typeof onCancel === "function") onCancel();
    };

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    setTimeout(() => {
        box.classList.remove("scale-95");
        box.classList.add("scale-100");
    }, 10);
}

function closeAlert() {
    const modal = document.getElementById("alertModal");
    const box = document.getElementById("alertBox");
    box.classList.remove("scale-100");
    box.classList.add("scale-95");
    setTimeout(() => {
        modal.classList.remove("flex");
        modal.classList.add("hidden");
    }, 200);
}

function openScanPage() {
    const scanner = window.open(SCAN_PAGE_URL + '?token=' + encodeURIComponent(TOKEN), '_blank');
    if (!scanner) showAlert({ type: 'warning', title: 'Popup Diblokir', message: 'Browser memblokir tab baru. Izinkan pop-up terlebih dahulu.' });
}

// ===============================================
// 7. PENGATURAN LOGIC
// ===============================================
async function bukaSetting() {
    try {
        const res = await fetchAPI('getSetting', { token: TOKEN });
        if (res.success) {
            sheetPengaturan = res;
            document.getElementById('namaSekolah').value = res.namaSekolah || '';
            document.getElementById('npsn').value = res.npsn || '';
            document.getElementById('kepalaSekolah').value = res.kepalaSekolah || '';
            document.getElementById('nip').value = res.nip || '';
            document.getElementById('batasTelat').value = res.batasTelat || '';
            
            document.getElementById('tnamaSekolah').textContent = res.namaSekolah || '-';
            document.getElementById('tnpsn').textContent = res.npsn || '-';
            document.getElementById('tkepalaSekolah').textContent = res.kepalaSekolah || '-';
            document.getElementById('tnip').textContent = res.nip || '-';
        }
    } catch (err) {
        console.error("Gagal load pengaturan", err);
    }
}

async function simpanSetting() {
    const data = {
        namaSekolah: document.getElementById('namaSekolah').value.trim(),
        npsn: document.getElementById('npsn').value.trim(),
        kepalaSekolah: document.getElementById('kepalaSekolah').value.trim(),
        nip: document.getElementById('nip').value.trim(),
        batasTelat: document.getElementById('batasTelat').value.trim()
    };

    if (!data.namaSekolah || !data.npsn || !data.kepalaSekolah || !data.nip || !data.batasTelat) {
        showToast('Isi bagian yang masih kosong!', 'error');
        return;
    }
    
    const btn = document.getElementById('btnSaveSetting');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin mr-2"></i>Menyimpan...`;
    btn.disabled = true;
    
    try {
        const res = await fetchAPI('updateSetting', { token: TOKEN, data: data });
        if (res.success) {
            showToast('Pengaturan Tersimpan!', 'success');
            bukaSetting(); 
        } else {
            showToast('Gagal: ' + res.message, 'error');
        }
    } catch (err) {
        showToast('Terjadi kesalahan koneksi.', 'error');
    }
    btn.innerHTML = originalText;
    btn.disabled = false;
}

// ===============================================
// 8. DATA SISWA LOGIC
// ===============================================
async function getSemuaSiswa(kelas, callback) {
    document.getElementById('loadtabel').classList.remove('hidden');
    try {
        const res = await fetchAPI('getSemuaSiswa', { token: TOKEN, kelas: kelas });
        if (res.success) {
            jumlahTotalSiswa = res.jumlahSiswa;
            dataSemuaSiswa = res.data;
            tabelSiswa(dataSemuaSiswa);
            renderChartJumlahSiswa();
            if (typeof callback === 'function') callback();
        } else {
            showToast(res.message, 'error');
        }
    } catch(err) {
        showToast('Gagal mengambil data siswa.', 'error');
        console.log(err);
    }
    document.getElementById('loadtabel').classList.add('hidden');
}

function tabelSiswa(data) {
    dataSiswaGlobal = data || [];
    halamanSaatIni = 1;
    renderTabelSiswa();
}

function renderTabelSiswa() {
    const table = document.querySelector('#dataSiswa');
    const btnTampilSemua = document.getElementById('tampilSemuaQR');
    
    const totalData = dataSiswaGlobal.length;
    const totalHalaman = Math.ceil(totalData / siswaPerHalaman);

    if (halamanSaatIni > totalHalaman && totalHalaman > 0) halamanSaatIni = totalHalaman;

    table.innerHTML = `
        <thead class="bg-green-800 text-white">
            <tr class="h-10">
                <th scope="col" class="px-4 py-2 text-left text-sm font-semibold border-r border-green-700">NO</th>
                <th scope="col" class="px-4 py-2 text-left text-sm font-semibold border-r border-green-700">Nama Siswa</th>
                <th scope="col" class="px-4 py-2 text-left text-sm font-semibold border-r border-green-700">ID / QR</th>
                <th scope="col" class="px-4 py-2 text-left text-sm font-semibold border-r border-green-700">L/P</th>
                <th scope="col" class="px-4 py-2 text-left text-sm font-semibold border-r border-green-700">Kelas</th>
                <th scope="col" class="px-4 py-2 text-left text-sm font-semibold">Aksi</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white"></tbody>
    `;

    const tbody = table.querySelector('tbody');

    if (totalData === 0) {
        btnTampilSemua.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-sm text-gray-500">Tidak ada data ditemukan.</td></tr>`;
        renderPagination(0);
        return;
    }

    btnTampilSemua.classList.remove('hidden');

    const mulai = (halamanSaatIni - 1) * siswaPerHalaman;
    const akhir = mulai + siswaPerHalaman;
    const dataHalaman = dataSiswaGlobal.slice(mulai, akhir);

    const capitalizeWords = (text) => String(text || '').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

    dataHalaman.forEach((s, index) => {
        const nomor = mulai + index + 1;
        const tr = document.createElement('tr');
        tr.className = index % 2 === 0 ? "bg-gray-50" : "bg-white";
        
        const cssjk = s.jk === "L" ? "bg-blue-100 text-blue-800" : "bg-pink-100 text-pink-800";
        const jk = s.jk === "L" ? "Laki - Laki" : "Perempuan";
        const nis = s.nis ? s.nis : "-";

        tr.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-700 border-r border-gray-100 font-medium">${nomor}</td>
            <td class="px-4 py-3 border-r border-gray-100">
                <div class="text-sm font-bold text-gray-900">${capitalizeWords(s.nama)}</div>
                <div class="text-xs text-gray-500 mt-0.5">NIS: ${nis}</div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600 border-r border-gray-100 font-mono">${s.id}</td>
            <td class="px-4 py-3 text-sm border-r border-gray-100">
                <span class="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${cssjk}">${jk}</span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-700 border-r border-gray-100 font-medium">${s.kelas}</td>
            <td class="px-4 py-3 text-sm">
                <button onclick="showQR('${s.id}', '${s.nama}', '${s.jk}', '${s.kelas}')" class="inline-flex items-center px-3 py-1.5 border border-green-700 shadow-sm text-xs font-semibold rounded-md text-green-800 bg-white hover:bg-green-50 focus:outline-none transition-colors">
                    <i class="mr-1.5 ph ph-qr-code text-base"></i>Lihat QR
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination(totalData);
}

function renderPagination(totalData) {
    const totalHalaman = Math.ceil(totalData / siswaPerHalaman);
    const container = document.getElementById('paginationContainer');
    
    if (totalData === 0) {
        container.innerHTML = '';
        return;
    }

    const mulaiData = (halamanSaatIni - 1) * siswaPerHalaman + 1;
    const akhirData = Math.min(halamanSaatIni * siswaPerHalaman, totalData);
    const pilihanValue = [10, 20, 30, 50, 100];

    const selectHtml = `
        <div class="flex items-center space-x-2">
            <span class="text-xs text-gray-500">Tampil:</span>
            <select id="tampilPerHalaman" class="text-xs border-gray-300 rounded-md py-1 pl-2 pr-6 focus:ring-green-900 focus:border-green-900">
                ${pilihanValue.map(jml => `<option value="${jml}" ${jml === siswaPerHalaman ? 'selected' : ''}>${jml}</option>`).join('')}
            </select>
        </div>
    `;

    const infoHtml = `<div class="text-xs text-gray-500">Menampilkan <span class="font-medium text-gray-900">${mulaiData} - ${akhirData}</span> dari <span class="font-medium text-gray-900">${totalData}</span></div>`;

    const btnPrev = `<button onclick="gantiHalaman(${halamanSaatIni - 1})" ${halamanSaatIni === 1 ? 'disabled' : ''} class="relative inline-flex items-center rounded-l-md px-2 py-1.5 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:bg-gray-100 disabled:text-gray-300"><i class="ph ph-caret-left"></i></button>`;
    const btnNext = `<button onclick="gantiHalaman(${halamanSaatIni + 1})" ${halamanSaatIni === totalHalaman ? 'disabled' : ''} class="relative inline-flex items-center rounded-r-md px-2 py-1.5 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:bg-gray-100 disabled:text-gray-300"><i class="ph ph-caret-right"></i></button>`;

    container.innerHTML = `
        <div class="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div class="flex flex-1 justify-between sm:hidden">
                <button onclick="gantiHalaman(${halamanSaatIni - 1})" ${halamanSaatIni === 1 ? 'disabled' : ''} class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Previous</button>
                <button onclick="gantiHalaman(${halamanSaatIni + 1})" ${halamanSaatIni === totalHalaman ? 'disabled' : ''} class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Next</button>
            </div>
            <div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div class="flex items-center gap-4">
                    ${selectHtml}
                    ${infoHtml}
                </div>
                <div>
                    <nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        ${btnPrev}
                        ${buatTombolHalaman(totalHalaman)}
                        ${btnNext}
                    </nav>
                </div>
            </div>
        </div>
    `;
}

function buatTombolHalaman(totalHalaman) {
    const aktif = halamanSaatIni;
    const halamanTampil = new Set();

    for (let i = 1; i <= Math.min(3, totalHalaman); i++) halamanTampil.add(i);
    for (let i = Math.max(1, totalHalaman - 1); i <= totalHalaman; i++) halamanTampil.add(i);
    for (let i = Math.max(1, aktif - 1); i <= Math.min(totalHalaman, aktif + 1); i++) halamanTampil.add(i);

    const nomor = [...halamanTampil].sort((a, b) => a - b);
    let html = '';

    for (let i = 0; i < nomor.length; i++) {
        const n = nomor[i];
        const sebelumnya = nomor[i - 1];
        if (sebelumnya !== undefined && n - sebelumnya > 1) {
            if (n - sebelumnya === 2) {
                html += buatTombolNomor(sebelumnya + 1, aktif);
            } else {
                html += `<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">...</span>`;
            }
        }
        html += buatTombolNomor(n, aktif);
    }
    return html;
}

function buatTombolNomor(n, aktif) {
    if (n === aktif) {
        return `<button onclick="gantiHalaman(${n})" aria-current="page" class="relative z-10 inline-flex items-center bg-green-800 px-3.5 py-2 text-sm font-semibold text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-900">${n}</button>`;
    }
    return `<button onclick="gantiHalaman(${n})" class="relative inline-flex items-center px-3.5 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0">${n}</button>`;
}

function gantiHalaman(halaman) {
    const totalHalaman = Math.ceil(dataSiswaGlobal.length / siswaPerHalaman);
    if (halaman < 1 || halaman > totalHalaman) return;
    halamanSaatIni = halaman;
    renderTabelSiswa();
    document.querySelector('#dataSiswa')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===============================================
// 9. QR CODE & KARTU PELAJAR
// ===============================================
function showQR(nisn, nama, jk, kelas) {
    document.getElementById('qr-nama-siswa').innerText = nama;
    const cacheKey = `${nisn}|${nama}|${jk}|${kelas}`;
    let qrUrl = qrCache[cacheKey] || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(nisn)}`;
    if (!qrCache[cacheKey]) qrCache[cacheKey] = qrUrl;

    const qrDisplay = document.getElementById('qrcode-display');
    qrDisplay.innerHTML = `<img src="${qrUrl}" width="300" height="300" alt="QR Code" class="rounded-lg shadow-sm border border-gray-200">`;
    document.getElementById('modalQR').classList.remove('hidden');
}

function closeModalQR() {
    document.getElementById('modalQR').classList.add('hidden');
}

async function downloadQR() {
    const img = document.querySelector('#qrcode-display img');
    if (!img) return showToast('QR Code belum tersedia.', 'error');

    try {
        const response = await fetch(img.src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const nama = document.getElementById('qr-nama-siswa').innerText.replace(/\s+/g, '_');
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${nama}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        showToast('Gagal mendownload QR Code.', 'error');
    }
}

function tampilkanSemuaQR() {
    const modal = document.getElementById('modalSemuaQR');
    const container = document.getElementById('containerSemuaQR');
    const mulai = (halamanSaatIni - 1) * siswaPerHalaman;
    const akhir = mulai + siswaPerHalaman;
    const dataHalaman = dataSiswaGlobal.slice(mulai, akhir);

    if (dataHalaman.length === 0) {
        container.innerHTML = `<div class="col-span-full py-10 text-center text-sm text-gray-500">Tidak ada data siswa untuk dicetak.</div>`;
        modal.classList.remove('hidden');
        return;
    }

    const capitalizeWords = (text) => String(text || '').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

    container.innerHTML = dataHalaman.map(s => {
        const id = String(s.id || '');
        const nama = capitalizeWords(s.nama || '-');
        const nis = s.nis || '-';
        const jk = s.jk === "L" ? "Laki - Laki" : "Perempuan";
        const kelas = s.kelas || '-';
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(id)}`;
        const urlDinas ='https://sdn1-sumbermulya.github.io/images/oki.svg';
        const urlSekolah ='https://sdn1-sumbermulya.github.io/images/logo.svg';

        return `
        <div class="id-card rounded-lg shadow-md bg-black border border-gray-400 relative overflow-hidden box-border font-sans flex flex-col mt-4 break-inside-avoid" style="page-break-inside:avoid; width: 100%; aspect-ratio: 8.5/5.5;">
            <!-- HEADER -->
            <div class="flex justify-between items-center px-3 py-2 border-b border-white/20">
                <img class="w-8 h-8 sm:w-10 sm:h-10 object-contain" src="${urlDinas}" alt="Dinas">
                <div class="flex-1 px-2 text-center flex flex-col justify-center">
                    <span class="text-[7px] sm:text-[9px] font-bold text-white leading-tight tracking-widest">PEMERINTAH KABUPATEN OGAN KOMERING ILIR</span>
                    <span class="text-[8px] sm:text-[10px] font-bold text-white leading-tight tracking-widest">DINAS PENDIDIKAN</span>
                    <span class="text-[10px] sm:text-xs font-extrabold text-white leading-tight uppercase tracking-widest">${sheetPengaturan.namaSekolah || 'SDN 1 SUMBER MULYA'}</span>
                    <span class="text-[6px] sm:text-[7px] text-slate-200 leading-tight">Alamat: Ds. Sumber Mulya Kec. Mesuji Makmur Kab. OKI 30681</span>
                </div>
                <img class="w-8 h-8 sm:w-10 sm:h-10 object-contain" src="${urlSekolah}" alt="Logo Sekolah">
            </div>
            
            <div class="text-center text-[9px] sm:text-[11px] font-bold uppercase tracking-widest mb-1 text-white pt-2">
                <span class="border-b border-white pb-0.5">Kartu Pelajar</span>
            </div>
            
            <div class="flex px-4 pb-3 flex-1 gap-4 items-center">
                <div class="bg-white border-2 border-gray-300 flex-shrink-0 w-[80px] h-[80px] sm:w-[90px] sm:h-[90px] p-1 rounded-md shadow-sm">
                    <img src="${qrUrl}" alt="QR" class="object-contain w-full h-full">
                </div>
                
                <div class="flex-1 w-full pt-1">
                    <table class="w-full text-[8px] sm:text-[10px] leading-snug text-white">
                        <tbody>
                            <tr><td class="w-[55px] sm:w-[65px] font-semibold text-blue-100">Nama</td><td class="w-[5px] text-blue-200">:</td><td class="font-bold text-white">${nama}</td></tr>
                            <tr><td class="font-semibold text-blue-100">NIS/NISN</td><td class="text-blue-200">:</td><td class="font-semibold text-gray-100">${nis} / ${id}</td></tr>
                            <tr><td class="font-semibold text-blue-100">L/P</td><td class="text-blue-200">:</td><td class="text-gray-100">${jk}</td></tr>
                            <tr><td class="font-semibold text-blue-100">Kelas</td><td class="text-blue-200">:</td><td class="text-gray-100">${kelas}</td></tr>
                        </tbody>
                    </table>
                    
                    <div class="mt-2 flex justify-end">
                        <div class="text-center text-[7px] sm:text-[8px] leading-tight mr-2 text-blue-100">
                            <p>Sumber Mulya, 15 Juli 2026</p>
                            <p class="mb-5 sm:mb-6">Kepala Sekolah,</p>
                            <p class="font-bold text-white inline-block relative border-b border-white pb-0.5">${sheetPengaturan.kepalaSekolah || 'Priyanto, S.Pd.SD'}</p>
                            <p class="mt-1">NIP. ${sheetPengaturan.nip || '-'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function tutupModalQR() {
    document.getElementById('modalSemuaQR').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function printDiv(divId) {
    const content = document.getElementById(divId).innerHTML;
    const printWindow = window.open("", "_blank");
    const urlBG ='https://sdn1-sumbermulya.github.io/images/bg_kartu.jpg';

    if (!printWindow) return showToast('Popup diblokir. Izinkan popup untuk mencetak.', 'error');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Cetak Kartu Pelajar</title>
            <script src="https://cdn.tailwindcss.com"><\/script>
            <style>
                body { background: #52525b; display: flex; justify-content: center; padding: 20px 0; }
                .page { width: 210mm; min-height: 297mm; background: #fff; padding: 12mm 10mm; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
                .id-card { background-image: url('${urlBG}'); background-size: cover; background-position: center; border: 1px solid #333 !important; }
                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    html, body { margin: 0; padding: 0; background: #fff; display: block; }
                    .page { margin: 0 auto; box-shadow: none; width: 100%; height: 100%; padding: 10mm; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="grid grid-cols-2 gap-4">${content}</div>
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    function doPrint() {
        printWindow.focus();
        setTimeout(() => printWindow.print(), 800);
    }

    const images = printWindow.document.images;
    if (images.length === 0) return doPrint();
    
    let loaded = 0;
    for (const img of images) {
        if (img.complete) {
            loaded++;
            if (loaded === images.length) doPrint();
        } else {
            img.onload = img.onerror = () => {
                loaded++;
                if (loaded === images.length) doPrint();
            };
        }
    }
}

async function downloadKartuPDF(e) {
    e.preventDefault();
    const button = this;
    const container = document.getElementById("containerSemuaQR"); 
    const originalText = button.innerHTML;
    
    button.disabled = true;
    button.innerHTML = `<i class="ph ph-spinner animate-spin mr-2 text-lg"></i>Memproses...`;
    
    const options = {
        margin: [10, 10, 10, 10],
        filename: "Kartu_Pelajar.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] } 
    };

    try {
        await html2pdf().set(options).from(container).save();
    } catch (error) {
        showToast('Gagal membuat PDF: ' + error, 'error');
    }
    button.innerHTML = originalText;
    button.disabled = false;
}

// ===============================================
// 10. MANUAL ABSENSI
// ===============================================
async function loadDaftarKelas() {
    try {
        const res = await fetchAPI('getDaftarKelas', {});
        if (!res.success) return;
        ['filter-kelas', 'filterManual', 'kelas'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.innerHTML = '<option value="">Semua Kelas</option>';
                res.data.forEach(k => select.innerHTML += `<option value="${k}">Kelas ${k}</option>`);
            }
        });
    } catch (err) {}
}

document.getElementById('btnfilter').addEventListener('click', async function() {
    const kelas = document.getElementById('filterManual').value.trim();
    const tanggal = document.getElementById('manual-tanggal').value;
    const loadmanual = document.getElementById('loadmanual');
    const tabel = document.getElementById('dataManual');
    const btn = this;

    if (!tanggal) return showToast('Pilih tanggal dulu.', 'warning');
    
    const oriHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin mr-2"></i>Loading...`;
    loadmanual.classList.remove('hidden');
    tabel.classList.add('opacity-50');

    try {
        const res = await fetchAPI('getSiswaBelumAbsen', { token: TOKEN, tanggal, kelas });
        if (res.success) {
            renderManualTable(res.data || [], tanggal);
            if(res.data.length === 0) showToast(`Semua siswa ${kelas ? 'kelas '+kelas : ''} sudah absen.`, 'info');
        } else {
            showToast(res.message, 'error');
        }
    } catch (err) {
        showToast('Gagal menarik data manual.', 'error');
    }

    loadmanual.classList.add('hidden');
    tabel.classList.remove('opacity-50');
    btn.innerHTML = oriHtml;
    btn.disabled = false;
});

function renderManualTable(data, tanggal) {
    const table = document.querySelector('#dataManual');
    const btnAlfa = document.getElementById('btnAlfa');
    
    table.innerHTML = `
        <thead class="bg-gray-100">
            <tr class="h-10">
                <th class="px-4 py-2 text-left text-sm font-semibold text-gray-800 border-r border-gray-200">Nama Siswa & NIS</th>
                <th class="px-4 py-2 text-center text-sm font-semibold text-gray-800 border-r border-gray-200">L/P</th>
                <th class="px-4 py-2 text-center text-sm font-semibold text-gray-800 border-r border-gray-200">Kelas</th>
                <th class="px-4 py-2 text-left text-sm font-semibold text-gray-800 border-r border-gray-200">Ubah Status</th>
                <th class="px-4 py-2 text-center text-sm font-semibold text-gray-800">Aksi</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white"></tbody>
    `;
    
    const tbody = table.querySelector('tbody');

    if (data.length === 0) {
        btnAlfa.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-sm text-gray-500"><i class="ph ph-check-circle text-4xl text-green-300 mb-2 block"></i>Semua data absen hari ini sudah terisi.</td></tr>`;
        return;
    }

    btnAlfa.classList.remove('hidden');
    btnAlfa.dataset.tanggal = tanggal;

    const capitalizeWords = (text) => String(text || '').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

    data.forEach((s, index) => {
        const tr = document.createElement('tr');
        tr.className = index % 2 === 0 ? "bg-white" : "bg-gray-50";
        const cssjk = s.jk === "L" ? "bg-blue-100 text-blue-800" : "bg-pink-100 text-pink-800";
        
        tr.innerHTML = `
            <td class="px-4 py-3 border-r border-gray-100">
                <div class="text-sm font-bold text-gray-900">${capitalizeWords(s.nama)}</div>
                <div class="text-xs text-gray-500 mt-0.5">NIS: ${s.nis || '-'} | ID: ${s.id}</div>
            </td>
            <td class="px-4 py-3 text-center border-r border-gray-100">
                <span class="inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${cssjk}">${s.jk === "L" ? "L" : "P"}</span>
            </td>
            <td class="px-4 py-3 text-center text-sm font-medium text-gray-700 border-r border-gray-100">${s.kelas}</td>
            <td class="px-4 py-3 border-r border-gray-100 w-40">
                <select id="status-${s.id}" class="block w-full border-gray-300 rounded-md text-sm focus:ring-green-900 focus:border-green-900 py-1.5">
                    <option value="Alfa">Alfa</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Izin">Izin</option>
                </select>
            </td>
            <td class="px-4 py-3 text-center w-32">
                <button onclick="simpanStatusManual('${s.id}', '${tanggal}')" class="inline-flex items-center justify-center w-full px-3 py-1.5 border border-transparent shadow-sm text-xs font-semibold rounded-md text-white bg-green-700 hover:bg-green-800 transition">
                    <i class="ph-fill ph-floppy-disk mr-1.5"></i>Simpan
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ===============================================
// 11. CHARTS & STATS
// ===============================================
function renderChartJumlahSiswa() {
    const jumlahPerKelas = {};
    dataSemuaSiswa.forEach(s => {
        const k = String(s.kelas || '').trim();
        if(k) jumlahPerKelas[k] = (jumlahPerKelas[k] || 0) + 1;
    });

    const kelas = Object.keys(jumlahPerKelas).sort();
    const jumlah = kelas.map(k => jumlahPerKelas[k]);
    const warnaKelas = ['#12542B', '#1C7D41', '#25A757', '#2ED16C', '#58DA8A', '#82E3A7', '#ABEDC4', '#D5F6E2'];
    const bgColors = kelas.map((_, i) => warnaKelas[i % warnaKelas.length]);

    const ctx = document.getElementById('ChartJumlahSiswa');
    if (chartJumlahSiswa) chartJumlahSiswa.destroy();

    chartJumlahSiswa = new Chart(ctx, {
        type: 'bar',
        data: { labels: kelas, datasets: [{ label: 'Siswa', data: jumlah, backgroundColor: bgColors, borderRadius: 4 }] },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function updateChartAbsensi(jumlahTotal, jumlahBelumAbsen) {
    const jumlahSudahAbsen = jumlahTotal - jumlahBelumAbsen;
    const ctx = document.getElementById('chartAbsensi').getContext('2d');
    if (chartAbsensi) chartAbsensi.destroy();

    let labels, data, backgroundColor;
    if (jumlahBelumAbsen === 0) {
        labels = ['Sudah Absen']; data = [jumlahSudahAbsen]; backgroundColor = ['#25A757'];
    } else if (jumlahSudahAbsen === 0) {
        labels = ['Belum Absen']; data = [jumlahBelumAbsen]; backgroundColor = ['#bd0000'];
    } else {
        labels = ['Sudah Absen', 'Belum Absen']; data = [jumlahSudahAbsen, jumlahBelumAbsen]; backgroundColor = ['#25A757', '#bd0000'];
    }

    chartAbsensi = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, borderWidth: 0, backgroundColor }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (c) => ` ${c.raw} siswa (${((c.raw/jumlahTotal)*100).toFixed(1)}%)` } }
            }
        }
    });
}

// ===============================================
// 12. REKAP ABSENSI LOGIC
// ===============================================
function ubahFilter() {
    const filter = document.getElementById('filter').value;
    ['boxTanggal', 'boxBulan', 'boxTahun'].forEach(id => document.getElementById(id).classList.add('hidden'));

    if (filter === 'harian' || filter === 'mingguan') document.getElementById('boxTanggal').classList.remove('hidden');
    else if (filter === 'bulanan') { document.getElementById('boxBulan').classList.remove('hidden'); document.getElementById('boxTahun').classList.remove('hidden'); }
    else if (filter === 'tahunan') document.getElementById('boxTahun').classList.remove('hidden');
}

async function loadAbsensi() {
    const kelas = document.getElementById('kelas').value;
    const filter = document.getElementById('filter').value;
    let params = {};

    if (filter === 'harian' || filter === 'mingguan') {
        params.tanggal = document.getElementById('tanggal').value;
        if (!params.tanggal) return showToast('Pilih tanggal!', 'warning');
    }
    if (filter === 'bulanan') {
        params.bulan = document.getElementById('bulan').value;
        params.tahun = document.getElementById('tahun').value;
    }
    if (filter === 'tahunan') {
        params.tahun = document.getElementById('tahun').value;
    }

    const container = document.getElementById('hasilAbsensi');
    container.innerHTML = '<div class="text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-green-800"></i><p class="mt-2 text-sm text-gray-500">Mencari data rekap...</p></div>';

    try {
        const res = await fetchAPI('getDataAbsensi', { token: TOKEN, kelas, filter, params });
        tampilkanAbsensi(res);
    } catch (err) {
        container.innerHTML = `<div class="p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg text-sm text-center">Error: ${err.message}</div>`;
    }
}

function tampilkanAbsensi(res) {
    const container = document.getElementById('hasilAbsensi');
    if (!res || !res.success) {
        container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-lg text-sm">${res?.message || 'Data tidak ditemukan'}</div>`;
        return;
    }

    const namaFilter = { harian: 'Harian', mingguan: 'Mingguan', bulanan: 'Bulanan', tahunan: 'Tahunan' };
    let html = `
    <div class="mb-4 rounded-xl border border-green-100 bg-green-50/50 shadow-sm p-4 sm:p-5">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div><p class="text-xs text-green-700 font-semibold mb-1">Kelas</p><p class="text-sm font-bold text-green-900">${res.kelas ? 'Kelas ' + res.kelas : 'Semua Kelas'}</p></div>
            <div><p class="text-xs text-green-700 font-semibold mb-1">Filter</p><p class="text-sm font-bold text-green-900">${namaFilter[res.filter] || res.filter}</p></div>
            <div><p class="text-xs text-green-700 font-semibold mb-1">Periode</p><p class="text-sm font-bold text-green-900 leading-tight">${res.mulai} <br/>s/d ${res.selesai}</p></div>
            <div><p class="text-xs text-green-700 font-semibold mb-1">Total Data</p><p><span class="inline-flex items-center rounded-md bg-green-800 px-2.5 py-1 text-xs font-bold text-white shadow-sm">${res.total} Baris</span></p></div>
        </div>
    </div>
    
    <div class="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
        <table id="tableAbsensi" class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-3 py-3 text-left font-semibold text-gray-700">No</th>
                    <th class="px-3 py-3 text-left font-semibold text-gray-700">Tanggal</th>
                    <th class="px-3 py-3 text-left font-semibold text-gray-700">Jam</th>
                    <th class="px-3 py-3 text-left font-semibold text-gray-700">ID Siswa</th>
                    <th class="px-3 py-3 text-left font-semibold text-gray-700">Nama</th>
                    <th class="px-3 py-3 text-center font-semibold text-gray-700">Kelas</th>
                    <th class="px-3 py-3 text-center font-semibold text-gray-700">Status</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">`;

    if (!res.data || res.data.length === 0) {
        html += `<tr><td colspan="7" class="text-center py-8 text-gray-500">Tidak ada rekam absensi pada periode ini.</td></tr>`;
    } else {
        res.data.forEach((r, i) => {
            let badge = "bg-gray-100 text-gray-800";
            if(r.status === 'Hadir') badge = "bg-green-100 text-green-800";
            if(r.status === 'Terlambat') badge = "bg-orange-100 text-orange-800";
            if(r.status === 'Sakit') badge = "bg-yellow-100 text-yellow-800";
            if(r.status === 'Izin') badge = "bg-blue-100 text-blue-800";
            if(r.status === 'Alfa') badge = "bg-red-100 text-red-800";

            html += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-3 py-2 text-gray-600">${i + 1}</td>
                <td class="px-3 py-2 font-medium text-gray-800">${escapeHTML(r.tanggal)}</td>
                <td class="px-3 py-2 text-gray-600">${escapeHTML(r.jam)}</td>
                <td class="px-3 py-2 font-mono text-gray-500">${escapeHTML(r.id)}</td>
                <td class="px-3 py-2 font-semibold text-gray-900">${escapeHTML(r.nama)}</td>
                <td class="px-3 py-2 text-center text-gray-700">${escapeHTML(r.kelas)}</td>
                <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded-md text-xs font-bold ${badge}">${escapeHTML(r.status)}</span></td>
            </tr>`;
        });
    }
    html += `</tbody></table></div>`;
    container.innerHTML = html;

    if ($.fn && $.fn.DataTable && res.data && res.data.length > 0) {
        $('#tableAbsensi').DataTable({
            pageLength: 25,
            responsive: true,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'Semua']],
            order: [[0, 'asc']],
            language: {
                search: 'Cari Data:',
                lengthMenu: 'Tampil _MENU_ data',
                info: 'Menampilkan _START_ s/d _END_ dari _TOTAL_ data',
                infoEmpty: '0 data',
                zeroRecords: 'Pencarian tidak ditemukan',
                paginate: { next: 'Next', previous: 'Prev' }
            }
        });
    }
}

function escapeHTML(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
