// Клиентская часть команд: список для автодополнения. Выполняются на сервере.
export const USER_CMDS = ['/help', '/players', '/ping', '/report ', '/stats', '/coords', '/suicide', '/clear', '/roll', '/msg ', '/r ', '/me '];
export const ADMIN_CMDS = ['/kick ', '/mute ', '/unmute ', '/ban ', '/banip ', '/unban ', '/tp ', '/tphere ', '/give ', '/giveme ', '/heal ', '/kill ', '/god', '/fly', '/noclip', '/adminoff', '/time ', '/weather ', '/spawn ', '/online', '/say ', '/broadcast ', '/reports', '/reportclose ', '/save', '/restart', '/wipe'];
export const suggest = (text, isAdmin) => { const t = text.toLowerCase(); return (isAdmin ? USER_CMDS.concat(ADMIN_CMDS) : USER_CMDS).filter(c => c.startsWith(t) && c.trim() !== t).slice(0, 8); };
