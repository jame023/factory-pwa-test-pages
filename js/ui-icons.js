// Presentation only: no session, permissions, data requests or event handlers.
export const ICONS = Object.freeze({
 home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5.65"/>',
 groups:'<rect x="9" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="16" width="6" height="6" rx="1.5"/><rect x="16" y="16" width="6" height="6" rx="1.5"/><path d="M12 8v4M5 16v-4h14v4"/>',
 factory:'<path d="M3 21V9l6 3V7l6 3V4h5v17H3Z"/><path d="M7 17h1M12 17h1M17 17h1"/>',
 screen:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M7 8h10M7 12h5"/>',
 truck:'<path d="M2 6h12v12H2ZM14 10h4l4 5v3h-8"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>',
 office:'<rect x="5" y="3" width="14" height="19" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 22v-4h4v4"/>',
 calendar:'<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3m4 0h3m-10 4h3"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 leave:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6m-6 4 2 2 4-4"/>',
 chart:'<path d="M3 3v18h18M7 16l4-5 4 2 5-7"/>',
 box:'<path d="m12 2 10 5-10 6L2 7l10-5ZM2 7v11l10 5 10-5V7M12 13v10M7 4.5l10 6"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
 history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/><path d="M12 7v5l3 2"/>',
 search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 edit:'<path d="m15 4 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1 1-5Z"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 save:'<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-7h10v7"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 refresh:'<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 logout:'<path d="M10 3H4v18h6M9 12h13m-5-5 5 5-5 5"/>',
 login:'<path d="M14 3h6v18h-6M2 12h13m-5-5 5 5-5 5"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/>',
 wifi:'<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01"/>'
});
export function iconMarkup(name) {return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(ICONS[name]||ICONS.home)+'</svg>';}
export function routeIcon(path) {
 if(/registration|register/.test(path))return 'leave';
 if(/audit/.test(path))return 'history';
 if(/groups|select-group/.test(path))return 'groups';
 if(/machines|production/.test(path))return 'factory';
 if(/screen/.test(path))return 'screen';
 if(/delivery/.test(path))return 'truck';
 if(/office/.test(path))return 'office';
 if(/items/.test(path))return 'box';
 if(/profile/.test(path))return 'user';
 if(/employees/.test(path))return 'users';
 if(/attendance|work-session|\/ot/.test(path))return 'clock';
 if(/calendar/.test(path))return 'calendar';
 if(/leave/.test(path))return 'leave';
 if(/reports|executive/.test(path))return 'chart';
 if(/unauthorized|account-blocked/.test(path))return 'lock';
 if(/login/.test(path))return 'login';
 return /admin/.test(path)?'shield':'home';
}

