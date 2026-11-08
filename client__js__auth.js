import { $, $$, api, setSession, session, toast, modal, show } from './ui.js';
const strength = p => { let s = 0; if (p.length >= 6) s++; if (p.length >= 10) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s; };
export function initAuth(onLogin) {
  const tab = n => { $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === n)); $('#form-login').classList.toggle('hidden', n !== 'login'); $('#form-register').classList.toggle('hidden', n !== 'register'); };
  $$('.tab').forEach(t => t.onclick = () => tab(t.dataset.tab)); $$('[data-tab-link]').forEach(a => a.onclick = e => { e.preventDefault(); tab(a.dataset.tabLink); });
  $$('[data-eye]').forEach(b => b.onclick = () => { const i = document.getElementById(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#r-pass').oninput = e => { const s = strength(e.target.value), el = $('#r-strength'); el.style.width = s * 20 + '%'; el.style.background = ['#e5484d', '#e5484d', '#e0a030', '#e0a030', '#46c37b', '#46c37b'][s]; };
  $('#form-login').onsubmit = async e => { e.preventDefault(); try { const r = await api('/api/auth/login', { login: $('#l-login').value.trim(), password: $('#l-pass').value }); setSession(r.token, r.user); toast(`Привет, ${r.user.login}!`, 'success'); onLogin(); } catch (err) { toast(err.message, 'error'); } };
  $('#form-register').onsubmit = async e => {
    e.preventDefault(); const login = $('#r-login').value.trim(), p = $('#r-pass').value;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(login)) return toast('Логин: 3–16 символов, буквы, цифры и _', 'error'); if (p.length < 6) return toast('Пароль — минимум 6 символов', 'error'); if (p !== $('#r-pass2').value) return toast('Пароли не совпадают', 'error');
    try { const r = await api('/api/auth/register', { login, password: p }); setSession(r.token, r.user); await modal({ title: '⚠️ Внимание!', html: '<p>В игре нет восстановления пароля. Если забудешь пароль — потеряешь аккаунт навсегда. Запиши логин и пароль.</p>', buttons: [{ label: 'Понятно', primary: true, value: true }] }); onLogin(); } catch (err) { toast(err.message, 'error'); }
  };
}
export async function changePasswordDialog() {
  const r = await modal({ title: 'Смена пароля', html: '<div class="form"><input id="cp-o" type="password" placeholder="Старый пароль"><input id="cp-n" type="password" placeholder="Новый пароль (мин. 6)"><input id="cp-n2" type="password" placeholder="Повторите новый пароль"></div>', buttons: [{ label: 'Отмена', value: null }, { label: 'Сменить', primary: true, value: b => ({ o: $('#cp-o', b).value, n: $('#cp-n', b).value, n2: $('#cp-n2', b).value }) }] });
  if (!r) return; if (r.n !== r.n2) return toast('Новые пароли не совпадают', 'error');
  try { await api('/api/auth/change-password', { oldPassword: r.o, newPassword: r.n }); toast('Пароль изменён', 'success'); } catch (e) { toast(e.message, 'error'); }
}
export function logout() { setSession(null, null); show('auth'); }
