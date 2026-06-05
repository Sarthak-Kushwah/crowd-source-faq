import React, { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAdminAuth } from '../hooks/useAdminAuth';
import adminApi from '../utils/adminApi';

interface ToastState { msg: string; type: 'success' | 'error'; }

function Toast({ toast }: { toast: ToastState }) {
  const c = toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${c}`}>{toast.msg}</motion.div>;
}

export default function AdminSettings() {
  const { user } = useAdminAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const saveProfile = async () => {
    setSaving(true);
    try { const res = await adminApi.patch('/auth/profile', { name, email }); showToast(res.data.message || 'Profile updated'); }
    catch (err) { const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'; showToast(msg, 'error'); }
    finally { setSaving(false); }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) { showToast('Passwords do not match', 'error'); return; }
    if (passwords.next.length < 6) { showToast('Minimum 6 characters', 'error'); return; }
    setSaving(true);
    try { await adminApi.put('/auth/password', { currentPassword: passwords.current, newPassword: passwords.next }); showToast('Password changed'); setPasswords({ current: '', next: '', confirm: '' }); }
    catch (err) { const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Failed'; showToast(msg, 'error'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full px-3 py-2 rounded-md text-sm text-gray-800 bg-white border border-gray-200 outline-none focus:border-gray-400 transition-colors';

  return (
    <div className="space-y-5 max-w-xl">
      {toast && <Toast toast={toast} />}
      <p className="text-sm text-gray-500 -mt-2">Manage your profile</p>

      {/* Profile */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Profile</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-600">{user?.name?.[0]?.toUpperCase() ?? 'A'}</div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 capitalize">{user?.role}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
          <button onClick={saveProfile} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40 transition-colors">{saving ? 'Saving…' : 'Save Profile'}</button>
        </div>
      </div>

      {/* Password */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Change Password</p>
        </div>
        <form onSubmit={changePassword} className="px-5 py-4 space-y-3">
          {[{ label: 'Current Password', key: 'current' as const }, { label: 'New Password', key: 'next' as const }, { label: 'Confirm Password', key: 'confirm' as const }].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
              <input type="password" value={passwords[f.key]} onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))} placeholder="••••••••" className={inputCls} />
            </div>
          ))}
          <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 transition-colors">Change Password</button>
        </form>
      </div>

      {/* Security info */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Security</p>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-gray-700">
          <div className="flex items-center justify-between py-2 border-b border-gray-100"><span>Session</span><span className="text-gray-500">{user?.email}</span></div>
          <div className="flex items-center justify-between py-2"><span>Token expiry</span><span className="text-gray-500">7 days</span></div>
          <p className="text-xs text-gray-400 pt-1">Tokens stored in localStorage. Use HTTPS in production.</p>
        </div>
      </div>
    </div>
  );
}
