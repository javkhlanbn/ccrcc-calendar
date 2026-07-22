import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Search, Send, Paperclip, X, Download, ArrowLeft } from 'lucide-react';
import { format, parseISO, isValid, isSameDay } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { UserProfile, DirectMessage, MessageThreadSummary, EventAttachment } from '../types';
import { cn } from '../lib/utils';

export const MessagesPage: React.FC = () => {
  const { profile, language, refreshUnreadMessages } = useAppContext();
  const isMN = language === 'MN';
  const t = (mn: string, en: string) => (isMN ? mn : en);
  const myId = profile?.uid || '';

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<EventAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [presence, setPresence] = useState<Record<string, { online: boolean; lastSeen?: string }>>({});
  // Зураг томоор харах (lightbox)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const isOnline = (uid: string) => !!presence[uid]?.online;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string>(''); // нээлттэй ярианы сүүлийн зурвасын цаг (since polling)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userById = useMemo(() => {
    const map: Record<string, UserProfile> = {};
    users.forEach(u => { map[u.uid] = u; });
    return map;
  }, [users]);

  const threadByUser = useMemo(() => {
    const map: Record<string, MessageThreadSummary> = {};
    threads.forEach(th => { map[th.otherUserId] = th; });
    return map;
  }, [threads]);

  // Хэрэглэгчид (өөрөөсөө бусад) — яриатай нь эхэнд, дараа нь цагаан толгойгоор
  const conversationList = useMemo(() => {
    const others = users.filter(u => u.uid !== myId && u.status === 'approved');
    const q = search.trim().toLowerCase();
    const filtered = q ? others.filter(u => u.displayName.toLowerCase().includes(q)) : others;
    return filtered.sort((a, b) => {
      const ta = threadByUser[a.uid]?.lastAt || '';
      const tb = threadByUser[b.uid]?.lastAt || '';
      if (ta && tb) return tb.localeCompare(ta);
      if (ta) return -1;
      if (tb) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [users, myId, search, threadByUser]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers((data as UserProfile[]).filter(u => u.status === 'approved'));
    } catch (error) {
      console.error('Users fetch error:', error);
    }
  };

  const fetchThreads = async () => {
    if (!myId) return;
    try {
      const res = await fetch(`/api/messages/threads?userId=${encodeURIComponent(myId)}`);
      if (!res.ok) return;
      setThreads((await res.json()) as MessageThreadSummary[]);
    } catch {
      /* ignore */
    }
  };

  const markRead = async (otherId: string) => {
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: myId, otherId }),
      });
      await Promise.all([fetchThreads(), refreshUnreadMessages()]);
    } catch {
      /* ignore */
    }
  };

  const openConversation = async (otherId: string) => {
    setSelectedId(otherId);
    setMessages([]);
    lastAtRef.current = '';
    try {
      const res = await fetch(`/api/messages/thread?userId=${encodeURIComponent(myId)}&otherId=${encodeURIComponent(otherId)}`);
      if (res.ok) {
        const data = (await res.json()) as DirectMessage[];
        setMessages(data);
        if (data.length > 0) lastAtRef.current = data[data.length - 1].createdAt;
      }
    } catch {
      /* ignore */
    }
    markRead(otherId);
  };

  const fetchPresence = async () => {
    try {
      const res = await fetch('/api/presence');
      if (!res.ok) return;
      const rows = (await res.json()) as { userId: string; online: boolean; lastSeen?: string }[];
      const map: Record<string, { online: boolean; lastSeen?: string }> = {};
      rows.forEach(r => { map[r.userId] = { online: r.online, lastSeen: r.lastSeen }; });
      setPresence(map);
    } catch {
      /* ignore */
    }
  };

  // Анхны ачаалалт
  useEffect(() => {
    fetchUsers();
    fetchThreads();
    fetchPresence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Онлайн төлөвийг тогтмол шинэчлэх
  useEffect(() => {
    if (!myId) return;
    const timer = setInterval(fetchPresence, 15000);
    return () => clearInterval(timer);
  }, [myId]);

  // Ярианы жагсаалтыг тогтмол шинэчлэх
  useEffect(() => {
    if (!myId) return;
    const timer = setInterval(fetchThreads, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Нээлттэй ярианд шинэ зурвас ирсэн эсэхийг шалгаж, нэмнэ
  useEffect(() => {
    if (!selectedId) return;
    const poll = async () => {
      try {
        const since = lastAtRef.current;
        const url = `/api/messages/thread?userId=${encodeURIComponent(myId)}&otherId=${encodeURIComponent(selectedId)}${since ? `&since=${encodeURIComponent(since)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const fresh = (await res.json()) as DirectMessage[];
        if (fresh.length > 0) {
          setMessages(prev => {
            const existing = new Set(prev.map(m => m.id));
            const added = fresh.filter(m => !existing.has(m.id));
            return added.length > 0 ? [...prev, ...added] : prev;
          });
          lastAtRef.current = fresh[fresh.length - 1].createdAt;
          // Надад ирсэн шинэ зурвас байвал уншсан болгоно
          if (fresh.some(m => m.recipientId === myId)) markRead(selectedId);
        }
      } catch {
        /* ignore */
      }
    };
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, myId]);

  // Шинэ зурвас нэмэгдэхэд доош гүйлгэнэ
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(t('Файл унших үед алдаа гарлаа', 'Failed to read file')));
      reader.readAsDataURL(file);
    });

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const uploaded: EventAttachment[] = [];
      for (const file of files) {
        uploaded.push({
          id: Math.random().toString(36).slice(2, 11),
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        });
      }
      setPending(prev => [...prev, ...uploaded]);
    } catch (error: any) {
      alert(error?.message || t('Файл оруулах үед алдаа гарлаа.', 'Failed to attach file.'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!selectedId) return;
    if (!input.trim() && pending.length === 0) return;

    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Math.random().toString(36).slice(2, 11),
          senderId: myId,
          recipientId: selectedId,
          content: input.trim(),
          attachments: pending,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || t('Зурвас илгээх үед алдаа гарлаа.', 'Failed to send message.'));
      }
      const saved = (await res.json()) as DirectMessage;
      setMessages(prev => [...prev, saved]);
      lastAtRef.current = saved.createdAt;
      setInput('');
      setPending([]);
      fetchThreads();
    } catch (error: any) {
      alert(error?.message || t('Зурвас илгээх үед алдаа гарлаа.', 'Failed to send message.'));
    } finally {
      setSending(false);
    }
  };

  const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const fmtTime = (iso: string) => { const d = parseISO(iso); return isValid(d) ? format(d, 'HH:mm') : ''; };
  const fmtDay = (iso: string) => {
    const d = parseISO(iso);
    if (!isValid(d)) return '';
    if (isSameDay(d, new Date())) return t('Өнөөдөр', 'Today');
    return format(d, 'yyyy-MM-dd');
  };

  // Онлайн эсэх / сүүлд идэвхтэй байсан цаг
  const presenceLabel = (uid: string) => {
    const p = presence[uid];
    if (p?.online) return t('Онлайн', 'Online');
    if (!p?.lastSeen) return t('Офлайн', 'Offline');
    const d = parseISO(p.lastSeen);
    if (!isValid(d)) return t('Офлайн', 'Offline');
    const label = isSameDay(d, new Date()) ? format(d, 'HH:mm') : format(d, 'yyyy-MM-dd');
    return t(`Сүүлд идэвхтэй: ${label}`, `Last seen: ${label}`);
  };

  const selectedUser = selectedId ? userById[selectedId] : null;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-3">
          <MessageSquare className="w-7 h-7 text-primary" />
          {t('Зурвас', 'Messages')}
        </h1>
      </header>

      <div className="flex-1 min-h-0 flex rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        {/* Ярианы жагсаалт */}
        <aside className={cn(
          'w-full sm:w-72 md:w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col',
          selectedId ? 'hidden sm:flex' : 'flex'
        )}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Ажилтан хайх...', 'Search employees...')}
                className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversationList.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t('Ажилтан олдсонгүй', 'No employees')}</p>
            ) : (
              conversationList.map(u => {
                const th = threadByUser[u.uid];
                const active = selectedId === u.uid;
                return (
                  <button
                    key={u.uid}
                    onClick={() => openConversation(u.uid)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 text-left border-b border-slate-50 dark:border-slate-800/50 transition-colors',
                      active ? 'bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    )}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                        {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : initials(u.displayName)}
                      </div>
                      {/* Онлайн ногоон цэг */}
                      <span
                        className={cn(
                          'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900',
                          isOnline(u.uid) ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        )}
                        title={presenceLabel(u.uid)}
                      />
                      {th && th.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {th.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('font-bold text-sm truncate', th && th.unreadCount > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300')}>
                          {u.displayName}
                        </p>
                        {th && <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtTime(th.lastAt)}</span>}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {th ? (th.hasAttachment && !th.lastMessage ? `📎 ${t('Хавсралт', 'Attachment')}` : th.lastMessage) : u.department}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Ярианы дэлгэц */}
        <section className={cn('flex-1 min-w-0 flex flex-col', selectedId ? 'flex' : 'hidden sm:flex')}>
          {!selectedUser ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
              <MessageSquare className="w-12 h-12 opacity-20" />
              <p className="text-sm">{t('Яриа сонгож эхлүүлнэ үү', 'Select a conversation to start')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <button onClick={() => setSelectedId(null)} className="sm:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                    {selectedUser.photoURL ? <img src={selectedUser.photoURL} alt="" className="w-full h-full object-cover" /> : initials(selectedUser.displayName)}
                  </div>
                  <span className={cn(
                    'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900',
                    isOnline(selectedUser.uid) ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                  )} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{selectedUser.displayName}</p>
                  <p className={cn('text-[11px] truncate', isOnline(selectedUser.uid) ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400')}>
                    {presenceLabel(selectedUser.uid)}
                  </p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 dark:bg-slate-950/30">
                {messages.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">{t('Одоогоор зурвас алга. Эхний зурвасаа бичээрэй.', 'No messages yet. Say hello!')}</p>
                ) : (
                  messages.map((m, i) => {
                    const mine = m.senderId === myId;
                    const showDay = i === 0 || !isSameDay(parseISO(messages[i - 1].createdAt), parseISO(m.createdAt));
                    return (
                      <React.Fragment key={m.id}>
                        {showDay && (
                          <div className="flex justify-center my-2">
                            <span className="text-[11px] font-semibold text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-full">{fmtDay(m.createdAt)}</span>
                          </div>
                        )}
                        <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                          <div className={cn(
                            'max-w-[78%] rounded-2xl px-3 py-2 text-sm',
                            mine ? 'bg-primary text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                          )}>
                            {(m.attachments || []).length > 0 && (
                              <div className="space-y-2 mb-1">
                                {(m.attachments || []).map(att => (
                                  att.type.startsWith('image/') ? (
                                    <button
                                      key={att.id}
                                      type="button"
                                      onClick={() => setLightbox({ url: att.dataUrl, name: att.name })}
                                      className="block cursor-zoom-in"
                                      title={t('Томоор харах', 'View larger')}
                                    >
                                      <img src={att.dataUrl} alt={att.name} className="rounded-lg max-h-52 w-auto object-cover" />
                                    </button>
                                  ) : (
                                    <a
                                      key={att.id}
                                      href={att.dataUrl}
                                      download={att.name}
                                      className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', mine ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700')}
                                    >
                                      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span className="truncate flex-1">{att.name}</span>
                                      <Download className="w-3.5 h-3.5 flex-shrink-0" />
                                    </a>
                                  )
                                ))}
                              </div>
                            )}
                            {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                            <p className={cn('text-[10px] mt-0.5 text-right', mine ? 'text-white/70' : 'text-slate-400')}>{fmtTime(m.createdAt)}</p>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {/* Хавсаргасан файлын урьдчилсан харагдац */}
              {pending.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {pending.map(att => (
                    <div key={att.id} className="relative flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg pl-2 pr-1 py-1 text-xs">
                      {att.type.startsWith('image/')
                        ? <img src={att.dataUrl} alt="" className="w-8 h-8 rounded object-cover" />
                        : <Paperclip className="w-3.5 h-3.5" />}
                      <span className="max-w-[120px] truncate">{att.name}</span>
                      <button onClick={() => setPending(prev => prev.filter(a => a.id !== att.id))} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Бичих хэсэг */}
              <div className="flex items-end gap-2 p-3 border-t border-slate-200 dark:border-slate-800">
                <input ref={fileInputRef} type="file" multiple onChange={handleAttach} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                  title={t('Файл / зураг хавсаргах', 'Attach file / image')}
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  rows={1}
                  placeholder={t('Зурвас бичих...', 'Type a message...')}
                  className="flex-1 resize-none max-h-32 px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || (!input.trim() && pending.length === 0)}
                  className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary-dark transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Зураг томоор харах (lightbox) */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <a
              href={lightbox.url}
              download={lightbox.name}
              onClick={e => e.stopPropagation()}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
              title={t('Татах', 'Download')}
            >
              <Download className="w-5 h-5" />
            </a>
            <button
              onClick={() => setLightbox(null)}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
              title={t('Хаах', 'Close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
