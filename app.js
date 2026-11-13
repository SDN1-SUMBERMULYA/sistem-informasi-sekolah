// Ganti dengan URL Web App dari Google Apps Script Anda (Berakhiran /exec)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyQHq9Gw2aUajk2s9yhEQ8P7tlUAFxP7MmT4gIWkRNEJUC17t67Ot3aqVyHaY5J_6Zeeg/exec';

// State global
let html5QrcodeScanner = null;
let isScanning = false;
let isProcessingScan = false; // Mencegah scan beruntun cepat

// ================= UTILITAS =================

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  
  toast.classList.remove('hidden');
  
  if (type === 'success') {
    toastMsg.className = 'px-6 py-3 rounded-lg shadow-lg text-white font-semibold bg-green-600';
  } else if (type === 'error') {
    toastMsg.className = 'px-6 py-3 rounded-lg shadow-lg text-white font-semibold bg-red-600';
  } else {
    toastMsg.className = 'px-6 py-3 rounded-lg shadow-lg text-white font-semibold bg-yellow-500';
  }
  
  toastMsg.innerText = message;
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Wrapper untuk fetch API
async function apiCall(action, data = {}) {
  const payload = {
    action: action,
    data: data
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      // text/plain wajib digunakan agar Apps Script tidak menolak request dari domain luar
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    
    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    return { success: false, message: "Koneksi ke server gagal. Cek internet Anda." };
  }
}

// ================= AUTHENTICATION =================

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  btn.innerText = "Memproses...";
  btn.disabled = true;

  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;

  const res = await apiCall('login', { username: user, password: pass });
  
  if (res.success) {
    localStorage.setItem('qr_token', res.token);
    localStorage.setItem('qr_nama', res.nama);
    localStorage.setItem('qr_role', res.role);
    showToast('Login berhasil!');
    checkAuth();
  } else {
    showToast(res.message, 'error');
  }
  
  btn.innerText = "Masuk";
  btn.disabled = false;
});

async function checkAuth() {
  const token = localStorage.getItem('qr_token');
  const loginPage = document.getElementById('login-page');
  const mainPage = document.getElementById('main-page');

  if (!token) {
    loginPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
    return;
  }

  // Tampilkan dashboard langsung, verifikasi token di background
  loginPage.classList.add('hidden');
  mainPage.classList.remove('hidden');
  document.getElementById('user-info').innerText = `Halo, ${localStorage.getItem('qr_nama')}`;

  const res = await apiCall('checkSession', { token: token });
  if (!res.success) {
    showToast('Sesi habis, silakan login kembali.', 'error');
    logout(false);
  }
}

async function logout(callApi = true) {
  const token = localStorage.getItem('qr_token');
  if (callApi && token) {
    await apiCall('logout', { token: token });
  }
  localStorage.removeItem('qr_token');
  localStorage.removeItem('qr_nama');
  localStorage.removeItem('qr_role');
  
  if (isScanning) toggleScanner(); // Matikan kamera jika menyala
  
  document.getElementById('login-form').reset();
  checkAuth();
}

// ================= QR SCANNER =================

function toggleScanner() {
  const btn = document.getElementById('btn-toggle-cam');
  const container = document.getElementById('reader-container');

  if (isScanning) {
    // Matikan Scanner
    if (html5QrcodeScanner) {
      html5QrcodeScanner.clear();
      html5QrcodeScanner = null;
    }
    container.classList.add('hidden');
    btn.innerText = "Mulai Scan";
    btn.classList.replace('bg-red-600', 'bg-excel-800');
    btn.classList.replace('hover:bg-red-700', 'hover:bg-excel-900');
    isScanning = false;
  } else {
    // Hidupkan Scanner
    container.classList.remove('hidden');
    document.getElementById('scan-result').classList.add('hidden');
    
    html5QrcodeScanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 }
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    
    btn.innerText = "Tutup Scanner";
    btn.classList.replace('bg-excel-800', 'bg-red-600');
    btn.classList.replace('hover:bg-excel-900', 'hover:bg-red-700');
    isScanning = true;
  }
}

async function onScanSuccess(decodedText, decodedResult) {
  if (isProcessingScan) return;
  isProcessingScan = true;

  // Bunyikan beep ringan
  const audio = new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3');
  audio.play().catch(e => {}); 

  showToast('Memproses absensi...', 'success');
  
  // Tunda sedikit scanner agar tidak membaca berulang kali dengan cepat
  if (html5QrcodeScanner) {
      html5QrcodeScanner.pause(true);
  }

  const token = localStorage.getItem('qr_token');
  const res = await apiCall('recordAbsensi', { token: token, qrValue: decodedText });

  const resultBox = document.getElementById('scan-result');
  
  if (res.success) {
    document.getElementById('res-nama').innerText = res.nama;
    document.getElementById('res-kelas').innerText = res.kelas;
    document.getElementById('res-jam').innerText = res.jam;
    
    const statusBadge = document.getElementById('res-status');
    statusBadge.innerText = res.status;
    if (res.status === 'Hadir') {
      statusBadge.className = 'font-bold px-2 py-0.5 rounded text-white mt-1 inline-block bg-green-600';
    } else {
      statusBadge.className = 'font-bold px-2 py-0.5 rounded text-white mt-1 inline-block bg-yellow-500';
    }
    
    resultBox.classList.remove('hidden');
    showToast(`Berhasil: ${res.nama}`, 'success');
  } else {
    showToast(res.message.pesan || res.message, 'error');
  }

  // Resume scanner setelah 2 detik
  setTimeout(() => {
    isProcessingScan = false;
    if (html5QrcodeScanner && isScanning) {
        html5QrcodeScanner.resume();
    }
  }, 2000);
}

function onScanFailure(error) {
  // Abaikan error saat tidak ada QR di frame
}

// Inisialisasi awal
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
