import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Plus, History, Trash2, Wallet, 
  ArrowRightLeft, CreditCard, LayoutDashboard, Calendar as CalendarIcon,
  LogOut, Copy, Key, User, CheckCircle2, Target, Download, Edit2, X, Play,
  PieChart as PieChartIcon, ChevronLeft, ChevronRight
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

// ==========================================
// KONFIGURASI DATABASE CLOUD (FIREBASE)
// ==========================================
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCKUpI8lAWath7bxEspcDcTaHX3hE-LXJM",
  authDomain: "tabungan-bersama-6417c.firebaseapp.com",
  projectId: "tabungan-bersama-6417c",
  storageBucket: "tabungan-bersama-6417c.firebasestorage.app",
  messagingSenderId: "422895359375",
  appId: "1:422895359375:web:a31eb5a678d63116d6e7fa"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Helper untuk format Rupiah
const formatRupiah = (number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(number);
};

// Helper untuk mendapatkan tanggal lokal yang akurat (WIB/Local)
const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

export default function App() {
  // ==========================================
  // STATE AUTENTIKASI & LOBBY
  // ==========================================
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [roomCode, setRoomCode] = useState('');
  const [lobbyName, setLobbyName] = useState('');
  const [lobbyCodeInput, setLobbyCodeInput] = useState('');
  const [lobbyMode, setLobbyMode] = useState('join');
  const [copiedCode, setCopiedCode] = useState(false);

  // Fitur Riwayat Grup (Disimpan di HP Lokal)
  const [recentRooms, setRecentRooms] = useState(() => {
    try {
      const saved = localStorage.getItem('recentTabunganRooms');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // ==========================================
  // STATE APLIKASI UTAMA
  // ==========================================
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [groupTarget, setGroupTarget] = useState(0);
  
  // State Form Transaksi
  const [txMemberId, setTxMemberId] = useState('');
  const [txType, setTxType] = useState('deposit');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txDate, setTxDate] = useState(getLocalDateString());

  // State Kalender
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());

  // State Target Editor
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTargetAmount, setTempTargetAmount] = useState('');

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#eab308'];

  // ==========================================
  // EFEK DATABASE
  // ==========================================
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Gagal Autentikasi:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !roomCode) return;

    // Listener Anggota
    const membersRef = collection(db, 'artifacts', appId, 'public', 'data', `members_${roomCode}`);
    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      const membersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMembers(membersData);
      if (membersData.some(m => m.id === user.uid)) {
          setTxMemberId(user.uid);
      }
    });

    // Listener Transaksi
    const txRef = collection(db, 'artifacts', appId, 'public', 'data', `tx_${roomCode}`);
    const unsubTx = onSnapshot(txRef, (snapshot) => {
      const txData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      txData.sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(txData);
    });

    // Listener Target Tabungan
    const settingsRef = collection(db, 'artifacts', appId, 'public', 'data', `settings_${roomCode}`);
    const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
      const infoDoc = snapshot.docs.find(d => d.id === 'info');
      if (infoDoc) setGroupTarget(infoDoc.data().target || 0);
    });

    return () => { 
      unsubMembers(); 
      unsubTx(); 
      unsubSettings();
    };
  }, [user, roomCode]);


  // ==========================================
  // FUNGSI & HANDLER
  // ==========================================

  const saveRecentRoomLocal = (code, name) => {
    const newRoom = { code, name, lastAccessed: Date.now() };
    const filtered = recentRooms.filter(r => r.code !== code);
    const updated = [newRoom, ...filtered].slice(0, 3); // Simpan maks 3
    setRecentRooms(updated);
    localStorage.setItem('recentTabunganRooms', JSON.stringify(updated));
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!lobbyName.trim()) return;
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `members_${newCode}`, user.uid), { 
      name: lobbyName.trim(), joinedAt: new Date().toISOString() 
    });
    
    setRoomCode(newCode);
    saveRecentRoomLocal(newCode, lobbyName.trim());
  };

  const handleJoinRoom = async (e, directCode = null, directName = null) => {
    if (e) e.preventDefault();
    const nameToUse = directName || lobbyName.trim();
    const codeToUse = (directCode || lobbyCodeInput.trim()).toUpperCase();
    
    if (!nameToUse || !codeToUse) return;
    
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `members_${codeToUse}`, user.uid), { 
      name: nameToUse, joinedAt: new Date().toISOString() 
    });
    
    setRoomCode(codeToUse);
    saveRecentRoomLocal(codeToUse, nameToUse);
  };

  const handleLeaveRoom = () => {
    setRoomCode('');
    setTransactions([]);
    setMembers([]);
    setActiveTab('dashboard');
  };

  const copyRoomCode = () => {
    // Menggunakan execCommand agar mendukung environment iframe/preview
    const textArea = document.createElement("textarea");
    textArea.value = roomCode;
    textArea.style.position = "absolute";
    textArea.style.left = "-999999px";
    document.body.prepend(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error("Gagal menyalin kode:", err);
    } finally {
      textArea.remove();
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!txMemberId || !txAmount || isNaN(txAmount) || Number(txAmount) <= 0) return;

    try {
      const txRef = collection(db, 'artifacts', appId, 'public', 'data', `tx_${roomCode}`);
      await addDoc(txRef, {
        memberId: txMemberId,
        type: txType,
        amount: Number(txAmount),
        note: txNote,
        date: new Date(`${txDate}T12:00:00`).toISOString(), // Jam 12 siang lokal
        createdBy: user.uid
      });
      setTxAmount('');
      setTxNote('');
    } catch (error) {
      console.error("Gagal menambah transaksi:", error);
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `tx_${roomCode}`, id));
    } catch (error) {
      console.error("Gagal menghapus:", error);
    }
  };

  const handleSetTarget = async (e) => {
    e.preventDefault();
    if (isNaN(tempTargetAmount) || Number(tempTargetAmount) < 0) return;
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `settings_${roomCode}`, 'info'), { 
        target: Number(tempTargetAmount) 
      });
      setIsEditingTarget(false);
      setTempTargetAmount('');
    } catch (error) {
      console.error("Gagal update target:", error);
    }
  };

  const exportToCSV = () => {
    if (transactions.length === 0) return;
    
    const headers = ["Tanggal", "Anggota", "Jenis", "Jumlah (Rp)", "Keterangan"];
    const rows = transactions.map(tx => {
      const member = members.find(m => m.id === tx.memberId);
      const dateStr = getLocalDateString(new Date(tx.date));
      const typeStr = tx.type === 'deposit' ? 'Masuk' : 'Keluar';
      return `${dateStr},${member ? member.name : 'Anggota Keluar'},${typeStr},${tx.amount},"${tx.note || ''}"`;
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Tabungan_${roomCode}_${getLocalDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Kalkulasi Saldo
  const memberBalances = useMemo(() => {
    const balances = {};
    members.forEach(m => balances[m.id] = 0);
    transactions.forEach(tx => {
      if (balances[tx.memberId] !== undefined) {
        balances[tx.memberId] += (tx.type === 'deposit' ? tx.amount : -tx.amount);
      }
    });
    return balances;
  }, [transactions, members]);

  const totalBalance = useMemo(() => {
    return Object.values(memberBalances).reduce((acc, curr) => acc + curr, 0);
  }, [memberBalances]);

  const chartData = useMemo(() => {
    return members
      .map(m => ({ name: m.name, value: memberBalances[m.id] > 0 ? memberBalances[m.id] : 0 }))
      .filter(d => d.value > 0);
  }, [members, memberBalances]);

  // Logika Kalender
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const transactionsOnSelectedDate = useMemo(() => {
    return transactions.filter(tx => {
      const txDateLocal = getLocalDateString(new Date(tx.date));
      return txDateLocal === selectedDate;
    });
  }, [transactions, selectedDate]);


  // ==========================================
  // RENDER TAMPILAN
  // ==========================================

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-500 font-medium">Menghubungkan ke Cloud...</p>
      </div>
    );
  }

  // TAMPILAN LOBBY
  if (!roomCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
              <Wallet size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800">Tabungan Bersama</h1>
            <p className="text-sm text-slate-500 mt-2">Patungan aman, tersinkronisasi antar HP!</p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            <button 
              onClick={() => setLobbyMode('join')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${lobbyMode === 'join' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              Gabung Grup
            </button>
            <button 
              onClick={() => setLobbyMode('create')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${lobbyMode === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              Buat Grup Baru
            </button>
          </div>

          <form onSubmit={lobbyMode === 'join' ? handleJoinRoom : handleCreateRoom} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                <User size={16} className="text-slate-400"/> Namamu
              </label>
              <input 
                type="text" 
                placeholder="Contoh: Budi"
                className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none transition font-medium"
                value={lobbyName}
                onChange={(e) => setLobbyName(e.target.value)}
                required
              />
            </div>

            {lobbyMode === 'join' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-2">
                  <Key size={16} className="text-slate-400"/> Kode Grup
                </label>
                <input 
                  type="text" 
                  placeholder="Contoh: ABCD12"
                  className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none transition font-bold uppercase tracking-widest text-indigo-600"
                  value={lobbyCodeInput}
                  onChange={(e) => setLobbyCodeInput(e.target.value.toUpperCase())}
                  required
                />
              </div>
            )}

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-indigo-200 mt-4">
              {lobbyMode === 'join' ? 'Masuk ke Grup' : 'Buat & Masuk Grup'}
            </button>
          </form>

          {/* Fitur Riwayat Grup */}
          {recentRooms.length > 0 && (
            <div className="pt-6 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Grup Terakhir</p>
              <div className="space-y-2">
                {recentRooms.map((room) => (
                  <button
                    key={room.code}
                    onClick={() => handleJoinRoom(null, room.code, room.name)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-100 transition group text-left"
                  >
                    <div>
                      <div className="font-bold text-slate-700 group-hover:text-indigo-700">{room.code}</div>
                      <div className="text-xs text-slate-500">Sebagai: {room.name}</div>
                    </div>
                    <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition">
                      <Play size={14} className="fill-current"/>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // TAMPILAN APLIKASI UTAMA
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 md:pb-8">
      {/* Header Aplikasi */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 md:p-6 shadow-md rounded-b-3xl mb-6 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 md:p-3 rounded-xl backdrop-blur-sm">
              <Wallet size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Tabungan Bersama</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-medium bg-indigo-900/40 px-2 py-0.5 rounded-md text-blue-100 border border-indigo-400/30">
                  Grup: <span className="font-bold tracking-wider">{roomCode}</span>
                </span>
                <button onClick={copyRoomCode} className="text-xs flex items-center gap-1 text-blue-100 hover:text-white transition">
                  {copiedCode ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                  {copiedCode ? 'Disalin' : 'Salin'}
                </button>
              </div>
            </div>
          </div>
          
          <button onClick={handleLeaveRoom} className="self-start md:self-auto flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl transition text-sm font-medium border border-white/20">
            <LogOut size={16} /> Keluar Grup
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6">
        
        {/* TAMPILAN DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center relative overflow-hidden">
              <p className="text-sm font-medium text-slate-500 mb-1 relative z-10">Total Tabungan Grup Saat Ini</p>
              <h2 className="text-4xl md:text-5xl font-extrabold text-slate-800 tracking-tight relative z-10 mb-6">
                {formatRupiah(totalBalance)}
              </h2>

              {/* Fitur Target Tabungan */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative z-10 text-left">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    <Target size={16} className="text-blue-500"/> Target Tabungan
                  </h3>
                  <button onClick={() => setIsEditingTarget(!isEditingTarget)} className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline">
                    {isEditingTarget ? <X size={12}/> : <Edit2 size={12}/>}
                    {isEditingTarget ? 'Batal' : (groupTarget > 0 ? 'Ubah' : 'Set Target')}
                  </button>
                </div>

                {isEditingTarget ? (
                  <form onSubmit={handleSetTarget} className="flex gap-2 mt-2">
                    <input 
                      type="number" 
                      placeholder="Masukkan nominal target..."
                      className="flex-1 bg-white border-slate-200 rounded-lg p-2 text-sm border outline-none"
                      value={tempTargetAmount}
                      onChange={(e) => setTempTargetAmount(e.target.value)}
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Simpan</button>
                  </form>
                ) : groupTarget > 0 ? (
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
                      <span>{formatRupiah(totalBalance)}</span>
                      <span>Dari {formatRupiah(groupTarget)}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.min((totalBalance / groupTarget) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-right mt-1.5 font-bold text-indigo-600">
                      {Math.min((totalBalance / groupTarget) * 100, 100).toFixed(1)}% Tercapai
                    </p>
                  </div>
                ) : (
                   <p className="text-xs text-slate-400">Belum ada target yang diatur untuk grup ini.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-700">
                  <PieChartIcon size={20} className="text-indigo-500" /> Proporsi Kepemilikan
                </h3>
                {chartData.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => formatRupiah(value)} />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Belum ada data tabungan positif.</div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-700">
                  <Users size={20} className="text-blue-500" /> Rincian Saldo
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {members.map((member, idx) => (
                    <div key={member.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between transition hover:bg-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-700">
                          {member.name} {member.id === user.uid && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded ml-2">Kamu</span>}
                        </span>
                      </div>
                      <span className={`font-bold ${memberBalances[member.id] >= 0 ? 'text-slate-800' : 'text-red-500'}`}>
                        {formatRupiah(memberBalances[member.id])}
                      </span>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Belum ada anggota yang bergabung.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAMPILAN TRANSAKSI */}
        {activeTab === 'transactions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-5 text-slate-700">
                  <ArrowRightLeft size={20} className="text-indigo-500" /> Catat Transaksi
                </h2>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Tanggal</label>
                    <input type="date" className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none transition" value={txDate} onChange={(e) => setTxDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Uang Siapa?</label>
                    <select className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none transition" value={txMemberId} onChange={(e) => setTxMemberId(e.target.value)} required>
                      <option value="">-- Pilih Anggota --</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name} {m.id === user.uid ? '(Kamu)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex-1 cursor-pointer">
                      <input type="radio" name="txType" value="deposit" className="peer sr-only" checked={txType === 'deposit'} onChange={() => setTxType('deposit')} />
                      <div className="p-3 text-center border-2 border-transparent rounded-xl bg-slate-50 text-slate-600 peer-checked:bg-green-50 peer-checked:border-green-500 peer-checked:text-green-700 font-medium transition">Nabung</div>
                    </label>
                    <label className="flex-1 cursor-pointer">
                      <input type="radio" name="txType" value="withdraw" className="peer sr-only" checked={txType === 'withdraw'} onChange={() => setTxType('withdraw')} />
                      <div className="p-3 text-center border-2 border-transparent rounded-xl bg-slate-50 text-slate-600 peer-checked:bg-red-50 peer-checked:border-red-500 peer-checked:text-red-700 font-medium transition">Tarik</div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Jumlah (Rp)</label>
                    <input type="number" placeholder="Contoh: 50000" className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none transition" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} required min="1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Keterangan (Opsional)</label>
                    <input type="text" placeholder="Catatan..." className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 border focus:ring-2 focus:ring-indigo-500 outline-none transition" value={txNote} onChange={(e) => setTxNote(e.target.value)} />
                  </div>
                  <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition shadow-md shadow-indigo-200 flex justify-center items-center gap-2 mt-2">
                    <Plus size={20} /> Simpan ke Cloud
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 h-full flex flex-col">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
                    <History size={20} className="text-orange-500" /> Riwayat Keseluruhan
                  </h2>
                  <button 
                    onClick={exportToCSV}
                    disabled={transactions.length === 0}
                    className="flex items-center gap-1.5 text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 transition disabled:opacity-50"
                  >
                    <Download size={16} /> Export CSV
                  </button>
                </div>
                
                {transactions.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-400">
                    <CreditCard size={56} className="mx-auto mb-4 opacity-50" />
                    <p>Belum ada riwayat transaksi dicatat di grup ini.</p>
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto pr-2 max-h-[600px]">
                    {transactions.map(tx => {
                      const member = members.find(m => m.id === tx.memberId);
                      const isDeposit = tx.type === 'deposit';
                      return (
                        <div key={tx.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition group">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shadow-sm ${isDeposit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                              {isDeposit ? '+' : '-'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm md:text-base">{member ? member.name : 'Anggota Keluar'}</p>
                              <div className="flex flex-col md:flex-row md:items-center text-xs text-slate-500 gap-1 md:gap-2">
                                <span>{new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                {tx.note && <><span className="hidden md:inline">•</span><span>{tx.note}</span></>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${isDeposit ? 'text-green-600' : 'text-red-600'}`}>{formatRupiah(tx.amount)}</span>
                            <button onClick={() => handleDeleteTransaction(tx.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition md:opacity-0 md:group-hover:opacity-100">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAMPILAN KALENDER */}
        {activeTab === 'calendar' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <CalendarIcon size={24} className="text-blue-500" /> Jadwal Transaksi
                </h2>
                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 hover:bg-white rounded-xl transition shadow-sm"><ChevronLeft size={20} /></button>
                  <span className="font-bold text-slate-700 min-w-[100px] text-center">{currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 hover:bg-white rounded-xl transition shadow-sm"><ChevronRight size={20} /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => (
                  <div key={d} className="text-center font-semibold text-slate-400 text-xs md:text-sm py-2">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {calendarDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="p-2 md:p-4 rounded-2xl" />;
                  const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = selectedDate === cellDateStr;
                  const isToday = getLocalDateString() === cellDateStr;
                  const txInDay = transactions.filter(tx => getLocalDateString(new Date(tx.date)) === cellDateStr);
                  const hasDeposit = txInDay.some(tx => tx.type === 'deposit');
                  const hasWithdraw = txInDay.some(tx => tx.type === 'withdraw');

                  return (
                    <button
                      key={day} onClick={() => setSelectedDate(cellDateStr)}
                      className={`relative flex flex-col items-center justify-center p-2 md:p-4 min-h-[60px] md:min-h-[80px] rounded-2xl transition border ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : isToday ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="text-sm md:text-lg">{day}</span>
                      {(hasDeposit || hasWithdraw) && (
                        <div className="absolute bottom-1.5 md:bottom-2 flex gap-1">
                          {hasDeposit && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                          {hasWithdraw && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-red-200' : 'bg-red-500'}`} />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-700 mb-4 border-b border-slate-100 pb-4 flex justify-between items-center">
                <span>Transaksi: <span className="text-indigo-600">{new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span></span>
                <span className="text-sm bg-slate-100 px-3 py-1 rounded-full text-slate-500">{transactionsOnSelectedDate.length} Catatan</span>
              </h3>
              {transactionsOnSelectedDate.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Tidak ada transaksi grup di tanggal ini.</div>
              ) : (
                <div className="space-y-3">
                  {transactionsOnSelectedDate.map(tx => {
                    const member = members.find(m => m.id === tx.memberId);
                    const isDeposit = tx.type === 'deposit';
                    return (
                      <div key={tx.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isDeposit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                            {isDeposit ? '+' : '-'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{member ? member.name : 'Anggota'}</p>
                            {tx.note && <p className="text-xs text-slate-500">{tx.note}</p>}
                          </div>
                        </div>
                        <span className={`font-bold ${isDeposit ? 'text-green-600' : 'text-red-600'}`}>{formatRupiah(tx.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex justify-around items-center z-50 pb-safe">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center p-2 rounded-xl transition ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
          <div className={`${activeTab === 'dashboard' ? 'bg-indigo-100' : ''} p-1.5 rounded-full mb-1`}><LayoutDashboard size={22} /></div>
          <span className="text-[10px] font-medium">Dashboard</span>
        </button>
        <button onClick={() => setActiveTab('transactions')} className={`flex flex-col items-center p-2 rounded-xl transition ${activeTab === 'transactions' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
          <div className={`${activeTab === 'transactions' ? 'bg-indigo-100' : ''} p-1.5 rounded-full mb-1`}><ArrowRightLeft size={22} /></div>
          <span className="text-[10px] font-medium">Transaksi</span>
        </button>
        <button onClick={() => setActiveTab('calendar')} className={`flex flex-col items-center p-2 rounded-xl transition ${activeTab === 'calendar' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
          <div className={`${activeTab === 'calendar' ? 'bg-indigo-100' : ''} p-1.5 rounded-full mb-1`}><CalendarIcon size={22} /></div>
          <span className="text-[10px] font-medium">Kalender</span>
        </button>
      </div>

      {/* FLOATING MENU */}
      <div className="hidden md:flex fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-full p-2 gap-2 z-50">
        <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-6 py-3 rounded-full transition font-semibold text-sm ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
          <LayoutDashboard size={18} /> Dashboard
        </button>
        <button onClick={() => setActiveTab('transactions')} className={`flex items-center gap-2 px-6 py-3 rounded-full transition font-semibold text-sm ${activeTab === 'transactions' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
          <ArrowRightLeft size={18} /> Transaksi
        </button>
        <button onClick={() => setActiveTab('calendar')} className={`flex items-center gap-2 px-6 py-3 rounded-full transition font-semibold text-sm ${activeTab === 'calendar' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
          <CalendarIcon size={18} /> Kalender
        </button>
      </div>
    </div>
  );
}
